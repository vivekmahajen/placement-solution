'use strict';

const cron = require('node-cron');
const db = require('../db');
const { sendLockExpiryWarning, sendTrialExpiryWarning, sendEmail } = require('./email');
const { runQueueNotification } = require('./ai');

// In-memory sets to track warnings sent per queue_assignment id.
// NOTE: These are reset on server restart. The queue_assignments table has
// warning_sent_24h and warning_sent_2h columns for durability in production.
const warned24h = new Set();
const warned2h = new Set();

// ---------------------------------------------------------------------------
// processExpiredLocks
// Finds expired queue locks, releases them, and returns patients to queue.
// Also sends warnings for locks nearing expiry.
// ---------------------------------------------------------------------------
async function processExpiredLocks() {
  console.log('[QueueJobs] Running lock expiry check...');
  try {
    // ---- 1. Expire overdue locks ----
    const expiredResult = await db.query(
      `SELECT qa.id as assignment_id,
              qa.patient_id, qa.placement_agent_id,
              qa.lock_expires_at,
              p.first_name as patient_first, p.last_name as patient_last,
              pa.first_name as agent_first, pa.last_name as agent_last, pa.email as agent_email
       FROM queue_assignments qa
       JOIN patients p ON p.id = qa.patient_id
       JOIN placement_agents pa ON pa.id = qa.placement_agent_id
       WHERE qa.status = 'locked' AND qa.lock_expires_at <= NOW()`,
      []
    );

    for (const row of expiredResult.rows) {
      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE queue_assignments SET status = 'expired', released_at = NOW()
           WHERE id = $1`,
          [row.assignment_id]
        );
        await client.query(
          `UPDATE patients SET queue_status = 'queued' WHERE id = $1`,
          [row.patient_id]
        );
        await client.query(
          `INSERT INTO audit_log (action, entity_type, entity_id, metadata)
           VALUES ('queue_lock_expired','queue_assignment',$1,$2)`,
          [row.assignment_id, JSON.stringify({ patient_id: row.patient_id, agent_id: row.placement_agent_id })]
        );
        await client.query('COMMIT');

        // Send notification (non-blocking)
        runQueueNotification({
          type: 'lock_expired',
          agent: { first_name: row.agent_first, last_name: row.agent_last },
          patient: { first_name: row.patient_first, last_name: row.patient_last },
        }).then((message) => {
          sendEmail({
            to: row.agent_email,
            subject: `Lock Expired – ${row.patient_first} ${row.patient_last}`,
            text: message,
          }).catch((err) => console.error('[QueueJobs] Email error (expired):', err));
        }).catch((err) => console.error('[QueueJobs] AI notification error:', err));

        // Remove from warning tracking
        warned24h.delete(row.assignment_id);
        warned2h.delete(row.assignment_id);

        console.log(`[QueueJobs] Lock expired: assignment ${row.assignment_id}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[QueueJobs] Error expiring lock ${row.assignment_id}:`, err);
      } finally {
        client.release();
      }
    }

    // ---- 2. Check active locks for approaching expiry ----
    const activeResult = await db.query(
      `SELECT qa.id as assignment_id,
              qa.patient_id, qa.placement_agent_id,
              qa.lock_expires_at, qa.warning_sent_24h, qa.warning_sent_2h,
              EXTRACT(EPOCH FROM (qa.lock_expires_at - NOW())) / 3600 as hours_remaining,
              p.first_name as patient_first, p.last_name as patient_last,
              pa.first_name as agent_first, pa.last_name as agent_last, pa.email as agent_email
       FROM queue_assignments qa
       JOIN patients p ON p.id = qa.patient_id
       JOIN placement_agents pa ON pa.id = qa.placement_agent_id
       WHERE qa.status = 'locked' AND qa.lock_expires_at > NOW()`,
      []
    );

    for (const row of activeResult.rows) {
      const hoursRemaining = parseFloat(row.hours_remaining);
      const agentInfo = { first_name: row.agent_first, last_name: row.agent_last, email: row.agent_email };
      const patientInfo = { first_name: row.patient_first, last_name: row.patient_last };

      // Send 24h warning
      if (hoursRemaining <= 24 && hoursRemaining > 2) {
        const alreadyWarned = row.warning_sent_24h || warned24h.has(row.assignment_id);
        if (!alreadyWarned) {
          warned24h.add(row.assignment_id);
          await db.query(
            'UPDATE queue_assignments SET warning_sent_24h = TRUE WHERE id = $1',
            [row.assignment_id]
          );
          sendLockExpiryWarning(agentInfo, patientInfo, 24)
            .catch((err) => console.error('[QueueJobs] 24h warning email error:', err));
          console.log(`[QueueJobs] Sent 24h warning for assignment ${row.assignment_id}`);
        }
      }

      // Send 2h warning
      if (hoursRemaining <= 2 && hoursRemaining > 0) {
        const alreadyWarned = row.warning_sent_2h || warned2h.has(row.assignment_id);
        if (!alreadyWarned) {
          warned2h.add(row.assignment_id);
          await db.query(
            'UPDATE queue_assignments SET warning_sent_2h = TRUE WHERE id = $1',
            [row.assignment_id]
          );
          sendLockExpiryWarning(agentInfo, patientInfo, 2)
            .catch((err) => console.error('[QueueJobs] 2h warning email error:', err));
          console.log(`[QueueJobs] Sent 2h warning for assignment ${row.assignment_id}`);
        }
      }
    }
  } catch (err) {
    console.error('[QueueJobs] processExpiredLocks error:', err);
  }
}

// ---------------------------------------------------------------------------
// processTrialExpiryWarnings
// Sends trial expiry warnings to users whose trial ends in 30, 14, or 7 days.
// ---------------------------------------------------------------------------
async function processTrialExpiryWarnings() {
  console.log('[QueueJobs] Running trial expiry check...');
  try {
    const warningDays = [30, 14, 7];

    for (const days of warningDays) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + days);
      const dateStr = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD

      const result = await db.query(
        `SELECT u.id, u.email, u.role, s.trial_end_date, s.status as sub_status
         FROM subscriptions s
         JOIN users u ON u.id = s.user_id
         WHERE s.trial_end_date = $1
           AND s.status = 'trial'
           AND u.status = 'active'`,
        [dateStr]
      );

      for (const user of result.rows) {
        sendTrialExpiryWarning(user, days)
          .then(() => {
            console.log(`[QueueJobs] Sent ${days}-day trial warning to ${user.email}`);
          })
          .catch((err) => {
            console.error(`[QueueJobs] Trial warning email error for ${user.email}:`, err);
          });
      }
    }
  } catch (err) {
    console.error('[QueueJobs] processTrialExpiryWarnings error:', err);
  }
}

// ---------------------------------------------------------------------------
// startQueueJobs
// Registers all cron jobs. Call once on server startup.
// ---------------------------------------------------------------------------
function startQueueJobs() {
  // Every 15 minutes: check for expired/expiring locks
  cron.schedule('*/15 * * * *', processExpiredLocks, {
    scheduled: true,
    timezone: 'America/New_York',
  });

  // Daily at 8:00 AM ET: check trial expirations
  cron.schedule('0 8 * * *', processTrialExpiryWarnings, {
    scheduled: true,
    timezone: 'America/New_York',
  });

  console.log('[QueueJobs] Cron jobs started: lock expiry (*/15 min), trial warnings (daily 8am ET)');
}

module.exports = { startQueueJobs, processExpiredLocks, processTrialExpiryWarnings };
