import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from './auth';

export type CurrentUser = { id: string; githubLogin: string; isAdmin: boolean };

export async function requireUser(): Promise<CurrentUser> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/');
  const user = session.user as typeof session.user & { githubLogin?: string | null; isAdmin?: boolean };
  return { id: user.id, githubLogin: user.githubLogin ?? user.email, isAdmin: !!user.isAdmin };
}
