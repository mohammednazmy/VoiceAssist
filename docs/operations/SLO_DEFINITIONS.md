---
title: Service Level Objectives (SLOs)
slug: operations/slo-definitions
summary: Reliability targets balancing user expectations with engineering effort.
status: stable
stability: production
owner: sre
lastUpdated: "2025-11-27"
audience: ["devops", "backend", "admin"]
tags: ["slo", "reliability", "metrics", "operations"]
relatedServices: ["api-gateway"]
version: "1.0.0"
---

# Service Level Objectives (SLOs) - VoiceAssist V2

**Version:** 1.0
**Last Updated:** 2025-11-27
**Owner:** Platform Engineering Team

## Overview

This document defines the Service Level Objectives (SLOs) for VoiceAssist V2. SLOs are reliability targets that balance user expectations with engineering effort.

### SLO Framework

- **SLI (Service Level Indicator)**: Quantitative measure of service behavior (e.g., request latency, error rate)
- **SLO (Service Level Objective)**: Target value or range for an SLI (e.g., 99.9% availability)
- **SLA (Service Level Agreement)**: Customer-facing commitment with consequences (not defined yet for internal MVP)

### Error Budget

An error budget is the maximum allowed unreliability before violating an SLO. For a 99.9% availability target over 30 days:

- **Allowed downtime**: 43.2 minutes/month
- **Allowed errors**: 0.1% of requests

## Core SLOs

### 1. API Availability SLO

**Objective:** API endpoints should be available and responsive

| Metric       | Target | Measurement Window | Error Budget   |
| ------------ | ------ | ------------------ | -------------- |
| Availability | 99.9%  | 30 days            | 43.2 min/month |
| Success Rate | 99.5%  | 30 days            | 0.5% errors    |

**SLI Definition:**

```promql
# Availability: Percentage of requests returning 2xx/3xx status
sum(rate(http_requests_total{status_code=~"2..|3.."}[5m]))
/
sum(rate(http_requests_total[5m]))

# Success Rate: Percentage of requests not returning 5xx errors
1 - (
  sum(rate(http_requests_total{status_code=~"5.."}[5m]))
  /
  sum(rate(http_requests_total[5m]))
)
```

**Rationale:**

- 99.9% availability is industry standard for non-critical services
- Allows for planned maintenance and incident recovery
- Balances reliability with development velocity

**Exclusions:**

- Planned maintenance windows (announced 48h in advance)
- User errors (4xx responses except 429 rate limiting)
- External service failures (OpenAI, Nextcloud) beyond our control

---

### 2. API Latency SLO

**Objective:** API requests should complete quickly

| Percentile   | Target   | Measurement Window |
| ------------ | -------- | ------------------ |
| P50 (median) | < 200ms  | 5 minutes          |
| P95          | < 500ms  | 5 minutes          |
| P99          | < 1000ms | 5 minutes          |

**SLI Definition:**

```promql
# P95 latency
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, endpoint)
)

# P99 latency
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, endpoint)
)
```

**Rationale:**

- P50 target ensures fast response for majority of requests
- P95/P99 targets catch tail latency issues
- Targets aligned with user patience thresholds (< 1s for interactivity)

**Critical Endpoints:**

- `/api/auth/login`: P95 < 300ms (authentication is time-sensitive)
- `/api/realtime/query`: P95 < 2000ms (RAG queries are more complex)
- `/health`: P95 < 100ms (health checks must be fast)

---

### 3. RAG Query Quality SLO

**Objective:** RAG queries should return relevant, accurate results

| Metric                 | Target      | Measurement Window |
| ---------------------- | ----------- | ------------------ |
| Query Success Rate     | 99%         | 30 days            |
| Cache Hit Rate         | > 30%       | 24 hours           |
| Average Search Results | > 2 results | 24 hours           |

**SLI Definition:**

```promql
# Query Success Rate
sum(rate(rag_query_duration_seconds_count{stage="total"}[5m]))
/
sum(rate(rag_query_attempts_total[5m]))

# Cache Hit Rate
sum(rate(cache_hits_total{cache_key_prefix="search_results"}[1h]))
/
sum(rate(cache_hits_total{cache_key_prefix="search_results"}[1h]) + rate(cache_misses_total{cache_key_prefix="search_results"}[1h]))

# Average Search Results
avg(rag_search_results_total)
```

**Rationale:**

- 99% success rate allows for edge cases and system issues
- 30% cache hit rate indicates effective caching strategy
- 2+ results ensure users get actionable information

---

### 4. Database Performance SLO

**Objective:** Database operations should be fast and reliable

| Metric                      | Target  | Measurement Window |
| --------------------------- | ------- | ------------------ |
| Query P95 Latency           | < 100ms | 5 minutes          |
| Connection Success Rate     | 99.9%   | 30 days            |
| Connection Pool Utilization | < 80%   | 5 minutes          |

**SLI Definition:**

```promql
# Query Latency P95
histogram_quantile(0.95,
  sum(rate(db_query_duration_seconds_bucket[5m])) by (le)
)

# Connection Success Rate
1 - (
  sum(rate(db_connection_errors_total[5m]))
  /
  sum(rate(db_query_duration_seconds_count[5m]))
)

# Pool Utilization
sum(db_connections_total{state="in_use"})
/
(sum(db_connections_total{state="in_use"}) + sum(db_connections_total{state="idle"}))
```

**Rationale:**

- 100ms P95 ensures responsive API layer
- High connection success rate prevents cascading failures
- 80% pool utilization threshold leaves headroom for spikes

---

### 5. Cache Performance SLO

**Objective:** Cache should provide performance improvements

| Metric                  | Target          | Measurement Window |
| ----------------------- | --------------- | ------------------ |
| Overall Hit Rate        | > 40%           | 24 hours           |
| L1 Cache Hit Rate       | > 60% (of hits) | 24 hours           |
| Cache Operation Latency | P95 < 10ms      | 5 minutes          |

**SLI Definition:**

```promql
# Overall Cache Hit Rate
sum(rate(cache_hits_total[1h]))
/
(sum(rate(cache_hits_total[1h])) + sum(rate(cache_misses_total[1h])))

# L1 Hit Rate (of all cache hits)
sum(rate(cache_hits_total{cache_layer="l1"}[1h]))
/
sum(rate(cache_hits_total[1h]))

# Cache Operation Latency P95
histogram_quantile(0.95,
  sum(rate(cache_latency_seconds_bucket[5m])) by (le, cache_layer)
)
```

**Rationale:**

- 40% overall hit rate demonstrates effective caching
- 60% L1 hit rate shows hot data staying in fast cache
- Sub-10ms latency ensures cache doesn't become bottleneck

---

### 6. Document Processing SLO

**Objective:** Document uploads should complete reliably

| Metric              | Target      | Measurement Window |
| ------------------- | ----------- | ------------------ |
| Job Success Rate    | 95%         | 7 days             |
| Processing Time P95 | < 2 minutes | 7 days             |
| Queue Depth         | < 100 jobs  | 5 minutes          |

**SLI Definition:**

```promql
# Job Success Rate
sum(rate(document_processing_jobs_total{status="completed"}[1h]))
/
sum(rate(document_processing_jobs_total[1h]))

# Processing Time P95
histogram_quantile(0.95,
  sum(rate(document_processing_duration_seconds_bucket[1h])) by (le)
)

# Queue Depth
sum(arq_queue_depth)
```

**Rationale:**

- 95% success rate accounts for malformed documents and external API failures
- 2-minute P95 ensures users don't wait excessively
- Queue depth threshold prevents backlog accumulation

---

## SLO Monitoring Strategy

### Recording Rules

Prometheus recording rules pre-compute complex SLI queries:

```yaml
# /infrastructure/observability/prometheus/rules/slo_recording_rules.yml
groups:
  - name: slo_recording_rules
    interval: 30s
    rules:
      # API Availability
      - record: slo:api_availability:ratio_rate5m
        expr: |
          sum(rate(http_requests_total{status_code=~"2..|3.."}[5m]))
          /
          sum(rate(http_requests_total[5m]))

      # API Latency P95
      - record: slo:api_latency_p95:seconds
        expr: |
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket[5m])) by (le, endpoint)
          )
```

### Alerting Rules

Alerts fire when SLOs are at risk or violated:

```yaml
# /infrastructure/observability/prometheus/rules/slo_alerts.yml
groups:
  - name: slo_alerts
    rules:
      # Critical: SLO violated
      - alert: APIAvailabilitySLOViolation
        expr: slo:api_availability:ratio_rate5m < 0.999
        for: 5m
        labels:
          severity: critical
          slo: availability
        annotations:
          summary: "API availability below SLO (99.9%)"
          description: "Current availability: {{ $value | humanizePercentage }}"

      # Warning: Error budget at risk (50% consumed)
      - alert: ErrorBudgetAtRisk
        expr: |
          (1 - slo:api_availability:ratio_rate30d) > 0.0005
        for: 15m
        labels:
          severity: warning
          slo: availability
        annotations:
          summary: "Error budget consumption > 50%"
```

### Dashboard Panels

Grafana dashboard panels for SLO tracking:

1. **Availability Overview**: Current vs target availability
2. **Error Budget**: Remaining budget and burn rate
3. **Latency Distribution**: P50/P95/P99 over time
4. **SLO Compliance**: Per-service SLO status (green/yellow/red)
5. **Error Budget Timeline**: 30-day error budget consumption

---

## SLO Review Process

### Weekly Review

- **Owner**: On-call engineer
- **Review**: Current SLO status, recent violations
- **Action**: Update runbooks if patterns emerge

### Monthly Review

- **Owner**: Engineering Manager
- **Review**:
  - SLO compliance trends
  - Error budget consumption patterns
  - SLO target appropriateness
- **Action**: Adjust targets if consistently over/under performing

### Quarterly Review

- **Owner**: Platform Team
- **Review**:
  - SLO framework effectiveness
  - New SLOs needed
  - Retired SLOs
  - Target adjustments based on user feedback
- **Action**: Update SLO document and targets

---

## Error Budget Policy

### When Error Budget is Healthy (> 50% remaining)

- ✅ Deploy new features freely
- ✅ Experiment with new technologies
- ✅ Planned maintenance allowed
- ✅ Refactoring and tech debt work

### When Error Budget is At Risk (25-50% remaining)

- ⚠️ Increase review rigor for deployments
- ⚠️ Prioritize reliability improvements
- ⚠️ Defer non-critical features
- ⚠️ Increase monitoring and alerting

### When Error Budget is Depleted (< 25% remaining)

- 🛑 Feature freeze - only reliability improvements
- 🛑 Increase on-call staffing
- 🛑 Daily SLO status reviews
- 🛑 Defer all non-critical work until budget recovers

---

## SLO Exceptions

### Planned Maintenance

- Must be announced 48 hours in advance
- Limited to 4 hours/month
- Excluded from availability SLO
- User-facing status page updated

### External Dependencies

Failures of external services are tracked separately:

- OpenAI API failures: Tracked but excluded from API availability SLO
- Nextcloud unavailability: Tracked separately
- DNS/network issues: Excluded if beyond our control

### Known Limitations

- **Cold starts**: First request after deployment may be slow
- **Cache warming**: Cache hit rate temporarily lower after cache clear
- **Large documents**: Processing time varies with document size

---

## Appendix: Prometheus Queries

### Quick SLO Status Check

```promql
# All SLOs at a glance
{__name__=~"slo:.*"}
```

### Error Budget Remaining

```promql
# 30-day error budget remaining (as percentage)
1 - (
  (1 - slo:api_availability:ratio_rate30d) / 0.001
)
```

### SLO Burn Rate

```promql
# How fast are we consuming error budget?
# > 1.0 means consuming faster than sustainable
(1 - slo:api_availability:ratio_rate1h)
/
(1 - slo:api_availability:ratio_rate30d)
```

---

## References

- [Google SRE Book - SLOs](https://sre.google/sre-book/service-level-objectives/)
- [Prometheus Best Practices - Recording Rules](https://prometheus.io/docs/practices/rules/)
- [Grafana SLO Tracking](https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/stat/)

## Contact

For SLO-related questions:

- **Slack**: #platform-sre
- **On-call**: PagerDuty escalation
- **Documentation**: This file and `/docs/operations/RUNBOOKS.md`
