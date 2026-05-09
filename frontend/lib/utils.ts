import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + '/mo';
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    trial: 'bg-blue-100 text-blue-700',
    suspended: 'bg-red-100 text-red-700',
    expired: 'bg-slate-100 text-slate-600',
    pending: 'bg-yellow-100 text-yellow-700',
    pending_verification: 'bg-yellow-100 text-yellow-700',
    verified: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    queued: 'bg-blue-100 text-blue-700',
    locked: 'bg-yellow-100 text-yellow-700',
    in_progress: 'bg-indigo-100 text-indigo-700',
    matched: 'bg-purple-100 text-purple-700',
    placed: 'bg-green-100 text-green-700',
    cancelled: 'bg-slate-100 text-slate-500',
    proposed: 'bg-indigo-100 text-indigo-700',
    visited: 'bg-blue-100 text-blue-700',
    selected: 'bg-green-100 text-green-700',
  };
  return map[status] ?? 'bg-slate-100 text-slate-600';
}

export function countdown(expiry: string | Date): string {
  const now = new Date();
  const end = typeof expiry === 'string' ? new Date(expiry) : expiry;
  const diffMs = end.getTime() - now.getTime();

  if (diffMs <= 0) return 'Expired';

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h remaining`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  }
  return `${minutes}m remaining`;
}

export function isExpiringSoon(expiry: string | Date, hoursThreshold = 24): boolean {
  const now = new Date();
  const end = typeof expiry === 'string' ? new Date(expiry) : expiry;
  const diffMs = end.getTime() - now.getTime();
  return diffMs > 0 && diffMs < hoursThreshold * 60 * 60 * 1000;
}

export function trialDaysLeft(trialEndsAt: string | Date): number {
  const now = new Date();
  const end = typeof trialEndsAt === 'string' ? new Date(trialEndsAt) : trialEndsAt;
  const diffMs = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

export function patientRef(id: string): string {
  return id.slice(0, 8).toUpperCase();
}
