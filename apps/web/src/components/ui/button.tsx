import { cn } from '@/lib/utils';

const BASE =
  'group/button inline-flex shrink-0 items-center justify-center border bg-clip-padding font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-3 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0';

const VARIANTS = {
  default: 'border-transparent focus-visible:border-ring focus-visible:ring-ring/50 bg-primary text-primary-foreground hover:bg-primary/80',
  outline: 'border-border focus-visible:border-ring focus-visible:ring-ring/50 bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground',
  secondary: 'border-transparent focus-visible:border-ring focus-visible:ring-ring/50 bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]',
  ghost: 'border-transparent focus-visible:border-ring focus-visible:ring-ring/50 hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground',
  /** Quiet danger: red text on a red tint. */
  destructive: 'border-transparent bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20',
  /** Solid red with white text: the tinted one is under 4.5:1 contrast on tinted panels. */
  danger: 'border-transparent focus-visible:border-ring focus-visible:ring-ring/50 bg-destructive text-white hover:bg-destructive/90',
  link: 'border-transparent focus-visible:border-ring focus-visible:ring-ring/50 text-primary underline-offset-4 hover:underline',
} as const;

const SIZES = {
  default: "rounded-lg h-8 gap-1.5 px-2.5 text-sm [&_svg:not([class*='size-'])]:size-4",
  xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
  sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5",
  lg: "rounded-lg h-9 gap-1.5 px-2.5 text-sm [&_svg:not([class*='size-'])]:size-4",
  /** Big calls to action: Pay, and the landing page. */
  xl: "rounded-lg h-12 gap-2 px-5 text-base [&_svg:not([class*='size-'])]:size-5",
  icon: 'rounded-lg size-8 text-sm',
  'icon-sm': 'size-7 rounded-[min(var(--radius-md),12px)] text-sm',
  /** Inside an InputGroup, e.g. its Copy button. */
  'in-group': 'h-6 gap-1 rounded-[calc(var(--radius)-3px)] px-1.5 text-sm',
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

/** The button look for anything clickable, e.g. a Link styled as a button. `className` adds, it never overrides. */
export function buttonVariants({ variant = 'default', size = 'default', className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

type Props = React.ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize };

/** A native button, `type="button"` unless told otherwise so it never submits a form by accident. */
export function Button({ variant, size, className, type = 'button', ...props }: Props) {
  return <button data-slot="button" type={type} className={buttonVariants({ variant, size, className })} {...props} />;
}
