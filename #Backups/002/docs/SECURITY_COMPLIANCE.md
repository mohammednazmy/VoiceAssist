# Security & Compliance Guide

## Overview

VoiceAssist V2 is designed as a **HIPAA-compliant**, **zero-trust** medical AI assistant that handles Protected Health Information (PHI). This document outlines security requirements, implementation strategies, and compliance procedures.

## Table of Contents

1. [HIPAA Compliance](#hipaa-compliance)
2. [Zero-Trust Architecture](#zero-trust-architecture)
3. [Encryption](#encryption)
4. [Authentication & Authorization](#authentication--authorization)
5. [PHI Detection & Redaction](#phi-detection--redaction)
6. [Audit Logging](#audit-logging)
7. [Network Security](#network-security)
8. [Data Retention & Disposal](#data-retention--disposal)
9. [Incident Response](#incident-response)
10. [Security Monitoring](#security-monitoring)
11. [Compliance Checklists](#compliance-checklists)

---

## HIPAA Compliance

### HIPAA Security Rule Requirements

VoiceAssist implements the following HIPAA Security Rule requirements:

#### Administrative Safeguards

**1. Security Management Process**
- Risk Analysis: Annual security risk assessments
- Risk Management: Documented mitigation strategies
- Sanction Policy: Employee discipline for violations
- Information System Activity Review: Regular audit log reviews

**2. Assigned Security Responsibility**
- Designated Security Official (Admin role)
- Security incident response team
- Regular security training

**3. Workforce Security**
- Authorization/Supervision procedures
- Workforce clearance procedures
- Termination procedures (access revocation)

**4. Information Access Management**
- Access Authorization policies
- Access Establishment/Modification procedures
- Role-Based Access Control (RBAC)

**5. Security Awareness and Training**
- Security reminders (quarterly)
- Protection from malicious software
- Log-in monitoring
- Password management training

**6. Security Incident Procedures**
- Incident response plan
- Incident reporting procedures
- Incident documentation

**7. Contingency Plan**
- Data backup plan (automated daily backups)
- Disaster recovery plan
- Emergency mode operation plan
- Testing and revision procedures

**8. Evaluation**
- Annual security evaluations
- Periodic technical and non-technical evaluations

**9. Business Associate Agreements**
- OpenAI API (Business Associate Agreement required)
- UpToDate API (BAA required)
- OpenEvidence API (BAA required)
- Cloud hosting provider (BAA required if using cloud)

#### Physical Safeguards

**1. Facility Access Controls**
- Contingency operations (backup power, redundancy)
- Facility security plan (datacenter access controls)
- Access control and validation procedures
- Maintenance records

**2. Workstation Use**
- Workstation security policies
- Screen lock requirements (5 minutes idle)
- Encrypted workstations

**3. Workstation Security**
- Physical security of workstations
- Restricted access to terminals

**4. Device and Media Controls**
- Disposal procedures (secure wipe/destroy)
- Media re-use procedures
- Accountability tracking
- Data backup and storage

#### Technical Safeguards

**1. Access Control**
- Unique User Identification (via Nextcloud OIDC)
- Emergency Access Procedure
- Automatic Logoff (30 minutes session timeout)
- Encryption and Decryption (AES-256)

**2. Audit Controls**
- Hardware, software, and procedural mechanisms to record and examine activity

**3. Integrity**
- Mechanism to authenticate ePHI is not improperly altered or destroyed
- Digital signatures for critical data

**4. Person or Entity Authentication**
- Verify that a person or entity seeking access is who they claim to be
- Multi-factor authentication available

**5. Transmission Security**
- Integrity controls (checksums, digital signatures)
- Encryption (TLS 1.3 for all network communications)

### HIPAA Implementation in VoiceAssist

| HIPAA Requirement | VoiceAssist Implementation |
|------------------|----------------------------|
| Access Control | RBAC via Nextcloud OIDC + JWT tokens |
| Audit Logging | Comprehensive audit logs (all PHI access tracked) |
| Authentication | OIDC/OAuth2 + optional MFA |
| Encryption at Rest | AES-256 encryption for database and file storage |
| Encryption in Transit | TLS 1.3 for all communications |
| Data Backup | Automated daily backups with encryption |
| Emergency Access | Admin override with audit trail |
| Session Management | 30-minute timeout, secure session tokens |
| PHI Minimization | PHI detection service redacts unnecessary PHI |
| Audit Trail | Immutable audit logs stored separately |

---

## Zero-Trust Architecture

### Zero-Trust Principles

1. **Never Trust, Always Verify**: Every request is authenticated and authorized
2. **Least Privilege Access**: Users/services get minimum required permissions
3. **Assume Breach**: Design assumes attacker has network access
4. **Verify Explicitly**: Use all available data points for authorization decisions
5. **Microsegmentation**: Network isolation between services

### Implementation

#### 1. Service-to-Service Authentication

**Docker Compose (Phases 0-10):**
```yaml
# Each service authenticates via API keys
services:
  api-gateway:
    environment:
      - SERVICE_API_KEY=${API_GATEWAY_KEY}

  medical-kb:
    environment:
      - SERVICE_API_KEY=${MEDICAL_KB_KEY}
      - REQUIRED_API_KEYS=${API_GATEWAY_KEY}
```

**Kubernetes (Phases 11-14):**
```yaml
# Service mesh (Linkerd) provides mTLS
---
apiVersion: v1
kind: Service
metadata:
  annotations:
    linkerd.io/inject: enabled
spec:
  # mTLS automatically enabled
```

#### 2. Network Segmentation

**Docker Compose:**
```yaml
networks:
  public:  # API Gateway only
  internal:  # Microservices
  database:  # Database access only
    internal: true  # No external access
```

**Kubernetes:**
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-gateway-policy
spec:
  podSelector:
    matchLabels:
      app: api-gateway
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector: {}
    ports:
    - protocol: TCP
      port: 8000
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: auth-service
    ports:
    - protocol: TCP
      port: 8002
```

#### 3. Identity-Based Access

```python
# Every API request requires:
# 1. Valid JWT token from Nextcloud OIDC
# 2. Role-based permission check
# 3. Resource-level access validation

@router.get("/medical-record/{record_id}")
async def get_medical_record(
    record_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 1. User already authenticated (JWT valid)
    # 2. Check user role
    if current_user.role not in ["doctor", "nurse", "admin"]:
        raise HTTPException(status_code=403)

    # 3. Check resource-level access
    record = db.query(MedicalRecord).filter(
        MedicalRecord.id == record_id,
        MedicalRecord.authorized_users.contains(current_user.id)
    ).first()

    if not record:
        raise HTTPException(status_code=404)

    # 4. Log access
    audit_log.log_access(
        user_id=current_user.id,
        resource="medical_record",
        resource_id=record_id,
        action="read"
    )

    return record
```

#### 4. Short-Lived Credentials

```python
# JWT tokens expire after 1 hour
JWT_EXPIRATION = 3600  # seconds

# Refresh tokens expire after 7 days
REFRESH_TOKEN_EXPIRATION = 604800  # seconds

# Service-to-service tokens rotate every 5 minutes
SERVICE_TOKEN_EXPIRATION = 300  # seconds
```

#### 5. Continuous Verification

```python
# Every request goes through middleware that verifies:
# - Token validity
# - Token not revoked
# - User still has required permissions
# - Rate limiting
# - Anomaly detection

@app.middleware("http")
async def security_middleware(request: Request, call_next):
    # Verify token
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not verify_token(token):
        return JSONResponse(status_code=401, content={"error": "Invalid token"})

    # Check if token revoked
    if await redis.get(f"revoked:{token}"):
        return JSONResponse(status_code=401, content={"error": "Token revoked"})

    # Rate limiting
    user_id = get_user_from_token(token)
    if not await rate_limiter.check(user_id):
        return JSONResponse(status_code=429, content={"error": "Rate limit exceeded"})

    # Anomaly detection
    if await detect_anomaly(user_id, request):
        await alert_security_team(user_id, request)

    response = await call_next(request)
    return response
```

---

## Encryption

### Encryption at Rest

#### 1. Database Encryption

**PostgreSQL (Transparent Data Encryption):**
```sql
-- Enable pgcrypto extension
CREATE EXTENSION pgcrypto;

-- Encrypt sensitive columns
CREATE TABLE medical_records (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL,
    diagnosis TEXT NOT NULL,  -- Encrypted column
    notes TEXT,               -- Encrypted column
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    encryption_key_id VARCHAR(255) NOT NULL
);

-- Encrypt data before insert
INSERT INTO medical_records (id, patient_id, diagnosis, notes, encryption_key_id)
VALUES (
    gen_random_uuid(),
    'patient-uuid',
    pgp_sym_encrypt('Patient has diabetes', 'encryption_key'),
    pgp_sym_encrypt('Notes about treatment', 'encryption_key'),
    'key-id-123'
);

-- Decrypt on read
SELECT
    id,
    patient_id,
    pgp_sym_decrypt(diagnosis::bytea, 'encryption_key') AS diagnosis,
    pgp_sym_decrypt(notes::bytea, 'encryption_key') AS notes
FROM medical_records;
```

**Application-Level Encryption:**
```python
from cryptography.fernet import Fernet
import os

class EncryptionService:
    def __init__(self):
        # Use environment variable for encryption key
        # In production, use key management service (AWS KMS, Azure Key Vault, etc.)
        self.key = os.environ.get("ENCRYPTION_KEY").encode()
        self.cipher = Fernet(self.key)

    def encrypt(self, data: str) -> bytes:
        """Encrypt plaintext data"""
        return self.cipher.encrypt(data.encode())

    def decrypt(self, encrypted_data: bytes) -> str:
        """Decrypt encrypted data"""
        return self.cipher.decrypt(encrypted_data).decode()

# Usage in models
class MedicalRecord(Base):
    __tablename__ = "medical_records"

    id = Column(UUID, primary_key=True)
    patient_id = Column(UUID, nullable=False)
    _diagnosis = Column("diagnosis", LargeBinary)  # Encrypted
    _notes = Column("notes", LargeBinary)  # Encrypted

    @property
    def diagnosis(self) -> str:
        if self._diagnosis:
            return encryption_service.decrypt(self._diagnosis)
        return None

    @diagnosis.setter
    def diagnosis(self, value: str):
        if value:
            self._diagnosis = encryption_service.encrypt(value)
```

#### 2. File Storage Encryption

```python
import boto3
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

class SecureFileStorage:
    def __init__(self):
        self.s3 = boto3.client('s3')
        self.bucket = os.environ.get("S3_BUCKET")

    def upload_file(self, file_data: bytes, file_name: str, user_id: str):
        # Generate unique encryption key for this file
        file_key = os.urandom(32)
        iv = os.urandom(16)

        # Encrypt file
        cipher = Cipher(
            algorithms.AES(file_key),
            modes.GCM(iv),
            backend=default_backend()
        )
        encryptor = cipher.encryptor()
        encrypted_data = encryptor.update(file_data) + encryptor.finalize()

        # Store encryption key in database (encrypted with master key)
        encryption_key_record = FileEncryptionKey(
            file_id=file_name,
            encrypted_key=master_encrypt(file_key),
            iv=iv,
            user_id=user_id
        )
        db.add(encryption_key_record)
        db.commit()

        # Upload to S3 with server-side encryption
        self.s3.put_object(
            Bucket=self.bucket,
            Key=file_name,
            Body=encrypted_data,
            ServerSideEncryption='AES256'
        )
```

#### 3. Backup Encryption

```bash
#!/bin/bash
# backup-encrypted.sh

BACKUP_DIR="/opt/backups"
DATE=$(date +%Y%m%d_%H%M%S)
ENCRYPTION_KEY="$BACKUP_ENCRYPTION_KEY"  # From environment

# Backup PostgreSQL and encrypt
docker exec voiceassist-prod-postgres-1 pg_dump -U voiceassist voiceassist | \
  gzip | \
  openssl enc -aes-256-cbc -salt -pbkdf2 -k "$ENCRYPTION_KEY" \
  > "$BACKUP_DIR/voiceassist_db_$DATE.sql.gz.enc"

# Backup files and encrypt
tar czf - /data/voiceassist | \
  openssl enc -aes-256-cbc -salt -pbkdf2 -k "$ENCRYPTION_KEY" \
  > "$BACKUP_DIR/voiceassist_data_$DATE.tar.gz.enc"

echo "Encrypted backups created"
```

### Encryption in Transit

#### 1. TLS Configuration

**Traefik TLS Configuration:**
```yaml
# traefik.yml
entryPoints:
  websecure:
    address: ":443"
    http:
      tls:
        options: strict

tls:
  options:
    strict:
      minVersion: VersionTLS13
      cipherSuites:
        - TLS_AES_256_GCM_SHA384
        - TLS_CHACHA20_POLY1305_SHA256
      curvePreferences:
        - CurveP521
        - CurveP384
```

#### 2. Internal Service Communication

**Docker Compose (Phases 0-10):**
```yaml
# Use internal networks + API key authentication
services:
  api-gateway:
    networks:
      - public
      - internal
    environment:
      - TLS_CERT=/certs/cert.pem
      - TLS_KEY=/certs/key.pem
```

**Kubernetes (Phases 11-14):**
```yaml
# Linkerd provides automatic mTLS
---
apiVersion: linkerd.io/v1alpha2
kind: ServiceProfile
metadata:
  name: medical-kb
spec:
  routes:
  - condition:
      method: GET
      pathRegex: /api/.*
    name: api-route
    isRetryable: false
    timeout: 30s
```

#### 3. Client-to-Server (WebRTC Voice)

```javascript
// WebRTC with DTLS-SRTP encryption
const peerConnection = new RTCPeerConnection({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ],
  // Force DTLS-SRTP encryption
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
});

// Verify encryption is active
peerConnection.getStats().then(stats => {
  stats.forEach(report => {
    if (report.type === 'transport') {
      console.log('DTLS State:', report.dtlsState);  // Must be 'connected'
      console.log('SRTP Cipher:', report.srtpCipher);  // e.g., 'AES_CM_128_HMAC_SHA1_80'
    }
  });
});
```

---

## Authentication & Authorization

### Authentication Flow

```
1. User → VoiceAssist Web App
2. Web App → Nextcloud OIDC (/auth/login)
3. Nextcloud → User (login form)
4. User → Nextcloud (credentials)
5. Nextcloud → Web App (authorization code)
6. Web App → Nextcloud (/token endpoint)
7. Nextcloud → Web App (ID token + access token)
8. Web App → API Gateway (access token)
9. API Gateway → Auth Service (verify token)
10. Auth Service → Nextcloud (validate token)
11. Nextcloud → Auth Service (user info)
12. Auth Service → API Gateway (JWT token with user info + roles)
13. API Gateway → Web App (JWT token)
14. Web App stores JWT in httpOnly cookie
```

### Authorization Levels

| Role | Permissions |
|------|-------------|
| **Admin** | Full system access, user management, audit log access |
| **Doctor** | Read/write patient records, prescribe medications, view medical knowledge |
| **Nurse** | Read/write patient records, limited prescribing, view medical knowledge |
| **Patient** | Read own records only, limited voice assistant access |
| **Researcher** | Read de-identified data only, no PHI access |
| **API Service** | Service-specific permissions (e.g., file-indexer can read files) |

### RBAC Implementation

```python
from enum import Enum
from typing import List

class Role(str, Enum):
    ADMIN = "admin"
    DOCTOR = "doctor"
    NURSE = "nurse"
    PATIENT = "patient"
    RESEARCHER = "researcher"

class Permission(str, Enum):
    READ_PATIENT_RECORD = "read:patient_record"
    WRITE_PATIENT_RECORD = "write:patient_record"
    DELETE_PATIENT_RECORD = "delete:patient_record"
    PRESCRIBE_MEDICATION = "prescribe:medication"
    VIEW_AUDIT_LOGS = "view:audit_logs"
    MANAGE_USERS = "manage:users"
    ACCESS_DEIDENTIFIED_DATA = "access:deidentified_data"

# Role-Permission mapping
ROLE_PERMISSIONS = {
    Role.ADMIN: [p for p in Permission],  # All permissions
    Role.DOCTOR: [
        Permission.READ_PATIENT_RECORD,
        Permission.WRITE_PATIENT_RECORD,
        Permission.PRESCRIBE_MEDICATION,
    ],
    Role.NURSE: [
        Permission.READ_PATIENT_RECORD,
        Permission.WRITE_PATIENT_RECORD,
    ],
    Role.PATIENT: [
        Permission.READ_PATIENT_RECORD,  # Own records only
    ],
    Role.RESEARCHER: [
        Permission.ACCESS_DEIDENTIFIED_DATA,
    ],
}

def require_permission(permission: Permission):
    """Decorator to enforce permission requirements"""
    def decorator(func):
        async def wrapper(*args, current_user: User, **kwargs):
            user_permissions = ROLE_PERMISSIONS.get(current_user.role, [])
            if permission not in user_permissions:
                raise HTTPException(
                    status_code=403,
                    detail=f"Permission denied: requires {permission}"
                )
            return await func(*args, current_user=current_user, **kwargs)
        return wrapper
    return decorator

# Usage
@router.delete("/patient-record/{record_id}")
@require_permission(Permission.DELETE_PATIENT_RECORD)
async def delete_patient_record(
    record_id: str,
    current_user: User = Depends(get_current_user)
):
    # Only admins can reach here
    pass
```

---

## PHI Detection & Redaction

### PHI Detection Service

```python
import re
from typing import List, Dict
import spacy

class PHIDetector:
    """Detect and redact Protected Health Information"""

    def __init__(self):
        # Load NLP model for NER
        self.nlp = spacy.load("en_core_web_sm")

        # PHI patterns (18 HIPAA identifiers)
        self.patterns = {
            "name": r"\b[A-Z][a-z]+ [A-Z][a-z]+\b",
            "ssn": r"\b\d{3}-\d{2}-\d{4}\b",
            "phone": r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b",
            "email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
            "mrn": r"\bMRN:?\s*\d{6,10}\b",
            "date": r"\b\d{1,2}/\d{1,2}/\d{2,4}\b",
            "zipcode": r"\b\d{5}(-\d{4})?\b",
            "ip_address": r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b",
            "account_number": r"\b[A-Z]{2}\d{6,10}\b",
        }

    def detect(self, text: str) -> List[Dict]:
        """Detect all PHI in text"""
        phi_detected = []

        # Regex-based detection
        for phi_type, pattern in self.patterns.items():
            matches = re.finditer(pattern, text)
            for match in matches:
                phi_detected.append({
                    "type": phi_type,
                    "value": match.group(),
                    "start": match.start(),
                    "end": match.end()
                })

        # NLP-based detection (names, locations)
        doc = self.nlp(text)
        for ent in doc.ents:
            if ent.label_ in ["PERSON", "GPE", "LOC", "ORG", "DATE"]:
                phi_detected.append({
                    "type": ent.label_.lower(),
                    "value": ent.text,
                    "start": ent.start_char,
                    "end": ent.end_char
                })

        return phi_detected

    def redact(self, text: str, redaction_char="*") -> str:
        """Redact all detected PHI"""
        phi_list = self.detect(text)

        # Sort by position (reverse order to maintain indices)
        phi_list.sort(key=lambda x: x["start"], reverse=True)

        result = text
        for phi in phi_list:
            redacted = redaction_char * (phi["end"] - phi["start"])
            result = result[:phi["start"]] + redacted + result[phi["end"]:]

        return result

    def anonymize(self, text: str) -> str:
        """Replace PHI with placeholder tokens"""
        phi_list = self.detect(text)
        phi_list.sort(key=lambda x: x["start"], reverse=True)

        result = text
        for phi in phi_list:
            placeholder = f"[{phi['type'].upper()}]"
            result = result[:phi["start"]] + placeholder + result[phi["end"]:]

        return result

# Usage
phi_detector = PHIDetector()

# Example text
text = "Patient John Doe (SSN: 123-45-6789) visited on 01/15/2024. Contact: john.doe@email.com, 555-123-4567."

# Detect PHI
detected = phi_detector.detect(text)
# [{'type': 'name', 'value': 'John Doe', ...}, {'type': 'ssn', 'value': '123-45-6789', ...}, ...]

# Redact PHI
redacted = phi_detector.redact(text)
# "Patient ******** (SSN: ***-**-****) visited on **/**/****. Contact: *******************, ***-***-****."

# Anonymize PHI
anonymized = phi_detector.anonymize(text)
# "Patient [NAME] (SSN: [SSN]) visited on [DATE]. Contact: [EMAIL], [PHONE]."
```

### PHI Logging Policy

```python
import logging
from functools import wraps

class PHISafeLogger:
    """Logger that automatically redacts PHI"""

    def __init__(self, name: str):
        self.logger = logging.getLogger(name)
        self.phi_detector = PHIDetector()

    def _redact_message(self, message: str) -> str:
        """Redact PHI from log message"""
        return self.phi_detector.redact(message)

    def info(self, message: str, **kwargs):
        self.logger.info(self._redact_message(message), **kwargs)

    def warning(self, message: str, **kwargs):
        self.logger.warning(self._redact_message(message), **kwargs)

    def error(self, message: str, **kwargs):
        self.logger.error(self._redact_message(message), **kwargs)

# Usage
logger = PHISafeLogger(__name__)
logger.info(f"Patient John Doe logged in")  # Logs: "Patient ******** logged in"
```

### Tool PHI Security Rules

VoiceAssist's tools system (see [TOOLS_AND_INTEGRATIONS.md](TOOLS_AND_INTEGRATIONS.md)) implements PHI-aware security controls to ensure compliance with HIPAA.

#### Tool PHI Classification

All tools are classified by their ability to handle PHI:

| Tool Name | Allows PHI | Execution Location | External API | Rationale |
|-----------|------------|-------------------|--------------|-----------|
| `get_calendar_events` | ✅ Yes | Local/Nextcloud | No | Calendar data may contain patient appointments |
| `create_calendar_event` | ✅ Yes | Local/Nextcloud | No | Event titles/descriptions may reference patients |
| `search_nextcloud_files` | ✅ Yes | Local/Nextcloud | No | File names and metadata may contain PHI |
| `retrieve_nextcloud_file` | ✅ Yes | Local/Nextcloud | No | File contents are clinical documents with PHI |
| `calculate_medical_score` | ✅ Yes | Local compute | No | Calculations use patient-specific data (age, labs, etc.) |
| `generate_differential_diagnosis` | ✅ Yes | Local LLM | No | DDx generated from patient symptoms and history |
| `search_openevidence` | ❌ No | External API | Yes | External service - PHI must be stripped before sending |
| `search_pubmed` | ❌ No | External API | Yes | External service - PHI must be stripped before sending |
| `search_medical_guidelines` | ❌ No | Local vector DB | No | General medical knowledge, no patient data |
| `web_search_medical` | ❌ No | External API | Yes | External service - PHI must be stripped before sending |

**Key Principles:**
1. **Local PHI Tools**: Tools that access PHI (calendar, files, calculations, DDx) execute locally or via Nextcloud (same network)
2. **External Non-PHI Tools**: Tools that call external APIs (OpenEvidence, PubMed, web search) must never receive PHI
3. **PHI Detection**: All tool arguments are scanned for PHI before execution
4. **Violation Prevention**: If PHI is detected in arguments to a non-PHI tool, execution is blocked with `PHI_VIOLATION` error

#### PHI Detection in Tool Arguments

```python
# server/app/services/orchestration/tool_executor.py

from app.services.phi.detector import PHIDetector
from app.services.tools.registry import TOOL_REGISTRY

phi_detector = PHIDetector()

async def execute_tool(
    tool_name: str,
    args: dict,
    user: UserContext,
    trace_id: str,
) -> ToolResult:
    """
    Execute tool with PHI detection and enforcement.

    PHI Security Rules:
    1. Detect PHI in all tool arguments
    2. If PHI detected and tool.allows_phi = False, raise PHI_VIOLATION
    3. If PHI detected and tool.allows_phi = True, route to local execution
    4. Log all PHI detections to audit log
    """

    tool_def = TOOL_REGISTRY[tool_name]

    # Scan all arguments for PHI
    phi_result = await phi_detector.detect_in_dict(args)

    if phi_result.contains_phi:
        # Log PHI detection
        audit_logger.info(
            "PHI detected in tool arguments",
            extra={
                "tool_name": tool_name,
                "user_id": user.id,
                "trace_id": trace_id,
                "phi_types": phi_result.phi_types,  # e.g., ["name", "mrn", "date"]
                "allows_phi": tool_def.allows_phi,
            }
        )

        # Enforce PHI policy
        if not tool_def.allows_phi:
            # BLOCK: Tool cannot handle PHI
            raise ToolPHIViolationError(
                f"Tool '{tool_name}' cannot process PHI. "
                f"Detected: {', '.join(phi_result.phi_types)}. "
                f"Use a local tool or remove PHI from query."
            )

    # Execute tool (PHI check passed)
    return await tool_def.execute(args, user, trace_id)
```

#### PHI Routing for AI Models

When generating tool calls via OpenAI Realtime API or other LLMs:

```python
# server/app/services/orchestration/query_orchestrator.py

async def route_query_to_llm(
    query: str,
    user: UserContext,
    trace_id: str,
) -> LLMResponse:
    """
    Route query to appropriate LLM based on PHI content.

    PHI Routing Rules:
    - PHI detected → Local Llama 3.1 8B (on-prem)
    - No PHI → OpenAI GPT-4 (cloud)
    """

    # Detect PHI in user query
    phi_result = await phi_detector.detect(query)

    if phi_result.contains_phi:
        # Route to LOCAL LLM
        llm_provider = "llama_local"
        model = "llama-3.1-8b-instruct"
        endpoint = "http://llm-service:8000/v1/chat/completions"

        audit_logger.info(
            "PHI detected - routing to local LLM",
            extra={
                "query_length": len(query),
                "phi_types": phi_result.phi_types,
                "model": model,
                "user_id": user.id,
                "trace_id": trace_id,
            }
        )
    else:
        # Route to CLOUD LLM
        llm_provider = "openai"
        model = "gpt-4-turbo"
        endpoint = "https://api.openai.com/v1/chat/completions"

        audit_logger.info(
            "No PHI detected - routing to cloud LLM",
            extra={
                "query_length": len(query),
                "model": model,
                "user_id": user.id,
                "trace_id": trace_id,
            }
        )

    # Make LLM request with tool definitions
    response = await llm_client.chat_completion(
        endpoint=endpoint,
        model=model,
        messages=[{"role": "user", "content": query}],
        tools=get_available_tools(phi_detected=phi_result.contains_phi),
    )

    return response
```

#### Tool Definition PHI Flags

Tool definitions include `allows_phi` flag:

```python
# server/app/tools/calendar_tool.py

from app.tools.base import ToolDefinition

calendar_tool = ToolDefinition(
    name="create_calendar_event",
    description="Create an event in the user's calendar",
    category="calendar",
    allows_phi=True,  # ← PHI flag
    requires_confirmation=True,
    timeout_seconds=30,
    execute=create_calendar_event_impl,
)
```

```python
# server/app/tools/medical_search_tool.py

openevidence_tool = ToolDefinition(
    name="search_openevidence",
    description="Search evidence-based medicine database",
    category="medical_search",
    allows_phi=False,  # ← PHI flag (external API)
    requires_confirmation=False,
    timeout_seconds=10,
    execute=search_openevidence_impl,
)
```

#### PHI Audit Trail

All tool invocations with PHI are logged to the audit log:

```python
# After tool execution
if phi_result.contains_phi:
    await audit_log_service.log_event(
        event_type="TOOL_CALL_PHI",
        user_id=user.id,
        resource_type="tool",
        resource_id=tool_name,
        action="execute",
        metadata={
            "tool_name": tool_name,
            "phi_detected": True,
            "phi_types": phi_result.phi_types,
            "tool_allows_phi": tool_def.allows_phi,
            "execution_status": status,
            "duration_ms": duration_ms,
            "trace_id": trace_id,
        }
    )
```

#### PHI Error Responses

When PHI is detected in arguments to a non-PHI tool:

```json
{
  "success": false,
  "error": {
    "code": "PHI_VIOLATION",
    "message": "Tool 'search_openevidence' cannot process PHI. Detected: name, mrn. Use a local tool or remove PHI from query.",
    "details": {
      "tool_name": "search_openevidence",
      "allows_phi": false,
      "phi_types_detected": ["name", "mrn"],
      "suggested_tools": ["search_medical_guidelines", "generate_differential_diagnosis"]
    }
  },
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-11-20T12:34:56.789Z"
}
```

**Frontend Handling:**
- Display user-friendly error message
- Suggest alternative tools that allow PHI
- Allow user to rephrase query without PHI

**Related Documentation:**
- [TOOLS_AND_INTEGRATIONS.md](TOOLS_AND_INTEGRATIONS.md) - Complete tools specification with PHI classification
- [ORCHESTRATION_DESIGN.md](ORCHESTRATION_DESIGN.md) - Tool execution flow with PHI checks
- [DATA_MODEL.md](DATA_MODEL.md) - ToolCall entity with `phi_detected` field
- [OBSERVABILITY.md](OBSERVABILITY.md) - Tool PHI detection metrics

---

## Audit Logging

**For logging conventions and metrics, see [OBSERVABILITY.md](OBSERVABILITY.md).**

### Audit Log Requirements

Every access to PHI must be logged with:
1. **Who**: User ID, role
2. **What**: Action performed (read, write, delete)
3. **When**: Timestamp (UTC)
4. **Where**: IP address, service
5. **Why**: Purpose/reason (if applicable)
6. **Result**: Success/failure

### Audit Log Implementation

```python
from sqlalchemy import Column, String, DateTime, JSON, Text
from datetime import datetime
import hashlib

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID, primary_key=True, default=uuid.uuid4)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)
    user_id = Column(UUID, nullable=False)
    user_role = Column(String(50), nullable=False)
    action = Column(String(100), nullable=False)  # read, write, delete, export, etc.
    resource_type = Column(String(100), nullable=False)  # patient_record, prescription, etc.
    resource_id = Column(String(255))
    ip_address = Column(String(45))
    user_agent = Column(Text)
    request_id = Column(String(100))
    service_name = Column(String(100))
    success = Column(Boolean, nullable=False)
    error_message = Column(Text)
    metadata = Column(JSON)  # Additional context
    hash = Column(String(64), nullable=False)  # Integrity verification

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Calculate hash for integrity
        self.hash = self.calculate_hash()

    def calculate_hash(self) -> str:
        """Calculate hash to detect tampering"""
        data = f"{self.timestamp}{self.user_id}{self.action}{self.resource_type}{self.resource_id}"
        return hashlib.sha256(data.encode()).hexdigest()

    def verify_integrity(self) -> bool:
        """Verify audit log has not been tampered with"""
        expected_hash = self.calculate_hash()
        return self.hash == expected_hash

class AuditService:
    """Service for creating audit logs"""

    @staticmethod
    async def log_access(
        user_id: str,
        user_role: str,
        action: str,
        resource_type: str,
        resource_id: str = None,
        request: Request = None,
        success: bool = True,
        error_message: str = None,
        metadata: dict = None
    ):
        """Create audit log entry"""
        log_entry = AuditLog(
            user_id=user_id,
            user_role=user_role,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            ip_address=request.client.host if request else None,
            user_agent=request.headers.get("user-agent") if request else None,
            request_id=request.state.request_id if request else None,
            service_name="voiceassist",
            success=success,
            error_message=error_message,
            metadata=metadata
        )

        db.add(log_entry)
        db.commit()

        # Also send to immutable log storage (e.g., WORM storage, blockchain)
        await send_to_immutable_storage(log_entry)

# Decorator for automatic audit logging
def audit_log(action: str, resource_type: str):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, current_user: User, **kwargs):
            success = True
            error_message = None

            try:
                result = await func(*args, current_user=current_user, **kwargs)
                return result
            except Exception as e:
                success = False
                error_message = str(e)
                raise
            finally:
                # Log regardless of success/failure
                resource_id = kwargs.get("record_id") or kwargs.get("patient_id")
                await AuditService.log_access(
                    user_id=current_user.id,
                    user_role=current_user.role,
                    action=action,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    request=kwargs.get("request"),
                    success=success,
                    error_message=error_message
                )
        return wrapper
    return decorator

# Usage
@router.get("/patient-record/{record_id}")
@audit_log(action="read", resource_type="patient_record")
async def get_patient_record(
    record_id: str,
    current_user: User = Depends(get_current_user),
    request: Request = None
):
    # Audit log created automatically
    return db.query(PatientRecord).filter_by(id=record_id).first()
```

### Audit Log Retention

```python
# Retain audit logs for 6 years (HIPAA requirement)
AUDIT_LOG_RETENTION_YEARS = 6

# Archive old logs to cold storage
async def archive_old_audit_logs():
    """Archive audit logs older than 1 year to cold storage"""
    cutoff_date = datetime.utcnow() - timedelta(days=365)

    # Export to JSON
    old_logs = db.query(AuditLog).filter(AuditLog.timestamp < cutoff_date).all()

    # Write to encrypted archive
    with open(f"/archive/audit_logs_{cutoff_date.year}.json.enc", "w") as f:
        encrypted_data = encrypt_data(json.dumps([log.to_dict() for log in old_logs]))
        f.write(encrypted_data)

    # Verify integrity
    for log in old_logs:
        if not log.verify_integrity():
            alert_security_team(f"Audit log integrity violation: {log.id}")

    # Delete from active database (after successful archive)
    db.query(AuditLog).filter(AuditLog.timestamp < cutoff_date).delete()
    db.commit()
```

---

## Network Security

### Firewall Rules

```bash
# UFW rules for production server
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH (change port if using non-standard)
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Deny all other ports
sudo ufw enable
```

### Network Policies (Kubernetes)

```yaml
---
# Only API Gateway can receive external traffic
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-gateway-policy
  namespace: voiceassist
spec:
  podSelector:
    matchLabels:
      app: api-gateway
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector: {}  # From any namespace
    ports:
    - protocol: TCP
      port: 8000
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: auth-service
    ports:
    - protocol: TCP
      port: 8002

---
# Database only accessible by specific services
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: postgres-policy
  namespace: voiceassist
spec:
  podSelector:
    matchLabels:
      app: postgres
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: api-gateway
    - podSelector:
        matchLabels:
          app: auth-service
    - podSelector:
        matchLabels:
          app: medical-kb
    ports:
    - protocol: TCP
      port: 5432
```

---

## Data Retention & Disposal

### Retention Policy

| Data Type | Retention Period | Disposal Method |
|-----------|-----------------|-----------------|
| Medical Records | 6 years after last visit | Secure wipe + shred (physical) |
| Audit Logs | 6 years | Encrypted archive, then secure wipe |
| Voice Recordings | 30 days (unless saved) | Secure wipe |
| Temporary Files | 24 hours | Automatic secure deletion |
| Backups | 30 days (rolling) | Encrypt, then secure wipe |
| De-identified Data | Indefinite | N/A (no PHI) |

### Secure Deletion

```python
import os
import random

def secure_delete(file_path: str, passes: int = 7):
    """
    Securely delete file using DOD 5220.22-M standard (7-pass)
    """
    if not os.path.exists(file_path):
        return

    file_size = os.path.getsize(file_path)

    with open(file_path, "ba+") as f:
        for pass_num in range(passes):
            f.seek(0)

            if pass_num in [0, 2, 4]:  # Write zeros
                f.write(b'\x00' * file_size)
            elif pass_num in [1, 3, 5]:  # Write ones
                f.write(b'\xFF' * file_size)
            else:  # Write random data
                f.write(os.urandom(file_size))

            f.flush()
            os.fsync(f.fileno())

    # Finally, delete the file
    os.remove(file_path)

    # Log deletion
    audit_log.log_deletion(file_path)

# Scheduled cleanup job
@celery.task
def cleanup_expired_files():
    """Clean up files older than retention period"""
    cutoff_date = datetime.utcnow() - timedelta(days=30)

    expired_files = db.query(TemporaryFile).filter(
        TemporaryFile.created_at < cutoff_date
    ).all()

    for file_record in expired_files:
        # Secure delete physical file
        secure_delete(file_record.file_path)

        # Delete database record
        db.delete(file_record)

    db.commit()
```

---

## Incident Response

### Incident Response Plan

#### 1. Preparation
- Incident response team identified
- Contact list maintained
- Incident response playbooks documented
- Regular drills conducted (quarterly)

#### 2. Detection & Analysis
- 24/7 monitoring via Prometheus/Grafana
- Automated alerts for suspicious activity
- Log analysis for anomalies
- User reports

#### 3. Containment
- **Short-term**: Isolate affected systems, revoke compromised credentials
- **Long-term**: Apply patches, update firewall rules

#### 4. Eradication
- Remove malware/backdoors
- Close vulnerabilities
- Reset all passwords

#### 5. Recovery
- Restore from clean backups
- Verify system integrity
- Gradual service restoration

#### 6. Post-Incident
- Incident report (within 60 days for HIPAA breach)
- Lessons learned meeting
- Update security controls
- Notify affected users (if PHI breach)

### Security Incident Examples

**Unauthorized Access Attempt:**
```python
# Alert triggered when multiple failed login attempts
@app.middleware("http")
async def detect_brute_force(request: Request, call_next):
    user_ip = request.client.host

    # Check failed login count
    failed_count = await redis.get(f"failed_login:{user_ip}")

    if failed_count and int(failed_count) > 5:
        # Block IP
        await redis.setex(f"blocked:{user_ip}", 3600, "1")

        # Alert security team
        await alert_security_team(
            severity="high",
            message=f"Brute force attack detected from {user_ip}",
            metadata={"ip": user_ip, "failed_attempts": failed_count}
        )

        return JSONResponse(status_code=403, content={"error": "Blocked"})

    return await call_next(request)
```

**Data Breach Response:**
```python
async def handle_data_breach(affected_users: List[str], breach_type: str):
    """
    HIPAA Breach Notification Rule: Notify within 60 days
    """
    # 1. Document breach
    breach_report = BreachReport(
        incident_id=str(uuid.uuid4()),
        discovered_at=datetime.utcnow(),
        breach_type=breach_type,
        affected_user_count=len(affected_users),
        description="Unauthorized access to patient records",
        mitigation_steps="Access revoked, passwords reset, audit log reviewed",
        reported_to_authorities=False
    )
    db.add(breach_report)
    db.commit()

    # 2. Notify affected users (email)
    for user_id in affected_users:
        await send_breach_notification_email(user_id, breach_report)

    # 3. Notify HHS if >500 individuals affected
    if len(affected_users) > 500:
        await notify_hhs(breach_report)

    # 4. Post on website if >500 individuals in same state
    if breach_report.requires_media_notice():
        await post_media_notice(breach_report)

    # 5. Document in breach log
    audit_log.log_breach(breach_report)
```

---

## Security Monitoring

### Metrics to Monitor

```yaml
# Prometheus alerts
groups:
  - name: security_alerts
    rules:
      # Failed login attempts
      - alert: HighFailedLoginRate
        expr: rate(failed_login_total[5m]) > 10
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "High rate of failed login attempts"

      # Unauthorized access attempts
      - alert: UnauthorizedAccessAttempt
        expr: rate(http_requests_total{status="403"}[5m]) > 5
        for: 1m
        labels:
          severity: high
        annotations:
          summary: "Multiple unauthorized access attempts detected"

      # Unusual data export volume
      - alert: UnusualDataExport
        expr: rate(data_export_bytes_total[10m]) > 1000000000  # 1GB/10min
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Unusual volume of data exports detected"

      # PHI access outside business hours
      - alert: PHIAccessAfterHours
        expr: phi_access_total{hour="<8"} > 0 OR phi_access_total{hour=">18"} > 0
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "PHI accessed outside business hours"
```

### Security Dashboard (Grafana)

```json
{
  "dashboard": {
    "title": "Security Monitoring",
    "panels": [
      {
        "title": "Failed Login Attempts (Last 24h)",
        "targets": [
          {
            "expr": "sum(increase(failed_login_total[24h]))"
          }
        ]
      },
      {
        "title": "Unauthorized Access by IP",
        "targets": [
          {
            "expr": "topk(10, sum by (ip) (http_requests_total{status=\"403\"}))"
          }
        ]
      },
      {
        "title": "PHI Access by User",
        "targets": [
          {
            "expr": "sum by (user_id) (phi_access_total)"
          }
        ]
      },
      {
        "title": "Audit Log Integrity Checks",
        "targets": [
          {
            "expr": "audit_log_integrity_violations_total"
          }
        ]
      }
    ]
  }
}
```

---

## Compliance Checklists

### Pre-Production Checklist

- [ ] All sensitive data encrypted at rest (AES-256)
- [ ] All network traffic encrypted in transit (TLS 1.3)
- [ ] OIDC authentication configured with Nextcloud
- [ ] RBAC implemented and tested
- [ ] PHI detection service deployed and tested
- [ ] Audit logging enabled for all PHI access
- [ ] Backup encryption enabled
- [ ] Firewall rules configured (deny by default)
- [ ] Network policies configured (Kubernetes)
- [ ] Business Associate Agreements signed (OpenAI, UpToDate, etc.)
- [ ] Incident response plan documented
- [ ] Security monitoring dashboard configured
- [ ] Automatic session timeout (30 minutes)
- [ ] Password policy enforced (min 12 characters, complexity)
- [ ] MFA available (optional but recommended)
- [ ] Vulnerability scanning completed
- [ ] Penetration testing completed
- [ ] Security training completed for all users
- [ ] HIPAA compliance review completed
- [ ] Privacy policy published

### Annual Security Review

- [ ] Review audit logs for unusual activity
- [ ] Test backup restoration
- [ ] Test incident response procedures
- [ ] Update risk assessment
- [ ] Review and update access controls
- [ ] Vulnerability assessment
- [ ] Penetration testing
- [ ] Review Business Associate Agreements
- [ ] Staff security training refresh
- [ ] Update security policies
- [ ] Review and test disaster recovery plan
- [ ] Verify audit log integrity
- [ ] Review encryption keys (rotation)

---

## References

- [HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/index.html)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [Zero Trust Architecture (NIST SP 800-207)](https://csrc.nist.gov/publications/detail/sp/800-207/final)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CIS Controls](https://www.cisecurity.org/controls)
