'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from './store';
import { get } from './api';
import { trialDaysLeft } from './utils';

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export function useAuth() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    // On mount (client only), load from localStorage if store is empty
    if (!useAuthStore.getState().user) {
      try {
        const raw = localStorage.getItem('careconnect-auth');
        if (raw) {
          const { user: u, token: t } = JSON.parse(raw);
          if (u && t) {
            if (isTokenExpired(t)) {
              // Token is expired — clear storage so user must log in again
              localStorage.removeItem('careconnect-auth');
            } else {
              useAuthStore.getState().setAuth(u, t);
            }
          }
        }
      } catch {}
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready && (!user || !token)) {
      router.replace('/login');
    }
  }, [ready, user, token, router]);

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
