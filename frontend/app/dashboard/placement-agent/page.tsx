'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { useAuth } from '@/lib/hooks';
import { get } from '@/lib/api';
import { formatDate, patientRef, countdown, isExpiringSoon } from '@/lib/utils';
import { Clock, Users, ArrowRight } from 'lucide-react';

interface LockedPatient {
  id: string;
  patient_id: string;
  lock_expires_at: string;
  status: string;
  patient: {
    id: string;
    preferred_city: string;
    preferred_zip: string;
    room_type_preference: string;
    services_needed: string[];
  };
}

interface QueuePreview {
  total: number;
  items: Array<{
    id: string;
    queued_at: string;
    preferred_city: string;
    preferred_zip: string;
  }>;
}

function CountdownCell({ expiry }: { expiry: string }) {
  const [text, setText] = useState('');
  const urgent = isExpiringSoon(expiry, 24);

  useEffect(() => {
    function update() {
      setText(countdown(expiry));
    }
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [expiry]);

  return (
    <span className={urgent ? 'text-red-600 font-semibold' : 'text-slate-700'}>
      {urgent && <Clock className="w-3.5 h-3.5 inline mr-1" />}
      {text}
    </span>
  );
}

export default function PlacementAgentDashboard() {
  const { user } = useAuth();

  const { data: assignments = [], isLoading: loadingAssignments } = useQuery({
    queryKey: ['my-assignments', user?.id],
    queryFn: () => get<LockedPatient[]>('/queue/my-assignments'),
    enabled: !!user,
  });

  const { data: queuePreview } = useQuery({
    queryKey: ['queue-preview', user?.id],
    queryFn: () => get<QueuePreview>('/queue?limit=5'),
    enabled: !!user,
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Placement Agent Dashboard</h1>
          <p className="text-slate-500 mt-1">Manage your active patient assignments</p>
        </div>

        {/* Active Assignments */}
        <Card
          title="My Active Assignments"
          description="Patients currently locked to you"
          headerAction={
            <Link href="/dashboard/placement-agent/queue">
              <Button variant="secondary" size="sm">
                View Queue <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          }
        >
          {loadingAssignments ? (
            <div className="py-8 text-center text-slate-400">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2" />
              Loading assignments...
            </div>
          ) : assignments.length === 0 ? (
            <div className="py-8 text-center text-slate-400">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No active assignments.</p>
              <p className="text-xs mt-1">Lock a patient from the queue to begin.</p>
              <Link href="/dashboard/placement-agent/queue">
                <Button variant="primary" size="sm" className="mt-4">
                  Browse Queue
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-slate-100">
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Patient Ref</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Location</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Room Type</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Services</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Lock Expires</th>
                    <th className="pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="pb-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {assignments.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="py-3 pr-4 font-mono font-semibold text-slate-900">
                        {patientRef(a.patient_id)}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {a.patient.preferred_city || a.patient.preferred_zip || '—'}
                      </td>
                      <td className="py-3 pr-4 capitalize text-slate-600">
                        {a.patient.room_type_preference || '—'}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {a.patient.services_needed?.length ?? 0} services
                      </td>
                      <td className="py-3 pr-4">
                        <CountdownCell expiry={a.lock_expires_at} />
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="py-3">
                        <Link href={`/dashboard/placement-agent/patient/${a.patient_id}`}>
                          <Button variant="ghost" size="sm">
                            View <ArrowRight className="w-3 h-3" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Queue Preview */}
        <Card
          title="Available Queue"
          description={`${queuePreview?.total ?? 0} patients waiting for placement`}
          headerAction={
            <Link href="/dashboard/placement-agent/queue">
              <Button variant="primary" size="sm">
                View Full Queue <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          }
        >
          {!queuePreview || queuePreview.items.length === 0 ? (
            <div className="py-6 text-center text-slate-400 text-sm">
              No patients in the queue right now.
            </div>
          ) : (
            <div className="space-y-2">
              {queuePreview.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-sm font-semibold text-slate-700">
                      {patientRef(item.id)}
                    </span>
                    <span className="text-sm text-slate-500">
                      {item.preferred_city || item.preferred_zip || 'Location TBD'}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">Queued {formatDate(item.queued_at)}</span>
                </div>
              ))}
              {(queuePreview.total ?? 0) > 5 && (
                <Link href="/dashboard/placement-agent/queue">
                  <p className="text-center text-sm text-blue-600 hover:text-blue-700 pt-2 cursor-pointer">
                    +{queuePreview.total - 5} more in queue →
                  </p>
                </Link>
              )}
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
