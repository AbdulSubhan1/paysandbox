'use client';

import { createContext, useContext, useState } from 'react';
import { cn } from '@/lib/utils';

const OtpContext = createContext<{ value: string; maxLength: number; focused: boolean }>({ value: '', maxLength: 6, focused: false });

type Props = Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'maxLength'> & {
  maxLength: number;
  value: string;
  onChange: (value: string) => void;
  containerClassName?: string;
};

/**
 * A one-time code: one real <input> (so typing, paste, autofill and screen readers all just work) laid invisibly
 * over the slot boxes, which only draw what it holds.
 */
export function InputOTP({ maxLength, value, onChange, containerClassName, className, children, onFocus, onBlur, ...props }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <OtpContext value={{ value, maxLength, focused }}>
      <div data-slot="input-otp" className={cn('relative flex items-center has-disabled:opacity-50', containerClassName)}>
        {children}
        <input
          {...props}
          value={value}
          maxLength={maxLength}
          spellCheck={false}
          autoCorrect="off"
          onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          className={cn(
            'absolute inset-0 h-full w-full bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent disabled:cursor-not-allowed',
            className,
          )}
        />
      </div>
    </OtpContext>
  );
}

export function InputOTPGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="input-otp-group" aria-hidden className={cn('flex items-center rounded-lg', className)} {...props} />;
}

/** One box. The box where the next digit goes is highlighted and shows a caret. */
export function InputOTPSlot({ index, className, ...props }: React.ComponentProps<'div'> & { index: number }) {
  const { value, maxLength, focused } = useContext(OtpContext);
  const char = value[index];
  const active = focused && (index === value.length || (value.length === maxLength && index === maxLength - 1));
  return (
    <div
      data-slot="input-otp-slot"
      data-active={active}
      className={cn(
        'relative flex size-8 items-center justify-center border-y border-r border-input text-sm transition-all outline-none first:rounded-l-lg first:border-l data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-3 data-[active=true]:ring-ring/50',
        className,
      )}
      {...props}
    >
      {char}
      {active && !char && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-px motion-safe:animate-caret-blink bg-foreground" />
        </div>
      )}
    </div>
  );
}
