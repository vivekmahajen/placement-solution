'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from './store';
import { get } from './api';
import { trialDaysLeft } from './utils';

export function useAuth() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    // On mount, read localStorage directly — Zustand may not have hydrated yet
    try {
      const raw = localStorage.getItem('careconnect-auth');
      if (raw) {
        const parsed = JSON.parse(raw);
        const storedUser = parsed?.state?.user;
        const storedToken = parsed?.state?.token;
        if (storedUser && storedToken && !useAuthStore.getState().user) {
          useAuthStore.getState().setAuth(storedUser, storedToken);
        }
      }
    } catch {}
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
