import { expect, test } from '@playwright/test';
import { E2E_BASE_URL } from './env';

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

test('someone not on the allowlist cannot sign up', async ({ page }) => {
  const res = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin: E2E_BASE_URL },
    data: { email: `stranger-${Date.now()}@gmail.com`, password: 'correct-horse-battery-9', name: 'S' },
  });
  expect(res.ok()).toBe(false);
});
