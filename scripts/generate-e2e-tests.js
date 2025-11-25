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

// Define test scenarios to generate
const testScenarios = [
  {
    name: 'Quick Consult with Citations',
    filename: 'quick-consult.spec.ts',
    description: 'User logs in and starts a quick medical consultation',
    steps: [
      'Navigate to the login page',
      'Enter valid credentials (testuser@example.com / TestPassword123!)',
      'Click the sign in button',
      'Verify the dashboard loads successfully',
      'Navigate to the chat page',
      'Type a medical question about diabetes symptoms',
      'Submit the question',
      'Wait for the AI response with citations',
      'Verify that at least one citation appears in the response',
      'Click on a citation to view the source',
      'Verify the citation sidebar or modal opens with source details',
    ],
  },
  {
    name: 'Voice Mode Session',
    filename: 'voice-mode.spec.ts',
    description: 'User starts a voice-enabled consultation session',
    steps: [
      'Log in with valid credentials',
      'Navigate to the chat page',
      'Click on the voice input button/microphone icon',
      'Verify the voice mode interface activates',
      'Check that the audio visualizer or recording indicator appears',
      'Stop the recording',
      'Verify the transcribed text appears in the input field or chat',
    ],
  },
  {
    name: 'Conversation Management',
    filename: 'conversation-management.spec.ts',
    description: 'User manages conversations - create, rename, delete',
    steps: [
      'Log in with valid credentials',
      'Navigate to the chat page',
      'Start a new conversation by typing a message',
      'Verify the conversation appears in the sidebar',
      'Open the conversation options menu',
      'Rename the conversation to "Test Conversation"',
      'Verify the new name appears in the sidebar',
      'Create another conversation',
      'Delete the first conversation',
      'Verify the conversation is removed from the list',
    ],
  },
  {
    name: 'User Profile Settings',
    filename: 'profile-settings.spec.ts',
    description: 'User updates their profile settings',
    steps: [
      'Log in with valid credentials',
      'Navigate to the profile page',
      'Verify the profile page loads with user information',
      'Update the display name field',
      'Save the changes',
      'Verify a success message appears',
      'Refresh the page',
      'Verify the updated name persists',
    ],
  },
  {
    name: 'Clinical Context Integration',
    filename: 'clinical-context.spec.ts',
    description: 'User sets up clinical context for personalized responses',
    steps: [
      'Log in with valid credentials',
      'Navigate to the clinical context page',
      'Fill in patient context information',
      'Save the clinical context',
      'Navigate to the chat page',
      'Ask a question related to the clinical context',
      'Verify the AI response considers the clinical context',
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

  for (const scenario of testScenarios) {
    const filePath = path.join(outputDir, scenario.filename);

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
