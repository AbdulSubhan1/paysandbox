/**
 * Joins class names, skipping falsy ones. There is no Tailwind merging: a className never overrides a component's
 * own classes, so a component that needs another look gets a variant or a size instead.
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
