import { eq } from 'drizzle-orm';
import { decryptSecret, encryptSecret } from '@/lib/crypto/secretbox';
import type { Db } from '@/lib/db/client';
import { webhookEndpoints } from '@/lib/db/schema';
import { newId } from '@/lib/ids';
import { addHours } from '@/lib/time';
import { newSigningSecret } from './signing';
import { type Resolver, type UrlCheck, validateEndpointUrl } from './ssrf';

export type EndpointRow = typeof webhookEndpoints.$inferSelect;

/** After this many failed deliveries (events) in a row the endpoint is disabled (design §8). */
export const ENDPOINT_DISABLE_AFTER = 20;

export class EndpointError extends Error {
  name = 'EndpointError';
  constructor(
    public code: Extract<UrlCheck, { ok: false }>['code'] | 'not_found',
    message: string,
  ) {
    super(message);
  }
}

export async function getWebhookEndpoint(db: Db, merchantId: string): Promise<EndpointRow | null> {
  const [row] = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.merchantId, merchantId));
  return row ?? null;
}

async function requireEndpoint(db: Db, merchantId: string): Promise<EndpointRow> {
  const row = await getWebhookEndpoint(db, merchantId);
  if (!row) throw new EndpointError('not_found', 'This project has no webhook endpoint yet.');
  return row;
}

/** Creates the merchant's endpoint (with a new secret) or changes its URL. Saving also re-enables it. */
export async function setWebhookEndpoint(
  db: Db,
  merchantId: string,
  url: string,
  now: Date,
  opts: { resolve: Resolver; allowPrivate: boolean },
): Promise<EndpointRow> {
  const check = await validateEndpointUrl(url, opts);
  if (!check.ok) throw new EndpointError(check.code, check.message);
  const reset = { url: check.url, enabled: true, consecutiveFailures: 0, disabledReason: null, updatedAt: now };
  const [row] = await db
    .insert(webhookEndpoints)
    .values({ id: newId('we'), merchantId, secretEncrypted: encryptSecret(newSigningSecret()), createdAt: now, ...reset })
    .onConflictDoUpdate({ target: webhookEndpoints.merchantId, set: reset })
    .returning();
  return row;
}

export async function revealWebhookSecret(db: Db, merchantId: string): Promise<string> {
  return decryptSecret((await requireEndpoint(db, merchantId)).secretEncrypted);
}

/** New secret now; the old one keeps verifying for 24 h. */
export async function rollWebhookSecret(db: Db, merchantId: string, now: Date): Promise<string> {
  const row = await requireEndpoint(db, merchantId);
  const secret = newSigningSecret();
  await db
    .update(webhookEndpoints)
    .set({
      secretEncrypted: encryptSecret(secret),
      previousSecretEncrypted: row.secretEncrypted,
      previousSecretExpiresAt: addHours(now, 24),
      updatedAt: now,
    })
    .where(eq(webhookEndpoints.id, row.id));
  return secret;
}

export async function reenableWebhookEndpoint(db: Db, merchantId: string): Promise<void> {
  const row = await requireEndpoint(db, merchantId);
  await db
    .update(webhookEndpoints)
    .set({ enabled: true, consecutiveFailures: 0, disabledReason: null })
    .where(eq(webhookEndpoints.id, row.id));
}

/** The secrets to sign with: current first, then the previous one while it is still within its 24 h. */
export function activeSecrets(row: EndpointRow, now: Date): string[] {
  const secrets = [decryptSecret(row.secretEncrypted)];
  if (row.previousSecretEncrypted && row.previousSecretExpiresAt && row.previousSecretExpiresAt > now)
    secrets.push(decryptSecret(row.previousSecretEncrypted));
  return secrets;
}
