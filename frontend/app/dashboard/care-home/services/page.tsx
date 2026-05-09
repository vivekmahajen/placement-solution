'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useAuth } from '@/lib/hooks';
import { get, put } from '@/lib/api';
import { CheckCircle } from 'lucide-react';

const ALL_SERVICES = [
  'Assisted Living',
  'Skilled Nursing',
  'Memory Care',
  'Dementia Care',
  'Hospice',
  'Physical Therapy',
  'Occupational Therapy',
  'Speech Therapy',
  'Diabetic Care',
  'Wound Care',
  'Incontinence Care',
  'Medication Management',
  'Behavioral Health',
  'IV Therapy',
  'Oxygen Therapy',
  'Tracheotomy Care',
  'G-Tube Care',
  'Fall Prevention',
  'Transportation',
  'Social Activities',
  'Housekeeping',
  'Laundry',
  'Nutritional Support',
  'Bariatric Care',
];

interface ServiceEntry {
  service_name: string;
  additional_cost: number;
}

export default function CareHomeServicesPage() {
  const { user } = useAuth();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const { data: services, isLoading } = useQuery({
    queryKey: ['care-home-services', user?.id],
    queryFn: () => get<{ services: ServiceEntry[] }>('/care-homes/me/services').then((d) => d.services ?? []),
    enabled: !!user,
  });

  useEffect(() => {
    if (services) {
      const sel = new Set(services.map((s) => s.service_name));
      const cost: Record<string, string> = {};
      services.forEach((s) => {
        cost[s.service_name] = String(s.additional_cost);
      });
      setSelected(sel);
      setCosts(cost);
    }
  }, [services]);

  const saveMutation = useMutation({
    mutationFn: (data: ServiceEntry[]) => put('/care-homes/me/services', { services: data }),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  function toggleService(name: string) {
    const next = new Set(selected);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setSelected(next);
  }

  function handleSave() {
    const payload: ServiceEntry[] = Array.from(selected).map((name) => ({
      service_name: name,
      additional_cost: parseFloat(costs[name] || '0') || 0,
    }));
    saveMutation.mutate(payload);
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Services Offered</h1>
            <p className="text-slate-500 mt-1">Select the services your facility provides and set additional costs</p>
          </div>
          <Button
            variant="primary"
            onClick={handleSave}
            loading={saveMutation.isPending}
          >
            {saved ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Saved!
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>

        {saveMutation.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {saveMutation.error instanceof Error ? saveMutation.error.message : 'Failed to save services'}
          </div>
        )}

        <Card title={`Services (${selected.size} selected)`}>
          {isLoading ? (
            <div className="py-8 text-center text-slate-400">Loading services...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ALL_SERVICES.map((service) => {
                const checked = selected.has(service);
                return (
                  <div
                    key={service}
                    className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                      checked
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                    onClick={() => toggleService(service)}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleService(service)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-800">{service}</span>
                    </div>
                    {checked && (
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs text-slate-500 whitespace-nowrap">+$</span>
                        <input
                          type="number"
                          value={costs[service] ?? '0'}
                          onChange={(e) => setCosts({ ...costs, [service]: e.target.value })}
                          min="0"
                          step="1"
                          className="w-20 text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="0"
                        />
                        <span className="text-xs text-slate-500">/mo</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={handleSave}
            loading={saveMutation.isPending}
            className="px-8"
          >
            {saved ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Saved!
              </>
            ) : (
              'Save All Changes'
            )}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
