# VoiceAssist Kubernetes Performance & Autoscaling

This directory contains Kubernetes manifests for autoscaling and resource optimization of the VoiceAssist application.

## Overview

The performance configuration includes:

- **HorizontalPodAutoscaler (HPA)**: Automatic scaling based on metrics
- **VerticalPodAutoscaler (VPA)**: Resource optimization recommendations
- **PodDisruptionBudgets (PDB)**: High availability during maintenance
- **Resource Limits**: Optimized CPU and memory configurations
- **Metrics Server**: Required infrastructure for metrics collection

## Directory Structure

```
k8s/performance/
├── api-gateway-hpa.yaml          # HPA for API Gateway (2-10 replicas)
├── worker-hpa.yaml               # HPA for Worker (1-5 replicas)
├── resource-limits.yaml          # Resource requests/limits for all components
├── vpa-config.yaml               # VPA for resource recommendations
├── pod-disruption-budget.yaml    # PDBs for high availability
├── metrics-server.yaml           # Metrics Server installation
├── kustomization.yaml            # Kustomize base configuration
├── overlays/                     # Environment-specific configurations
│   ├── dev/                      # Development environment
│   ├── staging/                  # Staging environment
│   └── prod/                     # Production environment
└── README.md                     # This file
```

## Prerequisites

1. **Kubernetes Cluster**: v1.23+ recommended
2. **kubectl**: Installed and configured
3. **Metrics Server**: Required for HPA (included in this package)
4. **VPA**: Optional, install separately if needed
5. **Prometheus**: Optional, for custom metrics

## Quick Start

### 1. Install Metrics Server

```bash
# Check if metrics-server is already installed
kubectl get deployment metrics-server -n kube-system

# If not installed, apply the manifest
kubectl apply -f metrics-server.yaml

# Wait for metrics-server to be ready
kubectl wait --for=condition=available --timeout=300s \
  deployment/metrics-server -n kube-system

# Verify metrics are available
kubectl top nodes
kubectl top pods -n voiceassist
```

### 2. Create Namespace

```bash
# Create the voiceassist namespace if it doesn't exist
kubectl create namespace voiceassist
```

### 3. Apply Base Configuration

```bash
# Apply all performance manifests
kubectl apply -k k8s/performance/

# Or apply individual manifests
kubectl apply -f api-gateway-hpa.yaml
kubectl apply -f worker-hpa.yaml
kubectl apply -f resource-limits.yaml
kubectl apply -f vpa-config.yaml
kubectl apply -f pod-disruption-budget.yaml
```

### 4. Apply Environment-Specific Configuration

```bash
# Development
kubectl apply -k k8s/performance/overlays/dev/

# Staging
kubectl apply -k k8s/performance/overlays/staging/

# Production
kubectl apply -k k8s/performance/overlays/prod/
```

## Autoscaling Configuration

### API Gateway (voiceassist-server)

**Scaling Triggers:**
- CPU > 70%
- Memory > 80%
- Requests per second > 100 req/s per pod

**Replica Bounds:**
- Development: 1-3 replicas
- Staging: 2-6 replicas
- Production: 3-15 replicas

**Behavior:**
- Scale up: 100% every 30s (max 2 pods at once)
- Scale down: 10% every 5m (max 1 pod at once)

### Worker (voiceassist-worker)

**Scaling Triggers:**
- CPU > 80%
- Memory > 85%
- Queue depth > 50 jobs per pod
- Queue age > 60 seconds

**Replica Bounds:**
- Development: 1-2 replicas
- Staging: 1-3 replicas
- Production: 2-8 replicas

**Behavior:**
- Scale up: 50% every 60s
- Scale down: 10% every 10m

## Resource Configuration

### API Gateway Pod

```yaml
Requests:  500m CPU, 512Mi Memory
Limits:    2000m CPU, 2Gi Memory
```

### Worker Pod

```yaml
Requests:  1000m CPU, 1Gi Memory
Limits:    4000m CPU, 4Gi Memory
```

### PostgreSQL Pod

```yaml
Requests:  1000m CPU, 2Gi Memory
Limits:    4000m CPU, 8Gi Memory
```

### Redis Pod

```yaml
Requests:  250m CPU, 256Mi Memory
Limits:    1000m CPU, 1Gi Memory
```

## Monitoring & Verification

### Check HPA Status

```bash
# List all HPAs
kubectl get hpa -n voiceassist

# Detailed HPA status
kubectl describe hpa voiceassist-server-hpa -n voiceassist
kubectl describe hpa voiceassist-worker-hpa -n voiceassist

# Watch HPA in real-time
kubectl get hpa -n voiceassist --watch
```

### Check VPA Recommendations

```bash
# View VPA recommendations
kubectl describe vpa voiceassist-server-vpa -n voiceassist

# Get specific recommendations (JSON format)
kubectl get vpa voiceassist-server-vpa -n voiceassist \
  -o jsonpath='{.status.recommendation}' | jq
```

### Check PodDisruptionBudgets

```bash
# List all PDBs
kubectl get pdb -n voiceassist

# Detailed PDB status
kubectl describe pdb voiceassist-server-pdb -n voiceassist
```

### Monitor Pod Resources

```bash
# Current resource usage
kubectl top pods -n voiceassist

# Watch resource usage in real-time
watch -n 2 kubectl top pods -n voiceassist

# Check pod events
kubectl get events -n voiceassist --sort-by='.lastTimestamp'
```

## Testing Autoscaling

### Test API Gateway Scaling

```bash
# Generate load using Apache Bench
kubectl run -it --rm load-generator --image=httpd:alpine -- sh -c \
  "ab -n 100000 -c 100 http://voiceassist-server.voiceassist.svc.cluster.local/"

# Or use a dedicated load testing pod
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: load-generator
  namespace: voiceassist
spec:
  containers:
  - name: load-generator
    image: williamyeh/hey:latest
    command: ["/bin/sh"]
    args: ["-c", "hey -z 10m -c 50 -q 10 http://voiceassist-server:8000/health"]
EOF

# Watch pod count increase
kubectl get pods -n voiceassist --watch
```

### Test Worker Scaling

```bash
# Submit jobs to trigger worker scaling
kubectl run -it --rm job-generator --image=redis:alpine -- sh -c \
  "redis-cli -h voiceassist-redis lpush queue_name job1 job2 job3"

# Watch worker pods scale
kubectl get pods -n voiceassist -l app=voiceassist-worker --watch
```

## Tuning Guidelines

### When to Adjust HPA Settings

1. **Frequent scaling up/down (flapping)**:
   - Increase stabilization window
   - Adjust target utilization thresholds
   - Review metric collection interval

2. **Slow response to load spikes**:
   - Decrease scale-up period
   - Increase scale-up percentage
   - Lower utilization thresholds

3. **Resource waste (too many idle pods)**:
   - Increase target utilization
   - Reduce max replicas
   - Increase scale-down aggressiveness

4. **Performance issues despite scaling**:
   - Increase resource limits
   - Review application bottlenecks
   - Check database/cache performance

### Tuning Process

1. **Baseline metrics** (1 week):
   ```bash
   # Collect metrics
   kubectl top pods -n voiceassist --containers > baseline.txt
   ```

2. **Analyze patterns**:
   - Peak traffic times
   - Average resource usage
   - Scaling frequency

3. **Adjust thresholds**:
   - Start with 5% changes
   - Monitor for 48 hours
   - Iterate based on results

4. **Test under load**:
   - Use load testing tools
   - Simulate peak traffic
   - Verify scaling behavior

## Custom Metrics Setup

### Prometheus Adapter (for custom metrics)

```bash
# Install Prometheus Adapter
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus-adapter prometheus-community/prometheus-adapter \
  --namespace monitoring \
  --set prometheus.url=http://prometheus-server.monitoring.svc \
  --set prometheus.port=80

# Verify custom metrics
kubectl get apiservices | grep custom.metrics
```

### Configure Custom Metrics

1. **HTTP requests per second**:
   - Expose `/metrics` endpoint in application
   - Instrument with Prometheus client library
   - Configure Prometheus to scrape metrics

2. **Queue depth**:
   - Export Redis queue length as metric
   - Use Redis Exporter or custom exporter
   - Configure HPA to use metric

Example custom metric configuration:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: custom-metric-hpa
spec:
  metrics:
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "100"
```

## Troubleshooting

### HPA Not Scaling

**Symptoms**: HPA shows "unknown" for metrics, pods don't scale

**Solutions**:

1. Check metrics-server:
   ```bash
   kubectl get apiservices v1beta1.metrics.k8s.io
   kubectl logs -n kube-system deployment/metrics-server
   ```

2. Verify metrics are available:
   ```bash
   kubectl top pods -n voiceassist
   kubectl get --raw /apis/metrics.k8s.io/v1beta1/namespaces/voiceassist/pods
   ```

3. Check HPA events:
   ```bash
   kubectl describe hpa voiceassist-server-hpa -n voiceassist
   ```

### Pods Being Evicted

**Symptoms**: Pods show "Evicted" status, frequent restarts

**Solutions**:

1. Check resource usage:
   ```bash
   kubectl top pods -n voiceassist
   kubectl describe pod <pod-name> -n voiceassist
   ```

2. Increase resource limits:
   ```bash
   kubectl patch deployment voiceassist-server -n voiceassist \
     -p '{"spec":{"template":{"spec":{"containers":[{"name":"server","resources":{"limits":{"memory":"3Gi"}}}]}}}}'
   ```

3. Review OOM events:
   ```bash
   kubectl get events -n voiceassist --field-selector reason=OOMKilled
   ```

### VPA Not Providing Recommendations

**Symptoms**: VPA recommendations are empty or stale

**Solutions**:

1. Check VPA installation:
   ```bash
   kubectl get pods -n kube-system | grep vpa
   ```

2. Verify VPA is watching the deployment:
   ```bash
   kubectl describe vpa voiceassist-server-vpa -n voiceassist
   ```

3. Wait for data collection (minimum 24 hours)

### Node Drain Blocked by PDB

**Symptoms**: `kubectl drain` hangs, nodes can't be evacuated

**Solutions**:

1. Check PDB status:
   ```bash
   kubectl get pdb -n voiceassist -o wide
   ```

2. Verify enough healthy pods:
   ```bash
   kubectl get pods -n voiceassist -l app=voiceassist-server
   ```

3. Temporarily disable PDB (emergency only):
   ```bash
   kubectl delete pdb voiceassist-server-pdb -n voiceassist
   # Drain node
   kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data
   # Re-create PDB
   kubectl apply -f pod-disruption-budget.yaml
   ```

## Best Practices

### 1. Always Set Resource Requests and Limits

- Requests: Used for scheduling decisions
- Limits: Prevent resource exhaustion
- Set limits 2-4x requests for burstable workloads

### 2. Start Conservative, Scale Gradually

- Begin with higher utilization targets (75-80%)
- Reduce gradually based on performance data
- Monitor for 1-2 weeks before major changes

### 3. Use PodDisruptionBudgets for Critical Services

- Frontend services: minAvailable ≥ 1
- Databases: minAvailable = total replicas
- Workers: maxUnavailable = 50%

### 4. Monitor and Alert

- Set up alerts for:
  - HPA unable to scale
  - Pods at resource limits
  - Frequent OOMKills
  - Scaling thrashing (rapid scale up/down)

### 5. Test Autoscaling Regularly

- Include load testing in CI/CD
- Verify scale-up during peak traffic
- Test scale-down during off-peak
- Simulate node failures

### 6. Review VPA Recommendations

- Weekly review of VPA recommendations
- Apply changes during maintenance windows
- A/B test resource changes when possible

### 7. Use Kustomize for Environment Management

- Base configuration for common settings
- Overlays for environment differences
- Version control all configurations

## Production Checklist

Before deploying to production:

- [ ] Metrics Server installed and verified
- [ ] Resource limits set for all containers
- [ ] HPAs configured with appropriate thresholds
- [ ] PodDisruptionBudgets created for critical services
- [ ] VPAs configured in recommendation mode
- [ ] Monitoring and alerting configured
- [ ] Load testing completed successfully
- [ ] Runbook created for scaling operations
- [ ] Team trained on troubleshooting procedures
- [ ] Rollback plan documented

## Additional Resources

- [Kubernetes HPA Documentation](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
- [VPA Documentation](https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler)
- [Resource Management Best Practices](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [PodDisruptionBudget Documentation](https://kubernetes.io/docs/concepts/workloads/pods/disruptions/)

## Support

For issues or questions:
- Create an issue in the repository
- Contact DevOps team: devops@voiceassist.com
- Slack: #voiceassist-infra

## License

Copyright (c) 2025 VoiceAssist Team
