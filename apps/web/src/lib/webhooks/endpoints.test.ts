import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { webhookEndpoints } from '@/lib/db/schema';
import { addHours } from '@/lib/time';
import { createTestDb } from '@/test/db';
import { makeEndpoint, makeMerchant } from '@/test/factories';
import {
  activeSecrets,
  EndpointError,
  getWebhookEndpoint,
  reenableWebhookEndpoint,
  revealWebhookSecret,
  rollWebhookSecret,
  setWebhookEndpoint,
} from './endpoints';
import type { Resolver } from './ssrf';

const resolve: Resolver = async (h) => (h.endsWith('example.com') ? ['93.184.216.34'] : []);
const opts = { resolve, allowPrivate: false };
const now = new Date('2026-11-11T10:00:00Z');

let db: Db;
let merchantId: string;
beforeEach(async () => {
  db = await createTestDb();
  merchantId = (await makeMerchant(db)).id;
});

describe('webhook endpoints', () => {
  it('creates one endpoint with a secret, then changes only its URL', async () => {
    const a = await setWebhookEndpoint(db, merchantId, 'https://a.example.com/hook', now, opts);
    expect(a.id).toMatch(/^we_/);
    const secret = await revealWebhookSecret(db, merchantId);
    expect(secret).toMatch(/^whsec_/);
    const b = await setWebhookEndpoint(db, merchantId, 'https://b.example.com/hook', now, opts);
    expect(b.id).toBe(a.id);
    expect(b.url).toBe('https://b.example.com/hook');
    expect(await revealWebhookSecret(db, merchantId)).toBe(secret);
    expect(await db.select().from(webhookEndpoints)).toHaveLength(1);
  });

  it('never stores the plain secret', async () => {
    await setWebhookEndpoint(db, merchantId, 'https://a.example.com/hook', now, opts);
    const secret = await revealWebhookSecret(db, merchantId);
    expect(JSON.stringify(await getWebhookEndpoint(db, merchantId))).not.toContain(secret.slice(6));
  });

  it('refuses an unsafe URL with its code', async () => {
    await expect(setWebhookEndpoint(db, merchantId, 'http://10.0.0.5', now, opts)).rejects.toMatchObject({
      name: 'EndpointError',
      code: 'url_not_https',
    });
    await expect(setWebhookEndpoint(db, merchantId, 'http://10.0.0.5', now, opts)).rejects.toBeInstanceOf(EndpointError);
    expect(await getWebhookEndpoint(db, merchantId)).toBeNull();
  });

  it('keeps the old secret working for 24 h after a roll (PS-WH-016)', async () => {
    await setWebhookEndpoint(db, merchantId, 'https://a.example.com/hook', now, opts);
    const old = await revealWebhookSecret(db, merchantId);
    const fresh = await rollWebhookSecret(db, merchantId, now);
    expect(fresh).not.toBe(old);
    expect(await revealWebhookSecret(db, merchantId)).toBe(fresh);
    const row = (await getWebhookEndpoint(db, merchantId))!;
    expect(activeSecrets(row, addHours(now, 23))).toEqual([fresh, old]);
    expect(activeSecrets(row, addHours(now, 24))).toEqual([fresh]);
  });

  it('re-enables a disabled endpoint, by button or by saving a URL', async () => {
    const { endpoint } = await makeEndpoint(db, merchantId, { enabled: false });
    await db.update(webhookEndpoints).set({ consecutiveFailures: 20, disabledReason: 'too_many_failures' }).where(eq(webhookEndpoints.id, endpoint.id));
    await reenableWebhookEndpoint(db, merchantId);
    expect(await getWebhookEndpoint(db, merchantId)).toMatchObject({ enabled: true, consecutiveFailures: 0, disabledReason: null });
    await db.update(webhookEndpoints).set({ enabled: false, consecutiveFailures: 20 }).where(eq(webhookEndpoints.id, endpoint.id));
    await setWebhookEndpoint(db, merchantId, 'https://c.example.com/hook', now, opts);
    expect(await getWebhookEndpoint(db, merchantId)).toMatchObject({ enabled: true, consecutiveFailures: 0 });
  });

  it('makeEndpoint returns the plain secret for tests', async () => {
    const { endpoint, secret } = await makeEndpoint(db, merchantId);
    expect(endpoint.url).toBe('https://hooks.example.com/ps');
    expect(await revealWebhookSecret(db, merchantId)).toBe(secret);
  });
});
