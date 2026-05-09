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
import { formatDate } from '@/lib/utils';
import { Building2, CheckCircle, XCircle } from 'lucide-react';

interface CareHome {
  id: string;
  facility_name: string;
  city: string;
  state: string;
  verification_status: string;
  total_beds: number;
  rooms_available: number;
  created_at: string;
  contact_email: string;
  phone: string;
  license_number: string;
}

type TabType = 'pending' | 'all';

export default function AdminCareHomesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [tab, setTab] = useState<TabType>('pending');
  const [actionModal, setActionModal] = useState<{ home: CareHome; action: 'approve' | 'reject' } | null>(null);

  const { data: careHomes = [], isLoading } = useQuery({
    queryKey: ['admin-care-homes', tab],
    queryFn: () => {
      const params = tab === 'pending' ? '?status=pending_verification' : '';
      return get<{ careHomes: CareHome[] }>(`/admin/care-homes${params}`).then((d) => d.careHomes ?? []);
    },
    enabled: !!user,
  });

  const actionMutation = useMutation({
    mutationFn: ({ homeId, action }: { homeId: string; action: 'approve' | 'reject' }) =>
      post(`/admin/care-homes/${homeId}/${action}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-care-homes'] });
      setActionModal(null);
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Care Home Management</h1>
          <p className="text-slate-500 mt-1">Verify and manage care facilities on the platform</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200">
          {(['pending', 'all'] as TabType[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'pending' ? 'Pending Verification' : 'All Care Homes'}
            </button>
          ))}
        </div>

        <Card>
          {isLoading ? (
            <div className="py-8 text-center text-slate-400">Loading care homes...</div>
          ) : careHomes.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {tab === 'pending' ? 'No care homes pending verification.' : 'No care homes found.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100">
                  <tr className="text-left">
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Facility</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Location</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">License</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Beds / Available</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Joined</th>
                    {tab === 'pending' && (
                      <th className="pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {careHomes.map((home) => (
                    <tr key={home.id} className="hover:bg-slate-50">
                      <td className="py-3 pr-4">
                        <div className="font-medium text-slate-900">{home.facility_name}</div>
                        <div className="text-xs text-slate-500">{home.contact_email}</div>
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {home.city}, {home.state}
                      </td>
                      <td className="py-3 pr-4 text-slate-600 font-mono text-xs">
                        {home.license_number}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {home.total_beds ?? '—'} / {home.rooms_available ?? '—'}
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={home.verification_status} />
                      </td>
                      <td className="py-3 pr-4 text-slate-500">{formatDate(home.created_at)}</td>
                      {tab === 'pending' && (
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-green-600 hover:bg-green-50 text-xs"
                              onClick={() => setActionModal({ home, action: 'approve' })}
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              Approve
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:bg-red-50 text-xs"
                              onClick={() => setActionModal({ home, action: 'reject' })}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Reject
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Action modal */}
      <Modal
        open={!!actionModal}
        onClose={() => setActionModal(null)}
        title={actionModal?.action === 'approve' ? 'Approve Care Home' : 'Reject Care Home'}
        size="sm"
      >
        {actionModal && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {actionModal.action === 'approve' ? (
                <>
                  Approve <strong>{actionModal.home.facility_name}</strong>? They will be listed as a verified care home on the platform.
                </>
              ) : (
                <>
                  Reject <strong>{actionModal.home.facility_name}</strong>? They will be notified and will need to re-apply.
                </>
              )}
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setActionModal(null)}>
                Cancel
              </Button>
              <Button
                variant={actionModal.action === 'approve' ? 'primary' : 'danger'}
                className="flex-1"
                loading={actionMutation.isPending}
                onClick={() => actionMutation.mutate({ homeId: actionModal.home.id, action: actionModal.action })}
              >
                {actionModal.action === 'approve' ? 'Approve' : 'Reject'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
