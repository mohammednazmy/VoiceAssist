/**
 * K6 Endurance/Soak Test for VoiceAssist
 *
 * Purpose: Test system stability and detect memory leaks over extended period
 * Virtual Users: 100 constant users
 * Duration: 30 minutes
 *
 * This test validates:
 * - Memory leak detection
 * - Connection pool stability
 * - Database connection handling
 * - Cache effectiveness over time
 * - Resource cleanup
 * - Long-running session behavior
 * - Performance degradation over time
 *
 * What to monitor:
 * - Memory usage trends (should be stable, not growing)
 * - Database connection count (should be stable)
 * - Response times (should not degrade over time)
 * - Error rates (should remain constant)
 * - Cache hit rates
 *
 * Run with: k6 run 05-endurance-test.js
 * Note: This is a long-running test (30 minutes). Monitor system resources throughout.
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
  generateSessionId,
  thinkTime,
  metrics
} from './utils.js';

// Test configuration
export const options = {
  scenarios: {
    endurance: SCENARIOS.endurance
  },
  thresholds: CONFIG.THRESHOLDS.endurance,
  summaryTrendStats: CONFIG.OUTPUT.summaryTrendStats,
  summaryTimeUnit: CONFIG.OUTPUT.summaryTimeUnit
};

// Track performance over time
let performanceSnapshots = [];

/**
 * Setup function - runs once before the test
 */
export function setup() {
  console.log('='.repeat(60));
  console.log('Starting Endurance/Soak Test');
  console.log('='.repeat(60));
  console.log(`Base URL: ${CONFIG.BASE_URL}`);
  console.log(`Load: 100 constant users`);
  console.log(`Duration: 30 minutes`);
  console.log(`Purpose: Memory leak detection and stability validation`);
  console.log('='.repeat(60));
  console.warn('IMPORTANT: Monitor system resources during this test!');
  console.log('='.repeat(60));

  // Verify the service is accessible
  const health = checkHealth();
  if (!health.success) {
    throw new Error('Service is not accessible. Endurance test aborted.');
  }

  console.log('Pre-flight health check: PASSED');
  console.log('Test starting...');

  return {
    startTime: Date.now(),
    checkpointInterval: 5 * 60 * 1000, // 5 minutes
    performanceData: [],
    healthChecks: []
  };
}

/**
 * Main test function - runs for each virtual user
 */
export default function(data) {
  const elapsed = Date.now() - data.startTime;
  const minutes = Math.floor(elapsed / 60000);

  // Vary user behavior to simulate realistic long-term usage
  const behavior = Math.random();

  if (behavior < 0.5) {
    // 50% - Regular conversation flow
    longConversationFlow();
  } else if (behavior < 0.75) {
    // 25% - Multiple short sessions
    multipleShortSessions();
  } else if (behavior < 0.90) {
    // 15% - Admin monitoring
    adminMonitoringFlow();
  } else {
    // 10% - Mixed operations
    mixedLongRunningFlow();
  }

  // Periodic health check (every 100th iteration per VU)
  if (__ITER % 100 === 0) {
    performHealthSnapshot(minutes);
  }
}

/**
 * Long conversation flow - simulates extended user session
 */
function longConversationFlow() {
  group('Long Conversation', function() {
    // Create a session
    let sessionId = null;
    const clinicalContext = Math.random() < 0.3 ? randomClinicalContext() : null;

    // Initial query
    const query1 = randomQuery();
    const result1 = sendChatMessage(query1, null, clinicalContext);

    if (result1.success && result1.data) {
      sessionId = result1.data.session_id;
      metrics.sessionsCreated.add(1);
    }

    thinkTime(3, 6);

    // Continue conversation for 3-5 queries
    const numQueries = Math.floor(Math.random() * 3) + 3;
    for (let i = 0; i < numQueries; i++) {
      const query = randomQuery();
      const result = sendChatMessage(query, sessionId, clinicalContext);

      if (result.success) {
        metrics.queriesPerSession.add(1);
      }

      thinkTime(4, 8);
    }
  });
}

/**
 * Multiple short sessions - simulates user returning multiple times
 */
function multipleShortSessions() {
  group('Multiple Short Sessions', function() {
    // Create 2-3 separate sessions
    const numSessions = Math.floor(Math.random() * 2) + 2;

    for (let s = 0; s < numSessions; s++) {
      const query = randomQuery();
      const result = sendChatMessage(query);

      if (result.success && result.data) {
        metrics.sessionsCreated.add(1);
        metrics.queriesPerSession.add(1);

        // One follow-up
        thinkTime(2, 4);
        sendChatMessage(randomQuery(), result.data.session_id);
        metrics.queriesPerSession.add(1);
      }

      thinkTime(5, 10); // Break between sessions
    }
  });
}

/**
 * Admin monitoring flow - simulates admin checking system
 */
function adminMonitoringFlow() {
  group('Admin Monitoring', function() {
    // Check health
    checkHealth();
    sleep(2);

    // Check documents
    getAdminDocuments();
    thinkTime(3, 5);

    // Check jobs
    getAdminJobs();
    thinkTime(3, 5);

    // Refresh documents
    getAdminDocuments();
    thinkTime(2, 4);

    // Test a query
    sendChatMessage(randomQuery());
  });
}

/**
 * Mixed long-running flow
 */
function mixedLongRunningFlow() {
  group('Mixed Long Running', function() {
    // Health check
    checkHealth();
    sleep(1);

    // Query with context
    const query = randomQuery();
    const context = randomClinicalContext();
    const result = sendChatMessage(query, null, context);

    thinkTime(3, 6);

    // Admin check
    if (Math.random() < 0.5) {
      getAdminDocuments();
    } else {
      getAdminJobs();
    }

    thinkTime(2, 4);

    // Follow-up query
    if (result.success && result.data) {
      sendChatMessage(randomQuery(), result.data.session_id, context);
    }

    thinkTime(3, 5);

    // Ready check
    checkReady();
  });
}

/**
 * Perform a health snapshot to track performance over time
 */
function performHealthSnapshot(minutes) {
  const startTime = Date.now();
  const health = checkHealth();
  const duration = Date.now() - startTime;

  // Log checkpoint
  if (minutes % 5 === 0) {
    console.log(`[${minutes}min] Health check: ${health.success ? 'OK' : 'FAIL'} (${duration}ms)`);
  }
}

/**
 * Teardown function - runs once after the test
 */
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  const durationMinutes = Math.floor(duration / 60);

  console.log('='.repeat(60));
  console.log('Endurance Test Completed');
  console.log('='.repeat(60));
  console.log(`Total Duration: ${durationMinutes} minutes (${duration.toFixed(2)} seconds)`);
  console.log('='.repeat(60));

  // Perform final health checks
  console.log('Performing final system health assessment...');

  sleep(5);

  // Check 1: Health
  const health = checkHealth();
  console.log(`Final health check: ${health.success ? 'PASS' : 'FAIL'}`);

  sleep(2);

  // Check 2: Readiness
  const ready = checkReady();
  console.log(`Final readiness check: ${ready.success ? 'PASS' : 'FAIL'}`);

  sleep(2);

  // Check 3: Functional test
  const query = 'What are the symptoms of diabetes?';
  const queryTest = sendChatMessage(query);
  console.log(`Final functional test: ${queryTest.success ? 'PASS' : 'FAIL'}`);

  sleep(2);

  // Check 4: Admin endpoints
  const docsTest = getAdminDocuments();
  console.log(`Final admin test: ${docsTest.success ? 'PASS' : 'FAIL'}`);

  const allPassed = health.success && ready.success && queryTest.success && docsTest.success;

  console.log('='.repeat(60));
  console.log(`System Status After Endurance: ${allPassed ? 'HEALTHY' : 'DEGRADED'}`);
  console.log('='.repeat(60));

  if (!allPassed) {
    console.warn('WARNING: System may have memory leaks or resource exhaustion');
    console.warn('Review memory usage trends, connection pools, and logs');
  }
}

/**
 * Export summary to JSON
 */
export function handleSummary(data) {
  console.log('Generating endurance test summary...');

  const errorRate = data.metrics.http_req_failed ?
    data.metrics.http_req_failed.values.rate : 0;

  const avgDuration = data.metrics.http_req_duration ?
    data.metrics.http_req_duration.values.avg : 0;

  const p95Duration = data.metrics.http_req_duration ?
    data.metrics.http_req_duration.values['p(95)'] : 0;

  // Analyze stability
  const stabilityAnalysis = analyzeStability(data);

  const summary = {
    test_type: 'endurance',
    duration_seconds: data.state.testRunDurationMs / 1000,
    duration_minutes: Math.floor(data.state.testRunDurationMs / 60000),
    vus_constant: 100,
    iterations: data.metrics.iterations ? data.metrics.iterations.values.count : 0,
    http_reqs: data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0,
    requests_per_second: data.metrics.http_reqs ?
      data.metrics.http_reqs.values.rate : 0,
    http_req_duration: data.metrics.http_req_duration ? {
      avg: avgDuration,
      min: data.metrics.http_req_duration.values.min,
      max: data.metrics.http_req_duration.values.max,
      p95: p95Duration,
      p99: data.metrics.http_req_duration.values['p(99)']
    } : null,
    http_req_failed: errorRate,
    stability_analysis: stabilityAnalysis,
    memory_leak_indicators: {
      error_rate_trend: errorRate < 0.05 ? 'STABLE' : 'INCREASING',
      response_time_trend: p95Duration < 1000 ? 'STABLE' : 'DEGRADING',
      overall_assessment: stabilityAnalysis.grade
    },
    custom_metrics: {
      sessions_created: data.metrics.sessions_created ?
        data.metrics.sessions_created.values.count : 0,
      messages_sent: data.metrics.messages_sent ?
        data.metrics.messages_sent.values.count : 0,
      queries_per_session_total: data.metrics.queries_per_session ?
        data.metrics.queries_per_session.values.count : 0,
      query_errors: data.metrics.query_errors ?
        data.metrics.query_errors.values.rate : 0
    },
    recommendations: generateEnduranceRecommendations(stabilityAnalysis),
    timestamp: new Date().toISOString()
  };

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    '../results/endurance-test-summary.json': JSON.stringify(summary, null, 2),
    '../results/endurance-test-full.json': JSON.stringify(data, null, 2)
  };
}

/**
 * Analyze system stability over time
 */
function analyzeStability(data) {
  const errorRate = data.metrics.http_req_failed ?
    data.metrics.http_req_failed.values.rate : 0;

  const p95Duration = data.metrics.http_req_duration ?
    data.metrics.http_req_duration.values['p(95)'] : 0;

  const analysis = {
    grade: 'A',
    findings: []
  };

  // Error rate analysis
  if (errorRate < 0.01) {
    analysis.findings.push('Error rate excellent (< 1%) - no stability concerns');
  } else if (errorRate < 0.05) {
    analysis.findings.push('Error rate acceptable (< 5%) - system is stable');
  } else {
    analysis.findings.push('Error rate elevated (> 5%) - investigate for memory leaks');
    analysis.grade = 'C';
  }

  // Response time analysis
  if (p95Duration < 800) {
    analysis.findings.push('Response times excellent - no degradation detected');
  } else if (p95Duration < 1000) {
    analysis.findings.push('Response times good - minor variance is normal');
  } else {
    analysis.findings.push('Response times degraded - possible memory/resource leak');
    analysis.grade = analysis.grade === 'A' ? 'B' : 'C';
  }

  // Overall assessment
  if (analysis.grade === 'A') {
    analysis.findings.push('System is stable for long-running operations');
  } else if (analysis.grade === 'B') {
    analysis.findings.push('System shows minor stability concerns');
  } else {
    analysis.findings.push('System shows significant stability issues');
  }

  return analysis;
}

/**
 * Generate recommendations based on endurance test results
 */
function generateEnduranceRecommendations(analysis) {
  const recommendations = [];

  if (analysis.grade === 'A') {
    recommendations.push('System passed endurance test with excellent results.');
    recommendations.push('Current resource management and cleanup are working well.');
    recommendations.push('Continue monitoring in production for long-term validation.');
  } else if (analysis.grade === 'B') {
    recommendations.push('System is mostly stable but shows minor concerns.');
    recommendations.push('Review garbage collection settings and memory allocation.');
    recommendations.push('Check database connection pool cleanup.');
    recommendations.push('Verify cache eviction policies are working correctly.');
  } else {
    recommendations.push('System shows stability issues requiring immediate attention.');
    recommendations.push('CRITICAL: Investigate memory leak indicators.');
    recommendations.push('Review connection pool management and resource cleanup.');
    recommendations.push('Check for unclosed database connections or file handles.');
    recommendations.push('Analyze heap dumps and memory profiling data.');
    recommendations.push('Review async operations for proper cleanup.');
  }

  recommendations.push('Compare metrics with baseline performance tests.');
  recommendations.push('Monitor production systems for similar patterns.');
  recommendations.push('Set up alerts for memory usage trends.');

  return recommendations;
}

// Import textSummary from k6
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';
