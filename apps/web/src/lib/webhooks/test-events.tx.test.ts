import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/db/client';
import { events, usageDaily } from '@/lib/db/schema';
import { createTestDb } from '@/test/db';
import { makeEndpoint, makeMerchant } from '@/test/factories';

vi.mock('@/lib/events/record', async (original) => ({
  ...(await original<typeof import('@/lib/events/record')>()),
  recordEvent: vi.fn(async () => {
    throw new Error('insert failed');
  }),
}));
const { sendTestEvent } = await import('./test-events');

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

describe('sendTestEvent is one transaction', () => {
  it('leaves no usage counted when recording the event fails', async () => {
    const m = (await makeMerchant(db)).id;
    await makeEndpoint(db, m);
    await expect(sendTestEvent(db, m, 'payment.succeeded', new Date())).rejects.toThrow('insert failed');
    expect(await db.select().from(usageDaily)).toEqual([]);
    expect(await db.select().from(events)).toEqual([]);
  });
});
