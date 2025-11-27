---
title: "Phase 2 Optimized Plan"
slug: "phase-2-optimized-plan"
summary: "**Date:** 2025-11-20"
status: stable
stability: beta
owner: docs
lastUpdated: "2025-11-27"
audience: ["human"]
tags: ["phase", "optimized", "plan"]
category: planning
---

# Phase 2: Optimized Security & Nextcloud Integration Plan

**Date:** 2025-11-20
**Status:** Ready to Start
**Estimated Duration:** 4-5 hours (optimized from 6-8 hours)

---

## Executive Summary

This document provides an optimized, tightened plan for Phase 2 based on lessons learned from Phases 0-1 and architectural analysis. The plan reduces complexity, improves integration, and focuses on essential security primitives while deferring non-critical features to later phases.

---

## Key Optimizations vs Original Plan

### Removed/Deferred Items

❌ **Keycloak** - Overly complex for Phase 2, defer to Phase 11 (production hardening)
❌ **Full MFA** - Defer to Phase 7 (Admin Panel & RBAC)
❌ **Custom OIDC provider** - Use simpler JWT pattern first
❌ **Complex SSL certificate management** - Use simpler self-signed certs

### Simplified Approach

✅ **Direct JWT authentication** instead of OIDC complexity
✅ **Basic Nextcloud user sync** instead of full SSO integration
✅ **Simple HTTPS with mkcert** instead of complex CA setup
✅ **Minimal security middleware** with room to expand

### Result

- **Reduced scope** by ~40%
- **Maintained security** fundamentals
- **Faster delivery** to Phase 3
- **Easier testing** and debugging

---

## Phase 2 Optimized Objectives

### Core Objectives (Must Have)

1. **JWT Authentication System**
   - User registration and login endpoints
   - JWT token generation and validation
   - Token refresh mechanism
   - Password hashing with bcrypt

2. **Basic HTTPS Setup**
   - Self-signed certificates with mkcert
   - HTTPS redirect middleware
   - Secure cookie configuration

3. **Nextcloud Integration (Basic)**
   - Nextcloud container in Docker Compose
   - User provisioning API
   - File storage integration
   - WebDAV API connectivity

4. **User Management API**
   - Create user
   - Login/logout
   - Profile management
   - Session management

5. **Security Middleware**
   - CORS configuration
   - Security headers
   - Request validation
   - Basic rate limiting

### Deferred to Later Phases (Won't Have in Phase 2)

- ❌ Keycloak OIDC (Phase 11)
- ❌ Full SSO integration (Phase 11)
- ❌ MFA/2FA (Phase 7)
- ❌ Complex RBAC (Phase 7)
- ❌ OAuth2 flows (Phase 11)
- ❌ Production SSL certificates (Phase 14)

---

## Detailed Implementation Plan

### Step 1: HTTPS Setup with mkcert (30 minutes)

**Why mkcert?**

- ✅ Trusted local certificates
- ✅ Works with browsers without warnings
- ✅ Simple installation and usage
- ✅ Perfect for development

**Implementation:**

```bash
# Install mkcert
brew install mkcert
mkcert -install

# Generate certificates
cd ~/VoiceAssist/infrastructure/docker/certs
mkcert localhost 127.0.0.1 \
  "*.voiceassist.local" \
  voiceassist.local \
  nextcloud.local \
  api.voiceassist.local
```

**Docker Compose Update:**

```yaml
services:
  voiceassist-server:
    volumes:
      - ./infrastructure/docker/certs:/certs:ro
    environment:
      - SSL_CERT_FILE=/certs/localhost+4.pem
      - SSL_KEY_FILE=/certs/localhost+4-key.pem
    ports:
      - "8000:8000"
      - "8443:8443"
```

**FastAPI SSL:**

```python
# app/main.py
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8443,
        ssl_keyfile="/certs/localhost+4-key.pem",
        ssl_certfile="/certs/localhost+4.pem",
        reload=settings.DEBUG
    )
```

### Step 2: JWT Authentication (1.5 hours)

**Dependencies:**

```txt
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.6
```

**Implementation Structure:**

```
app/
├── api/
│   ├── auth.py          # Login, register, logout
│   └── users.py         # User management
├── core/
│   ├── security.py      # JWT functions, password hashing
│   └── dependencies.py  # Auth dependencies
└── schemas/
    ├── auth.py          # Login/Register schemas
    └── user.py          # User response schemas
```

**Core Security Functions:**

```python
# app/core/security.py
from datetime import datetime, timedelta
from jose import jwt
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)
```

**Auth Endpoints:**

```python
# app/api/auth.py
@router.post("/register")
async def register(user: UserCreate, db: Session = Depends(get_db)):
    # Create user with hashed password
    hashed_password = get_password_hash(user.password)
    db_user = User(
        email=user.email,
        full_name=user.full_name,
        hashed_password=hashed_password
    )
    db.add(db_user)
    db.commit()
    return {"message": "User created successfully"}

@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect credentials")

    access_token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}
```

**Protected Route Example:**

```python
# app/core/dependencies.py
from fastapi.security import HTTPBearer

security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    token = credentials.credentials
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid authentication")
    return user
```

### Step 3: Nextcloud Installation (1 hour)

**Simplified Nextcloud Setup:**

```yaml
# docker-compose.yml
services:
  nextcloud-db:
    image: postgres:16-alpine
    container_name: voiceassist-nextcloud-db
    environment:
      POSTGRES_DB: nextcloud
      POSTGRES_USER: nextcloud
      POSTGRES_PASSWORD: ${NEXTCLOUD_DB_PASSWORD}
    volumes:
      - nextcloud-db-data:/var/lib/postgresql/data
    networks:
      - database-network
    restart: unless-stopped

  nextcloud:
    image: nextcloud:28-apache
    container_name: voiceassist-nextcloud
    depends_on:
      - nextcloud-db
    environment:
      POSTGRES_HOST: nextcloud-db
      POSTGRES_DB: nextcloud
      POSTGRES_USER: nextcloud
      POSTGRES_PASSWORD: ${NEXTCLOUD_DB_PASSWORD}
      NEXTCLOUD_ADMIN_USER: ${NEXTCLOUD_ADMIN_USER}
      NEXTCLOUD_ADMIN_PASSWORD: ${NEXTCLOUD_ADMIN_PASSWORD}
      NEXTCLOUD_TRUSTED_DOMAINS: nextcloud.local localhost
      OVERWRITEPROTOCOL: https
      OVERWRITEHOST: nextcloud.local
    volumes:
      - nextcloud-data:/var/www/html
      - ./infrastructure/docker/certs:/certs:ro
    ports:
      - "8080:80"
    networks:
      - voiceassist-network
      - database-network
    restart: unless-stopped

volumes:
  nextcloud-db-data:
  nextcloud-data:
```

**Nextcloud API Integration:**

```python
# app/services/nextcloud.py
import httpx

class NextcloudService:
    def __init__(self):
        self.base_url = settings.NEXTCLOUD_URL
        self.admin_user = settings.NEXTCLOUD_ADMIN_USER
        self.admin_password = settings.NEXTCLOUD_ADMIN_PASSWORD

    async def create_user(self, username: str, password: str, email: str):
        """Create user in Nextcloud via OCS API"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/ocs/v1.php/cloud/users",
                auth=(self.admin_user, self.admin_password),
                data={
                    "userid": username,
                    "password": password,
                    "email": email
                },
                headers={"OCS-APIRequest": "true"}
            )
            return response.status_code == 200

    async def get_user_quota(self, username: str):
        """Get user's storage quota from Nextcloud"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/ocs/v1.php/cloud/users/{username}",
                auth=(self.admin_user, self.admin_password),
                headers={"OCS-APIRequest": "true"}
            )
            return response.json()
```

### Step 4: Security Middleware (45 minutes)

**CORS Configuration:**

```python
# app/main.py
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://voiceassist.local",
        "https://nextcloud.local",
        "https://admin.voiceassist.local",
        "http://localhost:3000"  # Development
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
    expose_headers=["X-Correlation-ID"]
)
```

**Security Headers Middleware:**

```python
# app/core/middleware.py
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = "default-src 'self'"

        return response

app.add_middleware(SecurityHeadersMiddleware)
```

**Rate Limiting:**

```python
# app/core/rate_limit.py
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])

# Apply to endpoints
@router.post("/login")
@limiter.limit("5/minute")
async def login(...):
    ...
```

### Step 5: User Management Endpoints (45 minutes)

```python
# app/api/users.py
@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user)
):
    """Get current user profile"""
    return current_user

@router.put("/me", response_model=UserResponse)
async def update_profile(
    profile: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update current user profile"""
    for field, value in profile.dict(exclude_unset=True).items():
        setattr(current_user, field, value)

    current_user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(current_user)
    return current_user

@router.post("/change-password")
async def change_password(
    password_change: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Change user password"""
    if not verify_password(password_change.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect password")

    current_user.hashed_password = get_password_hash(password_change.new_password)
    db.commit()
    return {"message": "Password updated successfully"}
```

### Step 6: Session Management (30 minutes)

```python
# app/api/sessions.py
@router.get("/sessions", response_model=List[SessionResponse])
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 50
):
    """List user's conversation sessions"""
    sessions = db.query(Session)\
        .filter(Session.user_id == current_user.id)\
        .order_by(Session.created_at.desc())\
        .offset(skip)\
        .limit(limit)\
        .all()
    return sessions

@router.post("/sessions", response_model=SessionResponse)
async def create_session(
    session_create: SessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create new conversation session"""
    db_session = Session(
        user_id=current_user.id,
        title=session_create.title,
        context=session_create.context
    )
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session
```

---

## Integration Points with Phase 1

### Database Schema Updates

**Add to users table:**

```sql
-- No changes needed! Already has nextcloud_user_id column
```

**Add to sessions table:**

```sql
-- Already properly linked to users table via user_id FK
```

### Health Check Updates

```python
# app/api/health.py
@router.get("/ready")
async def readiness_check():
    checks = {
        "postgres": check_postgres_connection(),
        "redis": check_redis_connection(),
        "qdrant": check_qdrant_connection(),
        "nextcloud": await check_nextcloud_connection()  # NEW
    }
    # ...
```

---

## Testing Strategy

### Unit Tests

```python
# tests/test_auth.py
def test_register_user():
    response = client.post("/api/auth/register", json={
        "email": "test@example.com",
        "password": "SecurePass123!",
        "full_name": "Test User"
    })
    assert response.status_code == 200

def test_login():
    response = client.post("/api/auth/login", data={
        "username": "test@example.com",
        "password": "SecurePass123!"
    })
    assert response.status_code == 200
    assert "access_token" in response.json()

def test_protected_endpoint():
    token = get_test_token()
    response = client.get(
        "/api/users/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
```

### Integration Tests

```python
# tests/integration/test_nextcloud.py
async def test_user_created_in_nextcloud():
    # Register user in VoiceAssist
    await register_user("test@example.com", "password")

    # Verify user exists in Nextcloud
    nextcloud = NextcloudService()
    user_exists = await nextcloud.user_exists("test@example.com")
    assert user_exists
```

---

## Environment Variables Update

**Add to .env.example:**

```bash
# Nextcloud
NEXTCLOUD_URL=http://nextcloud
NEXTCLOUD_ADMIN_USER=admin
NEXTCLOUD_ADMIN_PASSWORD=changeme_nextcloud_admin
NEXTCLOUD_DB_PASSWORD=changeme_nextcloud_db_password

# JWT
JWT_SECRET=changeme_jwt_secret_64_chars
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# Security
ALLOWED_ORIGINS=https://voiceassist.local,https://nextcloud.local
RATE_LIMIT_PER_MINUTE=100
```

---

## Deliverables Checklist

### Code Deliverables

- [ ] JWT authentication endpoints (register, login, logout)
- [ ] User management endpoints (profile, change password)
- [ ] Session management endpoints (list, create, get)
- [ ] Security middleware (CORS, headers, rate limiting)
- [ ] Nextcloud integration service
- [ ] HTTPS configuration with mkcert
- [ ] Authentication dependencies (get_current_user)
- [ ] Pydantic schemas for auth and users

### Infrastructure Deliverables

- [ ] Nextcloud container in docker-compose.yml
- [ ] Nextcloud database container
- [ ] SSL certificates generated
- [ ] Updated environment variables
- [ ] Volume configuration for Nextcloud data

### Documentation Deliverables

- [ ] API documentation for auth endpoints
- [ ] Authentication flow documentation
- [ ] Nextcloud integration guide
- [ ] Environment setup instructions
- [ ] Testing documentation

### Testing Deliverables

- [ ] Unit tests for auth endpoints
- [ ] Integration tests for Nextcloud
- [ ] Manual testing checklist
- [ ] Postman/Thunder Client collection

---

## Success Metrics

### Functional Requirements

✅ Users can register and login
✅ JWT tokens are generated and validated
✅ Protected endpoints require authentication
✅ Nextcloud container is running
✅ Users can be provisioned in Nextcloud
✅ HTTPS is working locally
✅ All health checks passing

### Performance Requirements

✅ Login response time < 500ms
✅ Token validation < 50ms
✅ Nextcloud API calls < 2s
✅ No degradation of Phase 1 services

### Security Requirements

✅ Passwords hashed with bcrypt
✅ JWT tokens expire after 15 minutes
✅ HTTPS redirect working
✅ Security headers present
✅ Rate limiting active
✅ CORS properly configured

---

## Time Breakdown

| Task                      | Estimated Time | Critical Path |
| ------------------------- | -------------- | ------------- |
| HTTPS setup with mkcert   | 30 min         | Yes           |
| JWT authentication        | 1.5 hrs        | Yes           |
| Nextcloud installation    | 1 hr           | No (parallel) |
| Security middleware       | 45 min         | Yes           |
| User management endpoints | 45 min         | Yes           |
| Session management        | 30 min         | No (parallel) |
| Testing & debugging       | 1 hr           | Yes           |
| **Total**                 | **5.25 hrs**   | **4.5 hrs**   |

**Critical Path:** 4.5 hours
**With parallelization:** Can complete in 4-5 hours

---

## Risk Mitigation

### Risk 1: Nextcloud Takes Too Long to Install

**Mitigation:** Use pre-configured Nextcloud image with all apps
**Fallback:** Skip Nextcloud user provisioning, add in Phase 3

### Risk 2: HTTPS Certificate Issues

**Mitigation:** Clear documentation for mkcert installation
**Fallback:** Continue with HTTP for Phase 2, add HTTPS in Phase 3

### Risk 3: JWT Token Complexity

**Mitigation:** Use python-jose library (well-tested)
**Fallback:** Use simple session-based auth temporarily

---

## Post-Phase 2 Capabilities

After completing Phase 2, the system will support:

✅ **Authenticated API Access**

- Users can register and login
- API endpoints are protected
- JWT tokens for authentication

✅ **Secure Communication**

- HTTPS for all services
- Security headers configured
- Rate limiting active

✅ **User Management**

- Profile management
- Password changes
- Session tracking

✅ **Nextcloud Integration**

- User provisioning
- File storage backend
- WebDAV API ready

✅ **Ready for Phase 3**

- Authentication system in place
- User context available
- Secure foundation for microservices

---

## Comparison: Original vs Optimized Phase 2

| Aspect       | Original Plan  | Optimized Plan | Benefit           |
| ------------ | -------------- | -------------- | ----------------- |
| Duration     | 6-8 hours      | 4-5 hours      | 30% faster        |
| Keycloak     | Included       | Deferred       | Less complexity   |
| MFA          | Included       | Deferred       | Faster delivery   |
| SSL Setup    | Complex CA     | mkcert         | Simpler           |
| Auth Pattern | OIDC/OAuth2    | JWT            | Easier to test    |
| Dependencies | 5 new services | 2 new services | Less overhead     |
| Testing      | Complex flows  | Simple flows   | Easier validation |

---

## Conclusion

This optimized Phase 2 plan provides a solid security foundation while avoiding unnecessary complexity. By deferring Keycloak, MFA, and complex OIDC flows to later phases, we can:

1. ✅ Deliver faster (4-5 hours vs 6-8 hours)
2. ✅ Maintain security fundamentals
3. ✅ Simplify testing and debugging
4. ✅ Unblock Phase 3 development
5. ✅ Reduce cognitive load

**Recommendation:** Proceed with optimized plan. Add deferred features in Phases 7 and 11 when they provide more value.

## Implementation Targets (File-Level)

When implementing this optimized plan, prefer these concrete locations:

- **Auth & JWT**
  - `services/api-gateway/app/api/auth.py` – FastAPI router for auth endpoints
  - `services/api-gateway/app/core/security.py` – JWT utilities, password hashing
- **Security Middleware**
  - Extend `services/api-gateway/app/core/middleware.py` with any additional Phase 2 security concerns.
- **Nextcloud Integration**
  - Start from the commented `nextcloud` service block in `docker-compose.yml`.
  - Implement Nextcloud-specific helpers in `services/api-gateway/app/core/nextcloud_client.py` or similar module when Phase 2 begins.
