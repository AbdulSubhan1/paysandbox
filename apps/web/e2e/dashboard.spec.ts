import { expect, test } from '@playwright/test';
import { createSession, expectNoSeriousA11yIssues, payViaApi, setEndpointFor, signUpWithProject } from './helpers';
import { startReceiver } from './receiver';

test('the overview adds up the project payments (PS-DB-001) @smoke', async ({ page, request }) => {
  const { merchantId, sk } = await signUpWithProject(page, 'Overview Shop');
  await payViaApi(request, (await createSession(request, sk)).id, '4242424242424242');
  await payViaApi(request, (await createSession(request, sk)).id, '4000000000009995');
  await page.goto(`/dashboard/${merchantId}`);
  const tile = (label: string) => page.getByRole('link', { name: new RegExp(`^${label} PKR`) });
  await expect(tile('Net volume')).toContainText('PKR 5,100.00');
  await expect(tile('Successful payments')).toContainText('1 payment · 50% of attempts');
  await expect(tile('Refunded and disputed')).toContainText('PKR 0.00');
  await expect(page.getByRole('img', { name: /successful volume per day, last 14 days: PKR 5,100.00 in total/ })).toBeVisible();
  const attention = page.getByRole('region', { name: 'Needs attention' });
  await expect(attention).toContainText('1 decline in the last 14 days');
  await attention.getByRole('link', { name: 'View' }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/${merchantId}/payments\\?status=failed&range=14d$`));
  await expect(page.getByText('Showing 1–1 of 1')).toBeVisible();
  await page.goto(`/dashboard/${merchantId}?range=7d`);
  await expect(page.getByLabel('Date range')).toHaveValue('7d');
  await expectNoSeriousA11yIssues(page);
});

test('refund part of a payment, then win a simulated dispute (PS-RF-010, PS-DP-001, PS-DP-003)', async ({ page, request }) => {
  const { merchantId, sk } = await signUpWithProject(page, 'Refund Shop');
  const { payment_id } = await payViaApi(request, (await createSession(request, sk)).id, '4242424242424242');
  await page.goto(`/dashboard/${merchantId}/payments`);
  await expectNoSeriousA11yIssues(page);
  await page.getByRole('searchbox').fill(payment_id);
  await page.keyboard.press('Enter');
  await expect(page.getByText('Showing 1–1 of 1')).toBeVisible();
  await page.getByRole('link', { name: 'Developer hoodie' }).click();
  await expect(page).toHaveURL(new RegExp(`/payments/${payment_id}$`));

  await page.getByRole('button', { name: 'Refund', exact: true }).click();
  const refund = page.getByRole('dialog', { name: 'Refund this payment' });
  await expect(refund.getByLabel('Amount')).toHaveValue(''); // never pre-filled
  await refund.getByLabel('Amount').fill('1,000');
  await refund.getByLabel('Reason').selectOption('requested_by_customer');
  await expectNoSeriousA11yIssues(page);
  await refund.getByRole('button', { name: 'Refund', exact: true }).click();
  await expect(page.locator('[data-toast]').getByText('Refunded PKR 1,000.00')).toBeVisible();
  await expect(refund).toHaveCount(0);
  await expect(page.getByText('Partly refunded').first()).toBeVisible();
  await expect(page.getByText('Refunded PKR 1,000.00', { exact: true }).last()).toBeVisible();

  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Simulate dispute' }).click();
  await page.getByRole('alertdialog', { name: 'Simulate a dispute?' }).getByRole('button', { name: 'Simulate dispute' }).click();
  await expect(page.getByRole('heading', { name: 'Dispute: needs your response' })).toBeVisible();
  await expect(page.getByText(/PKR 4,100.00 is on hold/)).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole('button', { name: 'Submit evidence and win' }).click();
  await expect(page.getByRole('heading', { name: 'Dispute: needs your response' })).toHaveCount(0);
  await expect(page.getByText('Partly refunded').first()).toBeVisible();
});

test('Resend now sends the event again with the same webhook-id (PS-WH-009)', async ({ page, request }) => {
  const receiver = await startReceiver([200]);
  const { merchantId, sk } = await signUpWithProject(page, 'Resend Shop');
  await setEndpointFor(merchantId, receiver.url);
  await payViaApi(request, (await createSession(request, sk)).id, '4242424242424242');
  await expect.poll(() => receiver.received.length, { timeout: 15_000 }).toBe(1);
  await page.goto(`/dashboard/${merchantId}/webhooks`);
  await page.getByRole('link', { name: 'payment.succeeded' }).click();
  await page.getByRole('button', { name: 'Resend now' }).click();
  await expect.poll(() => receiver.received.length, { timeout: 15_000 }).toBe(2);
  expect(receiver.received[1].headers['webhook-id']).toBe(receiver.received[0].headers['webhook-id']);
  await receiver.close();
});

test('a new project shows an empty overview (PS-DB-005)', async ({ page }) => {
  const { merchantId } = await signUpWithProject(page, 'Empty Shop');
  await page.goto(`/dashboard/${merchantId}`);
  await expect(page.getByRole('heading', { name: 'No payments yet' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Make your first test payment' })).toHaveAttribute('href', `/dashboard/${merchantId}/developers`);
});

test("someone else's project and payment URLs show the 404 page (Plan 3 Review Focus 1)", async ({ page, browser, request }) => {
  const { merchantId, sk } = await signUpWithProject(page, 'Private Shop');
  const { payment_id } = await payViaApi(request, (await createSession(request, sk)).id, '4242424242424242');
  const other = await browser.newPage();
  await signUpWithProject(other, 'Nosy Shop');
  for (const path of [`/dashboard/${merchantId}`, `/dashboard/${merchantId}/payments/${payment_id}`]) {
    await other.goto(path);
    await expect(other.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expect(other.getByText('PKR 5,100.00')).toHaveCount(0);
  }
  await other.close();
});

test('the sidebar opens every page and stays signed in', async ({ page, request }) => {
  const { merchantId, sk } = await signUpWithProject(page, 'Nav Shop');
  await payViaApi(request, (await createSession(request, sk)).id, '4242424242424242');
  await page.goto(`/dashboard/${merchantId}`);
  const nav = page.getByRole('navigation', { name: 'Project' });
  for (const [label, path, heading] of [
    ['Payments', '/payments', 'Payments'],
    ['Customers', '/customers', 'Customers'],
    ['Disputes', '/disputes', 'Disputes'],
    ['Test cards', '/test-cards', 'Test cards'],
    ['API keys & code', '/developers', 'API keys & code'],
    ['Webhooks', '/webhooks', 'Webhooks'],
    ['API request log', '/logs', 'API request log'],
    ['Overview', '', 'Overview'],
  ] as const) {
    await nav.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/${merchantId}${path}$`));
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
});
