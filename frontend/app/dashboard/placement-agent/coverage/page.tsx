'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { useAuth } from '@/lib/hooks';
import { get, post, del } from '@/lib/api';
import { Plus, Trash2, MapPin } from 'lucide-react';

interface CoverageArea {
  id: string;
  area_type: 'city' | 'zip' | 'county';
  area_value: string;
  state: string;
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

export default function CoverageAreasPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [areaType, setAreaType] = useState<'city' | 'zip' | 'county'>('city');
  const [areaValue, setAreaValue] = useState('');
  const [state, setState] = useState('');
  const [formError, setFormError] = useState('');

  const { data: areas = [], isLoading } = useQuery({
    queryKey: ['coverage-areas', user?.id],
    queryFn: () => get<{ coverageAreas: CoverageArea[] }>('/placement-agents/me/coverage').then((d) => d.coverageAreas ?? []),
    enabled: !!user,
  });

  const addMutation = useMutation({
    mutationFn: (data: Omit<CoverageArea, 'id'>) =>
      post('/agents/me/coverage-areas', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coverage-areas'] });
      setAreaValue('');
      setState('');
      setFormError('');
    },
    onError: (err: Error) => {
      setFormError(err.message || 'Failed to add coverage area.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/agents/me/coverage-areas/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coverage-areas'] });
    },
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!areaValue.trim()) {
      setFormError('Please enter a value for the coverage area.');
      return;
    }
    if (!state) {
      setFormError('Please select a state.');
      return;
    }
    addMutation.mutate({ area_type: areaType, area_value: areaValue.trim(), state });
  }

  const groupedAreas = areas.reduce<Record<string, CoverageArea[]>>((acc, area) => {
    if (!acc[area.area_type]) acc[area.area_type] = [];
    acc[area.area_type].push(area);
    return acc;
  }, {});

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Coverage Areas</h1>
          <p className="text-slate-500 mt-1">
            Define the geographic areas you cover for patient placements
          </p>
        </div>

        {/* Add new area */}
        <Card title="Add Coverage Area">
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Select
                label="Area Type"
                id="area-type"
                value={areaType}
                onChange={(e) => setAreaType(e.target.value as 'city' | 'zip' | 'county')}
                required
              >
                <option value="city">City</option>
                <option value="zip">ZIP Code</option>
                <option value="county">County</option>
              </Select>
              <Input
                label={areaType === 'city' ? 'City Name' : areaType === 'zip' ? 'ZIP Code' : 'County Name'}
                id="area-value"
                value={areaValue}
                onChange={(e) => setAreaValue(e.target.value)}
                placeholder={
                  areaType === 'city' ? 'San Francisco' :
                  areaType === 'zip' ? '94102' :
                  'San Francisco County'
                }
                required
              />
              <Select
                label="State"
                id="area-state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                required
              >
                <option value="">Select state</option>
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>

            {formError && (
              <p className="text-sm text-red-600">{formError}</p>
            )}

            <Button
              type="submit"
              variant="primary"
              loading={addMutation.isPending}
            >
              <Plus className="w-4 h-4" />
              Add Coverage Area
            </Button>
          </form>
        </Card>

        {/* Current coverage areas */}
        <Card title={`Current Coverage Areas (${areas.length})`}>
          {isLoading ? (
            <div className="py-6 text-center text-slate-400">Loading...</div>
          ) : areas.length === 0 ? (
            <div className="py-8 text-center text-slate-400">
              <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No coverage areas defined yet.</p>
              <p className="text-xs mt-1">Add your first coverage area above.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {(['city', 'county', 'zip'] as const).map((type) => {
                const group = groupedAreas[type];
                if (!group || group.length === 0) return null;
                return (
                  <div key={type}>
                    <h4 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wide">
                      {type === 'zip' ? 'ZIP Codes' : type === 'city' ? 'Cities' : 'Counties'} ({group.length})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {group.map((area) => (
                        <div
                          key={area.id}
                          className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5"
                        >
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-sm text-slate-700 font-medium">
                            {area.area_value}, {area.state}
                          </span>
                          <button
                            onClick={() => deleteMutation.mutate(area.id)}
                            className="text-slate-400 hover:text-red-500 transition-colors ml-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
