import { expect, test } from '@playwright/test';
import { E2E_BASE_URL } from './env';
import { expectNoSeriousA11yIssues } from './helpers';

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

  await page.reload();
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

  const url = page.getByLabel('Webhook endpoint URL');
  await url.fill('http://10.0.0.5/x');
  await page.getByRole('button', { name: 'Save endpoint' }).click();
  await expect(page.getByText(/must use https/)).toBeVisible();

  await url.fill('http://127.0.0.1:4555/hook'); // allowed only in E2E mode
  await page.getByRole('button', { name: 'Save endpoint' }).click();
  await expect(page.getByText('whsec_••••••••')).toBeVisible();

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
