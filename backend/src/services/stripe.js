'use strict';

const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-04-10',
});

/**
 * Monthly amounts in USD for each plan type.
 */
const MONTHLY_AMOUNTS = {
  care_home: 49,
  placement_agent: 99,
  referral_agent: 19,
};

/**
 * Map role/plan_type to Stripe Price ID from environment variables.
 */
const STRIPE_PRICE_IDS = {
  care_home: process.env.STRIPE_PRICE_CARE_HOME,
  placement_agent: process.env.STRIPE_PRICE_PLACEMENT_AGENT,
  referral_agent: process.env.STRIPE_PRICE_REFERRAL_AGENT,
};

// ---------------------------------------------------------------------------
// createCustomer
// Creates a Stripe customer for the given user.
//
// @param {Object} user - User record with email, id
// @returns {Promise<Stripe.Customer>}
// ---------------------------------------------------------------------------
async function createCustomer(user) {
  const customer = await stripe.customers.create({
    email: user.email,
    metadata: {
      user_id: user.id,
      role: user.role,
    },
  });
  return customer;
}

// ---------------------------------------------------------------------------
// createCheckoutSession
// Creates a Stripe Checkout session for a subscription.
//
// @param {Object} user         - User record
// @param {Object} subscription - Local subscription record
// @returns {Promise<Stripe.Checkout.Session>}
// ---------------------------------------------------------------------------
async function createCheckoutSession(user, subscription) {
  const planType = subscription.plan_type || user.role;
  const priceId = STRIPE_PRICE_IDS[planType];

  if (!priceId) {
    throw new Error(`No Stripe Price ID configured for plan type: ${planType}`);
  }

  // Create or retrieve Stripe customer
  let customerId = subscription.stripe_customer_id;
  if (!customerId) {
    const customer = await createCustomer(user);
    customerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `${process.env.APP_URL}/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.APP_URL}/dashboard/billing?cancelled=true`,
    metadata: {
      user_id: user.id,
      subscription_id: subscription.id,
    },
    subscription_data: {
      metadata: {
        user_id: user.id,
        plan_type: planType,
      },
    },
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    customer_update: {
      address: 'auto',
    },
  });

  return session;
}

// ---------------------------------------------------------------------------
// createBillingPortalSession
// Creates a Stripe billing portal session so users can manage their subscription.
//
// @param {string} stripeCustomerId - Stripe customer ID
// @param {string} returnUrl        - URL to return to after portal
// @returns {Promise<Stripe.BillingPortal.Session>}
// ---------------------------------------------------------------------------
async function createBillingPortalSession(stripeCustomerId, returnUrl) {
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl || `${process.env.APP_URL}/dashboard/billing`,
  });
  return session;
}

// ---------------------------------------------------------------------------
// handleWebhook
// Validates the Stripe webhook signature and constructs the event.
// Must be called with the raw request body (Buffer), not parsed JSON.
//
// @param {Buffer} rawBody  - Raw request body from express
// @param {string} signature - Value of stripe-signature header
// @returns {Stripe.Event}
// @throws {Error} if signature validation fails
// ---------------------------------------------------------------------------
function handleWebhook(rawBody, signature) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured.');
  }

  const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  return event;
}

module.exports = {
  stripe,
  createCustomer,
  createCheckoutSession,
  createBillingPortalSession,
  handleWebhook,
  MONTHLY_AMOUNTS,
  STRIPE_PRICE_IDS,
};
