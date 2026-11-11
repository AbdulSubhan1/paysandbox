import { formatPkt } from '@/lib/format';
import { cn } from '@/lib/utils';

type Attempt = {
  id: string;
  attempt: number;
  url: string;
  statusCode: number | null;
  error: string | null;
  durationMs: number;
  responseSnippet: string | null;
  requestHeaders: unknown;
  attemptedAt: Date;
};

const ERRORS: Record<string, string> = {
  timeout: 'Timed out after 10 s',
  network: 'Could not connect',
  blocked_address: 'Blocked: the URL points to a private address',
  redirect: 'Redirect (not followed)',
};

/** Every attempt: what we sent and what came back. The response is shown as plain text, never as markup. */
export function DeliveryAttempts({ attempts }: { attempts: Attempt[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {attempts.map((a) => {
        const ok = a.statusCode !== null && a.statusCode >= 200 && a.statusCode < 300 && !a.error;
        return (
          <li key={a.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-semibold">Attempt {a.attempt}</span>
              <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', ok ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive')}>
                {a.statusCode !== null ? `HTTP ${a.statusCode}` : 'No response'}
                {a.error ? ` · ${ERRORS[a.error] ?? a.error}` : ''}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatPkt(a.attemptedAt)} · {a.durationMs} ms
              </span>
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">Request headers we sent</summary>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">{JSON.stringify(a.requestHeaders, null, 2)}</pre>
            </details>
            {a.responseSnippet !== null && (
              <div>
                <div className="text-xs text-muted-foreground">Response (first 1 KB)</div>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre-wrap">{a.responseSnippet}</pre>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
