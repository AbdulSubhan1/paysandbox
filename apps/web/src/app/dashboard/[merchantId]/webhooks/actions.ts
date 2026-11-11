'use server';

import { revalidatePath } from 'next/cache';
import { isE2eMode } from '@/lib/auth/allowlist';
import { requireUser } from '@/lib/auth/session';
import { getDb } from '@/lib/db/client';
import type { EventType } from '@/lib/events/record';
import { flushJobsAfterResponse } from '@/lib/jobs/flush';
import { getOwnedMerchant } from '@/lib/merchants/merchants';
import {
  EndpointError,
  reenableWebhookEndpoint,
  revealWebhookSecret,
  rollWebhookSecret,
  setWebhookEndpoint,
} from '@/lib/webhooks/endpoints';
import { resendEvent } from '@/lib/webhooks/resend';
import { defaultResolver } from '@/lib/webhooks/ssrf';
import { sendTestEvent, TEST_EVENT_TYPES } from '@/lib/webhooks/test-events';

export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

const NOT_FOUND = { ok: false as const, error: 'Project not found.' };

async function owns(merchantId: string): Promise<boolean> {
  const user = await requireUser();
  return !!(await getOwnedMerchant(getDb(), user.id, merchantId));
}

export async function saveWebhookEndpointAction(merchantId: string, url: string): Promise<ActionResult<{ url: string }>> {
  if (!(await owns(merchantId))) return NOT_FOUND;
  try {
    const row = await setWebhookEndpoint(getDb(), merchantId, url, new Date(), { resolve: defaultResolver, allowPrivate: isE2eMode() });
    revalidatePath(`/dashboard/${merchantId}/webhooks`);
    return { ok: true, url: row.url };
  } catch (e) {
    if (e instanceof EndpointError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function revealWebhookSecretAction(merchantId: string): Promise<ActionResult<{ secret: string }>> {
  if (!(await owns(merchantId))) return NOT_FOUND;
  return { ok: true, secret: await revealWebhookSecret(getDb(), merchantId) };
}

export async function rollWebhookSecretAction(merchantId: string): Promise<ActionResult<{ secret: string }>> {
  if (!(await owns(merchantId))) return NOT_FOUND;
  return { ok: true, secret: await rollWebhookSecret(getDb(), merchantId, new Date()) };
}

export async function reenableWebhookEndpointAction(merchantId: string): Promise<ActionResult> {
  if (!(await owns(merchantId))) return NOT_FOUND;
  await reenableWebhookEndpoint(getDb(), merchantId);
  revalidatePath(`/dashboard/${merchantId}/webhooks`);
  return { ok: true };
}

export async function sendTestEventAction(merchantId: string, type: string): Promise<ActionResult<{ eventId: string }>> {
  if (!(await owns(merchantId))) return NOT_FOUND;
  if (!TEST_EVENT_TYPES.includes(type as EventType)) return { ok: false, error: 'Unknown event type.' };
  const r = await sendTestEvent(getDb(), merchantId, type as EventType, new Date());
  if (!r.ok)
    return {
      ok: false,
      error: r.reason === 'no_endpoint' ? 'Save an enabled endpoint first.' : 'You have sent 50 test events today. Try again tomorrow.',
    };
  flushJobsAfterResponse({ merchantId });
  return { ok: true, eventId: r.eventId };
}

const RESEND_ERRORS = {
  no_delivery: 'This event was recorded before a webhook endpoint was saved, so there is nothing to resend.',
  endpoint_disabled: 'The endpoint is disabled. Re-enable it first.',
  in_progress: 'A retry is already scheduled for this event.',
} as const;

export async function resendEventAction(merchantId: string, eventId: string): Promise<ActionResult> {
  if (!(await owns(merchantId))) return NOT_FOUND;
  const r = await resendEvent(getDb(), merchantId, eventId, new Date());
  if (!r.ok) return { ok: false, error: RESEND_ERRORS[r.reason] };
  flushJobsAfterResponse({ merchantId });
  revalidatePath(`/dashboard/${merchantId}/webhooks/${eventId}`);
  return { ok: true };
}
