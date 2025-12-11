/**
 * Simple Voice Test - Based on codegen recording
 * Exactly matches the user's codegen flow
 */

import { test, expect } from '@playwright/test';

test.describe('Voice Mode - Simple Test', () => {
  test('login and click voice button', async ({ page }) => {
    // Exactly matching codegen recording:
    await page.goto('http://localhost:5173/');
    await page.getByTestId('chat-with-voice-card').click();

    // Login - using exact selectors from codegen
    await page.getByRole('textbox', { name: 'Emailrequired' }).click();
    await page.getByRole('textbox', { name: 'Emailrequired' }).fill('test@example.com');
    await page.getByRole('textbox', { name: 'Emailrequired' }).press('Tab');
    await page.getByRole('textbox', { name: 'Passwordrequired' }).fill('uL8-p9rp');
    await page.getByRole('button', { name: 'Sign in to VoiceAssist' }).click();

    // After login, navigate to voice chat
    await page.getByTestId('chat-with-voice-card').click();

    // Click voice button
    await page.getByTestId('voice-mode-toggle').click();

    // Verify voice panel appears
    const voicePanel = page.locator('[data-testid="compact-voice-bar"], [data-testid="voice-mode-panel"]').first();
    await expect(voicePanel).toBeVisible({ timeout: 15000 });
    console.log('[Test] Voice panel visible! Test passed.');
  });
});
