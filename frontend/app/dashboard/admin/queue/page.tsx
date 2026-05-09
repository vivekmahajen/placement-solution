'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { useAuth } from '@/lib/hooks';
import { get, post } from '@/lib/api';
import { formatDate, formatDateTime, countdown, patientRef } from '@/lib/utils';
import { ClipboardList, Unlock } from 'lucide-react';

interface QueueAssignment {
  id: string;
  patient_id: string;
  agent_id: string;
  agent_email: string;
  locked_at: string;
  lock_expires_at: string;
  status: string;
  patient: {
    id: string;
    preferred_city: string;
  };
}

export default function AdminQueuePage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [releaseModal, setReleaseModal] = useState<QueueAssignment | null>(null);
  const [releaseReason, setReleaseReason] = useState('');
  const [releaseError, setReleaseError] = useState('');

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['admin-queue'],
    queryFn: () => get<QueueAssignment[]>('/admin/queue'),
    enabled: !!user,
  });

  const releaseMutation = useMutation({
    mutationFn: ({ assignmentId, reason }: { assignmentId: string; reason: string }) =>
      post(`/admin/queue/${assignmentId}/release`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-queue'] });
      setReleaseModal(null);
      setReleaseReason('');
      setReleaseError('');
    },
    onError: (err: Error) => {
      setReleaseError(err.message || 'Failed to release lock.');
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Queue Management</h1>
          <p className="text-slate-500 mt-1">All active queue assignments</p>
        </div>

        <Card>
          {isLoading ? (
            <div className="py-8 text-center text-slate-400">Loading queue...</div>
          ) : assignments.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No active queue assignments.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100">
                  <tr className="text-left">
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Patient</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Agent</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Locked At</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Expires</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {assignments.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="py-3 pr-4">
                        <div className="font-mono font-semibold text-slate-900">
                          {patientRef(a.patient_id)}
                        </div>
                        <div className="text-xs text-slate-500">{a.patient?.preferred_city || '—'}</div>
                      </td>
                      <td className="py-3 pr-4 text-slate-600">{a.agent_email}</td>
                      <td className="py-3 pr-4 text-slate-500 text-xs">{formatDateTime(a.locked_at)}</td>
                      <td className="py-3 pr-4">
                        <div className="text-xs text-slate-600">{formatDate(a.lock_expires_at)}</div>
                        <div className="text-xs text-slate-400">{countdown(a.lock_expires_at)}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="py-3">
                        {a.status === 'locked' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-amber-600 hover:bg-amber-50 text-xs"
                            onClick={() => {
                              setReleaseModal(a);
                              setReleaseReason('');
                              setReleaseError('');
                            }}
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            Release Lock
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Release modal */}
      <Modal
        open={!!releaseModal}
        onClose={() => setReleaseModal(null)}
        title="Release Lock"
        size="md"
      >
        {releaseModal && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Release the lock on patient <strong>Ref #{patientRef(releaseModal.patient_id)}</strong> from agent <strong>{releaseModal.agent_email}</strong>?
              The patient will return to the queue.
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Reason for release <span className="text-red-500">*</span>
              </label>
              <textarea
                value={releaseReason}
                onChange={(e) => setReleaseReason(e.target.value)}
                rows={3}
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="Provide reason for releasing this lock..."
              />
            </div>
            {releaseError && (
              <p className="text-sm text-red-600">{releaseError}</p>
            )}
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setReleaseModal(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                loading={releaseMutation.isPending}
                disabled={!releaseReason.trim()}
                onClick={() => releaseMutation.mutate({
                  assignmentId: releaseModal.id,
                  reason: releaseReason,
                })}
              >
                Release Lock
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
