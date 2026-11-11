import type { Db } from '@/lib/db/client';
import { apiRequestLog } from '@/lib/db/schema';
import { newId } from '@/lib/ids';

export type RequestLogEntry = {
  merchantId: string;
  method: string;
  path: string;
  status: number;
  idempotencyKey: string | null;
  errorCode: string | null;
  durationMs: number;
};

/** Never stores request or response bodies. */
export async function logApiRequest(db: Db, entry: RequestLogEntry): Promise<void> {
  await db.insert(apiRequestLog).values({ id: newId('req'), ...entry });
}
