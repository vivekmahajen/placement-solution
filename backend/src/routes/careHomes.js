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
// GET / - list care homes
// ---------------------------------------------------------------------------
router.get('/', authenticate, async (req, res, next) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await db.query(
        `SELECT ch.*, u.email as user_email, u.status as user_status
         FROM care_homes ch JOIN users u ON u.id = ch.user_id
         ORDER BY ch.created_at DESC`,
        []
      );
    } else if (req.user.role === 'care_home') {
      result = await db.query(
        'SELECT * FROM care_homes WHERE user_id = $1 ORDER BY created_at DESC',
        [req.user.id]
      );
    } else {
      // Placement agents and referral agents can see active, verified care homes
      result = await db.query(
        `SELECT id, facility_name, address_line1, city, state, zip, county,
                latitude, longitude, phone, email, website, facility_type,
                bed_capacity, is_active, is_verified
         FROM care_homes WHERE is_active = TRUE AND is_verified = TRUE
         ORDER BY facility_name ASC`,
        []
      );
    }
    return res.json({ careHomes: result.rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /:id - get single care home
// ---------------------------------------------------------------------------
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM care_homes WHERE id = $1', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Care home not found.' });

    const careHome = result.rows[0];
    // Non-admin, non-owner can only see active+verified homes
    if (req.user.role !== 'admin' && careHome.user_id !== req.user.id) {
      if (!careHome.is_active || !careHome.is_verified) {
        return res.status(404).json({ error: 'Care home not found.' });
      }
    }

    // Include availability and services
    const [availResult, servicesResult] = await Promise.all([
      db.query('SELECT * FROM care_home_availability WHERE care_home_id = $1', [id]),
      db.query('SELECT * FROM care_home_services WHERE care_home_id = $1', [id]),
    ]);

    return res.json({
      careHome,
      availability: availResult.rows,
      services: servicesResult.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST / - create care home profile
// ---------------------------------------------------------------------------
router.post(
  '/',
  authenticate,
  requireRole('care_home', 'admin'),
  [
    body('facility_name').notEmpty(),
    body('license_number').notEmpty(),
    body('license_state').isLength({ min: 2, max: 2 }),
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
      facility_name, license_number, license_state, license_expiry,
      address_line1, address_line2, city, state, zip, county,
      latitude, longitude, phone, fax, email, website,
      admin_name, bed_capacity, facility_type,
    } = req.body;

    const userId = req.user.role === 'admin' ? (req.body.user_id || req.user.id) : req.user.id;

    try {
      const result = await db.query(
        `INSERT INTO care_homes
          (user_id, facility_name, license_number, license_state, license_expiry,
           address_line1, address_line2, city, state, zip, county,
           latitude, longitude, phone, fax, email, website,
           admin_name, bed_capacity, facility_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         RETURNING *`,
        [userId, facility_name, license_number, license_state, license_expiry || null,
         address_line1, address_line2 || null, city, state, zip, county || null,
         latitude || null, longitude || null, phone, fax || null, email, website || null,
         admin_name || null, bed_capacity || null, facility_type || null]
      );
      return res.status(201).json({ careHome: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /:id - update care home
// ---------------------------------------------------------------------------
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const homeResult = await db.query('SELECT * FROM care_homes WHERE id = $1', [id]);
    if (!homeResult.rows.length) return res.status(404).json({ error: 'Care home not found.' });

    const careHome = homeResult.rows[0];
    if (req.user.role !== 'admin' && careHome.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to update this care home.' });
    }

    const {
      facility_name, license_number, license_state, license_expiry,
      address_line1, address_line2, city, state, zip, county,
      latitude, longitude, phone, fax, email, website,
      admin_name, bed_capacity, facility_type,
    } = req.body;

    const result = await db.query(
      `UPDATE care_homes SET
        facility_name = COALESCE($1, facility_name),
        license_number = COALESCE($2, license_number),
        license_state = COALESCE($3, license_state),
        license_expiry = COALESCE($4, license_expiry),
        address_line1 = COALESCE($5, address_line1),
        address_line2 = COALESCE($6, address_line2),
        city = COALESCE($7, city),
        state = COALESCE($8, state),
        zip = COALESCE($9, zip),
        county = COALESCE($10, county),
        latitude = COALESCE($11, latitude),
        longitude = COALESCE($12, longitude),
        phone = COALESCE($13, phone),
        fax = COALESCE($14, fax),
        email = COALESCE($15, email),
        website = COALESCE($16, website),
        admin_name = COALESCE($17, admin_name),
        bed_capacity = COALESCE($18, bed_capacity),
        facility_type = COALESCE($19, facility_type)
       WHERE id = $20 RETURNING *`,
      [facility_name, license_number, license_state, license_expiry,
       address_line1, address_line2, city, state, zip, county,
       latitude, longitude, phone, fax, email, website,
       admin_name, bed_capacity, facility_type, id]
    );
    return res.json({ careHome: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /:id/availability
// ---------------------------------------------------------------------------
router.get('/:id/availability', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT * FROM care_home_availability WHERE care_home_id = $1 ORDER BY room_type, gender_preference',
      [req.params.id]
    );
    return res.json({ availability: result.rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /:id/availability - upsert availability records
// ---------------------------------------------------------------------------
router.put('/:id/availability', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const homeResult = await db.query('SELECT user_id FROM care_homes WHERE id = $1', [id]);
    if (!homeResult.rows.length) return res.status(404).json({ error: 'Care home not found.' });

    if (req.user.role !== 'admin' && homeResult.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized.' });
    }

    const { availability } = req.body; // array of { room_type, gender_preference, rooms_available, base_price_monthly, notes }
    if (!Array.isArray(availability)) {
      return res.status(400).json({ error: 'availability must be an array.' });
    }

    const results = [];
    for (const item of availability) {
      const { room_type, gender_preference = 'any', rooms_available, base_price_monthly, notes } = item;
      const r = await db.query(
        `INSERT INTO care_home_availability
          (care_home_id, room_type, gender_preference, rooms_available, base_price_monthly, notes, last_updated_at, updated_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7)
         ON CONFLICT (care_home_id, room_type, gender_preference)
         DO UPDATE SET
           rooms_available = EXCLUDED.rooms_available,
           base_price_monthly = EXCLUDED.base_price_monthly,
           notes = EXCLUDED.notes,
           last_updated_at = NOW(),
           updated_by_user_id = EXCLUDED.updated_by_user_id
         RETURNING *`,
        [id, room_type, gender_preference, rooms_available, base_price_monthly, notes || null, req.user.id]
      );
      results.push(r.rows[0]);
    }

    return res.json({ availability: results });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /:id/services
// ---------------------------------------------------------------------------
router.get('/:id/services', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT * FROM care_home_services WHERE care_home_id = $1 ORDER BY service_label',
      [req.params.id]
    );
    return res.json({ services: result.rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /:id/services - replace all services for care home
// ---------------------------------------------------------------------------
router.put('/:id/services', authenticate, async (req, res, next) => {
  const { id } = req.params;
  const client = await db.getClient();
  try {
    const homeResult = await client.query('SELECT user_id FROM care_homes WHERE id = $1', [id]);
    if (!homeResult.rows.length) return res.status(404).json({ error: 'Care home not found.' });

    if (req.user.role !== 'admin' && homeResult.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized.' });
    }

    const { services } = req.body; // array of { service_code, service_label, additional_cost, is_available }
    if (!Array.isArray(services)) {
      return res.status(400).json({ error: 'services must be an array.' });
    }

    await client.query('BEGIN');
    await client.query('DELETE FROM care_home_services WHERE care_home_id = $1', [id]);

    const results = [];
    for (const svc of services) {
      const { service_code, service_label, additional_cost = 0, is_available = true } = svc;
      const r = await client.query(
        `INSERT INTO care_home_services (care_home_id, service_code, service_label, additional_cost, is_available)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [id, service_code, service_label, additional_cost, is_available]
      );
      results.push(r.rows[0]);
    }

    await client.query('COMMIT');
    return res.json({ services: results });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// PUT /:id/status - toggle is_active
// ---------------------------------------------------------------------------
router.put('/:id/status', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const homeResult = await db.query('SELECT * FROM care_homes WHERE id = $1', [id]);
    if (!homeResult.rows.length) return res.status(404).json({ error: 'Care home not found.' });

    const careHome = homeResult.rows[0];
    if (req.user.role !== 'admin' && careHome.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized.' });
    }

    const { is_active } = req.body;
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active must be a boolean.' });
    }

    const result = await db.query(
      'UPDATE care_homes SET is_active = $1 WHERE id = $2 RETURNING *',
      [is_active, id]
    );
    return res.json({ careHome: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
