---
title: "Business Metrics"
slug: "operations/business-metrics"
summary: "**Last Updated**: 2025-11-21 (Phase 7 - P3.3)"
status: stable
stability: production
owner: sre
lastUpdated: "2025-11-27"
audience: ["human"]
tags: ["business", "metrics"]
category: operations
---

# Business Metrics Guide

**Last Updated**: 2025-11-21 (Phase 7 - P3.3)
**Purpose**: Guide for understanding and using VoiceAssist V2 business metrics

---

## Overview

VoiceAssist V2 tracks comprehensive business KPIs to measure user engagement, system performance, and operational costs. All metrics are collected via Prometheus and visualized in Grafana.

**Metrics Endpoint**: `http://localhost:8000/metrics`
**Dashboard**: `dashboards/business-metrics.json` (import into Grafana)
**Refresh Interval**: 30 seconds

---

## Metric Categories

### 1. User Activity Metrics

Track user engagement and growth:

#### Daily Active Users (DAU)

- **Metric**: `voiceassist_active_users_daily`
- **Description**: Number of unique users who logged in today
- **Calculation**: Distinct user IDs with `last_login >= today_00:00:00`
- **Target**: > 100 users/day in production

#### Monthly Active Users (MAU)

- **Metric**: `voiceassist_active_users_monthly`
- **Description**: Number of unique users who logged in this month
- **Calculation**: Distinct user IDs with `last_login >= month_start`
- **Target**: > 500 users/month in production
- **Key Ratio**: DAU/MAU should be > 0.2 (20% daily engagement)

#### User Registrations

- **Metric**: `voiceassist_user_registrations_total`
- **Description**: Total number of new user signups
- **Tracked**: When user completes registration in `app/api/auth.py:74`
- **Target**: Steady growth week-over-week

#### User Logins

- **Metric**: `voiceassist_user_logins_total`
- **Description**: Total successful login attempts
- **Tracked**: When user successfully authenticates in `app/api/auth.py:117`
- **Alert**: Sudden drop may indicate authentication issues

#### Session Duration

- **Metric**: `voiceassist_user_session_duration_seconds`
- **Description**: Distribution of user session lengths
- **Buckets**: 1min, 5min, 10min, 30min, 1h, 2h, 4h
- **Target**: Mean > 15 minutes indicates engaged users

---

### 2. RAG Query Metrics

Measure the effectiveness of the medical RAG system:

#### RAG Query Success Rate

- **Metric**: `voiceassist_rag_queries_total{success="true|false"}`
- **Description**: Percentage of queries that complete successfully
- **Calculation**: `success="true" / total * 100`
- **Target**: > 95% success rate
- **Alert**: < 90% indicates system degradation

#### Citations Per Query

- **Metric**: `voiceassist_rag_citations_per_query`
- **Description**: Number of medical citations returned per query
- **Tracked**: When query completes in `app/api/realtime.py:276`
- **Target**: Mean > 2 citations per query
- **Interpretation**:
  - 0 citations: No relevant knowledge found
  - 1-3 citations: Good focused answer
  - > 5 citations: May indicate broad query

#### Queries with Citations

- **Metric**: `voiceassist_rag_queries_total{has_citations="true|false"}`
- **Description**: Queries that return at least one citation
- **Target**: > 80% of queries should have citations
- **Low citation rate**: May indicate knowledge base gaps

#### Query Satisfaction Score

- **Metric**: `voiceassist_rag_query_satisfaction_score`
- **Description**: User-provided satisfaction ratings (0-5 scale)
- **Status**: Placeholder - to be implemented with user feedback
- **Target**: Mean > 4.0

---

### 3. Knowledge Base Metrics

Track content growth and indexing performance:

#### Total Documents

- **Metric**: `voiceassist_kb_documents_total`
- **Description**: Number of documents indexed in the knowledge base
- **Status**: Counter - incremented but not decremented on delete
- **Target**: > 1000 medical documents

#### Total Chunks Indexed

- **Metric**: `voiceassist_kb_chunks_total`
- **Description**: Total text chunks available for search
- **Tracked**: Incremented per chunk in `app/api/admin_kb.py:167`
- **Target**: > 10,000 chunks for comprehensive coverage
- **Interpretation**: Avg 10-20 chunks per document

#### Document Uploads by Type

- **Metric**: `voiceassist_kb_document_uploads_total{source_type, file_type}`
- **Labels**:
  - `source_type`: uploaded, guideline, journal, etc.
  - `file_type`: pdf, txt
- **Use**: Track content diversity and sources

#### Indexing Duration

- **Metric**: `voiceassist_kb_indexing_duration_seconds`
- **Description**: Time to process and index documents
- **Tracked**: Full pipeline time in `app/api/admin_kb.py:157`
- **Target**: < 10 seconds for typical document
- **Alert**: > 30 seconds may indicate OpenAI API issues

---

### 4. API Usage Metrics

Monitor API traffic and performance:

#### API Endpoint Usage

- **Metric**: `voiceassist_api_endpoints_usage_total{endpoint, method, status_code}`
- **Description**: Request count per endpoint
- **Use**: Identify popular features and error rates
- **Labels**:
  - `endpoint`: /api/auth/login, /api/realtime/ws, etc.
  - `method`: GET, POST, PUT, DELETE
  - `status_code`: 200, 400, 401, 500, etc.

#### Response Time by Endpoint

- **Metric**: `voiceassist_api_response_time_by_endpoint_seconds{endpoint, method}`
- **Description**: Latency distribution per endpoint
- **Target**: p95 < 500ms for most endpoints
- **Alert**: p99 > 2s indicates performance issues

---

### 5. Cost Tracking

Monitor OpenAI API and infrastructure costs:

#### OpenAI API Calls

- **Metric**: `voiceassist_openai_api_calls_total{model, purpose}`
- **Description**: Number of OpenAI API requests
- **Labels**:
  - `model`: gpt-4, gpt-3.5-turbo, text-embedding-ada-002
  - `purpose`: embedding, completion, rag_query
- **Use**: Track API usage patterns

#### OpenAI Tokens Used

- **Metric**: `voiceassist_openai_tokens_used_total{model, token_type}`
- **Description**: Total tokens consumed
- **Labels**:
  - `token_type`: prompt, completion
- **Cost Calculation**:
  - GPT-4: $0.03/1K prompt tokens, $0.06/1K completion tokens
  - GPT-3.5-turbo: $0.0015/1K prompt, $0.002/1K completion
  - Embeddings: $0.0001/1K tokens

#### Estimated OpenAI Cost

- **Metric**: `voiceassist_openai_api_cost_dollars_total`
- **Description**: Cumulative estimated API spend
- **Calculation**: Tokens × model pricing
- **Budget**: Set alerts for monthly spend thresholds
- **Optimization**: Track cost per query for efficiency

---

### 6. System Health Business Metrics

Operational metrics for business continuity:

#### System Uptime

- **Metric**: `voiceassist_system_uptime_seconds`
- **Description**: Time since application started
- **Display**: Convert to days/hours for readability
- **Target**: > 99.9% uptime (< 43 minutes downtime/month)

#### Feature Flag Checks

- **Metric**: `voiceassist_feature_flag_checks_total{flag_name, result}`
- **Description**: Feature flag evaluation counts
- **Use**: Track feature adoption and A/B test distribution
- **Labels**:
  - `flag_name`: rbac_enforcement, new_ui, etc.
  - `result`: enabled, disabled

#### Admin Actions

- **Metric**: `voiceassist_admin_actions_total{action_type, success}`
- **Description**: Administrative operations performed
- **Security**: Monitor for unusual admin activity
- **Labels**:
  - `action_type`: user_delete, kb_clear, config_change, etc.
  - `success`: true, false

---

## KPI Targets and Thresholds

### Production Targets

| Metric                    | Target  | Warning | Critical |
| ------------------------- | ------- | ------- | -------- |
| DAU                       | > 100   | < 50    | < 20     |
| MAU                       | > 500   | < 300   | < 100    |
| DAU/MAU Ratio             | > 20%   | < 15%   | < 10%    |
| RAG Success Rate          | > 95%   | < 90%   | < 80%    |
| Citations Per Query       | > 2.0   | < 1.5   | < 1.0    |
| Query Response Time (p95) | < 500ms | > 1s    | > 2s     |
| KB Documents              | > 1000  | < 500   | < 100    |
| Monthly OpenAI Cost       | < $500  | > $700  | > $1000  |
| System Uptime             | > 99.9% | < 99.5% | < 99%    |

### Growth Metrics

Track month-over-month growth:

- **User Growth**: (This Month MAU - Last Month MAU) / Last Month MAU × 100
  - Target: > 10% monthly growth
- **Query Volume Growth**: Same calculation for total queries
  - Target: > 15% monthly growth (faster than user growth = engagement increasing)
- **KB Content Growth**: Documents added per month
  - Target: > 50 new documents/month

---

## Dashboard Usage

### Importing the Dashboard

1. Open Grafana UI: `http://localhost:3000`
2. Login (default: admin/admin)
3. Navigate to Dashboards → Import
4. Upload `dashboards/business-metrics.json`
5. Select Prometheus data source
6. Click Import

### Dashboard Panels

The business metrics dashboard contains 20 panels in 6 rows:

**Row 1: User Engagement**

- Visualize user growth trends
- Monitor daily vs monthly active users
- Track registration and login patterns

**Row 2: RAG Performance**

- Monitor query success rates
- Analyze citation effectiveness
- Identify knowledge base gaps

**Row 3: Knowledge Base**

- Track content growth
- Monitor indexing performance
- Analyze document diversity

**Row 4: API Usage**

- Identify popular endpoints
- Monitor API performance
- Detect traffic anomalies

**Row 5: Cost Tracking**

- Track OpenAI API usage
- Monitor token consumption
- Estimate monthly costs

**Row 6: System Health**

- Monitor uptime
- Track feature adoption
- Audit admin actions

### Custom Time Ranges

- **Last 6 hours**: Real-time monitoring (default)
- **Last 24 hours**: Daily operations review
- **Last 7 days**: Weekly trends analysis
- **Last 30 days**: Monthly business review

---

## Cost Optimization Recommendations

### Reducing OpenAI API Costs

1. **Caching Strategy**
   - Cache frequent queries for 5 minutes
   - Reduces duplicate API calls by ~30%
   - Implemented in `app/services/cache_service.py`

2. **Embedding Optimization**
   - Use text-embedding-ada-002 (cheapest)
   - Chunk size 512 tokens (balance quality/cost)
   - Deduplicate embeddings for identical text

3. **Prompt Optimization**
   - Reduce system prompt length
   - Use GPT-3.5-turbo for simple queries
   - Reserve GPT-4 for complex medical questions

4. **Query Filtering**
   - Pre-filter obvious non-medical queries
   - Use keyword matching before RAG
   - Rate limit per user (prevent abuse)

### Cost Monitoring Alerts

Set up Grafana alerts:

```promql
# Alert if daily cost exceeds budget
increase(voiceassist_openai_api_cost_dollars_total[24h]) > 20

# Alert if cost per query is too high
rate(voiceassist_openai_api_cost_dollars_total[1h]) /
rate(voiceassist_rag_queries_total[1h]) > 0.05
```

---

## Metric Collection Implementation

### Adding New Business Metrics

1. **Define Metric** in `app/core/business_metrics.py`:

```python
from prometheus_client import Counter

new_metric = Counter(
    "voiceassist_new_metric_total",
    "Description of new metric",
    ["label1", "label2"]
)
```

2. **Instrument Code** where event occurs:

```python
from app.core.business_metrics import new_metric

# Increment metric
new_metric.labels(label1="value1", label2="value2").inc()
```

3. **Update Dashboard**: Add panel to `dashboards/business-metrics.json`

4. **Document**: Add to this guide with targets and interpretation

### Metric Best Practices

- **Naming**: Use `voiceassist_<category>_<metric>_<unit>` format
- **Labels**: Keep cardinality low (< 100 unique combinations)
- **Types**:
  - Counter: Monotonically increasing (totals, counts)
  - Gauge: Can go up/down (current values)
  - Histogram: Distribution (latencies, sizes)
- **Units**: Use base units (seconds, bytes) not derived (minutes, MB)

---

## Troubleshooting

### Metrics Not Updating

**Issue**: Dashboard shows 0 or stale values

**Solutions**:

1. Check Prometheus is scraping:
   ```bash
   curl http://localhost:9090/api/v1/targets
   ```
2. Verify metrics endpoint:
   ```bash
   curl http://localhost:8000/metrics | grep voiceassist_
   ```
3. Check server logs:
   ```bash
   docker compose logs voiceassist-server | grep metrics
   ```

### DAU/MAU Calculation Issues

**Issue**: DAU/MAU shows unexpected values

**Root Causes**:

- `last_login` not updating on user activity
- Timezone mismatches in date calculation
- Database query filtering incorrect

**Fix**: Verify in PostgreSQL:

```sql
-- Check today's active users manually
SELECT COUNT(DISTINCT id) FROM users
WHERE last_login >= CURRENT_DATE;
```

### Cost Metrics Inaccurate

**Issue**: Estimated costs don't match OpenAI billing

**Root Causes**:

- Token counting algorithm differs
- Pricing outdated
- Not tracking all API calls

**Fix**: Implement detailed logging:

```python
# Log every OpenAI API call with actual usage
logger.info("openai_api_call",
    model=model,
    prompt_tokens=response.usage.prompt_tokens,
    completion_tokens=response.usage.completion_tokens,
    total_cost=calculated_cost
)
```

---

## Related Documentation

- [Unified Architecture](../UNIFIED_ARCHITECTURE.md) - System overview
- [Connection Pool Optimization](CONNECTION_POOL_OPTIMIZATION.md) - Infrastructure metrics
- [SLO Definitions](SLO_DEFINITIONS.md) - Service level objectives
- [Monitoring Runbook](runbooks/MONITORING.md) - Alert setup guide

---

**Document Version**: 1.0
**Last Updated**: 2025-11-21
**Maintained By**: VoiceAssist DevOps Team
**Review Cycle**: Quarterly or when new metrics added
