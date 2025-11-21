/**
 * Shared Configuration for VoiceAssist K6 Load Tests
 *
 * This file contains common configuration used across all load test scenarios.
 * Update the BASE_URL to match your deployment environment.
 */

// Environment configuration
export const CONFIG = {
  // Base URLs - update these based on your environment
  BASE_URL: __ENV.BASE_URL || 'http://localhost:8000',
  WS_URL: __ENV.WS_URL || 'ws://localhost:8000',

  // Test user credentials
  TEST_USERS: {
    admin: {
      username: 'admin@voiceassist.local',
      password: 'Test123!@#',
      role: 'admin'
    },
    doctor: {
      username: 'doctor@voiceassist.local',
      password: 'Test123!@#',
      role: 'clinician'
    },
    user: {
      username: 'user@voiceassist.local',
      password: 'Test123!@#',
      role: 'user'
    }
  },

  // API endpoints
  ENDPOINTS: {
    health: '/health',
    ready: '/ready',
    chatMessage: '/api/chat/message',
    adminDocs: '/api/admin/kb/documents',
    adminJobs: '/api/admin/kb/indexing-jobs',
    wsEcho: '/api/realtime/ws/echo'
  },

  // Common headers
  HEADERS: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'k6-load-test'
  },

  // Performance thresholds
  THRESHOLDS: {
    // Smoke test thresholds (strict)
    smoke: {
      http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% < 500ms, 99% < 1s
      http_req_failed: ['rate<0.01'],                  // Error rate < 1%
      http_reqs: ['rate>1'],                           // At least 1 req/s
    },

    // Load test thresholds (balanced)
    load: {
      http_req_duration: ['p(95)<800', 'p(99)<1500'],  // 95% < 800ms, 99% < 1.5s
      http_req_failed: ['rate<0.05'],                   // Error rate < 5%
      http_reqs: ['rate>10'],                           // At least 10 req/s
    },

    // Stress test thresholds (relaxed)
    stress: {
      http_req_duration: ['p(95)<2000', 'p(99)<5000'], // 95% < 2s, 99% < 5s
      http_req_failed: ['rate<0.10'],                   // Error rate < 10%
      http_reqs: ['rate>50'],                           // At least 50 req/s
    },

    // Spike test thresholds
    spike: {
      http_req_duration: ['p(95)<1500', 'p(99)<3000'], // 95% < 1.5s, 99% < 3s
      http_req_failed: ['rate<0.15'],                   // Error rate < 15%
      http_reqs: ['rate>5'],                            // At least 5 req/s
    },

    // Endurance test thresholds (focus on stability)
    endurance: {
      http_req_duration: ['p(95)<1000', 'p(99)<2000'], // 95% < 1s, 99% < 2s
      http_req_failed: ['rate<0.05'],                   // Error rate < 5%
      http_reqs: ['rate>5'],                            // At least 5 req/s
      // Check for memory leaks by ensuring consistent performance
      'http_req_duration{scenario:endurance}': ['p(95)<1000'],
    },

    // WebSocket thresholds
    websocket: {
      ws_connecting: ['p(95)<1000'],                    // Connection time < 1s
      ws_session_duration: ['p(95)<60000'],             // Session duration
      ws_msgs_sent: ['count>100'],                      // Minimum messages sent
      ws_msgs_received: ['count>100'],                  // Minimum messages received
    }
  },

  // Test data sets
  TEST_QUERIES: [
    'What are the symptoms of heart failure?',
    'How do you treat acute myocardial infarction?',
    'What is the dosage for aspirin in cardiac patients?',
    'Explain the pathophysiology of diabetes mellitus',
    'What are the guidelines for hypertension management?',
    'How to diagnose pulmonary embolism?',
    'What are the side effects of statins?',
    'Explain the treatment protocol for sepsis',
    'What are the contraindications for beta blockers?',
    'How to manage chronic kidney disease?'
  ],

  TEST_CLINICAL_CONTEXTS: [
    'Patient with chest pain and elevated troponin',
    'Diabetic patient with uncontrolled glucose',
    'Elderly patient with suspected pneumonia',
    'Young patient with first-time seizure',
    'Post-operative infection monitoring'
  ],

  // Rate limiting and pacing
  RATE_LIMITS: {
    requestsPerSecond: 100,
    thinkTime: {
      min: 1,  // seconds
      max: 5   // seconds
    }
  },

  // Timeouts
  TIMEOUTS: {
    http: 30000,      // 30 seconds for HTTP requests
    websocket: 60000  // 60 seconds for WebSocket connections
  },

  // Output configuration
  OUTPUT: {
    summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
    summaryTimeUnit: 'ms'
  }
};

// Scenario configurations for different test types
export const SCENARIOS = {
  smoke: {
    executor: 'constant-vus',
    vus: 5,
    duration: '1m',
    gracefulStop: '10s'
  },

  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m', target: 100 },  // Ramp up to 100 users
      { duration: '5m', target: 100 },  // Stay at 100 users
      { duration: '2m', target: 0 },    // Ramp down to 0
    ],
    gracefulRampDown: '30s'
  },

  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '5m', target: 100 },  // Ramp up to 100
      { duration: '5m', target: 300 },  // Continue to 300
      { duration: '5m', target: 500 },  // Push to 500
      { duration: '5m', target: 500 },  // Stay at 500
      { duration: '2m', target: 0 },    // Ramp down
    ],
    gracefulRampDown: '1m'
  },

  spike: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 50 },   // Normal load
      { duration: '2m', target: 50 },   // Maintain normal
      { duration: '30s', target: 500 }, // Spike!
      { duration: '1m', target: 500 },  // Stay at spike
      { duration: '30s', target: 50 },  // Drop back
      { duration: '2m', target: 50 },   // Recovery
      { duration: '1m', target: 0 },    // Ramp down
    ],
    gracefulRampDown: '30s'
  },

  endurance: {
    executor: 'constant-vus',
    vus: 100,
    duration: '30m',
    gracefulStop: '1m'
  }
};

export default CONFIG;
