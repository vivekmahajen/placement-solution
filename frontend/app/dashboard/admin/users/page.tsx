'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import { StatusBadge } from '@/components/ui/Badge';
import { useAuth } from '@/lib/hooks';
import { get, post } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface User {
  id: string;
  email: string;
  role: string;
  status: string;
  subscription_status: string;
  created_at: string;
}

type Action = 'suspend' | 'reinstate' | 'extend_trial';

const roleLabels: Record<string, string> = {
  care_home: 'Care Home',
  placement_agent: 'Placement Agent',
  referral_agent: 'Referral Agent',
  admin: 'Admin',
};

export default function AdminUsersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [actionModal, setActionModal] = useState<{ user: User; action: Action } | null>(null);
  const [extensionDays, setExtensionDays] = useState('30');
  const [actionError, setActionError] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users', filterRole, filterStatus],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterRole) params.set('role', filterRole);
      if (filterStatus) params.set('status', filterStatus);
      const q = params.toString();
      return get<{ users: User[] }>(`/admin/users${q ? '?' + q : ''}`).then((d) => d.users ?? []);
    },
    enabled: !!user,
  });

  const actionMutation = useMutation({
    mutationFn: ({ userId, action, days }: { userId: string; action: Action; days?: number }) =>
      post(`/admin/users/${userId}/${action}`, days ? { days } : undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      setActionModal(null);
      setActionError('');
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Action failed. Please try again.');
    },
  });

  function performAction() {
    if (!actionModal) return;
    actionMutation.mutate({
      userId: actionModal.user.id,
      action: actionModal.action,
      days: actionModal.action === 'extend_trial' ? parseInt(extensionDays) : undefined,
    });
  }

  const actionLabels: Record<Action, string> = {
    suspend: 'Suspend User',
    reinstate: 'Reinstate User',
    extend_trial: 'Extend Trial',
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-slate-500 mt-1">{users.length} users found</p>
        </div>

        {/* Filters */}
        <Card title="Filters">
          <div className="flex gap-4">
            <Select
              label="Role"
              id="filter-role"
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
            >
              <option value="">All Roles</option>
              <option value="care_home">Care Home</option>
              <option value="placement_agent">Placement Agent</option>
              <option value="referral_agent">Referral Agent</option>
              <option value="admin">Admin</option>
            </Select>
            <Select
              label="Status"
              id="filter-status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="suspended">Suspended</option>
              <option value="expired">Expired</option>
            </Select>
          </div>
        </Card>

        {/* Users table */}
        <Card>
          {isLoading ? (
            <div className="py-8 text-center text-slate-400">Loading users...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100">
                  <tr className="text-left">
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Subscription</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Created</th>
                    <th className="pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">No users found.</td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="py-3 pr-4 text-slate-700 font-medium">{u.email}</td>
                        <td className="py-3 pr-4 text-slate-600">{roleLabels[u.role] ?? u.role}</td>
                        <td className="py-3 pr-4">
                          <StatusBadge status={u.status} />
                        </td>
                        <td className="py-3 pr-4">
                          <StatusBadge status={u.subscription_status} />
                        </td>
                        <td className="py-3 pr-4 text-slate-500">{formatDate(u.created_at)}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-1">
                            {u.status !== 'suspended' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 text-xs"
                                onClick={() => setActionModal({ user: u, action: 'suspend' })}
                              >
                                Suspend
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-green-600 hover:text-green-700 hover:bg-green-50 text-xs"
                                onClick={() => setActionModal({ user: u, action: 'reinstate' })}
                              >
                                Reinstate
                              </Button>
                            )}
                            {(u.subscription_status === 'trial' || u.subscription_status === 'expired') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-blue-600 hover:text-blue-700 text-xs"
                                onClick={() => setActionModal({ user: u, action: 'extend_trial' })}
                              >
                                Extend Trial
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Action modal */}
      <Modal
        open={!!actionModal}
        onClose={() => { setActionModal(null); setActionError(''); }}
        title={actionModal ? actionLabels[actionModal.action] : ''}
        size="sm"
      >
        {actionModal && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {actionModal.action === 'suspend' && (
                <>Are you sure you want to suspend <strong>{actionModal.user.email}</strong>? They will lose access to the platform.</>
              )}
              {actionModal.action === 'reinstate' && (
                <>Reinstate <strong>{actionModal.user.email}</strong> and restore their access?</>
              )}
              {actionModal.action === 'extend_trial' && (
                <>Extend the trial for <strong>{actionModal.user.email}</strong>.</>
              )}
            </p>

            {actionModal.action === 'extend_trial' && (
              <Input
                label="Extension (days)"
                type="number"
                id="extension-days"
                value={extensionDays}
                onChange={(e) => setExtensionDays(e.target.value)}
                min="1"
                max="365"
              />
            )}

            {actionError && (
              <p className="text-sm text-red-600">{actionError}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => { setActionModal(null); setActionError(''); }}
              >
                Cancel
              </Button>
              <Button
                variant={actionModal.action === 'suspend' ? 'danger' : 'primary'}
                className="flex-1"
                loading={actionMutation.isPending}
                onClick={performAction}
              >
                Confirm
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
