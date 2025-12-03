# VoiceAssist Locust Load Testing

Comprehensive load testing suite for VoiceAssist Phase 10 using Locust.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Test Scenarios](#test-scenarios)
- [Running Tests](#running-tests)
- [Distributed Testing](#distributed-testing)
- [Results Analysis](#results-analysis)
- [CI/CD Integration](#cicd-integration)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

This load testing suite provides comprehensive testing capabilities for VoiceAssist:

- **Multiple User Types**: Regular users (70%), Power users (20%), Admin users (10%)
- **Realistic Scenarios**: User journeys, admin workflows, stress tests, spike tests
- **WebSocket Support**: Real-time voice mode testing
- **Distributed Testing**: Scale to thousands of concurrent users
- **Detailed Metrics**: Custom metrics tracking and performance thresholds
- **CI/CD Ready**: Headless mode with automated reporting

## Architecture

```
load-tests/locust/
├── locustfile.py              # Main Locust file with user types
├── config.py                  # Configuration and settings
├── tasks.py                   # Modular task definitions
├── utils.py                   # Helper functions and utilities
├── requirements.txt           # Python dependencies
├── run-tests.sh              # Test runner script
├── docker-compose.yml        # Distributed testing setup
├── scenarios/                # Test scenarios
│   ├── user_journey.py       # Complete user journey
│   ├── admin_workflow.py     # Admin operations
│   ├── stress_scenario.py    # High-load stress testing
│   └── spike_scenario.py     # Sudden spike testing
└── README.md                 # This file
```

## Installation

### Prerequisites

- Python 3.8+
- pip
- Docker and Docker Compose (for distributed testing)

### Install Dependencies

```bash
# Navigate to locust directory
cd load-tests/locust

# Install Python dependencies
pip install -r requirements.txt

# Verify installation
locust --version
```

## Quick Start

### 1. Start VoiceAssist Services

Ensure VoiceAssist is running:

```bash
# From project root
docker-compose up -d
```

### 2. Run Your First Test

```bash
# Run smoke test (10 users, 2 minutes)
./run-tests.sh smoke

# Or start web UI for manual testing
./run-tests.sh web
```

### 3. View Results

- **Web UI**: http://localhost:8089 (when running web mode)
- **HTML Report**: `../results/locust/smoke_test_*.html`
- **CSV Data**: `../results/locust/smoke_test_*.csv`

## Test Scenarios

### Smoke Test

**Purpose**: Quick sanity check
**Load**: 10 users, 2 minutes
**Use Case**: After deployments, quick validation

```bash
./run-tests.sh smoke
```

### Load Test

**Purpose**: Test expected load
**Load**: 100 users, 10 minutes
**Use Case**: Performance testing, capacity planning

```bash
./run-tests.sh load
```

### Stress Test

**Purpose**: Find breaking points
**Load**: 500 users, 15 minutes
**Use Case**: Identify system limits

```bash
./run-tests.sh stress
```

### Spike Test

**Purpose**: Test sudden traffic increase
**Load**: 1000 users, 5 minutes (high spawn rate)
**Use Case**: Test auto-scaling, circuit breakers

```bash
./run-tests.sh spike
```

### Soak Test

**Purpose**: Test stability over time
**Load**: 100 users, 60 minutes
**Use Case**: Memory leak detection, resource exhaustion

```bash
./run-tests.sh soak
```

### User Journey

**Purpose**: End-to-end user flow
**Flow**: Register → Login → Query → Logout
**Use Case**: Functional validation

```bash
./run-tests.sh user-journey
```

### Admin Workflow

**Purpose**: Admin operations
**Flow**: Login → Upload → Manage → Monitor
**Use Case**: Admin feature testing

```bash
./run-tests.sh admin-workflow
```

## Running Tests

### Using Web UI (Interactive)

```bash
# Start web UI
./run-tests.sh web

# Open browser to http://localhost:8089
# Configure users, spawn rate, host
# Click "Start swarming"
```

### Using Headless Mode (Automated)

```bash
# Run with default settings
./run-tests.sh load --headless

# Custom configuration
./run-tests.sh load \
    --users=200 \
    --spawn-rate=20 \
    --run-time=15m \
    --headless
```

### Using Locust Directly

```bash
# Web UI mode
locust -f locustfile.py --host=http://localhost:8000

# Headless mode
locust -f locustfile.py \
    --host=http://localhost:8000 \
    --users=100 \
    --spawn-rate=10 \
    --run-time=10m \
    --headless \
    --html=report.html \
    --csv=results
```

### Custom Scenarios

```bash
# Run specific scenario
locust -f scenarios/user_journey.py --host=http://localhost:8000

# Run with tags
locust -f locustfile.py --tags=chat --host=http://localhost:8000

# Exclude tags
locust -f locustfile.py --exclude-tags=admin --host=http://localhost:8000
```

## Distributed Testing

For high-scale testing (1000+ users), use distributed mode with multiple worker nodes.

### Using Docker Compose (Recommended)

```bash
# Start master + 4 workers
./run-tests.sh distributed

# Access web UI at http://localhost:8089

# View logs
docker-compose logs -f locust-master
docker-compose logs -f locust-worker-1

# Scale workers
docker-compose up -d --scale locust-worker=8

# Stop all
docker-compose down
```

### Manual Distributed Setup

**Terminal 1 - Master:**

```bash
locust -f locustfile.py \
    --master \
    --expect-workers=4 \
    --host=http://localhost:8000
```

**Terminals 2-5 - Workers:**

```bash
locust -f locustfile.py \
    --worker \
    --master-host=localhost
```

## Results Analysis

### HTML Report

Generated HTML reports include:

- Request statistics (RPS, response times, failures)
- Charts (requests/sec, response times)
- Failure details
- Download statistics

```bash
# View report
open ../results/locust/load_test_*.html
```

### CSV Export

CSV files include detailed statistics:

- `*_stats.csv`: Request statistics
- `*_stats_history.csv`: Time-series data
- `*_failures.csv`: Failure details

```bash
# Analyze with pandas
import pandas as pd
stats = pd.read_csv('results/load_test_stats.csv')
print(stats.describe())
```

### Custom Metrics

The test suite tracks custom metrics:

- Authentication failures
- Rate limit hits
- WebSocket connections
- Document uploads
- Query citation rates

View in logs or implement custom exporters.

### Performance Thresholds

Thresholds defined in `config.py`:

- Login: < 1s
- Chat query: < 3s
- Document upload: < 10s
- Health check: < 500ms
- WebSocket message: < 5s

Warnings logged when thresholds exceeded.

## CI/CD Integration

### GitHub Actions

```yaml
name: Load Testing

on:
  schedule:
    - cron: "0 2 * * *" # Daily at 2 AM
  workflow_dispatch:

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Start VoiceAssist
        run: docker-compose up -d

      - name: Wait for services
        run: sleep 30

      - name: Install Locust
        run: |
          cd load-tests/locust
          pip install -r requirements.txt

      - name: Run Load Test
        run: |
          cd load-tests/locust
          ./run-tests.sh load --headless

      - name: Upload Results
        uses: actions/upload-artifact@v3
        with:
          name: load-test-results
          path: load-tests/results/locust/

      - name: Check Failure Rate
        run: |
          # Parse results and fail if error rate > 5%
          python scripts/check_results.py
```

### Jenkins Pipeline

```groovy
pipeline {
    agent any

    stages {
        stage('Deploy') {
            steps {
                sh 'docker-compose up -d'
                sh 'sleep 30'
            }
        }

        stage('Load Test') {
            steps {
                dir('load-tests/locust') {
                    sh 'pip install -r requirements.txt'
                    sh './run-tests.sh load --headless'
                }
            }
        }

        stage('Analyze Results') {
            steps {
                publishHTML([
                    reportDir: 'load-tests/results/locust',
                    reportFiles: 'load_test_*.html',
                    reportName: 'Load Test Report'
                ])
            }
        }
    }

    post {
        always {
            sh 'docker-compose down'
        }
    }
}
```

## Best Practices

### Test Design

1. **Start Small**: Run smoke tests before large-scale tests
2. **Ramp Gradually**: Use appropriate spawn rates
3. **Monitor Resources**: Watch CPU, memory, disk I/O during tests
4. **Realistic Data**: Use representative queries and documents
5. **Think Times**: Include realistic wait times between actions

### Performance Testing

1. **Baseline**: Establish performance baseline before changes
2. **Reproducibility**: Run tests multiple times, compare results
3. **Isolation**: Test in isolated environment when possible
4. **Metrics**: Track both application and infrastructure metrics
5. **Thresholds**: Define and enforce performance SLAs

### Troubleshooting

**High Failure Rate**

- Check if services are running: `docker-compose ps`
- Verify network connectivity
- Check authentication (register test users first)
- Review logs: `docker-compose logs voiceassist-server`

**Slow Response Times**

- Increase resources (CPU, memory)
- Check database connection pool
- Monitor database performance
- Review API logs for slow queries

**Connection Errors**

- Verify host URL is correct
- Check firewall rules
- Ensure adequate file descriptors
- Monitor connection pool limits

**Rate Limiting**

- Expected for registration/login endpoints
- Adjust test user pool
- Implement token reuse strategies
- Review rate limit configurations

### Environment Variables

```bash
# Set target URL
export VOICEASSIST_BASE_URL=http://staging.example.com:8000
export VOICEASSIST_WS_URL=ws://staging.example.com:8000

# Run tests
./run-tests.sh load
```

### Custom Configuration

Edit `config.py` to customize:

- Test users and credentials
- Task weights and distribution
- Wait times between actions
- Sample queries and documents
- Performance thresholds

## Advanced Usage

### Custom User Class

```python
from locust import HttpUser, task, between
from tasks import ChatTasks
from utils import AuthHelper

class CustomUser(HttpUser):
    wait_time = between(1, 3)

    def on_start(self):
        # Custom setup
        pass

    @task(10)
    def custom_task(self):
        # Your custom task
        pass
```

### Custom Metrics

```python
from locust import events

@events.request.add_listener
def on_request(request_type, name, response_time, **kwargs):
    # Custom metric tracking
    if "chat" in name and response_time > 3000:
        print(f"Slow chat query: {response_time}ms")
```

### WebSocket Testing

```python
from locust import HttpUser, task
import websocket

class WSUser(HttpUser):
    @task
    def websocket_chat(self):
        ws = websocket.create_connection("ws://localhost:8000/api/realtime/ws")
        ws.send('{"type": "message", "content": "test"}')
        result = ws.recv()
        ws.close()
```

## Troubleshooting

### Common Issues

**Issue**: `ModuleNotFoundError: No module named 'locust'`
**Solution**: Install dependencies: `pip install -r requirements.txt`

**Issue**: `Connection refused`
**Solution**: Ensure VoiceAssist is running: `docker-compose ps`

**Issue**: `Too many open files`
**Solution**: Increase file descriptor limit: `ulimit -n 65536`

**Issue**: `Workers not connecting to master`
**Solution**: Check network, ensure master port 5557 is accessible

**Issue**: Authentication failures
**Solution**: Register test users before running tests

## Support

For issues or questions:

- Check logs: `docker-compose logs -f voiceassist-server`
- Review Locust docs: https://docs.locust.io
- Open GitHub issue with test output

## License

Same as VoiceAssist project.
