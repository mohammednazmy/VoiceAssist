---
title: Compose To K8s Migration
slug: compose-to-k8s-migration
summary: >-
  This guide covers migrating VoiceAssist from Docker Compose (Phases 0-10) to
  Kubernetes (Phases 11-14). The migration maintains the **separate Nextclo...
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience:
  - human
  - ai-agents
tags:
  - compose
  - k8s
  - migration
category: reference
component: "infra/k8s"
relatedPaths:
  - "docker-compose.yml"
  - "k8s"
  - "ha-dr"
ai_summary: >-
  This guide covers migrating VoiceAssist from Docker Compose (Phases 0-10) to
  Kubernetes (Phases 11-14). The migration maintains the separate Nextcloud and
  VoiceAssist stacks architecture while adding Kubernetes features like
  auto-scaling, self-healing, and service mesh. 1. Migration Strategy 2. P...
---

# Docker Compose to Kubernetes Migration Guide

## Overview

This guide covers migrating VoiceAssist from Docker Compose (Phases 0-10) to Kubernetes (Phases 11-14). The migration maintains the **separate Nextcloud and VoiceAssist stacks** architecture while adding Kubernetes features like auto-scaling, self-healing, and service mesh.

## Table of Contents

1. [Migration Strategy](#migration-strategy)
2. [Prerequisites](#prerequisites)
3. [Compose vs Kubernetes Concepts](#compose-vs-kubernetes-concepts)
4. [Using Kompose for Initial Conversion](#using-kompose-for-initial-conversion)
5. [Manual Conversion Steps](#manual-conversion-steps)
6. [Nextcloud Kubernetes Deployment](#nextcloud-kubernetes-deployment)
7. [VoiceAssist Kubernetes Deployment](#voiceassist-kubernetes-deployment)
8. [Service Mesh Setup (Linkerd)](#service-mesh-setup-linkerd)
9. [High Availability Configuration](#high-availability-configuration)
10. [Testing & Validation](#testing--validation)
11. [Rollback Procedures](#rollback-procedures)

---

## Migration Strategy

### Phase-by-Phase Approach

```
Phase 0-10: Docker Compose Development
   ↓
Phase 11: Create K8s Manifests & Local Testing
   - Convert docker-compose.yml to K8s YAML
   - Test locally with K3s/Minikube
   - Fix issues, iterate
   ↓
Phase 12: Service Mesh & HA Configuration
   - Install Linkerd for mTLS
   - Configure HorizontalPodAutoscaler
   - Set up PodDisruptionBudgets
   - Database replication
   ↓
Phase 13: Final Testing
   - Load testing on K8s
   - Failover testing
   - Security testing
   - Performance benchmarking
   ↓
Phase 14: Production K8s Deployment
   - Deploy to production cluster
   - Gradual traffic migration
   - Monitor and optimize
```

### Parallel Deployment Strategy

Instead of cutover, run Compose and K8s in parallel:

```
Week 1: Deploy K8s cluster alongside Docker Compose
Week 2-3: Gradual traffic shift (10% → 50% → 100% to K8s)
Week 4: Decommission Docker Compose stack
```

---

## Prerequisites

### Local Testing Environment

```bash
# Install kubectl
sudo snap install kubectl --classic

# Install k3d (K3s in Docker - for local testing)
curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash

# Create local test cluster
k3d cluster create voiceassist-test --agents 2 --port "8080:80@loadbalancer"

# Verify
kubectl cluster-info
kubectl get nodes
```

### Required Tools

```bash
# Install kompose (Compose → K8s converter)
curl -L https://github.com/kubernetes/kompose/releases/download/v1.31.2/kompose-linux-amd64 -o kompose
chmod +x kompose
sudo mv kompose /usr/local/bin/

# Install Helm (K8s package manager)
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Install Linkerd CLI
curl --proto '=https' --tlsv1.2 -sSfL https://run.linkerd.io/install | sh
export PATH=$PATH:$HOME/.linkerd2/bin
```

---

## Compose vs Kubernetes Concepts

### Mapping Table

| Docker Compose    | Kubernetes                                  | Notes                                                |
| ----------------- | ------------------------------------------- | ---------------------------------------------------- |
| `service`         | Deployment + Service                        | Deployment manages pods, Service provides networking |
| `build`           | Docker build → push to registry → use image | K8s doesn't build, only pulls images                 |
| `image`           | Pod spec `image`                            | Same concept                                         |
| `ports`           | Service `type: LoadBalancer` or Ingress     | External access                                      |
| `expose`          | Service `type: ClusterIP`                   | Internal access only                                 |
| `environment`     | ConfigMap + Secret                          | ConfigMap for config, Secret for sensitive data      |
| `volumes`         | PersistentVolumeClaim (PVC)                 | Persistent storage                                   |
| `networks`        | NetworkPolicy                               | Control pod-to-pod communication                     |
| `depends_on`      | Init containers or probes                   | Ensure dependencies are ready                        |
| `restart: always` | Deployment default behavior                 | K8s auto-restarts failed pods                        |
| `scale`           | Deployment `replicas`                       | Manual or HorizontalPodAutoscaler                    |

### Example Conversion

**Docker Compose:**

```yaml
services:
  api-gateway:
    build: ./services/api-gateway
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    depends_on:
      - postgres
      - redis
    restart: always
```

**Kubernetes:**

```yaml
# Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      containers:
        - name: api-gateway
          image: voiceassist/api-gateway:latest
          ports:
            - containerPort: 8000
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: voiceassist-secrets
                  key: database-url
            - name: REDIS_URL
              valueFrom:
                configMapKeyRef:
                  name: voiceassist-config
                  key: redis-url
          livenessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 8000
            initialDelaySeconds: 10
            periodSeconds: 5
---
# Service
apiVersion: v1
kind: Service
metadata:
  name: api-gateway
spec:
  selector:
    app: api-gateway
  ports:
    - port: 8000
      targetPort: 8000
  type: ClusterIP
---
# Ingress (external access)
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-gateway-ingress
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - voiceassist.yourdomain.com
      secretName: voiceassist-tls
  rules:
    - host: voiceassist.yourdomain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api-gateway
                port:
                  number: 8000
```

---

## Using Kompose for Initial Conversion

### Convert Docker Compose to Kubernetes

```bash
cd ~/VoiceAssist

# Convert docker-compose.yml to K8s manifests
kompose convert -f docker-compose.yml -o k8s/

# Output files created in k8s/ directory:
# - api-gateway-deployment.yaml
# - api-gateway-service.yaml
# - postgres-deployment.yaml
# - postgres-service.yaml
# - ... etc
```

### Review and Refine

Kompose provides a starting point, but requires manual refinement:

1. **Add namespaces**
2. **Convert environment variables to ConfigMaps/Secrets**
3. **Add resource limits**
4. **Add health checks (liveness/readiness probes)**
5. **Configure Ingress**
6. **Set up PersistentVolumeClaims**
7. **Add NetworkPolicies**
8. **Configure HorizontalPodAutoscaler**

---

## Manual Conversion Steps

### Step 1: Create Namespaces

```yaml
# namespaces.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: nextcloud
  labels:
    name: nextcloud
---
apiVersion: v1
kind: Namespace
metadata:
  name: voiceassist
  labels:
    name: voiceassist
---
apiVersion: v1
kind: Namespace
metadata:
  name: observability
  labels:
    name: observability
```

```bash
kubectl apply -f namespaces.yaml
```

### Step 2: Create Secrets

```bash
# Generate secrets
kubectl create secret generic voiceassist-secrets \
  --namespace=voiceassist \
  --from-literal=database-url="postgresql://user:pass@postgres:5432/voiceassist" \
  --from-literal=redis-password="redis-password" \
  --from-literal=openai-api-key="sk-..." \
  --from-literal=jwt-secret="jwt-secret" \
  --dry-run=client -o yaml > k8s/voiceassist-secrets.yaml

# Edit and apply
kubectl apply -f k8s/voiceassist-secrets.yaml

# Nextcloud secrets
kubectl create secret generic nextcloud-secrets \
  --namespace=nextcloud \
  --from-literal=postgres-password="nextcloud-db-pass" \
  --from-literal=admin-password="admin-pass" \
  --from-literal=oidc-client-secret="oidc-secret" \
  --dry-run=client -o yaml > k8s/nextcloud-secrets.yaml

kubectl apply -f k8s/nextcloud-secrets.yaml
```

### Step 3: Create ConfigMaps

```yaml
# voiceassist-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: voiceassist-config
  namespace: voiceassist
data:
  environment: "production"
  log-level: "INFO"
  nextcloud-base-url: "https://nextcloud.yourdomain.com"
  nextcloud-webdav-url: "https://nextcloud.yourdomain.com/remote.php/dav"
  nextcloud-caldav-url: "https://nextcloud.yourdomain.com/remote.php/dav/calendars"
  redis-url: "redis://redis:6379"
  qdrant-url: "http://qdrant:6333"
  postgres-host: "postgres"
  postgres-port: "5432"
  postgres-db: "voiceassist"
```

```bash
kubectl apply -f k8s/voiceassist-config.yaml
```

### Step 4: Create PersistentVolumeClaims

```yaml
# postgres-pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: voiceassist
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 50Gi
  storageClassName: standard # Or your cloud provider's storage class
---
# qdrant-pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: qdrant-pvc
  namespace: voiceassist
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 100Gi
  storageClassName: standard
---
# nextcloud-pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: nextcloud-data-pvc
  namespace: nextcloud
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 200Gi
  storageClassName: standard
```

```bash
kubectl apply -f k8s/postgres-pvc.yaml
kubectl apply -f k8s/qdrant-pvc.yaml
kubectl apply -f k8s/nextcloud-pvc.yaml
```

---

## Nextcloud Kubernetes Deployment

### Nextcloud Deployment

```yaml
# k8s/nextcloud/nextcloud-db-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nextcloud-db
  namespace: nextcloud
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nextcloud-db
  template:
    metadata:
      labels:
        app: nextcloud-db
    spec:
      containers:
        - name: postgres
          image: postgres:15-alpine
          env:
            - name: POSTGRES_DB
              value: "nextcloud"
            - name: POSTGRES_USER
              value: "nextcloud"
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: nextcloud-secrets
                  key: postgres-password
          ports:
            - containerPort: 5432
          volumeMounts:
            - name: postgres-storage
              mountPath: /var/lib/postgresql/data
          resources:
            requests:
              memory: "1Gi"
              cpu: "500m"
            limits:
              memory: "2Gi"
              cpu: "1"
      volumes:
        - name: postgres-storage
          persistentVolumeClaim:
            claimName: nextcloud-db-pvc
---
# k8s/nextcloud/nextcloud-db-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: nextcloud-db
  namespace: nextcloud
spec:
  selector:
    app: nextcloud-db
  ports:
    - port: 5432
      targetPort: 5432
  type: ClusterIP
---
# k8s/nextcloud/nextcloud-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nextcloud
  namespace: nextcloud
spec:
  replicas: 2
  selector:
    matchLabels:
      app: nextcloud
  template:
    metadata:
      labels:
        app: nextcloud
    spec:
      containers:
        - name: nextcloud
          image: nextcloud:latest
          env:
            - name: POSTGRES_HOST
              value: "nextcloud-db"
            - name: POSTGRES_DB
              value: "nextcloud"
            - name: POSTGRES_USER
              value: "nextcloud"
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: nextcloud-secrets
                  key: postgres-password
            - name: NEXTCLOUD_ADMIN_USER
              value: "admin"
            - name: NEXTCLOUD_ADMIN_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: nextcloud-secrets
                  key: admin-password
            - name: NEXTCLOUD_TRUSTED_DOMAINS
              value: "nextcloud.yourdomain.com"
            - name: OVERWRITEPROTOCOL
              value: "https"
            - name: OVERWRITEHOST
              value: "nextcloud.yourdomain.com"
          ports:
            - containerPort: 80
          volumeMounts:
            - name: nextcloud-data
              mountPath: /var/www/html
          livenessProbe:
            httpGet:
              path: /status.php
              port: 80
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /status.php
              port: 80
            initialDelaySeconds: 10
            periodSeconds: 5
          resources:
            requests:
              memory: "2Gi"
              cpu: "1"
            limits:
              memory: "4Gi"
              cpu: "2"
      volumes:
        - name: nextcloud-data
          persistentVolumeClaim:
            claimName: nextcloud-data-pvc
---
# k8s/nextcloud/nextcloud-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: nextcloud
  namespace: nextcloud
spec:
  selector:
    app: nextcloud
  ports:
    - port: 80
      targetPort: 80
  type: ClusterIP
---
# k8s/nextcloud/nextcloud-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: nextcloud-ingress
  namespace: nextcloud
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt
    nginx.ingress.kubernetes.io/proxy-body-size: "10G"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - nextcloud.yourdomain.com
      secretName: nextcloud-tls
  rules:
    - host: nextcloud.yourdomain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: nextcloud
                port:
                  number: 80
```

```bash
# Apply Nextcloud manifests
kubectl apply -f k8s/nextcloud/
```

---

## VoiceAssist Kubernetes Deployment

### Complete VoiceAssist Stack

I'll show one microservice example. Repeat for all services.

```yaml
# k8s/voiceassist/postgres-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
  namespace: voiceassist
spec:
  replicas: 1 # For HA, use StatefulSet with replication
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: pgvector/pgvector:pg16
          env:
            - name: POSTGRES_DB
              valueFrom:
                configMapKeyRef:
                  name: voiceassist-config
                  key: postgres-db
            - name: POSTGRES_USER
              value: "voiceassist"
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: voiceassist-secrets
                  key: database-password
          ports:
            - containerPort: 5432
          volumeMounts:
            - name: postgres-storage
              mountPath: /var/lib/postgresql/data
          resources:
            requests:
              memory: "2Gi"
              cpu: "1"
            limits:
              memory: "4Gi"
              cpu: "2"
      volumes:
        - name: postgres-storage
          persistentVolumeClaim:
            claimName: postgres-pvc
---
# k8s/voiceassist/postgres-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: voiceassist
spec:
  selector:
    app: postgres
  ports:
    - port: 5432
      targetPort: 5432
  type: ClusterIP
---
# k8s/voiceassist/api-gateway-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
  namespace: voiceassist
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
      annotations:
        linkerd.io/inject: enabled # Enable service mesh
    spec:
      containers:
        - name: api-gateway
          image: voiceassist/api-gateway:latest
          ports:
            - containerPort: 8000
          envFrom:
            - configMapRef:
                name: voiceassist-config
            - secretRef:
                name: voiceassist-secrets
          livenessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 8000
            initialDelaySeconds: 10
            periodSeconds: 5
          resources:
            requests:
              memory: "1Gi"
              cpu: "500m"
            limits:
              memory: "2Gi"
              cpu: "1"
---
# k8s/voiceassist/api-gateway-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: api-gateway
  namespace: voiceassist
spec:
  selector:
    app: api-gateway
  ports:
    - port: 8000
      targetPort: 8000
  type: ClusterIP
---
# k8s/voiceassist/api-gateway-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-gateway-ingress
  namespace: voiceassist
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - voiceassist.yourdomain.com
      secretName: voiceassist-tls
  rules:
    - host: voiceassist.yourdomain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api-gateway
                port:
                  number: 8000
```

```bash
# Apply VoiceAssist manifests
kubectl apply -f k8s/voiceassist/
```

---

## Service Mesh Setup (Linkerd)

### Install Linkerd

```bash
# Check if cluster is ready
linkerd check --pre

# Install Linkerd CRDs
linkerd install --crds | kubectl apply -f -

# Install Linkerd control plane
linkerd install | kubectl apply -f -

# Verify installation
linkerd check

# Install Linkerd Viz (observability)
linkerd viz install | kubectl apply -f -
```

### Inject Service Mesh

```bash
# Option 1: Auto-inject per namespace
kubectl annotate namespace voiceassist linkerd.io/inject=enabled
kubectl annotate namespace nextcloud linkerd.io/inject=enabled

# Restart deployments to inject sidecar
kubectl rollout restart deployment -n voiceassist
kubectl rollout restart deployment -n nextcloud

# Option 2: Manual injection per deployment
# Add annotation to pod template:
# annotations:
#   linkerd.io/inject: enabled
```

### Verify mTLS

```bash
# Check that services have mTLS
linkerd viz stat deploy -n voiceassist

# View service graph
linkerd viz dashboard

# Check specific service
linkerd viz edges deployment -n voiceassist
```

---

## High Availability Configuration

### HorizontalPodAutoscaler

```yaml
# k8s/voiceassist/api-gateway-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-gateway-hpa
  namespace: voiceassist
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-gateway
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

### PodDisruptionBudget

```yaml
# k8s/voiceassist/api-gateway-pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api-gateway-pdb
  namespace: voiceassist
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: api-gateway
```

### Database Replication (PostgreSQL)

For production, use PostgreSQL StatefulSet with replication:

```yaml
# k8s/voiceassist/postgres-statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: voiceassist
spec:
  serviceName: postgres
  replicas: 3 # 1 primary + 2 replicas
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: bitnami/postgresql-repmgr:15
          env:
            - name: POSTGRESQL_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: voiceassist-secrets
                  key: database-password
            - name: REPMGR_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: voiceassist-secrets
                  key: repmgr-password
            - name: REPMGR_PRIMARY_HOST
              value: "postgres-0.postgres.voiceassist.svc.cluster.local"
            - name: REPMGR_PARTNER_NODES
              value: "postgres-0.postgres.voiceassist.svc.cluster.local,postgres-1.postgres.voiceassist.svc.cluster.local,postgres-2.postgres.voiceassist.svc.cluster.local"
          ports:
            - containerPort: 5432
          volumeMounts:
            - name: data
              mountPath: /bitnami/postgresql
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 50Gi
```

---

## Testing & Validation

### Smoke Tests

```bash
# Check all pods are running
kubectl get pods -n voiceassist
kubectl get pods -n nextcloud

# Check services
kubectl get svc -n voiceassist
kubectl get svc -n nextcloud

# Check ingresses
kubectl get ingress -n voiceassist
kubectl get ingress -n nextcloud

# Test external access
curl https://voiceassist.yourdomain.com/health
curl https://nextcloud.yourdomain.com/status.php
```

### Load Testing

```bash
# Install k6
brew install k6  # macOS
# or
sudo snap install k6  # Linux

# Create load test script
cat > load-test.js <<'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },  # Ramp up to 100 users
    { duration: '5m', target: 100 },  # Stay at 100 users
    { duration: '2m', target: 0 },    # Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  # 95% of requests < 500ms
  },
};

export default function () {
  let response = http.get('https://voiceassist.yourdomain.com/health');
  check(response, {
    'is status 200': (r) => r.status === 200,
  });
  sleep(1);
}
EOF

# Run load test
k6 run load-test.js
```

### Failover Testing

```bash
# Kill a pod and verify auto-restart
kubectl delete pod -n voiceassist api-gateway-<pod-id>

# Watch pods restart
kubectl get pods -n voiceassist -w

# Verify service still accessible
curl https://voiceassist.yourdomain.com/health
```

---

## Rollback Procedures

### Rollback Deployment

```bash
# View deployment history
kubectl rollout history deployment/api-gateway -n voiceassist

# Rollback to previous version
kubectl rollout undo deployment/api-gateway -n voiceassist

# Rollback to specific revision
kubectl rollout undo deployment/api-gateway -n voiceassist --to-revision=2

# Monitor rollback
kubectl rollout status deployment/api-gateway -n voiceassist
```

### Emergency Rollback to Docker Compose

If Kubernetes deployment fails critically:

```bash
# Stop K8s ingress (redirect traffic back to Compose)
kubectl delete ingress api-gateway-ingress -n voiceassist

# Update DNS to point to Docker Compose server
# (or update load balancer)

# Restart Docker Compose stack
cd /opt/voiceassist-prod
docker compose up -d
```

---

## Deployment Checklist

### Pre-Migration

- [ ] Docker Compose stack working perfectly
- [ ] All images pushed to container registry
- [ ] Kubernetes cluster provisioned
- [ ] kubectl configured
- [ ] Ingress controller installed (nginx/traefik)
- [ ] cert-manager installed for SSL
- [ ] Storage classes configured
- [ ] Backup of Compose data created

### During Migration

- [ ] Namespaces created
- [ ] Secrets created
- [ ] ConfigMaps created
- [ ] PVCs created and bound
- [ ] Nextcloud deployed and healthy
- [ ] VoiceAssist services deployed and healthy
- [ ] Linkerd installed and injected
- [ ] HPAs configured
- [ ] PDBs configured
- [ ] NetworkPolicies applied
- [ ] Ingress configured with SSL
- [ ] DNS updated

### Post-Migration

- [ ] Smoke tests passing
- [ ] Load tests passing
- [ ] Failover tests passing
- [ ] Monitoring dashboards working
- [ ] Alerts configured
- [ ] Backups configured
- [ ] Documentation updated
- [ ] Team trained on K8s operations

---

## Common Issues & Solutions

### Issue: Pods in Pending State

```bash
# Check events
kubectl describe pod <pod-name> -n voiceassist

# Common causes:
# 1. PVC not bound
kubectl get pvc -n voiceassist

# 2. Insufficient resources
kubectl describe nodes

# 3. Image pull error
kubectl get events -n voiceassist --sort-by='.lastTimestamp'
```

### Issue: Service Not Accessible

```bash
# Check service endpoints
kubectl get endpoints <service-name> -n voiceassist

# Check pod labels match service selector
kubectl get pods --show-labels -n voiceassist
kubectl get svc <service-name> -n voiceassist -o yaml | grep selector

# Test internal connectivity
kubectl run -it --rm debug --image=busybox --restart=Never -- wget -O- http://<service-name>.<namespace>.svc.cluster.local:<port>/health
```

### Issue: Database Connection Errors

```bash
# Check if postgres is running
kubectl get pods -n voiceassist -l app=postgres

# Check postgres logs
kubectl logs -n voiceassist deployment/postgres

# Test connection
kubectl exec -it deployment/api-gateway -n voiceassist -- nc -zv postgres 5432

# Verify secrets
kubectl get secret voiceassist-secrets -n voiceassist -o yaml
```

---

## References

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Kompose Documentation](https://kompose.io/)
- [Linkerd Documentation](https://linkerd.io/docs/)
- [cert-manager Documentation](https://cert-manager.io/docs/)
- [Helm Documentation](https://helm.sh/docs/)
- [K8s Best Practices](https://kubernetes.io/docs/concepts/configuration/overview/)

---

## Next Steps

After successful Kubernetes migration:

1. Fine-tune resource requests/limits
2. Implement GitOps (Flux/ArgoCD)
3. Set up cost monitoring
4. Implement chaos engineering tests
5. Document runbooks for common operations
