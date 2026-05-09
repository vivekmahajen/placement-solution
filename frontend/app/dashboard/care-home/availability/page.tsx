'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import { useAuth } from '@/lib/hooks';
import { get, post, put, del } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Plus, Pencil, Trash2 } from 'lucide-react';

interface AvailabilityRecord {
  id: string;
  room_type: 'private' | 'shared';
  gender_preference: 'male' | 'female' | 'any';
  rooms_available: number;
  base_price_monthly: number;
}

interface FormState {
  room_type: 'private' | 'shared';
  gender_preference: 'male' | 'female' | 'any';
  rooms_available: string;
  base_price_monthly: string;
}

const defaultForm: FormState = {
  room_type: 'private',
  gender_preference: 'any',
  rooms_available: '',
  base_price_monthly: '',
};

export default function CareHomeAvailabilityPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AvailabilityRecord | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['care-home-availability', user?.id],
    queryFn: () => get<{ availability: AvailabilityRecord[] }>('/care-homes/me/availability').then((d) => d.availability ?? []),
    enabled: !!user,
  });

  const saveMutation = useMutation({
    mutationFn: (data: Omit<AvailabilityRecord, 'id'>) => {
      if (editing) {
        return put(`/care-homes/me/availability/${editing.id}`, data);
      }
      return post('/care-homes/me/availability', data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['care-home-availability'] });
      setModalOpen(false);
      setEditing(null);
      setForm(defaultForm);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/care-homes/me/availability/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['care-home-availability'] });
      setDeleteConfirm(null);
    },
  });

  function openAdd() {
    setEditing(null);
    setForm(defaultForm);
    setModalOpen(true);
  }

  function openEdit(rec: AvailabilityRecord) {
    setEditing(rec);
    setForm({
      room_type: rec.room_type,
      gender_preference: rec.gender_preference,
      rooms_available: String(rec.rooms_available),
      base_price_monthly: String(rec.base_price_monthly),
    });
    setModalOpen(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    saveMutation.mutate({
      room_type: form.room_type,
      gender_preference: form.gender_preference,
      rooms_available: parseInt(form.rooms_available, 10),
      base_price_monthly: parseFloat(form.base_price_monthly),
    });
  }

  const columns = [
    {
      key: 'room_type',
      header: 'Room Type',
      render: (row: AvailabilityRecord) => (
        <span className="capitalize font-medium">{row.room_type}</span>
      ),
    },
    {
      key: 'gender_preference',
      header: 'Gender Preference',
      render: (row: AvailabilityRecord) => (
        <span className="capitalize">{row.gender_preference}</span>
      ),
    },
    {
      key: 'rooms_available',
      header: 'Rooms Available',
      render: (row: AvailabilityRecord) => (
        <span className="font-semibold text-slate-900">{row.rooms_available}</span>
      ),
    },
    {
      key: 'base_price_monthly',
      header: 'Base Price',
      render: (row: AvailabilityRecord) => formatCurrency(row.base_price_monthly),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row: AvailabilityRecord) => (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-500 hover:text-red-700 hover:bg-red-50"
            onClick={() => setDeleteConfirm(row.id)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Room Availability</h1>
          <p className="text-slate-500 mt-1">Manage room types, availability, and pricing</p>
        </div>

        <Card
          title="Current Availability"
          headerAction={
            <Button variant="primary" size="sm" onClick={openAdd}>
              <Plus className="w-4 h-4" />
              Add Room Type
            </Button>
          }
        >
          <Table<AvailabilityRecord>
            columns={columns}
            data={records}
            keyExtractor={(r) => r.id}
            loading={isLoading}
            emptyMessage="No availability records yet. Add your first room type."
          />
        </Card>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Room Type' : 'Add Room Type'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Select
            label="Room Type"
            id="room_type"
            value={form.room_type}
            onChange={(e) => setForm({ ...form, room_type: e.target.value as 'private' | 'shared' })}
            required
          >
            <option value="private">Private</option>
            <option value="shared">Shared</option>
          </Select>

          <Select
            label="Gender Preference"
            id="gender_preference"
            value={form.gender_preference}
            onChange={(e) => setForm({ ...form, gender_preference: e.target.value as 'male' | 'female' | 'any' })}
            required
          >
            <option value="any">Any</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </Select>

          <Input
            label="Rooms Available"
            type="number"
            id="rooms_available"
            value={form.rooms_available}
            onChange={(e) => setForm({ ...form, rooms_available: e.target.value })}
            min="0"
            required
            placeholder="e.g. 3"
          />

          <Input
            label="Base Price (Monthly)"
            type="number"
            id="base_price_monthly"
            value={form.base_price_monthly}
            onChange={(e) => setForm({ ...form, base_price_monthly: e.target.value })}
            min="0"
            step="0.01"
            required
            placeholder="e.g. 4500"
            hint="Enter monthly rate in USD"
          />

          {saveMutation.error && (
            <p className="text-sm text-red-600">
              {saveMutation.error instanceof Error ? saveMutation.error.message : 'Save failed'}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              loading={saveMutation.isPending}
            >
              {editing ? 'Save Changes' : 'Add Room Type'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Room Type"
        size="sm"
      >
        <p className="text-slate-600 text-sm mb-6">
          Are you sure you want to delete this availability record? This cannot be undone.
        </p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setDeleteConfirm(null)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            loading={deleteMutation.isPending}
            onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
