/**
 * K6 API Scenarios Test for VoiceAssist
 *
 * Purpose: Test realistic user workflows and API scenarios
 * Virtual Users: 50 users
 * Duration: 10 minutes
 *
 * This test validates:
 * - Complete user journeys (registration → login → usage → logout)
 * - Admin workflows (CRUD operations)
 * - RAG query complexity variations
 * - Mixed read/write operations
 * - Session management
 * - Clinical context handling
 *
 * Scenarios:
 * 1. New User Journey
 * 2. Returning User Journey
 * 3. Power User with Clinical Context
 * 4. Admin Document Management
 * 5. Admin Monitoring Dashboard
 * 6. Emergency Query (rapid, high priority)
 *
 * Run with: k6 run 06-api-scenarios.js
 */

import { sleep, group } from 'k6';
import { CONFIG } from './config.js';
import {
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
  metrics
} from './utils.js';

// Test configuration
export const options = {
  scenarios: {
    new_user_journey: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 20 },
        { duration: '6m', target: 20 },
        { duration: '2m', target: 0 }
      ],
      exec: 'newUserJourney',
      gracefulRampDown: '30s'
    },
    returning_user_journey: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 15 },
        { duration: '6m', target: 15 },
        { duration: '2m', target: 0 }
      ],
      exec: 'returningUserJourney',
      gracefulRampDown: '30s'
    },
    power_user: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 10 },
        { duration: '6m', target: 10 },
        { duration: '2m', target: 0 }
      ],
      exec: 'powerUserScenario',
      gracefulRampDown: '30s'
    },
    admin_workflow: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 5 },
        { duration: '6m', target: 5 },
        { duration: '2m', target: 0 }
      ],
      exec: 'adminWorkflow',
      gracefulRampDown: '30s'
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.05'],
    'http_req_duration{scenario:new_user_journey}': ['p(95)<800'],
    'http_req_duration{scenario:power_user}': ['p(95)<1200'],
    'http_req_duration{scenario:admin_workflow}': ['p(95)<600'],
  },
  summaryTrendStats: CONFIG.OUTPUT.summaryTrendStats,
  summaryTimeUnit: CONFIG.OUTPUT.summaryTimeUnit
};

/**
 * Setup function - runs once before the test
 */
export function setup() {
  console.log('='.repeat(60));
  console.log('Starting API Scenarios Test');
  console.log('='.repeat(60));
  console.log(`Base URL: ${CONFIG.BASE_URL}`);
  console.log('Scenarios:');
  console.log('  - New User Journey (20 VUs)');
  console.log('  - Returning User Journey (15 VUs)');
  console.log('  - Power User (10 VUs)');
  console.log('  - Admin Workflow (5 VUs)');
  console.log(`Duration: 10 minutes`);
  console.log('='.repeat(60));

  // Verify the service is accessible
  const health = checkHealth();
  if (!health.success) {
    throw new Error('Service is not accessible. Test aborted.');
  }

  console.log('Pre-flight health check: PASSED');

  return {
    startTime: Date.now()
  };
}

/**
 * Scenario 1: New User Journey
 * Simulates a new user discovering and using the system
 */
export function newUserJourney(data) {
  group('New User Journey', function() {
    // 1. User discovers the app - checks if it's working
    group('1. Discovery', function() {
      const health = checkHealth();
      if (!health.success) {
        console.error('Health check failed for new user');
        return;
      }
      sleep(2);
    });

    // 2. User authentication (mock for now)
    group('2. Authentication', function() {
      const auth = authenticate(CONFIG.TEST_USERS.user.username,
                                CONFIG.TEST_USERS.user.password);
      if (!auth.success) {
        console.error('Authentication failed');
        return;
      }
      sleep(1);
    });

    // 3. First query - exploring the system
    group('3. First Query', function() {
      const query = 'What is hypertension?'; // Simple introductory query
      const result = sendChatMessage(query);

      if (result.success && result.data) {
        metrics.sessionsCreated.add(1);
        metrics.queriesPerSession.add(1);

        // User is impressed, asks a follow-up
        thinkTime(5, 10);

        const followUp = 'How is it treated?';
        sendChatMessage(followUp, result.data.session_id);
        metrics.queriesPerSession.add(1);
      }
    });

    // 4. User explores more
    group('4. Exploration', function() {
      thinkTime(10, 15);

      // New session with different query
      const query2 = randomQuery();
      const result2 = sendChatMessage(query2);

      if (result2.success && result2.data) {
        metrics.sessionsCreated.add(1);
        metrics.queriesPerSession.add(1);
      }
    });

    thinkTime(5, 10);
  });
}

/**
 * Scenario 2: Returning User Journey
 * Simulates a returning user with specific needs
 */
export function returningUserJourney(data) {
  group('Returning User Journey', function() {
    // 1. Quick auth check
    group('1. Quick Login', function() {
      authenticate(CONFIG.TEST_USERS.doctor.username,
                   CONFIG.TEST_USERS.doctor.password);
      sleep(1);
    });

    // 2. User has a specific clinical question
    group('2. Clinical Query', function() {
      const clinicalContext = randomClinicalContext();
      const query = randomQuery();

      const result = sendChatMessage(query, null, clinicalContext);

      if (result.success && result.data) {
        metrics.sessionsCreated.add(1);
        const sessionId = result.data.session_id;

        // Continue the clinical conversation
        thinkTime(3, 6);

        // Follow-up queries in same context
        for (let i = 0; i < 3; i++) {
          const followUp = randomQuery();
          sendChatMessage(followUp, sessionId, clinicalContext);
          metrics.queriesPerSession.add(1);
          thinkTime(4, 7);
        }
      }
    });

    thinkTime(3, 5);
  });
}

/**
 * Scenario 3: Power User with Complex Workflows
 * Simulates an advanced user with complex queries
 */
export function powerUserScenario(data) {
  group('Power User Scenario', function() {
    // 1. Authentication
    authenticate(CONFIG.TEST_USERS.doctor.username,
                 CONFIG.TEST_USERS.doctor.password);

    sleep(1);

    // 2. Complex multi-session workflow
    group('Multi-Session Workflow', function() {
      // Session 1: Patient Case A
      const context1 = 'Patient with acute chest pain and elevated troponin';
      const queries1 = [
        'What is the differential diagnosis for acute chest pain?',
        'What are the ECG findings in STEMI?',
        'What is the treatment protocol for STEMI?'
      ];

      let sessionId1 = null;
      queries1.forEach((query, index) => {
        const result = sendChatMessage(query, sessionId1, context1);
        if (result.success && result.data) {
          if (index === 0) {
            sessionId1 = result.data.session_id;
            metrics.sessionsCreated.add(1);
          }
          metrics.queriesPerSession.add(1);
        }
        thinkTime(3, 5);
      });

      // Brief break between cases
      thinkTime(5, 8);

      // Session 2: Patient Case B
      const context2 = 'Diabetic patient with uncontrolled blood sugar';
      const queries2 = [
        'What are the target HbA1c levels for diabetic patients?',
        'What medications are first-line for type 2 diabetes?',
        'What are the complications of uncontrolled diabetes?'
      ];

      let sessionId2 = null;
      queries2.forEach((query, index) => {
        const result = sendChatMessage(query, sessionId2, context2);
        if (result.success && result.data) {
          if (index === 0) {
            sessionId2 = result.data.session_id;
            metrics.sessionsCreated.add(1);
          }
          metrics.queriesPerSession.add(1);
        }
        thinkTime(3, 5);
      });
    });

    // 3. Power user checks admin docs (might have elevated permissions)
    group('Check Resources', function() {
      thinkTime(2, 4);
      getAdminDocuments();
    });

    thinkTime(2, 4);
  });
}

/**
 * Scenario 4: Admin Workflow
 * Simulates admin managing the system
 */
export function adminWorkflow(data) {
  group('Admin Workflow', function() {
    // 1. Admin authentication
    const auth = authenticate(CONFIG.TEST_USERS.admin.username,
                             CONFIG.TEST_USERS.admin.password);

    if (!auth.success) {
      console.error('Admin authentication failed');
      return;
    }

    const adminHeaders = getAuthHeaders(auth.token);

    sleep(1);

    // 2. Check system health
    group('System Health Check', function() {
      checkHealth();
      sleep(1);
      checkReady();
    });

    sleep(2);

    // 3. Review knowledge base documents
    group('Document Management', function() {
      const docs = getAdminDocuments(adminHeaders);

      if (docs.success) {
        console.log('Admin viewing documents');
      }

      thinkTime(3, 5);

      // Check again (simulating refresh)
      getAdminDocuments(adminHeaders);
    });

    sleep(2);

    // 4. Monitor indexing jobs
    group('Job Monitoring', function() {
      const jobs = getAdminJobs(adminHeaders);

      if (jobs.success) {
        console.log('Admin monitoring jobs');
      }

      thinkTime(3, 5);

      // Refresh jobs status
      getAdminJobs(adminHeaders);
    });

    sleep(2);

    // 5. Test query functionality (admins test features)
    group('Functional Testing', function() {
      const testQuery = 'What are the side effects of metformin?';
      const result = sendChatMessage(testQuery);

      if (result.success) {
        console.log('Admin functional test passed');
      } else {
        console.error('Admin functional test failed');
      }
    });

    thinkTime(3, 5);

    // 6. Final system check
    group('Final Check', function() {
      checkHealth();
      sleep(1);
      getAdminDocuments(adminHeaders);
    });

    thinkTime(2, 4);
  });
}

/**
 * Teardown function - runs once after the test
 */
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;

  console.log('='.repeat(60));
  console.log('API Scenarios Test Completed');
  console.log('='.repeat(60));
  console.log(`Total Duration: ${duration.toFixed(2)} seconds`);
  console.log('='.repeat(60));
}

/**
 * Export summary to JSON
 */
export function handleSummary(data) {
  console.log('Generating API scenarios test summary...');

  // Analyze scenario-specific metrics
  const scenarioMetrics = {};

  const scenarios = ['new_user_journey', 'returning_user_journey', 'power_user', 'admin_workflow'];

  scenarios.forEach(scenario => {
    const metricKey = `http_req_duration{scenario:${scenario}}`;
    if (data.metrics[metricKey]) {
      scenarioMetrics[scenario] = {
        avg: data.metrics[metricKey].values.avg,
        p95: data.metrics[metricKey].values['p(95)'],
        p99: data.metrics[metricKey].values['p(99)']
      };
    }
  });

  const summary = {
    test_type: 'api_scenarios',
    duration_seconds: data.state.testRunDurationMs / 1000,
    iterations: data.metrics.iterations ? data.metrics.iterations.values.count : 0,
    http_reqs: data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0,
    http_req_duration: data.metrics.http_req_duration ? {
      avg: data.metrics.http_req_duration.values.avg,
      p95: data.metrics.http_req_duration.values['p(95)'],
      p99: data.metrics.http_req_duration.values['p(99)']
    } : null,
    http_req_failed: data.metrics.http_req_failed ?
      data.metrics.http_req_failed.values.rate : null,
    scenario_breakdown: scenarioMetrics,
    custom_metrics: {
      sessions_created: data.metrics.sessions_created ?
        data.metrics.sessions_created.values.count : 0,
      messages_sent: data.metrics.messages_sent ?
        data.metrics.messages_sent.values.count : 0,
      queries_per_session: data.metrics.queries_per_session ?
        data.metrics.queries_per_session.values.count : 0,
      query_errors: data.metrics.query_errors ?
        data.metrics.query_errors.values.rate : 0
    },
    analysis: analyzeScenarios(scenarioMetrics),
    timestamp: new Date().toISOString()
  };

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    '../results/api-scenarios-summary.json': JSON.stringify(summary, null, 2),
    '../results/api-scenarios-full.json': JSON.stringify(data, null, 2)
  };
}

/**
 * Analyze scenario performance
 */
function analyzeScenarios(metrics) {
  const analysis = {
    insights: [],
    recommendations: []
  };

  // Analyze each scenario
  if (metrics.new_user_journey) {
    if (metrics.new_user_journey.p95 < 800) {
      analysis.insights.push('New user experience is excellent (P95 < 800ms)');
    } else {
      analysis.insights.push('New user experience could be improved');
      analysis.recommendations.push('Optimize onboarding flow and initial queries');
    }
  }

  if (metrics.power_user && metrics.new_user_journey) {
    const ratio = metrics.power_user.p95 / metrics.new_user_journey.p95;
    if (ratio > 1.5) {
      analysis.insights.push('Complex queries show expected performance impact');
      analysis.recommendations.push('Consider caching strategies for complex queries');
    }
  }

  if (metrics.admin_workflow) {
    if (metrics.admin_workflow.p95 < 600) {
      analysis.insights.push('Admin operations are highly performant');
    } else {
      analysis.recommendations.push('Review admin query optimization');
    }
  }

  return analysis;
}

// Import textSummary from k6
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';
