'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { sendWelcomeEmail } = require('../services/email');

const router = express.Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}

function handleValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ errors: errors.array() });
    return true;
  }
  return false;
}

// Monthly amounts per role (0 = free)
const MONTHLY_AMOUNTS = {
  care_home: 49, placement_agent: 99, referral_agent: 19,
  case_manager: 0, discharge_planner: 0, medical_social_worker: 0,
};

// Roles that share the referral_agents profile table
const REFERRAL_LIKE_ROLES = ['referral_agent', 'case_manager', 'discharge_planner', 'medical_social_worker'];

// ---------------------------------------------------------------------------
// POST /register
// ---------------------------------------------------------------------------
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('role').isIn(['care_home', 'placement_agent', 'referral_agent', 'case_manager', 'discharge_planner', 'medical_social_worker']),
  ],
  async (req, res, next) => {
    if (handleValidationErrors(req, res)) return;

    const { email, password, role, profile, ...rest } = req.body;
    // Frontend sends profile fields nested under 'profile' key
    const profileFields = profile && typeof profile === 'object' ? profile : rest;
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Check email uniqueness
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Email already registered.' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const verificationToken = uuidv4();
      const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

      // Create user
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, role, email_verification_token, email_verification_expires_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [email, passwordHash, role, verificationToken, verificationExpires]
      );
      const user = userResult.rows[0];

      // Create role-specific profile
      if (role === 'care_home') {
        const {
          facility_name, license_number, license_state, address_line1, address_line2,
          city, state, zip, county, phone, fax, facility_email, contact_email, website,
          admin_name, bed_capacity, facility_type,
        } = profileFields;
        // Map frontend display values to DB enum values
        const FACILITY_TYPE_MAP = {
          'Residential Care Home': 'residential_care',
          'Assisted Living Facility': 'assisted_living',
          'Skilled Nursing Facility': 'skilled_nursing',
          'Memory Care Facility': 'memory_care',
          'Continuing Care Retirement Community': 'continuing_care',
          'Adult Family Home': 'residential_care',
          'Board and Care Home': 'residential_care',
        };
        const mappedFacilityType = FACILITY_TYPE_MAP[facility_type] || facility_type || null;
        const contactEmail = contact_email || facility_email || email;
        await client.query(
          `INSERT INTO care_homes
            (user_id, facility_name, license_number, license_state, address_line1, address_line2,
             city, state, zip, county, phone, fax, email, website, admin_name, bed_capacity, facility_type)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [user.id, facility_name, license_number, license_state, address_line1 || '',
           address_line2 || null, city, state, zip, county || null, phone, fax || null,
           contactEmail, website || null, admin_name || null, bed_capacity || null, mappedFacilityType]
        );
      } else if (role === 'placement_agent') {
        const {
          first_name, last_name, company_name, license_number,
          address_line1, city, state, zip, phone, agent_email, bio,
        } = profileFields;
        await client.query(
          `INSERT INTO placement_agents
            (user_id, first_name, last_name, company_name, license_number,
             address_line1, city, state, zip, phone, email, bio)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [user.id, first_name || '', last_name || '', company_name || null, license_number || null,
           address_line1 || '', city || '', state || '', zip || '', phone || '',
           agent_email || email, bio || null]
        );
      } else if (REFERRAL_LIKE_ROLES.includes(role)) {
        const {
          first_name, last_name, company_name,
          address_line1, city, state, zip, phone, agent_email,
        } = profileFields;
        await client.query(
          `INSERT INTO referral_agents
            (user_id, first_name, last_name, company_name, address_line1, city, state, zip, phone, email)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [user.id, first_name || '', last_name || '', company_name || null,
           address_line1 || '', city || '', state || '', zip || '', phone || '', agent_email || email]
        );
      }

      // Create subscription (180-day trial)
      const trialStart = new Date();
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 180);
      const monthlyAmount = MONTHLY_AMOUNTS[role];

      await client.query(
        `INSERT INTO subscriptions
          (user_id, plan_type, trial_start_date, trial_end_date, monthly_amount, status)
         VALUES ($1,$2,$3,$4,$5,'trial')`,
        [user.id, role, trialStart.toISOString().split('T')[0], trialEnd.toISOString().split('T')[0], monthlyAmount]
      );

      await client.query('COMMIT');

      // Issue tokens
      const accessToken = signAccessToken(user);
      const refreshToken = signRefreshToken(user);
      const refreshHash = await bcrypt.hash(refreshToken, 10);
      await db.query('UPDATE users SET refresh_token_hash = $1 WHERE id = $2', [refreshHash, user.id]);

      // Send welcome email (non-blocking)
      sendWelcomeEmail(user).catch((err) => console.error('sendWelcomeEmail error:', err));

      return res.status(201).json({
        message: 'Registration successful. Please verify your email.',
        token: accessToken,
        refreshToken,
        user: { id: user.id, email: user.email, role: user.role, status: user.status },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  }
);

// ---------------------------------------------------------------------------
// POST /login
// ---------------------------------------------------------------------------
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req, res, next) => {
    if (handleValidationErrors(req, res)) return;

    const { email, password } = req.body;
    try {
      const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
      const user = result.rows[0];

      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }
      if (user.status === 'suspended') {
        return res.status(403).json({ error: 'Account suspended. Contact support.' });
      }
      if (user.status === 'cancelled') {
        return res.status(403).json({ error: 'Account cancelled.' });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const accessToken = signAccessToken(user);
      const refreshToken = signRefreshToken(user);
      const refreshHash = await bcrypt.hash(refreshToken, 10);

      await db.query(
        'UPDATE users SET refresh_token_hash = $1, last_login_at = NOW() WHERE id = $2',
        [refreshHash, user.id]
      );

      // Fetch subscription status
      const subResult = await db.query(
        'SELECT status, trial_end_date, plan_type FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [user.id]
      );

      return res.json({
        token: accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
          email_verified: user.email_verified,
        },
        subscription: subResult.rows[0] || null,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /refresh
// ---------------------------------------------------------------------------
router.post('/refresh', async (req, res, next) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken is required.' });
  }

  try {
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (_err) {
      return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }

    const result = await db.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    const user = result.rows[0];
    if (!user || !user.refresh_token_hash) {
      return res.status(401).json({ error: 'Refresh token not recognized.' });
    }

    const valid = await bcrypt.compare(refreshToken, user.refresh_token_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Refresh token mismatch.' });
    }

    const newAccessToken = signAccessToken(user);
    const newRefreshToken = signRefreshToken(user);
    const newRefreshHash = await bcrypt.hash(newRefreshToken, 10);

    await db.query('UPDATE users SET refresh_token_hash = $1 WHERE id = $2', [newRefreshHash, user.id]);

    return res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /logout
// ---------------------------------------------------------------------------
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await db.query('UPDATE users SET refresh_token_hash = NULL WHERE id = $1', [req.user.id]);
    return res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /me
// ---------------------------------------------------------------------------
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const userResult = await db.query(
      'SELECT id, email, role, status, email_verified, last_login_at, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const subResult = await db.query(
      `SELECT id, plan_type, trial_start_date, trial_end_date, billing_start_date,
              monthly_amount, status, stripe_customer_id, cancelled_at
       FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    );

    // Fetch profile based on role
    let profile = null;
    if (user.role === 'care_home') {
      const r = await db.query('SELECT * FROM care_homes WHERE user_id = $1', [user.id]);
      profile = r.rows[0] || null;
    } else if (user.role === 'placement_agent') {
      const r = await db.query('SELECT * FROM placement_agents WHERE user_id = $1', [user.id]);
      profile = r.rows[0] || null;
    } else if (user.role === 'referral_agent') {
      const r = await db.query('SELECT * FROM referral_agents WHERE user_id = $1', [user.id]);
      profile = r.rows[0] || null;
    }

    return res.json({
      user,
      subscription: subResult.rows[0] || null,
      profile,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /verify-email/:token
// ---------------------------------------------------------------------------
router.post('/verify-email/:token', async (req, res, next) => {
  const { token } = req.params;
  try {
    const result = await db.query(
      `SELECT id, email_verified, email_verification_expires_at
       FROM users WHERE email_verification_token = $1`,
      [token]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'Invalid verification token.' });
    }
    if (user.email_verified) {
      return res.json({ message: 'Email already verified.' });
    }
    if (new Date() > new Date(user.email_verification_expires_at)) {
      return res.status(410).json({ error: 'Verification token expired. Please request a new one.' });
    }

    await db.query(
      `UPDATE users
       SET email_verified = TRUE,
           email_verified_at = NOW(),
           status = 'active',
           email_verification_token = NULL,
           email_verification_expires_at = NULL
       WHERE id = $1`,
      [user.id]
    );

    return res.json({ message: 'Email verified successfully. Your account is now active.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
