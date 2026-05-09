'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const { sendAgreementSignRequest } = require('../services/email');
const { generateAgreementText } = require('../services/ai');

const router = express.Router();

// ---------------------------------------------------------------------------
// POST / - generate agreement for a placement
// ---------------------------------------------------------------------------
router.post('/', authenticate, requireRole('placement_agent', 'admin'), async (req, res, next) => {
  try {
    const { placement_id, document_type = 'placement_agreement', signer_email, signer_name } = req.body;

    if (!placement_id) {
      return res.status(400).json({ error: 'placement_id is required.' });
    }

    // Fetch placement
    const placementResult = await db.query(
      `SELECT pl.*, p.first_name as patient_first, p.last_name as patient_last,
              pa.first_name as agent_first, pa.last_name as agent_last,
              ra.first_name as ref_first, ra.last_name as ref_last,
              ch.facility_name, ch.address_line1, ch.city, ch.state
       FROM placements pl
       JOIN patients p ON p.id = pl.patient_id
       JOIN placement_agents pa ON pa.id = pl.placement_agent_id
       JOIN referral_agents ra ON ra.id = pl.referral_agent_id
       JOIN care_homes ch ON ch.id = pl.care_home_id
       WHERE pl.id = $1`,
      [placement_id]
    );
    if (!placementResult.rows.length) {
      return res.status(404).json({ error: 'Placement not found.' });
    }
    const placement = placementResult.rows[0];

    // Verify at least 3 care home matches are selected
    const matchesResult = await db.query(
      `SELECT chm.*, ch.facility_name FROM care_home_matches chm
       JOIN care_homes ch ON ch.id = chm.care_home_id
       WHERE chm.patient_id = $1 AND chm.placement_agent_id = $2 AND chm.status = 'selected'`,
      [placement.patient_id, placement.placement_agent_id]
    );

    if (matchesResult.rows.length < 3) {
      return res.status(400).json({
        error: `At least 3 care home matches must be selected before generating an agreement. Currently selected: ${matchesResult.rows.length}.`,
      });
    }

    const signatureToken = uuidv4();
    const tokenExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72h

    const agreementResult = await db.query(
      `INSERT INTO agreements
        (placement_id, document_type, signer_name, signer_email,
         signature_token, token_expires_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING *`,
      [placement_id, document_type, signer_name || null, signer_email || null,
       signatureToken, tokenExpiresAt]
    );
    const agreement = agreementResult.rows[0];

    // Generate agreement text asynchronously
    const signUrl = `${process.env.APP_URL}/sign/${signatureToken}`;
    generateAgreementText(placement, placement, placement, matchesResult.rows)
      .then(async (text) => {
        // In a real system, upload to S3 and store URL
        console.log('Agreement text generated for placement', placement_id);
        await db.query(
          `UPDATE agreements SET document_url = $1 WHERE id = $2`,
          [signUrl, agreement.id]
        );
      })
      .catch((err) => console.error('Agreement generation error:', err));

    // Send signing request email if signer_email provided
    if (signer_email) {
      sendAgreementSignRequest({ email: signer_email, name: signer_name }, signUrl)
        .catch((err) => console.error('sendAgreementSignRequest error:', err));

      await db.query(
        `UPDATE agreements SET status = 'sent' WHERE id = $1`,
        [agreement.id]
      );
    }

    return res.status(201).json({
      agreement: { ...agreement, sign_url: signUrl },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /sign/:token - get agreement details by token (public route)
// ---------------------------------------------------------------------------
router.get('/sign/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const result = await db.query(
      `SELECT a.*, pl.patient_id, pl.care_home_id, pl.monthly_rate, pl.room_type,
              p.first_name as patient_first, p.last_name as patient_last,
              ch.facility_name, ch.address_line1, ch.city, ch.state,
              pa.first_name as agent_first, pa.last_name as agent_last
       FROM agreements a
       JOIN placements pl ON pl.id = a.placement_id
       JOIN patients p ON p.id = pl.patient_id
       JOIN care_homes ch ON ch.id = pl.care_home_id
       JOIN placement_agents pa ON pa.id = pl.placement_agent_id
       WHERE a.signature_token = $1`,
      [token]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Agreement not found.' });
    }
    const agreement = result.rows[0];

    if (agreement.status === 'signed') {
      return res.status(410).json({ error: 'This agreement has already been signed.' });
    }
    if (agreement.status === 'voided') {
      return res.status(410).json({ error: 'This agreement has been voided.' });
    }
    if (new Date() > new Date(agreement.token_expires_at)) {
      await db.query(`UPDATE agreements SET status = 'expired' WHERE id = $1`, [agreement.id]);
      return res.status(410).json({ error: 'This signing link has expired.' });
    }

    return res.json({ agreement });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /sign/:token - submit signature (public route)
// ---------------------------------------------------------------------------
router.post('/sign/:token', async (req, res, next) => {
  const client = await db.getClient();
  try {
    const { token } = req.params;
    const { signer_name, signer_email } = req.body;

    if (!signer_name || !signer_email) {
      return res.status(400).json({ error: 'signer_name and signer_email are required.' });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `SELECT * FROM agreements WHERE signature_token = $1 FOR UPDATE`,
      [token]
    );

    if (!result.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Agreement not found.' });
    }
    const agreement = result.rows[0];

    if (agreement.status === 'signed') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Agreement already signed.' });
    }
    if (agreement.status === 'voided') {
      await client.query('ROLLBACK');
      return res.status(410).json({ error: 'Agreement has been voided.' });
    }
    if (new Date() > new Date(agreement.token_expires_at)) {
      await client.query(`UPDATE agreements SET status = 'expired' WHERE id = $1`, [agreement.id]);
      await client.query('COMMIT');
      return res.status(410).json({ error: 'Signing link has expired.' });
    }

    const signerIp = req.headers['x-forwarded-for'] || req.ip;

    await client.query(
      `UPDATE agreements SET
        signer_name = $1, signer_email = $2, signer_ip = $3,
        signed_at = NOW(), status = 'signed', signature_token = NULL
       WHERE id = $4`,
      [signer_name, signer_email, signerIp, agreement.id]
    );

    await client.query(
      `UPDATE placements SET
        agreement_signed_at = NOW(), status = 'agreement_signed'
       WHERE id = $1`,
      [agreement.placement_id]
    );

    // Audit log
    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, metadata, ip_address)
       VALUES ('agreement_signed','agreement',$1,$2,$3)`,
      [agreement.id, JSON.stringify({ signer_email, placement_id: agreement.placement_id }), signerIp]
    );

    await client.query('COMMIT');

    return res.json({ message: 'Agreement signed successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /:id/void - admin: void an agreement
// ---------------------------------------------------------------------------
router.post('/:id/void', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { void_reason } = req.body;

    const result = await db.query(
      `UPDATE agreements
       SET status = 'voided', voided_at = NOW(), void_reason = $1
       WHERE id = $2 AND status NOT IN ('signed','voided')
       RETURNING *`,
      [void_reason || 'Voided by admin', id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Agreement not found or cannot be voided.' });
    }

    await db.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata, ip_address)
       VALUES ($1,'agreement_voided','agreement',$2,$3,$4)`,
      [req.user.id, id, JSON.stringify({ void_reason }), req.ip]
    );

    return res.json({ agreement: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /:id/resend - resend signature email
// ---------------------------------------------------------------------------
router.post('/:id/resend', authenticate, requireRole('placement_agent', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM agreements WHERE id = $1', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Agreement not found.' });

    const agreement = result.rows[0];
    if (agreement.status === 'signed') {
      return res.status(409).json({ error: 'Agreement already signed.' });
    }
    if (agreement.status === 'voided') {
      return res.status(410).json({ error: 'Agreement has been voided.' });
    }
    if (!agreement.signer_email) {
      return res.status(400).json({ error: 'No signer email on file for this agreement.' });
    }

    // Refresh token expiry
    const newExpiry = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const newToken = uuidv4();
    await db.query(
      `UPDATE agreements SET signature_token = $1, token_expires_at = $2, status = 'sent'
       WHERE id = $3`,
      [newToken, newExpiry, id]
    );

    const signUrl = `${process.env.APP_URL}/sign/${newToken}`;
    await sendAgreementSignRequest(
      { email: agreement.signer_email, name: agreement.signer_name },
      signUrl
    );

    return res.json({ message: 'Signing request resent.', sign_url: signUrl });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
