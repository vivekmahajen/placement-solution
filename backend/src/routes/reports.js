'use strict';

const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');

const router = express.Router();

// All reports require admin role
router.use(authenticate, requireRole('admin'));

/**
 * Build a date range filter clause.
 * Returns { clause, params, nextIdx }
 */
function buildDateRange(startDate, endDate, column, startIdx) {
  const conditions = [];
  const params = [];
  let idx = startIdx;

  if (startDate) {
    conditions.push(`${column} >= $${idx}`);
    params.push(startDate);
    idx++;
  }
  if (endDate) {
    conditions.push(`${column} <= $${idx}`);
    params.push(endDate);
    idx++;
  }

  return { clause: conditions.join(' AND '), params, nextIdx: idx };
}

// ---------------------------------------------------------------------------
// GET /placements-by-zip - Report 1
// ---------------------------------------------------------------------------
router.get('/placements-by-zip', async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    const { clause, params } = buildDateRange(start_date, end_date, 'pl.created_at', 1);
    const where = clause ? `WHERE ${clause}` : '';

    const result = await db.query(
      `SELECT care_home_zip as zip,
              COUNT(*) as total_placements,
              COUNT(CASE WHEN pl.status = 'confirmed' THEN 1 END) as confirmed_placements,
              SUM(pl.monthly_rate) as total_monthly_revenue,
              AVG(pl.monthly_rate) as avg_monthly_rate
       FROM placements pl
       ${where}
       GROUP BY care_home_zip
       ORDER BY total_placements DESC`,
      params
    );
    return res.json({ report: 'placements_by_zip', data: result.rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /placements-by-city - Report 2
// ---------------------------------------------------------------------------
router.get('/placements-by-city', async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    const { clause, params } = buildDateRange(start_date, end_date, 'pl.created_at', 1);
    const where = clause ? `WHERE ${clause}` : '';

    const result = await db.query(
      `SELECT care_home_city as city,
              COUNT(*) as total_placements,
              COUNT(CASE WHEN pl.status = 'confirmed' THEN 1 END) as confirmed_placements,
              SUM(pl.monthly_rate) as total_monthly_revenue,
              AVG(pl.monthly_rate) as avg_monthly_rate,
              COUNT(DISTINCT pl.placement_agent_id) as unique_agents
       FROM placements pl
       ${where}
       GROUP BY care_home_city
       ORDER BY total_placements DESC`,
      params
    );
    return res.json({ report: 'placements_by_city', data: result.rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /placements-by-agent - Report 3
// ---------------------------------------------------------------------------
router.get('/placements-by-agent', async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    const { clause, params } = buildDateRange(start_date, end_date, 'pl.created_at', 1);
    const where = clause ? `WHERE ${clause}` : '';

    const result = await db.query(
      `SELECT pa.id as agent_id,
              pa.first_name, pa.last_name, pa.email, pa.company_name,
              COUNT(pl.id) as total_placements,
              COUNT(CASE WHEN pl.status = 'confirmed' THEN 1 END) as confirmed_placements,
              COUNT(CASE WHEN pl.status = 'cancelled' THEN 1 END) as cancelled_placements,
              SUM(CASE WHEN pl.status = 'confirmed' THEN pl.monthly_rate ELSE 0 END) as confirmed_monthly_revenue,
              ROUND(AVG(EXTRACT(EPOCH FROM (pl.updated_at - pl.created_at)) / 86400), 1) as avg_days_to_confirm
       FROM placement_agents pa
       LEFT JOIN placements pl ON pl.placement_agent_id = pa.id
       ${clause ? `AND ${clause}` : ''}
       GROUP BY pa.id
       ORDER BY confirmed_placements DESC`,
      params
    );
    return res.json({ report: 'placements_by_agent', data: result.rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /placements-by-referral - Report 4
// ---------------------------------------------------------------------------
router.get('/placements-by-referral', async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    const { clause, params } = buildDateRange(start_date, end_date, 'pl.created_at', 1);
    const where = clause ? `WHERE ${clause}` : '';

    const result = await db.query(
      `SELECT ra.id as referral_agent_id,
              ra.first_name, ra.last_name, ra.email, ra.company_name,
              COUNT(pl.id) as total_placements,
              COUNT(CASE WHEN pl.status = 'confirmed' THEN 1 END) as confirmed_placements,
              COUNT(DISTINCT pl.patient_id) as unique_patients_placed
       FROM referral_agents ra
       LEFT JOIN placements pl ON pl.referral_agent_id = ra.id
       ${clause ? `AND ${clause}` : ''}
       GROUP BY ra.id
       ORDER BY confirmed_placements DESC`,
      params
    );
    return res.json({ report: 'placements_by_referral', data: result.rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /queue-performance - Report 5
// ---------------------------------------------------------------------------
router.get('/queue-performance', async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    const { clause, params } = buildDateRange(start_date, end_date, 'qa.created_at', 1);
    const where = clause ? `WHERE ${clause}` : '';

    const result = await db.query(
      `SELECT
         COUNT(*) as total_locks,
         COUNT(CASE WHEN qa.status = 'completed' THEN 1 END) as completed_locks,
         COUNT(CASE WHEN qa.status = 'expired' THEN 1 END) as expired_locks,
         COUNT(CASE WHEN qa.status = 'failed' THEN 1 END) as failed_locks,
         COUNT(CASE WHEN qa.status = 'locked' THEN 1 END) as active_locks,
         ROUND(
           100.0 * COUNT(CASE WHEN qa.status = 'completed' THEN 1 END) / NULLIF(COUNT(*), 0),
           2
         ) as completion_rate_pct,
         ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(qa.released_at, NOW()) - qa.locked_at)) / 3600), 1) as avg_lock_hours
       FROM queue_assignments qa
       ${where}`,
      params
    );

    // Also get per-agent breakdown
    const agentResult = await db.query(
      `SELECT
         pa.first_name, pa.last_name, pa.email,
         COUNT(qa.id) as total_locks,
         COUNT(CASE WHEN qa.status = 'completed' THEN 1 END) as completed,
         COUNT(CASE WHEN qa.status = 'expired' THEN 1 END) as expired
       FROM placement_agents pa
       LEFT JOIN queue_assignments qa ON qa.placement_agent_id = pa.id
       ${clause ? `AND ${clause}` : ''}
       GROUP BY pa.id
       ORDER BY completed DESC`,
      params
    );

    return res.json({
      report: 'queue_performance',
      summary: result.rows[0],
      byAgent: agentResult.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /lock-failure-rate - Report 6
// ---------------------------------------------------------------------------
router.get('/lock-failure-rate', async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    const { clause, params } = buildDateRange(start_date, end_date, 'qa.created_at', 1);
    const where = clause ? `WHERE ${clause}` : '';

    const result = await db.query(
      `SELECT
         DATE_TRUNC('week', qa.created_at) as week_start,
         COUNT(*) as total_locks,
         COUNT(CASE WHEN qa.status = 'expired' THEN 1 END) as expired_locks,
         COUNT(CASE WHEN qa.status = 'failed' THEN 1 END) as failed_locks,
         ROUND(
           100.0 * (
             COUNT(CASE WHEN qa.status IN ('expired','failed') THEN 1 END)
           ) / NULLIF(COUNT(*), 0),
           2
         ) as failure_rate_pct
       FROM queue_assignments qa
       ${where}
       GROUP BY week_start
       ORDER BY week_start DESC`,
      params
    );

    return res.json({ report: 'lock_failure_rate', data: result.rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /revenue - Report 7
// ---------------------------------------------------------------------------
router.get('/revenue', async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    const { clause, params } = buildDateRange(start_date, end_date, 's.created_at', 1);
    const where = clause ? `WHERE ${clause}` : '';

    // Subscription revenue breakdown
    const subRevenue = await db.query(
      `SELECT
         plan_type,
         status,
         COUNT(*) as subscriber_count,
         SUM(monthly_amount) as monthly_revenue,
         SUM(monthly_amount) * 12 as annual_run_rate
       FROM subscriptions s
       ${where}
       GROUP BY plan_type, status
       ORDER BY plan_type, status`,
      params
    );

    // Total MRR (active subscriptions only)
    const mrr = await db.query(
      `SELECT
         SUM(monthly_amount) as total_mrr,
         COUNT(*) as total_active_subscribers
       FROM subscriptions
       WHERE status = 'active'`
    );

    // Trial conversion counts
    const trialStats = await db.query(
      `SELECT
         plan_type,
         COUNT(CASE WHEN status = 'trial' THEN 1 END) as in_trial,
         COUNT(CASE WHEN status = 'active' THEN 1 END) as converted,
         COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
       FROM subscriptions
       GROUP BY plan_type`
    );

    return res.json({
      report: 'revenue',
      mrr: mrr.rows[0],
      byPlan: subRevenue.rows,
      trialConversion: trialStats.rows,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
