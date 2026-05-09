'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import { post } from '@/lib/api';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import { AlertCircle, CheckCircle, Building2, Users, UserCheck, ChevronLeft } from 'lucide-react';

type Role = 'care_home' | 'placement_agent' | 'referral_agent';

interface RoleCard {
  role: Role;
  label: string;
  price: number;
  description: string;
  icon: React.ElementType;
  color: string;
}

const roleCards: RoleCard[] = [
  {
    role: 'care_home',
    label: 'Care Home',
    price: 49,
    description: 'For care facilities accepting senior placements.',
    icon: Building2,
    color: 'teal',
  },
  {
    role: 'placement_agent',
    label: 'Placement Agent',
    price: 99,
    description: 'For licensed agents matching patients with facilities.',
    icon: Users,
    color: 'blue',
  },
  {
    role: 'referral_agent',
    label: 'Referral Agent',
    price: 19,
    description: 'For agents referring clients seeking senior care.',
    icon: UserCheck,
    color: 'indigo',
  },
];

const FACILITY_TYPES = [
  'Residential Care Home',
  'Assisted Living Facility',
  'Skilled Nursing Facility',
  'Memory Care Facility',
  'Continuing Care Retirement Community',
  'Adult Family Home',
  'Board and Care Home',
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

interface RegisterResponse {
  token: string;
  user: { id: string; email: string; role: string; status: string };
}

const ROLE_REDIRECTS: Record<string, string> = {
  care_home: '/dashboard/care-home',
  placement_agent: '/dashboard/placement-agent',
  referral_agent: '/dashboard/referral-agent',
};

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Care Home fields
  const [facilityName, setFacilityName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseState, setLicenseState] = useState('');
  const [facilityPhone, setFacilityPhone] = useState('');
  const [facilityCity, setFacilityCity] = useState('');
  const [facilityState, setFacilityState] = useState('');
  const [facilityZip, setFacilityZip] = useState('');
  const [facilityEmail, setFacilityEmail] = useState('');
  const [facilityType, setFacilityType] = useState('');

  // Agent fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [agentCity, setAgentCity] = useState('');
  const [agentState, setAgentState] = useState('');
  const [agentZip, setAgentZip] = useState('');

  function handleRoleSelect(role: Role) {
    setSelectedRole(role);
    setStep(2);
  }

  function handleStep2Submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setStep(3);
  }

  async function handleFinalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let profileData: Record<string, string> = {};
      if (selectedRole === 'care_home') {
        profileData = {
          facility_name: facilityName,
          license_number: licenseNumber,
          license_state: licenseState,
          phone: facilityPhone,
          city: facilityCity,
          state: facilityState,
          zip: facilityZip,
          contact_email: facilityEmail,
          facility_type: facilityType,
        };
      } else {
        profileData = {
          first_name: firstName,
          last_name: lastName,
          company_name: companyName,
          phone: agentPhone,
          city: agentCity,
          state: agentState,
          zip: agentZip,
        };
      }

      const data = await post<RegisterResponse>('/auth/register', {
        email,
        password,
        role: selectedRole,
        profile: profileData,
      });

      setAuth(data.user, data.token);
      const redirect = ROLE_REDIRECTS[data.user.role] || '/dashboard';
      router.push(redirect);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  const selectedPlan = roleCards.find((r) => r.role === selectedRole);

  return (
    <div>
      {/* Step indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-medium text-slate-500">
            Step {step} of 3
          </div>
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          )}
        </div>
        <div className="flex gap-1">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                s <= step ? 'bg-blue-600' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Step 1: Choose role */}
      {step === 1 && (
        <div>
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Create your account</h1>
            <p className="text-slate-500 text-sm">Select your role to get started</p>
          </div>

          <div className="space-y-4">
            {roleCards.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.role}
                  onClick={() => handleRoleSelect(card.role)}
                  className="w-full text-left border-2 border-slate-200 hover:border-blue-400 rounded-xl p-5 transition-colors group"
                >
                  <div className="flex items-start gap-4">
                    <div className="bg-blue-50 group-hover:bg-blue-100 p-3 rounded-lg transition-colors">
                      <Icon className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold text-slate-900">{card.label}</h3>
                        <span className="text-slate-600 text-sm font-medium">${card.price}/mo</span>
                      </div>
                      <p className="text-sm text-slate-500">{card.description}</p>
                      <div className="mt-2 inline-flex items-center gap-1.5 bg-green-50 text-green-700 text-xs font-medium px-2.5 py-1 rounded-full">
                        <CheckCircle className="w-3 h-3" />
                        6 months free, then ${card.price}/mo
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-600 hover:text-blue-700 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      )}

      {/* Step 2: Email + Password */}
      {step === 2 && (
        <div>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Account credentials</h1>
            {selectedPlan && (
              <p className="text-slate-500 text-sm">
                Registering as <span className="font-medium text-slate-700">{selectedPlan.label}</span>
              </p>
            )}
          </div>

          <form onSubmit={handleStep2Submit} className="space-y-5">
            <Input
              label="Email address"
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
            <Input
              label="Password"
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              autoComplete="new-password"
            />
            <Input
              label="Confirm password"
              type="password"
              id="confirm-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              required
              autoComplete="new-password"
            />
            <Button type="submit" variant="primary" className="w-full">
              Continue
            </Button>
          </form>
        </div>
      )}

      {/* Step 3: Role-specific profile */}
      {step === 3 && (
        <div>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Your profile</h1>
            <p className="text-slate-500 text-sm">Tell us about your organization</p>
          </div>

          <form onSubmit={handleFinalSubmit} className="space-y-5">
            {selectedRole === 'care_home' && (
              <>
                <Input
                  label="Facility Name"
                  id="facility_name"
                  value={facilityName}
                  onChange={(e) => setFacilityName(e.target.value)}
                  placeholder="Sunrise Senior Care"
                  required
                />
                <Input
                  label="Contact Email"
                  type="email"
                  id="facility_email"
                  value={facilityEmail}
                  onChange={(e) => setFacilityEmail(e.target.value)}
                  placeholder="admin@facilityname.com"
                  required
                />
                <Input
                  label="Phone Number"
                  type="tel"
                  id="facility_phone"
                  value={facilityPhone}
                  onChange={(e) => setFacilityPhone(e.target.value)}
                  placeholder="(555) 000-0000"
                  required
                />
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="License Number"
                    id="license_number"
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    placeholder="LIC-12345"
                    required
                  />
                  <Select
                    label="License State"
                    id="license_state"
                    value={licenseState}
                    onChange={(e) => setLicenseState(e.target.value)}
                    required
                  >
                    <option value="">Select state</option>
                    {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </div>
                <Select
                  label="Facility Type"
                  id="facility_type"
                  value={facilityType}
                  onChange={(e) => setFacilityType(e.target.value)}
                  required
                >
                  <option value="">Select type</option>
                  {FACILITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
                <Input
                  label="City"
                  id="facility_city"
                  value={facilityCity}
                  onChange={(e) => setFacilityCity(e.target.value)}
                  placeholder="San Francisco"
                  required
                />
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label="State"
                    id="facility_state"
                    value={facilityState}
                    onChange={(e) => setFacilityState(e.target.value)}
                    required
                  >
                    <option value="">Select state</option>
                    {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                  <Input
                    label="ZIP Code"
                    id="facility_zip"
                    value={facilityZip}
                    onChange={(e) => setFacilityZip(e.target.value)}
                    placeholder="94102"
                    required
                  />
                </div>
              </>
            )}

            {(selectedRole === 'placement_agent' || selectedRole === 'referral_agent') && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="First Name"
                    id="first_name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Jane"
                    required
                  />
                  <Input
                    label="Last Name"
                    id="last_name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Smith"
                    required
                  />
                </div>
                <Input
                  label="Company Name"
                  id="company_name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Care Placement Services LLC"
                />
                <Input
                  label="Phone Number"
                  type="tel"
                  id="agent_phone"
                  value={agentPhone}
                  onChange={(e) => setAgentPhone(e.target.value)}
                  placeholder="(555) 000-0000"
                  required
                />
                <Input
                  label="City"
                  id="agent_city"
                  value={agentCity}
                  onChange={(e) => setAgentCity(e.target.value)}
                  placeholder="San Francisco"
                  required
                />
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label="State"
                    id="agent_state"
                    value={agentState}
                    onChange={(e) => setAgentState(e.target.value)}
                    required
                  >
                    <option value="">Select state</option>
                    {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                  <Input
                    label="ZIP Code"
                    id="agent_zip"
                    value={agentZip}
                    onChange={(e) => setAgentZip(e.target.value)}
                    placeholder="94102"
                    required
                  />
                </div>
              </>
            )}

            {selectedPlan && (
              <div className="bg-blue-50 rounded-lg p-4 text-sm">
                <p className="font-medium text-blue-800 mb-1">Trial Terms</p>
                <p className="text-blue-700">
                  Your {selectedPlan.label} account includes a 6-month free trial.
                  After the trial, you&apos;ll be billed ${selectedPlan.price}/month.
                  No credit card required to start.
                </p>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={loading}
              disabled={loading}
            >
              Create Account
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
