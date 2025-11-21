# VoiceAssist HPA - Quick Reference Card

## Quick Start Commands

```bash
# 1. Setup HPA for development
cd k8s/performance
./setup-hpa.sh dev

# 2. Test autoscaling
./test-autoscaling.sh dev all

# 3. Deploy to production
./setup-hpa.sh prod
```

## Essential kubectl Commands

### Check HPA Status
```bash
# List all HPAs
kubectl get hpa -n voiceassist

# Watch HPA in real-time
kubectl get hpa -n voiceassist --watch

# Detailed HPA information
kubectl describe hpa voiceassist-server-hpa -n voiceassist
```

### Monitor Resources
```bash
# Current pod resource usage
kubectl top pods -n voiceassist

# Node resource usage
kubectl top nodes

# Watch pod count
kubectl get pods -n voiceassist --watch
```

### Check Scaling Events
```bash
# Recent events
kubectl get events -n voiceassist --sort-by='.lastTimestamp'

# HPA-specific events
kubectl describe hpa voiceassist-server-hpa -n voiceassist | grep Events -A 20
```

### VPA Recommendations
```bash
# View VPA recommendations
kubectl describe vpa voiceassist-server-vpa -n voiceassist

# Get JSON recommendations
kubectl get vpa voiceassist-server-vpa -n voiceassist -o json | jq '.status.recommendation'
```

### PodDisruptionBudgets
```bash
# List all PDBs
kubectl get pdb -n voiceassist

# Check PDB status
kubectl describe pdb voiceassist-server-pdb -n voiceassist
```

## Configuration Scaling Levels

| Component | Dev | Staging | Prod |
|-----------|-----|---------|------|
| **API Gateway** |
| Min Replicas | 1 | 2 | 3 |
| Max Replicas | 3 | 6 | 15 |
| CPU Target | 80% | 70% | 65% |
| CPU Limits | 1000m | 2000m | 3000m |
| Memory Limits | 1Gi | 2Gi | 3Gi |
| **Worker** |
| Min Replicas | 1 | 1 | 2 |
| Max Replicas | 2 | 3 | 8 |
| CPU Target | 85% | 80% | 75% |
| CPU Limits | 2000m | 4000m | 6000m |
| Memory Limits | 2Gi | 4Gi | 6Gi |

## Scaling Behavior

### API Gateway
- **Scale Up:** 100% every 30s (max +2 pods)
- **Scale Down:** 10% every 5m (max -1 pod)
- **Triggers:** CPU >70%, Memory >80%, Requests >100/s

### Worker
- **Scale Up:** 50% every 60s
- **Scale Down:** 10% every 10m
- **Triggers:** CPU >80%, Memory >85%, Queue >50 jobs

## Apply Environment Configs

```bash
# Development
kubectl apply -k k8s/performance/overlays/dev/

# Staging
kubectl apply -k k8s/performance/overlays/staging/

# Production
kubectl apply -k k8s/performance/overlays/prod/
```

## Troubleshooting

### HPA Shows "unknown" Metrics
```bash
# Check metrics-server
kubectl get apiservices v1beta1.metrics.k8s.io
kubectl top nodes  # Should show node metrics

# Check metrics-server logs
kubectl logs -n kube-system deployment/metrics-server
```

### Pods Not Scaling
```bash
# Check HPA conditions
kubectl describe hpa voiceassist-server-hpa -n voiceassist

# Verify metrics available
kubectl get --raw /apis/metrics.k8s.io/v1beta1/namespaces/voiceassist/pods
```

### OOMKilled Pods
```bash
# Check memory usage
kubectl top pods -n voiceassist

# View OOM events
kubectl get events -n voiceassist --field-selector reason=OOMKilled

# Increase memory limits
kubectl patch deployment voiceassist-server -n voiceassist \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"server","resources":{"limits":{"memory":"3Gi"}}}]}}}}'
```

### Node Drain Blocked
```bash
# Check PDB status
kubectl get pdb -n voiceassist -o wide

# Temporarily remove PDB (emergency only)
kubectl delete pdb voiceassist-server-pdb -n voiceassist
```

## Load Testing

### Test API Gateway
```bash
# Using hey tool (automated in test script)
kubectl run -it --rm load-generator --image=williamyeh/hey:latest -- \
  hey -z 5m -c 50 http://voiceassist-server.voiceassist.svc:8000/health
```

### Test Worker
```bash
# Generate jobs (automated in test script)
kubectl run -it --rm job-gen --image=redis:alpine -- \
  redis-cli -h voiceassist-redis lpush queue job1 job2 job3
```

## Rollback

```bash
# Rollback HPA setup
./setup-hpa.sh rollback dev

# Or manually delete resources
kubectl delete hpa --all -n voiceassist
kubectl delete vpa --all -n voiceassist
kubectl delete pdb --all -n voiceassist
```

## File Locations

```
k8s/performance/
├── api-gateway-hpa.yaml        # API Gateway HPA config
├── worker-hpa.yaml             # Worker HPA config
├── resource-limits.yaml        # Resource requests/limits
├── vpa-config.yaml             # VPA recommendations
├── pod-disruption-budget.yaml  # High availability
├── metrics-server.yaml         # Metrics Server install
├── kustomization.yaml          # Base Kustomize config
├── overlays/                   # Environment overlays
│   ├── dev/                    # Development
│   ├── staging/                # Staging
│   └── prod/                   # Production
├── setup-hpa.sh                # Automated setup
├── test-autoscaling.sh         # Load testing
└── README.md                   # Full documentation
```

## Metrics Endpoints

| Component | Endpoint | Port |
|-----------|----------|------|
| API Gateway | /metrics | 8000 |
| Worker | /metrics | 9090 |
| Metrics Server | /apis/metrics.k8s.io | - |

## Important Notes

1. Always apply to dev first, then staging, then production
2. Monitor for 24-48 hours after changes
3. Review VPA recommendations weekly
4. Test autoscaling after any HPA changes
5. Keep PDBs in place for production workloads
6. Use Kustomize overlays for environment differences
7. Document any manual threshold adjustments

## Support Resources

- Full Documentation: `README.md`
- Summary: `SUMMARY.md`
- Kubernetes HPA: https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/
- VPA Guide: https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler

## Common Scenarios

### Increase Max Replicas
Edit overlay file: `overlays/prod/hpa-patch.yaml`
```yaml
spec:
  maxReplicas: 20  # Increase from 15
```
Apply: `kubectl apply -k k8s/performance/overlays/prod/`

### Lower CPU Threshold
Edit overlay file or base: `api-gateway-hpa.yaml`
```yaml
averageUtilization: 60  # Lower from 70
```
Apply: `kubectl apply -f api-gateway-hpa.yaml`

### Add Custom Metric
Edit HPA: `api-gateway-hpa.yaml`
```yaml
- type: Pods
  pods:
    metric:
      name: your_custom_metric
    target:
      type: AverageValue
      averageValue: "100"
```

---
**Version:** 1.0 | **Date:** 2025-01-21 | **Phase:** 10
