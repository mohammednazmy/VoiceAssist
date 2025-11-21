# K6 Load Tests - Quick Reference Card

## Installation
```bash
# macOS
brew install k6

# Linux
curl https://github.com/grafana/k6/releases/download/v0.47.0/k6-v0.47.0-linux-amd64.tar.gz -L | tar xvz
sudo mv k6-v0.47.0-linux-amd64/k6 /usr/local/bin/

# Verify
k6 version
```

## Quick Commands

### Run Tests
```bash
# Quick validation (10 min)
./run-quick-test.sh

# Full suite (85 min)
./run-all-tests.sh

# Individual tests
k6 run 01-smoke-test.js      # 1 min  - Basic validation
k6 run 02-load-test.js       # 9 min  - Normal load
k6 run 03-stress-test.js     # 22 min - Breaking point
k6 run 04-spike-test.js      # 8 min  - Auto-scaling
k6 run 05-endurance-test.js  # 30 min - Stability
k6 run 06-api-scenarios.js   # 10 min - User journeys
k6 run 07-websocket-test.js  # 5 min  - Real-time
```

### Custom URL
```bash
k6 run --env BASE_URL=https://api.example.com 02-load-test.js
```

### View Results
```bash
# Summary
cat ../results/load-test-summary.json | jq .

# Specific metrics
cat ../results/load-test-summary.json | jq '.http_req_duration'
cat ../results/stress-test-summary.json | jq '.recommendations'

# All results
ls -la ../results/
```

## Test Matrix

| Test | VUs | Duration | P95 Target | Error Target | When |
|------|-----|----------|------------|--------------|------|
| Smoke | 5 | 1m | <500ms | <1% | Every deploy |
| Load | 0-100 | 9m | <800ms | <5% | Daily |
| Stress | 0-500 | 22m | <2000ms | <10% | Weekly |
| Spike | 50-500-50 | 8m | <1500ms | <15% | Pre-event |
| Endurance | 100 | 30m | <1000ms | <5% | Weekly |
| Scenarios | 50 | 10m | <1000ms | <5% | Post-feature |
| WebSocket | 0-50 | 5m | <200ms* | <1% | Post-voice |

*WebSocket P95 is for message latency

## File Structure
```
load-tests/k6/
├── config.js                # Shared config
├── utils.js                 # Helper functions
├── 01-smoke-test.js         # Smoke test
├── 02-load-test.js          # Load test
├── 03-stress-test.js        # Stress test
├── 04-spike-test.js         # Spike test
├── 05-endurance-test.js     # Endurance test
├── 06-api-scenarios.js      # API scenarios
├── 07-websocket-test.js     # WebSocket test
├── run-all-tests.sh         # Run all tests
├── run-quick-test.sh        # Quick validation
├── README.md                # Full documentation
├── EXAMPLES.md              # Usage examples
├── SUMMARY.md               # Complete summary
└── QUICK_REFERENCE.md       # This file

../results/                   # Test results (auto-created)
```

## Common Options
```bash
# Custom VUs
k6 run --vus 50 02-load-test.js

# Custom duration
k6 run --duration 10m 01-smoke-test.js

# Export to JSON
k6 run --out json=results.json 02-load-test.js

# Export to InfluxDB
k6 run --out influxdb=http://localhost:8086/k6 02-load-test.js

# Quiet mode
k6 run --quiet 01-smoke-test.js

# Debug mode
k6 run --http-debug 01-smoke-test.js
```

## Thresholds

### Smoke Test (Strict)
- P95: <500ms, P99: <1000ms
- Errors: <1%
- Rate: >1 req/s

### Load Test (Balanced)
- P95: <800ms, P99: <1500ms
- Errors: <5%
- Rate: >10 req/s

### Stress Test (Relaxed)
- P95: <2000ms, P99: <5000ms
- Errors: <10%
- Rate: >50 req/s

### WebSocket
- Connect: <1000ms
- Latency: <200ms
- Messages: >100 sent/received

## Environment Variables
```bash
# Set base URL
export BASE_URL=http://localhost:8000
export WS_URL=ws://localhost:8000

# Or inline
k6 run --env BASE_URL=http://localhost:8000 02-load-test.js
```

## Troubleshooting

### Connection Refused
```bash
# Check server
curl http://localhost:8000/health

# Verify config
cat config.js | grep BASE_URL
```

### High Errors
```bash
# Check server logs
docker-compose logs -f voiceassist-server

# Monitor resources
docker stats
```

### Timeouts
```javascript
// Edit config.js
TIMEOUTS: {
  http: 60000,      // Increase
  websocket: 120000
}
```

## Integration

### Docker
```bash
docker run --rm -v $(pwd):/scripts \
  -e BASE_URL=http://host.docker.internal:8000 \
  grafana/k6 run /scripts/02-load-test.js
```

### CI/CD (GitHub Actions)
```yaml
- name: Run smoke test
  run: k6 run load-tests/k6/01-smoke-test.js
  env:
    BASE_URL: ${{ secrets.STAGING_URL }}
```

## Monitoring Setup
```bash
# Start monitoring stack
docker-compose up -d influxdb grafana

# Run test with monitoring
k6 run --out influxdb=http://localhost:8086/k6 02-load-test.js

# View in Grafana
open http://localhost:3000
# Import dashboard: 2587
```

## Performance Targets

| Endpoint | Target | Threshold |
|----------|--------|-----------|
| /health | <100ms | <200ms |
| /api/chat/message | <500ms | <1000ms |
| /api/admin/kb/documents | <300ms | <600ms |
| WebSocket connect | <500ms | <1000ms |
| WebSocket message | <50ms | <200ms |

## Test Schedule

| Day | Test |
|-----|------|
| Every deploy | Smoke |
| Daily | Load |
| Monday | Endurance |
| Wednesday | Stress |
| Friday | Full suite |
| Pre-event | Spike |
| Post-feature | Scenarios |

## Grading System

Tests provide automatic grading (A-D):
- **A**: Excellent performance
- **B**: Good performance, minor issues
- **C**: Acceptable but needs improvement
- **D**: Poor performance, action required

View grades:
```bash
cat ../results/stress-test-summary.json | jq '.breaking_point_analysis'
cat ../results/spike-test-summary.json | jq '.spike_analysis'
```

## Key Metrics

### HTTP Metrics
- `http_req_duration` - Request duration
- `http_req_failed` - Error rate
- `http_reqs` - Request rate
- `iterations` - Completed iterations
- `vus` - Active virtual users

### Custom Metrics
- `sessions_created` - New sessions
- `messages_sent` - Chat messages sent
- `query_errors` - Query failures
- `ws_message_latency` - WebSocket latency

### View Metrics
```bash
# All metrics
cat ../results/load-test-full.json | jq '.metrics | keys'

# Specific metric
cat ../results/load-test-summary.json | jq '.http_req_duration.p95'
```

## Help Resources

- **Full docs**: `cat README.md`
- **Examples**: `cat EXAMPLES.md`
- **Summary**: `cat SUMMARY.md`
- **k6 docs**: https://k6.io/docs/
- **k6 examples**: https://k6.io/docs/examples/

## Support Checklist

- [ ] k6 installed and working
- [ ] VoiceAssist server running
- [ ] BASE_URL configured correctly
- [ ] Results directory created
- [ ] Smoke test passes
- [ ] Monitoring setup (optional)
- [ ] CI/CD integrated (optional)

---

**Quick Start**: `./run-quick-test.sh`
**Full Suite**: `./run-all-tests.sh`
**Help**: `cat README.md`
