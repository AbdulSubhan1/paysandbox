import { expect, test } from '@playwright/test';
import { E2E_BASE_URL } from './env';
import { expectNoSeriousA11yIssues } from './helpers';

test('an unknown address shows the PaySandbox 404 page', async ({ page }) => {
  const res = await page.goto('/this-page-does-not-exist');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to PaySandbox home' })).toHaveAttribute('href', '/');
  await expect(page.getByRole('link', { name: 'Your projects' })).toHaveAttribute('href', '/dashboard/projects');
  await expectNoSeriousA11yIssues(page);
});

test('/dashboard opens your projects', async ({ page }) => {
  const res = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin: E2E_BASE_URL },
    data: { email: `qa-dash-${Date.now()}@e2e.test`, password: 'correct-horse-battery-9', name: 'QA' },
  });
  expect(res.ok()).toBe(true);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard\/projects$/);
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
});
