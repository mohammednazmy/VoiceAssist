import { test, expect } from '@playwright/test';

test('admin login works', async ({ page }) => {
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      console.log('NAV:', frame.url());
    }
  });

  await page.goto('http://localhost:8080/admin/login');
  await page.waitForTimeout(2000);
  
  await page.fill('input[type="email"], input[name="email"]', 'mo@asimo.io');
  await page.fill('input[type="password"], input[name="password"]', 'uL8-p9rp');
  await page.click('button[type="submit"]');
  
  // Wait for navigation
  await page.waitForTimeout(5000);
  
  const finalUrl = page.url();
  console.log('FINAL:', finalUrl);
  
  expect(finalUrl).toContain('localhost:8080');
  expect(finalUrl).not.toContain('asimo.io');
});
