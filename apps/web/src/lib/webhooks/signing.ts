import { randomBytes } from 'node:crypto';
import { Webhook } from 'standardwebhooks';

export type WebhookHeaders = { 'webhook-id': string; 'webhook-timestamp': string; 'webhook-signature': string };

/** `whsec_` + base64 of 24 random bytes (Standard Webhooks secret format). */
export function newSigningSecret(): string {
  return `whsec_${randomBytes(24).toString('base64')}`;
}

/** Signs with every secret given (during a roll: new first, then old), space-separated, using the official library. */
export function signWebhook(secrets: string[], msgId: string, timestamp: Date, body: string): WebhookHeaders {
  return {
    'webhook-id': msgId,
    'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
    'webhook-signature': secrets.map((s) => new Webhook(s).sign(msgId, timestamp, body)).join(' '),
  };
}
