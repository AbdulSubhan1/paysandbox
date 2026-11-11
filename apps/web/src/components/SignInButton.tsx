'use client';

import { authClient } from '@/lib/auth/client';

export function SignInButton() {
  return (
    <button
      type="button"
      className="rounded-lg bg-[var(--accent)] px-5 py-3 font-semibold text-white"
      onClick={() =>
        authClient.signIn.social({ provider: 'github', callbackURL: '/dashboard/projects', errorCallbackURL: '/invite-only' })
      }
    >
      Sign in with GitHub
    </button>
  );
}
