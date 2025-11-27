---
title: "Chaos Engineering"
slug: "chaos-engineering"
summary: "**Last Updated**: 2025-11-21 (Phase 7 - P3.5)"
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience: ["human"]
tags: ["chaos", "engineering"]
category: testing
---

# Chaos Engineering Guide

**Last Updated**: 2025-11-21 (Phase 7 - P3.5)
**Purpose**: Guide for running chaos experiments to validate VoiceAssist V2 resilience

---

## Overview

Chaos Engineering is the discipline of experimenting on a system to build confidence in its capability to withstand turbulent conditions in production. VoiceAssist V2 uses the **Chaos Toolkit** to systematically test resilience.

**Philosophy**: "Break things on purpose to learn how to make them more resilient."

**Benefits**:

- Discover failure modes before production incidents
- Validate graceful degradation strategies
- Build confidence in system resilience
- Improve incident response procedures

---

## Architecture

```
┌──────────────────────┐
│  Chaos Toolkit       │
│  (Experiment Runner) │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Steady State        │
│  Hypothesis          │◄──── Validate before/after
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Method              │
│  (Inject Chaos)      │◄──── Stop containers, add latency, etc.
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Rollbacks           │
│  (Restore System)    │◄──── Always restore to normal
└──────────────────────┘
```

**Components**:

1. **Steady State Hypothesis**: Define what "normal" looks like
2. **Method**: Actions and probes to inject chaos
3. **Rollbacks**: Restore system to normal state
4. **Journal**: JSON report of experiment results

---

## Setup

### 1. Install Chaos Toolkit

```bash
# Install chaos dependencies
pip install -r chaos/chaos-requirements.txt

# Verify installation
chaos --version
# Expected: chaostoolkit 1.17.1
```

### 2. Verify System is Running

```bash
# Start all services
docker compose up -d

# Verify health
curl http://localhost:8000/health
# Expected: {"status":"healthy",...}
```

### 3. Run Your First Experiment

```bash
# Run database failure experiment
./scripts/run-chaos-tests.sh database-failure

# Or run all experiments
./scripts/run-chaos-tests.sh
```

---

## Available Experiments

### 1. Database Failure (`database-failure.yaml`)

**What it tests**: PostgreSQL becomes unavailable

**Expected behavior**:

- API returns 503 Service Unavailable
- Errors are logged appropriately
- No 500 Internal Server Errors
- System recovers when database returns

**Run**:

```bash
chaos run chaos/experiments/database-failure.yaml
```

**What happens**:

1. Verifies API is healthy
2. Stops PostgreSQL container
3. Checks API responds with graceful error
4. Restarts PostgreSQL
5. Verifies full recovery

**Success criteria**:

- No crashes or panics
- Errors are logged with correlation IDs
- Health check reflects degraded state
- Recovery is automatic

---

### 2. Redis Unavailability (`redis-unavailable.yaml`)

**What it tests**: Redis cache becomes unavailable

**Expected behavior**:

- API continues to function (degraded performance)
- Cache misses are handled gracefully
- Sessions may be lost but no errors
- System recovers when Redis returns

**Run**:

```bash
chaos run chaos/experiments/redis-unavailable.yaml
```

**What happens**:

1. Verifies API serves requests
2. Stops Redis container
3. Tests API without cache
4. Verifies no crashes
5. Restarts Redis
6. Verifies cache is restored

**Success criteria**:

- API remains available
- Slower response times acceptable
- No 500 errors from cache failures
- Automatic reconnection to Redis

---

### 3. Network Latency (`network-latency.yaml`)

**What it tests**: High network latency (500ms)

**Expected behavior**:

- API responds within timeout limits
- No connection timeouts
- Increased response times acceptable
- Monitoring reflects slow responses

**Prerequisites**:

```bash
# Requires Toxiproxy for network chaos
docker compose up -d toxiproxy
```

**Run**:

```bash
chaos run chaos/experiments/network-latency.yaml
```

**What happens**:

1. Measures baseline response time
2. Injects 500ms latency via Toxiproxy
3. Verifies API still responds
4. Checks no timeouts occur
5. Removes latency
6. Verifies performance restored

**Success criteria**:

- Timeouts are appropriately configured
- Circuit breakers don't trigger unnecessarily
- Metrics show increased latency
- No request failures

---

### 4. Resource Exhaustion (`resource-exhaustion.yaml`)

**What it tests**: High CPU usage and memory pressure

**Expected behavior**:

- API slows down but remains stable
- No out-of-memory crashes
- Graceful degradation under load
- Recovery after stress removed

**Run**:

```bash
chaos run chaos/experiments/resource-exhaustion.yaml
```

**What happens**:

1. Verifies container is healthy
2. Applies CPU stress (stress-ng)
3. Tests API under load
4. Checks metrics endpoint
5. Waits for stress to complete
6. Verifies no memory leaks

**Success criteria**:

- No container restarts
- API remains responsive (slower OK)
- Memory usage returns to baseline
- No resource leaks

---

## Running Experiments

### Run Single Experiment

```bash
# Using convenience script
./scripts/run-chaos-tests.sh database-failure

# Or directly with chaos toolkit
chaos run chaos/experiments/database-failure.yaml
```

### Run All Experiments

```bash
# Runs all experiments sequentially
./scripts/run-chaos-tests.sh

# Expected output:
# ========================================
# Running: database-failure
# ========================================
# ✓ database-failure PASSED
# ...
# Passed: 4
# Failed: 0
```

### Run with Custom Configuration

```bash
# Override API URL
chaos run chaos/experiments/database-failure.yaml \
  --var api_url=http://production:8000

# Save detailed journal
chaos run chaos/experiments/redis-unavailable.yaml \
  --journal-path=./reports/redis-test.json
```

### Dry Run (No Actions)

```bash
# Show what would happen without executing
chaos run chaos/experiments/database-failure.yaml \
  --dry
```

---

## Interpreting Results

### Successful Experiment

```
[2025-11-21 12:00:00 INFO] Steady state hypothesis is met!
[2025-11-21 12:00:05 INFO] Action: stop-postgres-container succeeded
[2025-11-21 12:00:10 INFO] Probe: verify-graceful-degradation succeeded
[2025-11-21 12:00:15 INFO] Rollback: restart-postgres-container succeeded
[2025-11-21 12:00:25 INFO] Steady state hypothesis is met!
[2025-11-21 12:00:25 INFO] Experiment ended with status: completed
```

**Interpretation**: System behaved as expected under chaos.

### Failed Experiment

```
[2025-11-21 12:00:00 INFO] Steady state hypothesis is met!
[2025-11-21 12:00:05 INFO] Action: stop-postgres-container succeeded
[2025-11-21 12:00:10 ERROR] Probe: verify-graceful-degradation failed
[2025-11-21 12:00:10 ERROR] Expected status [503, 500] but got 200
[2025-11-21 12:00:15 INFO] Rollback: restart-postgres-container succeeded
[2025-11-21 12:00:25 ERROR] Experiment ended with status: failed
```

**Interpretation**: API didn't respond appropriately to database failure. Need to improve error handling.

### Reading Journal Reports

Experiment results are saved as JSON in `chaos/reports/`:

```bash
# View latest report
cat chaos/reports/database-failure-20251121-120000.json | jq .

# Check if experiment passed
cat chaos/reports/database-failure-20251121-120000.json | jq '.status'
# "completed" = passed, "failed" = failed

# See which probes failed
cat chaos/reports/database-failure-20251121-120000.json | jq '.run[].status'
```

---

## Creating New Experiments

### Experiment Template

```yaml
# chaos/experiments/my-experiment.yaml

version: 1.0.0
title: "Short Title"
description: "What are we testing?"

tags:
  - category
  - component

configuration:
  api_url: "http://localhost:8000"

steady-state-hypothesis:
  title: "System is healthy"
  probes:
    - name: "api-responds"
      type: probe
      provider:
        type: http
        url: "${api_url}/health"
        expect:
          - status: 200

method:
  - name: "inject-chaos"
    type: action
    provider:
      type: process
      path: "docker"
      arguments: ["compose", "stop", "service-name"]
    pauses:
      after: 5

  - name: "verify-behavior"
    type: probe
    provider:
      type: http
      url: "${api_url}/endpoint"
      expect:
        - status: [200, 503]

rollbacks:
  - name: "restore-system"
    type: action
    provider:
      type: process
      path: "docker"
      arguments: ["compose", "start", "service-name"]
    pauses:
      after: 10

  - name: "verify-recovery"
    type: probe
    provider:
      type: http
      url: "${api_url}/health"
      expect:
        - status: 200
```

### Common Chaos Patterns

#### Stop a Container

```yaml
- name: "stop-container"
  type: action
  provider:
    type: process
    path: "docker"
    arguments: ["compose", "stop", "container-name"]
```

#### Kill a Process

```yaml
- name: "kill-process"
  type: action
  provider:
    type: process
    path: "pkill"
    arguments: ["-9", "python"]
```

#### Fill Disk Space

```yaml
- name: "fill-disk"
  type: action
  provider:
    type: process
    path: "docker"
    arguments:
      - "compose"
      - "exec"
      - "voiceassist-server"
      - "dd"
      - "if=/dev/zero"
      - "of=/tmp/fill"
      - "bs=1M"
      - "count=1000"
```

#### Inject Network Packet Loss

```yaml
- name: "add-packet-loss"
  type: action
  provider:
    type: http
    url: "http://localhost:8474/proxies/api/toxics"
    method: POST
    body:
      type: "loss_downstream"
      attributes:
        probability: 0.3 # 30% packet loss
```

---

## Best Practices

### 1. Always Start Small

**Bad**: Test all failures simultaneously
**Good**: Test one failure mode at a time

Start with:

1. Single container failure
2. Brief network issues
3. Light resource pressure

Then progress to:

1. Multiple simultaneous failures
2. Extended outages
3. Severe resource exhaustion

### 2. Run in Isolated Environment First

**Never run chaos experiments in production without**:

- Testing in development environment
- Understanding potential impact
- Having rollback procedures
- Notifying team members

Progression:

1. Local development → 2. Staging → 3. Production (controlled)

### 3. Validate Monitoring

Every experiment should verify:

- Metrics reflect the chaos (latency spikes, error rates)
- Alerts fire appropriately
- Logs contain useful information

```yaml
- name: "verify-alert-fired"
  type: probe
  provider:
    type: http
    url: "http://localhost:9093/api/v2/alerts"
    expect:
      - json: "$.length"
        operator: gt
        value: 0
```

### 4. Document Learnings

After each experiment:

1. Document what broke
2. Identify improvements
3. Update runbooks
4. Fix issues found
5. Re-run to verify fix

### 5. Automate in CI/CD

```yaml
# .github/workflows/chaos.yml

name: Chaos Tests

on:
  schedule:
    - cron: "0 2 * * *" # Run daily at 2 AM

jobs:
  chaos:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Start services
        run: docker compose up -d
      - name: Run chaos tests
        run: ./scripts/run-chaos-tests.sh
      - name: Upload reports
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: chaos-reports
          path: chaos/reports/
```

---

## Troubleshooting

### Issue: Rollback Doesn't Restore System

**Symptoms**: System remains broken after experiment

**Solutions**:

```bash
# Manually restart all services
docker compose restart

# Check service status
docker compose ps

# View logs
docker compose logs voiceassist-server --tail=50
```

### Issue: Experiment Hangs

**Symptoms**: Chaos toolkit stops responding

**Solutions**:

```bash
# Kill chaos process
pkill -f "chaos run"

# Ensure services are running
docker compose up -d

# Check for stuck containers
docker compose ps -a
```

### Issue: False Positive Failures

**Symptoms**: Experiment fails but system is actually fine

**Root Causes**:

- Timeouts too aggressive
- Probes check wrong condition
- Timing issues (race conditions)

**Fix**:

```yaml
# Increase timeouts
provider:
  type: http
  url: "${api_url}/health"
  timeout: 30 # Longer timeout

# Add delays
pauses:
  after: 10 # Wait longer for changes to propagate
```

### Issue: Toxiproxy Not Available

**Symptoms**: `network-latency.yaml` fails with connection refused

**Solutions**:

```bash
# Start Toxiproxy
docker compose up -d toxiproxy

# Verify running
curl http://localhost:8474/version

# Configure proxy for API
curl -X POST http://localhost:8474/proxies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "voiceassist-api",
    "listen": "0.0.0.0:8001",
    "upstream": "voiceassist-server:8000"
  }'
```

---

## Advanced Topics

### Multi-Target Experiments

Test multiple failures simultaneously:

```yaml
method:
  - name: "stop-postgres-and-redis"
    type: action
    background: true # Run in parallel
    provider:
      type: process
      path: "docker"
      arguments: ["compose", "stop", "postgres", "redis"]
```

### Gradual Chaos Injection

Slowly increase chaos intensity:

```yaml
method:
  - name: "inject-10-percent-packet-loss"
    type: action
    provider:
      type: http
      url: "${toxiproxy_url}/proxies/api/toxics"
      body:
        attributes:
          probability: 0.1
    pauses:
      after: 30

  - name: "increase-to-30-percent"
    type: action
    provider:
      type: http
      url: "${toxiproxy_url}/proxies/api/toxics/packet_loss"
      method: POST
      body:
        attributes:
          probability: 0.3
```

### Production Chaos

Running in production requires:

1. **Blast Radius Limits**: Affect small percentage of traffic
2. **Business Hours Only**: Run during low-traffic periods
3. **Automated Rollback**: Stop immediately if SLOs breached
4. **Notifications**: Alert team before/during/after

```yaml
configuration:
  blast_radius: 0.01 # 1% of traffic
  max_latency_ms: 500
  max_error_rate: 0.05

steady-state-hypothesis:
  title: "SLOs are met"
  probes:
    - name: "error-rate-acceptable"
      type: probe
      provider:
        type: python
        module: custom_probes
        func: check_error_rate
        arguments:
          threshold: ${max_error_rate}
      tolerance: true
```

---

## Chaos Engineering Culture

### Principles

1. **Build a hypothesis**: What do you expect to happen?
2. **Vary real-world events**: Mimic actual failure modes
3. **Run experiments in production**: Eventually (safely)
4. **Automate experiments**: Continuous chaos
5. **Minimize blast radius**: Affect smallest scope possible

### GameDays

Regular chaos engineering exercises:

**Monthly GameDay Schedule**:

- Week 1: Database failures
- Week 2: Network issues
- Week 3: Resource exhaustion
- Week 4: Multi-component failures

**GameDay Checklist**:

- [ ] Schedule 2-hour block
- [ ] Notify all team members
- [ ] Prepare rollback procedures
- [ ] Set up monitoring dashboard
- [ ] Document observations
- [ ] Create action items for issues found

---

## Metrics and Success

### Track Resilience Over Time

```promql
# Mean Time To Recovery (MTTR)
avg(chaos_experiment_recovery_duration_seconds)

# Experiment Success Rate
sum(chaos_experiment_success_total) /
sum(chaos_experiment_total)

# Issues Found per Month
sum(increase(chaos_issues_discovered_total[30d]))
```

### Goals

- **MTTR < 5 minutes**: System recovers quickly from failures
- **Success Rate > 90%**: Most experiments pass
- **Zero Production Incidents**: From tested failure modes

---

## Related Documentation

- [Incident Response Runbook](operations/runbooks/INCIDENT_RESPONSE.md)
- [Monitoring Guide](operations/runbooks/MONITORING.md)
- [SLO Definitions](operations/SLO_DEFINITIONS.md)
- [Troubleshooting Guide](operations/runbooks/TROUBLESHOOTING.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-21
**Maintained By**: VoiceAssist SRE Team
**Review Cycle**: Monthly or after major system changes
