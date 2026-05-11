const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

// ---------------------------------------------------------------------------
// GET / - list care homes
// ---------------------------------------------------------------------------
router.get('/', authenticate, async (req, res, next) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      const status = req.query.status;
      let q = `SELECT ch.*, u.email FROM care_homes ch JOIN users u ON u.id = ch.user_id`;
      if (status) q += ` WHERE ch.is_active = ${status === 'active'} OR ch.is_verified = ${status === 'verified'}`;
      result = await db.query(q + ' ORDER BY ch.created_at DESC');
    } else if (req.user.role === 'care_home') {
      result = await db.query(
        'SELECT * FROM care_homes WHERE user_id = $1 ORDER BY created_at DESC',
        [req.user.id]
      );
    } else {
      // Placement agents and referral agents can see active, verified care homes
      result = await db.query(
        `SELECT id, facility_name, address_line1, city, state, zip, county,
                facility_type, gender_preference, capacity, is_verified, is_active
         FROM care_homes WHERE is_active = TRUE AND is_verified = TRUE
         ORDER BY facility_name ASC`,
      );
    }
    return res.json({ careHomes: result.rows });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /me - get the care home profile for the current user
// ---------------------------------------------------------------------------
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT * FROM care_homes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Care home profile not found.' });
    return res.json({ careHome: result.rows[0] });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /me/availability - availability records for the current user's care home
// ---------------------------------------------------------------------------
router.get('/me/availability', authenticate, async (req, res, next) => {
  try {
    const ch = await db.query('SELECT id FROM care_homes WHERE user_id = $1 LIMIT 1', [req.user.id]);
    if (!ch.rows.length) return res.json({ availability: [] });
    const result = await db.query(
      'SELECT * FROM care_home_availability WHERE care_home_id = $1 ORDER BY room_type, gender_preference',
      [ch.rows[0].id]
    );
    return res.json({ availability: result.rows });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /me/services - services for the current user's care home
// ---------------------------------------------------------------------------
router.get('/me/services', authenticate, async (req, res, next) => {
  try {
    const ch = await db.query('SELECT id FROM care_homes WHERE user_id = $1 LIMIT 1', [req.user.id]);
    if (!ch.rows.length) return res.json({ services: [] });
    const result = await db.query(
      'SELECT id, care_home_id, service_label AS service_name, additional_cost, is_available FROM care_home_services WHERE care_home_id = $1 ORDER BY service_label',
      [ch.rows[0].id]
    );
    return res.json({ services: result.rows });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// PUT /me/services - replace all services for the current user's care home
// ---------------------------------------------------------------------------
router.put('/me/services', authenticate, async (req, res, next) => {
  const client = await db.getClient();
  try {
    const ch = await client.query('SELECT id FROM care_homes WHERE user_id = $1 LIMIT 1', [req.user.id]);
    if (!ch.rows.length) return res.status(404).json({ error: 'Care home profile not found.' });
    const careHomeId = ch.rows[0].id;

    const { services } = req.body;
    if (!Array.isArray(services)) return res.status(400).json({ error: 'services must be an array.' });

    await client.query('BEGIN');
    await client.query('DELETE FROM care_home_services WHERE care_home_id = $1', [careHomeId]);

    const results = [];
    for (const svc of services) {
      const { service_name, additional_cost = 0 } = svc;
      const r = await client.query(
        `INSERT INTO care_home_services (care_home_id, service_code, service_label, additional_cost, is_available)
         VALUES ($1, $2, $3, $4, TRUE) RETURNING id, care_home_id, service_label AS service_name, additional_cost, is_available`,
        [careHomeId, service_name, service_name, additional_cost]
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
// POST /me/availability - add availability record for current user's care home
// ---------------------------------------------------------------------------
router.post('/me/availability', authenticate, async (req, res, next) => {
  try {
    const ch = await db.query('SELECT id FROM care_homes WHERE user_id = $1 LIMIT 1', [req.user.id]);
    if (!ch.rows.length) return res.status(404).json({ error: 'Care home profile not found.' });
    const careHomeId = ch.rows[0].id;
    const { room_type, gender_preference, rooms_available, base_price_monthly, notes } = req.body;
    const result = await db.query(
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
      [careHomeId, room_type, gender_preference, rooms_available, base_price_monthly, notes || null, req.user.id]
    );
    return res.status(201).json({ availability: result.rows[0] });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// PUT /me/availability/:id - update a specific availability record
// ---------------------------------------------------------------------------
router.put('/me/availability/:id', authenticate, async (req, res, next) => {
  try {
    const ch = await db.query('SELECT id FROM care_homes WHERE user_id = $1 LIMIT 1', [req.user.id]);
    if (!ch.rows.length) return res.status(404).json({ error: 'Care home profile not found.' });
    const careHomeId = ch.rows[0].id;
    const { room_type, gender_preference, rooms_available, base_price_monthly, notes } = req.body;
    const result = await db.query(
      `UPDATE care_home_availability SET
         room_type=$1, gender_preference=$2, rooms_available=$3,
         base_price_monthly=$4, notes=$5, last_updated_at=NOW(), updated_by_user_id=$6
       WHERE id = $7 AND care_home_id = $8
       RETURNING *`,
      [room_type, gender_preference, rooms_available, base_price_monthly, notes, req.user.id, req.params.id, careHomeId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Record not found.' });
    return res.json({ availability: result.rows[0] });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// DELETE /me/availability/:id - delete a specific availability record
// ---------------------------------------------------------------------------
router.delete('/me/availability/:id', authenticate, async (req, res, next) => {
  try {
    const ch = await db.query('SELECT id FROM care_homes WHERE user_id = $1 LIMIT 1', [req.user.id]);
    if (!ch.rows.length) return res.status(404).json({ error: 'Care home profile not found.' });
    const careHomeId = ch.rows[0].id;
    await db.query(
      'DELETE FROM care_home_availability WHERE id = $1 AND care_home_id = $2 RETURNING id',
      [req.params.id, careHomeId]
    );
    return res.json({ message: 'Deleted.' });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /search - search care homes by patient criteria (placement agents)
// ---------------------------------------------------------------------------
router.get('/search', authenticate, async (req, res, next) => {
  try {
    const { city, zip, gender_preference, room_type, budget_min, budget_max } = req.query;

    const conditions = ['ch.is_active = TRUE'];
    const params = [];

    if (city) {
      params.push(`%${city}%`);
      conditions.push(`ch.city ILIKE $${params.length}`);
    }
    if (zip) {
      params.push(zip);
      conditions.push(`ch.zip = $${params.length}`);
    }

    const hasAvailFilter = gender_preference || room_type || budget_min || budget_max;
    let joinType = hasAvailFilter ? 'INNER JOIN' : 'LEFT JOIN';

    if (gender_preference) {
      params.push(gender_preference);
      conditions.push(`cha.gender_preference = $${params.length}`);
    }
    if (room_type) {
      params.push(room_type);
      conditions.push(`cha.room_type = $${params.length}`);
    }
    if (budget_min) {
      params.push(parseFloat(budget_min));
      conditions.push(`cha.base_price_monthly >= $${params.length}`);
    }
    if (budget_max) {
      params.push(parseFloat(budget_max));
      conditions.push(`cha.base_price_monthly <= $${params.length}`);
    }
    if (hasAvailFilter) {
      conditions.push('cha.rooms_available > 0');
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await db.query(
      `SELECT ch.id, ch.facility_name, ch.address_line1, ch.city, ch.state, ch.zip,
              ch.facility_type, ch.gender_preference, ch.capacity, ch.is_verified,
              cha.room_type, cha.gender_preference AS avail_gender, cha.rooms_available, cha.base_price_monthly,
              array_agg(DISTINCT chs.service_code) FILTER (WHERE chs.id IS NOT NULL) as services
       FROM care_homes ch
       ${joinType} care_home_availability cha ON cha.care_home_id = ch.id
       LEFT JOIN care_home_services chs ON chs.care_home_id = ch.id AND chs.is_available = TRUE
       ${where}
       GROUP BY ch.id, cha.id
       ORDER BY ch.facility_name ASC
       LIMIT 50`,
      params
    );
    return res.json({ careHomes: result.rows, total: result.rows.length });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /:id - get single care home
// ---------------------------------------------------------------------------
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM care_homes WHERE id = $1', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Care home not found.' });
    return res.json({ careHome: result.rows[0] });
  } catch (err) { next(err); }
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

module.exports = router;
