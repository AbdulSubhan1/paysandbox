'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { getDb } from '@/lib/db/client';
import { merchants } from '@/lib/db/schema';
import { rollSecretKey } from '@/lib/keys/keys';
import { createMerchant, MerchantLimitError, MerchantNameError } from '@/lib/merchants/merchants';

export type RevealedSecret = { ok: true; merchantName: string; secretKey: string } | { ok: false; error: string };

export async function createProjectAction(_prev: RevealedSecret | null, form: FormData): Promise<RevealedSecret> {
  const user = await requireUser();
  const name = String(form.get('name') ?? '');
  try {
    const { merchant, secretKey } = await createMerchant(getDb(), user.id, name);
    revalidatePath('/dashboard/projects');
    return { ok: true, merchantName: merchant.name, secretKey };
  } catch (e) {
    if (e instanceof MerchantLimitError || e instanceof MerchantNameError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function rollSecretKeyAction(merchantId: string): Promise<RevealedSecret> {
  const user = await requireUser();
  const db = getDb();
  const [owned] = await db
    .select()
    .from(merchants)
    .where(and(eq(merchants.id, merchantId), eq(merchants.ownerUserId, user.id)));
  if (!owned) return { ok: false, error: 'Project not found.' };
  const secretKey = await rollSecretKey(db, merchantId, new Date());
  revalidatePath('/dashboard/projects');
  return { ok: true, merchantName: owned.name, secretKey };
}
