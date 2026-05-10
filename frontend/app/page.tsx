import Link from 'next/link';
import Navbar from '@/components/layout/Navbar';
import { Plus, Users, Building2, UserCheck, CheckCircle, ArrowRight, Heart } from 'lucide-react';

const plans = [
  {
    name: 'Referral Agent',
    price: 19,
    description: 'For agents who refer clients seeking senior care placement.',
    features: [
      'Submit patient referrals',
      'Track referral status',
      'Manage patient intake forms',
      'View placement outcomes',
    ],
    color: 'blue',
    highlighted: false,
  },
  {
    name: 'Care Home',
    price: 49,
    description: 'For care facilities managing beds and accepting placements.',
    features: [
      'Manage room availability',
      'List services offered',
      'Receive placement proposals',
      'Digital agreement signing',
    ],
    color: 'teal',
    highlighted: true,
  },
  {
    name: 'Placement Agent',
    price: 99,
    description: 'For licensed agents who match patients with care facilities.',
    features: [
      'Access patient queue',
      'Lock and work cases',
      'AI-powered matching',
      'Generate agreements',
      'Manage coverage areas',
    ],
    color: 'blue',
    highlighted: false,
  },
];

const roles = [
  {
    icon: UserCheck,
    title: 'Referral Agents',
    description: 'Submit patient referrals and track placement progress from intake to placement.',
    color: 'bg-[#E8F0FA] text-[#002B5C]',
  },
  {
    icon: Building2,
    title: 'Care Homes',
    description: 'Manage room availability, list services, and receive qualified patient placements.',
    color: 'bg-[#E8F2FB] text-[#0079C1]',
  },
  {
    icon: Users,
    title: 'Placement Agents',
    description: 'Match patients with appropriate care facilities using intelligent scoring.',
    color: 'bg-indigo-50 text-indigo-600',
  },
  {
    icon: Heart,
    title: 'Administrators',
    description: 'Oversee the platform, verify facilities, and manage subscriptions.',
    color: 'bg-[#E8F0FA] text-[#1A4B8C]',
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="relative bg-gradient-to-br from-[#002B5C] via-[#001E42] to-[#0079C1] text-white py-24 px-4">
        <div className="absolute inset-0 bg-black/10" />
        <div className="relative max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5 text-sm font-medium mb-6">
            <Plus className="w-4 h-4" strokeWidth={3} />
            Trusted Senior Care Placement
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight tracking-tight">
            CareConnect
          </h1>
          <p className="text-2xl md:text-3xl font-light mb-4 text-blue-100">
            Senior Care Placement Platform
          </p>
          <p className="text-lg text-blue-200 max-w-2xl mx-auto mb-10">
            Connecting seniors with quality care homes through a network of trusted referral
            agents, licensed placement specialists, and verified care facilities.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 bg-white text-[#002B5C] font-semibold px-8 py-3 rounded-lg hover:bg-[#E8F0FA] transition-colors text-lg"
            >
              Sign In
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 bg-[#0079C1] hover:bg-[#005A8E] text-white font-semibold px-8 py-3 rounded-lg transition-colors text-lg"
            >
              Get Started Free
            </Link>
          </div>
          <p className="mt-4 text-blue-200 text-sm">
            6 months free trial — no credit card required
          </p>
        </div>
      </section>

      {/* Roles */}
      <section className="py-20 px-4 bg-[#F4F7FC]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[#1A2B4A] mb-4">Built for Every Role in Senior Care</h2>
            <p className="text-[#4A5D7A] max-w-xl mx-auto">
              CareConnect serves all stakeholders in the senior care placement process with
              role-specific tools and workflows.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {roles.map((role) => {
              const Icon = role.icon;
              return (
                <div
                  key={role.title}
                  className="bg-white rounded-xl p-6 border border-[#D6E0EE] border-l-4 border-l-[#002B5C] shadow-[0_1px_4px_rgba(0,43,92,0.08)] hover:shadow-[0_4px_12px_rgba(0,43,92,0.12)] transition-shadow"
                >
                  <div className={`inline-flex p-3 rounded-lg mb-4 ${role.color}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold text-[#1A2B4A] mb-2">{role.title}</h3>
                  <p className="text-sm text-[#4A5D7A] leading-relaxed">{role.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[#1A2B4A] mb-4">Simple, Transparent Pricing</h2>
            <p className="text-[#4A5D7A] max-w-xl mx-auto mb-3">
              Start with a 6-month free trial. No credit card required.
            </p>
            <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 rounded-full px-4 py-1.5 text-sm font-medium">
              <CheckCircle className="w-4 h-4" />
              6 months free trial on all plans
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl border-2 p-8 ${
                  plan.highlighted
                    ? 'border-[#002B5C] shadow-xl shadow-[#002B5C]/10'
                    : 'border-[#D6E0EE] shadow-sm'
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-[#002B5C] text-white text-xs font-semibold px-4 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}
                <h3 className="text-xl font-bold text-[#1A2B4A] mb-2">{plan.name}</h3>
                <p className="text-[#7A8FAD] text-sm mb-6">{plan.description}</p>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-[#1A2B4A]">${plan.price}</span>
                  <span className="text-[#7A8FAD]">/month</span>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 mb-6 text-center">
                  <p className="text-emerald-700 text-sm font-medium">6 months free, then ${plan.price}/mo</p>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-[#4A5D7A]">
                      <CheckCircle className="w-4 h-4 text-[#0F7B55] mt-0.5 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={`block text-center font-semibold py-3 px-6 rounded-lg transition-colors ${
                    plan.highlighted
                      ? 'bg-[#002B5C] hover:bg-[#001E42] text-white'
                      : 'bg-[#EBF0F8] hover:bg-[#D6E0EE] text-[#1A2B4A]'
                  }`}
                >
                  Start Free Trial
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 bg-[#F4F7FC]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-[#1A2B4A] mb-4">How It Works</h2>
          <p className="text-[#4A5D7A] mb-12 max-w-xl mx-auto">
            A streamlined workflow from initial referral to confirmed placement.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { step: '1', label: 'Referral Agent Submits', desc: 'Detailed patient intake with care needs and preferences.' },
              { step: '2', label: 'Patient Enters Queue', desc: 'Patient joins the placement queue sorted by submission date.' },
              { step: '3', label: 'Agent Locks & Matches', desc: 'Placement agent locks case and finds matching care homes.' },
              { step: '4', label: 'Agreement & Placement', desc: 'Digital agreement signed by all parties. Placement confirmed.' },
            ].map((item) => (
              <div key={item.step} className="relative">
                <div className="bg-[#002B5C] text-white w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg mx-auto mb-4">
                  {item.step}
                </div>
                <h4 className="font-semibold text-[#1A2B4A] mb-2">{item.label}</h4>
                <p className="text-sm text-[#4A5D7A]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#001E42] text-[#7A8FAD] py-12 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2 text-white">
              <div className="w-5 h-5 bg-[#0079C1] rounded flex items-center justify-center">
                <Plus className="w-3 h-3 text-white" strokeWidth={3} />
              </div>
              <span className="font-bold text-lg">CareConnect</span>
            </div>
            <nav className="flex gap-6 text-sm">
              <Link href="/login" className="hover:text-white transition-colors">Sign In</Link>
              <Link href="/register" className="hover:text-white transition-colors">Register</Link>
            </nav>
            <p className="text-sm">
              &copy; {new Date().getFullYear()} CareConnect. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
