import { expect, test } from '@playwright/test';

test('the sidebar starts closed on phones so the demo answer is visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('demo-banner')).toBeInViewport();
  await expect(page.getByRole('button', { name: 'New Notebook' })).not.toBeInViewport();
});
