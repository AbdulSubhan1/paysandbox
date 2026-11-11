'use server';

import { revalidatePath } from 'next/cache';
import type { RevealedSecret } from '@/components/dashboard/SecretKey';
import { requireUser } from '@/lib/auth/session';
import { getDb } from '@/lib/db/client';
import { type Currency, parseCurrency } from '@/lib/currency';
import { changeMerchantCurrency, createMerchant, MerchantCurrencyError, MerchantLimitError, MerchantNameError } from '@/lib/merchants/merchants';

export async function createProjectAction(_prev: RevealedSecret | null, form: FormData): Promise<RevealedSecret> {
  const user = await requireUser();
  const name = String(form.get('name') ?? '');
  const currency = parseCurrency(form.get('currency') ?? 'pkr');
  if (!currency) return { ok: false, error: 'Choose one of the offered currencies.' };
  try {
    const { merchant, secretKey } = await createMerchant(getDb(), user.id, name, currency);
    revalidatePath('/dashboard/projects');
    return { ok: true, merchantName: merchant.name, secretKey };
  } catch (e) {
    if (e instanceof MerchantLimitError || e instanceof MerchantNameError || e instanceof MerchantCurrencyError) return { ok: false, error: e.message };
    throw e;
  }
}

/** Changes a project's currency; refused once it has a checkout. */
export async function changeProjectCurrencyAction(merchantId: string, currency: Currency): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    await changeMerchantCurrency(getDb(), user.id, merchantId, currency);
  } catch (e) {
    if (e instanceof MerchantCurrencyError) return { ok: false, error: e.message };
    throw e;
  }
  revalidatePath('/dashboard/projects');
  return { ok: true };
}
