import { after } from 'next/server';
import { reportError } from '@/lib/observability/report';

/** Work that must not delay the response (e.g. the API request log). Unit tests run it straight away (setup-node). */
export function runAfterResponse(where: string, task: () => Promise<unknown>): void {
  after(async () => {
    try {
      await task();
    } catch (e) {
      reportError(where, e);
    }
  });
}
