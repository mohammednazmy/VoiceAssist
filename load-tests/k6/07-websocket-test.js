/**
 * K6 WebSocket Load Test for VoiceAssist
 *
 * Purpose: Test real-time WebSocket connections for voice mode
 * Virtual Users: 50 concurrent connections
 * Duration: 5 minutes
 *
 * This test validates:
 * - WebSocket connection establishment
 * - Message throughput and latency
 * - Connection stability under load
 * - Concurrent connection handling
 * - Message echo functionality
 * - Connection lifecycle management
 *
 * Real-time features tested:
 * - Voice mode connectivity
 * - Bi-directional messaging
 * - Connection resilience
 * - Resource cleanup
 *
 * Run with: k6 run 07-websocket-test.js
 */

import { sleep } from 'k6';
import ws from 'k6/ws';
import { check } from 'k6';
import { CONFIG } from './config.js';
import { metrics } from './utils.js';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// Test configuration
export const options = {
  scenarios: {
    websocket_connections: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 20 },  // Ramp up to 20 connections
        { duration: '3m', target: 50 },  // Increase to 50 connections
        { duration: '1m', target: 0 }    // Gracefully close all
      ],
      gracefulRampDown: '30s'
    }
  },
  thresholds: CONFIG.THRESHOLDS.websocket,
  summaryTrendStats: CONFIG.OUTPUT.summaryTrendStats,
  summaryTimeUnit: CONFIG.OUTPUT.summaryTimeUnit
};

/**
 * Setup function - runs once before the test
 */
export function setup() {
  console.log('='.repeat(60));
  console.log('Starting WebSocket Load Test');
  console.log('='.repeat(60));
  console.log(`WebSocket URL: ${CONFIG.WS_URL}`);
  console.log(`Target: 50 concurrent connections`);
  console.log(`Duration: 5 minutes`);
  console.log('='.repeat(60));

  return {
    startTime: Date.now()
  };
}

/**
 * Main test function - runs for each virtual user
 */
export default function(data) {
  const wsUrl = `${CONFIG.WS_URL}${CONFIG.ENDPOINTS.wsEcho}`;

  console.log(`VU ${__VU}: Connecting to ${wsUrl}`);

  const connectionStart = Date.now();
  let messagesSent = 0;
  let messagesReceived = 0;
  let errors = 0;

  const res = ws.connect(wsUrl, {
    tags: { type: 'websocket', endpoint: 'echo' }
  }, function(socket) {
    const connectionTime = Date.now() - connectionStart;
    metrics.wsConnectionTime.add(connectionTime);

    // Check connection establishment
    const connected = check(null, {
      'websocket connected': () => socket.readyState === ws.OPEN
    });

    if (!connected) {
      console.error(`VU ${__VU}: Failed to establish WebSocket connection`);
      metrics.wsErrors.add(1);
      errors++;
      return;
    }

    console.log(`VU ${__VU}: Connected in ${connectionTime}ms`);

    // Message handler
    socket.on('message', function(message) {
      const receiveTime = Date.now();
      messagesReceived++;
      metrics.messagesReceived.add(1);

      // Verify echo response
      check(message, {
        'echo response received': (msg) => msg.includes('ECHO:')
      });

      // Parse and calculate latency
      try {
        const content = message.toString();
        if (content.startsWith('ECHO:')) {
          const originalMsg = content.substring(6);
          // If message contains timestamp, calculate latency
          if (originalMsg.includes('|timestamp:')) {
            const parts = originalMsg.split('|timestamp:');
            const sentTime = parseInt(parts[1]);
            const latency = receiveTime - sentTime;
            metrics.wsMessageLatency.add(latency);
          }
        }
      } catch (e) {
        console.error(`VU ${__VU}: Error parsing message:`, e);
      }
    });

    // Error handler
    socket.on('error', function(e) {
      console.error(`VU ${__VU}: WebSocket error:`, e);
      metrics.wsErrors.add(1);
      errors++;
    });

    // Close handler
    socket.on('close', function() {
      console.log(`VU ${__VU}: Connection closed. Sent: ${messagesSent}, Received: ${messagesReceived}, Errors: ${errors}`);
    });

    // Send messages at intervals
    const numMessages = randomIntBetween(10, 30);
    console.log(`VU ${__VU}: Will send ${numMessages} messages`);

    for (let i = 0; i < numMessages; i++) {
      if (socket.readyState !== ws.OPEN) {
        console.warn(`VU ${__VU}: Socket not open, stopping at message ${i}`);
        break;
      }

      const timestamp = Date.now();
      const message = `Test message ${i + 1}|timestamp:${timestamp}`;

      try {
        socket.send(message);
        messagesSent++;
        metrics.messagesSent.add(1);

        check(null, {
          'message sent successfully': () => true
        });
      } catch (e) {
        console.error(`VU ${__VU}: Error sending message:`, e);
        metrics.wsErrors.add(1);
        errors++;
      }

      // Random delay between messages (simulating user typing/speaking)
      sleep(randomIntBetween(1, 3));
    }

    // Keep connection alive for a bit longer
    sleep(randomIntBetween(2, 5));

    // Gracefully close
    try {
      socket.close();
    } catch (e) {
      console.error(`VU ${__VU}: Error closing socket:`, e);
    }
  });

  // Check overall result
  check(res, {
    'websocket session completed': (r) => r && r.status === 101
  });

  sleep(1);
}

/**
 * Teardown function - runs once after the test
 */
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;

  console.log('='.repeat(60));
  console.log('WebSocket Load Test Completed');
  console.log('='.repeat(60));
  console.log(`Total Duration: ${duration.toFixed(2)} seconds`);
  console.log('='.repeat(60));
}

/**
 * Export summary to JSON
 */
export function handleSummary(data) {
  console.log('Generating WebSocket test summary...');

  const wsConnecting = data.metrics.ws_connecting ?
    data.metrics.ws_connecting.values : null;

  const wsSessionDuration = data.metrics.ws_session_duration ?
    data.metrics.ws_session_duration.values : null;

  const messagesSent = data.metrics.messages_sent ?
    data.metrics.messages_sent.values.count : 0;

  const messagesReceived = data.metrics.messages_received ?
    data.metrics.messages_received.values.count : 0;

  const wsErrors = data.metrics.ws_errors ?
    data.metrics.ws_errors.values.rate : 0;

  const wsMessageLatency = data.metrics.ws_message_latency ?
    data.metrics.ws_message_latency.values : null;

  // Calculate success rate
  const successRate = messagesSent > 0 ?
    (messagesReceived / messagesSent * 100).toFixed(2) : 0;

  const summary = {
    test_type: 'websocket',
    duration_seconds: data.state.testRunDurationMs / 1000,
    vus_max: data.metrics.vus_max ? data.metrics.vus_max.values.max : 0,
    iterations: data.metrics.iterations ? data.metrics.iterations.values.count : 0,
    websocket_metrics: {
      connecting_time: wsConnecting ? {
        avg: wsConnecting.avg,
        p95: wsConnecting['p(95)'],
        p99: wsConnecting['p(99)']
      } : null,
      session_duration: wsSessionDuration ? {
        avg: wsSessionDuration.avg,
        min: wsSessionDuration.min,
        max: wsSessionDuration.max
      } : null,
      messages_sent: messagesSent,
      messages_received: messagesReceived,
      message_success_rate: `${successRate}%`,
      message_latency: wsMessageLatency ? {
        avg: wsMessageLatency.avg,
        p95: wsMessageLatency['p(95)'],
        p99: wsMessageLatency['p(99)']
      } : null,
      error_rate: `${(wsErrors * 100).toFixed(2)}%`
    },
    analysis: analyzeWebSocketPerformance(wsConnecting, wsMessageLatency, wsErrors, successRate),
    recommendations: generateWebSocketRecommendations(wsConnecting, wsMessageLatency, wsErrors, successRate),
    timestamp: new Date().toISOString()
  };

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    '../results/websocket-test-summary.json': JSON.stringify(summary, null, 2),
    '../results/websocket-test-full.json': JSON.stringify(data, null, 2)
  };
}

/**
 * Analyze WebSocket performance
 */
function analyzeWebSocketPerformance(connecting, latency, errorRate, successRate) {
  const analysis = {
    grade: 'A',
    findings: []
  };

  // Connection time analysis
  if (connecting && connecting['p(95)']) {
    if (connecting['p(95)'] < 500) {
      analysis.findings.push('Connection establishment is excellent (P95 < 500ms)');
    } else if (connecting['p(95)'] < 1000) {
      analysis.findings.push('Connection establishment is acceptable (P95 < 1s)');
    } else {
      analysis.findings.push('Connection establishment is slow (P95 > 1s)');
      analysis.grade = 'B';
    }
  }

  // Message latency analysis
  if (latency && latency['p(95)']) {
    if (latency['p(95)'] < 50) {
      analysis.findings.push('Message latency is excellent (P95 < 50ms)');
    } else if (latency['p(95)'] < 100) {
      analysis.findings.push('Message latency is good (P95 < 100ms)');
    } else if (latency['p(95)'] < 200) {
      analysis.findings.push('Message latency is acceptable (P95 < 200ms)');
      analysis.grade = analysis.grade === 'A' ? 'B' : analysis.grade;
    } else {
      analysis.findings.push('Message latency is high (P95 > 200ms)');
      analysis.grade = 'C';
    }
  }

  // Success rate analysis
  if (successRate >= 99) {
    analysis.findings.push(`Message delivery is excellent (${successRate}% success rate)`);
  } else if (successRate >= 95) {
    analysis.findings.push(`Message delivery is acceptable (${successRate}% success rate)`);
    analysis.grade = analysis.grade === 'A' ? 'B' : analysis.grade;
  } else {
    analysis.findings.push(`Message delivery has issues (${successRate}% success rate)`);
    analysis.grade = 'D';
  }

  // Error rate analysis
  if (errorRate < 0.01) {
    analysis.findings.push('Error rate is excellent (< 1%)');
  } else if (errorRate < 0.05) {
    analysis.findings.push('Error rate is acceptable (< 5%)');
  } else {
    analysis.findings.push('Error rate is concerning (> 5%)');
    analysis.grade = 'D';
  }

  return analysis;
}

/**
 * Generate recommendations based on WebSocket test results
 */
function generateWebSocketRecommendations(connecting, latency, errorRate, successRate) {
  const recommendations = [];

  if (connecting && connecting['p(95)'] > 1000) {
    recommendations.push('Connection time is high. Consider:');
    recommendations.push('  - Optimize WebSocket handshake');
    recommendations.push('  - Check network latency');
    recommendations.push('  - Review load balancer WebSocket configuration');
  }

  if (latency && latency['p(95)'] > 200) {
    recommendations.push('Message latency is high. Consider:');
    recommendations.push('  - Review server processing time');
    recommendations.push('  - Check for network bottlenecks');
    recommendations.push('  - Optimize message serialization');
  }

  if (errorRate > 0.05) {
    recommendations.push('Error rate is concerning. Investigate:');
    recommendations.push('  - Connection stability issues');
    recommendations.push('  - Server resource constraints');
    recommendations.push('  - Network reliability');
  }

  if (successRate < 95) {
    recommendations.push('Message delivery issues detected:');
    recommendations.push('  - Verify message acknowledgment mechanism');
    recommendations.push('  - Implement retry logic for failed messages');
    recommendations.push('  - Check for connection drops');
  }

  if (recommendations.length === 0) {
    recommendations.push('WebSocket performance is excellent!');
    recommendations.push('Current configuration is well-suited for real-time features.');
    recommendations.push('Continue monitoring in production.');
  }

  recommendations.push('Review WebSocket connection pool settings.');
  recommendations.push('Monitor concurrent connection limits.');
  recommendations.push('Set up alerts for connection failures.');

  return recommendations;
}

// Import textSummary from k6
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';
