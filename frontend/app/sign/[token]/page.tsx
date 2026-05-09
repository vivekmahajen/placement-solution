'use client';

import { useState, useEffect } from 'react';
import { Heart, CheckCircle, AlertCircle, Clock, Pen } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

interface AgreementDetails {
  id: string;
  status: 'pending' | 'signed' | 'expired' | 'cancelled';
  patient_ref: string;
  placement_agent_name: string;
  referral_agent_name: string;
  care_homes: Array<{
    facility_name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
  }>;
  created_at: string;
  expires_at: string;
  agreement_text?: string;
}

async function loadAgreement(token: string): Promise<AgreementDetails> {
  const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
  const res = await fetch(`${BASE_URL}/agreements/sign/${token}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to load agreement.');
  return data;
}

async function submitSignature(
  token: string,
  payload: { signer_name: string; signer_email: string }
): Promise<void> {
  const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
  const res = await fetch(`${BASE_URL}/agreements/sign/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Signature submission failed.');
}

export default function SignAgreementPage({ params }: { params: { token: string } }) {
  const { token } = params;

  const [agreement, setAgreement] = useState<AgreementDetails | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadAgreement(token)
      .then(setAgreement)
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');

    if (!signerName.trim()) {
      setSubmitError('Please enter your full name.');
      return;
    }
    if (!signerEmail.trim()) {
      setSubmitError('Please enter your email address.');
      return;
    }
    if (!agreed) {
      setSubmitError('You must agree to the terms to sign.');
      return;
    }

    setSubmitting(true);
    try {
      await submitSignature(token, { signer_name: signerName, signer_email: signerEmail });
      setSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Signature failed. Please try again.';
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-teal-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <Heart className="w-6 h-6 text-teal-600" />
          <span className="font-bold text-xl text-blue-700">CareConnect</span>
          <span className="text-slate-300 mx-2">|</span>
          <span className="text-slate-600 text-sm">Agreement Signing</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12">
        {/* Loading */}
        {loading && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-slate-500">Loading agreement...</p>
          </div>
        )}

        {/* Load error */}
        {!loading && loadError && (
          <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-12 text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-900 mb-2">Agreement Not Found</h1>
            <p className="text-slate-500">{loadError}</p>
          </div>
        )}

        {/* Already signed */}
        {!loading && !loadError && agreement?.status === 'signed' && (
          <div className="bg-white rounded-2xl border border-green-200 shadow-sm p-12 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-900 mb-2">Already Signed</h1>
            <p className="text-slate-500">This agreement has already been signed. You may close this window.</p>
          </div>
        )}

        {/* Expired */}
        {!loading && !loadError && agreement?.status === 'expired' && (
          <div className="bg-white rounded-2xl border border-yellow-200 shadow-sm p-12 text-center">
            <Clock className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-900 mb-2">Agreement Expired</h1>
            <p className="text-slate-500">This agreement link has expired. Please contact your placement agent for a new link.</p>
          </div>
        )}

        {/* Cancelled */}
        {!loading && !loadError && agreement?.status === 'cancelled' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
            <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-900 mb-2">Agreement Cancelled</h1>
            <p className="text-slate-500">This agreement has been cancelled. Please contact your placement agent for more information.</p>
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="bg-white rounded-2xl border border-green-200 shadow-sm p-12 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-slate-900 mb-3">Agreement Signed Successfully</h1>
            <p className="text-slate-600 mb-2">Thank you, <strong>{signerName}</strong>.</p>
            <p className="text-slate-500">Your signature has been recorded. All parties will receive a confirmation. You may close this window.</p>
          </div>
        )}

        {/* Active agreement - show form */}
        {!loading && !loadError && !success && agreement?.status === 'pending' && (
          <div className="space-y-6">
            {/* Agreement header */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Care Placement Agreement</h1>
              <p className="text-slate-500 text-sm mb-6">
                Patient Reference #{agreement.patient_ref}
              </p>

              <div className="bg-slate-50 rounded-xl p-5 space-y-4 text-sm">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Placement Agent</span>
                  <p className="text-slate-800 mt-1">{agreement.placement_agent_name || '—'}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Referring Agent</span>
                  <p className="text-slate-800 mt-1">{agreement.referral_agent_name || '—'}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Proposed Care Homes ({agreement.care_homes?.length ?? 0})
                  </span>
                  <div className="mt-2 space-y-2">
                    {agreement.care_homes?.map((home, i) => (
                      <div key={i} className="bg-white rounded-lg px-4 py-3 border border-slate-200">
                        <p className="font-medium text-slate-900">{home.facility_name}</p>
                        <p className="text-slate-500 text-xs mt-0.5">
                          {home.address}, {home.city}, {home.state} {home.zip}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {agreement.agreement_text && (
                <div className="mt-6 prose prose-sm max-w-none">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Agreement Terms</h3>
                  <div className="bg-slate-50 rounded-xl p-5 text-xs text-slate-600 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto border border-slate-200">
                    {agreement.agreement_text}
                  </div>
                </div>
              )}

              {!agreement.agreement_text && (
                <div className="mt-6 bg-slate-50 rounded-xl p-5 text-sm text-slate-600 border border-slate-200">
                  <p>
                    This agreement authorizes CareConnect and the named placement agent to propose the
                    listed care homes for the identified patient. The referral agent acknowledges the
                    patient's consent to share information with these facilities for placement evaluation.
                    All parties agree to act in the best interest of the patient in accordance with
                    applicable regulations.
                  </p>
                </div>
              )}
            </div>

            {/* Signature form */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
              <div className="flex items-center gap-2 mb-6">
                <Pen className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-slate-900">Sign Agreement</h2>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <Input
                  label="Full Name"
                  id="signer_name"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Enter your full legal name"
                  required
                />

                <Input
                  label="Email Address"
                  type="email"
                  id="signer_email"
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                />

                {/* Signature display */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Electronic Signature
                  </label>
                  <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 bg-slate-50 text-center">
                    {signerName ? (
                      <p
                        className="text-3xl text-slate-700"
                        style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}
                      >
                        {signerName}
                      </p>
                    ) : (
                      <p className="text-slate-400 text-sm">Your name will appear here as your signature</p>
                    )}
                  </div>
                </div>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-600">
                    I agree to the terms of this agreement and confirm that my typed name above
                    constitutes my electronic signature, legally binding to the same extent as a
                    physical signature.
                  </span>
                </label>

                {submitError && (
                  <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    {submitError}
                  </div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  loading={submitting}
                  disabled={!agreed || submitting}
                >
                  <Pen className="w-4 h-4" />
                  Sign Agreement
                </Button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
