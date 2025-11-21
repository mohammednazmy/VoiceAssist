# K6 Load Tests for VoiceAssist Phase 10

Comprehensive load testing suite for VoiceAssist using k6 (https://k6.io/).

## Overview

This directory contains a complete suite of load tests designed to validate VoiceAssist performance, scalability, and reliability under various conditions.

## Test Files

### Configuration & Utilities

- **config.js** - Shared configuration (URLs, thresholds, test data)
- **utils.js** - Utility functions (auth, requests, metrics, scenarios)

### Test Scripts

1. **01-smoke-test.js** - Basic smoke test
   - **Purpose**: Verify all endpoints respond correctly
   - **Load**: 5 VUs for 1 minute
   - **Use**: Quick validation after deployments
   - **Run**: `k6 run 01-smoke-test.js`

2. **02-load-test.js** - Standard load test
   - **Purpose**: Evaluate performance under normal conditions
   - **Load**: 0→100→0 VUs over 9 minutes
   - **Use**: Regular performance benchmarking
   - **Run**: `k6 run 02-load-test.js`

3. **03-stress-test.js** - Stress test
   - **Purpose**: Find system breaking points
   - **Load**: 0→500 VUs over 22 minutes
   - **Use**: Capacity planning and bottleneck identification
   - **Run**: `k6 run 03-stress-test.js`

4. **04-spike-test.js** - Spike test
   - **Purpose**: Test auto-scaling and spike handling
   - **Load**: 50→500→50 VUs over 8 minutes
   - **Use**: Validate auto-scaling and circuit breakers
   - **Run**: `k6 run 04-spike-test.js`

5. **05-endurance-test.js** - Endurance/soak test
   - **Purpose**: Detect memory leaks and stability issues
   - **Load**: 100 constant VUs for 30 minutes
   - **Use**: Long-term stability validation
   - **Run**: `k6 run 05-endurance-test.js`

6. **06-api-scenarios.js** - Realistic API scenarios
   - **Purpose**: Test complete user journeys
   - **Load**: 50 VUs (mixed scenarios) for 10 minutes
   - **Use**: Validate user workflows
   - **Run**: `k6 run 06-api-scenarios.js`

7. **07-websocket-test.js** - WebSocket load test
   - **Purpose**: Test real-time WebSocket connections
   - **Load**: 0→50 connections over 5 minutes
   - **Use**: Validate voice mode performance
   - **Run**: `k6 run 07-websocket-test.js`

## Prerequisites

### Install K6

**macOS (Homebrew)**:
```bash
brew install k6
```

**Linux**:
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Windows (Chocolatey)**:
```powershell
choco install k6
```

**Docker**:
```bash
docker pull grafana/k6
```

### Verify Installation
```bash
k6 version
```

## Quick Start

### 1. Configure Base URL

Edit `config.js` or set environment variable:
```bash
export BASE_URL=http://localhost:8000
export WS_URL=ws://localhost:8000
```

### 2. Run Smoke Test

```bash
cd load-tests/k6
k6 run 01-smoke-test.js
```

### 3. Run Full Test Suite

```bash
# Run all tests sequentially
./run-all-tests.sh

# Or run individual tests
k6 run 02-load-test.js
k6 run 03-stress-test.js
```

## Running Tests

### Basic Usage

```bash
# Run a test
k6 run 02-load-test.js

# Run with custom base URL
k6 run --env BASE_URL=https://api.voiceassist.com 02-load-test.js

# Run with increased VUs
k6 run --vus 200 02-load-test.js

# Run with custom duration
k6 run --duration 10m 01-smoke-test.js
```

### Advanced Options

```bash
# Export results to JSON
k6 run --out json=results.json 02-load-test.js

# Export to InfluxDB (for Grafana)
k6 run --out influxdb=http://localhost:8086/k6 02-load-test.js

# Run with custom tags
k6 run --tag environment=production --tag version=1.0 02-load-test.js

# Run with quiet output
k6 run --quiet 01-smoke-test.js

# Run in cloud (k6 Cloud)
k6 cloud 02-load-test.js
```

### Docker Usage

```bash
# Run test in Docker
docker run --rm -i grafana/k6 run - < 01-smoke-test.js

# With volume mount
docker run --rm -v $(pwd):/scripts grafana/k6 run /scripts/02-load-test.js

# With custom environment
docker run --rm -e BASE_URL=http://host.docker.internal:8000 \
  -v $(pwd):/scripts grafana/k6 run /scripts/02-load-test.js
```

## Test Results

Results are saved to `../results/` directory:

- `smoke-test-summary.json` - Smoke test summary
- `load-test-summary.json` - Load test summary
- `load-test-full.json` - Full load test data
- `stress-test-summary.json` - Stress test summary
- `spike-test-summary.json` - Spike test summary
- `endurance-test-summary.json` - Endurance test summary
- `api-scenarios-summary.json` - API scenarios summary
- `websocket-test-summary.json` - WebSocket test summary

### Viewing Results

```bash
# View JSON summary
cat ../results/load-test-summary.json | jq .

# View specific metrics
cat ../results/load-test-summary.json | jq '.http_req_duration'

# View recommendations
cat ../results/stress-test-summary.json | jq '.recommendations'
```

## Thresholds

Each test defines specific thresholds that must pass:

### Smoke Test (Strict)
- P95 response time < 500ms
- P99 response time < 1000ms
- Error rate < 1%

### Load Test (Balanced)
- P95 response time < 800ms
- P99 response time < 1500ms
- Error rate < 5%

### Stress Test (Relaxed)
- P95 response time < 2000ms
- P99 response time < 5000ms
- Error rate < 10%

### Spike Test
- P95 response time < 1500ms
- P99 response time < 3000ms
- Error rate < 15%

### Endurance Test (Stability)
- P95 response time < 1000ms
- P99 response time < 2000ms
- Error rate < 5%
- No performance degradation over time

### WebSocket Test
- Connection time P95 < 1000ms
- Message latency P95 < 200ms
- Minimum 100 messages sent/received
- Error rate < 1%

## Monitoring

### What to Monitor During Tests

1. **System Resources**:
   - CPU usage
   - Memory usage
   - Disk I/O
   - Network bandwidth

2. **Application Metrics**:
   - Request rate
   - Response times
   - Error rates
   - Active connections

3. **Database**:
   - Connection pool usage
   - Query performance
   - Lock contention
   - Cache hit rates

4. **Dependencies**:
   - Redis operations
   - Qdrant queries
   - External API calls

### Grafana Dashboards

Monitor tests in real-time using Grafana:

1. Start InfluxDB and Grafana:
   ```bash
   docker-compose up -d influxdb grafana
   ```

2. Configure k6 to export to InfluxDB:
   ```bash
   k6 run --out influxdb=http://localhost:8086/k6 02-load-test.js
   ```

3. Open Grafana: http://localhost:3000
4. Import k6 dashboard (ID: 2587)

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Load Tests

on:
  schedule:
    - cron: '0 2 * * *'  # Run daily at 2 AM
  workflow_dispatch:

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install k6
        run: |
          sudo gpg -k
          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install k6

      - name: Run smoke test
        run: k6 run load-tests/k6/01-smoke-test.js
        env:
          BASE_URL: ${{ secrets.STAGING_URL }}

      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: load-test-results
          path: load-tests/results/
```

## Troubleshooting

### Common Issues

1. **Connection refused**
   - Ensure VoiceAssist server is running
   - Check BASE_URL configuration
   - Verify firewall settings

2. **High error rates**
   - Check server logs
   - Monitor resource usage
   - Review database connections

3. **Timeout errors**
   - Increase timeout in config.js
   - Check network latency
   - Review slow queries

4. **WebSocket failures**
   - Verify WebSocket support in load balancer
   - Check connection limits
   - Review proxy configuration

### Debug Mode

Run tests with debug output:
```bash
k6 run --http-debug 01-smoke-test.js
```

## Best Practices

1. **Always run smoke tests first** before load/stress tests
2. **Monitor resources** during all tests
3. **Run tests against staging** environment first
4. **Gradually increase load** - don't jump straight to stress tests
5. **Document baseline metrics** for comparison
6. **Review results thoroughly** - don't just look at pass/fail
7. **Schedule regular tests** - weekly or after major changes
8. **Keep tests updated** as API evolves

## Test Schedule Recommendations

- **Smoke tests**: After every deployment
- **Load tests**: Daily or weekly
- **Stress tests**: Weekly or before major releases
- **Spike tests**: Before traffic events (launches, marketing)
- **Endurance tests**: Weekly or monthly
- **API scenarios**: After feature changes

## Performance Targets

Based on VoiceAssist requirements:

| Metric | Target | Threshold |
|--------|--------|-----------|
| Health check | < 100ms | < 200ms |
| Simple query | < 500ms | < 1000ms |
| Complex query | < 2000ms | < 5000ms |
| Admin operations | < 300ms | < 600ms |
| WebSocket connection | < 500ms | < 1000ms |
| Message latency | < 50ms | < 200ms |
| Error rate | < 0.1% | < 1% |
| Concurrent users | 100 | 500 |

## Support

For issues or questions:
- Review test logs and summaries
- Check Grafana dashboards
- Review server logs
- Consult k6 documentation: https://k6.io/docs/

## License

Part of VoiceAssist project.
