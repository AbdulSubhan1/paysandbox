/**
 * Reports an unexpected error with only where it happened, its name and its code (e.g. a Postgres SQLSTATE).
 * Never the message or stack: on the payment path those can contain request data.
 */
export function reportError(where: string, e: unknown): void {
  const name = e instanceof Error ? e.name : typeof e;
  const code = (e as { code?: unknown } | null)?.code;
  console.error(JSON.stringify({ level: 'error', where, name, ...(typeof code === 'string' ? { code } : {}) }));
}
