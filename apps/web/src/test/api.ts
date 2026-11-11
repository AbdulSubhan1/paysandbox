import type { ApiRouteContext } from '@/lib/api/handler';

type RouteHandler = (req: Request, route: ApiRouteContext) => Promise<Response>;

export type CallOptions = {
  key?: string | null;
  body?: unknown;
  idempotencyKey?: string;
  params?: Record<string, string>;
  path?: string;
  method?: string;
};

/** Calls a route handler the way Next.js would and returns status, headers and parsed JSON. */
export async function callRoute(handler: RouteHandler, opts: CallOptions = {}) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (opts.key) headers.set('authorization', `Bearer ${opts.key}`);
  if (opts.idempotencyKey) headers.set('idempotency-key', opts.idempotencyKey);
  const method = opts.method ?? (opts.body === undefined ? 'GET' : 'POST');
  const req = new Request(`http://localhost${opts.path ?? '/api/v1/test'}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body),
  });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, headers: res.headers, json: (await res.json()) as any };
}
