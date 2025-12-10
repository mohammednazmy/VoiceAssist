# Encryption at Rest Implementation Guide

**Phase:** 11 - Security Hardening & HIPAA Compliance
**Component:** Data Encryption at Rest
**HIPAA Requirement:** §164.312(a)(2)(iv) - Encryption and Decryption

---

## Overview

This document describes how to implement encryption at rest for all VoiceAssist data stores to achieve HIPAA compliance. Encryption at rest protects data when stored on disk, ensuring that unauthorized access to physical storage media does not compromise PHI.

---

## 1. PostgreSQL Encryption

### 1.1 Filesystem-Level Encryption (Recommended)

**Linux (LUKS/dm-crypt):**

```bash
# 1. Create encrypted volume
sudo cryptsetup luksFormat /dev/sdb
sudo cryptsetup open /dev/sdb pgdata_encrypted

# 2. Create filesystem
sudo mkfs.ext4 /dev/mapper/pgdata_encrypted

# 3. Mount encrypted volume
sudo mkdir -p /mnt/pgdata_encrypted
sudo mount /dev/mapper/pgdata_encrypted /mnt/pgdata_encrypted

# 4. Update docker-compose.yml volume
volumes:
  postgres-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/pgdata_encrypted/postgres
```

**AWS RDS (Managed):**

```hcl
# Terraform configuration
resource "aws_db_instance" "voiceassist" {
  storage_encrypted = true
  kms_key_id        = aws_kms_key.rds.arn

  # ... other configuration
}

resource "aws_kms_key" "rds" {
  description             = "VoiceAssist RDS encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}
```

### 1.2 PostgreSQL Transparent Data Encryption (TDE)

While PostgreSQL doesn't have built-in TDE, use pgcrypto for column-level encryption:

```sql
-- Enable pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Example: Encrypt sensitive columns
CREATE TABLE patient_data (
    id SERIAL PRIMARY KEY,
    patient_id TEXT NOT NULL,
    ssn_encrypted BYTEA,  -- Encrypted SSN
    mrn_encrypted BYTEA,  -- Encrypted MRN
    created_at TIMESTAMP DEFAULT NOW()
);

-- Insert with encryption
INSERT INTO patient_data (patient_id, ssn_encrypted, mrn_encrypted)
VALUES (
    'PT-001',
    pgp_sym_encrypt('123-45-6789', 'encryption_key_from_vault'),
    pgp_sym_encrypt('MRN-12345', 'encryption_key_from_vault')
);

-- Query with decryption
SELECT
    patient_id,
    pgp_sym_decrypt(ssn_encrypted, 'encryption_key_from_vault') AS ssn,
    pgp_sym_decrypt(mrn_encrypted, 'encryption_key_from_vault') AS mrn
FROM patient_data
WHERE patient_id = 'PT-001';
```

**Implementation in FastAPI:**

```python
# services/api-gateway/app/core/encryption.py
from cryptography.fernet import Fernet
from app.core.config import settings

class DataEncryption:
    def __init__(self):
        self.cipher = Fernet(settings.ENCRYPTION_KEY.encode())

    def encrypt_field(self, plaintext: str) -> bytes:
        """Encrypt sensitive field data."""
        return self.cipher.encrypt(plaintext.encode())

    def decrypt_field(self, ciphertext: bytes) -> str:
        """Decrypt sensitive field data."""
        return self.cipher.decrypt(ciphertext).decode()

# Usage in models
from sqlalchemy import LargeBinary
from app.core.encryption import DataEncryption

encryption = DataEncryption()

class SensitiveData(Base):
    __tablename__ = "sensitive_data"

    id = Column(Integer, primary_key=True)
    ssn_encrypted = Column(LargeBinary)  # Stored encrypted

    def set_ssn(self, ssn: str):
        self.ssn_encrypted = encryption.encrypt_field(ssn)

    def get_ssn(self) -> str:
        return encryption.decrypt_field(self.ssn_encrypted)
```

---

## 2. Redis Encryption

### 2.1 TLS Encryption for Redis (In-Transit)

**docker-compose.yml:**

```yaml
redis:
  image: redis:7-alpine
  command: >
    redis-server
    --requirepass ${REDIS_PASSWORD}
    --tls-port 6380
    --port 0
    --tls-cert-file /tls/redis.crt
    --tls-key-file /tls/redis.key
    --tls-ca-cert-file /tls/ca.crt
    --tls-auth-clients no
  volumes:
    - redis-data:/data
    - ./security/mtls/redis:/tls:ro
  ports:
    - "6380:6380"
```

**Python Redis client with TLS:**

```python
# services/api-gateway/app/core/cache.py
import redis
from app.core.config import settings

redis_client = redis.Redis(
    host=settings.REDIS_HOST,
    port=6380,
    password=settings.REDIS_PASSWORD,
    ssl=True,
    ssl_cert_reqs='required',
    ssl_ca_certs='/path/to/ca.crt',
    ssl_certfile='/path/to/client.crt',
    ssl_keyfile='/path/to/client.key',
    decode_responses=True
)
```

### 2.2 Redis Persistence Encryption

Redis doesn't natively encrypt RDB/AOF files. Use filesystem encryption:

```bash
# Encrypt Redis data directory
sudo cryptsetup luksFormat /dev/sdc
sudo cryptsetup open /dev/sdc redis_encrypted
sudo mkfs.ext4 /dev/mapper/redis_encrypted
sudo mount /dev/mapper/redis_encrypted /mnt/redis_encrypted

# Update docker-compose volume
volumes:
  redis-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/redis_encrypted
```

---

## 3. Qdrant Vector Store Encryption

### 3.1 Filesystem-Level Encryption

```bash
# Encrypt Qdrant storage volume
sudo cryptsetup luksFormat /dev/sdd
sudo cryptsetup open /dev/sdd qdrant_encrypted
sudo mkfs.ext4 /dev/mapper/qdrant_encrypted
sudo mount /dev/mapper/qdrant_encrypted /mnt/qdrant_encrypted
```

**docker-compose.yml:**

```yaml
qdrant:
  image: qdrant/qdrant:latest
  volumes:
    - /mnt/qdrant_encrypted/qdrant_storage:/qdrant/storage:z
  environment:
    - QDRANT__SERVICE__API_KEY=${QDRANT_API_KEY}
```

### 3.2 HTTPS/TLS for Qdrant API

```yaml
qdrant:
  image: qdrant/qdrant:latest
  environment:
    - QDRANT__SERVICE__ENABLE_TLS=true
    - QDRANT__SERVICE__TLS_CERT=/tls/qdrant.crt
    - QDRANT__SERVICE__TLS_KEY=/tls/qdrant.key
  volumes:
    - ./security/mtls/qdrant:/tls:ro
```

---

## 4. Kubernetes Encryption at Rest

### 4.1 etcd Encryption

**encryption-config.yaml:**

```yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources:
      - secrets
      - configmaps
    providers:
      - aescbc:
          keys:
            - name: key1
              secret: <base64-encoded-32-byte-key>
      - identity: {}
```

**Apply to API server:**

```bash
# EKS: Encryption enabled by default with KMS
# Self-managed: Add to kube-apiserver flags
--encryption-provider-config=/etc/kubernetes/encryption-config.yaml
```

### 4.2 EBS Volume Encryption (AWS)

**Terraform:**

```hcl
resource "aws_ebs_volume" "postgres" {
  availability_zone = "us-east-1a"
  size              = 100
  encrypted         = true
  kms_key_id        = aws_kms_key.ebs.arn

  tags = {
    Name = "voiceassist-postgres-data"
  }
}

resource "aws_kms_key" "ebs" {
  description             = "VoiceAssist EBS encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}
```

**Kubernetes StorageClass:**

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: encrypted-gp3
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  encrypted: "true"
  kmsKeyId: "arn:aws:kms:us-east-1:123456789:key/..."
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
```

---

## 5. Encryption Key Management

### 5.1 Environment Variables (Development Only)

**.env (DO NOT COMMIT):**

```bash
# Encryption keys (32-byte base64-encoded)
ENCRYPTION_KEY=<base64-encoded-32-byte-key>
REDIS_PASSWORD=<strong-random-password>
POSTGRES_PASSWORD=<strong-random-password>
QDRANT_API_KEY=<random-api-key>
```

### 5.2 HashiCorp Vault (Production)

```bash
# Store encryption keys in Vault
vault kv put secret/voiceassist/encryption \
  key=$(openssl rand -base64 32) \
  redis_password=$(openssl rand -base64 32) \
  postgres_password=$(openssl rand -base64 32)

# Retrieve in application
vault kv get -field=key secret/voiceassist/encryption
```

**Python integration:**

```python
# services/api-gateway/app/core/vault.py
import hvac
from app.core.config import settings

class VaultClient:
    def __init__(self):
        self.client = hvac.Client(
            url=settings.VAULT_ADDR,
            token=settings.VAULT_TOKEN
        )

    def get_secret(self, path: str, key: str) -> str:
        """Retrieve secret from Vault."""
        secret = self.client.secrets.kv.v2.read_secret_version(path=path)
        return secret['data']['data'][key]

vault = VaultClient()
ENCRYPTION_KEY = vault.get_secret('voiceassist/encryption', 'key')
```

### 5.3 AWS Secrets Manager (AWS Deployments)

```python
import boto3
from botocore.exceptions import ClientError

def get_secret(secret_name: str) -> dict:
    session = boto3.session.Session()
    client = session.client(service_name='secretsmanager', region_name='us-east-1')

    try:
        response = client.get_secret_value(SecretId=secret_name)
        return json.loads(response['SecretString'])
    except ClientError as e:
        raise e

# Usage
secrets = get_secret('voiceassist/encryption-keys')
ENCRYPTION_KEY = secrets['encryption_key']
```

---

## 6. Verification & Testing

### 6.1 Verify Encryption is Active

```bash
# Check PostgreSQL encryption
psql -U voiceassist -c "SHOW ssl;"
psql -U voiceassist -c "SELECT * FROM pg_stat_ssl WHERE pid = pg_backend_pid();"

# Check Redis TLS
redis-cli --tls \
  --cert /path/to/client.crt \
  --key /path/to/client.key \
  --cacert /path/to/ca.crt \
  -h localhost -p 6380 PING

# Check filesystem encryption
sudo cryptsetup status pgdata_encrypted
sudo cryptsetup status redis_encrypted
```

### 6.2 Encryption Performance Testing

```python
# Test column-level encryption performance
import time
from app.core.encryption import DataEncryption

encryption = DataEncryption()

# Benchmark encryption
start = time.time()
for i in range(1000):
    encrypted = encryption.encrypt_field(f"sensitive-data-{i}")
    decrypted = encryption.decrypt_field(encrypted)
end = time.time()

print(f"1000 encrypt/decrypt cycles: {end - start:.3f} seconds")
```

---

## 7. HIPAA Compliance Checklist

- ✅ **Database encryption at rest** - Filesystem or native encryption
- ✅ **Redis encryption** - TLS for connections, filesystem for persistence
- ✅ **Qdrant encryption** - Filesystem encryption for vector storage
- ✅ **Encryption key management** - Vault/Secrets Manager for production
- ✅ **Key rotation procedures** - Documented and automated
- ✅ **Encryption verification** - Regular testing and monitoring
- ✅ **Backup encryption** - All backups encrypted
- ✅ **Secure key storage** - Never commit keys to source control

---

## 8. Key Rotation Procedures

### 8.1 Database Encryption Key Rotation

```bash
# 1. Generate new key
NEW_KEY=$(openssl rand -base64 32)

# 2. Store new key in Vault
vault kv put secret/voiceassist/encryption \
  key=$NEW_KEY \
  previous_key=$OLD_KEY

# 3. Re-encrypt data with new key (application-level)
python scripts/rotate-encryption-keys.py

# 4. Remove old key after grace period (30 days)
vault kv patch secret/voiceassist/encryption previous_key=""
```

### 8.2 TLS Certificate Rotation

```bash
# Automated with cert-manager in Kubernetes
kubectl apply -f k8s/security/cert-manager/certificate.yaml

# Manual rotation
./security/mtls/generate-certs.sh
kubectl create secret tls voiceassist-tls \
  --cert=./security/mtls/server.crt \
  --key=./security/mtls/server.key \
  --namespace=voiceassist \
  --dry-run=client -o yaml | kubectl apply -f -
```

---

## 9. Monitoring & Alerts

```yaml
# Prometheus alerts for encryption issues
groups:
  - name: encryption
    rules:
      - alert: TLSCertificateExpiringSoon
        expr: (ssl_cert_not_after - time()) / 86400 < 30
        annotations:
          summary: "TLS certificate expiring in < 30 days"

      - alert: EncryptionKeyRotationOverdue
        expr: time() - encryption_key_last_rotation_timestamp > 7776000 # 90 days
        annotations:
          summary: "Encryption key rotation overdue (>90 days)"
```

---

## 10. References

- **HIPAA Security Rule:** §164.312(a)(2)(iv) - Encryption and Decryption
- **NIST SP 800-111:** Guide to Storage Encryption Technologies
- **NIST SP 800-57:** Recommendation for Key Management
- **PostgreSQL Documentation:** [Encryption Options](https://www.postgresql.org/docs/current/encryption-options.html)
- **Redis Security:** [Redis TLS Support](https://redis.io/docs/manual/security/encryption/)
- **Kubernetes Encryption:** [Encrypting Secret Data at Rest](https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/)

---

**Document Version:** 1.0
**Last Updated:** 2025-11-21
**Next Review:** 2026-02-21 (90 days)
