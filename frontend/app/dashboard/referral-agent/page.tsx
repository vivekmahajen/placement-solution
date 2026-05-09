'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { useAuth } from '@/lib/hooks';
import { get } from '@/lib/api';
import { formatDate, patientRef } from '@/lib/utils';
import { UserPlus, Users, ClipboardList, Lock, CheckCircle, ArrowRight } from 'lucide-react';

interface PatientStats {
  total: number;
  queued: number;
  locked: number;
  placed: number;
}

interface RecentPatient {
  id: string;
  created_at: string;
  status: string;
  preferred_city: string;
  preferred_zip: string;
}

export default function ReferralAgentDashboard() {
  const { user } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ['referral-stats', user?.id],
    queryFn: () => get<PatientStats>('/patients/stats'),
    enabled: !!user,
  });

  const { data: recentPatients = [] } = useQuery({
    queryKey: ['recent-patients', user?.id],
    queryFn: () => get<RecentPatient[]>('/patients?limit=5'),
    enabled: !!user,
  });

  const statsCards = [
    { label: 'Total Referred', value: stats?.total ?? 0, icon: Users, color: 'blue' },
    { label: 'In Queue', value: stats?.queued ?? 0, icon: ClipboardList, color: 'indigo' },
    { label: 'Locked / In Progress', value: stats?.locked ?? 0, icon: Lock, color: 'yellow' },
    { label: 'Placed', value: stats?.placed ?? 0, icon: CheckCircle, color: 'green' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Referral Agent Dashboard</h1>
            <p className="text-slate-500 mt-1">Track your patient referrals and placements</p>
          </div>
          <Link href="/dashboard/referral-agent/new-patient">
            <Button variant="primary">
              <UserPlus className="w-4 h-4" />
              Add New Patient
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statsCards.map((card) => {
            const Icon = card.icon;
            const colorMap: Record<string, string> = {
              blue: 'bg-blue-50 text-blue-600',
              indigo: 'bg-indigo-50 text-indigo-600',
              yellow: 'bg-yellow-50 text-yellow-600',
              green: 'bg-green-50 text-green-600',
            };
            return (
              <div key={card.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-slate-500">{card.label}</span>
                  <div className={`p-2 rounded-lg ${colorMap[card.color]}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-slate-900">{card.value}</div>
              </div>
            );
          })}
        </div>

        {/* Recent patients */}
        <Card
          title="Recent Patients"
          headerAction={
            <Link href="/dashboard/referral-agent/patients">
              <Button variant="secondary" size="sm">
                View All <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          }
        >
          {recentPatients.length === 0 ? (
            <div className="py-8 text-center text-slate-400">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No patients referred yet.</p>
              <Link href="/dashboard/referral-agent/new-patient">
                <Button variant="primary" size="sm" className="mt-4">
                  <UserPlus className="w-4 h-4" />
                  Refer First Patient
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-slate-100">
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ref #</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Location</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Submitted</th>
                    <th className="pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recentPatients.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="py-3 pr-4 font-mono font-semibold text-slate-900">
                        {patientRef(p.id)}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {p.preferred_city || p.preferred_zip || '—'}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">{formatDate(p.created_at)}</td>
                      <td className="py-3">
                        <StatusBadge status={p.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
