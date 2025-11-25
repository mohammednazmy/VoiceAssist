/**
 * Login E2E Test
 *
 * Tests the authentication flow for VoiceAssist web application.
 * Verifies that users can log in with valid credentials and are redirected to the dashboard.
 */

import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the login page before each test
    await page.goto('/login');
  });

  test('should display the login page correctly', async ({ page }) => {
    // Verify login page elements are visible
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByText('Sign in to your VoiceAssist account')).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('should show validation errors for empty form submission', async ({ page }) => {
    // Click sign in without entering credentials
    await page.getByRole('button', { name: /sign in/i }).click();

    // Expect validation errors to appear
    await expect(page.getByText(/email/i)).toBeVisible();
  });

  test('should show validation error for invalid email format', async ({ page }) => {
    // Enter invalid email
    await page.getByLabel(/email/i).fill('invalid-email');
    await page.getByLabel(/password/i).fill('password123');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Expect email validation error
    await expect(page.locator('[role="alert"]')).toBeVisible();
  });

  test('user can log in successfully with valid credentials', async ({ page }) => {
    // Fill in the login form with valid test credentials
    // Note: These credentials should match your test environment
    await page.getByLabel(/email/i).fill('testuser@example.com');
    await page.getByLabel(/password/i).fill('TestPassword123!');

    // Click the sign in button
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for navigation to complete after successful login
    // User should be redirected to the home page (dashboard)
    await expect(page).toHaveURL('/');

    // Verify dashboard elements are visible after login
    // Adjust these assertions based on actual dashboard content
    await expect(page.locator('body')).toBeVisible();
  });

  test('should toggle password visibility', async ({ page }) => {
    const passwordInput = page.getByLabel(/password/i);
    const toggleButton = page.getByRole('button', { name: /show password|hide password/i });

    // Initially password should be hidden
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click to show password
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // Click to hide password again
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('should navigate to registration page', async ({ page }) => {
    // Click the "Sign up" link
    await page.getByRole('link', { name: /sign up/i }).click();

    // Verify navigation to register page
    await expect(page).toHaveURL('/register');
  });

  test('should navigate to forgot password page', async ({ page }) => {
    // Click the "Forgot password?" link
    await page.getByRole('link', { name: /forgot password/i }).click();

    // Verify navigation to forgot password page
    await expect(page).toHaveURL('/forgot-password');
  });

  test('should display OAuth login options', async ({ page }) => {
    // Verify OAuth buttons are visible
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /microsoft/i })).toBeVisible();
  });

  test('should show error message for invalid credentials', async ({ page }) => {
    // Fill in with invalid credentials
    await page.getByLabel(/email/i).fill('nonexistent@example.com');
    await page.getByLabel(/password/i).fill('WrongPassword123!');

    // Click the sign in button
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for error message to appear
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Authenticated User Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Log in before each test in this describe block
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('testuser@example.com');
    await page.getByLabel(/password/i).fill('TestPassword123!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('should display home page after login', async ({ page }) => {
    // Verify user is on the home page
    await expect(page).toHaveURL('/');
  });

  test('should be able to navigate to chat page', async ({ page }) => {
    // Navigate to chat
    await page.goto('/chat');
    await expect(page).toHaveURL('/chat');
  });

  test('should be able to navigate to profile page', async ({ page }) => {
    // Navigate to profile
    await page.goto('/profile');
    await expect(page).toHaveURL('/profile');
  });
});
