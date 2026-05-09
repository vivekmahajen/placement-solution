'use strict';

const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const FROM = {
  email: process.env.EMAIL_FROM || 'noreply@careconnect.com',
  name: process.env.EMAIL_FROM_NAME || 'CareConnect',
};

// ---------------------------------------------------------------------------
// sendEmail
// Base function to send an email via SendGrid.
//
// @param {Object} opts
// @param {string|string[]} opts.to      - Recipient email(s)
// @param {string}          opts.subject - Email subject
// @param {string}          [opts.html]  - HTML body
// @param {string}          [opts.text]  - Plain text body
// @returns {Promise<void>}
// ---------------------------------------------------------------------------
async function sendEmail({ to, subject, html, text }) {
  const msg = {
    to,
    from: FROM,
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
  };

  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    console.log(`[EMAIL] To: ${to} | Subject: ${subject}`);
    return;
  }

  await sgMail.send(msg);
}

// ---------------------------------------------------------------------------
// sendWelcomeEmail
// Sends a welcome email with trial information to a new user.
//
// @param {Object} user - User record { email, role }
// @returns {Promise<void>}
// ---------------------------------------------------------------------------
async function sendWelcomeEmail(user) {
  const roleLabels = {
    care_home: 'Care Home',
    placement_agent: 'Placement Agent',
    referral_agent: 'Referral Agent',
  };
  const roleLabel = roleLabels[user.role] || user.role;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #2563eb;">Welcome to CareConnect!</h1>
      <p>Thank you for registering as a <strong>${roleLabel}</strong>.</p>
      <p>Your account is now active with a <strong>180-day free trial</strong>. No credit card required during your trial period.</p>
      <h2>What's next?</h2>
      <ul>
        <li>Complete your profile</li>
        <li>Explore the platform features</li>
        <li>Connect with care homes and agents in your area</li>
      </ul>
      <p>If you have any questions, please contact us at <a href="mailto:support@careconnect.com">support@careconnect.com</a>.</p>
      <p>Best regards,<br>The CareConnect Team</p>
    </div>
  `;

  await sendEmail({
    to: user.email,
    subject: 'Welcome to CareConnect – Your 180-Day Trial Has Begun',
    html,
    text: `Welcome to CareConnect! Your 180-day free trial has begun. Log in to complete your profile and start using the platform.`,
  });
}

// ---------------------------------------------------------------------------
// sendTrialExpiryWarning
// Sends a trial expiry warning email.
//
// @param {Object} user     - User record
// @param {number} daysLeft - Number of days remaining in the trial
// @returns {Promise<void>}
// ---------------------------------------------------------------------------
async function sendTrialExpiryWarning(user, daysLeft) {
  const urgencyText = daysLeft <= 7 ? 'urgent' : 'important';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #dc2626;">Trial Expiring in ${daysLeft} Day${daysLeft === 1 ? '' : 's'}</h1>
      <p>This is an ${urgencyText} reminder that your CareConnect free trial expires in <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong>.</p>
      <p>To continue using CareConnect without interruption, please subscribe before your trial ends.</p>
      <div style="margin: 24px 0;">
        <a href="${process.env.APP_URL}/dashboard/billing"
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          Subscribe Now
        </a>
      </div>
      <p>Questions? Contact us at <a href="mailto:support@careconnect.com">support@careconnect.com</a>.</p>
    </div>
  `;

  await sendEmail({
    to: user.email,
    subject: `Action Required: Your CareConnect Trial Expires in ${daysLeft} Day${daysLeft === 1 ? '' : 's'}`,
    html,
    text: `Your CareConnect trial expires in ${daysLeft} days. Subscribe at ${process.env.APP_URL}/dashboard/billing to continue.`,
  });
}

// ---------------------------------------------------------------------------
// sendLockExpiryWarning
// Sends a warning to a placement agent that their patient lock is expiring.
//
// @param {Object} agent      - Placement agent record
// @param {Object} patient    - Patient record
// @param {number} hoursLeft  - Hours remaining on the lock
// @returns {Promise<void>}
// ---------------------------------------------------------------------------
async function sendLockExpiryWarning(agent, patient, hoursLeft) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #d97706;">Patient Lock Expiring in ${hoursLeft} Hour${hoursLeft === 1 ? '' : 's'}</h1>
      <p>Hello ${agent.first_name},</p>
      <p>Your lock on patient <strong>${patient.first_name} ${patient.last_name}</strong> will expire in
         <strong>${hoursLeft} hour${hoursLeft === 1 ? '' : 's'}</strong>.</p>
      <p>If you have not yet completed the placement, please log in to your dashboard immediately to take action.
         If the lock expires, this patient will return to the general queue and may be picked up by another agent.</p>
      <div style="margin: 24px 0;">
        <a href="${process.env.APP_URL}/dashboard/queue"
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          Go to My Queue
        </a>
      </div>
    </div>
  `;

  await sendEmail({
    to: agent.email,
    subject: `Urgent: Patient Lock Expiring in ${hoursLeft} Hour${hoursLeft === 1 ? '' : 's'} – ${patient.first_name} ${patient.last_name}`,
    html,
    text: `Your lock on ${patient.first_name} ${patient.last_name} expires in ${hoursLeft} hours. Log in to complete the placement: ${process.env.APP_URL}/dashboard/queue`,
  });
}

// ---------------------------------------------------------------------------
// sendPlacementConfirmed
// Notifies the referral agent that a placement has been confirmed.
//
// @param {Object} referralAgent - Referral agent record
// @param {Object} patient       - Patient record
// @param {Object} careHome      - Care home record
// @returns {Promise<void>}
// ---------------------------------------------------------------------------
async function sendPlacementConfirmed(referralAgent, patient, careHome) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #16a34a;">Placement Confirmed</h1>
      <p>Hello ${referralAgent.first_name},</p>
      <p>We are pleased to inform you that a placement has been confirmed for your patient
         <strong>${patient.first_name} ${patient.last_name}</strong>.</p>
      <h2>Placement Details</h2>
      <table style="border-collapse: collapse; width: 100%;">
        <tr>
          <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Care Home</strong></td>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${careHome.facility_name}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Location</strong></td>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${careHome.city}, ${careHome.state}</td>
        </tr>
      </table>
      <p>Please log in to CareConnect for full details.</p>
      <div style="margin: 24px 0;">
        <a href="${process.env.APP_URL}/dashboard/placements"
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          View Placement
        </a>
      </div>
    </div>
  `;

  await sendEmail({
    to: referralAgent.email,
    subject: `Placement Confirmed – ${patient.first_name} ${patient.last_name}`,
    html,
    text: `Placement confirmed for ${patient.first_name} ${patient.last_name} at ${careHome.facility_name}, ${careHome.city}, ${careHome.state}.`,
  });
}

// ---------------------------------------------------------------------------
// sendAgreementSignRequest
// Sends an agreement signing request email with a secure link.
//
// @param {Object} recipient  - { email, name }
// @param {string} signUrl    - URL to the signing page
// @returns {Promise<void>}
// ---------------------------------------------------------------------------
async function sendAgreementSignRequest(recipient, signUrl) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #2563eb;">Placement Agreement – Signature Required</h1>
      <p>Hello ${recipient.name || 'there'},</p>
      <p>A placement agreement requires your electronic signature. Please review the document and sign using the link below.</p>
      <p><strong>Important:</strong> This signing link will expire in <strong>72 hours</strong>.</p>
      <div style="margin: 24px 0;">
        <a href="${signUrl}"
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          Review & Sign Agreement
        </a>
      </div>
      <p>If the button above doesn't work, copy and paste this URL into your browser:</p>
      <p style="word-break: break-all; color: #6b7280;">${signUrl}</p>
      <p>If you have questions about this agreement, please contact your placement agent.</p>
    </div>
  `;

  await sendEmail({
    to: recipient.email,
    subject: 'Action Required: Please Sign Your Placement Agreement',
    html,
    text: `Please sign your placement agreement at: ${signUrl} (expires in 72 hours)`,
  });
}

// ---------------------------------------------------------------------------
// sendFamilyNotification
// Sends a care home options notification email to the patient's family.
//
// @param {string} familyEmail        - Family member's email address
// @param {string} notificationHtml   - HTML content (from AI service)
// @returns {Promise<void>}
// ---------------------------------------------------------------------------
async function sendFamilyNotification(familyEmail, notificationHtml) {
  await sendEmail({
    to: familyEmail,
    subject: 'Care Home Options Selected for Your Loved One – CareConnect',
    html: notificationHtml,
    text: 'Care home options have been selected for your family member. Please contact your placement agent for details.',
  });
}

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendTrialExpiryWarning,
  sendLockExpiryWarning,
  sendPlacementConfirmed,
  sendAgreementSignRequest,
  sendFamilyNotification,
};
