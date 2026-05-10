import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface CardProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  headerAction?: ReactNode;
}

export default function Card({ title, description, children, className, headerAction }: CardProps) {
  return (
    <div className={cn('bg-white rounded-xl border border-[#D6E0EE] shadow-[0_1px_4px_rgba(0,43,92,0.08)]', className)}>
      {(title || description || headerAction) && (
        <div className="px-6 py-4 border-b border-[#EBF0F8] flex items-start justify-between gap-4">
          <div>
            {title && <h3 className="font-semibold text-[#1A2B4A]">{title}</h3>}
            {description && <p className="text-sm text-[#4A5D7A] mt-0.5">{description}</p>}
          </div>
          {headerAction && <div className="flex-shrink-0">{headerAction}</div>}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}
