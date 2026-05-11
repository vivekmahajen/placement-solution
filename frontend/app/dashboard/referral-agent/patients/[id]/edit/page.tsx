'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { useAuth } from '@/lib/hooks';
import { get, put } from '@/lib/api';
import { ChevronLeft, ChevronRight, AlertCircle, Save } from 'lucide-react';

const ALL_SERVICES = [
  'Assisted Living', 'Skilled Nursing', 'Memory Care', 'Dementia Care',
  'Hospice', 'Physical Therapy', 'Occupational Therapy', 'Speech Therapy',
  'Diabetic Care', 'Wound Care', 'Incontinence Care', 'Medication Management',
  'Behavioral Health', 'IV Therapy', 'Oxygen Therapy', 'Tracheotomy Care',
  'G-Tube Care', 'Fall Prevention', 'Transportation', 'Social Activities',
  'Housekeeping', 'Laundry', 'Nutritional Support', 'Bariatric Care',
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

const STEPS = [
  'Patient Identity',
  'Contact Info',
  'Placement Preferences',
  'Services Needed',
  'Additional Notes',
];

interface PatientFormData {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  sex: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  preferred_city: string;
  preferred_zip: string;
  preferred_county: string;
  budget_min: string;
  budget_max: string;
  room_type_preference: string;
  services_needed: string[];
  additional_notes: string;
}

const emptyForm: PatientFormData = {
  first_name: '', last_name: '', date_of_birth: '', sex: '',
  address: '', city: '', state: '', zip: '', phone: '',
  emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_relationship: '',
  preferred_city: '', preferred_zip: '', preferred_county: '',
  budget_min: '', budget_max: '', room_type_preference: 'no_preference',
  services_needed: [], additional_notes: '',
};

export default function EditPatientPage() {
  useAuth();
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id as string;

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<PatientFormData>(emptyForm);
  const [error, setError] = useState('');
  const [initialized, setInitialized] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['patient', id],
    queryFn: () => get<{ patient: Record<string, unknown>; services: string[] }>(`/patients/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (data && !initialized) {
      const p = data.patient;
      setForm({
        first_name: (p.first_name as string) ?? '',
        last_name: (p.last_name as string) ?? '',
        date_of_birth: p.date_of_birth ? (p.date_of_birth as string).slice(0, 10) : '',
        sex: (p.sex as string) ?? '',
        address: (p.address_line1 as string) ?? '',
        city: (p.city as string) ?? '',
        state: (p.state as string) ?? '',
        zip: (p.zip as string) ?? '',
        phone: (p.phone as string) ?? '',
        emergency_contact_name: (p.emergency_contact_name as string) ?? '',
        emergency_contact_phone: (p.emergency_contact_phone as string) ?? '',
        emergency_contact_relationship: (p.emergency_contact_rel as string) ?? '',
        preferred_city: (p.preferred_city as string) ?? '',
        preferred_zip: (p.preferred_zip as string) ?? '',
        preferred_county: (p.preferred_county as string) ?? '',
        budget_min: p.budget_min != null ? String(p.budget_min) : '',
        budget_max: p.budget_max != null ? String(p.budget_max) : '',
        room_type_preference: (p.room_type_preference as string) ?? 'no_preference',
        services_needed: data.services ?? [],
        additional_notes: (p.notes as string) ?? '',
      });
      setInitialized(true);
    }
  }, [data, initialized]);

  const updateMutation = useMutation({
    mutationFn: () =>
      put(`/patients/${id}`, {
        first_name: form.first_name,
        last_name: form.last_name,
        date_of_birth: form.date_of_birth,
        sex: form.sex,
        address_line1: form.address,
        city: form.city,
        state: form.state,
        zip: form.zip,
        phone: form.phone,
        emergency_contact_name: form.emergency_contact_name,
        emergency_contact_phone: form.emergency_contact_phone,
        emergency_contact_rel: form.emergency_contact_relationship,
        preferred_city: form.preferred_city,
        preferred_zip: form.preferred_zip,
        preferred_county: form.preferred_county,
        budget_min: form.budget_min ? parseInt(form.budget_min) : null,
        budget_max: form.budget_max ? parseInt(form.budget_max) : null,
        room_type_preference: form.room_type_preference,
        notes: form.additional_notes,
        services: form.services_needed,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient', id] });
      queryClient.invalidateQueries({ queryKey: ['my-patients'] });
      router.push('/dashboard/referral-agent/patients');
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to update patient. Please try again.');
    },
  });

  function updateForm(field: keyof PatientFormData, value: string | string[]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleService(service: string) {
    setForm((prev) => {
      const has = prev.services_needed.includes(service);
      return {
        ...prev,
        services_needed: has
          ? prev.services_needed.filter((s) => s !== service)
          : [...prev.services_needed, service],
      };
    });
  }

  function validateStep(): boolean {
    if (step === 0 && (!form.first_name || !form.last_name || !form.date_of_birth || !form.sex)) {
      setError('Please complete all required fields.');
      return false;
    }
    if (step === 1 && (!form.city || !form.state || !form.zip || !form.phone)) {
      setError('Please complete all required fields.');
      return false;
    }
    setError('');
    return true;
  }

  function next() { if (validateStep()) setStep((s) => s + 1); }
  function prev() { setStep((s) => s - 1); setError(''); }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#002B5C]" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-[#1A2B4A]">Edit Patient Referral</h1>
            <p className="text-[#4A5D7A] mt-0.5 text-sm">Update patient information and preferences</p>
          </div>
        </div>

        {/* Progress */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[#4A5D7A]">
              Step {step + 1} of {STEPS.length}: {STEPS[step]}
            </span>
            <span className="text-sm text-[#7A8FAD]">{Math.round((step / (STEPS.length - 1)) * 100)}%</span>
          </div>
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <div key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? 'bg-[#002B5C]' : 'bg-[#D6E0EE]'}`}
              />
            ))}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {step === 0 && (
          <Card title="Patient Identity">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="First Name" id="first_name" value={form.first_name}
                  onChange={(e) => updateForm('first_name', e.target.value)} required />
                <Input label="Last Name" id="last_name" value={form.last_name}
                  onChange={(e) => updateForm('last_name', e.target.value)} required />
              </div>
              <Input label="Date of Birth" type="date" id="dob" value={form.date_of_birth}
                onChange={(e) => updateForm('date_of_birth', e.target.value)} required />
              <Select label="Sex" id="sex" value={form.sex}
                onChange={(e) => updateForm('sex', e.target.value)} required>
                <option value="">Select...</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="non_binary">Non-binary</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </Select>
            </div>
          </Card>
        )}

        {step === 1 && (
          <Card title="Contact Information">
            <div className="space-y-4">
              <Input label="Address" id="address" value={form.address}
                onChange={(e) => updateForm('address', e.target.value)} placeholder="123 Main Street" />
              <Input label="City" id="city" value={form.city}
                onChange={(e) => updateForm('city', e.target.value)} required />
              <div className="grid grid-cols-2 gap-4">
                <Select label="State" id="state" value={form.state}
                  onChange={(e) => updateForm('state', e.target.value)} required>
                  <option value="">Select state</option>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
                <Input label="ZIP Code" id="zip" value={form.zip}
                  onChange={(e) => updateForm('zip', e.target.value)} required />
              </div>
              <Input label="Phone" type="tel" id="phone" value={form.phone}
                onChange={(e) => updateForm('phone', e.target.value)} placeholder="(555) 000-0000" required />
              <div className="pt-2 border-t border-[#EBF0F8]">
                <h4 className="text-sm font-semibold text-[#1A2B4A] mb-3">Emergency Contact</h4>
                <div className="space-y-4">
                  <Input label="Emergency Contact Name" id="ec_name" value={form.emergency_contact_name}
                    onChange={(e) => updateForm('emergency_contact_name', e.target.value)} />
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Emergency Contact Phone" type="tel" id="ec_phone" value={form.emergency_contact_phone}
                      onChange={(e) => updateForm('emergency_contact_phone', e.target.value)} />
                    <Input label="Relationship" id="ec_rel" value={form.emergency_contact_relationship}
                      onChange={(e) => updateForm('emergency_contact_relationship', e.target.value)} placeholder="e.g. Daughter" />
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

        {step === 2 && (
          <Card title="Placement Preferences">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input label="Preferred City" id="pref_city" value={form.preferred_city}
                  onChange={(e) => updateForm('preferred_city', e.target.value)} placeholder="San Francisco" />
                <Input label="Preferred ZIP" id="pref_zip" value={form.preferred_zip}
                  onChange={(e) => updateForm('preferred_zip', e.target.value)} placeholder="94102" />
                <Input label="Preferred County" id="pref_county" value={form.preferred_county}
                  onChange={(e) => updateForm('preferred_county', e.target.value)} placeholder="San Francisco County" />
              </div>
              <div>
                <p className="block text-sm font-medium text-[#1A2B4A] mb-2">Budget Range (Monthly)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A8FAD] text-sm">$</span>
                    <input type="number" value={form.budget_min}
                      onChange={(e) => updateForm('budget_min', e.target.value)}
                      placeholder="Minimum" min="0"
                      className="block w-full rounded-lg border border-[#D6E0EE] bg-white pl-7 pr-3 py-2 text-sm placeholder-[#7A8FAD] focus:border-[#002B5C] focus:outline-none focus:ring-2 focus:ring-[#002B5C]/20" />
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A8FAD] text-sm">$</span>
                    <input type="number" value={form.budget_max}
                      onChange={(e) => updateForm('budget_max', e.target.value)}
                      placeholder="Maximum" min="0"
                      className="block w-full rounded-lg border border-[#D6E0EE] bg-white pl-7 pr-3 py-2 text-sm placeholder-[#7A8FAD] focus:border-[#002B5C] focus:outline-none focus:ring-2 focus:ring-[#002B5C]/20" />
                  </div>
                </div>
              </div>
              <div>
                <p className="block text-sm font-medium text-[#1A2B4A] mb-2">Room Type Preference</p>
                <div className="flex gap-4">
                  {[{ value: 'private', label: 'Private' }, { value: 'shared', label: 'Shared' }, { value: 'no_preference', label: 'No Preference' }].map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="room_type" value={opt.value}
                        checked={form.room_type_preference === opt.value}
                        onChange={(e) => updateForm('room_type_preference', e.target.value)}
                        className="w-4 h-4 text-[#002B5C] border-[#D6E0EE] focus:ring-[#002B5C]" />
                      <span className="text-sm text-[#1A2B4A]">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}

        {step === 3 && (
          <Card title={`Services Needed (${form.services_needed.length} selected)`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_SERVICES.map((service) => {
                const checked = form.services_needed.includes(service);
                return (
                  <label key={service}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      checked ? 'border-[#002B5C] bg-[#E8F0FA]' : 'border-[#D6E0EE] hover:border-[#7A8FAD]'
                    }`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleService(service)}
                      className="w-4 h-4 rounded border-[#D6E0EE] text-[#002B5C] focus:ring-[#002B5C]" />
                    <span className="text-sm text-[#1A2B4A]">{service}</span>
                  </label>
                );
              })}
            </div>
          </Card>
        )}

        {step === 4 && (
          <Card title="Additional Notes">
            <div>
              <label className="block text-sm font-medium text-[#1A2B4A] mb-2">Notes for placement agent</label>
              <textarea value={form.additional_notes}
                onChange={(e) => updateForm('additional_notes', e.target.value)}
                rows={6}
                className="block w-full rounded-lg border border-[#D6E0EE] bg-white px-3 py-2 text-sm placeholder-[#7A8FAD] focus:border-[#002B5C] focus:outline-none focus:ring-2 focus:ring-[#002B5C]/20 transition-colors"
                placeholder="Any additional information about the patient's needs, preferences, or circumstances..." />
            </div>
          </Card>
        )}

        <div className="flex items-center justify-between">
          {step > 0 ? (
            <Button variant="secondary" onClick={prev}>
              <ChevronLeft className="w-4 h-4" />
              Back
            </Button>
          ) : (
            <div />
          )}

          {step < STEPS.length - 1 ? (
            <Button variant="primary" onClick={next}>
              Continue
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button variant="primary" loading={updateMutation.isPending}
              onClick={() => updateMutation.mutate()}>
              <Save className="w-4 h-4" />
              Save Changes
            </Button>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
