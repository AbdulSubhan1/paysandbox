import { createHash } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import { ApiError } from '@/lib/api/errors';
import type { ApiResponse } from '@/lib/api/handler';
import type { Db } from '@/lib/db/client';
import { idempotencyKeys } from '@/lib/db/schema';
import { addHours } from '@/lib/time';

const KEY_TTL_HOURS = 24;
const MAX_KEY_LENGTH = 255;

export type IdempotencyArgs = {
  merchantId: string;
  key: string | null;
  method: string;
  path: string;
  body: unknown;
  now: Date;
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function requestHash(a: IdempotencyArgs): string {
  return createHash('sha256').update(`${a.method} ${a.path} ${canonicalJson(a.body)}`).digest('hex');
}

/**
 * IETF Idempotency-Key semantics, per merchant, for 24 hours: replay the stored response for the same request,
 * 422 for the same key with a different request, 409 while the first one is still running. 5xx and 429 are never stored.
 */
export async function withIdempotency(db: Db, args: IdempotencyArgs, run: () => Promise<ApiResponse>): Promise<ApiResponse> {
  const { merchantId, key, now } = args;
  if (key === null) return run();
  if (key.length < 1 || key.length > MAX_KEY_LENGTH) {
    throw new ApiError(400, 'invalid_request_error', 'idempotency_key_invalid', 'Idempotency-Key must be 1 to 255 characters.');
  }
  const hash = requestHash(args);
  const where = and(eq(idempotencyKeys.merchantId, merchantId), eq(idempotencyKeys.key, key));

  // Keys older than 24 hours are forgotten.
  await db.delete(idempotencyKeys).where(and(where, lt(idempotencyKeys.createdAt, addHours(now, -KEY_TTL_HOURS))));

  const claimed = await db
    .insert(idempotencyKeys)
    .values({ merchantId, key, requestHash: hash, status: 'in_progress', createdAt: now })
    .onConflictDoNothing()
    .returning();

  if (claimed.length === 0) {
    const [existing] = await db.select().from(idempotencyKeys).where(where);
    if (existing.status === 'in_progress') {
      throw new ApiError(409, 'idempotency_error', 'idempotency_key_in_use', 'A request with this Idempotency-Key is still in progress. Retry shortly.');
    }
    if (existing.requestHash !== hash) {
      throw new ApiError(422, 'idempotency_error', 'idempotency_key_reused', 'This Idempotency-Key was already used with a different request.');
    }
    return { status: existing.responseStatus ?? 200, body: existing.responseBody, headers: { 'Idempotent-Replayed': 'true' } };
  }

  let response: ApiResponse;
  try {
    response = await run();
  } catch (e) {
    await db.delete(idempotencyKeys).where(where);
    throw e;
  }
  if (response.status >= 500 || response.status === 429) {
    await db.delete(idempotencyKeys).where(where);
  } else {
    await db
      .update(idempotencyKeys)
      .set({ status: 'done', responseStatus: response.status, responseBody: response.body })
      .where(where);
  }
  return response;
}
