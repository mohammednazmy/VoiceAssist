# Epic FHIR Integration Operations Runbook

## Overview

This runbook covers operational procedures for the Epic FHIR integration (Phase 6 & 6b) in VoiceAssist Voice Mode.

## Quick Reference

| Component        | Location                                   | Health Check          |
| ---------------- | ------------------------------------------ | --------------------- |
| FHIR Client      | `integrations/fhir/fhir_client.py`         | `/health/epic`        |
| Epic Adapter     | `integrations/fhir/epic_adapter.py`        | Check token status    |
| Provider Monitor | `integrations/fhir/provider_monitor.py`    | Circuit breaker state |
| EHR Commands     | `dictation_engine/plugins/ehr_commands.py` | Plugin status         |

---

## 1. Epic Credential Rotation

### When to Rotate

- Every 90 days (recommended)
- After security incidents
- When staff with access leave organization

### Rotation Procedure

1. **Generate New Credentials in Epic**

   ```
   - Log into Epic App Orchard
   - Navigate to your application
   - Generate new client credentials
   - Download new private key
   ```

2. **Update Environment Variables**

   ```bash
   # Back up current credentials
   cp /opt/voiceassist/.env /opt/voiceassist/.env.backup.$(date +%Y%m%d)

   # Update credentials
   export EPIC_CLIENT_ID="new_client_id"
   export EPIC_PRIVATE_KEY_PATH="/path/to/new/private_key.pem"
   ```

3. **Verify New Credentials**

   ```bash
   # Test token generation
   curl -X POST "$EPIC_TOKEN_URL" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=client_credentials&client_id=$EPIC_CLIENT_ID"
   ```

4. **Restart Services**

   ```bash
   sudo systemctl restart voiceassist-api
   ```

5. **Verify Connectivity**

   ```bash
   curl http://localhost:5057/health/epic
   ```

6. **Revoke Old Credentials**
   - Return to Epic App Orchard
   - Revoke the previous credentials

---

## 2. Provider Outage Recovery

### Symptoms

- Circuit breaker in OPEN state
- High error rate (>10%)
- Provider status: UNHEALTHY

### Investigation

1. **Check Provider Status**

   ```bash
   curl http://localhost:5057/api/admin/provider-status
   ```

2. **Check Circuit Breaker**

   ```python
   # In Python console
   from app.integrations.fhir import get_epic_adapter
   adapter = get_epic_adapter()
   print(adapter.provider_monitor.get_status())
   ```

3. **Check Epic Status Page**
   - Visit Epic's status page for known outages
   - Check App Orchard for maintenance windows

### Recovery Steps

1. **If Epic is Down**
   - Fallback mode activates automatically
   - Monitor `degradation.activated` events
   - Use cached patient context

2. **If Circuit Breaker is Open**

   ```python
   # Wait for half-open transition (60 seconds default)
   # Or manually reset if Epic is confirmed healthy
   monitor = adapter.provider_monitor
   monitor._circuit_breaker._transition_to(CircuitState.HALF_OPEN)
   ```

3. **Force Health Check**

   ```python
   result = await adapter.provider_monitor.check_health()
   print(result)
   ```

4. **Verify Recovery**

   ```bash
   # Check provider is healthy
   curl http://localhost:5057/health/epic

   # Check metrics
   curl http://localhost:5057/api/admin/metrics/epic
   ```

---

## 3. Feature Flag Management

### Enable/Disable Epic Write Operations

1. **Via Admin API**

   ```bash
   # Disable write operations
   curl -X POST http://localhost:5057/api/admin/features \
     -H "Content-Type: application/json" \
     -d '{"feature": "epic_fhir_write", "enabled": false}'
   ```

2. **Via Code**

   ```python
   from app.core.policy_config import get_policy_service
   policy = get_policy_service()
   policy.update_feature_flag("epic_fhir_write", False)
   ```

3. **Per-User Override**
   ```python
   policy.set_user_override("user_123", "epic_fhir_write", True)
   ```

### A/B Test Monitoring

```bash
# Get A/B test variants for a user
curl "http://localhost:5057/api/admin/ab-variant?user_id=user_123&test=epic_fhir_write"
```

---

## 4. Handling Write Operation Failures

### Order Submission Failures

1. **Check Audit Logs**

   ```python
   from app.core.audit_service import get_audit_service
   audit = get_audit_service()
   events = await audit.get_events(
       event_type=AuditEventType.EHR_WRITE_FAILED,
       limit=10
   )
   ```

2. **Common Error Codes**
   | Code | Meaning | Action |
   |------|---------|--------|
   | 400 | Validation error | Check resource format |
   | 401 | Auth failed | Rotate credentials |
   | 403 | Authorization denied | Check scopes |
   | 409 | Conflict | Duplicate order detected |
   | 412 | Precondition failed | ETag mismatch, retry |
   | 429 | Rate limited | Wait and retry |
   | 500+ | Server error | Check Epic status |

3. **Manual Order Recovery**
   - Log into Epic directly
   - Verify order status
   - Create order manually if needed
   - Document in incident report

---

## 5. Data Export Requests

### User Data Export (HIPAA Compliance)

1. **Generate Export**

   ```python
   from app.core.audit_service import get_audit_service
   audit = get_audit_service()

   # Get user's PHI access log
   events = await audit.get_events(user_id="user_123", limit=10000)

   # Export to JSON
   export = await audit.export_audit_log(
       start_time=datetime(2024, 1, 1),
       format="json"
   )
   ```

2. **Accounting of Disclosures**
   ```python
   accounting = await audit.get_accounting_of_disclosures(
       patient_id="patient_456"
   )
   ```

---

## 6. Chaos Engineering Tests

### Running Predefined Experiments

```python
from app.testing import get_chaos_controller, create_epic_outage_experiment

chaos = get_chaos_controller()
chaos.enable()  # Only in test environment!

# Simulate Epic outage
experiment = create_epic_outage_experiment(duration_seconds=60)
chaos._experiments[experiment.id] = experiment
results = await chaos.run_experiment(experiment.id)

chaos.disable()
```

### Manual Chaos Injection

```python
# Inject latency
chaos.inject_latency("epic", min_ms=500, max_ms=2000, duration_seconds=300)

# Inject errors
chaos.inject_error_rate("epic", rate=0.3, duration_seconds=300)

# Clear all chaos
chaos.clear_all()
```

---

## 7. Monitoring Dashboards

### Key Metrics to Monitor

| Metric             | Healthy | Warning    | Critical |
| ------------------ | ------- | ---------- | -------- |
| Epic Success Rate  | >99%    | 95-99%     | <95%     |
| Avg Latency        | <500ms  | 500-2000ms | >2000ms  |
| Write Success Rate | >99%    | 95-99%     | <95%     |
| Circuit State      | CLOSED  | HALF_OPEN  | OPEN     |

### Log Analysis

```bash
# Epic errors in last hour
grep "epic" /var/log/voiceassist/api.log | grep -i error | tail -100

# Write operation failures
grep "EHR_WRITE_FAILED" /var/log/voiceassist/audit.log | tail -50
```

---

## 8. Emergency Procedures

### Complete Epic Shutdown

1. **Disable All Epic Features**

   ```bash
   curl -X POST http://localhost:5057/api/admin/features/batch \
     -H "Content-Type: application/json" \
     -d '{
       "updates": [
         {"feature": "epic_fhir_read_only", "enabled": false},
         {"feature": "epic_fhir_write", "enabled": false}
       ]
     }'
   ```

2. **Verify Fallback Active**

   ```bash
   curl http://localhost:5057/health/epic
   # Should show fallback_active: true
   ```

3. **Notify Users**
   - System automatically uses cached context
   - Voice queries return "EHR temporarily unavailable"

### Recovery from Emergency Shutdown

1. Verify Epic connectivity restored
2. Re-enable read operations first
3. Monitor for 15 minutes
4. Re-enable write operations
5. Monitor for 30 minutes
6. Document incident

---

## 9. Contact Information

| Role             | Contact                  |
| ---------------- | ------------------------ |
| Epic Support     | epic-support@example.com |
| On-Call Engineer | oncall@voiceassist.io    |
| Security Team    | security@voiceassist.io  |

---

## Appendix: Common Commands

```bash
# Check all service health
curl http://localhost:5057/health

# Get Epic adapter status
curl http://localhost:5057/api/admin/epic/status

# List active feature flags
curl http://localhost:5057/api/admin/features

# Get audit statistics
curl http://localhost:5057/api/admin/audit/stats

# Check chaos controller status
curl http://localhost:5057/api/admin/chaos/status
```
