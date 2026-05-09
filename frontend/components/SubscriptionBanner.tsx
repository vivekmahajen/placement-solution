'use client';

import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { useCurrentSubscription, useTrialDaysLeft } from '@/lib/hooks';

export default function SubscriptionBanner() {
  const { data: subscription, isLoading } = useCurrentSubscription();
  const daysLeft = useTrialDaysLeft(subscription);

  if (isLoading || !subscription) return null;

  if (subscription.status === 'active') {
    return null; // No banner needed for active subscribers
  }

  if (subscription.status === 'trial') {
    const urgent = daysLeft !== null && daysLeft <= 30;
    const critical = daysLeft !== null && daysLeft <= 7;

    return (
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium ${
          critical
            ? 'bg-red-50 border border-red-200 text-red-700'
            : urgent
            ? 'bg-yellow-50 border border-yellow-200 text-yellow-700'
            : 'bg-blue-50 border border-blue-200 text-blue-700'
        }`}
      >
        {critical ? (
          <XCircle className="w-4 h-4 flex-shrink-0" />
        ) : urgent ? (
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        ) : (
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
        )}
        <span>
          {daysLeft !== null && daysLeft > 0
            ? `Free trial — ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining. Subscribe to keep access after your trial ends.`
            : 'Your free trial has ended. Please subscribe to continue.'}
        </span>
      </div>
    );
  }

  if (subscription.status === 'expired') {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium bg-red-50 border border-red-200 text-red-700">
        <XCircle className="w-4 h-4 flex-shrink-0" />
        <span>Your subscription has expired. Please renew to restore access.</span>
      </div>
    );
  }

  if (subscription.status === 'suspended') {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium bg-red-50 border border-red-200 text-red-700">
        <XCircle className="w-4 h-4 flex-shrink-0" />
        <span>Your account has been suspended. Please contact support.</span>
      </div>
    );
  }

  return null;
}
