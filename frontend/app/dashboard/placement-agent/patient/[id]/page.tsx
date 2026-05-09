'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { useAuth } from '@/lib/hooks';
import { get, post } from '@/lib/api';
import { countdown, isExpiringSoon, patientRef, formatCurrency } from '@/lib/utils';
import { Clock, Building2, Phone, MapPin, CheckCircle, Eye, Star } from 'lucide-react';

interface Patient {
  id: string;
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
  address: string;
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

export default function PatientDetailPage({ params }: { params: { id: string } }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const patientId = params.id;

  const [showMatches, setShowMatches] = useState(false);
  const [selectedHomes, setSelectedHomes] = useState<string[]>([]);

  const { data: patient, isLoading: loadingPatient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => get<Patient>(`/patients/${patientId}`),
    enabled: !!user,
  });

  const { data: assignment, isLoading: loadingAssignment } = useQuery({
    queryKey: ['assignment', patientId],
    queryFn: () => get<Assignment>(`/queue/assignment/${patientId}`),
    enabled: !!user,
  });

  const { data: matches = [], isLoading: loadingMatches } = useQuery({
    queryKey: ['matches', patientId],
    queryFn: () => get<Match[]>(`/queue/matches/${patientId}`),
    enabled: !!user && showMatches,
  });

  const proposeMutation = useMutation({
    mutationFn: ({ careHomeId, action }: { careHomeId: string; action: string }) =>
      post(`/queue/proposals`, { patient_id: patientId, care_home_id: careHomeId, action }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matches', patientId] });
    },
  });

  const agreementMutation = useMutation({
    mutationFn: () =>
      post('/agreements/generate', {
        patient_id: patientId,
        care_home_ids: selectedHomes,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignment', patientId] });
    },
  });

  function toggleSelect(careHomeId: string) {
    setSelectedHomes((prev) => {
      if (prev.includes(careHomeId)) {
        return prev.filter((id) => id !== careHomeId);
      }
      if (prev.length >= 3) return prev;
      return [...prev, careHomeId];
    });
  }

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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Patient Ref #{patientRef(patientId)}
          </h1>
          {assignment && <StatusBadge status={assignment.status} />}
        </div>

        {/* Lock countdown */}
        {assignment && (
          <CountdownBanner expiry={assignment.lock_expires_at} status={assignment.status} />
        )}

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
                  <span key={s} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-medium px-2.5 py-1 rounded-full">
                    <CheckCircle className="w-3 h-3" />
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

        {/* Find Matches */}
        <Card
          title="Care Home Matches"
          headerAction={
            !showMatches ? (
              <Button
                variant="primary"
                onClick={() => setShowMatches(true)}
              >
                Find Care Home Matches
              </Button>
            ) : null
          }
        >
          {!showMatches ? (
            <div className="py-6 text-center text-slate-400 text-sm">
              Click &quot;Find Care Home Matches&quot; to see matching facilities.
            </div>
          ) : loadingMatches ? (
            <div className="py-8 text-center text-slate-400">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2" />
              Finding matches...
            </div>
          ) : matches.length === 0 ? (
            <div className="py-6 text-center text-slate-400 text-sm">
              No matching care homes found. Try broadening the patient&apos;s preferences.
            </div>
          ) : (
            <div className="space-y-4">
              {matches.map((match) => {
                const isSelected = selectedHomes.includes(match.care_home_id);
                return (
                  <div
                    key={match.care_home_id}
                    className={`border-2 rounded-xl p-5 transition-colors ${
                      isSelected ? 'border-blue-400 bg-blue-50' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <h3 className="font-semibold text-slate-900 text-lg">{match.facility_name}</h3>
                        <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {match.address}, {match.city}, {match.state} {match.zip}
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
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Rooms Available</span>
                        <p className="mt-1 text-slate-700 font-semibold">{match.rooms_available}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Base Price</span>
                        <p className="mt-1 text-slate-700 font-semibold">{formatCurrency(match.base_price_monthly)}</p>
                      </div>
                    </div>

                    {match.services_offered?.length > 0 && (
                      <div className="mb-4">
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Services Offered</span>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {match.services_offered.slice(0, 6).map((s) => (
                            <span key={s} className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded">
                              {s}
                            </span>
                          ))}
                          {match.services_offered.length > 6 && (
                            <span className="text-xs text-slate-400">+{match.services_offered.length - 6} more</span>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => proposeMutation.mutate({ careHomeId: match.care_home_id, action: 'propose' })}
                        disabled={!!match.proposal_status}
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        {match.proposal_status === 'proposed' ? 'Proposed' : 'Propose'}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => proposeMutation.mutate({ careHomeId: match.care_home_id, action: 'visited' })}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Mark Visited
                      </Button>
                      <Button
                        variant={isSelected ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => toggleSelect(match.care_home_id)}
                        disabled={!isSelected && selectedHomes.length >= 3}
                      >
                        <Star className="w-3.5 h-3.5" />
                        {isSelected ? 'Selected' : 'Select'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Selected homes + generate agreement */}
        {selectedHomes.length > 0 && (
          <Card title={`Selected Care Homes (${selectedHomes.length}/3)`}>
            <div className="space-y-2 mb-4">
              {selectedHomes.map((id) => {
                const home = matches.find((m) => m.care_home_id === id);
                return home ? (
                  <div key={id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <span className="font-medium text-green-800">{home.facility_name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-400"
                      onClick={() => setSelectedHomes(selectedHomes.filter((s) => s !== id))}
                    >
                      Remove
                    </Button>
                  </div>
                ) : null;
              })}
            </div>

            {selectedHomes.length === 3 && (
              <Button
                variant="primary"
                className="w-full"
                loading={agreementMutation.isPending}
                onClick={() => agreementMutation.mutate()}
              >
                Generate Agreement for {selectedHomes.length} Care Homes
              </Button>
            )}

            {selectedHomes.length < 3 && (
              <p className="text-sm text-slate-500 text-center">
                Select {3 - selectedHomes.length} more care home{3 - selectedHomes.length !== 1 ? 's' : ''} to generate agreement
              </p>
            )}

            {agreementMutation.isSuccess && (
              <div className="mt-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
                Agreement generated and sent for signatures.
              </div>
            )}
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
