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
// GET /me - get my referral agent profile
// ---------------------------------------------------------------------------
router.get('/me', authenticate, requireRole('referral_agent'), async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT * FROM referral_agents WHERE user_id = $1',
      [req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Referral agent profile not found.' });
    }
    return res.json({ agent: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST / - create referral agent profile
// ---------------------------------------------------------------------------
router.post(
  '/',
  authenticate,
  requireRole('referral_agent', 'admin'),
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
      first_name, last_name, company_name,
      address_line1, city, state, zip, phone, email,
    } = req.body;

    const userId = req.user.role === 'admin' ? (req.body.user_id || req.user.id) : req.user.id;

    try {
      const existing = await db.query('SELECT id FROM referral_agents WHERE user_id = $1', [userId]);
      if (existing.rows.length) {
        return res.status(409).json({ error: 'Referral agent profile already exists.' });
      }

      const result = await db.query(
        `INSERT INTO referral_agents
          (user_id, first_name, last_name, company_name, address_line1, city, state, zip, phone, email)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [userId, first_name, last_name, company_name || null,
         address_line1, city, state, zip, phone, email]
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
router.put('/', authenticate, requireRole('referral_agent'), async (req, res, next) => {
  try {
    const {
      first_name, last_name, company_name,
      address_line1, city, state, zip, phone, email,
    } = req.body;

    const result = await db.query(
      `UPDATE referral_agents SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        company_name = COALESCE($3, company_name),
        address_line1 = COALESCE($4, address_line1),
        city = COALESCE($5, city),
        state = COALESCE($6, state),
        zip = COALESCE($7, zip),
        phone = COALESCE($8, phone),
        email = COALESCE($9, email)
       WHERE user_id = $10 RETURNING *`,
      [first_name, last_name, company_name, address_line1, city, state, zip, phone, email, req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Referral agent profile not found.' });
    }
    return res.json({ agent: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET / - admin: list all referral agents
// ---------------------------------------------------------------------------
router.get('/', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT ra.*, u.email as user_email, u.status as user_status,
              s.status as subscription_status, s.trial_end_date
       FROM referral_agents ra
       JOIN users u ON u.id = ra.user_id
       LEFT JOIN subscriptions s ON s.user_id = ra.user_id
       ORDER BY ra.created_at DESC`,
      []
    );
    return res.json({ agents: result.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
