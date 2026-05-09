import { cn } from '@/lib/utils';

type Variant = 'green' | 'blue' | 'yellow' | 'red' | 'gray' | 'indigo' | 'purple';

interface BadgeProps {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  green: 'bg-green-100 text-green-700',
  blue: 'bg-blue-100 text-blue-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  red: 'bg-red-100 text-red-700',
  gray: 'bg-slate-100 text-slate-600',
  indigo: 'bg-indigo-100 text-indigo-700',
  purple: 'bg-purple-100 text-purple-700',
};

export default function Badge({ children, variant = 'gray', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, Variant> = {
    active: 'green',
    verified: 'green',
    placed: 'green',
    selected: 'green',
    trial: 'blue',
    queued: 'blue',
    visited: 'blue',
    pending: 'yellow',
    pending_verification: 'yellow',
    locked: 'yellow',
    in_progress: 'indigo',
    proposed: 'indigo',
    matched: 'purple',
    expired: 'gray',
    cancelled: 'gray',
    suspended: 'red',
    rejected: 'red',
  };

  const labelMap: Record<string, string> = {
    active: 'Active',
    trial: 'Trial',
    suspended: 'Suspended',
    expired: 'Expired',
    pending: 'Pending',
    pending_verification: 'Pending Verification',
    verified: 'Verified',
    rejected: 'Rejected',
    queued: 'Queued',
    locked: 'Locked',
    in_progress: 'In Progress',
    matched: 'Matched',
    placed: 'Placed',
    cancelled: 'Cancelled',
    proposed: 'Proposed',
    visited: 'Visited',
    selected: 'Selected',
  };

  return (
    <Badge variant={variantMap[status] ?? 'gray'}>
      {labelMap[status] ?? status}
    </Badge>
  );
}
