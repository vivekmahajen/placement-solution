'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const { sendPlacementConfirmed } = require('../services/email');

const router = express.Router();

function handleValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ errors: errors.array() });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// GET / - list placements (role-filtered)
// ---------------------------------------------------------------------------
router.get('/', authenticate, async (req, res, next) => {
  try {
    let result;
    const role = req.user.role;

    if (role === 'admin') {
      result = await db.query(
        `SELECT pl.*, p.first_name as patient_first, p.last_name as patient_last,
                pa.first_name as agent_first, pa.last_name as agent_last,
                ra.first_name as ref_first, ra.last_name as ref_last,
                ch.facility_name
         FROM placements pl
         JOIN patients p ON p.id = pl.patient_id
         JOIN placement_agents pa ON pa.id = pl.placement_agent_id
         JOIN referral_agents ra ON ra.id = pl.referral_agent_id
         JOIN care_homes ch ON ch.id = pl.care_home_id
         ORDER BY pl.created_at DESC`,
        []
      );
    } else if (role === 'placement_agent') {
      const agentResult = await db.query(
        'SELECT id FROM placement_agents WHERE user_id = $1', [req.user.id]
      );
      if (!agentResult.rows.length) return res.json({ placements: [] });
      result = await db.query(
        `SELECT pl.*, p.first_name as patient_first, p.last_name as patient_last,
                ch.facility_name, ra.first_name as ref_first, ra.last_name as ref_last
         FROM placements pl
         JOIN patients p ON p.id = pl.patient_id
         JOIN care_homes ch ON ch.id = pl.care_home_id
         JOIN referral_agents ra ON ra.id = pl.referral_agent_id
         WHERE pl.placement_agent_id = $1
         ORDER BY pl.created_at DESC`,
        [agentResult.rows[0].id]
      );
    } else if (role === 'referral_agent') {
      const agentResult = await db.query(
        'SELECT id FROM referral_agents WHERE user_id = $1', [req.user.id]
      );
      if (!agentResult.rows.length) return res.json({ placements: [] });
      result = await db.query(
        `SELECT pl.*, p.first_name as patient_first, p.last_name as patient_last,
                ch.facility_name, pa.first_name as agent_first, pa.last_name as agent_last
         FROM placements pl
         JOIN patients p ON p.id = pl.patient_id
         JOIN care_homes ch ON ch.id = pl.care_home_id
         JOIN placement_agents pa ON pa.id = pl.placement_agent_id
         WHERE pl.referral_agent_id = $1
         ORDER BY pl.created_at DESC`,
        [agentResult.rows[0].id]
      );
    } else if (role === 'care_home') {
      const homeResult = await db.query(
        'SELECT id FROM care_homes WHERE user_id = $1', [req.user.id]
      );
      if (!homeResult.rows.length) return res.json({ placements: [] });
      result = await db.query(
        `SELECT pl.*, p.first_name as patient_first, p.last_name as patient_last,
                pa.first_name as agent_first, pa.last_name as agent_last
         FROM placements pl
         JOIN patients p ON p.id = pl.patient_id
         JOIN placement_agents pa ON pa.id = pl.placement_agent_id
         WHERE pl.care_home_id = $1
         ORDER BY pl.created_at DESC`,
        [homeResult.rows[0].id]
      );
    } else {
      return res.status(403).json({ error: 'Access denied.' });
    }

    return res.json({ placements: result.rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /:id - get placement details
// ---------------------------------------------------------------------------
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT pl.*,
              p.first_name as patient_first, p.last_name as patient_last,
              pa.first_name as agent_first, pa.last_name as agent_last, pa.email as agent_email,
              ra.first_name as ref_first, ra.last_name as ref_last, ra.email as ref_email,
              ch.facility_name, ch.address_line1, ch.city, ch.state, ch.phone as home_phone
       FROM placements pl
       JOIN patients p ON p.id = pl.patient_id
       JOIN placement_agents pa ON pa.id = pl.placement_agent_id
       JOIN referral_agents ra ON ra.id = pl.referral_agent_id
       JOIN care_homes ch ON ch.id = pl.care_home_id
       WHERE pl.id = $1`,
      [id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Placement not found.' });

    const placement = result.rows[0];

    // Fetch related agreement
    const agreementResult = await db.query(
      'SELECT id, status, document_type, signed_at, signer_name FROM agreements WHERE placement_id = $1',
      [id]
    );

    return res.json({ placement, agreements: agreementResult.rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST / - create placement record (placement agent)
// ---------------------------------------------------------------------------
router.post(
  '/',
  authenticate,
  requireRole('placement_agent', 'admin'),
  [
    body('patient_id').isUUID(),
    body('care_home_id').isUUID(),
    body('room_type').isIn(['private', 'shared']),
    body('monthly_rate').isNumeric(),
  ],
  async (req, res, next) => {
    if (handleValidationErrors(req, res)) return;

    const { patient_id, care_home_id, room_type, monthly_rate, move_in_date } = req.body;

    try {
      // Fetch placement agent
      const agentResult = await db.query(
        'SELECT id FROM placement_agents WHERE user_id = $1', [req.user.id]
      );
      if (!agentResult.rows.length && req.user.role !== 'admin') {
        return res.status(400).json({ error: 'Placement agent profile not found.' });
      }
      const agentId = req.user.role === 'admin'
        ? (req.body.placement_agent_id || agentResult.rows[0]?.id)
        : agentResult.rows[0].id;

      // Fetch patient and referral agent
      const patientResult = await db.query(
        'SELECT * FROM patients WHERE id = $1', [patient_id]
      );
      if (!patientResult.rows.length) return res.status(404).json({ error: 'Patient not found.' });
      const patient = patientResult.rows[0];

      // Verify lock
      if (req.user.role !== 'admin') {
        const lockCheck = await db.query(
          `SELECT id FROM queue_assignments
           WHERE patient_id = $1 AND placement_agent_id = $2 AND status = 'locked'`,
          [patient_id, agentId]
        );
        if (!lockCheck.rows.length) {
          return res.status(403).json({ error: 'You do not have an active lock on this patient.' });
        }
      }

      // Fetch care home details for denormalized fields
      const homeResult = await db.query(
        'SELECT city, zip, county FROM care_homes WHERE id = $1', [care_home_id]
      );
      if (!homeResult.rows.length) return res.status(404).json({ error: 'Care home not found.' });
      const home = homeResult.rows[0];

      const result = await db.query(
        `INSERT INTO placements
          (patient_id, placement_agent_id, referral_agent_id, care_home_id,
           room_type, monthly_rate, move_in_date,
           care_home_city, care_home_zip, care_home_county,
           status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending_agreement')
         RETURNING *`,
        [patient_id, agentId, patient.referral_agent_id, care_home_id,
         room_type, monthly_rate, move_in_date || null,
         home.city, home.zip, home.county]
      );

      return res.status(201).json({ placement: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /:id/confirm - finalize placement
// ---------------------------------------------------------------------------
router.put('/:id/confirm', authenticate, requireRole('placement_agent', 'admin'), async (req, res, next) => {
  const client = await db.getClient();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Fetch placement
    const placementResult = await client.query(
      'SELECT * FROM placements WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (!placementResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Placement not found.' });
    }
    const placement = placementResult.rows[0];

    // Verify signed agreement exists
    const agreementResult = await client.query(
      `SELECT id FROM agreements WHERE placement_id = $1 AND status = 'signed'`,
      [id]
    );
    if (!agreementResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'A signed agreement is required before confirming a placement.' });
    }

    // Update placement status
    await client.query(
      `UPDATE placements SET status = 'confirmed' WHERE id = $1`,
      [id]
    );

    // Update patient queue_status to placed
    await client.query(
      `UPDATE patients SET queue_status = 'placed' WHERE id = $1`,
      [placement.patient_id]
    );

    // Update queue_assignment to completed
    await client.query(
      `UPDATE queue_assignments SET status = 'completed', released_at = NOW()
       WHERE patient_id = $1 AND placement_agent_id = $2 AND status = 'locked'`,
      [placement.patient_id, placement.placement_agent_id]
    );

    // Decrement care_home_availability.rooms_available by 1
    await client.query(
      `UPDATE care_home_availability
       SET rooms_available = GREATEST(0, rooms_available - 1)
       WHERE care_home_id = $1 AND room_type = $2`,
      [placement.care_home_id, placement.room_type]
    );

    // Audit log
    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata, ip_address)
       VALUES ($1,'placement_confirmed','placement',$2,$3,$4)`,
      [req.user.id, id,
       JSON.stringify({ patient_id: placement.patient_id, care_home_id: placement.care_home_id }),
       req.ip]
    );

    await client.query('COMMIT');

    // Send notifications (non-blocking)
    db.query(
      `SELECT ra.email as ref_email, ra.first_name as ref_first, ra.last_name as ref_last,
              p.first_name as patient_first, p.last_name as patient_last,
              ch.facility_name, ch.city, ch.state
       FROM placements pl
       JOIN referral_agents ra ON ra.id = pl.referral_agent_id
       JOIN patients p ON p.id = pl.patient_id
       JOIN care_homes ch ON ch.id = pl.care_home_id
       WHERE pl.id = $1`,
      [id]
    ).then((r) => {
      if (r.rows.length) {
        const row = r.rows[0];
        sendPlacementConfirmed(
          { email: row.ref_email, first_name: row.ref_first, last_name: row.ref_last },
          { first_name: row.patient_first, last_name: row.patient_last },
          { facility_name: row.facility_name, city: row.city, state: row.state }
        ).catch((err) => console.error('sendPlacementConfirmed error:', err));
      }
    }).catch((err) => console.error('Notification query error:', err));

    const confirmed = await db.query('SELECT * FROM placements WHERE id = $1', [id]);
    return res.json({ placement: confirmed.rows[0], message: 'Placement confirmed successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// PUT /:id/cancel - cancel a placement
// ---------------------------------------------------------------------------
router.put('/:id/cancel', authenticate, requireRole('placement_agent', 'admin'), async (req, res, next) => {
  const client = await db.getClient();
  try {
    const { id } = req.params;
    const { cancellation_reason } = req.body;

    await client.query('BEGIN');

    const placementResult = await client.query(
      'SELECT * FROM placements WHERE id = $1 FOR UPDATE', [id]
    );
    if (!placementResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Placement not found.' });
    }
    const placement = placementResult.rows[0];

    if (placement.status === 'confirmed') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Confirmed placements cannot be cancelled. Contact admin.' });
    }

    await client.query(
      `UPDATE placements SET status = 'cancelled', cancellation_reason = $1 WHERE id = $2`,
      [cancellation_reason || null, id]
    );

    // Return patient to queued state
    await client.query(
      `UPDATE patients SET queue_status = 'queued' WHERE id = $1`,
      [placement.patient_id]
    );

    // Release the queue lock
    await client.query(
      `UPDATE queue_assignments SET status = 'failed', released_at = NOW()
       WHERE patient_id = $1 AND placement_agent_id = $2 AND status = 'locked'`,
      [placement.patient_id, placement.placement_agent_id]
    );

    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata, ip_address)
       VALUES ($1,'placement_cancelled','placement',$2,$3,$4)`,
      [req.user.id, id, JSON.stringify({ cancellation_reason }), req.ip]
    );

    await client.query('COMMIT');
    return res.json({ message: 'Placement cancelled. Patient returned to queue.' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
