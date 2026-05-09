'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const {
  PATIENT_INTAKE_PROMPT,
  CARE_HOME_SEARCH_PROMPT,
  AGREEMENT_GENERATION_PROMPT,
  FAMILY_NOTIFICATION_PROMPT,
  LOCK_EXPIRY_NOTIFICATION_PROMPT,
} = require('../prompts');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ---------------------------------------------------------------------------
// runPatientIntakeChat
// Conducts a guided patient intake conversation using claude-sonnet-4-20250514.
// Uses prompt caching on the system prompt to reduce cost.
//
// @param {Array} conversationHistory - Array of { role, content } messages
// @returns {Promise<string>} - The assistant's response text
// ---------------------------------------------------------------------------
async function runPatientIntakeChat(conversationHistory) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: PATIENT_INTAKE_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: conversationHistory,
  });

  return response.content[0].text;
}

// ---------------------------------------------------------------------------
// runCareHomeSearchExplanation
// Explains match scores in plain language for families/agents.
//
// @param {Object} patient - Patient record
// @param {Array}  matches - Array of care home match objects with match_score and match_reasons
// @returns {Promise<string>} - Plain language explanation
// ---------------------------------------------------------------------------
async function runCareHomeSearchExplanation(patient, matches) {
  const matchSummary = matches.map((m, i) =>
    `${i + 1}. ${m.facility_name} (${m.city}, ${m.state})
   Score: ${m.match_score}/100
   Reasons: ${Array.isArray(m.match_reasons) ? m.match_reasons.join(', ') : m.match_reasons}
   Price: $${m.base_price_monthly}/month
   Room: ${m.room_type}`
  ).join('\n\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: [
      {
        type: 'text',
        text: CARE_HOME_SEARCH_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Patient: ${patient.first_name} ${patient.last_name}
Budget: $${patient.budget_min || 0} - $${patient.budget_max || 'open'}/month
Preferred Location: ${patient.preferred_city || patient.preferred_zip || patient.preferred_county || 'Not specified'}
Room Preference: ${patient.room_type_preference}

Top Care Home Matches:
${matchSummary}

Please explain these match results in plain, compassionate language suitable for a family member.`,
      },
    ],
  });

  return response.content[0].text;
}

// ---------------------------------------------------------------------------
// generateAgreementText
// Generates formal placement agreement text.
//
// @param {Object} placement      - Placement record
// @param {Object} agent          - Placement agent record
// @param {Object} referralAgent  - Referral agent record
// @param {Array}  careHomes      - Selected care homes (up to 3)
// @returns {Promise<string>} - Agreement document text (HTML or Markdown)
// ---------------------------------------------------------------------------
async function generateAgreementText(placement, agent, referralAgent, careHomes) {
  const careHomeList = careHomes.map((ch, i) =>
    `Option ${i + 1}: ${ch.facility_name || ch.care_home_name || 'Care Home'}, ${ch.city || ''}, ${ch.state || ''}`
  ).join('\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: [
      {
        type: 'text',
        text: AGREEMENT_GENERATION_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Generate a placement agreement with the following details:

Patient: ${placement.patient_first || ''} ${placement.patient_last || ''}
Placement Agent: ${agent.agent_first || agent.first_name || ''} ${agent.agent_last || agent.last_name || ''}
Referral Agent: ${referralAgent.ref_first || referralAgent.first_name || ''} ${referralAgent.ref_last || referralAgent.last_name || ''}
Monthly Rate: $${placement.monthly_rate || 'TBD'}
Room Type: ${placement.room_type || 'TBD'}
Move-in Date: ${placement.move_in_date || 'TBD'}

Selected Care Homes:
${careHomeList}

Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
      },
    ],
  });

  return response.content[0].text;
}

// ---------------------------------------------------------------------------
// generateFamilyNotificationEmail
// Generates a family notification email with selected care home options.
//
// @param {Object} patient    - Patient record
// @param {Array}  careHomes  - Selected care homes
// @param {Object} agent      - Placement agent record
// @returns {Promise<string>} - HTML email content
// ---------------------------------------------------------------------------
async function generateFamilyNotificationEmail(patient, careHomes, agent) {
  const careHomeDetails = careHomes.map((ch, i) =>
    `Option ${i + 1}:
  Name: ${ch.facility_name}
  Address: ${ch.address_line1 || ''}, ${ch.city}, ${ch.state}
  Monthly Rate: $${ch.base_price_monthly || ch.monthly_rate}/month
  Room Type: ${ch.room_type}
  Score: ${ch.match_score}/100`
  ).join('\n\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: [
      {
        type: 'text',
        text: FAMILY_NOTIFICATION_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Generate a family notification email for the following placement:

Patient: ${patient.first_name} ${patient.last_name}
Placement Agent: ${agent.first_name} ${agent.last_name} (${agent.email})

Selected Care Home Options:
${careHomeDetails}

Write the email in HTML format, warm and reassuring in tone.`,
      },
    ],
  });

  return response.content[0].text;
}

// ---------------------------------------------------------------------------
// runQueueNotification
// Generates automated queue/lock notification messages using claude-haiku.
// Uses a faster, cheaper model for operational notifications.
//
// @param {Object} data - Notification context data
// @returns {Promise<string>} - Notification message text
// ---------------------------------------------------------------------------
async function runQueueNotification(data) {
  const { type, agent, patient, hoursRemaining } = data;

  let userMessage = '';
  if (type === 'lock_expiry') {
    userMessage = `Generate a ${hoursRemaining}-hour lock expiry warning for:
Agent: ${agent.first_name} ${agent.last_name}
Patient: ${patient.first_name} ${patient.last_name}
Lock expires in: ${hoursRemaining} hours
Remind them to complete the placement or the patient will return to the queue.`;
  } else if (type === 'lock_expired') {
    userMessage = `Generate a lock expiry notification for:
Agent: ${agent.first_name} ${agent.last_name}
Patient: ${patient.first_name} ${patient.last_name}
The lock has expired and the patient has returned to the queue.`;
  } else {
    userMessage = `Generate a queue notification for: ${JSON.stringify(data)}`;
  }

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: [
      {
        type: 'text',
        text: LOCK_EXPIRY_NOTIFICATION_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: userMessage,
      },
    ],
  });

  return response.content[0].text;
}

module.exports = {
  runPatientIntakeChat,
  runCareHomeSearchExplanation,
  generateAgreementText,
  generateFamilyNotificationEmail,
  runQueueNotification,
};
