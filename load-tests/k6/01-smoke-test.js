/**
 * K6 Smoke Test for VoiceAssist
 *
 * Purpose: Basic smoke test to verify all endpoints are responding correctly
 * Virtual Users: 1-5
 * Duration: 1 minute
 *
 * This test validates:
 * - Health and readiness endpoints
 * - Basic authentication flow
 * - Simple chat queries
 * - Admin endpoints accessibility
 *
 * Run with: k6 run 01-smoke-test.js
 */

import { sleep } from 'k6';
import { CONFIG, SCENARIOS } from './config.js';
import {
  checkHealth,
  checkReady,
  sendChatMessage,
  getAdminDocuments,
  getAdminJobs,
  randomQuery,
  thinkTime,
  metrics
} from './utils.js';

// Test configuration
export const options = {
  scenarios: {
    smoke: SCENARIOS.smoke
  },
  thresholds: CONFIG.THRESHOLDS.smoke,
  summaryTrendStats: CONFIG.OUTPUT.summaryTrendStats,
  summaryTimeUnit: CONFIG.OUTPUT.summaryTimeUnit
};

/**
 * Setup function - runs once before the test
 */
export function setup() {
  console.log('Starting smoke test...');
  console.log(`Base URL: ${CONFIG.BASE_URL}`);

  // Verify the service is accessible
  const health = checkHealth();
  if (!health.success) {
    throw new Error('Service is not accessible. Smoke test aborted.');
  }

  return {
    startTime: Date.now()
  };
}

/**
 * Main test function - runs for each virtual user
 */
export default function(data) {
  // 1. Health check
  const healthResult = checkHealth();
  if (!healthResult.success) {
    console.error('Health check failed');
  }

  sleep(1);

  // 2. Readiness check
  const readyResult = checkReady();
  if (!readyResult.success) {
    console.error('Readiness check failed');
  }

  sleep(1);

  // 3. Send a simple chat query
  const query = randomQuery();
  const chatResult = sendChatMessage(query);

  if (!chatResult.success) {
    console.error('Chat query failed');
  } else {
    // 4. Send a follow-up query in the same session
    if (chatResult.data && chatResult.data.session_id) {
      sleep(2);
      const followUpQuery = randomQuery();
      sendChatMessage(followUpQuery, chatResult.data.session_id);
    }
  }

  sleep(2);

  // 5. Check admin endpoints
  const docsResult = getAdminDocuments();
  if (!docsResult.success) {
    console.error('Admin documents check failed');
  }

  sleep(1);

  const jobsResult = getAdminJobs();
  if (!jobsResult.success) {
    console.error('Admin jobs check failed');
  }

  // Think time before next iteration
  thinkTime(2, 5);
}

/**
 * Teardown function - runs once after the test
 */
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Smoke test completed in ${duration.toFixed(2)} seconds`);

  // Summary of custom metrics
  console.log('Custom Metrics Summary:');
  console.log(`- Total sessions created: ${metrics.sessionsCreated.name}`);
  console.log(`- Total messages sent: ${metrics.messagesSent.name}`);
}

/**
 * Export summary to JSON
 */
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    '../results/smoke-test-summary.json': JSON.stringify(data, null, 2)
  };
}

// Import textSummary from k6
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';
