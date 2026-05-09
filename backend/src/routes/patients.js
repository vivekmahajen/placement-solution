'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');

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
// GET /stats - patient stats for referral agent dashboard
// ---------------------------------------------------------------------------
router.get('/stats', authenticate, async (req, res, next) => {
  try {
    let whereClause = '';
    let params = [];

    if (req.user.role === 'referral_agent') {
      const agentResult = await db.query(
        'SELECT id FROM referral_agents WHERE user_id = $1', [req.user.id]
      );
      if (!agentResult.rows.length) return res.json({ total: 0, queued: 0, locked: 0, placed: 0, cancelled: 0 });
      whereClause = 'WHERE p.referral_agent_id = $1';
      params = [agentResult.rows[0].id];
    }

    const result = await db.query(
      `SELECT
        COUNT(*) FILTER (WHERE TRUE) AS total,
        COUNT(*) FILTER (WHERE queue_status = 'queued') AS queued,
        COUNT(*) FILTER (WHERE queue_status IN ('locked','in_progress','matched')) AS locked,
        COUNT(*) FILTER (WHERE queue_status = 'placed') AS placed,
        COUNT(*) FILTER (WHERE queue_status = 'cancelled') AS cancelled
       FROM patients p ${whereClause}`,
      params
    );

    const row = result.rows[0];
    return res.json({
      total: parseInt(row.total),
      queued: parseInt(row.queued),
      locked: parseInt(row.locked),
      placed: parseInt(row.placed),
      cancelled: parseInt(row.cancelled),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET / - list patients (role-filtered)
// ---------------------------------------------------------------------------
router.get('/', authenticate, async (req, res, next) => {
  try {
    let result;

    if (req.user.role === 'admin') {
      result = await db.query(
        `SELECT p.*, ra.first_name as agent_first, ra.last_name as agent_last
         FROM patients p
         JOIN referral_agents ra ON ra.id = p.referral_agent_id
         ORDER BY p.created_at DESC`,
        []
      );
    } else if (req.user.role === 'referral_agent') {
      const agentResult = await db.query(
        'SELECT id FROM referral_agents WHERE user_id = $1', [req.user.id]
      );
      if (!agentResult.rows.length) return res.json({ patients: [] });
      result = await db.query(
        'SELECT * FROM patients WHERE referral_agent_id = $1 ORDER BY created_at DESC',
        [agentResult.rows[0].id]
      );
    } else if (req.user.role === 'placement_agent') {
      // Placement agents see patients in their coverage area that are queued
      const agentResult = await db.query(
        'SELECT id FROM placement_agents WHERE user_id = $1', [req.user.id]
      );
      if (!agentResult.rows.length) return res.json({ patients: [] });
      const agentId = agentResult.rows[0].id;

      result = await db.query(
        `SELECT DISTINCT p.*
         FROM patients p
         JOIN placement_agent_coverage pac ON pac.agent_id = $1
         WHERE p.queue_status IN ('queued', 'locked')
           AND (
             (pac.coverage_type = 'zip' AND p.preferred_zip = pac.coverage_value)
             OR (pac.coverage_type = 'city' AND LOWER(p.preferred_city) = LOWER(pac.coverage_value))
             OR (pac.coverage_type = 'county' AND LOWER(p.preferred_county) = LOWER(pac.coverage_value))
           )
         ORDER BY p.queued_at ASC`,
        [agentId]
      );
    } else {
      return res.status(403).json({ error: 'Access denied.' });
    }

    return res.json({ patients: result.rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /:id - get patient details with services
// ---------------------------------------------------------------------------
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM patients WHERE id = $1', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Patient not found.' });

    const patient = result.rows[0];

    // Authorization check
    if (req.user.role === 'referral_agent') {
      const agentResult = await db.query(
        'SELECT id FROM referral_agents WHERE user_id = $1', [req.user.id]
      );
      if (!agentResult.rows.length || agentResult.rows[0].id !== patient.referral_agent_id) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    } else if (req.user.role === 'placement_agent') {
      // Can view if patient is in their coverage or they have an active lock
      const agentResult = await db.query(
        'SELECT id FROM placement_agents WHERE user_id = $1', [req.user.id]
      );
      if (!agentResult.rows.length) return res.status(403).json({ error: 'Access denied.' });

      const lockCheck = await db.query(
        `SELECT id FROM queue_assignments
         WHERE patient_id = $1 AND placement_agent_id = $2 AND status = 'locked'`,
        [id, agentResult.rows[0].id]
      );
      if (!lockCheck.rows.length) {
        return res.status(403).json({ error: 'Access denied. You do not have an active lock on this patient.' });
      }
    }

    const servicesResult = await db.query(
      'SELECT service_code FROM patient_services_needed WHERE patient_id = $1',
      [id]
    );

    return res.json({
      patient,
      services: servicesResult.rows.map((r) => r.service_code),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST / - referral agent creates patient
// ---------------------------------------------------------------------------
router.post(
  '/',
  authenticate,
  requireRole('referral_agent'),
  [
    body('first_name').notEmpty(),
    body('last_name').notEmpty(),
    body('room_type_preference').optional().isIn(['private', 'shared', 'either']),
  ],
  async (req, res, next) => {
    if (handleValidationErrors(req, res)) return;

    const client = await db.getClient();
    try {
      const agentResult = await client.query(
        'SELECT id FROM referral_agents WHERE user_id = $1', [req.user.id]
      );
      if (!agentResult.rows.length) {
        return res.status(400).json({ error: 'Referral agent profile not found. Please create your profile first.' });
      }
      const referralAgentId = agentResult.rows[0].id;

      const {
        first_name, last_name, date_of_birth, sex,
        address_line1, city, state, zip, phone,
        emergency_contact_name, emergency_contact_phone, emergency_contact_rel,
        preferred_city, preferred_zip, preferred_county,
        budget_min, budget_max, room_type_preference = 'either',
        notes, services = [],
      } = req.body;

      await client.query('BEGIN');

      const patientResult = await client.query(
        `INSERT INTO patients
          (referral_agent_id, first_name, last_name, date_of_birth, sex,
           address_line1, city, state, zip, phone,
           emergency_contact_name, emergency_contact_phone, emergency_contact_rel,
           preferred_city, preferred_zip, preferred_county,
           budget_min, budget_max, room_type_preference,
           queue_status, queued_at, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'queued',NOW(),$20)
         RETURNING *`,
        [referralAgentId, first_name, last_name, date_of_birth || null, sex || null,
         address_line1 || null, city || null, state || null, zip || null, phone || null,
         emergency_contact_name || null, emergency_contact_phone || null, emergency_contact_rel || null,
         preferred_city || null, preferred_zip || null, preferred_county || null,
         budget_min || null, budget_max || null, room_type_preference,
         notes || null]
      );
      const patient = patientResult.rows[0];

      // Insert services needed
      for (const serviceCode of services) {
        await client.query(
          `INSERT INTO patient_services_needed (patient_id, service_code)
           VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [patient.id, serviceCode]
        );
      }

      await client.query('COMMIT');
      return res.status(201).json({ patient, services });
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /:id - referral agent updates own patient
// ---------------------------------------------------------------------------
router.put('/:id', authenticate, requireRole('referral_agent', 'admin'), async (req, res, next) => {
  const client = await db.getClient();
  try {
    const { id } = req.params;
    const patientResult = await client.query('SELECT * FROM patients WHERE id = $1', [id]);
    if (!patientResult.rows.length) return res.status(404).json({ error: 'Patient not found.' });

    const patient = patientResult.rows[0];

    // Ownership check for referral agents
    if (req.user.role === 'referral_agent') {
      const agentResult = await client.query(
        'SELECT id FROM referral_agents WHERE user_id = $1', [req.user.id]
      );
      if (!agentResult.rows.length || agentResult.rows[0].id !== patient.referral_agent_id) {
        return res.status(403).json({ error: 'Not authorized to update this patient.' });
      }
    }

    const {
      first_name, last_name, date_of_birth, sex,
      address_line1, city, state, zip, phone,
      emergency_contact_name, emergency_contact_phone, emergency_contact_rel,
      preferred_city, preferred_zip, preferred_county,
      budget_min, budget_max, room_type_preference,
      notes, services,
    } = req.body;

    await client.query('BEGIN');

    const updated = await client.query(
      `UPDATE patients SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        date_of_birth = COALESCE($3, date_of_birth),
        sex = COALESCE($4, sex),
        address_line1 = COALESCE($5, address_line1),
        city = COALESCE($6, city),
        state = COALESCE($7, state),
        zip = COALESCE($8, zip),
        phone = COALESCE($9, phone),
        emergency_contact_name = COALESCE($10, emergency_contact_name),
        emergency_contact_phone = COALESCE($11, emergency_contact_phone),
        emergency_contact_rel = COALESCE($12, emergency_contact_rel),
        preferred_city = COALESCE($13, preferred_city),
        preferred_zip = COALESCE($14, preferred_zip),
        preferred_county = COALESCE($15, preferred_county),
        budget_min = COALESCE($16, budget_min),
        budget_max = COALESCE($17, budget_max),
        room_type_preference = COALESCE($18, room_type_preference),
        notes = COALESCE($19, notes)
       WHERE id = $20 RETURNING *`,
      [first_name, last_name, date_of_birth, sex,
       address_line1, city, state, zip, phone,
       emergency_contact_name, emergency_contact_phone, emergency_contact_rel,
       preferred_city, preferred_zip, preferred_county,
       budget_min, budget_max, room_type_preference, notes, id]
    );

    if (Array.isArray(services)) {
      await client.query('DELETE FROM patient_services_needed WHERE patient_id = $1', [id]);
      for (const serviceCode of services) {
        await client.query(
          'INSERT INTO patient_services_needed (patient_id, service_code) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [id, serviceCode]
        );
      }
    }

    await client.query('COMMIT');

    const servicesResult = await db.query(
      'SELECT service_code FROM patient_services_needed WHERE patient_id = $1', [id]
    );
    return res.json({
      patient: updated.rows[0],
      services: servicesResult.rows.map((r) => r.service_code),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id - soft cancel patient
// ---------------------------------------------------------------------------
router.delete('/:id', authenticate, requireRole('referral_agent', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const patientResult = await db.query('SELECT * FROM patients WHERE id = $1', [id]);
    if (!patientResult.rows.length) return res.status(404).json({ error: 'Patient not found.' });

    const patient = patientResult.rows[0];
    if (req.user.role === 'referral_agent') {
      const agentResult = await db.query(
        'SELECT id FROM referral_agents WHERE user_id = $1', [req.user.id]
      );
      if (!agentResult.rows.length || agentResult.rows[0].id !== patient.referral_agent_id) {
        return res.status(403).json({ error: 'Not authorized.' });
      }
    }

    await db.query(
      `UPDATE patients SET queue_status = 'cancelled' WHERE id = $1`,
      [id]
    );
    return res.json({ message: 'Patient cancelled successfully.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
