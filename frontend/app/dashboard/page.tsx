'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';

const ROLE_REDIRECTS: Record<string, string> = {
  care_home: '/dashboard/care-home',
  placement_agent: '/dashboard/placement-agent',
  referral_agent: '/dashboard/referral-agent',
  admin: '/dashboard/admin',
  case_manager: '/dashboard/referral-agent',
  discharge_planner: '/dashboard/referral-agent',
  medical_social_worker: '/dashboard/referral-agent',
};

export default function DashboardPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) {
      router.replace('/login');
      return;
    }
    const redirect = ROLE_REDIRECTS[user.role];
    if (redirect) {
      router.replace(redirect);
    } else {
      router.replace('/login');
    }
  }, [user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );
}
