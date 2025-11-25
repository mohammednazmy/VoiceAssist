#!/usr/bin/env node
/**
 * AI-Powered E2E Test Generator for VoiceAssist
 *
 * This script uses Auto Playwright to generate E2E tests from natural language descriptions.
 * It leverages OpenAI to interpret test scenarios and produce Playwright test code.
 *
 * Usage:
 *   node scripts/generate-e2e-tests.js
 *
 * Prerequisites:
 *   - OPENAI_API_KEY environment variable must be set
 *   - auto-playwright must be installed
 *
 * @see https://github.com/lucgagan/auto-playwright
 */

const fs = require('fs');
const path = require('path');

// Test credentials from environment or defaults
const TEST_EMAIL = process.env.E2E_EMAIL || 'test@example.com';
const TEST_PASSWORD = process.env.E2E_PASSWORD || 'TestPassword123!';

// Define test scenarios to generate
const testScenarios = [
  // === NEW SCENARIOS (requested) ===
  {
    name: 'User Registration Flow',
    filename: 'register-user.spec.ts',
    description: 'Register a new user and reach the dashboard',
    steps: [
      'Navigate to /register',
      'Verify the registration form is visible',
      'Fill in the name field with "Test User"',
      'Fill in the email field with a unique test email',
      'Fill in the password field with "TestPassword123!"',
      'Fill in the confirm password field with "TestPassword123!"',
      'Click the Sign up or Register button',
      'Wait for registration to complete',
      'Verify redirect to home/dashboard page',
      'Verify user is authenticated (no login prompt)',
    ],
  },
  {
    name: 'Quick Consult with Citations',
    filename: 'quick-consult.spec.ts',
    description: 'Ask a quick consult question and verify citations appear',
    steps: [
      'Navigate to the login page at /login',
      `Fill email input with "${TEST_EMAIL}"`,
      `Fill password input #password with "${TEST_PASSWORD}"`,
      'Click the Sign in button',
      'Wait for navigation to home page',
      'Navigate to /chat',
      'Type "What are the symptoms of Type 2 diabetes?" in the chat input',
      'Click send button or press Enter to submit',
      'Wait for AI response to appear (up to 30 seconds)',
      'Verify the response contains text about diabetes symptoms',
      'Look for citation markers or reference numbers in the response',
      'Verify at least one citation or source reference appears',
    ],
  },
  {
    name: 'PDF Upload to Knowledge Base',
    filename: 'pdf-upload.spec.ts',
    description: 'Upload a PDF and see it in the knowledge base',
    steps: [
      'Navigate to /login and authenticate',
      'Navigate to /documents or knowledge base page',
      'Click the Upload button or drag-and-drop area',
      'Select a PDF file for upload',
      'Verify upload progress indicator appears',
      'Wait for upload to complete',
      'Verify the uploaded document appears in the list',
      'Click on the uploaded document to view details',
      'Verify document metadata is displayed correctly',
    ],
  },
  // === EXISTING SCENARIOS (improved) ===
  {
    name: 'Voice Mode Session',
    filename: 'voice-mode.spec.ts',
    description: 'User starts a voice-enabled consultation session',
    steps: [
      'Navigate to /login and authenticate with test credentials',
      'Navigate to the chat page at /chat',
      'Look for voice input button (microphone icon)',
      'Click on the voice input button',
      'Verify the voice mode interface activates',
      'Check that the audio visualizer or recording indicator appears',
      'Wait 2 seconds for voice mode to initialize',
      'Click stop recording button',
      'Verify any transcribed text appears or voice mode deactivates',
    ],
  },
  {
    name: 'Conversation Management',
    filename: 'conversation-management.spec.ts',
    description: 'User manages conversations - create, rename, delete',
    steps: [
      'Navigate to /login and authenticate',
      'Navigate to /chat',
      'Look for conversation sidebar or list',
      'Type a test message "Hello, this is a test" and send',
      'Verify the conversation appears in the sidebar',
      'Click on conversation options menu (three dots)',
      'Select rename option',
      'Enter new name "Test Conversation"',
      'Confirm the rename',
      'Verify the new name appears in the sidebar',
    ],
  },
  {
    name: 'User Profile Settings',
    filename: 'profile-settings.spec.ts',
    description: 'User updates their profile settings',
    steps: [
      'Navigate to /login and authenticate',
      'Navigate to /profile page',
      'Verify the profile page loads with user email displayed',
      'Find the display name input field',
      'Clear existing name and enter "Updated Test User"',
      'Click the Save or Update button',
      'Verify a success message or toast appears',
      'Refresh the page',
      'Verify the updated name persists after refresh',
    ],
  },
  {
    name: 'Clinical Context Integration',
    filename: 'clinical-context.spec.ts',
    description: 'User sets up clinical context for personalized responses',
    steps: [
      'Navigate to /login and authenticate',
      'Navigate to /clinical-context page',
      'Verify clinical context form is visible',
      'Fill in patient age field with "45"',
      'Fill in relevant medical history',
      'Click Save clinical context button',
      'Verify save confirmation',
      'Navigate to /chat',
      'Ask a question about medication dosing',
      'Verify the response considers patient age context',
    ],
  },
  {
    name: 'Export Conversation',
    filename: 'export-conversation.spec.ts',
    description: 'User exports a conversation in various formats',
    steps: [
      'Log in with valid credentials',
      'Navigate to a chat with existing messages',
      'Click the export button or menu option',
      'Verify the export dialog opens',
      'Select PDF export format',
      'Initiate the export',
      'Verify the download starts or success message appears',
    ],
  },
  {
    name: 'Accessibility Navigation',
    filename: 'accessibility.spec.ts',
    description: 'User navigates the application using keyboard only',
    steps: [
      'Navigate to the login page',
      'Tab through all interactive elements',
      'Verify focus indicators are visible',
      'Use Enter key to submit the login form',
      'After login, use Tab to navigate the main interface',
      'Verify all main navigation items are keyboard accessible',
      'Test Escape key to close any open modals',
    ],
  },
];

/**
 * Generate test file content from a scenario
 */
function generateTestFileContent(scenario) {
  const stepsAsComments = scenario.steps
    .map((step, index) => `    // Step ${index + 1}: ${step}`)
    .join('\n');

  const autoSteps = scenario.steps
    .map((step) => `    await auto('${step.replace(/'/g, "\\'")}', { page, test });`)
    .join('\n\n');

  return `/**
 * ${scenario.name}
 *
 * AI-Generated E2E Test
 * Description: ${scenario.description}
 *
 * This test was generated using Auto Playwright and OpenAI.
 * Review and adjust selectors as necessary for your specific application.
 *
 * @generated
 */

import { test, expect } from '@playwright/test';
import { auto } from 'auto-playwright';

test.describe('${scenario.name}', () => {
  test('${scenario.description}', async ({ page }) => {
    // Test steps:
${stepsAsComments}

    // Execute AI-powered test steps
${autoSteps}
  });
});
`;
}

/**
 * Generate a manual test template (fallback when auto-playwright is not available)
 */
function generateManualTestTemplate(scenario) {
  const stepsAsCode = scenario.steps
    .map((step, index) => `    // TODO: Step ${index + 1}: ${step}\n    // await page...;`)
    .join('\n\n');

  return `/**
 * ${scenario.name}
 *
 * E2E Test Template
 * Description: ${scenario.description}
 *
 * This is a template for the test. Implement the TODO steps with actual Playwright code.
 */

import { test, expect } from '@playwright/test';

test.describe('${scenario.name}', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the starting page
    await page.goto('/');
  });

  test('${scenario.description}', async ({ page }) => {
${stepsAsCode}
  });
});
`;
}

/**
 * Main function to generate all test files
 */
async function main() {
  const outputDir = path.join(__dirname, '..', 'e2e', 'ai');

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Check if OPENAI_API_KEY is set
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;

  if (!hasOpenAIKey) {
    console.warn('\n[WARNING] OPENAI_API_KEY not set. Generating manual test templates instead.\n');
    console.warn('To use AI-powered generation, export your OpenAI API key:');
    console.warn('  export OPENAI_API_KEY="sk-..."\n');
  }

  console.log('Generating E2E test files...\n');

  // Check for --force flag to overwrite existing files
  const forceOverwrite = process.argv.includes('--force');

  for (const scenario of testScenarios) {
    const filePath = path.join(outputDir, scenario.filename);

    // Skip if file exists and not forcing overwrite (preserves committed manual templates)
    if (fs.existsSync(filePath) && !forceOverwrite) {
      console.log(`Skipping: ${scenario.filename} (already exists, use --force to overwrite)`);
      continue;
    }

    console.log(`Generating: ${scenario.filename}`);
    console.log(`  Description: ${scenario.description}`);
    console.log(`  Steps: ${scenario.steps.length}`);

    // Generate test content
    const content = hasOpenAIKey
      ? generateTestFileContent(scenario)
      : generateManualTestTemplate(scenario);

    // Write the file
    fs.writeFileSync(filePath, content, 'utf-8');

    console.log(`  -> Written to: ${filePath}\n`);
  }

  console.log('\nTest generation complete!');
  console.log(`Generated ${testScenarios.length} test files in: ${outputDir}`);

  console.log('\nUsage:');
  console.log('  node generate-e2e-tests.js          # Skip existing files');
  console.log('  node generate-e2e-tests.js --force  # Overwrite all files');

  if (hasOpenAIKey) {
    console.log('\nNext steps:');
    console.log('  1. Review generated tests and adjust selectors as needed');
    console.log('  2. Run tests: pnpm test:e2e');
  } else {
    console.log('\nNext steps:');
    console.log('  1. Set OPENAI_API_KEY to enable AI-powered generation');
    console.log('  2. Or implement the TODO steps manually in each test file');
    console.log('  3. Run tests: pnpm test:e2e');
  }
}

// Execute
main().catch((error) => {
  console.error('Error generating tests:', error);
  process.exit(1);
});
