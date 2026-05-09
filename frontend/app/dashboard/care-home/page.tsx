'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { useAuth } from '@/lib/hooks';
import { get } from '@/lib/api';
import { BedDouble, ListChecks, User, ArrowRight } from 'lucide-react';

interface CareHomeProfile {
  id: string;
  facility_name: string;
  verification_status: string;
  total_beds: number;
}

interface AvailabilitySummary {
  private_rooms_available: number;
  shared_rooms_available: number;
  total_rooms_available: number;
}

export default function CareHomeDashboard() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ['care-home-profile', user?.id],
    queryFn: () => get<CareHomeProfile>('/care-homes/me'),
    enabled: !!user,
  });

  const { data: availability } = useQuery({
    queryKey: ['care-home-availability-summary', user?.id],
    queryFn: () => get<AvailabilitySummary>('/care-homes/me/availability/summary'),
    enabled: !!user,
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {profile?.facility_name ?? 'Care Home Dashboard'}
          </h1>
          <p className="text-slate-500 mt-1">Manage your facility availability and services</p>
        </div>

        {/* Verification status */}
        {profile?.verification_status === 'pending_verification' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
            <strong>Pending Verification:</strong> Your facility is under review. You will be notified once approved.
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-500">Total Beds</span>
              <div className="p-2 bg-blue-50 rounded-lg">
                <BedDouble className="w-4 h-4 text-blue-600" />
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-900">{profile?.total_beds ?? '—'}</div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-500">Private Rooms Available</span>
              <div className="p-2 bg-green-50 rounded-lg">
                <BedDouble className="w-4 h-4 text-green-600" />
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-900">
              {availability?.private_rooms_available ?? '—'}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-500">Shared Rooms Available</span>
              <div className="p-2 bg-teal-50 rounded-lg">
                <User className="w-4 h-4 text-teal-600" />
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-900">
              {availability?.shared_rooms_available ?? '—'}
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <Card title="Quick Actions">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link href="/dashboard/care-home/availability">
              <div className="border border-slate-200 hover:border-blue-300 hover:bg-blue-50 rounded-xl p-5 transition-colors cursor-pointer group">
                <BedDouble className="w-8 h-8 text-blue-600 mb-3" />
                <h3 className="font-semibold text-slate-900 mb-1 group-hover:text-blue-700">
                  Update Availability
                </h3>
                <p className="text-sm text-slate-500">Manage room types and availability counts</p>
                <div className="mt-3 flex items-center gap-1 text-xs text-blue-600 font-medium">
                  Manage <ArrowRight className="w-3 h-3" />
                </div>
              </div>
            </Link>

            <Link href="/dashboard/care-home/services">
              <div className="border border-slate-200 hover:border-teal-300 hover:bg-teal-50 rounded-xl p-5 transition-colors cursor-pointer group">
                <ListChecks className="w-8 h-8 text-teal-600 mb-3" />
                <h3 className="font-semibold text-slate-900 mb-1 group-hover:text-teal-700">
                  Manage Services
                </h3>
                <p className="text-sm text-slate-500">Update your service offerings and pricing</p>
                <div className="mt-3 flex items-center gap-1 text-xs text-teal-600 font-medium">
                  Manage <ArrowRight className="w-3 h-3" />
                </div>
              </div>
            </Link>

            <div className="border border-slate-200 rounded-xl p-5">
              <User className="w-8 h-8 text-slate-400 mb-3" />
              <h3 className="font-semibold text-slate-900 mb-1">Edit Profile</h3>
              <p className="text-sm text-slate-500">Update facility information and contact details</p>
              <Button variant="ghost" size="sm" className="mt-3 text-xs" disabled>
                Coming Soon
              </Button>
            </div>
          </div>
        </Card>

        {/* Recent Activity */}
        <Card title="Recent Activity" description="Latest placement activity for your facility">
          <div className="py-8 text-center text-slate-400">
            <ListChecks className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No recent activity to display.</p>
            <p className="text-xs mt-1">Placement proposals will appear here.</p>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
