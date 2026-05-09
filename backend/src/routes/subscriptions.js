'use strict';

const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const {
  createCheckoutSession,
  createBillingPortalSession,
  handleWebhook,
} = require('../services/stripe');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /my - get my subscription
// ---------------------------------------------------------------------------
router.get('/my', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'No subscription found.' });
    }
    return res.json({ subscription: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /checkout - create Stripe checkout session
// ---------------------------------------------------------------------------
router.post('/checkout', authenticate, async (req, res, next) => {
  try {
    const userResult = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = userResult.rows[0];

    const subResult = await db.query(
      'SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    );
    if (!subResult.rows.length) {
      return res.status(400).json({ error: 'No subscription record found.' });
    }
    const subscription = subResult.rows[0];

    if (subscription.status === 'active') {
      return res.status(409).json({ error: 'Subscription is already active.' });
    }

    const session = await createCheckoutSession(user, subscription);
    return res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /webhook - handle Stripe webhooks (raw body)
// ---------------------------------------------------------------------------
router.post('/webhook', async (req, res, next) => {
  const signature = req.headers['stripe-signature'];
  if (!signature) {
    return res.status(400).json({ error: 'Missing stripe-signature header.' });
  }

  let event;
  try {
    event = handleWebhook(req.body, signature);
  } catch (err) {
    console.error('Stripe webhook error:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const stripeSubId = invoice.subscription;
        if (stripeSubId) {
          await db.query(
            `UPDATE subscriptions SET status = 'active', billing_start_date = CURRENT_DATE
             WHERE stripe_sub_id = $1`,
            [stripeSubId]
          );
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const stripeSubId = invoice.subscription;
        if (stripeSubId) {
          await db.query(
            `UPDATE subscriptions SET status = 'past_due' WHERE stripe_sub_id = $1`,
            [stripeSubId]
          );
        }
        break;
      }

      case 'customer.subscription.updated': {
        const stripeSub = event.data.object;
        const statusMap = {
          active: 'active',
          past_due: 'past_due',
          canceled: 'cancelled',
          paused: 'paused',
          trialing: 'trial',
        };
        const mappedStatus = statusMap[stripeSub.status] || 'active';
        await db.query(
          `UPDATE subscriptions SET status = $1 WHERE stripe_sub_id = $2`,
          [mappedStatus, stripeSub.id]
        );
        break;
      }

      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object;
        await db.query(
          `UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW()
           WHERE stripe_sub_id = $1`,
          [stripeSub.id]
        );
        // Suspend user account
        await db.query(
          `UPDATE users SET status = 'suspended'
           WHERE id = (SELECT user_id FROM subscriptions WHERE stripe_sub_id = $1)`,
          [stripeSub.id]
        );
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object;
        const stripeCustomerId = session.customer;
        const stripeSubId = session.subscription;

        if (stripeCustomerId && stripeSubId) {
          await db.query(
            `UPDATE subscriptions SET
               stripe_customer_id = $1,
               stripe_sub_id = $2,
               status = 'active',
               billing_start_date = CURRENT_DATE
             WHERE id = (
               SELECT s.id FROM subscriptions s
               JOIN users u ON u.id = s.user_id
               WHERE u.email = $3
               ORDER BY s.created_at DESC LIMIT 1
             )`,
            [stripeCustomerId, stripeSubId, session.customer_details?.email || '']
          );
        }
        break;
      }

      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }

    return res.json({ received: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /cancel - cancel subscription
// ---------------------------------------------------------------------------
router.post('/cancel', authenticate, async (req, res, next) => {
  try {
    const subResult = await db.query(
      `SELECT * FROM subscriptions WHERE user_id = $1 AND status IN ('active','trial')
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );
    if (!subResult.rows.length) {
      return res.status(404).json({ error: 'No active subscription to cancel.' });
    }
    const subscription = subResult.rows[0];

    // Cancel in Stripe if applicable
    if (subscription.stripe_sub_id) {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      await stripe.subscriptions.cancel(subscription.stripe_sub_id);
    }

    await db.query(
      `UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`,
      [subscription.id]
    );

    await db.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
       VALUES ($1,'subscription_cancelled','subscription',$2,$3)`,
      [req.user.id, subscription.id, req.ip]
    );

    return res.json({ message: 'Subscription cancelled.' });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /billing-portal - create Stripe billing portal session
// ---------------------------------------------------------------------------
router.get('/billing-portal', authenticate, async (req, res, next) => {
  try {
    const subResult = await db.query(
      `SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );
    if (!subResult.rows.length || !subResult.rows[0].stripe_customer_id) {
      return res.status(400).json({ error: 'No Stripe customer on file. Please subscribe first.' });
    }

    const returnUrl = `${process.env.APP_URL}/dashboard/billing`;
    const session = await createBillingPortalSession(subResult.rows[0].stripe_customer_id, returnUrl);
    return res.json({ portalUrl: session.url });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
