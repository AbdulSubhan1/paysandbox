import { type AnyColumn, type SQL, sql } from 'drizzle-orm';

/** "Older" page cursor: `<createdAt ms>.<id>`. Opaque to the UI; a bad one means "first page". */
export function encodeCursor(row: { createdAt: Date; id: string }): string {
  return `${row.createdAt.getTime()}.${row.id}`;
}

export function decodeCursor(raw: string | undefined): { at: Date; id: string } | null {
  const m = /^(\d{1,15})\.([A-Za-z0-9_]+)$/.exec(raw ?? '');
  return m ? { at: new Date(Number(m[1])), id: m[2] } : null;
}

/**
 * Rows strictly older than the cursor, newest first by (createdAt, id). Timestamps are compared at millisecond
 * precision, because the cursor carries milliseconds and some tables default to the database clock (microseconds).
 */
export function olderThan(createdAt: AnyColumn, id: AnyColumn, cursor: { at: Date; id: string }): SQL {
  return sql`(date_trunc('milliseconds', ${createdAt}), ${id}) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id})`;
}

/** Fetch one extra row to know whether there is a next page. */
export function pageOf<T extends { createdAt: Date; id: string }>(rows: T[], size: number): { rows: T[]; next: string | null } {
  return rows.length > size ? { rows: rows.slice(0, size), next: encodeCursor(rows[size - 1]) } : { rows, next: null };
}
