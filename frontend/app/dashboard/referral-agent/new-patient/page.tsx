'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { useAuth } from '@/lib/hooks';
import { post } from '@/lib/api';
import { ChevronLeft, ChevronRight, CheckCircle, AlertCircle } from 'lucide-react';

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
  'Review',
];

interface PatientFormData {
  // Section 1
  first_name: string;
  last_name: string;
  date_of_birth: string;
  sex: string;
  // Section 2
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  // Section 3
  preferred_city: string;
  preferred_zip: string;
  preferred_county: string;
  budget_min: string;
  budget_max: string;
  room_type_preference: string;
  // Section 4
  services_needed: string[];
  // Section 5
  additional_notes: string;
}

const initialData: PatientFormData = {
  first_name: '', last_name: '', date_of_birth: '', sex: '',
  address: '', city: '', state: '', zip: '', phone: '',
  emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_relationship: '',
  preferred_city: '', preferred_zip: '', preferred_county: '',
  budget_min: '', budget_max: '', room_type_preference: 'no_preference',
  services_needed: [], additional_notes: '',
};

export default function NewPatientPage() {
  useAuth();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<PatientFormData>(initialData);
  const [error, setError] = useState('');

  const submitMutation = useMutation({
    mutationFn: () =>
      post('/patients', {
        ...form,
        budget_min: form.budget_min ? parseInt(form.budget_min) : null,
        budget_max: form.budget_max ? parseInt(form.budget_max) : null,
      }),
    onSuccess: () => {
      router.push('/dashboard/referral-agent/patients');
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to submit patient. Please try again.');
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
    if (step === 0) {
      if (!form.first_name || !form.last_name || !form.date_of_birth || !form.sex) {
        setError('Please complete all required fields.');
        return false;
      }
    }
    if (step === 1) {
      if (!form.city || !form.state || !form.zip || !form.phone) {
        setError('Please complete all required fields.');
        return false;
      }
    }
    setError('');
    return true;
  }

  function next() {
    if (validateStep()) setStep((s) => s + 1);
  }

  function prev() {
    setStep((s) => s - 1);
    setError('');
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Add New Patient Referral</h1>
          <p className="text-slate-500 mt-1">Complete the intake form to refer a patient for placement</p>
        </div>

        {/* Progress */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-600">
              Step {step + 1} of {STEPS.length}: {STEPS[step]}
            </span>
            <span className="text-sm text-slate-400">{Math.round((step / (STEPS.length - 1)) * 100)}%</span>
          </div>
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= step ? 'bg-blue-600' : 'bg-slate-200'
                }`}
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

        {/* Section 1: Patient Identity */}
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

        {/* Section 2: Contact */}
        {step === 1 && (
          <Card title="Contact Information">
            <div className="space-y-4">
              <Input label="Address" id="address" value={form.address}
                onChange={(e) => updateForm('address', e.target.value)}
                placeholder="123 Main Street" />
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
                onChange={(e) => updateForm('phone', e.target.value)}
                placeholder="(555) 000-0000" required />

              <div className="pt-2 border-t border-slate-100">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Emergency Contact</h4>
                <div className="space-y-4">
                  <Input label="Emergency Contact Name" id="ec_name" value={form.emergency_contact_name}
                    onChange={(e) => updateForm('emergency_contact_name', e.target.value)} />
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Emergency Contact Phone" type="tel" id="ec_phone" value={form.emergency_contact_phone}
                      onChange={(e) => updateForm('emergency_contact_phone', e.target.value)} />
                    <Input label="Relationship" id="ec_rel" value={form.emergency_contact_relationship}
                      onChange={(e) => updateForm('emergency_contact_relationship', e.target.value)}
                      placeholder="e.g. Daughter" />
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Section 3: Placement Preferences */}
        {step === 2 && (
          <Card title="Placement Preferences">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input label="Preferred City" id="pref_city" value={form.preferred_city}
                  onChange={(e) => updateForm('preferred_city', e.target.value)}
                  placeholder="San Francisco" />
                <Input label="Preferred ZIP" id="pref_zip" value={form.preferred_zip}
                  onChange={(e) => updateForm('preferred_zip', e.target.value)}
                  placeholder="94102" />
                <Input label="Preferred County" id="pref_county" value={form.preferred_county}
                  onChange={(e) => updateForm('preferred_county', e.target.value)}
                  placeholder="San Francisco County" />
              </div>

              <div>
                <p className="block text-sm font-medium text-slate-700 mb-2">Budget Range (Monthly)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                    <input
                      type="number"
                      value={form.budget_min}
                      onChange={(e) => updateForm('budget_min', e.target.value)}
                      placeholder="Minimum"
                      min="0"
                      className="block w-full rounded-lg border border-slate-300 bg-white pl-7 pr-3 py-2 text-sm placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                    <input
                      type="number"
                      value={form.budget_max}
                      onChange={(e) => updateForm('budget_max', e.target.value)}
                      placeholder="Maximum"
                      min="0"
                      className="block w-full rounded-lg border border-slate-300 bg-white pl-7 pr-3 py-2 text-sm placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </div>
              </div>

              <div>
                <p className="block text-sm font-medium text-slate-700 mb-2">Room Type Preference</p>
                <div className="flex gap-4">
                  {[
                    { value: 'private', label: 'Private' },
                    { value: 'shared', label: 'Shared' },
                    { value: 'no_preference', label: 'No Preference' },
                  ].map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="room_type"
                        value={opt.value}
                        checked={form.room_type_preference === opt.value}
                        onChange={(e) => updateForm('room_type_preference', e.target.value)}
                        className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Section 4: Services */}
        {step === 3 && (
          <Card title={`Services Needed (${form.services_needed.length} selected)`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_SERVICES.map((service) => {
                const checked = form.services_needed.includes(service);
                return (
                  <label
                    key={service}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      checked ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleService(service)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700">{service}</span>
                  </label>
                );
              })}
            </div>
          </Card>
        )}

        {/* Section 5: Notes */}
        {step === 4 && (
          <Card title="Additional Notes">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Notes for placement agent
              </label>
              <textarea
                value={form.additional_notes}
                onChange={(e) => updateForm('additional_notes', e.target.value)}
                rows={6}
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
                placeholder="Any additional information about the patient's needs, preferences, or circumstances..."
              />
            </div>
          </Card>
        )}

        {/* Review step */}
        {step === 5 && (
          <Card title="Review & Submit">
            <div className="space-y-6 text-sm">
              <div>
                <h4 className="font-semibold text-slate-700 mb-3 border-b border-slate-100 pb-2">Patient Identity</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-slate-500">Name:</span> <span className="text-slate-900">{form.first_name} {form.last_name}</span></div>
                  <div><span className="text-slate-500">DOB:</span> <span className="text-slate-900">{form.date_of_birth}</span></div>
                  <div><span className="text-slate-500">Sex:</span> <span className="text-slate-900 capitalize">{form.sex?.replace('_', ' ')}</span></div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-slate-700 mb-3 border-b border-slate-100 pb-2">Contact</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-slate-500">City:</span> <span className="text-slate-900">{form.city}, {form.state} {form.zip}</span></div>
                  <div><span className="text-slate-500">Phone:</span> <span className="text-slate-900">{form.phone}</span></div>
                  {form.emergency_contact_name && (
                    <div className="col-span-2">
                      <span className="text-slate-500">Emergency Contact:</span>{' '}
                      <span className="text-slate-900">{form.emergency_contact_name} ({form.emergency_contact_relationship}) — {form.emergency_contact_phone}</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-slate-700 mb-3 border-b border-slate-100 pb-2">Placement Preferences</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-slate-500">Location:</span> <span className="text-slate-900">{form.preferred_city || form.preferred_zip || form.preferred_county || 'Not specified'}</span></div>
                  <div><span className="text-slate-500">Budget:</span> <span className="text-slate-900">
                    {form.budget_min && form.budget_max ? `$${parseInt(form.budget_min).toLocaleString()} – $${parseInt(form.budget_max).toLocaleString()}/mo` : 'Not specified'}
                  </span></div>
                  <div><span className="text-slate-500">Room Type:</span> <span className="text-slate-900 capitalize">{form.room_type_preference?.replace('_', ' ')}</span></div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-slate-700 mb-3 border-b border-slate-100 pb-2">
                  Services Needed ({form.services_needed.length})
                </h4>
                {form.services_needed.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {form.services_needed.map((s) => (
                      <span key={s} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-medium px-2.5 py-1 rounded-full">
                        <CheckCircle className="w-3 h-3" />
                        {s}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400">No specific services required.</p>
                )}
              </div>

              {form.additional_notes && (
                <div>
                  <h4 className="font-semibold text-slate-700 mb-2 border-b border-slate-100 pb-2">Notes</h4>
                  <p className="text-slate-700 whitespace-pre-wrap">{form.additional_notes}</p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Navigation */}
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
            <Button
              variant="primary"
              loading={submitMutation.isPending}
              onClick={() => submitMutation.mutate()}
              className="px-8"
            >
              Submit Referral
            </Button>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
