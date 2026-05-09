'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from './store';
import { get } from './api';
import { trialDaysLeft } from './utils';

export function useAuth() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    let authed = !!useAuthStore.getState().user;

    if (!authed) {
      try {
        const raw = localStorage.getItem('careconnect-auth');
        if (raw) {
          const { user: u, token: t } = JSON.parse(raw);
          if (u && t) {
            useAuthStore.getState().setAuth(u, t);
            authed = true;
          }
        }
      } catch {}
    }

    if (!authed) {
      router.replace('/login');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { user, token };
}

interface Subscription {
  id: string;
  status: 'trial' | 'active' | 'expired' | 'suspended';
  plan_name: string;
  price_monthly: number;
  trial_ends_at: string | null;
  current_period_end: string | null;
}

export function useCurrentSubscription() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['subscription', user?.id],
    queryFn: () => get<Subscription>('/subscriptions/current'),
    enabled: !!user,
  });

  return query;
}

export function useTrialDaysLeft(subscription: Subscription | undefined): number | null {
  if (!subscription) return null;
  if (subscription.status !== 'trial') return null;
  if (!subscription.trial_ends_at) return null;
  return trialDaysLeft(subscription.trial_ends_at);
}
