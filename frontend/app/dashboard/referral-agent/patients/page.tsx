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
import { UserPlus, Users } from 'lucide-react';

interface Patient {
  id: string;
  created_at: string;
  status: string;
  preferred_city: string;
  preferred_zip: string;
  preferred_county: string;
  room_type_preference: string;
  services_needed: string[];
  budget_min: number;
  budget_max: number;
}

export default function ReferralAgentPatientsPage() {
  const { user } = useAuth();

  const { data: patients = [], isLoading } = useQuery({
    queryKey: ['my-patients', user?.id],
    queryFn: () => get<{ patients: Patient[] }>('/patients').then((d) => d.patients ?? []),
    enabled: !!user,
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Patients</h1>
            <p className="text-slate-500 mt-1">{patients.length} total referral{patients.length !== 1 ? 's' : ''}</p>
          </div>
          <Link href="/dashboard/referral-agent/new-patient">
            <Button variant="primary">
              <UserPlus className="w-4 h-4" />
              Add Patient
            </Button>
          </Link>
        </div>

        <Card>
          {isLoading ? (
            <div className="py-8 text-center text-slate-400">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2" />
              Loading patients...
            </div>
          ) : patients.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-sm font-medium">No patients referred yet</p>
              <p className="text-xs mt-1 mb-4">Submit a new patient referral to get started.</p>
              <Link href="/dashboard/referral-agent/new-patient">
                <Button variant="primary" size="sm">
                  <UserPlus className="w-4 h-4" />
                  Refer First Patient
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100">
                  <tr className="text-left">
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ref #</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Preferred Location</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Room Pref.</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Budget</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Services</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Submitted</th>
                    <th className="pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {patients.map((patient) => (
                    <tr key={patient.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 pr-4">
                        <span className="font-mono font-bold text-slate-900">
                          {patientRef(patient.id)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {patient.preferred_city || patient.preferred_zip || patient.preferred_county || '—'}
                      </td>
                      <td className="py-3 pr-4 text-slate-600 capitalize">
                        {patient.room_type_preference?.replace('_', ' ') || '—'}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {patient.budget_min && patient.budget_max
                          ? `$${patient.budget_min.toLocaleString()}–$${patient.budget_max.toLocaleString()}/mo`
                          : '—'}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {patient.services_needed?.length ?? 0}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {formatDate(patient.created_at)}
                      </td>
                      <td className="py-3">
                        <StatusBadge status={patient.status} />
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
