import { expect, test } from '@playwright/test';
import { banner, createSession, expectNoSeriousA11yIssues, fillCheckout, payButton, waitForCheckout } from './helpers';

test('4242 pays and returns to the store @smoke', async ({ page }) => {
  await page.goto('/e2e/store');
  await page.getByRole('button', { name: /Checkout/ }).click();
  await expect(page).toHaveURL(/\/c\/cs_test_[0-9A-Za-z]{24}$/);
  await fillCheckout(page, '4242424242424242');
  await payButton(page).click();
  await expect(page.getByRole('heading', { name: 'Payment successful' })).toBeVisible();
  await page.getByRole('link', { name: /Return to Chai Code Co./ }).click();
  await expect(page).toHaveURL(/\/e2e\/store\/thanks\?pay=pay_/);
  await expect(page.getByTestId('pay')).toHaveText(/^pay_/);
});

test('9995 shows insufficient funds @smoke', async ({ page, request }) => {
  await page.goto((await createSession(request)).url);
  await fillCheckout(page, '4000000000009995');
  await payButton(page).click();
  await expect(page.getByRole('heading', { name: 'Payment declined' })).toBeVisible();
  await expect(page.getByText('card_declined · insufficient_funds')).toBeVisible();
});

test('3220 with OTP 123456 succeeds @smoke', async ({ page, request }) => {
  await page.goto((await createSession(request)).url);
  await fillCheckout(page, '4000000000003220');
  await payButton(page).click();
  const dialog = page.getByRole('dialog', { name: 'Confirm your payment' });
  await expect(dialog).toBeVisible();
  await page.keyboard.type('123456');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Payment successful' })).toBeVisible();
});

test('a real-looking card is cleared and nothing is sent @smoke', async ({ page, request }) => {
  await page.goto((await createSession(request)).url);
  const bodies: string[] = [];
  page.on('request', (r) => bodies.push(r.postData() ?? ''));
  const card = page.getByLabel('Card information');
  await waitForCheckout(page);
  await card.pressSequentially('5398');
  await expect(card).toHaveValue('');
  await expect(page.getByText(/isn't a PaySandbox test card/)).toBeVisible();
  await page.getByRole('button', { name: /5398 2283 4729 1056/ }).click();
  await expect(card).toHaveValue('');
  expect(bodies.join('')).not.toContain('5398');
});

test('the TEST MODE banner is on every checkout state @smoke', async ({ page, request }) => {
  const { url } = await createSession(request);
  await page.goto(url);
  await expect(banner(page)).toBeVisible(); // form
  await fillCheckout(page, '4000000000003220');
  await payButton(page).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(banner(page)).toBeVisible(); // OTP dialog
  await page.getByRole('button', { name: 'Cancel payment' }).click();
  await expect(page.getByRole('heading', { name: 'Payment declined' })).toBeVisible();
  await expect(banner(page)).toBeVisible(); // declined
  await page.goto('/c/cs_test_doesnotexist000000000000');
  await expect(page.getByRole('heading', { name: 'Checkout not found' })).toBeVisible();
  await expect(banner(page)).toBeVisible(); // not found
});

test('a paid session cannot be paid again', async ({ page, request }) => {
  const { url } = await createSession(request);
  await page.goto(url);
  await fillCheckout(page, '4242424242424242');
  await payButton(page).click();
  await expect(page.getByRole('heading', { name: 'Payment successful' })).toBeVisible();
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Already paid' })).toBeVisible();
  await expect(banner(page)).toBeVisible();
  await expect(payButton(page)).toHaveCount(0);
});

test('double-clicking Pay creates one payment', async ({ page, request }) => {
  await page.goto((await createSession(request)).url);
  await fillCheckout(page, '4242424242424242');
  const posts: string[] = [];
  page.on('request', (r) => r.method() === 'POST' && r.url().endsWith('/pay') && posts.push(r.url()));
  await payButton(page).dblclick();
  await expect(page.getByRole('heading', { name: 'Payment successful' })).toBeVisible();
  expect(posts).toHaveLength(1);
});

test('the checkout cannot be framed and sends security headers', async ({ request }) => {
  const { url } = await createSession(request);
  const res = await request.get(url);
  const h = res.headers();
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('strict-origin');
  expect(h['strict-transport-security']).toContain('max-age=63072000');
});

test('axe: no serious or critical issues on the checkout @smoke', async ({ page, request }) => {
  await page.goto((await createSession(request)).url);
  await expectNoSeriousA11yIssues(page); // form
  await payButton(page).click();
  await expect(page.getByText('Enter your email.')).toBeVisible();
  await expectNoSeriousA11yIssues(page); // errors
  await fillCheckout(page, '4000000000003220');
  await payButton(page).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectNoSeriousA11yIssues(page); // OTP dialog
  await page.keyboard.type('123456');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Payment successful' })).toBeVisible();
  await expectNoSeriousA11yIssues(page); // success
});
