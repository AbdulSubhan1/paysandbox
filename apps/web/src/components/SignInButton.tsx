'use client';

import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth/client';

type Props = Pick<ComponentProps<typeof Button>, 'variant' | 'size' | 'className' | 'children'>;

export function SignInButton({ variant, size = 'lg', className, children = 'Sign in with GitHub' }: Props) {
  return (
    <Button
      size={size}
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
