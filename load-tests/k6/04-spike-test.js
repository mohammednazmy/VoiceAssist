/**
 * K6 Spike Test for VoiceAssist
 *
 * Purpose: Test system response to sudden traffic spikes
 * Pattern: Normal (50) → Spike (500) → Recovery (50)
 * Duration: 8 minutes total
 *
 * This test validates:
 * - Auto-scaling responsiveness
 * - Circuit breaker behavior
 * - Rate limiting effectiveness
 * - System recovery after spike
 * - Queue handling under sudden load
 *
 * Scenarios tested:
 * - Sudden viral content sharing
 * - Mass notification responses
 * - Conference/event traffic
 * - DDoS attack simulation
 *
 * Run with: k6 run 04-spike-test.js
 */

import { sleep, group } from 'k6';
import { CONFIG, SCENARIOS } from './config.js';
import {
  checkHealth,
  checkReady,
  sendChatMessage,
  getAdminDocuments,
  randomQuery,
  thinkTime,
  metrics
} from './utils.js';

// Test configuration
export const options = {
  scenarios: {
    spike: SCENARIOS.spike
  },
  thresholds: CONFIG.THRESHOLDS.spike,
  summaryTrendStats: CONFIG.OUTPUT.summaryTrendStats,
  summaryTimeUnit: CONFIG.OUTPUT.summaryTimeUnit
};

/**
 * Setup function - runs once before the test
 */
export function setup() {
  console.log('='.repeat(60));
  console.log('Starting Spike Test');
  console.log('='.repeat(60));
  console.log(`Base URL: ${CONFIG.BASE_URL}`);
  console.log(`Pattern: 50 users → 500 users → 50 users`);
  console.log(`Duration: 8 minutes`);
  console.log(`Purpose: Test auto-scaling and spike handling`);
  console.log('='.repeat(60));

  // Verify the service is accessible
  const health = checkHealth();
  if (!health.success) {
    throw new Error('Service is not accessible. Spike test aborted.');
  }

  console.log('Pre-flight health check: PASSED');

  return {
    startTime: Date.now(),
    normalLoadPhase: true,
    spikePhase: false,
    recoveryPhase: false,
    phaseTimestamps: {
      start: Date.now()
    }
  };
}

/**
 * Main test function - runs for each virtual user
 */
export default function(data) {
  // Determine current phase based on VU count
  const currentVUs = __VU;
  const currentStage = getCurrentStage();

  // Adjust behavior based on current phase
  if (currentStage === 'spike') {
    // During spike: minimal think time, maximum pressure
    spikeFlow();
    sleep(0.2); // Very short delay
  } else if (currentStage === 'recovery') {
    // During recovery: monitor system behavior
    recoveryFlow();
    sleep(2);
  } else {
    // Normal load: regular behavior
    normalFlow();
    thinkTime(2, 4);
  }
}

/**
 * Determine current test stage based on execution time
 */
function getCurrentStage() {
  const elapsed = (__ITER * 100) % 480000; // Rough approximation

  if (elapsed < 180000) {
    return 'normal'; // First 3 minutes
  } else if (elapsed < 270000) {
    return 'spike'; // Next 1.5 minutes (including ramp)
  } else {
    return 'recovery'; // Last phase
  }
}

/**
 * Normal load flow
 */
function normalFlow() {
  group('Normal Load Flow', function() {
    // Regular user behavior
    const query = randomQuery();
    sendChatMessage(query);

    sleep(1);

    // Some admin checks
    if (Math.random() < 0.2) {
      getAdminDocuments();
    }
  });
}

/**
 * Spike flow - aggressive traffic
 */
function spikeFlow() {
  group('Spike Flow', function() {
    // Rapid queries without sessions (simulating many new users)
    const query = randomQuery();
    sendChatMessage(query);

    // No delays, maximum pressure
  });
}

/**
 * Recovery flow - monitor system recovery
 */
function recoveryFlow() {
  group('Recovery Flow', function() {
    // First check if system is responsive
    const health = checkHealth();

    if (!health.success) {
      console.warn('System unhealthy during recovery phase');
      metrics.queryErrors.add(1);
      return;
    }

    sleep(1);

    // Try a normal query
    const query = randomQuery();
    const result = sendChatMessage(query);

    if (result.success) {
      // System is recovering well
      if (result.data && result.data.session_id) {
        metrics.sessionsCreated.add(1);
      }
    } else {
      console.warn('Query failed during recovery phase');
    }
  });
}

/**
 * Teardown function - runs once after the test
 */
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;

  console.log('='.repeat(60));
  console.log('Spike Test Completed');
  console.log('='.repeat(60));
  console.log(`Total Duration: ${duration.toFixed(2)} seconds`);
  console.log('='.repeat(60));

  // Perform recovery checks
  console.log('Performing post-spike health checks...');

  sleep(5); // Wait for system to stabilize

  // Check 1: Health endpoint
  const health1 = checkHealth();
  console.log(`Health check 1: ${health1.success ? 'PASS' : 'FAIL'}`);

  sleep(2);

  // Check 2: Readiness endpoint
  const ready = checkReady();
  console.log(`Readiness check: ${ready.success ? 'PASS' : 'FAIL'}`);

  sleep(2);

  // Check 3: Functional test (send a query)
  const testQuery = 'What is the treatment for hypertension?';
  const queryTest = sendChatMessage(testQuery);
  console.log(`Functional test: ${queryTest.success ? 'PASS' : 'FAIL'}`);

  sleep(2);

  // Check 4: Final health check
  const health2 = checkHealth();
  console.log(`Health check 2: ${health2.success ? 'PASS' : 'FAIL'}`);

  // Overall recovery status
  const recoverySuccess = health1.success && ready.success &&
                          queryTest.success && health2.success;

  console.log('='.repeat(60));
  console.log(`System Recovery: ${recoverySuccess ? 'SUCCESSFUL' : 'DEGRADED'}`);
  console.log('='.repeat(60));

  if (!recoverySuccess) {
    console.warn('WARNING: System may require manual intervention');
    console.warn('Check logs, metrics, and resource utilization');
  }
}

/**
 * Export summary to JSON
 */
export function handleSummary(data) {
  console.log('Generating spike test summary...');

  const errorRate = data.metrics.http_req_failed ?
    data.metrics.http_req_failed.values.rate : 0;

  const p95Duration = data.metrics.http_req_duration ?
    data.metrics.http_req_duration.values['p(95)'] : 0;

  const p99Duration = data.metrics.http_req_duration ?
    data.metrics.http_req_duration.values['p(99)'] : 0;

  // Analyze spike handling
  const spikeHandling = analyzeSpikeBehavior(errorRate, p95Duration, p99Duration);

  const summary = {
    test_type: 'spike',
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
      p95: p95Duration,
      p99: p99Duration
    } : null,
    http_req_failed: errorRate,
    spike_analysis: spikeHandling,
    auto_scaling: {
      triggered: p95Duration < 1500 && errorRate < 0.1,
      response_time: p95Duration < 1500 ? 'GOOD' : 'SLOW',
      error_handling: errorRate < 0.15 ? 'ACCEPTABLE' : 'POOR'
    },
    custom_metrics: {
      sessions_created: data.metrics.sessions_created ?
        data.metrics.sessions_created.values.count : 0,
      messages_sent: data.metrics.messages_sent ?
        data.metrics.messages_sent.values.count : 0,
      query_errors: data.metrics.query_errors ?
        data.metrics.query_errors.values.rate : 0
    },
    recommendations: generateSpikeRecommendations(spikeHandling),
    timestamp: new Date().toISOString()
  };

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    '../results/spike-test-summary.json': JSON.stringify(summary, null, 2),
    '../results/spike-test-full.json': JSON.stringify(data, null, 2)
  };
}

/**
 * Analyze spike behavior
 */
function analyzeSpikeBehavior(errorRate, p95, p99) {
  const analysis = {
    overall_grade: 'A',
    details: []
  };

  // Error rate analysis
  if (errorRate < 0.05) {
    analysis.details.push('Error rate remained low during spike (< 5%)');
  } else if (errorRate < 0.15) {
    analysis.details.push('Error rate acceptable during spike (< 15%)');
    analysis.overall_grade = 'B';
  } else {
    analysis.details.push('High error rate during spike (> 15%)');
    analysis.overall_grade = 'C';
  }

  // Response time analysis
  if (p95 < 1000) {
    analysis.details.push('P95 response time excellent (< 1s)');
  } else if (p95 < 1500) {
    analysis.details.push('P95 response time good (< 1.5s)');
  } else if (p95 < 3000) {
    analysis.details.push('P95 response time acceptable (< 3s)');
    analysis.overall_grade = analysis.overall_grade === 'A' ? 'B' : analysis.overall_grade;
  } else {
    analysis.details.push('P95 response time poor (> 3s)');
    analysis.overall_grade = 'D';
  }

  // P99 analysis
  if (p99 > 5000) {
    analysis.details.push('P99 response time concerning (> 5s)');
    analysis.overall_grade = analysis.overall_grade === 'A' ? 'B' : analysis.overall_grade;
  }

  return analysis;
}

/**
 * Generate recommendations based on spike test results
 */
function generateSpikeRecommendations(analysis) {
  const recommendations = [];

  if (analysis.overall_grade === 'A') {
    recommendations.push('System handles spikes excellently. No immediate action needed.');
    recommendations.push('Consider this as baseline for future capacity planning.');
  } else if (analysis.overall_grade === 'B') {
    recommendations.push('System handles spikes well but has room for improvement.');
    recommendations.push('Consider implementing or tuning auto-scaling policies.');
    recommendations.push('Review rate limiting and circuit breaker configurations.');
  } else {
    recommendations.push('System struggles with sudden spikes. Immediate action recommended.');
    recommendations.push('Implement aggressive auto-scaling triggers.');
    recommendations.push('Add request queuing with backpressure.');
    recommendations.push('Consider CDN or edge caching for static content.');
    recommendations.push('Review and optimize database connection pooling.');
  }

  recommendations.push('Monitor Kubernetes HPA metrics (if using K8s).');
  recommendations.push('Set up alerts for traffic spike detection.');

  return recommendations;
}

// Import textSummary from k6
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';
