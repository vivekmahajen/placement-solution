import { cn } from '@/lib/utils';
import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, id, className, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-[#1A2B4A] mb-1">
            {label}
            {props.required && <span className="text-[#C0392B] ml-1">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            'block w-full rounded-lg border bg-white px-3 py-2 text-sm placeholder-[#7A8FAD]',
            'focus:border-[#002B5C] focus:outline-none focus:ring-2 focus:ring-[#002B5C]/20 transition-colors',
            error
              ? 'border-[#C0392B] focus:border-[#C0392B] focus:ring-[#C0392B]/20'
              : 'border-[#D6E0EE]',
            className
          )}
          {...props}
        />
        {hint && !error && (
          <p className="mt-1 text-xs text-[#7A8FAD]">{hint}</p>
        )}
        {error && (
          <p className="mt-1 text-xs text-[#C0392B]">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
