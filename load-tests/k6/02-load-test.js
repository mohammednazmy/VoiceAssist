/**
 * K6 Load Test for VoiceAssist
 *
 * Purpose: Standard load test to evaluate system performance under normal conditions
 * Virtual Users: Ramp 0 → 100 (2min) → sustain 100 (5min) → ramp 100 → 0 (2min)
 * Duration: 9 minutes total
 *
 * This test validates:
 * - System performance under expected load
 * - Response times across all endpoints
 * - Error rates under normal conditions
 * - Resource utilization patterns
 *
 * Run with: k6 run 02-load-test.js
 * With custom URL: k6 run --env BASE_URL=http://your-server 02-load-test.js
 */

import { sleep, group } from 'k6';
import { CONFIG, SCENARIOS } from './config.js';
import {
  checkHealth,
  checkReady,
  sendChatMessage,
  getAdminDocuments,
  getAdminJobs,
  randomQuery,
  randomClinicalContext,
  userConversationScenario,
  adminWorkflowScenario,
  thinkTime,
  metrics
} from './utils.js';

// Test configuration
export const options = {
  scenarios: {
    load: SCENARIOS.load
  },
  thresholds: CONFIG.THRESHOLDS.load,
  summaryTrendStats: CONFIG.OUTPUT.summaryTrendStats,
  summaryTimeUnit: CONFIG.OUTPUT.summaryTimeUnit
};

/**
 * Setup function - runs once before the test
 */
export function setup() {
  console.log('='.repeat(60));
  console.log('Starting Load Test');
  console.log('='.repeat(60));
  console.log(`Base URL: ${CONFIG.BASE_URL}`);
  console.log(`Target: 100 concurrent users`);
  console.log(`Duration: 9 minutes (2m ramp-up, 5m sustain, 2m ramp-down)`);
  console.log('='.repeat(60));

  // Verify the service is accessible
  const health = checkHealth();
  if (!health.success) {
    throw new Error('Service is not accessible. Load test aborted.');
  }

  console.log('Pre-flight health check: PASSED');

  return {
    startTime: Date.now()
  };
}

/**
 * Main test function - runs for each virtual user
 */
export default function(data) {
  // Determine user behavior - simulate different user types
  const userType = Math.random();

  if (userType < 0.7) {
    // 70% - Regular users having conversations
    regularUserFlow();
  } else if (userType < 0.9) {
    // 20% - Power users with complex queries
    powerUserFlow();
  } else {
    // 10% - Admins managing the system
    adminUserFlow();
  }
}

/**
 * Regular user flow - simple queries and conversations
 */
function regularUserFlow() {
  group('Regular User Flow', function() {
    // Quick health check (simulating app startup)
    checkHealth();

    sleep(1);

    // User conversation with 2-4 queries
    const numQueries = Math.floor(Math.random() * 3) + 2; // 2-4 queries
    userConversationScenario(numQueries);
  });
}

/**
 * Power user flow - more complex queries with clinical context
 */
function powerUserFlow() {
  group('Power User Flow', function() {
    // Health check
    checkHealth();

    sleep(1);

    // Start a session with clinical context
    let sessionId = null;
    const query1 = randomQuery();
    const clinicalContext = randomClinicalContext();

    const result1 = sendChatMessage(query1, null, clinicalContext);

    if (result1.success && result1.data) {
      sessionId = result1.data.session_id;
      metrics.sessionsCreated.add(1);
      metrics.queriesPerSession.add(1);
    }

    thinkTime(3, 6);

    // Multiple follow-up queries with context
    for (let i = 0; i < 4; i++) {
      const query = randomQuery();
      const result = sendChatMessage(query, sessionId, clinicalContext);

      if (result.success) {
        metrics.queriesPerSession.add(1);
      }

      thinkTime(4, 8);
    }

    // Check admin docs (power users might have some admin access)
    if (Math.random() < 0.5) {
      getAdminDocuments();
    }
  });
}

/**
 * Admin user flow - managing system and documents
 */
function adminUserFlow() {
  group('Admin User Flow', function() {
    // Admin workflow
    adminWorkflowScenario();

    sleep(2);

    // Test a query as well (admins are also users)
    const query = randomQuery();
    sendChatMessage(query);

    thinkTime(3, 5);

    // Check jobs status
    getAdminJobs();
  });
}

/**
 * Teardown function - runs once after the test
 */
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;

  console.log('='.repeat(60));
  console.log('Load Test Completed');
  console.log('='.repeat(60));
  console.log(`Total Duration: ${duration.toFixed(2)} seconds`);
  console.log('='.repeat(60));
}

/**
 * Export summary to JSON
 */
export function handleSummary(data) {
  console.log('Generating test summary...');

  // Calculate custom statistics
  const summary = {
    test_type: 'load',
    duration_seconds: data.state.testRunDurationMs / 1000,
    vus_max: data.metrics.vus_max ? data.metrics.vus_max.values.max : 0,
    iterations: data.metrics.iterations ? data.metrics.iterations.values.count : 0,
    http_reqs: data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0,
    http_req_duration: data.metrics.http_req_duration ? {
      avg: data.metrics.http_req_duration.values.avg,
      p95: data.metrics.http_req_duration.values['p(95)'],
      p99: data.metrics.http_req_duration.values['p(99)']
    } : null,
    http_req_failed: data.metrics.http_req_failed ?
      data.metrics.http_req_failed.values.rate : null,
    custom_metrics: {
      sessions_created: data.metrics.sessions_created ?
        data.metrics.sessions_created.values.count : 0,
      messages_sent: data.metrics.messages_sent ?
        data.metrics.messages_sent.values.count : 0,
      query_errors: data.metrics.query_errors ?
        data.metrics.query_errors.values.rate : 0
    },
    timestamp: new Date().toISOString()
  };

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    '../results/load-test-summary.json': JSON.stringify(summary, null, 2),
    '../results/load-test-full.json': JSON.stringify(data, null, 2)
  };
}

// Import textSummary from k6
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';
