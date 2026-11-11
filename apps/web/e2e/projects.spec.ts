import { expect, test } from '@playwright/test';
import { E2E_BASE_URL } from './env';
import { expectNoSeriousA11yIssues, fillCheckout, payButton } from './helpers';

test('a new project shows its secret key once, then only the last 4 (PS-DEV-003)', async ({ page }) => {
  const email = `qa-${Date.now()}@e2e.test`;
  const res = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin: E2E_BASE_URL },
    data: { email, password: 'correct-horse-battery-9', name: 'QA' },
  });
  expect(res.ok()).toBe(true);

  await page.goto('/dashboard/projects');
  await page.getByLabel('Project name').fill('E2E Store');
  await page.getByRole('button', { name: 'Create project' }).click();
  const dialog = page.getByRole('dialog', { name: 'Your secret key' });
  await expect(dialog).toBeVisible();
  const secret = await dialog.getByRole('textbox').inputValue();
  expect(secret).toMatch(/^sk_test_[0-9A-Za-z]{32}$/);
  await dialog.getByRole('button', { name: /copied it/ }).click();

  const href = await page.getByRole('link', { name: 'Open dashboard' }).getAttribute('href');
  await page.goto(`${href}/developers`);
  await expect(page.getByText(`sk_test_…${secret.slice(-4)}`)).toBeVisible();
  await expect(page.getByText(secret)).toHaveCount(0);
});

test('rolling the secret key shows the new key and closes the confirm dialog', async ({ page }) => {
  const res = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin: E2E_BASE_URL },
    data: { email: `qa-roll-${Date.now()}@e2e.test`, password: 'correct-horse-battery-9', name: 'QA' },
  });
  expect(res.ok()).toBe(true);
  await page.goto('/dashboard/projects');
  await page.getByLabel('Project name').fill('Roll Store');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('dialog', { name: 'Your secret key' }).getByRole('button', { name: /copied it/ }).click();
  await page.goto(`${await page.getByRole('link', { name: 'Open dashboard' }).getAttribute('href')}/developers`);

  await page.getByRole('button', { name: 'Roll secret key' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Roll key' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  const dialog = page.getByRole('dialog', { name: 'Your secret key' });
  await expect(dialog.getByRole('textbox')).toHaveValue(/^sk_test_[0-9A-Za-z]{32}$/);
  await dialog.getByRole('button', { name: /copied it/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0); // the confirm dialog must not be waiting underneath
});

test('someone not on the allowlist cannot sign up', async ({ page }) => {
  const res = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin: E2E_BASE_URL },
    data: { email: `stranger-${Date.now()}@gmail.com`, password: 'correct-horse-battery-9', name: 'S' },
  });
  expect(res.ok()).toBe(false);
});

test('a project takes an https webhook endpoint and shows, then rolls, its signing secret (PS-WH-015)', async ({ page }) => {
  const res = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin: E2E_BASE_URL },
    data: { email: `qa-wh-${Date.now()}@e2e.test`, password: 'correct-horse-battery-9', name: 'QA' },
  });
  expect(res.ok()).toBe(true);
  await page.goto('/dashboard/projects');
  await page.getByLabel('Project name').fill('Webhook Store');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('dialog', { name: 'Your secret key' }).getByRole('button', { name: /copied it/ }).click();
  await page.goto(`${await page.getByRole('link', { name: 'Open dashboard' }).getAttribute('href')}/webhooks`);

  const url = page.getByLabel('Webhook endpoint URL');
  await url.fill('http://10.0.0.5/x');
  await page.getByRole('button', { name: 'Save endpoint' }).click();
  await expect(page.locator('form').filter({ has: url }).getByText(/must use https/)).toBeVisible(); // under the field
  await expect(page.locator('[data-sonner-toast]').getByText(/must use https/)).toBeVisible(); // and as a toast

  await url.fill('http://127.0.0.1:4555/hook'); // allowed only in E2E mode
  await page.getByRole('button', { name: 'Save endpoint' }).click();
  await expect(page.getByText('whsec_••••••••')).toBeVisible();
  await expect(page.locator('[data-sonner-toast]').getByText('Endpoint saved')).toBeVisible();

  await page.getByRole('button', { name: 'Reveal' }).click();
  const secret = page.getByLabel('Signing secret', { exact: true });
  await expect(secret).toHaveValue(/^whsec_[A-Za-z0-9+/]{32}$/);
  const first = await secret.inputValue();

  await page.getByRole('button', { name: 'Roll signing secret' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Roll signing secret' }).click();
  await expect(secret).not.toHaveValue(first);
  await expect(secret).toHaveValue(/^whsec_/);
  await expect(page.getByRole('alertdialog')).toHaveCount(0); // let the dialog finish closing before axe looks
  await expectNoSeriousA11yIssues(page);
});

test('a USD project charges in USD everywhere, and its currency locks after the first checkout', async ({ page }) => {
  const res = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin: E2E_BASE_URL },
    data: { email: `qa-usd-${Date.now()}@e2e.test`, password: 'correct-horse-battery-9', name: 'QA' },
  });
  expect(res.ok()).toBe(true);

  await page.goto('/dashboard/projects');
  await page.getByLabel('Project name').fill('Insurance Site');
  await page.getByLabel('Currency', { exact: true }).selectOption('usd');
  await page.getByRole('button', { name: 'Create project' }).click();
  const dialog = page.getByRole('dialog', { name: 'Your secret key' });
  const sk = await dialog.getByRole('textbox').inputValue();
  await dialog.getByRole('button', { name: /copied it/ }).click();
  await expect(page.getByLabel('Currency of Insurance Site')).toHaveValue('usd');

  // currency left out: the project's is used
  const session = await page.request.post('/api/v1/checkout_sessions', {
    headers: { authorization: `Bearer ${sk}` },
    data: { amount: 29999, line_items: [{ name: 'Car plan', quantity: 1, amount: 29999 }], success_url: 'http://localhost:3090/e2e/store/thanks', cancel_url: 'http://localhost:3090/e2e/store' },
  });
  expect(session.status()).toBe(200);
  const { url, currency } = await session.json();
  expect(currency).toBe('usd');

  await page.goto(url);
  await fillCheckout(page, '4242424242424242');
  await expect(payButton(page)).toHaveText(/USD 299\.99/);
  await payButton(page).click();
  await expect(page.getByText('Payment successful')).toBeVisible();

  await page.goto('/dashboard/projects');
  await expect(page.getByText('USD (locked)')).toBeVisible();
  const href = await page.getByRole('link', { name: 'Open dashboard' }).getAttribute('href');
  await page.goto(href!);
  await expect(page.getByText('USD 299.99').first()).toBeVisible();
});
