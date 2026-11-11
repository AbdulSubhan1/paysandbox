import { formatPkr } from '@/lib/money';

export function Money({ paisa, className }: { paisa: number; className?: string }) {
  return <span className={className}>{formatPkr(paisa)}</span>;
}
