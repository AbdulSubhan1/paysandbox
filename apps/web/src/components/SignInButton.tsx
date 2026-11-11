'use client';

import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth/client';

export function SignInButton() {
  return (
    <Button
      size="lg"
      onClick={() =>
        authClient.signIn.social({ provider: 'github', callbackURL: '/dashboard/projects', errorCallbackURL: '/invite-only' })
      }
    >
      Sign in with GitHub
    </Button>
  );
}
