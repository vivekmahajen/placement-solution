'use client';

import { ReactNode, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import SubscriptionBanner from '@/components/SubscriptionBanner';
import {
  Plus,
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

const allowedPrefixByRole: Record<string, string> = {
  care_home: '/dashboard/care-home',
  placement_agent: '/dashboard/placement-agent',
  referral_agent: '/dashboard/referral-agent',
  admin: '/dashboard/admin',
  case_manager: '/dashboard/referral-agent',
  discharge_planner: '/dashboard/referral-agent',
  medical_social_worker: '/dashboard/referral-agent',
};

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const hydrated = useAuthStore((s) => s.hydrated);
  const hydrate = useAuthStore((s) => s.hydrate);

  const navItems = user ? (navByRole[user.role] ?? []) : [];

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    const allowed = allowedPrefixByRole[user.role];
    if (allowed && !pathname.startsWith(allowed)) {
      router.replace(allowed);
    }
  }, [hydrated, user, pathname, router]);

  function handleLogout() {
    clearAuth();
    router.push('/login');
  }

  return (
    <div className="min-h-screen flex bg-[#F4F7FC]">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-[#002B5C] flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-[#001E42]">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-white">
            <div className="w-6 h-6 bg-[#0079C1] rounded flex items-center justify-center">
              <Plus className="w-4 h-4 text-white" strokeWidth={3} />
            </div>
            CareConnect
          </Link>
        </div>

        {/* Role badge */}
        {user && (
          <div className="px-4 py-3 border-b border-[#001E42]">
            <div className="flex items-center gap-2 text-xs text-[#7A8FAD]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#0079C1]" />
              <span className="font-medium text-[#C5D5EE]">{roleLabelMap[user.role] ?? user.role}</span>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
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
                    ? 'bg-[#E8F2FB]/15 text-white border-l-2 border-[#0079C1] pl-[10px]'
                    : 'text-[#C5D5EE] hover:bg-white/10 hover:text-white'
                )}
              >
                <Icon className={cn('w-4 h-4 flex-shrink-0', isActive ? 'text-[#0079C1]' : 'text-[#7A8FAD]')} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User info & logout */}
        <div className="px-3 py-4 border-t border-[#001E42]">
          <div className="flex items-center gap-2 px-3 py-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-[#0079C1] flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-white" />
            </div>
            <span className="text-xs text-[#C5D5EE] truncate">{user?.email}</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-[#C5D5EE] hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4 text-[#7A8FAD]" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-[#D6E0EE] flex items-center px-6 gap-4">
          <div className="flex-1" />
          {user && (
            <div className="flex items-center gap-3">
              <FileText className="w-4 h-4 text-[#7A8FAD]" />
              <span className="text-sm text-[#4A5D7A]">{user.email}</span>
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
