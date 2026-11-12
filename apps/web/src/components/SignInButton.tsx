'use client';

import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth/client';

type Props = Pick<ComponentProps<typeof Button>, 'variant' | 'className' | 'children'>;

export function SignInButton({ variant, className, children = 'Sign in with GitHub' }: Props) {
  return (
    <Button
      size="lg"
      variant={variant}
      className={className}
      onClick={() =>
        authClient.signIn.social({ provider: 'github', callbackURL: '/dashboard/projects', errorCallbackURL: '/invite-only' })
      }
    >
      {children}
    </Button>
  );
}
