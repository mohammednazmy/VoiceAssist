# Kubernetes Network Policies (Phase 11)

**HIPAA Requirement:** §164.312(e)(1) - Transmission Security
**Component:** Network Security Controls
**Status:** Production-Ready

---

## Overview

These NetworkPolicies implement a zero-trust network security model for the VoiceAssist Kubernetes deployment. They follow the principle of **default deny** with explicit allows for required traffic flows.

---

## Policies Included

### 1. default-deny-all.yaml

**Purpose:** Baseline security policy that denies all ingress and egress traffic by default.

**Applies to:** All pods in the `voiceassist` namespace

**Effect:**
- Blocks all inbound traffic
- Blocks all outbound traffic
- Other policies create exceptions for required traffic

### 2. api-gateway-policy.yaml

**Purpose:** Controls traffic to/from the API Gateway (FastAPI application)

**Ingress Allows:**
- Traffic from Ingress Controller (nginx-ingress)
- Health check probes from Kubernetes

**Egress Allows:**
- DNS resolution (kube-dns)
- PostgreSQL connection (port 5432)
- Redis connection (ports 6379, 6380)
- Qdrant connection (port 6333)
- HTTPS to external APIs (port 443)

### 3. database-policy.yaml

**Purpose:** Restricts PostgreSQL access to authorized services only

**Ingress Allows:**
- Connections from API Gateway pods
- Connections from Worker pods

**Egress Allows:**
- DNS resolution only

### 4. redis-policy.yaml

**Purpose:** Restricts Redis cache access to authorized services only

**Ingress Allows:**
- Connections from API Gateway pods
- Connections from Worker pods
- Both plain (6379) and TLS (6380) ports

**Egress Allows:**
- DNS resolution only

### 5. qdrant-policy.yaml

**Purpose:** Restricts Qdrant vector store access to authorized services only

**Ingress Allows:**
- Connections from API Gateway pods
- Connections from Worker pods
- REST API (6333) and gRPC (6334) ports

**Egress Allows:**
- DNS resolution only

---

## Deployment

### Prerequisites

```bash
# Verify NetworkPolicy support in your cluster
kubectl api-resources | grep networkpolicies

# Create namespace if it doesn't exist
kubectl create namespace voiceassist
```

### Apply Policies

```bash
# Apply all policies at once
kubectl apply -f k8s/security/network-policies/

# Or apply individually
kubectl apply -f k8s/security/network-policies/default-deny-all.yaml
kubectl apply -f k8s/security/network-policies/api-gateway-policy.yaml
kubectl apply -f k8s/security/network-policies/database-policy.yaml
kubectl apply -f k8s/security/network-policies/redis-policy.yaml
kubectl apply -f k8s/security/network-policies/qdrant-policy.yaml
```

### Verify Policies

```bash
# List all network policies
kubectl get networkpolicies -n voiceassist

# Describe a specific policy
kubectl describe networkpolicy api-gateway-policy -n voiceassist

# Check policy effects on pods
kubectl get pods -n voiceassist -o wide
```

---

## Testing Network Policies

### 1. Test Database Isolation

```bash
# This should FAIL (blocked by policy)
kubectl run test-pod --rm -it --image=postgres:16 -n voiceassist -- \
  psql -h postgres -U voiceassist -d voiceassist

# This should SUCCEED (API Gateway can access)
kubectl exec -it deployment/voiceassist-api-gateway -n voiceassist -- \
  python -c "import psycopg2; conn = psycopg2.connect(host='postgres', dbname='voiceassist', user='voiceassist', password='password'); print('Connected!')"
```

### 2. Test External Access

```bash
# This should SUCCEED (API Gateway can access external HTTPS)
kubectl exec -it deployment/voiceassist-api-gateway -n voiceassist -- \
  curl -I https://api.openai.com/v1/models

# This should FAIL (Database cannot access external)
kubectl exec -it deployment/postgres -n voiceassist -- \
  curl -I https://api.openai.com/v1/models
```

### 3. Test Inter-Service Communication

```bash
# This should SUCCEED (API Gateway → Redis)
kubectl exec -it deployment/voiceassist-api-gateway -n voiceassist -- \
  redis-cli -h redis PING

# This should FAIL (Direct access from external pod)
kubectl run test-redis --rm -it --image=redis:7-alpine -n voiceassist -- \
  redis-cli -h redis PING
```

---

## Traffic Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    External Traffic                         │
│                   (HTTPS from users)                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
          ┌──────────────────────────────┐
          │    Ingress Controller        │
          │    (nginx-ingress)           │
          └──────────────┬───────────────┘
                         │
                         ▼
          ┌──────────────────────────────┐
          │    API Gateway (FastAPI)     │◄───── Health Checks (kubelet)
          │    - Receives external       │
          │      traffic via Ingress     │
          │    - Makes external API      │
          │      calls (OpenAI, etc.)    │
          └──────┬────────┬──────┬───────┘
                 │        │      │
         ┌───────┘        │      └────────┐
         │                │               │
         ▼                ▼               ▼
  ┌───────────┐    ┌──────────┐   ┌──────────┐
  │PostgreSQL │    │  Redis   │   │ Qdrant   │
  │           │    │          │   │          │
  │ - Port    │    │ - Port   │   │ - Port   │
  │   5432    │    │   6379   │   │   6333   │
  │           │    │   6380   │   │          │
  │ - No      │    │           │   │ - No     │
  │   external│    │ - No      │   │   external│
  │   access  │    │   external│   │   access │
  └───────────┘    │   access  │   └──────────┘
                   └───────────┘
```

---

## HIPAA Compliance

These NetworkPolicies satisfy the following HIPAA requirements:

| Requirement | Implementation |
|-------------|----------------|
| **§164.312(e)(1) - Integrity Controls** | NetworkPolicies prevent unauthorized modification of ePHI in transit |
| **§164.312(e)(2)(i) - Transmission Security** | Restricts network paths to only authorized services |
| **§164.308(a)(4)(i) - Access Management** | Limits network access based on service identity |
| **§164.308(a)(3)(i) - Workforce Clearance** | Only authorized pods can access PHI-containing databases |

---

## Troubleshooting

### Issue: Pod Cannot Connect to Database

```bash
# Check if NetworkPolicy is applied
kubectl get networkpolicy -n voiceassist

# Verify pod labels match policy selectors
kubectl get pod <pod-name> -n voiceassist --show-labels

# Check if pod is in correct namespace
kubectl get pod <pod-name> -o yaml | grep namespace
```

### Issue: External API Calls Failing

```bash
# Verify egress rules allow HTTPS
kubectl describe networkpolicy api-gateway-policy -n voiceassist

# Check DNS resolution works
kubectl exec -it deployment/voiceassist-api-gateway -n voiceassist -- \
  nslookup api.openai.com
```

### Issue: Health Checks Failing

```bash
# Ensure health check ingress is allowed
kubectl describe networkpolicy api-gateway-policy -n voiceassist

# Check if kubelet can reach the pod
kubectl get events -n voiceassist --field-selector involvedObject.name=<pod-name>
```

---

## Best Practices

1. **Always Start with Default Deny**
   - Apply `default-deny-all.yaml` first
   - Then add specific allow policies

2. **Use Labels Consistently**
   - Ensure pod labels match policy selectors
   - Document label conventions

3. **Test Thoroughly**
   - Test both allowed and denied traffic
   - Verify policies don't block legitimate traffic
   - Use `kubectl exec` for testing

4. **Monitor NetworkPolicy Effects**
   - Use Prometheus metrics
   - Monitor connection failures
   - Review policy violations

5. **Document Changes**
   - Update this README when adding policies
   - Document rationale for allow rules
   - Track policy version in git

---

## Production Considerations

### 1. CNI Plugin Requirements

NetworkPolicies require a CNI plugin that supports them:
- **Supported:** Calico, Cilium, Weave Net
- **Not Supported:** Flannel (without additional plugin)

### 2. Performance Impact

NetworkPolicies have minimal performance impact:
- **Latency:** < 1ms added per connection
- **Throughput:** No significant impact
- **CPU/Memory:** < 5% overhead on CNI plugin

### 3. High Availability

- NetworkPolicies are namespace-scoped
- Replicated across all nodes automatically
- No single point of failure

### 4. Monitoring

```yaml
# Prometheus metrics for NetworkPolicy
- network_plugin_networkpolicy_count
- network_plugin_networkpolicy_evaluation_duration_seconds
```

---

## References

- **Kubernetes NetworkPolicy Documentation:** https://kubernetes.io/docs/concepts/services-networking/network-policies/
- **HIPAA Security Rule:** §164.312(e) - Transmission Security
- **Calico NetworkPolicy Guide:** https://docs.projectcalico.org/security/calico-network-policy
- **Cilium NetworkPolicy Guide:** https://docs.cilium.io/en/stable/policy/

---

**Version:** 1.0
**Last Updated:** 2025-11-21
**Next Review:** 2026-02-21 (90 days)
