'use client';

import { useRouter } from 'next/navigation';
import { DropdownMenu, DropdownMenuItem, DropdownMenuLabel, DropdownMenuLinkItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/toast';
import { authClient } from '@/lib/auth/client';

/** "Abdul Subhan" → "AS", "qa" → "QA". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

/** Initials in the header; who is signed in, the projects page and sign out behind them. */
export function AccountMenu({ name, login }: { name: string; login: string }) {
  const router = useRouter();
  return (
    <DropdownMenu
      label="Account"
      align="end"
      className="w-56"
      trigger={
        <button
          type="button"
          aria-label={`Account menu for ${name}`}
          className="grid size-9 place-items-center rounded-full bg-accent text-sm font-bold text-accent-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {initials(name)}
        </button>
      }
    >
      <DropdownMenuLabel>
        <span className="block font-semibold text-foreground">{name}</span>
        <span className="block truncate">{login}</span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuLinkItem href="/dashboard/projects">Your projects</DropdownMenuLinkItem>
      <DropdownMenuItem
        onSelect={async () => {
          const r = await authClient.signOut();
          if (r.error) toast.error("Couldn't sign out. Try again in a moment.");
          else router.push('/');
        }}
      >
        Sign out
      </DropdownMenuItem>
    </DropdownMenu>
  );
}
