import type { Db } from '@/lib/db/client';
import { getDb } from '@/lib/db/client';
import { newId } from '@/lib/ids';
import { runAfterResponse } from '@/lib/after';
import { hashKey } from '@/lib/keys/keys';
import { withIdempotency } from '@/lib/idempotency/idempotency';
import { reportError } from '@/lib/observability/report';
import { ApiError, errorBody } from './errors';
import { logApiRequest } from './request-log';
import { countRequestForKey, dailyLimitError, type UsageResult } from './usage';

export type ApiResponse = { status: number; body: unknown; headers?: Record<string, string> };
export type ApiContext = { db: Db; merchantId: string; now: Date; requestId: string; idempotencyKey: string | null };
export type ApiHandler = (ctx: ApiContext, req: Request, params: Record<string, string>) => Promise<ApiResponse>;
export type ApiRouteContext = { params: Promise<Record<string, string>> };

const invalidKey = (message: string) => new ApiError(401, 'authentication_error', 'invalid_api_key', message);

function readKey(authorization: string | null): string | null {
  if (!authorization) return null;
  const [scheme, value] = authorization.trim().split(/\s+/, 2);
  if (!value) return null;
  if (scheme.toLowerCase() === 'bearer') return value;
  if (scheme.toLowerCase() === 'basic') return Buffer.from(value, 'base64').toString('utf8').split(':')[0] || null;
  return null;
}

/**
 * The merchant for the secret key, with today's API request counted, in one database round trip. Throws a 401 that
 * says what was wrong; the key-shape checks need no query.
 */
export async function authenticateAndCount(db: Db, authorization: string | null, now: Date): Promise<{ merchantId: string; usage: UsageResult }> {
  const key = readKey(authorization);
  if (!key) throw invalidKey('No API key provided.');
  if (key.startsWith('pk_test_')) {
    throw invalidKey("A publishable key can't be used here. Use your secret key (sk_test_…) on your server.");
  }
  if (key.startsWith('sk_live_') || key.startsWith('pk_live_')) throw invalidKey('PaySandbox has no live mode. Use your sk_test_ key.');
  const found = key.startsWith('sk_test_') ? await countRequestForKey(db, hashKey(key), now) : null;
  if (!found) throw invalidKey('Invalid API key.');
  return found;
}

const internalError = () => new ApiError(500, 'api_error', 'internal_error', 'Something went wrong on our side. Try again.');

/** Reads a copy of the body so the handler can still read the original. Invalid JSON hashes as its raw text. */
async function readJson(req: Request): Promise<unknown> {
  const text = await req.clone().text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorCodeOf(body: unknown): string | null {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === 'string' ? code : null;
}

/** `Server-Timing: app;dur=<ms>` shows in browser dev tools how long the server spent. */
function toResponse(r: ApiResponse, started: number): Response {
  return Response.json(r.body, { status: r.status, headers: { ...r.headers, 'server-timing': `app;dur=${Date.now() - started}` } });
}

/** Auth → daily cap → idempotency (POST) → handler → request log. Refused-by-cap requests are not logged. */
export function withApi(handler: ApiHandler, opts: { idempotent?: boolean } = {}) {
  return async (req: Request, route: ApiRouteContext): Promise<Response> => {
    const started = Date.now();
    const now = new Date();
    const db = getDb();
    const path = new URL(req.url).pathname;
    const idempotencyKey = req.headers.get('idempotency-key');

    let merchantId: string;
    try {
      const auth = await authenticateAndCount(db, req.headers.get('authorization'), now);
      merchantId = auth.merchantId;
      const usage = auth.usage;
      if (!usage.allowed) {
        const e = dailyLimitError('api_requests', usage);
        return toResponse({ status: e.status, body: errorBody(e), headers: e.headers }, started);
      }
    } catch (e) {
      const err = e instanceof ApiError ? e : internalError();
      return toResponse({ status: err.status, body: errorBody(err), headers: err.headers }, started);
    }

    const ctx: ApiContext = { db, merchantId, now, requestId: newId('req'), idempotencyKey };
    const params = await route.params;
    // ApiErrors become responses here, so idempotency can store 4xx results; unexpected errors still throw.
    const run = async (): Promise<ApiResponse> => {
      try {
        return await handler(ctx, req, params);
      } catch (e) {
        if (e instanceof ApiError) return { status: e.status, body: errorBody(e), headers: e.headers };
        throw e;
      }
    };

    let response: ApiResponse;
    try {
      response = opts.idempotent
        ? await withIdempotency(
            db,
            { merchantId, key: idempotencyKey, method: req.method, path, body: await readJson(req), now },
            run,
          )
        : await run();
    } catch (e) {
      const err = e instanceof ApiError ? e : internalError();
      if (!(e instanceof ApiError)) reportError(`api ${req.method} ${path}`, e);
      response = { status: err.status, body: errorBody(err), headers: err.headers };
    }
    const errorCode = response.status >= 400 ? errorCodeOf(response.body) : null;

    // After the response: the customer doesn't wait for the log write.
    const durationMs = Date.now() - started;
    runAfterResponse('api request log', () =>
      logApiRequest(db, { merchantId, method: req.method, path, status: response.status, idempotencyKey, errorCode, durationMs }),
    );
    return toResponse(response, started);
  };
}
