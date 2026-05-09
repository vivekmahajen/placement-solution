'use strict';

const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');

const router = express.Router();

// All admin routes require admin role
router.use(authenticate, requireRole('admin'));

// ---------------------------------------------------------------------------
// GET /dashboard - summary stats
// ---------------------------------------------------------------------------
router.get('/dashboard', async (req, res, next) => {
  try {
    const [users, subs, patients, placements, careHomes, queueLocks] = await Promise.all([
      db.query(`SELECT role, COUNT(*) as count FROM users GROUP BY role`),
      db.query(`
        SELECT status, COUNT(*) as count,
               SUM(monthly_amount) as total_mrr
        FROM subscriptions GROUP BY status`),
      db.query(`SELECT queue_status, COUNT(*) as count FROM patients GROUP BY queue_status`),
      db.query(`SELECT status, COUNT(*) as count FROM placements GROUP BY status`),
      db.query(`SELECT is_verified, is_active, COUNT(*) as count FROM care_homes GROUP BY is_verified, is_active`),
      db.query(`SELECT COUNT(*) as count FROM queue_assignments WHERE status = 'locked'`),
    ]);

    // Calculate MRR from active subscriptions
    const mrrRow = subs.rows.find((r) => r.status === 'active');
    const mrr = mrrRow ? parseFloat(mrrRow.total_mrr || 0) : 0;

    return res.json({
      users: users.rows,
      subscriptions: subs.rows,
      mrr,
      patients: patients.rows,
      placements: placements.rows,
      careHomes: careHomes.rows,
      activeQueueLocks: parseInt(queueLocks.rows[0]?.count || 0),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /users - list all users with subscription status
// ---------------------------------------------------------------------------
router.get('/users', async (req, res, next) => {
  try {
    const { role, status, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (role) {
      conditions.push(`u.role = $${paramIdx}`);
      params.push(role);
      paramIdx++;
    }
    if (status) {
      conditions.push(`u.status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit), offset);

    const result = await db.query(
      `SELECT u.id, u.email, u.role, u.status, u.email_verified, u.last_login_at, u.created_at,
              s.plan_type, s.status as sub_status, s.trial_end_date, s.monthly_amount,
              s.stripe_customer_id
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.id
       ${where}
       ORDER BY u.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      params
    );

    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM users u ${where}`,
      params.slice(0, paramIdx - 1)
    );

    return res.json({
      users: result.rows,
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /users/:id/status - change user status
// ---------------------------------------------------------------------------
router.put('/users/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ['active', 'suspended', 'cancelled', 'pending_verification'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${allowed.join(', ')}.` });
    }

    const result = await db.query(
      'UPDATE users SET status = $1 WHERE id = $2 RETURNING id, email, role, status',
      [status, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found.' });

    await db.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata, ip_address)
       VALUES ($1,'user_status_changed','user',$2,$3,$4)`,
      [req.user.id, id, JSON.stringify({ new_status: status }), req.ip]
    );

    return res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /users/:id/subscription - override subscription status
// ---------------------------------------------------------------------------
router.put('/users/:id/subscription', async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      status, trial_end_date, billing_start_date, monthly_amount, plan_type,
    } = req.body;

    const result = await db.query(
      `UPDATE subscriptions SET
        status = COALESCE($1, status),
        trial_end_date = COALESCE($2, trial_end_date),
        billing_start_date = COALESCE($3, billing_start_date),
        monthly_amount = COALESCE($4, monthly_amount),
        plan_type = COALESCE($5, plan_type)
       WHERE user_id = $6 RETURNING *`,
      [status, trial_end_date, billing_start_date, monthly_amount, plan_type, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Subscription not found.' });

    await db.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata, ip_address)
       VALUES ($1,'subscription_overridden','subscription',$2,$3,$4)`,
      [req.user.id, result.rows[0].id, JSON.stringify({ status, trial_end_date }), req.ip]
    );

    return res.json({ subscription: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /care-homes/pending - care homes pending verification
// ---------------------------------------------------------------------------
router.get('/care-homes/pending', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT ch.*, u.email as user_email
       FROM care_homes ch
       JOIN users u ON u.id = ch.user_id
       WHERE ch.is_verified = FALSE AND ch.is_active = TRUE
       ORDER BY ch.created_at ASC`,
      []
    );
    return res.json({ careHomes: result.rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /care-homes/:id/verify - approve care home
// ---------------------------------------------------------------------------
router.put('/care-homes/:id/verify', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'UPDATE care_homes SET is_verified = TRUE WHERE id = $1 RETURNING *',
      [id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Care home not found.' });

    await db.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
       VALUES ($1,'care_home_verified','care_home',$2,$3)`,
      [req.user.id, id, req.ip]
    );

    return res.json({ careHome: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /queue - full queue overview
// ---------------------------------------------------------------------------
router.get('/queue', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT qa.*,
              p.first_name as patient_first, p.last_name as patient_last,
              p.preferred_city, p.preferred_zip, p.preferred_county, p.queue_status,
              pa.first_name as agent_first, pa.last_name as agent_last, pa.email as agent_email,
              EXTRACT(EPOCH FROM (qa.lock_expires_at - NOW())) / 3600 as hours_remaining
       FROM queue_assignments qa
       JOIN patients p ON p.id = qa.patient_id
       JOIN placement_agents pa ON pa.id = qa.placement_agent_id
       ORDER BY qa.lock_expires_at ASC`,
      []
    );
    return res.json({ queueEntries: result.rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /queue/locks/:id/release - manually release a lock
// ---------------------------------------------------------------------------
router.put('/queue/locks/:id/release', async (req, res, next) => {
  const client = await db.getClient();
  try {
    const { id } = req.params;
    const { reason } = req.body;

    await client.query('BEGIN');

    const lockResult = await client.query(
      `SELECT * FROM queue_assignments WHERE id = $1 AND status = 'locked' FOR UPDATE`,
      [id]
    );
    if (!lockResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Active lock not found.' });
    }
    const lock = lockResult.rows[0];

    await client.query(
      `UPDATE queue_assignments SET status = 'expired', released_at = NOW(),
              outcome_notes = $1 WHERE id = $2`,
      [reason || 'Manually released by admin', id]
    );

    await client.query(
      `UPDATE patients SET queue_status = 'queued' WHERE id = $1`,
      [lock.patient_id]
    );

    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata, ip_address)
       VALUES ($1,'queue_lock_released','queue_assignment',$2,$3,$4)`,
      [req.user.id, id, JSON.stringify({ reason, patient_id: lock.patient_id }), req.ip]
    );

    await client.query('COMMIT');
    return res.json({ message: 'Lock released. Patient returned to queue.' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// GET /audit-log - paginated audit log
// ---------------------------------------------------------------------------
router.get('/audit-log', async (req, res, next) => {
  try {
    const { page = 1, limit = 100, action, entity_type, user_id } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (action) {
      conditions.push(`al.action = $${paramIdx}`);
      params.push(action);
      paramIdx++;
    }
    if (entity_type) {
      conditions.push(`al.entity_type = $${paramIdx}`);
      params.push(entity_type);
      paramIdx++;
    }
    if (user_id) {
      conditions.push(`al.user_id = $${paramIdx}`);
      params.push(user_id);
      paramIdx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit), offset);

    const result = await db.query(
      `SELECT al.*, u.email as user_email, u.role as user_role
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.user_id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      params
    );

    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM audit_log al ${where}`,
      params.slice(0, paramIdx - 1)
    );

    return res.json({
      logs: result.rows,
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
