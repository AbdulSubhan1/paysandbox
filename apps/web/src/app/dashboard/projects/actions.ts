'use server';

import { revalidatePath } from 'next/cache';
import type { RevealedSecret } from '@/components/dashboard/SecretKey';
import { requireUser } from '@/lib/auth/session';
import { getDb } from '@/lib/db/client';
import { createMerchant, MerchantLimitError, MerchantNameError } from '@/lib/merchants/merchants';


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
