import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { toEventObject } from '@/lib/events/objects';
import { recordEvent } from '@/lib/events/record';
import { createTestDb } from '@/test/db';
import { makeEndpoint, makeMerchant } from '@/test/factories';
import { getEventDetail, listEvents } from './events';

let db: Db;
let a: string;
let b: string;
const t = (m: number) => new Date(Date.UTC(2026, 10, 11, 10, m));

beforeEach(async () => {
  db = await createTestDb();
  a = (await makeMerchant(db)).id;
  b = (await makeMerchant(db)).id;
});

describe('listEvents', () => {
  it('pages newest first with the delivery state, only for this merchant', async () => {
    await makeEndpoint(db, a);
    for (let i = 0; i < 30; i++) await recordEvent(db, { merchantId: a, type: 'payment.succeeded', payload: { id: `pay_${i}` }, now: t(Math.floor(i / 2)) });
    await recordEvent(db, { merchantId: b, type: 'payment.failed', payload: {}, now: t(0) });
    const first = await listEvents(db, a, {});
    expect(first.rows).toHaveLength(25);
    expect(first.rows[0].delivery).toMatchObject({ state: 'pending', attemptCount: 0 });
    const second = await listEvents(db, a, { before: first.next! });
    expect(second.next).toBeNull();
    expect(new Set([...first.rows, ...second.rows].map((e) => e.id)).size).toBe(30);
    expect([...first.rows, ...second.rows].every((e) => e.type === 'payment.succeeded')).toBe(true);
  });
});

describe('getEventDetail', () => {
  it('gives the exact body we send, and nothing for another merchant (Plan 3 Review Focus 1)', async () => {
    const id = await recordEvent(db, { merchantId: a, type: 'refund.created', payload: { id: 're_1', amount: 100 }, now: t(1) });
    const d = (await getEventDetail(db, a, id))!;
    expect(JSON.parse(d.body)).toEqual(toEventObject(d.event));
    expect(d.delivery).toBeNull();
    expect(d.attempts).toEqual([]);
    expect(await getEventDetail(db, b, id)).toBeNull();
  });
});
