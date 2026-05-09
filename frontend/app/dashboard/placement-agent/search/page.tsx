'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { useAuth } from '@/lib/hooks';
import { get } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Search, MapPin, Phone, BedDouble, DollarSign, Users, Building2 } from 'lucide-react';

interface CareHomeResult {
  id: string;
  facility_name: string;
  address_line1: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  phone: string;
  email: string;
  facility_type: string;
  room_type: string;
  gender_preference: string;
  rooms_available: number;
  base_price_monthly: number;
  services: string[];
}

const GENDER_LABELS: Record<string, string> = {
  any: 'Any',
  male: 'Male only',
  female: 'Female only',
};

const ROOM_TYPE_LABELS: Record<string, string> = {
  private: 'Private',
  shared: 'Shared',
};

export default function CareHomeSearchPage() {
  useAuth();

  const [city, setCity] = useState('');
  const [zip, setZip] = useState('');
  const [gender, setGender] = useState('');
  const [roomType, setRoomType] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');

  const [results, setResults] = useState<CareHomeResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams();
      if (city.trim()) params.set('city', city.trim());
      if (zip.trim()) params.set('zip', zip.trim());
      if (gender) params.set('gender', gender);
      if (roomType) params.set('room_type', roomType);
      if (budgetMin) params.set('budget_min', budgetMin);
      if (budgetMax) params.set('budget_max', budgetMax);

      const data = await get<{ careHomes: CareHomeResult[]; total: number }>(
        `/care-homes/search?${params.toString()}`
      );
      setResults(data.careHomes ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Search failed. Please try again.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setCity('');
    setZip('');
    setGender('');
    setRoomType('');
    setBudgetMin('');
    setBudgetMax('');
    setResults(null);
    setSearched(false);
    setError('');
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Search Care Homes</h1>
          <p className="text-slate-500 mt-1">Find matching facilities based on patient requirements</p>
        </div>

        {/* Search form */}
        <Card title="Search Criteria">
          <form onSubmit={handleSearch} className="space-y-5">
            {/* Location */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Location</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="City"
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="San Francisco"
                />
                <Input
                  label="ZIP Code"
                  id="zip"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder="94102"
                />
              </div>
            </div>

            {/* Room & gender */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Room Preferences</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="Room Type"
                  id="room-type"
                  value={roomType}
                  onChange={(e) => setRoomType(e.target.value)}
                >
                  <option value="">Any room type</option>
                  <option value="private">Private room</option>
                  <option value="shared">Shared room</option>
                </Select>
                <Select
                  label="Gender Preference"
                  id="gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="">Any gender preference</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </Select>
              </div>
            </div>

            {/* Budget */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Monthly Budget</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Minimum ($/mo)"
                  id="budget-min"
                  type="number"
                  value={budgetMin}
                  onChange={(e) => setBudgetMin(e.target.value)}
                  placeholder="2000"
                  min="0"
                />
                <Input
                  label="Maximum ($/mo)"
                  id="budget-max"
                  type="number"
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(e.target.value)}
                  placeholder="5000"
                  min="0"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <div className="flex gap-3 pt-1">
              <Button type="submit" variant="primary" loading={loading}>
                <Search className="w-4 h-4" />
                Search Care Homes
              </Button>
              {searched && (
                <Button type="button" variant="secondary" onClick={handleClear}>
                  Clear
                </Button>
              )}
            </div>
          </form>
        </Card>

        {/* Results */}
        {searched && !loading && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">
                {results && results.length > 0
                  ? `${results.length} care home${results.length !== 1 ? 's' : ''} found`
                  : 'No care homes found'}
              </h2>
              {results && results.length > 0 && (
                <p className="text-sm text-slate-500">Sorted alphabetically</p>
              )}
            </div>

            {results && results.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 py-12 text-center text-slate-400">
                <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No care homes match your criteria</p>
                <p className="text-xs mt-1">Try broadening your search — fewer filters, wider budget range, or a different location.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {(results ?? []).map((home) => (
                  <div
                    key={`${home.id}-${home.room_type}-${home.gender_preference}`}
                    className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">{home.facility_name}</h3>
                        {home.facility_type && (
                          <span className="inline-block mt-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded capitalize">
                            {home.facility_type.replace(/_/g, ' ')}
                          </span>
                        )}
                        <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-2">
                          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                          {home.address_line1}, {home.city}, {home.state} {home.zip}
                          {home.county && <span className="text-slate-400">· {home.county}</span>}
                        </div>
                        {home.phone && (
                          <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-0.5">
                            <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                            {home.phone}
                          </div>
                        )}
                      </div>

                      {/* Price badge */}
                      <div className="text-right flex-shrink-0">
                        <div className="text-2xl font-bold text-slate-900">
                          {formatCurrency(home.base_price_monthly)}
                        </div>
                        <div className="text-xs text-slate-400">per month</div>
                      </div>
                    </div>

                    {/* Key info pills */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs font-medium px-3 py-1.5 rounded-full">
                        <BedDouble className="w-3.5 h-3.5" />
                        {ROOM_TYPE_LABELS[home.room_type] ?? home.room_type} room
                      </div>
                      <div className="flex items-center gap-1.5 bg-purple-50 text-purple-700 text-xs font-medium px-3 py-1.5 rounded-full">
                        <Users className="w-3.5 h-3.5" />
                        {GENDER_LABELS[home.gender_preference] ?? home.gender_preference}
                      </div>
                      <div className="flex items-center gap-1.5 bg-green-50 text-green-700 text-xs font-medium px-3 py-1.5 rounded-full">
                        <DollarSign className="w-3.5 h-3.5" />
                        {home.rooms_available} room{home.rooms_available !== 1 ? 's' : ''} available
                      </div>
                    </div>

                    {/* Services */}
                    {home.services && home.services.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Services Offered</p>
                        <div className="flex flex-wrap gap-1.5">
                          {home.services.slice(0, 8).map((s) => (
                            <span key={s} className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded">
                              {s}
                            </span>
                          ))}
                          {home.services.length > 8 && (
                            <span className="text-xs text-slate-400 self-center">
                              +{home.services.length - 8} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
