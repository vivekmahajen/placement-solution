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
// GET /me - get my agent profile
// ---------------------------------------------------------------------------
router.get('/me', authenticate, requireRole('placement_agent'), async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT pa.*, array_agg(
         json_build_object('id', pac.id, 'coverage_type', pac.coverage_type,
                           'coverage_value', pac.coverage_value, 'state', pac.state)
       ) FILTER (WHERE pac.id IS NOT NULL) as coverage_areas
       FROM placement_agents pa
       LEFT JOIN placement_agent_coverage pac ON pac.agent_id = pa.id
       WHERE pa.user_id = $1
       GROUP BY pa.id`,
      [req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Placement agent profile not found.' });
    }
    return res.json({ agent: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST / - create placement agent profile
// ---------------------------------------------------------------------------
router.post(
  '/',
  authenticate,
  requireRole('placement_agent', 'admin'),
  [
    body('first_name').notEmpty(),
    body('last_name').notEmpty(),
    body('address_line1').notEmpty(),
    body('city').notEmpty(),
    body('state').isLength({ min: 2, max: 2 }),
    body('zip').notEmpty(),
    body('phone').notEmpty(),
    body('email').isEmail(),
  ],
  async (req, res, next) => {
    if (handleValidationErrors(req, res)) return;

    const {
      first_name, last_name, company_name, license_number,
      address_line1, city, state, zip, phone, email, bio,
    } = req.body;

    const userId = req.user.role === 'admin' ? (req.body.user_id || req.user.id) : req.user.id;

    try {
      // Check if profile already exists
      const existing = await db.query('SELECT id FROM placement_agents WHERE user_id = $1', [userId]);
      if (existing.rows.length) {
        return res.status(409).json({ error: 'Placement agent profile already exists.' });
      }

      const result = await db.query(
        `INSERT INTO placement_agents
          (user_id, first_name, last_name, company_name, license_number,
           address_line1, city, state, zip, phone, email, bio)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [userId, first_name, last_name, company_name || null, license_number || null,
         address_line1, city, state, zip, phone, email, bio || null]
      );
      return res.status(201).json({ agent: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// PUT / - update my profile
// ---------------------------------------------------------------------------
router.put('/', authenticate, requireRole('placement_agent'), async (req, res, next) => {
  try {
    const {
      first_name, last_name, company_name, license_number,
      address_line1, city, state, zip, phone, email, bio,
    } = req.body;

    const result = await db.query(
      `UPDATE placement_agents SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        company_name = COALESCE($3, company_name),
        license_number = COALESCE($4, license_number),
        address_line1 = COALESCE($5, address_line1),
        city = COALESCE($6, city),
        state = COALESCE($7, state),
        zip = COALESCE($8, zip),
        phone = COALESCE($9, phone),
        email = COALESCE($10, email),
        bio = COALESCE($11, bio)
       WHERE user_id = $12 RETURNING *`,
      [first_name, last_name, company_name, license_number,
       address_line1, city, state, zip, phone, email, bio, req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Placement agent profile not found.' });
    }
    return res.json({ agent: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /me/coverage - list coverage areas
// ---------------------------------------------------------------------------
router.get('/me/coverage', authenticate, requireRole('placement_agent'), async (req, res, next) => {
  try {
    const agentResult = await db.query('SELECT id FROM placement_agents WHERE user_id = $1', [req.user.id]);
    if (!agentResult.rows.length) return res.status(404).json({ error: 'Agent profile not found.' });

    const result = await db.query(
      'SELECT * FROM placement_agent_coverage WHERE agent_id = $1 ORDER BY coverage_type, coverage_value',
      [agentResult.rows[0].id]
    );
    return res.json({ coverageAreas: result.rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /me/coverage - add coverage area
// ---------------------------------------------------------------------------
router.post(
  '/me/coverage',
  authenticate,
  requireRole('placement_agent'),
  [
    body('coverage_type').isIn(['city', 'zip', 'county']),
    body('coverage_value').notEmpty(),
  ],
  async (req, res, next) => {
    if (handleValidationErrors(req, res)) return;

    const { coverage_type, coverage_value, state } = req.body;
    try {
      const agentResult = await db.query('SELECT id FROM placement_agents WHERE user_id = $1', [req.user.id]);
      if (!agentResult.rows.length) return res.status(404).json({ error: 'Agent profile not found.' });

      const agentId = agentResult.rows[0].id;
      const result = await db.query(
        `INSERT INTO placement_agent_coverage (agent_id, coverage_type, coverage_value, state)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (agent_id, coverage_type, coverage_value) DO NOTHING
         RETURNING *`,
        [agentId, coverage_type, coverage_value.toLowerCase(), state || null]
      );

      if (!result.rows.length) {
        return res.status(409).json({ error: 'Coverage area already exists.' });
      }
      return res.status(201).json({ coverageArea: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /me/coverage/:id - remove coverage area
// ---------------------------------------------------------------------------
router.delete('/me/coverage/:id', authenticate, requireRole('placement_agent'), async (req, res, next) => {
  try {
    const agentResult = await db.query('SELECT id FROM placement_agents WHERE user_id = $1', [req.user.id]);
    if (!agentResult.rows.length) return res.status(404).json({ error: 'Agent profile not found.' });

    const result = await db.query(
      'DELETE FROM placement_agent_coverage WHERE id = $1 AND agent_id = $2 RETURNING id',
      [req.params.id, agentResult.rows[0].id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Coverage area not found.' });

    return res.json({ message: 'Coverage area removed.' });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET / - admin: list all agents
// ---------------------------------------------------------------------------
router.get('/', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT pa.*, u.email as user_email, u.status as user_status,
              s.status as subscription_status, s.trial_end_date
       FROM placement_agents pa
       JOIN users u ON u.id = pa.user_id
       LEFT JOIN subscriptions s ON s.user_id = pa.user_id
       ORDER BY pa.created_at DESC`,
      []
    );
    return res.json({ agents: result.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
