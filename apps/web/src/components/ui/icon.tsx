// Our own icon set: 24px grid, 2px stroke, drawn with currentColor. Add an icon here when a screen needs it.
const PATHS = {
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 3l10 18H2zM12 10v4M12 17h.01',
  chevronDown: 'M6 9l6 6 6-6',
  chevronLeft: 'M15 18l-6-6 6-6',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  loader: 'M21 12a9 9 0 11-6.2-8.56',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = 'size-4', ...props }: { name: IconName } & Omit<React.ComponentProps<'svg'>, 'children'>) {
  return (
    <svg
      data-slot="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
