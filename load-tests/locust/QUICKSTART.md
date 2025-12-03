# Locust Load Testing - Quick Start Guide

Get started with VoiceAssist load testing in 5 minutes!

## Prerequisites Check

```bash
# Check Python version (need 3.8+)
python --version

# Check if VoiceAssist is running
curl http://localhost:8000/health
```

## Step 1: Install Dependencies

```bash
# Navigate to locust directory
cd load-tests/locust

# Install dependencies
pip install -r requirements.txt

# Verify installation
locust --version
```

## Step 2: Run Your First Test

### Option A: Web UI (Interactive)

```bash
# Start Locust web interface
./run-tests.sh web

# Or use make
make web
```

Then:

1. Open browser: http://localhost:8089
2. Set number of users: 10
3. Set spawn rate: 2
4. Click "Start swarming"
5. Watch live metrics!

### Option B: Headless (Automated)

```bash
# Run smoke test (quick validation)
./run-tests.sh smoke

# Or use make
make smoke
```

Results will be saved to `../results/locust/`

## Step 3: View Results

```bash
# View latest HTML report
make latest-report

# Or manually
open ../results/locust/smoke_test_*.html

# Analyze CSV results
python analyze_results.py ../results/locust/smoke_test_*_stats.csv
```

## Next Steps

### Try Different Test Scenarios

```bash
# Load test (100 users, 10 minutes)
make load

# User journey (complete flow)
make user-journey

# Admin workflow (document management)
make admin-workflow
```

### Customize Tests

Edit `config.py` to customize:

- Test users
- Sample queries
- Performance thresholds
- Task weights

### Advanced: Distributed Testing

For high-scale testing (1000+ users):

```bash
# Start distributed Locust with Docker
make distributed

# Access web UI: http://localhost:8089

# Stop when done
make stop-distributed
```

## Common Commands

```bash
# Show all available commands
make help
./run-tests.sh help

# Check if VoiceAssist is running
make check

# Clean results
make clean

# View logs (distributed mode)
make logs
```

## Troubleshooting

### "Locust not found"

```bash
pip install -r requirements.txt
```

### "Connection refused"

```bash
# Start VoiceAssist
cd ../..
docker-compose up -d
```

### "Too many authentication failures"

```bash
# Test users will be auto-registered on first run
# Just retry the test
```

### "High failure rate"

```bash
# Check VoiceAssist logs
docker-compose logs voiceassist-server

# Reduce number of users
./run-tests.sh smoke --users=5
```

## Performance Targets

Expected performance (healthy system):

- Login: < 1 second
- Chat query: < 3 seconds
- Health check: < 500ms
- Failure rate: < 5%

## Test Types Overview

| Test   | Users | Duration | Purpose             |
| ------ | ----- | -------- | ------------------- |
| Smoke  | 10    | 2 min    | Quick validation    |
| Load   | 100   | 10 min   | Performance testing |
| Stress | 500   | 15 min   | Find limits         |
| Spike  | 1000  | 5 min    | Test scaling        |
| Soak   | 100   | 60 min   | Stability test      |

## Need Help?

1. Check README.md for detailed documentation
2. View logs: `docker-compose logs -f`
3. Check configuration: `make validate`
4. Open GitHub issue with test output

Happy load testing! 🚀
