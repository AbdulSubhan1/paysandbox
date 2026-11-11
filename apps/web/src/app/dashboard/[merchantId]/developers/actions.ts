'use server';

import { revalidatePath } from 'next/cache';
import type { RevealedSecret } from '@/components/dashboard/SecretKey';
import { getDb } from '@/lib/db/client';
import { rollSecretKey } from '@/lib/keys/keys';
import { requireProject } from '@/lib/merchants/require-project';

export async function rollSecretKeyAction(merchantId: string): Promise<RevealedSecret> {
  const { merchant } = await requireProject(merchantId);
  const secretKey = await rollSecretKey(getDb(), merchantId, new Date());
  revalidatePath(`/dashboard/${merchantId}/developers`);
  return { ok: true, merchantName: merchant.name, secretKey };
}
