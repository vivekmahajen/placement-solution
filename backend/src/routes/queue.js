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
      'ch.is_verified = TRUE',
      'cha.rooms_available > 0',
    ];
    const params = [];
    let paramIdx = 1;

    // Budget filter
    if (patient.budget_max) {
      conditions.push(`cha.base_price_monthly <= $${paramIdx}`);
      params.push(patient.budget_max);
      paramIdx++;
    }
    if (patient.budget_min) {
      conditions.push(`cha.base_price_monthly >= $${paramIdx}`);
      params.push(patient.budget_min);
      paramIdx++;
    }

    // Room type filter
    if (patient.room_type_preference && patient.room_type_preference !== 'either') {
      conditions.push(`cha.room_type = $${paramIdx}`);
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

    // Gender filter
    if (patient.sex && patient.sex !== 'non_binary' && patient.sex !== 'prefer_not_to_say') {
      conditions.push(`(cha.gender_preference = 'any' OR cha.gender_preference = $${paramIdx})`);
      params.push(patient.sex);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const matchResult = await db.query(
      `SELECT ch.*,
              cha.room_type, cha.gender_preference, cha.rooms_available, cha.base_price_monthly,
              array_agg(DISTINCT chs.service_code) FILTER (WHERE chs.id IS NOT NULL) as services
       FROM care_homes ch
       JOIN care_home_availability cha ON cha.care_home_id = ch.id
       LEFT JOIN care_home_services chs ON chs.care_home_id = ch.id AND chs.is_available = TRUE
       WHERE ${whereClause}
       GROUP BY ch.id, cha.id
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
        match_score: Math.min(100, Math.round(score * 100) / 100),
        match_reasons: reasons,
      };
    });

    // Sort by score descending, return top 10
    scored.sort((a, b) => b.match_score - a.match_score);
    const top10 = scored.slice(0, 10);

    // Store matches in DB
    if (req.user.role === 'placement_agent') {
      const agentResult = await db.query(
        'SELECT id FROM placement_agents WHERE user_id = $1', [req.user.id]
      );
      const agentId = agentResult.rows[0].id;

      for (const match of top10) {
        await db.query(
          `INSERT INTO care_home_matches
            (patient_id, placement_agent_id, care_home_id, match_score, match_reasons, status)
           VALUES ($1,$2,$3,$4,$5,'proposed')
           ON CONFLICT DO NOTHING`,
          [patientId, agentId, match.id, match.match_score, JSON.stringify(match.match_reasons)]
        ).catch(() => {}); // Ignore duplicates silently
      }
    }

    return res.json({ matches: top10, patient, servicesNeeded: neededServices });
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

module.exports = router;
