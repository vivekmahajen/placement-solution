'use strict';

const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const { sendLockExpiryWarning } = require('../services/email');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET / - placement agent: get available queue in coverage area
// ---------------------------------------------------------------------------
router.get('/', authenticate, requireRole('placement_agent'), async (req, res, next) => {
  try {
    const agentResult = await db.query(
      'SELECT id FROM placement_agents WHERE user_id = $1', [req.user.id]
    );
    if (!agentResult.rows.length) {
      return res.status(404).json({ error: 'Placement agent profile not found.' });
    }
    const agentId = agentResult.rows[0].id;

    const result = await db.query(
      `SELECT DISTINCT p.*,
              array_agg(psn.service_code) FILTER (WHERE psn.id IS NOT NULL) as services_needed
       FROM patients p
       JOIN placement_agent_coverage pac ON pac.agent_id = $1
       LEFT JOIN patient_services_needed psn ON psn.patient_id = p.id
       LEFT JOIN queue_assignments qa ON qa.patient_id = p.id
         AND qa.placement_agent_id = $1
         AND qa.status = 'locked'
       WHERE p.queue_status = 'queued'
         AND qa.id IS NULL
         AND (
           (pac.coverage_type = 'zip' AND p.preferred_zip = pac.coverage_value)
           OR (pac.coverage_type = 'city' AND LOWER(p.preferred_city) = LOWER(pac.coverage_value))
           OR (pac.coverage_type = 'county' AND LOWER(p.preferred_county) = LOWER(pac.coverage_value))
         )
       GROUP BY p.id
       ORDER BY p.queued_at ASC`,
      [agentId]
    );

    return res.json({ queue: result.rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /lock/:patientId - placement agent locks a patient
// ---------------------------------------------------------------------------
router.post('/lock/:patientId', authenticate, requireRole('placement_agent'), async (req, res, next) => {
  const { patientId } = req.params;
  const client = await db.getClient();

  try {
    const agentResult = await client.query(
      'SELECT id FROM placement_agents WHERE user_id = $1', [req.user.id]
    );
    if (!agentResult.rows.length) {
      return res.status(404).json({ error: 'Placement agent profile not found.' });
    }
    const agentId = agentResult.rows[0].id;

    await client.query('BEGIN');

    const patientResult = await client.query(
      'SELECT * FROM patients WHERE id = $1 FOR UPDATE',
      [patientId]
    );
    if (!patientResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Patient not found.' });
    }
    const patient = patientResult.rows[0];

    if (patient.queue_status !== 'queued') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `Patient is not available for locking. Current status: ${patient.queue_status}.`,
      });
    }

    const existingLock = await client.query(
      `SELECT id FROM queue_assignments
       WHERE patient_id = $1 AND placement_agent_id = $2`,
      [patientId, agentId]
    );
    if (existingLock.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'You already have an assignment for this patient.' });
    }

    const lockExpiresAt = new Date();
    lockExpiresAt.setDate(lockExpiresAt.getDate() + 4);

    const assignmentResult = await client.query(
      `INSERT INTO queue_assignments
        (patient_id, placement_agent_id, locked_at, lock_expires_at, status)
       VALUES ($1,$2,NOW(),$3,'locked') RETURNING *`,
      [patientId, agentId, lockExpiresAt]
    );

    await client.query(
      `UPDATE patients SET queue_status = 'locked' WHERE id = $1`,
      [patientId]
    );

    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata, ip_address)
       VALUES ($1,'queue_lock','patient',$2,$3,$4)`,
      [req.user.id, patientId,
       JSON.stringify({ agent_id: agentId, lock_expires_at: lockExpiresAt }),
       req.ip]
    );

    await client.query('COMMIT');

    const servicesResult = await db.query(
      'SELECT service_code FROM patient_services_needed WHERE patient_id = $1',
      [patientId]
    );
    const services = servicesResult.rows.map((r) => r.service_code);

    return res.status(201).json({
      assignment: assignmentResult.rows[0],
      patient: { ...patient, services },
      message: 'Patient locked successfully. You have 4 days to place this patient.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// GET /my-assignments - placement agent: get their active locks
// ---------------------------------------------------------------------------
router.get('/my-assignments', authenticate, requireRole('placement_agent'), async (req, res, next) => {
  try {
    const agentResult = await db.query(
      'SELECT id FROM placement_agents WHERE user_id = $1', [req.user.id]
    );
    if (!agentResult.rows.length) return res.json({ assignments: [] });
    const agentId = agentResult.rows[0].id;

    const result = await db.query(
      `SELECT qa.*,
              p.first_name, p.last_name, p.preferred_city, p.preferred_zip,
              p.preferred_county, p.budget_min, p.budget_max, p.room_type_preference,
              p.queue_status,
              array_agg(psn.service_code) FILTER (WHERE psn.id IS NOT NULL) as services_needed
       FROM queue_assignments qa
       JOIN patients p ON p.id = qa.patient_id
       LEFT JOIN patient_services_needed psn ON psn.patient_id = p.id
       WHERE qa.placement_agent_id = $1 AND qa.status = 'locked'
       GROUP BY qa.id, p.id
       ORDER BY qa.lock_expires_at ASC`,
      [agentId]
    );

    return res.json({ assignments: result.rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /matches/:patientId - get care home matches for locked patient
// ---------------------------------------------------------------------------
router.get('/matches/:patientId', authenticate, requireRole('placement_agent', 'admin'), async (req, res, next) => {
  try {
    const { patientId } = req.params;

    if (req.user.role === 'placement_agent') {
      const agentResult = await db.query(
        'SELECT id FROM placement_agents WHERE user_id = $1', [req.user.id]
      );
      if (!agentResult.rows.length) return res.status(403).json({ error: 'Access denied.' });

      const lockCheck = await db.query(
        `SELECT id FROM queue_assignments
         WHERE patient_id = $1 AND placement_agent_id = $2 AND status = 'locked'`,
        [patientId, agentResult.rows[0].id]
      );
      if (!lockCheck.rows.length) {
        return res.status(403).json({ error: 'You do not have an active lock on this patient.' });
      }
    }

    const patientResult = await db.query(
      `SELECT p.*,
              array_agg(DISTINCT psn.service_code) FILTER (WHERE psn.id IS NOT NULL) as services_needed
       FROM patients p
       LEFT JOIN patient_services_needed psn ON psn.patient_id = p.id
       WHERE p.id = $1
       GROUP BY p.id`,
      [patientId]
    );
    if (!patientResult.rows.length) return res.status(404).json({ error: 'Patient not found.' });
    const patient = patientResult.rows[0];

    const conditions = ['ch.is_active = TRUE'];
    const params = [patientId];
    let paramIdx = 2;

    if (patient.preferred_city || patient.preferred_zip || patient.preferred_county) {
      const locParts = [];
      if (patient.preferred_city) {
        locParts.push(`LOWER(ch.city) = LOWER($${paramIdx})`);
        params.push(patient.preferred_city);
        paramIdx++;
      }
      if (patient.preferred_zip) {
        locParts.push(`ch.zip = $${paramIdx}`);
        params.push(patient.preferred_zip);
        paramIdx++;
      }
      if (patient.preferred_county) {
        locParts.push(`LOWER(ch.county) = LOWER($${paramIdx})`);
        params.push(patient.preferred_county);
        paramIdx++;
      }
      conditions.push(`(${locParts.join(' OR ')})`);
    }

    if (patient.budget_max) {
      conditions.push(`(cha.base_price_monthly IS NULL OR cha.base_price_monthly <= $${paramIdx})`);
      params.push(patient.budget_max);
      paramIdx++;
    }

    if (patient.room_type_preference && patient.room_type_preference !== 'either') {
      conditions.push(`(cha.room_type IS NULL OR cha.room_type = $${paramIdx})`);
      params.push(patient.room_type_preference);
      paramIdx++;
    }

    if (patient.sex) {
      conditions.push(`(cha.gender_preference IS NULL OR cha.gender_preference = 'any' OR cha.gender_preference = $${paramIdx})`);
      params.push(patient.sex);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const matchQuery = `
      SELECT
        ch.id as care_home_id,
        ch.facility_name,
        ch.address_line1,
        ch.city,
        ch.state,
        ch.zip,
        ch.phone,
        ch.email,
        cha.room_type,
        cha.gender_preference,
        cha.rooms_available,
        cha.base_price_monthly,
        array_agg(DISTINCT chs.service_code) FILTER (WHERE chs.id IS NOT NULL) as services_offered,
        CASE WHEN cha.rooms_available > 0 THEN 30 ELSE 0 END +
        CASE WHEN cha.gender_preference = 'any' OR cha.gender_preference IS NULL THEN 10 ELSE 0 END
        AS match_score,
        chm.status as proposal_status
      FROM care_homes ch
      LEFT JOIN care_home_availability cha ON cha.care_home_id = ch.id
      LEFT JOIN care_home_services chs ON chs.care_home_id = ch.id
      LEFT JOIN care_home_matches chm ON chm.care_home_id = ch.id AND chm.patient_id = $1
      WHERE ${whereClause}
      GROUP BY ch.id, cha.id, cha.room_type, cha.gender_preference, cha.rooms_available, cha.base_price_monthly, chm.status
      ORDER BY match_score DESC, ch.facility_name ASC
      LIMIT 50
    `;

    const matchResult = await db.query(matchQuery, params);

    return res.json({ matches: matchResult.rows, patient });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /assignment/:patientId - get agent's assignment for a patient
// ---------------------------------------------------------------------------
router.get('/assignment/:patientId', authenticate, requireRole('placement_agent'), async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const agentResult = await db.query(
      'SELECT id FROM placement_agents WHERE user_id = $1', [req.user.id]
    );
    if (!agentResult.rows.length) return res.status(404).json({ error: 'Agent not found.' });
    const agentId = agentResult.rows[0].id;

    const result = await db.query(
      `SELECT * FROM queue_assignments
       WHERE patient_id = $1 AND placement_agent_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [patientId, agentId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'No assignment found for this patient.' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /matches/:patientId/select - mark up to 10 homes as selected
// ---------------------------------------------------------------------------
router.post('/matches/:patientId/select', authenticate, requireRole('placement_agent'), async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const { careHomeIds } = req.body;

    if (!Array.isArray(careHomeIds) || careHomeIds.length === 0) {
      return res.status(400).json({ error: 'careHomeIds must be a non-empty array.' });
    }
    if (careHomeIds.length > 10) {
      return res.status(400).json({ error: 'You can select up to 10 care homes.' });
    }

    const agentResult = await db.query(
      'SELECT id FROM placement_agents WHERE user_id = $1', [req.user.id]
    );
    if (!agentResult.rows.length) return res.status(403).json({ error: 'Access denied.' });
    const agentId = agentResult.rows[0].id;

    const lockCheck = await db.query(
      `SELECT id FROM queue_assignments WHERE patient_id = $1 AND placement_agent_id = $2 AND status = 'locked'`,
      [patientId, agentId]
    );
    if (!lockCheck.rows.length) {
      return res.status(403).json({ error: 'You do not have an active lock on this patient.' });
    }

    const scoreResult = await db.query(
      `SELECT ch.id,
              CASE WHEN cha.rooms_available > 0 THEN 30 ELSE 0 END +
              CASE WHEN cha.gender_preference = 'any' OR cha.gender_preference IS NULL THEN 10 ELSE 0 END
              AS match_score
       FROM care_homes ch
       LEFT JOIN care_home_availability cha ON cha.care_home_id = ch.id
       WHERE ch.id = ANY($1::uuid[])`,
      [careHomeIds]
    );
    const scores = {};
    scoreResult.rows.forEach(r => { scores[r.id] = r.match_score; });

    const insertedIds = [];
    for (const careHomeId of careHomeIds) {
      const score = scores[careHomeId] ?? 0;
      const result = await db.query(
        `INSERT INTO care_home_matches
           (patient_id, placement_agent_id, care_home_id, match_score, status)
         VALUES ($1, $2, $3, $4, 'suggested')
         ON CONFLICT (patient_id, placement_agent_id, care_home_id)
         DO UPDATE SET status = EXCLUDED.status, match_score = EXCLUDED.match_score
         RETURNING id`,
        [patientId, agentId, careHomeId, score]
      );
      insertedIds.push(result.rows[0].id);
    }

    return res.json({ success: true, matchIds: insertedIds });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /matches/:patientId/home/:careHomeId - update single care home workflow status
// ---------------------------------------------------------------------------
router.patch('/matches/:patientId/home/:careHomeId', authenticate, requireRole('placement_agent'), async (req, res, next) => {
  try {
    const { patientId, careHomeId } = req.params;
    const { action, notes } = req.body;

    const validActions = ['contacted', 'agreement_signed', 'visit_scheduled', 'visit_completed', 'shortlist', 'remove_shortlist'];
    if (!action || !validActions.includes(action)) {
      return res.status(400).json({ error: `action must be one of: ${validActions.join(', ')}` });
    }

    const agentResult = await db.query(
      'SELECT id FROM placement_agents WHERE user_id = $1', [req.user.id]
    );
    if (!agentResult.rows.length) return res.status(403).json({ error: 'Access denied.' });
    const agentId = agentResult.rows[0].id;

    const lockCheck = await db.query(
      `SELECT id FROM queue_assignments WHERE patient_id = $1 AND placement_agent_id = $2 AND status = 'locked'`,
      [patientId, agentId]
    );
    if (!lockCheck.rows.length) {
      return res.status(403).json({ error: 'You do not have an active lock on this patient.' });
    }

    let updateQuery;
    let updateParams;

    if (action === 'shortlist') {
      const countResult = await db.query(
        `SELECT COUNT(*) as cnt FROM care_home_matches
         WHERE patient_id = $1 AND placement_agent_id = $2 AND is_shortlisted = TRUE`,
        [patientId, agentId]
      );
      if (parseInt(countResult.rows[0].cnt, 10) >= 3) {
        return res.status(400).json({ error: 'You can only shortlist up to 3 care homes for a patient.' });
      }
      updateQuery = `UPDATE care_home_matches SET is_shortlisted = TRUE
                     ${notes !== undefined ? ', agent_notes = $4' : ''}
                     WHERE patient_id = $1 AND placement_agent_id = $2 AND care_home_id = $3
                     RETURNING *`;
      updateParams = notes !== undefined ? [patientId, agentId, careHomeId, notes] : [patientId, agentId, careHomeId];
    } else if (action === 'remove_shortlist') {
      updateQuery = `UPDATE care_home_matches SET is_shortlisted = FALSE
                     ${notes !== undefined ? ', agent_notes = $4' : ''}
                     WHERE patient_id = $1 AND placement_agent_id = $2 AND care_home_id = $3
                     RETURNING *`;
      updateParams = notes !== undefined ? [patientId, agentId, careHomeId, notes] : [patientId, agentId, careHomeId];
    } else {
      const actionToStatus = {
        contacted: 'contacted',
        agreement_signed: 'agreement_signed',
        visit_scheduled: 'visit_scheduled',
        visit_completed: 'visit_completed',
      };
      const actionToTimestamp = {
        contacted: 'contacted_at',
        agreement_signed: 'agreement_signed_at',
        visit_scheduled: 'visit_scheduled_at',
        visit_completed: 'visit_completed_at',
      };
      const newStatus = actionToStatus[action];
      const tsColumn = actionToTimestamp[action];
      const notesClause = notes !== undefined ? ', agent_notes = $4' : '';
      updateQuery = `UPDATE care_home_matches
                     SET status = '${newStatus}', ${tsColumn} = NOW() ${notesClause}
                     WHERE patient_id = $1 AND placement_agent_id = $2 AND care_home_id = $3
                     RETURNING *`;
      updateParams = notes !== undefined ? [patientId, agentId, careHomeId, notes] : [patientId, agentId, careHomeId];
    }

    const result = await db.query(updateQuery, updateParams);
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Match not found.' });
    }
    return res.json({ match: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /matches/:patientId/selected - get all worked matches for a patient
// ---------------------------------------------------------------------------
router.get('/matches/:patientId/selected', authenticate, requireRole('placement_agent'), async (req, res, next) => {
  try {
    const { patientId } = req.params;

    const agentResult = await db.query(
      'SELECT id FROM placement_agents WHERE user_id = $1', [req.user.id]
    );
    if (!agentResult.rows.length) return res.status(403).json({ error: 'Access denied.' });
    const agentId = agentResult.rows[0].id;

    const result = await db.query(
      `SELECT
         chm.id,
         chm.care_home_id,
         chm.match_score,
         chm.status,
         chm.contacted_at,
         chm.agreement_signed_at,
         chm.visit_scheduled_at,
         chm.visit_completed_at,
         chm.is_shortlisted,
         chm.agent_notes,
         ch.facility_name,
         ch.address_line1,
         ch.city,
         ch.state,
         ch.zip,
         ch.phone,
         ch.email,
         cha.base_price_monthly,
         cha.rooms_available,
         array_agg(DISTINCT chs.service_code) FILTER (WHERE chs.id IS NOT NULL) as services_offered
       FROM care_home_matches chm
       JOIN care_homes ch ON ch.id = chm.care_home_id
       LEFT JOIN care_home_availability cha ON cha.care_home_id = ch.id
       LEFT JOIN care_home_services chs ON chs.care_home_id = ch.id
       WHERE chm.patient_id = $1 AND chm.placement_agent_id = $2
       GROUP BY chm.id, ch.id, cha.id
       ORDER BY chm.match_score DESC`,
      [patientId, agentId]
    );

    return res.json({ matches: result.rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /place/:patientId - mark patient as placed at a care home
// ---------------------------------------------------------------------------
router.post('/place/:patientId', authenticate, requireRole('placement_agent'), async (req, res, next) => {
  const { patientId } = req.params;
  const { care_home_id } = req.body;

  if (!care_home_id) {
    return res.status(400).json({ error: 'care_home_id is required.' });
  }

  const client = await db.getClient();
  try {
    const agentResult = await client.query(
      'SELECT id FROM placement_agents WHERE user_id = $1', [req.user.id]
    );
    if (!agentResult.rows.length) return res.status(403).json({ error: 'Access denied.' });
    const agentId = agentResult.rows[0].id;

    // Verify agent has an assignment for this patient (locked or previously worked)
    const lockCheck = await client.query(
      `SELECT id, status FROM queue_assignments WHERE patient_id = $1 AND placement_agent_id = $2`,
      [patientId, agentId]
    );
    if (!lockCheck.rows.length) {
      return res.status(403).json({ error: 'You do not have an assignment for this patient.' });
    }

    // Verify care home is shortlisted by this agent for this patient
    const shortlistCheck = await client.query(
      `SELECT id FROM care_home_matches
       WHERE patient_id = $1 AND placement_agent_id = $2 AND care_home_id = $3 AND is_shortlisted = TRUE`,
      [patientId, agentId, care_home_id]
    );
    if (!shortlistCheck.rows.length) {
      return res.status(400).json({ error: 'Care home must be shortlisted before confirming placement.' });
    }

    const patientResult = await client.query(
      'SELECT * FROM patients WHERE id = $1', [patientId]
    );
    if (!patientResult.rows.length) return res.status(404).json({ error: 'Patient not found.' });
    const patient = patientResult.rows[0];

    const availResult = await client.query(
      'SELECT base_price_monthly, room_type FROM care_home_availability WHERE care_home_id = $1 LIMIT 1',
      [care_home_id]
    );
    const monthlyRate = availResult.rows[0]?.base_price_monthly ?? null;
    const roomType = availResult.rows[0]?.room_type ?? null;

    await client.query('BEGIN');

    // 1. Update patient status to placed
    await client.query(
      `UPDATE patients SET queue_status = 'placed' WHERE id = $1`,
      [patientId]
    );

    // 2. Complete queue assignment
    await client.query(
      `UPDATE queue_assignments SET status = 'completed' WHERE patient_id = $1 AND placement_agent_id = $2`,
      [patientId, agentId]
    );

    // 3. Mark selected care home as selected
    await client.query(
      `UPDATE care_home_matches SET status = 'selected'
       WHERE patient_id = $1 AND placement_agent_id = $2 AND care_home_id = $3`,
      [patientId, agentId, care_home_id]
    );

    // 4. Mark other shortlisted homes as rejected
    await client.query(
      `UPDATE care_home_matches SET status = 'rejected'
       WHERE patient_id = $1 AND placement_agent_id = $2 AND care_home_id != $3 AND is_shortlisted = TRUE`,
      [patientId, agentId, care_home_id]
    );

    // 5. Insert placement record
    const placementResult = await client.query(
      `INSERT INTO placements (patient_id, placement_agent_id, referral_agent_id, care_home_id, monthly_rate, room_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [patientId, agentId, patient.referral_agent_id, care_home_id, monthlyRate, roomType]
    );

    await client.query('COMMIT');

    console.log(`[Placement] Patient ${patientId} placed at care home ${care_home_id}. Referral agent ${patient.referral_agent_id} notified via queue_status='placed'.`);

    return res.json({
      success: true,
      placement: placementResult.rows[0],
      message: 'Patient successfully placed.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
