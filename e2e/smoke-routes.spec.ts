import { expect, test, type Page } from '@playwright/test';

const clientGateway = process.env.CLIENT_GATEWAY_URL || 'http://localhost:8080';
const apiBase = process.env.API_BASE_URL || 'http://localhost:8000';

const navigateAndAssert = async (path: string, page: Page) => {
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveTitle(/VoiceAssist|Admin|Docs/i);
};

test.describe('Smoke: clients and backend', () => {
  test('api gateway health responds', async ({ request }) => {
    const response = await request.get(`${apiBase}/health`);
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    expect(payload).toBeTruthy();
  });

  test('web app renders home @smoke', async ({ page }) => {
    await navigateAndAssert(clientGateway, page);
  });

  test('admin panel renders dashboard @smoke', async ({ page }) => {
    await navigateAndAssert(`${clientGateway}/admin/`, page);
  });

  test('docs site renders index @smoke', async ({ page }) => {
    await navigateAndAssert(`${clientGateway}/docs/`, page);
  });
});
