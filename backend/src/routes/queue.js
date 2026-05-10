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

    // Get patients in coverage area that are queued and not locked by this agent
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

    // Lock patient row to prevent concurrent locks
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

    // Check for existing assignment for this agent
    const existingLock = await client.query(
      `SELECT id FROM queue_assignments
       WHERE patient_id = $1 AND placement_agent_id = $2`,
      [patientId, agentId]
    );
    if (existingLock.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'You already have an assignment for this patient.' });
    }

    // Create lock (4 days from now)
    const lockExpiresAt = new Date();
    lockExpiresAt.setDate(lockExpiresAt.getDate() + 4);

    const assignmentResult = await client.query(
      `INSERT INTO queue_assignments
        (patient_id, placement_agent_id, locked_at, lock_expires_at, status)
       VALUES ($1,$2,NOW(),$3,'locked') RETURNING *`,
      [patientId, agentId, lockExpiresAt]
    );

    // Update patient status to locked
    await client.query(
      `UPDATE patients SET queue_status = 'locked' WHERE id = $1`,
      [patientId]
    );

    // Audit log
    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata, ip_address)
       VALUES ($1,'queue_lock','patient',$2,$3,$4)`,
      [req.user.id, patientId,
       JSON.stringify({ agent_id: agentId, lock_expires_at: lockExpiresAt }),
       req.ip]
    );

    await client.query('COMMIT');

    // Fetch match suggestions
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

    // Verify agent has a lock on this patient
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

    // Fetch patient details
    const patientResult = await db.query('SELECT * FROM patients WHERE id = $1', [patientId]);
    if (!patientResult.rows.length) return res.status(404).json({ error: 'Patient not found.' });
    const patient = patientResult.rows[0];

    const servicesResult = await db.query(
      'SELECT service_code FROM patient_services_needed WHERE patient_id = $1', [patientId]
    );
    const neededServices = servicesResult.rows.map((r) => r.service_code);

    // Build mandatory filter conditions
    const conditions = [
      'ch.is_active = TRUE',
    ];
    const params = [];
    let paramIdx = 1;

    // Budget filter (only apply when availability record exists)
    if (patient.budget_max) {
      conditions.push(`(cha.base_price_monthly IS NULL OR cha.base_price_monthly <= $${paramIdx})`);
      params.push(patient.budget_max);
      paramIdx++;
    }
    if (patient.budget_min) {
      conditions.push(`(cha.base_price_monthly IS NULL OR cha.base_price_monthly >= $${paramIdx})`);
      params.push(patient.budget_min);
      paramIdx++;
    }

    // Room type filter (only apply when availability record exists)
    if (patient.room_type_preference && patient.room_type_preference !== 'either') {
      conditions.push(`(cha.room_type IS NULL OR cha.room_type = $${paramIdx})`);
      params.push(patient.room_type_preference);
      paramIdx++;
    }

    // Location filter (prefer patient's preferred area)
    const locationConditions = [];
    if (patient.preferred_zip) {
      locationConditions.push(`ch.zip = $${paramIdx}`);
      params.push(patient.preferred_zip);
      paramIdx++;
    }
    if (patient.preferred_city) {
      locationConditions.push(`LOWER(ch.city) = LOWER($${paramIdx})`);
      params.push(patient.preferred_city);
      paramIdx++;
    }
    if (patient.preferred_county) {
      locationConditions.push(`LOWER(ch.county) = LOWER($${paramIdx})`);
      params.push(patient.preferred_county);
      paramIdx++;
    }

    if (locationConditions.length > 0) {
      conditions.push(`(${locationConditions.join(' OR ')})`);
    }

    // Gender filter (only apply when availability record exists)
    if (patient.sex && patient.sex !== 'non_binary' && patient.sex !== 'prefer_not_to_say') {
      conditions.push(`(cha.gender_preference IS NULL OR cha.gender_preference = 'any' OR cha.gender_preference = $${paramIdx})`);
      params.push(patient.sex);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const matchResult = await db.query(
      `SELECT ch.*,
              cha.room_type, cha.gender_preference, cha.rooms_available, cha.base_price_monthly,
              array_agg(DISTINCT chs.service_code) FILTER (WHERE chs.id IS NOT NULL) as services
       FROM care_homes ch
       LEFT JOIN care_home_availability cha ON cha.care_home_id = ch.id
       LEFT JOIN care_home_services chs ON chs.care_home_id = ch.id AND chs.is_available = TRUE
       WHERE ${whereClause}
       GROUP BY ch.id, cha.id, cha.room_type, cha.gender_preference, cha.rooms_available, cha.base_price_monthly
       LIMIT 50`,
      params
    );

    // Score each match
    const scored = matchResult.rows.map((home) => {
      let score = 50; // base score
      const reasons = [];

      // Budget fit: closer to budget_min = more affordable = positive
      if (patient.budget_max && home.base_price_monthly <= patient.budget_max) {
        const budgetRange = (patient.budget_max || home.base_price_monthly) - (patient.budget_min || 0);
        const priceScore = budgetRange > 0
          ? ((patient.budget_max - home.base_price_monthly) / budgetRange) * 20
          : 10;
        score += Math.min(20, priceScore);
        reasons.push('Within budget');
      }

      // Location match scoring
      if (patient.preferred_zip && home.zip === patient.preferred_zip) {
        score += 20;
        reasons.push('Exact ZIP match');
      } else if (patient.preferred_city && home.city.toLowerCase() === (patient.preferred_city || '').toLowerCase()) {
        score += 15;
        reasons.push('City match');
      } else if (patient.preferred_county && home.county && home.county.toLowerCase() === (patient.preferred_county || '').toLowerCase()) {
        score += 10;
        reasons.push('County match');
      }

      // Services match scoring
      const homeServices = home.services || [];
      const matchedServices = neededServices.filter((s) => homeServices.includes(s));
      if (neededServices.length > 0) {
        const serviceScore = (matchedServices.length / neededServices.length) * 20;
        score += serviceScore;
        if (matchedServices.length > 0) {
          reasons.push(`${matchedServices.length}/${neededServices.length} services matched`);
        }
      }

      // Room availability bonus
      if (home.rooms_available > 2) {
        score += 5;
        reasons.push('Multiple rooms available');
      }

      // Gender preference match bonus
      if (home.gender_preference === 'any') {
        score += 5;
        reasons.push('Accepts any gender');
      }

      return {
        ...home,
        care_home_id: home.id,
        services_offered: home.services ?? [],
        match_score: Math.min(100, Math.round(score * 100) / 100),
        match_reasons: reasons,
      };
    });

    // Sort by score descending, return top 10
    scored.sort((a, b) => b.match_score - a.match_score);
    const top10 = scored.slice(0, 10);

    // Store matches in DB and fetch current proposal statuses
    let proposalStatusMap = {};
    if (req.user.role === 'placement_agent') {
      const agentResult = await db.query(
        'SELECT id FROM placement_agents WHERE user_id = $1', [req.user.id]
      );
      const agentId = agentResult.rows[0].id;

      for (const match of top10) {
        await db.query(
          `INSERT INTO care_home_matches
            (patient_id, placement_agent_id, care_home_id, match_score, match_reasons, status)
           VALUES ($1,$2,$3,$4,$5,'suggested')
           ON CONFLICT DO NOTHING`,
          [patientId, agentId, match.id, match.match_score, JSON.stringify(match.match_reasons)]
        ).catch(() => {});
      }

      // Fetch current statuses for all top10 matches
      const statusRows = await db.query(
        `SELECT care_home_id, status FROM care_home_matches
         WHERE patient_id = $1 AND placement_agent_id = $2`,
        [patientId, agentId]
      );
      proposalStatusMap = Object.fromEntries(statusRows.rows.map((r) => [r.care_home_id, r.status]));
    }

    const matchesWithStatus = top10.map((m) => ({
      ...m,
      proposal_status: proposalStatusMap[m.id] ?? null,
    }));

    return res.json({ matches: matchesWithStatus, patient, servicesNeeded: neededServices });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /matches/:patientId/select - mark up to 3 homes as selected
// ---------------------------------------------------------------------------
router.post('/matches/:patientId/select', authenticate, requireRole('placement_agent'), async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const { careHomeIds } = req.body; // array of up to 3 care home IDs

    if (!Array.isArray(careHomeIds) || careHomeIds.length === 0 || careHomeIds.length > 3) {
      return res.status(400).json({ error: 'Provide between 1 and 3 care home IDs.' });
    }

    const agentResult = await db.query(
      'SELECT id FROM placement_agents WHERE user_id = $1', [req.user.id]
    );
    if (!agentResult.rows.length) return res.status(403).json({ error: 'Access denied.' });
    const agentId = agentResult.rows[0].id;

    // Verify lock
    const lockCheck = await db.query(
      `SELECT id FROM queue_assignments
       WHERE patient_id = $1 AND placement_agent_id = $2 AND status = 'locked'`,
      [patientId, agentId]
    );
    if (!lockCheck.rows.length) {
      return res.status(403).json({ error: 'You do not have an active lock on this patient.' });
    }

    // Update matches to selected
    await db.query(
      `UPDATE care_home_matches SET status = 'selected', selected_at = NOW()
       WHERE patient_id = $1 AND placement_agent_id = $2
         AND care_home_id = ANY($3::uuid[])`,
      [patientId, agentId, careHomeIds]
    );

    // Update patient queue_status to in_progress
    await db.query(
      `UPDATE patients SET queue_status = 'in_progress' WHERE id = $1`,
      [patientId]
    );

    const selectedMatches = await db.query(
      `SELECT chm.*, ch.facility_name, ch.city, ch.state
       FROM care_home_matches chm
       JOIN care_homes ch ON ch.id = chm.care_home_id
       WHERE chm.patient_id = $1 AND chm.placement_agent_id = $2 AND chm.status = 'selected'`,
      [patientId, agentId]
    );

    return res.json({ selectedMatches: selectedMatches.rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /assignment/:patientId - get agent's assignment for a specific patient
// ---------------------------------------------------------------------------
router.get('/assignment/:patientId', authenticate, requireRole('placement_agent'), async (req, res, next) => {
  try {
    const agentResult = await db.query(
      'SELECT id FROM placement_agents WHERE user_id = $1', [req.user.id]
    );
    if (!agentResult.rows.length) return res.status(404).json({ error: 'Placement agent profile not found.' });
    const agentId = agentResult.rows[0].id;

    const result = await db.query(
      `SELECT * FROM queue_assignments WHERE patient_id = $1 AND placement_agent_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [req.params.patientId, agentId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'No assignment found.' });
    return res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /proposals - update care home match status (propose / visited)
// ---------------------------------------------------------------------------
router.post('/proposals', authenticate, requireRole('placement_agent'), async (req, res, next) => {
  try {
    const { patient_id, care_home_id, action } = req.body;
    if (!patient_id || !care_home_id || !action) {
      return res.status(400).json({ error: 'patient_id, care_home_id, and action are required.' });
    }

    const agentResult = await db.query(
      'SELECT id FROM placement_agents WHERE user_id = $1', [req.user.id]
    );
    if (!agentResult.rows.length) return res.status(403).json({ error: 'Access denied.' });
    const agentId = agentResult.rows[0].id;

    const lockCheck = await db.query(
      `SELECT id FROM queue_assignments WHERE patient_id = $1 AND placement_agent_id = $2 AND status = 'locked'`,
      [patient_id, agentId]
    );
    if (!lockCheck.rows.length) {
      return res.status(403).json({ error: 'No active lock on this patient.' });
    }

    const statusMap = { propose: 'proposed', visited: 'visited' };
    const newStatus = statusMap[action] || action;

    await db.query(
      `UPDATE care_home_matches SET status = $1
       WHERE patient_id = $2 AND placement_agent_id = $3 AND care_home_id = $4`,
      [newStatus, patient_id, agentId, care_home_id]
    );

    return res.json({ success: true, status: newStatus });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin - admin view of all queue entries
// ---------------------------------------------------------------------------
router.get('/admin', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT qa.*,
              p.first_name as patient_first, p.last_name as patient_last,
              p.preferred_city, p.preferred_zip, p.queue_status,
              pa.first_name as agent_first, pa.last_name as agent_last,
              pa.email as agent_email
       FROM queue_assignments qa
       JOIN patients p ON p.id = qa.patient_id
       JOIN placement_agents pa ON pa.id = qa.placement_agent_id
       ORDER BY qa.created_at DESC`,
      []
    );
    return res.json({ queueEntries: result.rows });
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
      // Check <= 3 shortlisted for this patient/agent
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

    const lockCheck = await db.query(
      `SELECT id FROM queue_assignments WHERE patient_id = $1 AND placement_agent_id = $2 AND status = 'locked'`,
      [patientId, agentId]
    );
    if (!lockCheck.rows.length) {
      return res.status(403).json({ error: 'You do not have an active lock on this patient.' });
    }

    const result = await db.query(
      `SELECT chm.*,
              ch.facility_name, ch.city, ch.state, ch.phone, ch.email,
              ch.address_line1, ch.zip,
              cha.base_price_monthly, cha.rooms_available,
              array_agg(DISTINCT chs.service_code) FILTER (WHERE chs.id IS NOT NULL) as services_offered
       FROM care_home_matches chm
       JOIN care_homes ch ON ch.id = chm.care_home_id
       LEFT JOIN care_home_availability cha ON cha.care_home_id = ch.id
       LEFT JOIN care_home_services chs ON chs.care_home_id = ch.id AND chs.is_available = TRUE
       WHERE chm.patient_id = $1 AND chm.placement_agent_id = $2
         AND chm.status NOT IN ('suggested')
       GROUP BY chm.id, ch.id, cha.base_price_monthly, cha.rooms_available
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

    // Verify lock
    const lockCheck = await client.query(
      `SELECT id FROM queue_assignments WHERE patient_id = $1 AND placement_agent_id = $2 AND status = 'locked'`,
      [patientId, agentId]
    );
    if (!lockCheck.rows.length) {
      return res.status(403).json({ error: 'You do not have an active lock on this patient.' });
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

    // Get patient info for referral_agent_id
    const patientResult = await client.query(
      'SELECT * FROM patients WHERE id = $1', [patientId]
    );
    if (!patientResult.rows.length) return res.status(404).json({ error: 'Patient not found.' });
    const patient = patientResult.rows[0];

    // Get monthly rate from care_home_availability
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

    // 3. Mark selected care home as family_selected
    await client.query(
      `UPDATE care_home_matches SET status = 'family_selected'
       WHERE patient_id = $1 AND placement_agent_id = $2 AND care_home_id = $3`,
      [patientId, agentId, care_home_id]
    );

    // 4. Mark other shortlisted homes as family_rejected
    await client.query(
      `UPDATE care_home_matches SET status = 'family_rejected'
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

    // Notify referral agent (console.log placeholder - no email service needed)
    console.log(`[Placement] Patient ${patientId} placed at care home ${care_home_id}. Referral agent ${patient.referral_agent_id} can see status via queue_status='placed'.`);

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
