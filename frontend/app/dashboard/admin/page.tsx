'use client';

import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAuth } from '@/lib/hooks';
import { get } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import {
  Building2, Users, UserCheck, ClipboardList, Lock,
  CheckCircle, DollarSign, TrendingUp, AlertTriangle,
} from 'lucide-react';

interface AdminStats {
  care_homes: {
    active: number;
    pending_verification: number;
  };
  placement_agents: {
    active: number;
    on_trial: number;
  };
  referral_agents: {
    active: number;
    on_trial: number;
  };
  patients: {
    in_queue: number;
    locked: number;
    placed_this_month: number;
  };
  revenue: {
    mrr: number;
    trial_conversions_this_month: number;
    expiring_trials_30_days: number;
  };
}

interface StatCardProps {
  label: string;
  value: number | string;
  sub?: string;
  subValue?: number | string;
  icon: React.ElementType;
  color: string;
}

function StatCard({ label, value, sub, subValue, icon: Icon, color }: StatCardProps) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    teal: 'bg-teal-50 text-teal-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <div className={`p-2 rounded-lg ${colorMap[color] ?? 'bg-slate-50 text-slate-600'}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-3xl font-bold text-slate-900 mb-1">{value}</div>
      {sub && (
        <div className="text-xs text-slate-500">
          {sub}: <span className="font-semibold text-slate-700">{subValue}</span>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => get<AdminStats>('/admin/stats'),
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="py-12 text-center text-slate-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3" />
          Loading dashboard...
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
          <p className="text-slate-500 mt-1">Platform overview and management</p>
        </div>

        {/* Care Homes */}
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Care Homes</h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              label="Active Care Homes"
              value={stats?.care_homes.active ?? 0}
              sub="Pending verification"
              subValue={stats?.care_homes.pending_verification ?? 0}
              icon={Building2}
              color="teal"
            />
          </div>
        </div>

        {/* Agents */}
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Agents</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Active Placement Agents"
              value={stats?.placement_agents.active ?? 0}
              sub="On trial"
              subValue={stats?.placement_agents.on_trial ?? 0}
              icon={Users}
              color="blue"
            />
            <StatCard
              label="Active Referral Agents"
              value={stats?.referral_agents.active ?? 0}
              sub="On trial"
              subValue={stats?.referral_agents.on_trial ?? 0}
              icon={UserCheck}
              color="indigo"
            />
          </div>
        </div>

        {/* Patients */}
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Patients</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="In Queue"
              value={stats?.patients.in_queue ?? 0}
              icon={ClipboardList}
              color="yellow"
            />
            <StatCard
              label="Currently Locked"
              value={stats?.patients.locked ?? 0}
              icon={Lock}
              color="indigo"
            />
            <StatCard
              label="Placed This Month"
              value={stats?.patients.placed_this_month ?? 0}
              icon={CheckCircle}
              color="green"
            />
          </div>
        </div>

        {/* Revenue */}
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Revenue</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Monthly Recurring Revenue"
              value={stats?.revenue.mrr ? `$${stats.revenue.mrr.toLocaleString()}` : '$0'}
              icon={DollarSign}
              color="green"
            />
            <StatCard
              label="Trial Conversions (Month)"
              value={stats?.revenue.trial_conversions_this_month ?? 0}
              icon={TrendingUp}
              color="teal"
            />
            <StatCard
              label="Trials Expiring (30 days)"
              value={stats?.revenue.expiring_trials_30_days ?? 0}
              icon={AlertTriangle}
              color="yellow"
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
