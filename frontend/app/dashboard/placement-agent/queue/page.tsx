'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import { useAuth } from '@/lib/hooks';
import { get, post } from '@/lib/api';
import { formatDate, patientRef } from '@/lib/utils';
import { Search, Lock, AlertTriangle } from 'lucide-react';

interface QueuePatient {
  id: string;
  queued_at: string;
  preferred_city: string;
  preferred_zip: string;
  preferred_county: string;
  budget_min: number;
  budget_max: number;
  room_type_preference: string;
  services_needed: string[];
}

interface QueueResponse {
  total: number;
  items: QueuePatient[];
}

export default function PlacementAgentQueuePage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [filterCity, setFilterCity] = useState('');
  const [filterZip, setFilterZip] = useState('');
  const [filterCounty, setFilterCounty] = useState('');
  const [filterRoomType, setFilterRoomType] = useState('');

  const [lockTarget, setLockTarget] = useState<QueuePatient | null>(null);
  const [lockError, setLockError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['queue', user?.id, filterCity, filterZip, filterCounty, filterRoomType],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterCity) params.set('city', filterCity);
      if (filterZip) params.set('zip', filterZip);
      if (filterCounty) params.set('county', filterCounty);
      if (filterRoomType) params.set('room_type', filterRoomType);
      const q = params.toString();
      return get<{ queue: QueuePatient[] }>(`/queue${q ? '?' + q : ''}`)
        .then((d) => ({ total: d.queue?.length ?? 0, items: d.queue ?? [] }));
    },
    enabled: !!user,
  });

  const lockMutation = useMutation({
    mutationFn: (patientId: string) => post(`/queue/lock/${patientId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['my-assignments'] });
      setLockTarget(null);
      setLockError('');
    },
    onError: (err: Error) => {
      setLockError(err.message || 'Failed to lock patient. Please try again.');
    },
  });

  const patients = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Patient Queue</h1>
          <p className="text-slate-500 mt-1">{total} patient{total !== 1 ? 's' : ''} available for placement</p>
        </div>

        {/* Filters */}
        <Card title="Filter Queue">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Input
              label="City"
              id="filter-city"
              value={filterCity}
              onChange={(e) => setFilterCity(e.target.value)}
              placeholder="San Francisco"
            />
            <Input
              label="ZIP Code"
              id="filter-zip"
              value={filterZip}
              onChange={(e) => setFilterZip(e.target.value)}
              placeholder="94102"
            />
            <Input
              label="County"
              id="filter-county"
              value={filterCounty}
              onChange={(e) => setFilterCounty(e.target.value)}
              placeholder="San Francisco County"
            />
            <Select
              label="Room Type"
              id="filter-room-type"
              value={filterRoomType}
              onChange={(e) => setFilterRoomType(e.target.value)}
            >
              <option value="">All Types</option>
              <option value="private">Private</option>
              <option value="shared">Shared</option>
              <option value="no_preference">No Preference</option>
            </Select>
          </div>
          <div className="mt-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setFilterCity('');
                setFilterZip('');
                setFilterCounty('');
                setFilterRoomType('');
              }}
            >
              <Search className="w-3.5 h-3.5" />
              Clear Filters
            </Button>
          </div>
        </Card>

        {/* Queue list */}
        {isLoading ? (
          <div className="py-12 text-center text-slate-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3" />
            Loading queue...
          </div>
        ) : patients.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-12 text-center text-slate-400">
            <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No patients match your filters.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {patients.map((patient) => (
              <div
                key={patient.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="font-mono font-bold text-slate-900 text-lg">
                        Ref #{patientRef(patient.id)}
                      </span>
                      <span className="text-xs text-slate-400">
                        Queued {formatDate(patient.queued_at)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-0.5">Location</span>
                        <span className="text-slate-700">
                          {patient.preferred_city || patient.preferred_zip || patient.preferred_county || 'Not specified'}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-0.5">Budget</span>
                        <span className="text-slate-700">
                          {patient.budget_min && patient.budget_max
                            ? `$${patient.budget_min.toLocaleString()} – $${patient.budget_max.toLocaleString()}/mo`
                            : 'Not specified'}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-0.5">Room Preference</span>
                        <span className="text-slate-700 capitalize">
                          {patient.room_type_preference?.replace('_', ' ') || 'No preference'}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-0.5">Services Needed</span>
                        <span className="text-slate-700">
                          {patient.services_needed?.length ?? 0} services
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setLockTarget(patient);
                      setLockError('');
                    }}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Lock Patient
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lock Confirmation Modal */}
      <Modal
        open={!!lockTarget}
        onClose={() => {
          setLockTarget(null);
          setLockError('');
        }}
        title="Lock Patient Assignment"
        size="md"
      >
        {lockTarget && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-amber-800 mb-1">One Attempt Warning</h4>
                  <p className="text-sm text-amber-700">
                    Are you sure you want to lock <strong>Ref #{patientRef(lockTarget.id)}</strong>?
                    You will have <strong>4 days</strong> to complete the placement.
                    This is your <strong>one attempt</strong> — you cannot re-lock this patient.
                  </p>
                </div>
              </div>
            </div>

            {lockError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {lockError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setLockTarget(null);
                  setLockError('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                loading={lockMutation.isPending}
                onClick={() => lockMutation.mutate(lockTarget.id)}
              >
                <Lock className="w-4 h-4" />
                Confirm Lock
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
