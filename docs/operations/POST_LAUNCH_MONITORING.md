---
title: Post-Launch Monitoring Guide
slug: operations/post-launch-monitoring
summary: >-
  Monitoring checklist and procedures for the VoiceAssist Voice Mode enhancement
  launch, including Epic FHIR integration monitoring.
status: stable
stability: production
owner: sre
lastUpdated: "2025-12-04"
audience:
  - human
  - agent
  - sre
  - backend
  - ai-agents
tags:
  - monitoring
  - post-launch
  - operations
  - fhir
  - voice-mode
category: operations
relatedServices:
  - api-gateway
ai_summary: >-
  This guide covers monitoring procedures for the VoiceAssist Voice Mode
  enhancement (Phases 1-10 + Epic FHIR Phase 6b/7) following the December 2025
  launch. --- curl http://localhost:5057/health curl
  http://localhost:5057/health/epic curl
  http://localhost:5057/api/admin/provider-status curl http:/...
---

# Post-Launch Monitoring Guide

## Overview

This guide covers monitoring procedures for the VoiceAssist Voice Mode enhancement (Phases 1-10 + Epic FHIR Phase 6b/7) following the December 2025 launch.

---

## Daily Monitoring Checklist

### 1. Service Health

```bash
# Check all service endpoints
curl http://localhost:5057/health
curl http://localhost:5057/health/epic
curl http://localhost:5057/api/admin/provider-status

# Check circuit breaker state
curl http://localhost:5057/api/admin/epic/status | jq '.circuit_breaker.state'
```

**Expected Values:**

- Health: `{"status": "healthy"}`
- Epic Health: `{"status": "healthy", "fallback_active": false}`
- Circuit State: `"closed"`

### 2. FHIR Write Operations

```bash
# Check write operation metrics
curl http://localhost:5057/api/admin/metrics/epic | jq '{
  write_requests: .write_requests,
  write_success_rate: .write_success_rate,
  avg_write_latency_ms: .avg_write_latency_ms
}'
```

**Alert Thresholds:**
| Metric | Warning | Critical |
|--------|---------|----------|
| Write Success Rate | < 99% | < 95% |
| Avg Write Latency | > 1000ms | > 2000ms |
| Failed Writes (24h) | > 5 | > 20 |

### 3. Audit Log Verification

```bash
# Check recent EHR write events
curl "http://localhost:5057/api/admin/audit/events?event_type_prefix=ehr.&limit=10"

# Verify no write failures in last hour
curl "http://localhost:5057/api/admin/audit/events?event_type=ehr.write_failed&since=1h" | jq '.count'
```

### 4. Voice Pipeline Health

```bash
# Check emotion detection service
curl http://localhost:5057/health/emotion

# Check backchannel service
curl http://localhost:5057/health/backchannel

# Check active voice sessions
curl http://localhost:5057/api/admin/voice/sessions | jq '.active_count'
```

---

## Weekly Review Tasks

### 1. Performance Analysis

- Review P95/P99 latency trends in Grafana
- Check for latency degradation patterns
- Analyze voice session duration and quality metrics

### 2. Chaos Engineering Verification

```python
# Run weekly chaos experiment (non-production only)
from app.testing import get_chaos_controller, create_network_degradation_experiment

chaos = get_chaos_controller()
if os.getenv("ENVIRONMENT") != "production":
    experiment = create_network_degradation_experiment(duration_seconds=300)
    results = await chaos.run_experiment(experiment.id)
    print(f"Chaos test results: {results}")
```

### 3. Audit Log Review

- Export weekly audit summary
- Review any EHR conflict detections
- Verify accounting of disclosures is generating correctly

---

## Alert Response Procedures

### Circuit Breaker OPEN

1. Check Epic status page for known outages
2. Review recent error logs: `grep "epic" /var/log/voiceassist/api.log | tail -100`
3. If Epic is healthy, investigate connection issues
4. Wait for automatic recovery (60s timeout) or manual reset

### High Write Failure Rate

1. Check audit logs for failure patterns
2. Review FHIR resource validation errors
3. Check credential expiration
4. Escalate if >10 failures in 1 hour

### Voice Pipeline Degradation

1. Check Deepgram/Hume AI service status
2. Review emotion detection latency
3. Check for memory pressure on voice sessions
4. Restart affected services if needed

---

## Feedback Collection

### User Feedback Endpoints

```bash
# Submit feedback (from frontend)
POST /api/feedback
{
  "session_id": "...",
  "rating": 4,
  "category": "voice_quality",
  "comments": "..."
}

# Get feedback summary
GET /api/admin/feedback/summary?days=7
```

### Metrics to Track

| Category           | Metric                 | Target    |
| ------------------ | ---------------------- | --------- |
| Voice Quality      | User rating            | > 4.0/5.0 |
| EHR Integration    | Order success rate     | > 99%     |
| Dictation          | Transcription accuracy | > 95%     |
| Emotion Detection  | Detection confidence   | > 0.7     |
| Clinical Reasoning | Suggestion acceptance  | > 60%     |

### Weekly Feedback Review

1. Export feedback data: `GET /api/admin/feedback/export?format=csv&days=7`
2. Categorize by feature area
3. Identify patterns and recurring issues
4. Prioritize improvements for next sprint

---

## Escalation Contacts

| Issue Type       | Primary Contact         | Escalation                |
| ---------------- | ----------------------- | ------------------------- |
| Epic FHIR Issues | oncall@voiceassist.io   | epic-support@example.com  |
| Voice Pipeline   | oncall@voiceassist.io   | ai-team@voiceassist.io    |
| Security/PHI     | security@voiceassist.io | compliance@voiceassist.io |
| Infrastructure   | oncall@voiceassist.io   | infra-team@voiceassist.io |

---

## Related Documentation

- [Epic FHIR Runbook](epic-fhir-runbook.md)
- [Voice Mode Enhancement](../VOICE_MODE_ENHANCEMENT_10_PHASE.md)
- [Chaos Engineering Guide](../CHAOS_ENGINEERING.md)
- [Operations Overview](./OPERATIONS_OVERVIEW.md)
