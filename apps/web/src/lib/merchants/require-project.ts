import { notFound } from 'next/navigation';
import { type CurrentUser, requireUser } from '@/lib/auth/session';
import { getDb } from '@/lib/db/client';
import { getOwnedMerchant, listMerchants, type Merchant } from './merchants';

/** Every dashboard page and action starts here: signed in, and the project in the URL is theirs. Else 404. */
export async function requireProject(merchantId: string): Promise<{ user: CurrentUser; merchant: Merchant; projects: Merchant[] }> {
  const user = await requireUser();
  const db = getDb();
  const merchant = await getOwnedMerchant(db, user.id, merchantId);
  if (!merchant) notFound();
  return { user, merchant, projects: await listMerchants(db, user.id) };
}
