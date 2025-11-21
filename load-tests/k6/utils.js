/**
 * Utility Functions for VoiceAssist K6 Load Tests
 *
 * This module provides helper functions for authentication, data generation,
 * custom metrics, and scenario building.
 */

import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import http from 'k6/http';
import { randomIntBetween, randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { CONFIG } from './config.js';

// ============================================================================
// Custom Metrics
// ============================================================================

export const metrics = {
  // Error tracking
  authErrors: new Rate('auth_errors'),
  queryErrors: new Rate('query_errors'),
  wsErrors: new Rate('ws_errors'),

  // Performance metrics
  queryDuration: new Trend('query_duration'),
  authDuration: new Trend('auth_duration'),
  healthCheckDuration: new Trend('health_check_duration'),

  // Business metrics
  queriesPerSession: new Counter('queries_per_session'),
  sessionsCreated: new Counter('sessions_created'),
  messagesSent: new Counter('messages_sent'),
  messagesReceived: new Counter('messages_received'),

  // WebSocket metrics
  wsConnectionTime: new Trend('ws_connection_time'),
  wsMessageLatency: new Trend('ws_message_latency')
};

// ============================================================================
// Authentication Helpers
// ============================================================================

/**
 * Mock authentication function
 * In a real scenario, this would call your auth endpoint and return a token
 */
export function authenticate(username, password) {
  const startTime = Date.now();

  // For now, VoiceAssist doesn't have auth implemented
  // This is a placeholder for when authentication is added in Phase 2

  // Simulate auth request delay
  sleep(0.1);

  const duration = Date.now() - startTime;
  metrics.authDuration.add(duration);

  // Return mock token
  return {
    success: true,
    token: `mock-jwt-token-${username}`,
    userId: `user-${randomIntBetween(1000, 9999)}`,
    role: getUserRole(username)
  };
}

/**
 * Get user role from username
 */
function getUserRole(username) {
  if (username.includes('admin')) return 'admin';
  if (username.includes('doctor')) return 'clinician';
  return 'user';
}

/**
 * Get authenticated headers
 */
export function getAuthHeaders(token) {
  return Object.assign({}, CONFIG.HEADERS, {
    'Authorization': `Bearer ${token}`
  });
}

// ============================================================================
// Request Helpers
// ============================================================================

/**
 * Make a health check request
 */
export function checkHealth(baseUrl = CONFIG.BASE_URL) {
  const startTime = Date.now();

  const response = http.get(`${baseUrl}${CONFIG.ENDPOINTS.health}`, {
    headers: CONFIG.HEADERS,
    tags: { endpoint: 'health', type: 'health_check' }
  });

  const duration = Date.now() - startTime;
  metrics.healthCheckDuration.add(duration);

  const success = check(response, {
    'health check status is 200': (r) => r.status === 200,
    'health check returns healthy': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data && body.data.status === 'healthy';
      } catch (e) {
        return false;
      }
    }
  });

  return { response, success };
}

/**
 * Make a readiness check request
 */
export function checkReady(baseUrl = CONFIG.BASE_URL) {
  const response = http.get(`${baseUrl}${CONFIG.ENDPOINTS.ready}`, {
    headers: CONFIG.HEADERS,
    tags: { endpoint: 'ready', type: 'health_check' }
  });

  const success = check(response, {
    'ready check status is 200': (r) => r.status === 200,
    'ready check returns ready': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data && body.data.status === 'ready';
      } catch (e) {
        return false;
      }
    }
  });

  return { response, success };
}

/**
 * Send a chat message
 */
export function sendChatMessage(content, sessionId = null, clinicalContextId = null, headers = CONFIG.HEADERS) {
  const startTime = Date.now();

  const payload = {
    content: content,
    session_id: sessionId,
    clinical_context_id: clinicalContextId
  };

  const response = http.post(
    `${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.chatMessage}`,
    JSON.stringify(payload),
    {
      headers: headers,
      tags: { endpoint: 'chat', type: 'query' },
      timeout: CONFIG.TIMEOUTS.http
    }
  );

  const duration = Date.now() - startTime;
  metrics.queryDuration.add(duration);
  metrics.messagesSent.add(1);

  const success = check(response, {
    'chat message status is 200': (r) => r.status === 200,
    'chat message has session_id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data && body.data.session_id;
      } catch (e) {
        return false;
      }
    },
    'chat message has content': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data && body.data.content;
      } catch (e) {
        return false;
      }
    }
  });

  if (!success) {
    metrics.queryErrors.add(1);
  }

  let responseData = null;
  try {
    const body = JSON.parse(response.body);
    responseData = body.data;
  } catch (e) {
    console.error('Failed to parse chat response:', e);
  }

  return { response, success, data: responseData };
}

/**
 * Get admin KB documents
 */
export function getAdminDocuments(headers = CONFIG.HEADERS) {
  const response = http.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.adminDocs}`, {
    headers: headers,
    tags: { endpoint: 'admin_docs', type: 'admin' }
  });

  const success = check(response, {
    'admin docs status is 200': (r) => r.status === 200,
    'admin docs returns array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.data);
      } catch (e) {
        return false;
      }
    }
  });

  return { response, success };
}

/**
 * Get admin indexing jobs
 */
export function getAdminJobs(headers = CONFIG.HEADERS) {
  const response = http.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.adminJobs}`, {
    headers: headers,
    tags: { endpoint: 'admin_jobs', type: 'admin' }
  });

  const success = check(response, {
    'admin jobs status is 200': (r) => r.status === 200,
    'admin jobs returns array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.data);
      } catch (e) {
        return false;
      }
    }
  });

  return { response, success };
}

// ============================================================================
// Data Generators
// ============================================================================

/**
 * Generate a random query from the test set
 */
export function randomQuery() {
  return randomItem(CONFIG.TEST_QUERIES);
}

/**
 * Generate a random clinical context
 */
export function randomClinicalContext() {
  return randomItem(CONFIG.TEST_CLINICAL_CONTEXTS);
}

/**
 * Generate a unique session ID
 */
export function generateSessionId() {
  const timestamp = Date.now();
  const random = randomIntBetween(1000, 9999);
  return `session-${timestamp}-${random}`;
}

/**
 * Generate realistic think time between requests
 */
export function thinkTime(min = CONFIG.RATE_LIMITS.thinkTime.min, max = CONFIG.RATE_LIMITS.thinkTime.max) {
  const duration = randomIntBetween(min, max);
  sleep(duration);
}

// ============================================================================
// Scenario Builders
// ============================================================================

/**
 * Execute a user conversation scenario
 * Simulates a realistic user session with multiple queries
 */
export function userConversationScenario(numQueries = 3) {
  let sessionId = null;

  group('User Conversation Session', function() {
    // First query - creates new session
    const query1 = randomQuery();
    const result1 = sendChatMessage(query1);

    if (result1.success && result1.data) {
      sessionId = result1.data.session_id;
      metrics.sessionsCreated.add(1);
      metrics.queriesPerSession.add(1);
    }

    thinkTime(2, 5);

    // Follow-up queries in same session
    for (let i = 1; i < numQueries; i++) {
      const query = randomQuery();
      const result = sendChatMessage(query, sessionId);

      if (result.success) {
        metrics.queriesPerSession.add(1);
      }

      thinkTime(3, 7);
    }
  });

  return sessionId;
}

/**
 * Execute an admin workflow scenario
 * Simulates admin checking documents and jobs
 */
export function adminWorkflowScenario(headers = CONFIG.HEADERS) {
  group('Admin Workflow', function() {
    // Check health
    checkHealth();
    sleep(1);

    // Get documents
    getAdminDocuments(headers);
    thinkTime(2, 4);

    // Get jobs
    getAdminJobs(headers);
    thinkTime(2, 4);

    // Get documents again (refresh)
    getAdminDocuments(headers);
  });
}

/**
 * Execute a mixed read/write scenario
 */
export function mixedOperationsScenario() {
  group('Mixed Operations', function() {
    // Health check
    checkHealth();

    // Query
    const query = randomQuery();
    const result = sendChatMessage(query);

    thinkTime(2, 4);

    // Admin operations (if user is admin)
    if (Math.random() < 0.3) { // 30% chance
      getAdminDocuments();
      sleep(1);
      getAdminJobs();
    }

    thinkTime(1, 3);

    // Another query in same session
    if (result.success && result.data) {
      sendChatMessage(randomQuery(), result.data.session_id);
    }
  });
}

// ============================================================================
// Result Handlers
// ============================================================================

/**
 * Log test summary statistics
 */
export function handleSummary(data) {
  const summary = {
    metrics: {},
    thresholds: {}
  };

  // Extract key metrics
  for (const [name, metric] of Object.entries(data.metrics)) {
    if (metric.type === 'trend') {
      summary.metrics[name] = {
        avg: metric.values.avg,
        min: metric.values.min,
        max: metric.values.max,
        p95: metric.values['p(95)'],
        p99: metric.values['p(99)']
      };
    } else if (metric.type === 'rate') {
      summary.metrics[name] = {
        rate: metric.values.rate,
        passes: metric.values.passes,
        fails: metric.values.fails
      };
    } else if (metric.type === 'counter') {
      summary.metrics[name] = {
        count: metric.values.count,
        rate: metric.values.rate
      };
    }
  }

  // Extract threshold results
  if (data.root_group && data.root_group.checks) {
    summary.thresholds = data.root_group.checks;
  }

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(summary, null, 2)
  };
}

/**
 * Create a text summary of results
 */
function textSummary(data, options = {}) {
  // This is a simplified version - k6 has a built-in textSummary we can use
  return JSON.stringify(data, null, 2);
}

export default {
  authenticate,
  getAuthHeaders,
  checkHealth,
  checkReady,
  sendChatMessage,
  getAdminDocuments,
  getAdminJobs,
  randomQuery,
  randomClinicalContext,
  generateSessionId,
  thinkTime,
  userConversationScenario,
  adminWorkflowScenario,
  mixedOperationsScenario,
  handleSummary,
  metrics
};
