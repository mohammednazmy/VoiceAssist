---
title: "Load Testing Guide"
slug: "load-testing-guide"
summary: "This comprehensive guide covers load testing for VoiceAssist, including when to run tests, how to interpret results, choosing between tools (k6 vs Loc..."
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience: ["frontend"]
tags: ["load", "testing", "guide"]
category: testing
---

# VoiceAssist Load Testing Guide

## Overview

This comprehensive guide covers load testing for VoiceAssist, including when to run tests, how to interpret results, choosing between tools (k6 vs Locust), understanding test scenarios, troubleshooting issues, CI/CD integration, and best practices.

## Table of Contents

- [When to Run Load Tests](#when-to-run-load-tests)
- [Load Testing Tools](#load-testing-tools)
- [Test Scenarios](#test-scenarios)
- [Running Load Tests](#running-load-tests)
- [Interpreting Results](#interpreting-results)
- [Troubleshooting](#troubleshooting)
- [CI/CD Integration](#cicd-integration)
- [Best Practices](#best-practices)

---

## When to Run Load Tests

### Regular Testing Schedule

#### Pre-Release Testing (Required)

Run comprehensive load tests before **every production release**:

- **Scope**: Full test suite (50, 100, 200 users)
- **Duration**: 30 minutes per scenario
- **Goal**: Validate no performance regressions
- **Action**: Block release if critical thresholds exceeded

#### Weekly Baseline (Recommended)

Run baseline tests **every Monday morning**:

- **Scope**: 100 user scenario (production simulation)
- **Duration**: 15 minutes
- **Goal**: Establish performance trends
- **Action**: Investigate significant deviations (>10%)

#### Monthly Stress Testing (Optional)

Run stress tests **last Friday of month**:

- **Scope**: 200-500 user scenarios
- **Duration**: 60 minutes
- **Goal**: Validate capacity limits
- **Action**: Update capacity planning

### Trigger-Based Testing

#### After Major Changes

Run load tests after:

1. **Database Schema Changes**
   - New indexes
   - Table modifications
   - Migration scripts

2. **Cache Strategy Changes**
   - TTL adjustments
   - New cache layers
   - Eviction policy changes

3. **Infrastructure Changes**
   - Kubernetes configuration
   - Resource limits
   - HPA threshold adjustments

4. **Code Optimizations**
   - Query optimizations
   - Algorithm improvements
   - Caching implementations

5. **Dependency Updates**
   - Major library upgrades
   - Framework updates
   - Database version changes

#### Before Capacity Changes

Run load tests before:

- Adding/removing nodes
- Changing instance types
- Modifying autoscaling policies
- Database scaling operations

### Ad-Hoc Testing

Run load tests when:

- Investigating performance issues
- Validating optimization hypotheses
- Responding to user complaints
- Capacity planning exercises
- Training new team members

---

## Load Testing Tools

### Tool Comparison: k6 vs Locust

We use both tools for different purposes. Here's when to use each:

#### k6 - Recommended for:

**Strengths**:

- Fast execution (written in Go)
- Low resource overhead
- JavaScript-based scripts (familiar syntax)
- Excellent CLI integration
- Cloud service available
- Great for CI/CD pipelines
- Built-in metrics and thresholds
- Protocol-level testing (HTTP/2, gRPC)

**Best For**:

- Quick smoke tests
- CI/CD integration
- Simple API endpoint testing
- Protocol-specific testing
- Resource-constrained environments
- Automated regression testing

**Example Use Cases**:

```bash
# Quick smoke test
k6 run --vus 10 --duration 30s smoke-test.js

# CI/CD integration
k6 run --out json=results.json ci-test.js

# Protocol testing
k6 run --http2 http2-test.js
```

#### Locust - Recommended for:

**Strengths**:

- Python-based (easy to customize)
- Web UI for real-time monitoring
- Distributed load generation
- Complex user behavior modeling
- Task weights and think times
- WebSocket support
- Extensible architecture
- Better for long-running tests

**Best For**:

- Complex user scenarios
- Long-duration tests (hours)
- Real-time monitoring needs
- Distributed testing
- Custom behavior modeling
- WebSocket testing
- Exploratory testing

**Example Use Cases**:

```bash
# Web UI with real-time monitoring
locust -f locustfile.py --web-port 8089

# Distributed testing
locust -f locustfile.py --master
locust -f locustfile.py --worker --master-host=master-ip

# Headless with specific targets
locust -f locustfile.py --headless -u 100 -r 10 -t 30m
```

### Decision Matrix

| Criteria                 | Use k6       | Use Locust |
| ------------------------ | ------------ | ---------- |
| **Test Duration**        | <30 min      | >30 min    |
| **Script Complexity**    | Simple       | Complex    |
| **CI/CD Integration**    | Yes          | Optional   |
| **Real-time Monitoring** | Not critical | Required   |
| **Distributed Testing**  | Not needed   | Required   |
| **WebSocket Testing**    | No           | Yes        |
| **Team Familiarity**     | JavaScript   | Python     |
| **Resource Constraints** | Limited      | Abundant   |

### Hybrid Approach (Recommended)

Use **both** tools in your testing strategy:

1. **k6 for CI/CD**:
   - Quick regression tests
   - Automated on every PR
   - 5-10 minute tests
   - Pass/fail criteria

2. **Locust for Deep Testing**:
   - Pre-release validation
   - Capacity planning
   - Performance investigations
   - 30-60 minute tests

---

## Test Scenarios

### Overview

We have 4 standard test scenarios with increasing load:

1. **Smoke Test** (10 users, 5 min)
2. **Baseline Test** (50 users, 15 min)
3. **Load Test** (100 users, 30 min)
4. **Stress Test** (200-500 users, 60 min)

### Smoke Test

**Purpose**: Verify system functionality under minimal load

**Configuration**:

```yaml
virtual_users: 10
duration: 5 minutes
ramp_up: 1 minute
think_time: 5-10 seconds
```

**User Distribution**:

- 70% Regular Users (simple queries)
- 20% Power Users (complex queries)
- 10% Admin Users (document operations)

**When to Use**:

- After deployments
- Quick sanity checks
- Before longer tests
- CI/CD pipelines

**Success Criteria**:

- Error rate <0.5%
- P95 response time <500ms
- No crashes or errors

### Baseline Test (50 Users)

**Purpose**: Establish performance baseline under light load

**Configuration**:

```yaml
virtual_users: 50
duration: 15 minutes
ramp_up: 5 minutes
steady_state: 10 minutes
think_time: 3-10 seconds
```

**User Distribution**:

- 70% Regular Users
- 20% Power Users
- 10% Admin Users

**When to Use**:

- Weekly baseline tests
- After optimizations
- Regression detection
- Performance trending

**Success Criteria**:

- P95 response time <500ms
- Error rate <1%
- CPU utilization <60%
- Cache hit rate >80%

### Load Test (100 Users)

**Purpose**: Simulate production load

**Configuration**:

```yaml
virtual_users: 100
duration: 30 minutes
ramp_up: 10 minutes
steady_state: 20 minutes
think_time: 3-10 seconds
```

**User Distribution**:

- 70% Regular Users
- 20% Power Users
- 10% Admin Users

**When to Use**:

- Pre-release testing
- Capacity validation
- SLO verification
- Monthly reviews

**Success Criteria**:

- P95 response time <800ms
- Error rate <1%
- CPU utilization <70%
- Throughput >80 req/s

### Stress Test (200-500 Users)

**Purpose**: Test system limits and breaking points

**Configuration**:

```yaml
virtual_users: 200-500 (incremental)
duration: 60 minutes
ramp_up: 20 minutes
steady_state: 40 minutes
think_time: 3-10 seconds
```

**User Distribution**:

- 70% Regular Users
- 20% Power Users
- 10% Admin Users

**When to Use**:

- Capacity planning
- Breaking point analysis
- Quarterly reviews
- Before major events

**Success Criteria**:

- System remains stable
- Error rate <5%
- Graceful degradation
- No cascading failures

---

## Running Load Tests

### Prerequisites

1. **Environment Setup**:

   ```bash
   # Install Locust
   pip install locust locust-plugins

   # Install k6
   brew install k6  # macOS
   # or download from https://k6.io/
   ```

2. **Configuration**:

   ```bash
   # Copy and configure environment
   cp load-tests/locust/.env.example load-tests/locust/.env

   # Update BASE_URL, credentials, etc.
   vim load-tests/locust/.env
   ```

3. **Test Environment**:
   - Use staging/test environment
   - Never run against production without approval
   - Ensure monitoring is enabled
   - Clear caches before testing

### Running Locust Tests

#### Web UI Mode (Interactive)

```bash
# Navigate to test directory
cd load-tests/locust

# Start Locust with web UI
locust -f locustfile.py --web-port 8089

# Open browser to http://localhost:8089
# Configure:
#   - Number of users
#   - Spawn rate
#   - Host (if not in config)
# Click "Start Swarming"
```

**Advantages**:

- Real-time monitoring
- Dynamic control (pause, stop, adjust)
- Visual charts
- Best for exploratory testing

#### Headless Mode (Automated)

```bash
# Baseline test (50 users)
locust -f locustfile.py \
  --headless \
  -u 50 \
  -r 5 \
  -t 15m \
  --html report-50users.html \
  --csv report-50users

# Load test (100 users)
locust -f locustfile.py \
  --headless \
  -u 100 \
  -r 10 \
  -t 30m \
  --html report-100users.html \
  --csv report-100users

# Stress test (200 users)
locust -f locustfile.py \
  --headless \
  -u 200 \
  -r 10 \
  -t 60m \
  --html report-200users.html \
  --csv report-200users
```

**Parameters**:

- `-u`: Number of users (peak)
- `-r`: Spawn rate (users/second)
- `-t`: Test duration
- `--html`: Generate HTML report
- `--csv`: Generate CSV results

#### Distributed Mode (High Load)

For tests >500 users or resource constraints:

```bash
# Terminal 1: Start master
locust -f locustfile.py \
  --master \
  --expect-workers 4 \
  --web-port 8089

# Terminals 2-5: Start workers
locust -f locustfile.py \
  --worker \
  --master-host localhost

# Use web UI or headless mode as above
```

### Running k6 Tests

#### Smoke Test

```bash
# Navigate to test directory
cd load-tests/k6

# Run smoke test
k6 run --vus 10 --duration 5m smoke-test.js
```

#### Load Test

```bash
# Run with staged load
k6 run \
  --stage 5m:50 \
  --stage 10m:50 \
  --stage 5m:0 \
  load-test.js
```

#### Stress Test

```bash
# Run stress test with thresholds
k6 run \
  --stage 10m:100 \
  --stage 20m:100 \
  --stage 10m:200 \
  --stage 20m:200 \
  --stage 10m:0 \
  stress-test.js
```

#### With Cloud Output

```bash
# Send results to k6 Cloud
k6 run --out cloud load-test.js

# Or to other backends
k6 run --out influxdb=http://localhost:8086/k6 load-test.js
```

### Monitoring During Tests

#### Grafana Dashboards

Open these dashboards before starting tests:

1. **Load Testing Overview**:

   ```
   http://grafana:3000/d/voiceassist-load-testing
   ```

   - Test status and VUs
   - Request rate and errors
   - Response time percentiles

2. **System Performance**:

   ```
   http://grafana:3000/d/voiceassist-system-performance
   ```

   - Request throughput
   - Resource utilization
   - Database and cache performance

3. **Autoscaling Monitoring**:

   ```
   http://grafana:3000/d/voiceassist-autoscaling
   ```

   - HPA status
   - Pod count
   - Scaling events

#### Real-Time Metrics

```bash
# Watch pod metrics
watch kubectl top pods -n voiceassist

# Watch HPA status
watch kubectl get hpa -n voiceassist

# Watch pod count
watch kubectl get pods -n voiceassist

# Stream pod logs
kubectl logs -f -l app=voiceassist-api -n voiceassist
```

---

## Interpreting Results

### Key Metrics to Analyze

#### 1. Response Time

**What to Look For**:

- P50 (median): Representative user experience
- P95: What 95% of users experience
- P99: Edge cases and outliers
- Trend over time: Stability vs degradation

**Good**:

```
P50: 180ms (stable throughout test)
P95: 520ms (no spikes)
P99: 950ms (within target)
```

**Bad**:

```
P50: 320ms (increasing over time)
P95: 1850ms (frequent spikes)
P99: 5200ms (extreme outliers)
```

**Analysis**:

- Increasing trend → Resource exhaustion or memory leak
- Periodic spikes → Garbage collection or batch jobs
- High variance → Inconsistent performance (investigate)

#### 2. Throughput

**What to Look For**:

- Requests per second (sustained)
- Consistency throughout test
- Correlation with user count

**Good**:

```
Target: 100 users
Throughput: 90 req/s (consistent)
```

**Bad**:

```
Target: 100 users
Throughput: 45 req/s (declining)
Or: 150 req/s (users waiting, not thinking)
```

**Analysis**:

- Lower than expected → Bottleneck (DB, CPU, network)
- Higher than expected → Unrealistic think times
- Declining → System degradation under load

#### 3. Error Rate

**What to Look For**:

- Percentage of failed requests
- Error types (4xx vs 5xx)
- When errors occur (start, middle, end)

**Good**:

```
Total Requests: 27,000
Failed Requests: 81 (0.3%)
Error Type: Mostly 4xx (validation)
```

**Bad**:

```
Total Requests: 27,000
Failed Requests: 1,350 (5%)
Error Type: 5xx (server errors)
Trend: Increasing over time
```

**Analysis**:

- <1%: Acceptable (expected transient errors)
- 1-3%: Warning (investigate if sustained)
- > 3%: Critical (system under stress)
- Increasing: System failing under load

#### 4. Resource Utilization

**What to Look For**:

- CPU and memory utilization
- Pod count (autoscaling)
- Database connections
- Cache hit rates

**Good**:

```
CPU: 60-70% (stable, room for spikes)
Memory: 55-65% (stable)
Pods: 4-5 (scaled appropriately)
DB Connections: 30/50 (60%, comfortable)
Cache Hit Rate: 83% (effective)
```

**Bad**:

```
CPU: 85-95% (saturated, no headroom)
Memory: 88-92% (risk of OOM)
Pods: 10 (max, still struggling)
DB Connections: 49/50 (98%, bottleneck)
Cache Hit Rate: 45% (ineffective)
```

**Analysis**:

- High CPU → Computation bottleneck
- High memory → Memory leak or inefficient data structures
- Max pods → Need vertical or horizontal scaling
- DB connections saturated → Need connection pooling or replicas
- Low cache hit rate → Poor cache strategy

### Locust Report Analysis

#### HTML Report Sections

1. **Statistics Table**:
   - Shows per-endpoint performance
   - Look for outliers (slow endpoints)
   - Check failure rates per endpoint

2. **Response Time Chart**:
   - Visualize P50/P95/P99 over time
   - Look for trends and spikes
   - Correlate with events (scaling, errors)

3. **Users Chart**:
   - Verify ramp-up pattern
   - Ensure smooth increase
   - Check if target reached

4. **Requests per Second**:
   - Verify throughput expectations
   - Look for correlation with users
   - Check for plateaus (bottlenecks)

#### CSV Data Analysis

```python
# Example: Analyze Locust CSV output
import pandas as pd

# Load results
stats = pd.read_csv('report-100users_stats.csv')
history = pd.read_csv('report-100users_stats_history.csv')

# Calculate key metrics
print(f"Median Response Time: {stats['Median Response Time'].median():.0f}ms")
print(f"95th Percentile: {stats['95%'].median():.0f}ms")
print(f"99th Percentile: {stats['99%'].median():.0f}ms")
print(f"Total Requests: {stats['Request Count'].sum()}")
print(f"Total Failures: {stats['Failure Count'].sum()}")
print(f"Error Rate: {(stats['Failure Count'].sum() / stats['Request Count'].sum() * 100):.2f}%")

# Identify slowest endpoints
slowest = stats.nlargest(5, '95%')[['Name', '95%', 'Request Count']]
print("\nSlowest Endpoints (P95):")
print(slowest)
```

### k6 Results Analysis

#### Terminal Output

```
execution: local
    script: load-test.js
    output: -

scenarios: (100.00%) 1 scenario, 100 max VUs, 30m30s max duration (incl. graceful stop):
          * default: 100 looping VUs for 30m0s (gracefulStop: 30s)

     ✓ status was 200
     ✓ response time < 500ms

     checks.........................: 99.67% ✓ 26890      ✗ 89
     data_received..................: 45 MB  25 kB/s
     data_sent......................: 3.2 MB 1.8 kB/s
     http_req_blocked...............: avg=1.23ms  min=1µs   med=5µs    max=234ms  p(90)=8µs    p(95)=11µs
     http_req_connecting............: avg=487µs   min=0s    med=0s     max=89ms   p(90)=0s     p(95)=0s
     http_req_duration..............: avg=182ms   min=23ms  med=156ms  max=2.1s   p(90)=289ms  p(95)=398ms
       { expected_response:true }...: avg=181ms   min=23ms  med=156ms  max=1.8s   p(90)=288ms  p(95)=396ms
     http_req_failed................: 0.33%  ✓ 89         ✗ 26890
     http_req_receiving.............: avg=156µs   min=18µs  med=98µs   max=12ms   p(90)=245µs  p(95)=389µs
     http_req_sending...............: avg=38µs    min=6µs   med=25µs   max=8ms    p(90)=58µs   p(95)=89µs
     http_req_tls_handshaking.......: avg=645µs   min=0s    med=0s     max=156ms  p(90)=0s     p(95)=0s
     http_req_waiting...............: avg=182ms   min=23ms  med=156ms  max=2.1s   p(90)=289ms  p(95)=398ms
     http_reqs......................: 26979  14.98/s
     iteration_duration.............: avg=6.65s   min=5.02s med=6.45s  max=15.2s  p(90)=7.89s  p(95)=8.76s
     iterations.....................: 26979  14.98/s
     vus............................: 100    min=100      max=100
     vus_max........................: 100    min=100      max=100


running (30m00.0s), 000/100 VUs, 26979 complete and 0 interrupted iterations
default ✓ [======================================] 100 VUs  30m0s
```

**Key Points**:

- ✓ checks: 99.67% → Good (most checks passed)
- http_req_duration: P95 = 398ms → Good (within target)
- http_req_failed: 0.33% → Good (low error rate)
- http_reqs: 14.98/s → Throughput (with 100 VUs, 6.65s iteration)

---

## Troubleshooting

### Common Issues and Solutions

#### Issue 1: High Error Rate (>3%)

**Symptoms**:

- Many 5xx errors
- Error rate increasing over time
- Specific endpoints failing

**Diagnosis**:

```bash
# Check pod logs
kubectl logs -l app=voiceassist-api -n voiceassist --tail=100

# Check error distribution
# In Locust UI: Look at failures tab
# In Grafana: Check error rate by endpoint

# Check resource utilization
kubectl top pods -n voiceassist
```

**Common Causes**:

1. **Database connection pool exhausted**
   - Solution: Increase pool size or add replicas

2. **CPU/Memory saturation**
   - Solution: Scale horizontally or vertically

3. **Timeouts**
   - Solution: Increase timeout values or optimize slow queries

4. **Rate limiting**
   - Solution: Adjust rate limits or distribute load

#### Issue 2: Poor Response Times

**Symptoms**:

- P95/P99 exceeding targets
- Response time increasing over test duration
- Inconsistent performance

**Diagnosis**:

```bash
# Check slow queries
kubectl exec -it postgres-pod -- psql -U user -d voiceassist
SELECT * FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;

# Check cache hit rate
# In Grafana: Cache Performance dashboard

# Check autoscaling
kubectl get hpa -n voiceassist
```

**Common Causes**:

1. **Database queries not optimized**
   - Solution: Add indexes, optimize queries

2. **Cache misses**
   - Solution: Warm cache, adjust TTLs

3. **Insufficient resources**
   - Solution: Scale up

4. **Network latency**
   - Solution: Check network configuration

#### Issue 3: Autoscaling Not Working

**Symptoms**:

- Pods not scaling up despite high load
- Scaling too slowly or too aggressively
- Pods scaling down during active test

**Diagnosis**:

```bash
# Check HPA status
kubectl describe hpa voiceassist-api -n voiceassist

# Check metrics server
kubectl get --raw /apis/metrics.k8s.io/v1beta1/pods

# Check HPA events
kubectl get events -n voiceassist --sort-by='.lastTimestamp'
```

**Common Causes**:

1. **Metrics server not running**
   - Solution: Install/restart metrics server

2. **Incorrect HPA configuration**
   - Solution: Review and adjust thresholds

3. **Resource requests not set**
   - Solution: Set CPU/memory requests in pod spec

4. **Scaling too conservative**
   - Solution: Adjust scale-up/scale-down policies

#### Issue 4: Memory Leaks

**Symptoms**:

- Memory usage increasing over time
- Pods being OOMKilled
- Performance degrading over test duration

**Diagnosis**:

```bash
# Monitor memory over time
kubectl top pods -n voiceassist --watch

# Check for OOMKilled pods
kubectl get pods -n voiceassist | grep OOMKilled

# Get detailed pod memory usage
kubectl describe pod <pod-name> -n voiceassist
```

**Common Causes**:

1. **Unclosed connections**
   - Solution: Ensure proper connection cleanup

2. **Caching too aggressively**
   - Solution: Implement cache size limits, eviction

3. **Large response objects**
   - Solution: Implement pagination, streaming

4. **Circular references**
   - Solution: Review object lifecycle, use weak references

#### Issue 5: Load Test Itself Failing

**Symptoms**:

- Locust/k6 crashing
- Cannot reach target user count
- Inconsistent results

**Diagnosis**:

```bash
# Check load test machine resources
top
htop

# Check network connectivity
ping <target-host>
curl -v https://<target-host>/health

# Verify test configuration
cat load-tests/locust/config.py
```

**Common Causes**:

1. **Load test machine under-resourced**
   - Solution: Use more powerful machine or distributed mode

2. **Network issues**
   - Solution: Check firewall, DNS, routing

3. **Test script errors**
   - Solution: Review and debug test code

4. **Unrealistic think times**
   - Solution: Adjust to realistic values

---

## CI/CD Integration

### GitHub Actions Example

```yaml
# .github/workflows/load-test.yml
name: Load Test

on:
  schedule:
    # Run every Monday at 8 AM UTC
    - cron: "0 8 * * 1"
  workflow_dispatch:
    inputs:
      users:
        description: "Number of users"
        required: true
        default: "50"
      duration:
        description: "Test duration (e.g., 15m)"
        required: true
        default: "15m"

jobs:
  load-test-k6:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install k6
        run: |
          sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install k6

      - name: Run k6 load test
        run: |
          k6 run \
            --vus ${{ github.event.inputs.users || '50' }} \
            --duration ${{ github.event.inputs.duration || '15m' }} \
            --out json=results.json \
            load-tests/k6/baseline-test.js
        env:
          BASE_URL: ${{ secrets.STAGING_URL }}
          API_KEY: ${{ secrets.STAGING_API_KEY }}

      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: k6-results
          path: results.json

      - name: Check thresholds
        run: |
          # Parse results and check if thresholds passed
          # Fail job if critical metrics exceeded
          python scripts/check-thresholds.py results.json

  load-test-locust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: "3.11"

      - name: Install dependencies
        run: |
          pip install locust locust-plugins

      - name: Run Locust load test
        run: |
          cd load-tests/locust
          locust -f locustfile.py \
            --headless \
            -u ${{ github.event.inputs.users || '50' }} \
            -r 5 \
            -t ${{ github.event.inputs.duration || '15m' }} \
            --html report.html \
            --csv report
        env:
          BASE_URL: ${{ secrets.STAGING_URL }}
          TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
          TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}

      - name: Upload reports
        uses: actions/upload-artifact@v3
        with:
          name: locust-results
          path: |
            load-tests/locust/report.html
            load-tests/locust/report_*.csv

      - name: Post results to Slack
        if: always()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "Load Test Results",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Load Test Completed*\nUsers: ${{ github.event.inputs.users || '50' }}\nDuration: ${{ github.event.inputs.duration || '15m' }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### GitLab CI Example

```yaml
# .gitlab-ci.yml
stages:
  - test
  - report

variables:
  BASE_URL: $STAGING_URL

load-test-baseline:
  stage: test
  image: grafana/k6:latest
  script:
    - k6 run --vus 50 --duration 15m --out json=results.json load-tests/k6/baseline-test.js
  artifacts:
    paths:
      - results.json
    expire_in: 30 days
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule"
    - if: $CI_PIPELINE_SOURCE == "web"

load-test-full:
  stage: test
  image: locustio/locust:latest
  script:
    - cd load-tests/locust
    - locust -f locustfile.py --headless -u 100 -r 10 -t 30m --html report.html --csv report
  artifacts:
    paths:
      - load-tests/locust/report.*
    expire_in: 30 days
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
    - if: $CI_PIPELINE_SOURCE == "schedule"

analyze-results:
  stage: report
  image: python:3.11
  script:
    - pip install pandas matplotlib
    - python scripts/analyze-results.py
    - python scripts/generate-report.py
  artifacts:
    paths:
      - performance-report.pdf
    expire_in: 90 days
  dependencies:
    - load-test-baseline
    - load-test-full
```

---

## Best Practices

### Test Design

1. **Realistic User Behavior**
   - Use appropriate think times (3-10s)
   - Model different user types (regular, power, admin)
   - Include realistic data (varied query complexity)
   - Simulate real workflows (multi-step operations)

2. **Gradual Ramp-Up**
   - Don't start at peak load
   - Ramp up gradually (10% of duration)
   - Allow system to stabilize
   - Observe autoscaling behavior

3. **Sufficient Duration**
   - Minimum 15 minutes for baseline
   - 30+ minutes for load tests
   - 60+ minutes for stress tests
   - Include cooldown period

4. **Appropriate Load Levels**
   - Start with 50% of expected production load
   - Gradually increase to 100%, 150%, 200%
   - Don't jump directly to stress levels
   - Document your reasoning

### Environment Management

1. **Dedicated Test Environment**
   - Don't test in production (unless explicitly approved)
   - Use production-like configuration
   - Same resource limits and constraints
   - Isolated from development

2. **Clean State**
   - Clear caches before tests
   - Reset database to known state
   - Restart services if needed
   - Document starting conditions

3. **Monitoring Setup**
   - Ensure all monitoring is active
   - Configure alerts appropriately
   - Set up dashboards beforehand
   - Enable detailed logging

### Data Management

1. **Test Data**
   - Use realistic test data
   - Sufficient variety (avoid cache saturation)
   - Anonymized production data (if possible)
   - Documented and reproducible

2. **Results Storage**
   - Save all test results
   - Include environment configuration
   - Store raw and analyzed data
   - Use consistent naming (date-load-duration)

3. **Result Analysis**
   - Compare against baselines
   - Look for trends over time
   - Investigate anomalies
   - Document findings

### Communication

1. **Before Testing**
   - Notify team of testing window
   - Coordinate with ops team
   - Reserve resources if needed
   - Set expectations

2. **During Testing**
   - Monitor actively
   - Be ready to abort if issues
   - Document observations
   - Take screenshots of dashboards

3. **After Testing**
   - Share results with team
   - Summarize key findings
   - Create action items
   - Update documentation

### Continuous Improvement

1. **Regular Reviews**
   - Weekly baseline comparisons
   - Monthly trend analysis
   - Quarterly comprehensive review
   - Update targets as system evolves

2. **Automation**
   - Automate routine tests
   - Automatic threshold checking
   - Automated reporting
   - Alert on regressions

3. **Documentation**
   - Document test procedures
   - Record configuration changes
   - Maintain runbook
   - Share lessons learned

---

## Quick Reference

### Common Commands

```bash
# Locust
## Web UI
locust -f locustfile.py --web-port 8089

## Headless (50 users, 15 min)
locust -f locustfile.py --headless -u 50 -r 5 -t 15m --html report.html

## Distributed
locust -f locustfile.py --master
locust -f locustfile.py --worker --master-host=localhost

# k6
## Simple run
k6 run script.js

## With load profile
k6 run --stage 5m:50 --stage 10m:50 --stage 5m:0 script.js

## With output
k6 run --out json=results.json script.js

# Monitoring
## Watch pods
watch kubectl top pods -n voiceassist

## Watch HPA
watch kubectl get hpa -n voiceassist

## Stream logs
kubectl logs -f -l app=voiceassist-api -n voiceassist
```

### Useful Links

- **Dashboards**:
  - Load Testing: http://grafana:3000/d/voiceassist-load-testing
  - System Performance: http://grafana:3000/d/voiceassist-system-performance
  - Autoscaling: http://grafana:3000/d/voiceassist-autoscaling

- **Documentation**:
  - Performance Benchmarks: `/docs/PERFORMANCE_BENCHMARKS.md`
  - Performance Tuning: `/docs/PERFORMANCE_TUNING_GUIDE.md`

- **External Resources**:
  - Locust Docs: https://docs.locust.io/
  - k6 Docs: https://k6.io/docs/

---

## Support

For questions or issues:

1. Check the troubleshooting section
2. Review Grafana dashboards for insights
3. Check #performance Slack channel
4. Contact DevOps team
5. Create a GitHub issue

**Remember**: Load testing is an iterative process. Start small, learn, and gradually increase complexity and load levels.
