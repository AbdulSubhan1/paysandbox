import { type APIRequestContext, expect, type Page } from '@playwright/test';
import { E2E } from '../src/test/seed-e2e';

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

/** Fills the checkout with valid details and the given test card (by clicking it in the picker or typing). */
export async function fillCheckout(page: Page, card: string) {
  await page.getByLabel('Email').fill('ayesha@example.com');
  const spaced = card.replace(/(\d{4})(?=\d)/g, '$1 ');
  const pick = page.getByRole('button', { name: new RegExp(spaced) });
  if (await pick.count()) await pick.click();
  else await page.getByLabel('Card information').pressSequentially(card);
  await page.getByLabel(/Expiry/).pressSequentially('1229');
  await page.getByLabel(/CVC/).fill('123');
  await page.getByLabel('Name on card').fill('Ayesha Khan');
}

export const payButton = (page: Page) => page.getByRole('button', { name: /^Pay PKR/ });
export const banner = (page: Page) => page.getByText('TEST MODE · no real payments');
