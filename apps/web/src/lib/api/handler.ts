import type { Db } from '@/lib/db/client';
import { getDb } from '@/lib/db/client';
import { newId } from '@/lib/ids';
import { findMerchantBySecretKey } from '@/lib/keys/keys';
import { ApiError, errorBody } from './errors';
import { logApiRequest } from './request-log';
import { consumeUsage, dailyLimitError } from './usage';

export type ApiResponse = { status: number; body: unknown; headers?: Record<string, string> };
export type ApiContext = { db: Db; merchantId: string; now: Date; requestId: string; idempotencyKey: string | null };
export type ApiHandler = (ctx: ApiContext, req: Request, params: Record<string, string>) => Promise<ApiResponse>;
export type RouteContext = { params: Promise<Record<string, string>> };

const invalidKey = (message: string) => new ApiError(401, 'authentication_error', 'invalid_api_key', message);

function readKey(authorization: string | null): string | null {
  if (!authorization) return null;
  const [scheme, value] = authorization.trim().split(/\s+/, 2);
  if (!value) return null;
  if (scheme.toLowerCase() === 'bearer') return value;
  if (scheme.toLowerCase() === 'basic') return Buffer.from(value, 'base64').toString('utf8').split(':')[0] || null;
  return null;
}

/** Returns the merchant ID for a secret key, or throws a 401 that says what was wrong. */
export async function authenticateRequest(db: Db, authorization: string | null, now: Date): Promise<string> {
  const key = readKey(authorization);
  if (!key) throw invalidKey('No API key provided.');
  if (key.startsWith('pk_test_')) {
    throw invalidKey("A publishable key can't be used here. Use your secret key (sk_test_…) on your server.");
  }
  if (key.startsWith('sk_live_') || key.startsWith('pk_live_')) throw invalidKey('PaySandbox has no live mode. Use your sk_test_ key.');
  const merchantId = key.startsWith('sk_test_') ? await findMerchantBySecretKey(db, key, now) : null;
  if (!merchantId) throw invalidKey('Invalid API key.');
  return merchantId;
}

const internalError = () => new ApiError(500, 'api_error', 'internal_error', 'Something went wrong on our side. Try again.');

function toResponse(r: ApiResponse): Response {
  return Response.json(r.body, { status: r.status, headers: r.headers });
}

/** Auth → daily cap → handler → request log. Refused-by-cap requests are not logged. */
export function withApi(handler: ApiHandler) {
  return async (req: Request, route: RouteContext): Promise<Response> => {
    const started = Date.now();
    const now = new Date();
    const db = getDb();
    const path = new URL(req.url).pathname;
    const idempotencyKey = req.headers.get('idempotency-key');

    let merchantId: string;
    try {
      merchantId = await authenticateRequest(db, req.headers.get('authorization'), now);
      const usage = await consumeUsage(db, merchantId, 'api_requests', now);
      if (!usage.allowed) {
        const e = dailyLimitError('api_requests', usage);
        return toResponse({ status: e.status, body: errorBody(e), headers: e.headers });
      }
    } catch (e) {
      const err = e instanceof ApiError ? e : internalError();
      return toResponse({ status: err.status, body: errorBody(err), headers: err.headers });
    }

    let response: ApiResponse;
    let errorCode: string | null = null;
    try {
      response = await handler({ db, merchantId, now, requestId: newId('req'), idempotencyKey }, req, await route.params);
    } catch (e) {
      const err = e instanceof ApiError ? e : internalError();
      if (!(e instanceof ApiError)) console.error('api_error', req.method, path, e instanceof Error ? e.name : 'unknown');
      response = { status: err.status, body: errorBody(err), headers: err.headers };
      errorCode = err.code;
    }

    await logApiRequest(db, {
      merchantId,
      method: req.method,
      path,
      status: response.status,
      idempotencyKey,
      errorCode,
      durationMs: Date.now() - started,
    });
    return toResponse(response);
  };
}
