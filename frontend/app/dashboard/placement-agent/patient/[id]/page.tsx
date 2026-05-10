'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { useAuth } from '@/lib/hooks';
import { get, post, patch } from '@/lib/api';
import { countdown, isExpiringSoon, patientRef, formatCurrency, formatDate } from '@/lib/utils';
import {
  Clock,
  MapPin,
  Phone,
  Check,
  FileSignature,
  Calendar,
  Star,
  Users,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface Patient {
  id: string;
  queue_status: string;
  preferred_city: string;
  preferred_zip: string;
  preferred_county: string;
  budget_min: number;
  budget_max: number;
  room_type_preference: string;
  services_needed: string[];
  additional_notes: string;
  sex: string;
}

interface Assignment {
  id: string;
  lock_expires_at: string;
  status: string;
}

interface Match {
  care_home_id: string;
  facility_name: string;
  address_line1: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  match_score: number;
  rooms_available: number;
  base_price_monthly: number;
  services_offered: string[];
  proposal_status?: string;
}

interface WorkingMatch {
  id: string;
  care_home_id: string;
  facility_name: string;
  address_line1: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  match_score: number;
  base_price_monthly: number;
  rooms_available: number;
  services_offered: string[];
  status: string;
  contacted_at: string | null;
  agreement_signed_at: string | null;
  visit_scheduled_at: string | null;
  visit_completed_at: string | null;
  is_shortlisted: boolean;
  agent_notes: string | null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-amber-400' : 'bg-red-400';
  const textColor = score >= 70 ? 'text-green-700' : score >= 40 ? 'text-amber-700' : 'text-red-700';
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-sm font-semibold w-10 text-right ${textColor}`}>{score}%</span>
    </div>
  );
}

function CountdownBanner({ expiry, status }: { expiry: string; status: string }) {
  const [text, setText] = useState('');
  const urgent = isExpiringSoon(expiry, 24);

  useEffect(() => {
    function update() { setText(countdown(expiry)); }
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [expiry]);

  if (status === 'completed' || status === 'placed') return null;

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium ${
      urgent ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-blue-50 border border-blue-200 text-blue-700'
    }`}>
      <Clock className="w-4 h-4 flex-shrink-0" />
      <span>Lock expires in: <strong>{text}</strong></span>
    </div>
  );
}

function WorkflowStepper({ currentStep }: { currentStep: number }) {
  const steps = [
    { label: 'Find & Select Homes', step: 1 },
    { label: 'Contact & Agreements', step: 2 },
    { label: 'Schedule Visits', step: 3 },
    { label: 'Present to Family', step: 4 },
    { label: 'Placed', step: 5 },
  ];

  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1">
      {steps.map((s, idx) => {
        const isDone = currentStep > s.step;
        const isActive = currentStep === s.step;
        return (
          <div key={s.step} className="flex items-center flex-shrink-0">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isDone
                ? 'bg-green-100 text-green-700'
                : isActive
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-400'
            }`}>
              {isDone ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${
                  isActive ? 'bg-white text-blue-600' : 'bg-slate-300 text-slate-500'
                }`}>
                  {s.step}
                </span>
              )}
              {s.label}
              {s.step === 5 && isDone && ' ✓'}
            </div>
            {idx < steps.length - 1 && (
              <ArrowRight className={`w-4 h-4 mx-1 flex-shrink-0 ${
                currentStep > s.step ? 'text-green-400' : 'text-slate-300'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepDone({ timestamp }: { timestamp: string | null }) {
  if (!timestamp) return null;
  return (
    <span className="text-xs text-green-600 font-medium">
      Done ✓ ({formatDate(timestamp)})
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PatientDetailPage({ params }: { params: { id: string } }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const patientId = params.id;

  const [activeTab, setActiveTab] = useState<'find' | 'work' | 'family'>('find');
  const [showMatches, setShowMatches] = useState(false);
  const [selectedHomes, setSelectedHomes] = useState<string[]>([]);
  const [familyDecisions, setFamilyDecisions] = useState<Record<string, 'accepted' | 'rejected'>>({});
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  // ---- Queries ----

  const { data: patientData, isLoading: loadingPatient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => get<{ patient: Patient }>(`/patients/${patientId}`).then((d) => d.patient),
    enabled: !!user,
  });

  // patientData is typed as Patient but we need queue_status — cast
  const patient = patientData as Patient | undefined;

  const { data: assignment, isLoading: loadingAssignment } = useQuery({
    queryKey: ['assignment', patientId],
    queryFn: () => get<Assignment>(`/queue/assignment/${patientId}`),
    enabled: !!user,
  });

  const { data: rawMatches = [], isLoading: loadingMatches } = useQuery({
    queryKey: ['matches', patientId],
    queryFn: () =>
      get<{ matches: Match[] }>(`/queue/matches/${patientId}`).then((d) => d.matches ?? []),
    enabled: !!user && showMatches,
  });

  const { data: workingMatches = [], refetch: refetchWorking } = useQuery({
    queryKey: ['workingMatches', patientId],
    queryFn: () =>
      get<{ matches: WorkingMatch[] }>(`/queue/matches/${patientId}/selected`).then(
        (d) => d.matches ?? []
      ),
    enabled: !!user,
    refetchInterval: 0,
  });

  // Auto-advance tabs
  useEffect(() => {
    const shortlisted = workingMatches.filter((m) => m.is_shortlisted);
    if (shortlisted.length > 0) {
      setActiveTab('family');
    } else if (workingMatches.length > 0) {
      setActiveTab('work');
    }
  }, [workingMatches.length]);

  // Determine workflow step
  const shortlistedCount = workingMatches.filter((m) => m.is_shortlisted).length;
  const isPlaced = patient?.queue_status === 'placed';

  function getWorkflowStep(): number {
    if (isPlaced) return 5;
    if (shortlistedCount > 0) return 4;
    const hasVisitScheduled = workingMatches.some((m) => m.visit_scheduled_at);
    if (hasVisitScheduled) return 3;
    const hasAgreementSigned = workingMatches.some((m) => m.agreement_signed_at);
    if (hasAgreementSigned) return 2;
    if (workingMatches.length > 0) return 2;
    return 1;
  }

  // ---- Mutations ----

  const selectMutation = useMutation({
    mutationFn: (careHomeIds: string[]) =>
      post(`/queue/matches/${patientId}/select`, { careHomeIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workingMatches', patientId] });
      refetchWorking();
      setActiveTab('work');
    },
  });

  const workflowMutation = useMutation({
    mutationFn: ({
      careHomeId,
      action,
      notes,
    }: {
      careHomeId: string;
      action: string;
      notes?: string;
    }) =>
      patch(`/queue/matches/${patientId}/home/${careHomeId}`, { action, notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workingMatches', patientId] });
      refetchWorking();
    },
  });

  const placeMutation = useMutation({
    mutationFn: (careHomeId: string) =>
      post(`/queue/place/${patientId}`, { care_home_id: careHomeId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient', patientId] });
      qc.invalidateQueries({ queryKey: ['assignment', patientId] });
      qc.invalidateQueries({ queryKey: ['workingMatches', patientId] });
    },
  });

  function toggleSelectHome(careHomeId: string) {
    setSelectedHomes((prev) => {
      if (prev.includes(careHomeId)) return prev.filter((id) => id !== careHomeId);
      if (prev.length >= 10) return prev;
      return [...prev, careHomeId];
    });
  }

  function confirmSelection() {
    if (selectedHomes.length === 0) return;
    selectMutation.mutate(selectedHomes);
  }

  const acceptedHome = Object.entries(familyDecisions).find(([, v]) => v === 'accepted')?.[0];

  // ---- Render guards ----

  if (loadingPatient || loadingAssignment) {
    return (
      <DashboardLayout>
        <div className="py-12 text-center text-slate-400">Loading patient details...</div>
      </DashboardLayout>
    );
  }

  if (!patient) {
    return (
      <DashboardLayout>
        <div className="py-12 text-center text-slate-400">Patient not found.</div>
      </DashboardLayout>
    );
  }

  const workflowStep = getWorkflowStep();

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Patient Ref #{patientRef(patientId)}
            </h1>
            {assignment && <StatusBadge status={assignment.status} />}
          </div>
          {patient.queue_status && (
            <StatusBadge status={patient.queue_status} />
          )}
        </div>

        {/* Placed success banner */}
        {isPlaced && (
          <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-green-50 border border-green-200 text-green-800">
            <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-lg">Patient Successfully Placed!</p>
              <p className="text-sm text-green-700">
                This patient has been placed at a care home. The referral agent has been notified.
              </p>
            </div>
          </div>
        )}

        {/* Lock countdown */}
        {assignment && (
          <CountdownBanner expiry={assignment.lock_expires_at} status={assignment.status} />
        )}

        {/* Workflow stepper */}
        <Card>
          <WorkflowStepper currentStep={workflowStep} />
        </Card>

        {/* Patient info */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Placement Preferences">
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Preferred City</span>
                  <p className="mt-1 text-slate-700">{patient.preferred_city || '—'}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Preferred ZIP</span>
                  <p className="mt-1 text-slate-700">{patient.preferred_zip || '—'}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">County</span>
                  <p className="mt-1 text-slate-700">{patient.preferred_county || '—'}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Room Preference</span>
                  <p className="mt-1 text-slate-700 capitalize">
                    {patient.room_type_preference?.replace('_', ' ') || 'No preference'}
                  </p>
                </div>
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Budget Range</span>
                <p className="mt-1 text-slate-700 font-medium">
                  {patient.budget_min && patient.budget_max
                    ? `$${patient.budget_min.toLocaleString()} – $${patient.budget_max.toLocaleString()}/mo`
                    : 'Not specified'}
                </p>
              </div>
            </div>
          </Card>

          <Card title="Services Needed">
            {patient.services_needed?.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {patient.services_needed.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-medium px-2.5 py-1 rounded-full"
                  >
                    <Check className="w-3 h-3" />
                    {s}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 text-sm">No specific services required.</p>
            )}
            {patient.additional_notes && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Additional Notes</span>
                <p className="mt-1 text-sm text-slate-700">{patient.additional_notes}</p>
              </div>
            )}
          </Card>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200">
          <nav className="flex gap-1">
            {[
              { key: 'find', label: 'Find Homes' },
              { key: 'work', label: `Work Homes${workingMatches.length > 0 ? ` (${workingMatches.length})` : ''}` },
              { key: 'family', label: `Family Presentation${shortlistedCount > 0 ? ` (${shortlistedCount}/3)` : ''}` },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as 'find' | 'work' | 'family')}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* ================================================================
            Tab 1: Find Homes
        ================================================================ */}
        {activeTab === 'find' && (
          <Card
            title="Care Home Matches"
            headerAction={
              !showMatches ? (
                <Button variant="primary" onClick={() => setShowMatches(true)}>
                  Find Matches
                </Button>
              ) : null
            }
          >
            {!showMatches ? (
              <div className="py-6 text-center text-slate-400 text-sm">
                Click &quot;Find Matches&quot; to see care homes that match this patient&apos;s preferences.
              </div>
            ) : loadingMatches ? (
              <div className="py-8 text-center text-slate-400">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2" />
                Finding matches...
              </div>
            ) : rawMatches.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-sm">
                No matching care homes found. Try broadening the patient&apos;s preferences.
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-500 mb-4">
                  Select up to 10 homes to work with. Selected:{' '}
                  <strong>{selectedHomes.length}/10</strong>
                </p>
                <div className="space-y-4">
                  {rawMatches.map((match) => {
                    const isSelected = selectedHomes.includes(match.care_home_id);
                    const alreadyWorking = workingMatches.some(
                      (w) => w.care_home_id === match.care_home_id
                    );
                    return (
                      <div
                        key={match.care_home_id}
                        className={`border-2 rounded-xl p-5 transition-colors ${
                          alreadyWorking
                            ? 'border-green-400 bg-green-50'
                            : isSelected
                            ? 'border-blue-400 bg-blue-50'
                            : 'border-slate-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div>
                            <h3 className="font-semibold text-slate-900 text-lg">
                              {match.facility_name}
                            </h3>
                            <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-1">
                              <MapPin className="w-3.5 h-3.5" />
                              {match.address_line1}, {match.city}, {match.state} {match.zip}
                            </div>
                            {match.phone && (
                              <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-0.5">
                                <Phone className="w-3.5 h-3.5" />
                                {match.phone}
                              </div>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-sm font-medium text-slate-500 mb-1">Match Score</div>
                            <div className="w-40">
                              <ScoreBar score={match.match_score} />
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                          <div>
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                              Rooms Available
                            </span>
                            <p className="mt-1 text-slate-700 font-semibold">{match.rooms_available}</p>
                          </div>
                          <div>
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                              Base Price
                            </span>
                            <p className="mt-1 text-slate-700 font-semibold">
                              {formatCurrency(match.base_price_monthly)}
                            </p>
                          </div>
                        </div>

                        {match.services_offered?.length > 0 && (
                          <div className="mb-4">
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                              Services Offered
                            </span>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {(match.services_offered ?? []).slice(0, 6).map((s) => (
                                <span
                                  key={s}
                                  className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded"
                                >
                                  {s}
                                </span>
                              ))}
                              {(match.services_offered?.length ?? 0) > 6 && (
                                <span className="text-xs text-slate-400">
                                  +{(match.services_offered?.length ?? 0) - 6} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          {alreadyWorking ? (
                            <span className="text-sm text-green-700 font-medium flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4" /> Already selected
                            </span>
                          ) : (
                            <Button
                              variant={isSelected ? 'primary' : 'secondary'}
                              size="sm"
                              onClick={() => toggleSelectHome(match.care_home_id)}
                              disabled={!isSelected && selectedHomes.length >= 10}
                            >
                              <Star className="w-3.5 h-3.5" />
                              {isSelected ? 'Selected' : 'Select'}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {selectedHomes.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
                    <p className="text-sm text-slate-500">
                      {selectedHomes.length} home{selectedHomes.length !== 1 ? 's' : ''} selected
                    </p>
                    <Button
                      variant="primary"
                      loading={selectMutation.isPending}
                      onClick={confirmSelection}
                    >
                      Confirm Selection &amp; Start Working
                    </Button>
                  </div>
                )}

                {selectMutation.isSuccess && (
                  <div className="mt-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
                    Homes saved. Switch to the &quot;Work Homes&quot; tab to continue.
                  </div>
                )}

                {selectMutation.isError && (
                  <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                    {(selectMutation.error as Error)?.message ?? 'Failed to save selection. Please try again.'}
                  </div>
                )}
              </>
            )}
          </Card>
        )}

        {/* ================================================================
            Tab 2: Work Homes
        ================================================================ */}
        {activeTab === 'work' && (
          <div className="space-y-4">
            {workingMatches.length === 0 ? (
              <Card>
                <div className="py-6 text-center text-slate-400 text-sm">
                  No homes selected yet. Go to &quot;Find Homes&quot; to select care homes to work with.
                </div>
              </Card>
            ) : (
              workingMatches.map((match) => (
                <Card key={match.id} title={match.facility_name}>
                  <div className="space-y-5">
                    {/* Basic info */}
                    <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {match.city}, {match.state}
                      </span>
                      {match.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" />
                          {match.phone}
                        </span>
                      )}
                      <span className="font-medium text-slate-700">
                        {formatCurrency(match.base_price_monthly)}
                      </span>
                    </div>

                    {/* Progress steps */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                      {/* Step 1: Contacted */}
                      <div className={`rounded-lg p-3 border ${match.contacted_at ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-50'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Phone className={`w-4 h-4 ${match.contacted_at ? 'text-green-600' : 'text-slate-400'}`} />
                          <span className="text-sm font-medium text-slate-700">Contacted</span>
                        </div>
                        {match.contacted_at ? (
                          <StepDone timestamp={match.contacted_at} />
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="w-full"
                            loading={
                              workflowMutation.isPending &&
                              workflowMutation.variables?.careHomeId === match.care_home_id &&
                              workflowMutation.variables?.action === 'contacted'
                            }
                            onClick={() =>
                              workflowMutation.mutate({
                                careHomeId: match.care_home_id,
                                action: 'contacted',
                              })
                            }
                          >
                            Mark Contacted
                          </Button>
                        )}
                      </div>

                      {/* Step 2: Agreement Signed */}
                      <div className={`rounded-lg p-3 border ${match.agreement_signed_at ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-50'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <FileSignature className={`w-4 h-4 ${match.agreement_signed_at ? 'text-green-600' : 'text-slate-400'}`} />
                          <span className="text-sm font-medium text-slate-700">Agreement</span>
                        </div>
                        {match.agreement_signed_at ? (
                          <StepDone timestamp={match.agreement_signed_at} />
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="w-full"
                            loading={
                              workflowMutation.isPending &&
                              workflowMutation.variables?.careHomeId === match.care_home_id &&
                              workflowMutation.variables?.action === 'agreement_signed'
                            }
                            onClick={() =>
                              workflowMutation.mutate({
                                careHomeId: match.care_home_id,
                                action: 'agreement_signed',
                              })
                            }
                          >
                            Agreement Signed
                          </Button>
                        )}
                      </div>

                      {/* Step 3: Visit Scheduled */}
                      <div className={`rounded-lg p-3 border ${match.visit_scheduled_at ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-50'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Calendar className={`w-4 h-4 ${match.visit_scheduled_at ? 'text-green-600' : 'text-slate-400'}`} />
                          <span className="text-sm font-medium text-slate-700">Visit Scheduled</span>
                        </div>
                        {match.visit_scheduled_at ? (
                          <StepDone timestamp={match.visit_scheduled_at} />
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="w-full"
                            loading={
                              workflowMutation.isPending &&
                              workflowMutation.variables?.careHomeId === match.care_home_id &&
                              workflowMutation.variables?.action === 'visit_scheduled'
                            }
                            onClick={() =>
                              workflowMutation.mutate({
                                careHomeId: match.care_home_id,
                                action: 'visit_scheduled',
                              })
                            }
                          >
                            Schedule Visit
                          </Button>
                        )}
                      </div>

                      {/* Step 4: Visit Completed */}
                      <div className={`rounded-lg p-3 border ${match.visit_completed_at ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-50'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle2 className={`w-4 h-4 ${match.visit_completed_at ? 'text-green-600' : 'text-slate-400'}`} />
                          <span className="text-sm font-medium text-slate-700">Visit Completed</span>
                        </div>
                        {match.visit_completed_at ? (
                          <StepDone timestamp={match.visit_completed_at} />
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="w-full"
                            loading={
                              workflowMutation.isPending &&
                              workflowMutation.variables?.careHomeId === match.care_home_id &&
                              workflowMutation.variables?.action === 'visit_completed'
                            }
                            onClick={() =>
                              workflowMutation.mutate({
                                careHomeId: match.care_home_id,
                                action: 'visit_completed',
                              })
                            }
                          >
                            Complete Visit
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Shortlist */}
                    <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        {match.is_shortlisted ? (
                          <span className="flex items-center gap-1.5 text-sm font-medium text-amber-600">
                            <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                            Shortlisted for family ({shortlistedCount}/3)
                          </span>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={!match.visit_completed_at || shortlistedCount >= 3}
                            loading={
                              workflowMutation.isPending &&
                              workflowMutation.variables?.careHomeId === match.care_home_id &&
                              workflowMutation.variables?.action === 'shortlist'
                            }
                            onClick={() =>
                              workflowMutation.mutate({
                                careHomeId: match.care_home_id,
                                action: 'shortlist',
                              })
                            }
                          >
                            <Star className="w-3.5 h-3.5" />
                            Shortlist for Family
                            {shortlistedCount >= 3 ? ' (max 3)' : ` (${shortlistedCount}/3)`}
                          </Button>
                        )}
                        {match.is_shortlisted && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              workflowMutation.mutate({
                                careHomeId: match.care_home_id,
                                action: 'remove_shortlist',
                              })
                            }
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                      {!match.visit_completed_at && !match.is_shortlisted && (
                        <span className="text-xs text-slate-400">Complete visit before shortlisting</span>
                      )}
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
                        Agent Notes
                      </label>
                      <div className="flex gap-2">
                        <textarea
                          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={2}
                          placeholder="Add notes about this care home..."
                          value={notesDraft[match.care_home_id] ?? match.agent_notes ?? ''}
                          onChange={(e) =>
                            setNotesDraft((prev) => ({
                              ...prev,
                              [match.care_home_id]: e.target.value,
                            }))
                          }
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const notes = notesDraft[match.care_home_id];
                            if (notes !== undefined) {
                              workflowMutation.mutate({
                                careHomeId: match.care_home_id,
                                action: match.status === 'selected' ? 'contacted' : match.status,
                                notes,
                              });
                            }
                          }}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}

        {/* ================================================================
            Tab 3: Family Presentation
        ================================================================ */}
        {activeTab === 'family' && (
          <div className="space-y-4">
            {shortlistedCount < 3 && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                <Users className="w-4 h-4 flex-shrink-0" />
                <span>
                  Shortlist <strong>3 homes</strong> to present to the family. Currently shortlisted:{' '}
                  <strong>{shortlistedCount}/3</strong>
                </span>
              </div>
            )}

            {workingMatches.filter((m) => m.is_shortlisted).length === 0 ? (
              <Card>
                <div className="py-6 text-center text-slate-400 text-sm">
                  No homes shortlisted yet. Complete visits and shortlist homes in the &quot;Work Homes&quot; tab.
                </div>
              </Card>
            ) : (
              workingMatches
                .filter((m) => m.is_shortlisted)
                .map((match) => {
                  const decision = familyDecisions[match.care_home_id];
                  return (
                    <Card key={match.id} title={match.facility_name}>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Location</span>
                            <p className="mt-1 text-slate-700">{match.city}, {match.state}</p>
                          </div>
                          <div>
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Monthly Rate</span>
                            <p className="mt-1 text-slate-700 font-semibold">
                              {formatCurrency(match.base_price_monthly)}
                            </p>
                          </div>
                          <div>
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Rooms Available</span>
                            <p className="mt-1 text-slate-700">{match.rooms_available}</p>
                          </div>
                          <div>
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Match Score</span>
                            <p className="mt-1">
                              <ScoreBar score={match.match_score} />
                            </p>
                          </div>
                        </div>

                        {match.phone && (
                          <div className="text-sm text-slate-600 flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5" />
                            {match.phone}
                            {match.email && <span className="mx-2 text-slate-300">|</span>}
                            {match.email}
                          </div>
                        )}

                        {match.services_offered?.length > 0 && (
                          <div>
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Services</span>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {match.services_offered.slice(0, 8).map((s) => (
                                <span
                                  key={s}
                                  className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded"
                                >
                                  {s}
                                </span>
                              ))}
                              {match.services_offered.length > 8 && (
                                <span className="text-xs text-slate-400">
                                  +{match.services_offered.length - 8} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {match.agent_notes && (
                          <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">
                            <strong>Notes:</strong> {match.agent_notes}
                          </div>
                        )}

                        {/* Family decision */}
                        <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                          {decision === 'accepted' ? (
                            <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
                              <CheckCircle2 className="w-4 h-4" /> Family Accepted
                            </span>
                          ) : decision === 'rejected' ? (
                            <span className="flex items-center gap-1.5 text-sm font-medium text-red-700">
                              <XCircle className="w-4 h-4" /> Family Rejected
                            </span>
                          ) : (
                            <>
                              <Button
                                variant="primary"
                                size="sm"
                                disabled={!!acceptedHome && acceptedHome !== match.care_home_id}
                                onClick={() =>
                                  setFamilyDecisions((prev) => ({
                                    ...prev,
                                    [match.care_home_id]: 'accepted',
                                  }))
                                }
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Family Accepted
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() =>
                                  setFamilyDecisions((prev) => ({
                                    ...prev,
                                    [match.care_home_id]: 'rejected',
                                  }))
                                }
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Family Rejected
                              </Button>
                            </>
                          )}

                          {decision && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setFamilyDecisions((prev) => {
                                  const next = { ...prev };
                                  delete next[match.care_home_id];
                                  return next;
                                })
                              }
                            >
                              Undo
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })
            )}

            {/* Confirm Placement */}
            {acceptedHome && (
              <Card>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-900">Ready to Confirm Placement</p>
                    <p className="text-sm text-slate-500 mt-0.5">
                      Family has selected a care home. Click below to finalize the placement.
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="lg"
                    loading={placeMutation.isPending}
                    onClick={() => placeMutation.mutate(acceptedHome)}
                    disabled={isPlaced}
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Confirm Placement
                  </Button>
                </div>
                {placeMutation.isError && (
                  <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                    {(placeMutation.error as Error)?.message ?? 'Failed to place patient. Please try again.'}
                  </div>
                )}
              </Card>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
