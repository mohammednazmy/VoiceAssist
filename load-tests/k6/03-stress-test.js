/**
 * K6 Stress Test for VoiceAssist
 *
 * Purpose: Test system limits and identify breaking points
 * Virtual Users: Ramp 0 → 500 over 15min → sustain 500 (5min) → ramp down (2min)
 * Duration: 22 minutes total
 *
 * This test validates:
 * - Maximum capacity of the system
 * - Breaking point identification
 * - Error handling under extreme load
 * - System recovery capabilities
 * - Resource exhaustion scenarios
 *
 * Run with: k6 run 03-stress-test.js
 * Monitor: Watch Grafana dashboards, system resources (CPU, memory, DB connections)
 */

import { sleep, group } from 'k6';
import { CONFIG, SCENARIOS } from './config.js';
import {
  checkHealth,
  sendChatMessage,
  getAdminDocuments,
  getAdminJobs,
  randomQuery,
  randomClinicalContext,
  generateSessionId,
  thinkTime,
  metrics
} from './utils.js';

// Test configuration
export const options = {
  scenarios: {
    stress: SCENARIOS.stress
  },
  thresholds: CONFIG.THRESHOLDS.stress,
  summaryTrendStats: CONFIG.OUTPUT.summaryTrendStats,
  summaryTimeUnit: CONFIG.OUTPUT.summaryTimeUnit,

  // Disable batch mode to ensure all requests are sent
  batch: 1,

  // Increase max connections
  hosts: {
    'voiceassist.local': '127.0.0.1'
  }
};

/**
 * Setup function - runs once before the test
 */
export function setup() {
  console.log('='.repeat(60));
  console.log('Starting Stress Test');
  console.log('='.repeat(60));
  console.log(`Base URL: ${CONFIG.BASE_URL}`);
  console.log(`Target: 500 concurrent users (EXTREME LOAD)`);
  console.log(`Duration: 22 minutes`);
  console.log(`WARNING: This will push the system to its limits!`);
  console.log('='.repeat(60));

  // Verify the service is accessible
  const health = checkHealth();
  if (!health.success) {
    throw new Error('Service is not accessible. Stress test aborted.');
  }

  console.log('Pre-flight health check: PASSED');
  console.log('Beginning stress test in 5 seconds...');
  sleep(5);

  return {
    startTime: Date.now(),
    errorLog: []
  };
}

/**
 * Main test function - runs for each virtual user
 */
export default function(data) {
  // Under stress, reduce think time to increase pressure
  const stressThinkTime = Math.random() < 0.7 ? 0.5 : 2; // Mostly short pauses

  // Simplified flows to maximize request rate
  const flowType = Math.random();

  if (flowType < 0.6) {
    // 60% - Rapid-fire queries (most stressful)
    rapidQueryFlow();
  } else if (flowType < 0.85) {
    // 25% - Session-based queries
    sessionQueryFlow();
  } else {
    // 15% - Mixed operations
    mixedOperationsFlow();
  }

  sleep(stressThinkTime);
}

/**
 * Rapid-fire query flow - maximum stress
 */
function rapidQueryFlow() {
  group('Rapid Query Flow', function() {
    // Send multiple queries quickly
    for (let i = 0; i < 3; i++) {
      const query = randomQuery();
      sendChatMessage(query);
      sleep(0.5); // Minimal delay
    }
  });
}

/**
 * Session-based query flow
 */
function sessionQueryFlow() {
  group('Session Query Flow', function() {
    let sessionId = null;

    // Initial query
    const query1 = randomQuery();
    const result1 = sendChatMessage(query1);

    if (result1.success && result1.data) {
      sessionId = result1.data.session_id;
      metrics.sessionsCreated.add(1);

      sleep(1);

      // Follow-up queries in same session
      for (let i = 0; i < 2; i++) {
        const query = randomQuery();
        sendChatMessage(query, sessionId);
        sleep(0.5);
      }
    }
  });
}

/**
 * Mixed operations flow
 */
function mixedOperationsFlow() {
  group('Mixed Operations Flow', function() {
    // Query
    sendChatMessage(randomQuery());

    sleep(0.5);

    // Admin check
    if (Math.random() < 0.5) {
      getAdminDocuments();
    } else {
      getAdminJobs();
    }

    sleep(0.5);

    // Another query
    sendChatMessage(randomQuery());
  });
}

/**
 * Teardown function - runs once after the test
 */
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;

  console.log('='.repeat(60));
  console.log('Stress Test Completed');
  console.log('='.repeat(60));
  console.log(`Total Duration: ${duration.toFixed(2)} seconds`);
  console.log('='.repeat(60));

  // Verify system is still responsive
  console.log('Verifying system recovery...');
  sleep(5);

  const recoveryHealth = checkHealth();
  if (recoveryHealth.success) {
    console.log('System recovery: HEALTHY');
  } else {
    console.error('System recovery: FAILED - manual intervention may be required');
  }
}

/**
 * Export summary to JSON
 */
export function handleSummary(data) {
  console.log('Generating stress test summary...');

  // Identify breaking point by analyzing error rates over time
  const errorRate = data.metrics.http_req_failed ?
    data.metrics.http_req_failed.values.rate : 0;

  const breakingPoint = errorRate > 0.1 ? 'REACHED' : 'NOT_REACHED';

  const summary = {
    test_type: 'stress',
    duration_seconds: data.state.testRunDurationMs / 1000,
    vus_max: data.metrics.vus_max ? data.metrics.vus_max.values.max : 0,
    iterations: data.metrics.iterations ? data.metrics.iterations.values.count : 0,
    http_reqs: data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0,
    requests_per_second: data.metrics.http_reqs ?
      data.metrics.http_reqs.values.rate : 0,
    http_req_duration: data.metrics.http_req_duration ? {
      avg: data.metrics.http_req_duration.values.avg,
      min: data.metrics.http_req_duration.values.min,
      max: data.metrics.http_req_duration.values.max,
      p95: data.metrics.http_req_duration.values['p(95)'],
      p99: data.metrics.http_req_duration.values['p(99)']
    } : null,
    http_req_failed: errorRate,
    breaking_point: breakingPoint,
    breaking_point_analysis: {
      error_rate: `${(errorRate * 100).toFixed(2)}%`,
      threshold: '10%',
      status: breakingPoint === 'REACHED' ?
        'System exceeded acceptable error rate' :
        'System handled stress within limits'
    },
    custom_metrics: {
      sessions_created: data.metrics.sessions_created ?
        data.metrics.sessions_created.values.count : 0,
      messages_sent: data.metrics.messages_sent ?
        data.metrics.messages_sent.values.count : 0,
      query_errors: data.metrics.query_errors ?
        data.metrics.query_errors.values.rate : 0
    },
    recommendations: generateRecommendations(data),
    timestamp: new Date().toISOString()
  };

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    '../results/stress-test-summary.json': JSON.stringify(summary, null, 2),
    '../results/stress-test-full.json': JSON.stringify(data, null, 2)
  };
}

/**
 * Generate recommendations based on test results
 */
function generateRecommendations(data) {
  const recommendations = [];
  const errorRate = data.metrics.http_req_failed ?
    data.metrics.http_req_failed.values.rate : 0;
  const p95Duration = data.metrics.http_req_duration ?
    data.metrics.http_req_duration.values['p(95)'] : 0;

  if (errorRate > 0.05) {
    recommendations.push('High error rate detected. Consider scaling up resources or optimizing bottlenecks.');
  }

  if (p95Duration > 2000) {
    recommendations.push('P95 response time exceeded 2 seconds. Investigate slow queries and database performance.');
  }

  if (errorRate < 0.01 && p95Duration < 1000) {
    recommendations.push('System performed well under stress. Current capacity is sufficient.');
  }

  recommendations.push('Review Grafana dashboards for resource utilization patterns.');
  recommendations.push('Check database connection pool saturation.');
  recommendations.push('Verify Redis cache hit rates.');

  return recommendations;
}

// Import textSummary from k6
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';
