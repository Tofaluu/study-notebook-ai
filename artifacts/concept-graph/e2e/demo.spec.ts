import { expect, test } from '@playwright/test';

// The demo notebook is the first thing a new visitor sees, and it must work
// without an API key, so these tests also assert that no API calls are made.

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort());
  await page.goto('/');
});

test('opens the demo notebook on a first visit', async ({ page }) => {
  await expect(page.getByTestId('demo-banner')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Why 0.1 + 0.2 ≠ 0.3 in Floating Point' })).toBeVisible();
  await expect(page.getByText('Floating-Point Lecture.pdf').first()).toBeVisible();
});

test('clicking an underlined term opens its pre-generated concept tab', async ({ page }) => {
  const apiCalls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) apiCalls.push(request.url());
  });

  await page.getByTestId('term-machine epsilon').click();
  await expect(page.getByRole('heading', { name: 'Machine Epsilon', exact: true })).toBeVisible();

  // Prerequisite terms inside a concept page chain to further concept tabs
  await page.getByTestId('prereq-significand').click();
  await expect(page.getByRole('heading', { name: 'Significand', exact: true })).toBeVisible();

  expect(apiCalls).toEqual([]);
});

test('the pre-generated follow-up tab shows the selected passage and answer', async ({ page }) => {
  await page.getByTitle('Q: Why is 0.5 exact but 0.1 is not?').click();
  await expect(page.getByRole('heading', { name: 'Why 0.5 Is Exact but 0.1 Is Not' })).toBeVisible();
  await expect(page.getByText('Selected Passage')).toBeVisible();
});

test('the demo can be reopened from an empty notebook', async ({ page }) => {
  await page.getByRole('button', { name: 'New Notebook' }).click();
  await expect(page.getByRole('heading', { name: 'Begin your session.' })).toBeVisible();

  await page.getByRole('button', { name: 'Explore the demo notebook' }).click();
  // Inactive notebooks stay mounted (hidden) for instant switching, so scope to the visible one
  await expect(page.getByTestId('demo-banner').filter({ visible: true })).toBeVisible();
  await expect(page.getByTitle('Demo: Floating-Point Arithmetic')).toHaveCount(2);
});
