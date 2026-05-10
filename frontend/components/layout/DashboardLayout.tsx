'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import SubscriptionBanner from '@/components/SubscriptionBanner';
import {
  Heart,
  LayoutDashboard,
  BedDouble,
  ListChecks,
  Users,
  ClipboardList,
  MapPin,
  UserPlus,
  FileText,
  Building2,
  ShieldCheck,
  BarChart3,
  LogOut,
  User,
  Search,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const navByRole: Record<string, NavItem[]> = {
  care_home: [
    { href: '/dashboard/care-home', label: 'Overview', icon: LayoutDashboard },
    { href: '/dashboard/care-home/availability', label: 'Availability', icon: BedDouble },
    { href: '/dashboard/care-home/services', label: 'Services', icon: ListChecks },
  ],
  placement_agent: [
    { href: '/dashboard/placement-agent', label: 'Overview', icon: LayoutDashboard },
    { href: '/dashboard/placement-agent/queue', label: 'Queue', icon: ClipboardList },
    { href: '/dashboard/placement-agent/search', label: 'Search Care Homes', icon: Search },
    { href: '/dashboard/placement-agent/coverage', label: 'Coverage Areas', icon: MapPin },
  ],
  referral_agent: [
    { href: '/dashboard/referral-agent', label: 'Overview', icon: LayoutDashboard },
    { href: '/dashboard/referral-agent/new-patient', label: 'Add Patient', icon: UserPlus },
    { href: '/dashboard/referral-agent/patients', label: 'My Patients', icon: Users },
  ],
  case_manager: [
    { href: '/dashboard/referral-agent', label: 'Overview', icon: LayoutDashboard },
    { href: '/dashboard/referral-agent/new-patient', label: 'Add Patient', icon: UserPlus },
    { href: '/dashboard/referral-agent/patients', label: 'My Patients', icon: Users },
  ],
  discharge_planner: [
    { href: '/dashboard/referral-agent', label: 'Overview', icon: LayoutDashboard },
    { href: '/dashboard/referral-agent/new-patient', label: 'Add Patient', icon: UserPlus },
    { href: '/dashboard/referral-agent/patients', label: 'My Patients', icon: Users },
  ],
  medical_social_worker: [
    { href: '/dashboard/referral-agent', label: 'Overview', icon: LayoutDashboard },
    { href: '/dashboard/referral-agent/new-patient', label: 'Add Patient', icon: UserPlus },
    { href: '/dashboard/referral-agent/patients', label: 'My Patients', icon: Users },
  ],
  admin: [
    { href: '/dashboard/admin', label: 'Overview', icon: LayoutDashboard },
    { href: '/dashboard/admin/users', label: 'Users', icon: Users },
    { href: '/dashboard/admin/care-homes', label: 'Care Homes', icon: Building2 },
    { href: '/dashboard/admin/queue', label: 'Queue', icon: ClipboardList },
    { href: '/dashboard/admin/reports', label: 'Reports', icon: BarChart3 },
  ],
};

const roleLabelMap: Record<string, string> = {
  care_home: 'Care Home',
  placement_agent: 'Placement Agent',
  referral_agent: 'Referral Agent',
  admin: 'Administrator',
  case_manager: 'Case Manager',
  discharge_planner: 'Discharge Planner',
  medical_social_worker: 'Medical Social Worker',
};

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const navItems = user ? (navByRole[user.role] ?? []) : [];

  function handleLogout() {
    clearAuth();
    router.push('/login');
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-slate-100">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-blue-700">
            <Heart className="w-5 h-5 text-teal-600" />
            CareConnect
          </Link>
        </div>

        {/* Role badge */}
        {user && (
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="font-medium">{roleLabelMap[user.role] ?? user.role}</span>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                )}
              >
                <Icon className={cn('w-4 h-4', isActive ? 'text-blue-600' : 'text-slate-400')} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User info & logout */}
        <div className="px-3 py-4 border-t border-slate-100">
          <div className="flex items-center gap-2 px-3 py-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-blue-600" />
            </div>
            <span className="text-xs text-slate-600 truncate">{user?.email}</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            <LogOut className="w-4 h-4 text-slate-400" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 gap-4">
          <div className="flex-1" />
          {user && (
            <div className="flex items-center gap-3">
              <FileText className="w-4 h-4 text-slate-400" />
              <span className="text-sm text-slate-600">{user.email}</span>
            </div>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto space-y-6">
            <SubscriptionBanner />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
