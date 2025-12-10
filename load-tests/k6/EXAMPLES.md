# K6 Load Test Examples and Usage Guide

This guide provides practical examples for running and customizing k6 load tests for VoiceAssist.

## Table of Contents

- [Quick Start Examples](#quick-start-examples)
- [Custom Test Scenarios](#custom-test-scenarios)
- [Environment Configuration](#environment-configuration)
- [Result Analysis](#result-analysis)
- [Integration Examples](#integration-examples)
- [Troubleshooting](#troubleshooting)

## Quick Start Examples

### Run Individual Tests

```bash
# Smoke test (1 minute)
k6 run 01-smoke-test.js

# Load test (9 minutes)
k6 run 02-load-test.js

# Stress test (22 minutes)
k6 run 03-stress-test.js

# Spike test (8 minutes)
k6 run 04-spike-test.js

# Endurance test (30 minutes)
k6 run 05-endurance-test.js

# API scenarios (10 minutes)
k6 run 06-api-scenarios.js

# WebSocket test (5 minutes)
k6 run 07-websocket-test.js
```

### Quick Validation

```bash
# Run smoke + load test (10 minutes)
./run-quick-test.sh

# Run full suite (85 minutes)
./run-all-tests.sh
```

## Custom Test Scenarios

### Override Virtual Users

```bash
# Run with 50 VUs instead of default
k6 run --vus 50 02-load-test.js

# Run with custom stages
k6 run --stage 2m:100 --stage 5m:100 --stage 2m:0 02-load-test.js
```

### Override Duration

```bash
# Run smoke test for 5 minutes instead of 1
k6 run --duration 5m 01-smoke-test.js
```

### Custom Iterations

```bash
# Run exactly 1000 iterations
k6 run --iterations 1000 01-smoke-test.js
```

## Environment Configuration

### Set Base URL

```bash
# Using environment variable
export BASE_URL=https://api.voiceassist.com
k6 run 02-load-test.js

# Using --env flag
k6 run --env BASE_URL=https://staging.voiceassist.com 02-load-test.js
```

### Set WebSocket URL

```bash
# For WebSocket tests
k6 run --env WS_URL=wss://api.voiceassist.com 07-websocket-test.js
```

### Multiple Environment Variables

```bash
k6 run \
  --env BASE_URL=https://api.voiceassist.com \
  --env WS_URL=wss://api.voiceassist.com \
  --env ENVIRONMENT=production \
  02-load-test.js
```

### Using .env File

Create a file `.env.k6`:

```bash
BASE_URL=https://api.voiceassist.com
WS_URL=wss://api.voiceassist.com
```

Load it before running:

```bash
export $(cat .env.k6 | xargs)
k6 run 02-load-test.js
```

## Result Analysis

### Export to JSON

```bash
# Export results to JSON
k6 run --out json=results/test-output.json 02-load-test.js

# View with jq
cat results/test-output.json | jq '.'
```

### Export to InfluxDB (for Grafana)

```bash
# Start InfluxDB
docker run -d -p 8086:8086 influxdb:1.8

# Run test with InfluxDB output
k6 run --out influxdb=http://localhost:8086/k6 02-load-test.js
```

### View Specific Metrics

```bash
# View HTTP request duration
cat results/load-test-summary.json | jq '.http_req_duration'

# View error rate
cat results/load-test-summary.json | jq '.http_req_failed'

# View recommendations
cat results/stress-test-summary.json | jq '.recommendations'

# View custom metrics
cat results/load-test-summary.json | jq '.custom_metrics'
```

### Compare Results

```bash
# Compare two test runs
jq -s '.[0].http_req_duration.p95, .[1].http_req_duration.p95' \
  results/load-test-v1.json results/load-test-v2.json
```

## Integration Examples

### GitHub Actions

`.github/workflows/load-tests.yml`:

```yaml
name: Load Tests

on:
  schedule:
    - cron: "0 2 * * *" # Daily at 2 AM
  workflow_dispatch:
  push:
    branches: [main]

jobs:
  smoke-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install k6
        run: |
          curl https://github.com/grafana/k6/releases/download/v0.47.0/k6-v0.47.0-linux-amd64.tar.gz -L | tar xvz
          sudo mv k6-v0.47.0-linux-amd64/k6 /usr/local/bin/

      - name: Run smoke test
        run: k6 run load-tests/k6/01-smoke-test.js
        env:
          BASE_URL: ${{ secrets.STAGING_URL }}

      - name: Upload results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: smoke-test-results
          path: load-tests/results/

  load-test:
    runs-on: ubuntu-latest
    needs: smoke-test
    if: success()
    steps:
      - uses: actions/checkout@v3

      - name: Install k6
        run: |
          curl https://github.com/grafana/k6/releases/download/v0.47.0/k6-v0.47.0-linux-amd64.tar.gz -L | tar xvz
          sudo mv k6-v0.47.0-linux-amd64/k6 /usr/local/bin/

      - name: Run load test
        run: k6 run load-tests/k6/02-load-test.js
        env:
          BASE_URL: ${{ secrets.STAGING_URL }}

      - name: Upload results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: load-test-results
          path: load-tests/results/
```

### GitLab CI

`.gitlab-ci.yml`:

```yaml
stages:
  - smoke
  - load

smoke-test:
  stage: smoke
  image: grafana/k6:latest
  script:
    - k6 run load-tests/k6/01-smoke-test.js
  variables:
    BASE_URL: $STAGING_URL
  artifacts:
    paths:
      - load-tests/results/
    expire_in: 1 week

load-test:
  stage: load
  image: grafana/k6:latest
  script:
    - k6 run load-tests/k6/02-load-test.js
  variables:
    BASE_URL: $STAGING_URL
  only:
    - main
    - develop
  artifacts:
    paths:
      - load-tests/results/
    expire_in: 1 week
```

### Docker Compose

`docker-compose.load-test.yml`:

```yaml
version: "3.8"

services:
  k6:
    image: grafana/k6:latest
    volumes:
      - ./load-tests/k6:/scripts
      - ./load-tests/results:/results
    environment:
      - BASE_URL=http://voiceassist-server:8000
      - WS_URL=ws://voiceassist-server:8000
    command: run /scripts/02-load-test.js
    depends_on:
      - voiceassist-server
    networks:
      - voiceassist

  influxdb:
    image: influxdb:1.8
    ports:
      - "8086:8086"
    environment:
      - INFLUXDB_DB=k6
    networks:
      - voiceassist

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
    depends_on:
      - influxdb
    networks:
      - voiceassist

networks:
  voiceassist:
    external: true
```

Run with:

```bash
docker-compose -f docker-compose.load-test.yml up
```

### Jenkins Pipeline

`Jenkinsfile`:

```groovy
pipeline {
    agent any

    environment {
        BASE_URL = credentials('staging-url')
    }

    stages {
        stage('Install k6') {
            steps {
                sh '''
                    if ! command -v k6 &> /dev/null; then
                        curl https://github.com/grafana/k6/releases/download/v0.47.0/k6-v0.47.0-linux-amd64.tar.gz -L | tar xvz
                        sudo mv k6-v0.47.0-linux-amd64/k6 /usr/local/bin/
                    fi
                '''
            }
        }

        stage('Smoke Test') {
            steps {
                sh 'k6 run load-tests/k6/01-smoke-test.js'
            }
        }

        stage('Load Test') {
            when {
                branch 'main'
            }
            steps {
                sh 'k6 run load-tests/k6/02-load-test.js'
            }
        }

        stage('Archive Results') {
            steps {
                archiveArtifacts artifacts: 'load-tests/results/**/*.json', fingerprint: true
            }
        }
    }

    post {
        always {
            publishHTML([
                allowMissing: false,
                alwaysLinkToLastBuild: true,
                keepAll: true,
                reportDir: 'load-tests/results',
                reportFiles: '*.json',
                reportName: 'K6 Load Test Report'
            ])
        }
    }
}
```

## Troubleshooting

### Connection Issues

```bash
# Test connectivity
curl http://localhost:8000/health

# Verify WebSocket
wscat -c ws://localhost:8000/api/realtime/ws/echo

# Run with debug output
k6 run --http-debug 01-smoke-test.js
```

### High Error Rates

```bash
# Check server logs
docker-compose logs -f voiceassist-server

# Monitor resources
docker stats

# Check database connections
docker exec -it voiceassist-postgres psql -U voiceassist -c "SELECT count(*) FROM pg_stat_activity;"
```

### Timeout Issues

Edit `config.js`:

```javascript
TIMEOUTS: {
  http: 60000,      // Increase to 60 seconds
  websocket: 120000 // Increase to 120 seconds
}
```

### Memory Issues

```bash
# Increase Node.js memory (if needed)
export NODE_OPTIONS="--max-old-space-size=4096"

# Run with fewer VUs
k6 run --vus 10 02-load-test.js
```

### Certificate Issues (HTTPS)

```bash
# Skip TLS verification (testing only!)
k6 run --insecure-skip-tls-verify 02-load-test.js
```

### Custom Thresholds

Create a custom test:

```javascript
import { CONFIG } from "./config.js";

export const options = {
  scenarios: {
    custom: {
      executor: "constant-vus",
      vus: 10,
      duration: "5m",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<300"], // Custom threshold
    http_req_failed: ["rate<0.01"], // Custom error rate
  },
};

// ... rest of test
```

## Advanced Examples

### Rate Limiting Test

```javascript
import http from "k6/http";
import { sleep } from "k6";

export const options = {
  scenarios: {
    rate_limit_test: {
      executor: "constant-arrival-rate",
      rate: 100, // 100 requests per timeUnit
      timeUnit: "1s", // per second
      duration: "1m",
      preAllocatedVUs: 50,
    },
  },
};

export default function () {
  http.get("http://localhost:8000/api/chat/message");
  sleep(1);
}
```

### Gradual Ramp

```javascript
export const options = {
  stages: [
    { duration: "5m", target: 50 },
    { duration: "5m", target: 100 },
    { duration: "5m", target: 150 },
    { duration: "5m", target: 200 },
    { duration: "5m", target: 150 },
    { duration: "5m", target: 100 },
    { duration: "5m", target: 50 },
    { duration: "5m", target: 0 },
  ],
};
```

### Custom Metrics

```javascript
import { Trend } from "k6/metrics";

const customMetric = new Trend("custom_processing_time");

export default function () {
  const start = Date.now();
  // ... do something
  const duration = Date.now() - start;
  customMetric.add(duration);
}
```

## Resources

- [k6 Official Documentation](https://k6.io/docs/)
- [k6 Examples](https://k6.io/docs/examples/)
- [k6 Community Forum](https://community.k6.io/)
- [Grafana k6 Cloud](https://grafana.com/products/cloud/k6/)
