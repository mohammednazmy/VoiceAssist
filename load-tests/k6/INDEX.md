# VoiceAssist K6 Load Tests - Documentation Index

## Start Here

New to k6 load testing? Start with these files in order:

1. **QUICK_REFERENCE.md** (6.3 KB) - Quick commands and reference
2. **README.md** (9.4 KB) - Complete usage guide
3. **EXAMPLES.md** (10 KB) - Practical examples
4. **SUMMARY.md** (11 KB) - Comprehensive overview

## Test Scripts

Run these in order for progressive testing:

1. **01-smoke-test.js** (3.1 KB)
   - Duration: 1 minute
   - Purpose: Basic validation
   - Command: `k6 run 01-smoke-test.js`

2. **02-load-test.js** (5.8 KB)
   - Duration: 9 minutes
   - Purpose: Normal load testing
   - Command: `k6 run 02-load-test.js`

3. **03-stress-test.js** (7.6 KB)
   - Duration: 22 minutes
   - Purpose: Find breaking points
   - Command: `k6 run 03-stress-test.js`

4. **04-spike-test.js** (10 KB)
   - Duration: 8 minutes
   - Purpose: Test auto-scaling
   - Command: `k6 run 04-spike-test.js`

5. **05-endurance-test.js** (13 KB)
   - Duration: 30 minutes
   - Purpose: Detect memory leaks
   - Command: `k6 run 05-endurance-test.js`

6. **06-api-scenarios.js** (14 KB)
   - Duration: 10 minutes
   - Purpose: User journey testing
   - Command: `k6 run 06-api-scenarios.js`

7. **07-websocket-test.js** (12 KB)
   - Duration: 5 minutes
   - Purpose: Real-time testing
   - Command: `k6 run 07-websocket-test.js`

## Configuration Files

- **config.js** (5.9 KB) - Shared configuration
- **utils.js** (11 KB) - Helper functions

## Automation Scripts

- **run-quick-test.sh** (2.9 KB) - Run smoke + load test (10 min)
- **run-all-tests.sh** (6.4 KB) - Run all tests (85 min)

## Documentation Files

1. **INDEX.md** (This file) - Documentation index
2. **QUICK_REFERENCE.md** - Quick commands and reference
3. **README.md** - Complete usage guide
4. **EXAMPLES.md** - Practical examples and integrations
5. **SUMMARY.md** - Comprehensive project overview

## Quick Start Guide

### 1. Install k6

```bash
# macOS
brew install k6

# Verify
k6 version
```

### 2. Run Quick Test

```bash
cd load-tests/k6
./run-quick-test.sh
```

### 3. View Results

```bash
cat ../results/smoke-test-summary.json | jq .
cat ../results/load-test-summary.json | jq .
```

## File Purpose Matrix

| File                 | Type   | Purpose       | When to Use           |
| -------------------- | ------ | ------------- | --------------------- |
| INDEX.md             | Doc    | Navigation    | Start here            |
| QUICK_REFERENCE.md   | Doc    | Quick lookup  | Need quick command    |
| README.md            | Doc    | Full guide    | Learning k6 tests     |
| EXAMPLES.md          | Doc    | Examples      | Need specific example |
| SUMMARY.md           | Doc    | Overview      | Understanding project |
| config.js            | Code   | Configuration | Customize settings    |
| utils.js             | Code   | Utilities     | Understand helpers    |
| 01-smoke-test.js     | Test   | Validation    | After deployment      |
| 02-load-test.js      | Test   | Performance   | Daily/weekly          |
| 03-stress-test.js    | Test   | Capacity      | Before scaling        |
| 04-spike-test.js     | Test   | Auto-scale    | Before events         |
| 05-endurance-test.js | Test   | Stability     | Weekly                |
| 06-api-scenarios.js  | Test   | Workflows     | After features        |
| 07-websocket-test.js | Test   | Real-time     | After voice changes   |
| run-quick-test.sh    | Script | Quick run     | Quick validation      |
| run-all-tests.sh     | Script | Full run      | Complete testing      |

## Common Tasks

### I want to...

**...validate after deployment**
→ Run: `k6 run 01-smoke-test.js` (1 min)

**...test normal performance**
→ Run: `k6 run 02-load-test.js` (9 min)

**...find capacity limits**
→ Run: `k6 run 03-stress-test.js` (22 min)

**...test auto-scaling**
→ Run: `k6 run 04-spike-test.js` (8 min)

**...check for memory leaks**
→ Run: `k6 run 05-endurance-test.js` (30 min)

**...test user workflows**
→ Run: `k6 run 06-api-scenarios.js` (10 min)

**...test WebSocket/voice**
→ Run: `k6 run 07-websocket-test.js` (5 min)

**...run all tests**
→ Run: `./run-all-tests.sh` (85 min)

**...quick validation**
→ Run: `./run-quick-test.sh` (10 min)

**...learn k6 basics**
→ Read: `README.md`

**...see examples**
→ Read: `EXAMPLES.md`

**...quick command lookup**
→ Read: `QUICK_REFERENCE.md`

**...understand the project**
→ Read: `SUMMARY.md`

**...customize tests**
→ Edit: `config.js` and test files

**...add new helpers**
→ Edit: `utils.js`

**...integrate with CI/CD**
→ See: `EXAMPLES.md` (Integration section)

**...monitor with Grafana**
→ See: `README.md` (Monitoring section)

**...troubleshoot issues**
→ See: `README.md` (Troubleshooting) or `EXAMPLES.md` (Troubleshooting)

## Test Results

All results are saved to: `../results/`

Summary files:

- `smoke-test-summary.json`
- `load-test-summary.json`
- `stress-test-summary.json`
- `spike-test-summary.json`
- `endurance-test-summary.json`
- `api-scenarios-summary.json`
- `websocket-test-summary.json`

Full results:

- `*-full.json` (detailed metrics)

View results:

```bash
# Summary
cat ../results/load-test-summary.json | jq .

# Recommendations
cat ../results/stress-test-summary.json | jq '.recommendations'

# Specific metric
cat ../results/load-test-summary.json | jq '.http_req_duration.p95'
```

## Architecture

```
VoiceAssist Load Tests
├── Configuration Layer
│   ├── config.js          (URLs, thresholds, scenarios)
│   └── utils.js           (Helpers, metrics, scenarios)
│
├── Test Layer
│   ├── 01-smoke-test.js   (Basic validation)
│   ├── 02-load-test.js    (Normal load)
│   ├── 03-stress-test.js  (Breaking point)
│   ├── 04-spike-test.js   (Auto-scaling)
│   ├── 05-endurance-test.js (Stability)
│   ├── 06-api-scenarios.js  (Workflows)
│   └── 07-websocket-test.js (Real-time)
│
├── Automation Layer
│   ├── run-quick-test.sh  (Quick validation)
│   └── run-all-tests.sh   (Full suite)
│
├── Documentation Layer
│   ├── INDEX.md           (This file)
│   ├── QUICK_REFERENCE.md (Quick lookup)
│   ├── README.md          (Full guide)
│   ├── EXAMPLES.md        (Practical examples)
│   └── SUMMARY.md         (Overview)
│
└── Results Layer
    └── ../results/        (Test outputs)
```

## Test Flow

```
1. Install k6
   ↓
2. Configure BASE_URL (optional)
   ↓
3. Run smoke test (validate)
   ↓
4. If passed → Run load test
   ↓
5. If needed → Run stress/spike/endurance
   ↓
6. Review results
   ↓
7. Implement recommendations
   ↓
8. Re-test
```

## Success Criteria

Your tests are successful if:

- [ ] Smoke test passes (all endpoints respond)
- [ ] Load test P95 < 800ms
- [ ] Stress test identifies breaking point
- [ ] Spike test shows good recovery
- [ ] Endurance test shows no degradation
- [ ] API scenarios complete successfully
- [ ] WebSocket latency < 200ms
- [ ] Error rates meet thresholds
- [ ] No critical issues in recommendations

## Getting Help

1. **Quick question?** → Check `QUICK_REFERENCE.md`
2. **Need example?** → Check `EXAMPLES.md`
3. **Learning?** → Read `README.md`
4. **Understanding project?** → Read `SUMMARY.md`
5. **Troubleshooting?** → Check `README.md` or `EXAMPLES.md` troubleshooting sections
6. **k6 specific?** → Visit https://k6.io/docs/

## Project Statistics

- **Total Files**: 15
- **Total Lines**: ~4,860
- **Test Scripts**: 7
- **Configuration Files**: 2
- **Documentation Files**: 5
- **Automation Scripts**: 2
- **Test Coverage**: Complete (all endpoints, all load types)
- **Total Test Time**: ~85 minutes (all tests)
- **Quick Test Time**: ~10 minutes (smoke + load)

## Version History

- **v1.0** (2025-11) - Initial comprehensive test suite
  - 7 test types
  - Complete documentation
  - Automation scripts
  - CI/CD examples

## Next Steps

1. Run quick test: `./run-quick-test.sh`
2. Review results in `../results/`
3. If all pass, schedule regular runs
4. Integrate with CI/CD (see `EXAMPLES.md`)
5. Set up Grafana monitoring (see `README.md`)
6. Create alerts based on thresholds
7. Document baseline metrics

---

**Quick Start**: `./run-quick-test.sh`
**Need Help?**: Start with `QUICK_REFERENCE.md`
**Full Guide**: Read `README.md`
