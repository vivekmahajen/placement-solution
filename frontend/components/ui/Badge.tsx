import { cn } from '@/lib/utils';

type Variant = 'green' | 'blue' | 'yellow' | 'red' | 'gray' | 'indigo' | 'purple';

interface BadgeProps {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  green: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
  blue: 'bg-[#E8F0FA] text-[#002B5C] border border-[#C5D5EE]',
  yellow: 'bg-amber-50 text-amber-800 border border-amber-200',
  red: 'bg-red-50 text-[#C0392B] border border-red-200',
  gray: 'bg-[#F4F7FC] text-[#4A5D7A] border border-[#D6E0EE]',
  indigo: 'bg-indigo-50 text-indigo-800 border border-indigo-200',
  purple: 'bg-purple-50 text-purple-800 border border-purple-200',
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
