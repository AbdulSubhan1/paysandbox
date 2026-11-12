import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, expect, type Page } from '@playwright/test';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Db } from '../src/lib/db/client';
import * as schema from '../src/lib/db/schema';
import { createMerchant } from '../src/lib/merchants/merchants';
import { revealWebhookSecret, setWebhookEndpoint } from '../src/lib/webhooks/endpoints';
import { E2E } from '../src/test/seed-e2e';
import { makeUser } from '../src/test/factories';
import { E2E_BASE_URL, E2E_DATABASE_URL } from './env';

export const sessionBody = {
  amount: 510000,
  currency: 'pkr',
  line_items: [{ name: 'Developer hoodie', quantity: 1, amount: 510000 }],
  success_url: 'http://localhost:3090/e2e/store/thanks',
  cancel_url: 'http://localhost:3090/e2e/store',
};

export async function createSession(request: APIRequestContext, sk: string = E2E.merchantA.sk): Promise<{ id: string; url: string }> {
  const res = await request.post('/api/v1/checkout_sessions', { headers: { authorization: `Bearer ${sk}` }, data: sessionBody });
  expect(res.status()).toBe(200);
  return res.json();
}

/** The checkout streams in after the load event and the card field stays disabled until its guard runs. */
export async function waitForCheckout(page: Page) {
  await expect(page.getByLabel('Card information')).toBeEnabled();
}

/**
 * Fills the checkout with valid details and the given test card. A card in the picker is clicked, which also fills
 * the expiry and CVC; any other card is typed with its expiry and CVC.
 */
export async function fillCheckout(page: Page, card: string) {
  await waitForCheckout(page);
  await page.getByLabel('Email').fill('ayesha@example.com');
  const spaced = card.replace(/(\d{4})(?=\d)/g, '$1 ');
  const pick = page.getByRole('button', { name: new RegExp(spaced) });
  if (await pick.count()) {
    await pick.click();
    await expect(page.getByLabel(/Expiry/)).toHaveValue('12 / 34');
    await expect(page.getByLabel(/CVC/)).toHaveValue('123');
  } else {
    await page.getByLabel('Card information').pressSequentially(card);
    await page.getByLabel(/Expiry/).pressSequentially('1229');
    await page.getByLabel(/CVC/).fill('123');
  }
  await page.getByLabel('Name on card').fill('Ayesha Khan');
}

export const payButton = (page: Page) => page.getByRole('button', { name: /^Pay [A-Z]{3} / });
export const banner = (page: Page) => page.getByText('TEST MODE · no real payments');

export async function expectNoSeriousA11yIssues(page: Page) {
  // Toasts animate in with changing opacity, which axe reads as low contrast; they're checked at rest elsewhere.
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).exclude('[data-sonner-toaster]').analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

async function withDb<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: E2E_DATABASE_URL, max: 1 });
  try {
    return await fn(drizzle({ client: pool, schema, casing: 'snake_case' }) as unknown as Db);
  } finally {
    await pool.end();
  }
}

/** A fresh merchant per test, so parallel tests (desktop and mobile) never share a webhook endpoint. */
export async function newMerchant(): Promise<{ id: string; sk: string }> {
  return withDb(async (db) => {
    const user = await makeUser(db);
    const { merchant, secretKey } = await createMerchant(db, user.id, 'Webhook Shop');
    return { id: merchant.id, sk: secretKey };
  });
}

/** Points the merchant's endpoint at a local receiver (allowed in E2E mode) and returns its signing secret. */
export async function setEndpointFor(merchantId: string, url: string): Promise<string> {
  return withDb(async (db) => {
    await setWebhookEndpoint(db, merchantId, url, new Date(), { resolve: async () => [], allowPrivate: true });
    return revealWebhookSecret(db, merchantId);
  });
}

/** Runs due jobs on the server as if the clock were `advanceSeconds` ahead (retries, timers). */
export async function runJobs(request: APIRequestContext, advanceSeconds: number): Promise<number> {
  const res = await request.post('/api/internal/e2e/run-jobs', { data: { advanceSeconds } });
  expect(res.status()).toBe(200);
  return (await res.json()).ran;
}

/** Pays a checkout the way the browser does, without the browser. */
export async function payViaApi(request: APIRequestContext, sessionId: string, card: string): Promise<{ status: string; payment_id: string }> {
  const res = await request.post(`/c/${sessionId}/pay`, {
    data: { attempt_id: `e2e-${Date.now()}`, email: 'ayesha@example.com', name: 'Ayesha Khan', card_number: card, expiry: '12/29' },
  });
  expect(res.status()).toBe(200);
  return res.json();
}

/** Signs up a fresh E2E user, creates a project in the UI and returns its id and one-time secret key. */
export async function signUpWithProject(page: Page, name: string): Promise<{ merchantId: string; sk: string }> {
  const res = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin: E2E_BASE_URL },
    data: { email: `qa-${name.replace(/\W/g, '').toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@e2e.test`, password: 'correct-horse-battery-9', name: 'QA' },
  });
  expect(res.ok()).toBe(true);
  await page.goto('/dashboard/projects');
  await page.getByLabel('Project name').fill(name);
  await page.getByRole('button', { name: 'Create project' }).click();
  const dialog = page.getByRole('dialog', { name: 'Your secret key' });
  const sk = await dialog.getByRole('textbox').inputValue();
  await dialog.getByRole('button', { name: /copied it/ }).click();
  const href = await page.getByRole('link', { name: 'Open dashboard' }).first().getAttribute('href');
  return { merchantId: href!.split('/').pop()!, sk };
}
