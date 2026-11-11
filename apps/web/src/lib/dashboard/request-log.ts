import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { apiRequestLog } from '@/lib/db/schema';
import { decodeCursor, olderThan, pageOf } from './cursor';

export const REQUEST_LOG_PAGE_SIZE = 50;

export type RequestLogRow = {
  id: string;
  method: string;
  path: string;
  status: number;
  idempotencyKey: string | null;
  errorCode: string | null;
  durationMs: number;
  createdAt: Date;
};

/** The API request log. Bodies are never stored, so there is nothing to show of them. */
export async function listApiRequests(
  db: Db,
  merchantId: string,
  opts: { before?: string; failedOnly?: boolean },
): Promise<{ rows: RequestLogRow[]; next: string | null }> {
  const cursor = decodeCursor(opts.before);
  const rows = await db
    .select({
      id: apiRequestLog.id,
      method: apiRequestLog.method,
      path: apiRequestLog.path,
      status: apiRequestLog.status,
      idempotencyKey: apiRequestLog.idempotencyKey,
      errorCode: apiRequestLog.errorCode,
      durationMs: apiRequestLog.durationMs,
      createdAt: apiRequestLog.createdAt,
    })
    .from(apiRequestLog)
    .where(
      and(
        eq(apiRequestLog.merchantId, merchantId),
        opts.failedOnly ? gte(apiRequestLog.status, 400) : undefined,
        cursor ? olderThan(apiRequestLog.createdAt, apiRequestLog.id, cursor) : undefined,
      ),
    )
    .orderBy(sql`date_trunc('milliseconds', ${apiRequestLog.createdAt}) desc`, desc(apiRequestLog.id))
    .limit(REQUEST_LOG_PAGE_SIZE + 1);
  return pageOf(rows, REQUEST_LOG_PAGE_SIZE);
}
