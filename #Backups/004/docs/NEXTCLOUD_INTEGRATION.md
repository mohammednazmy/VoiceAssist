# Nextcloud Integration Guide

## Overview

VoiceAssist integrates with Nextcloud as a **separate stack** for identity management, file storage, calendar, and email functionality. Nextcloud is **NOT** deployed as part of the VoiceAssist docker-compose.yml.

## Architecture Decision

**Key Principle:** Nextcloud and VoiceAssist are independent deployments that communicate via standard APIs.

```
Separate Stacks:
├── Nextcloud Stack (~/Nextcloud-Dev/)
│   ├── Identity & SSO (OIDC)
│   ├── File Storage (WebDAV)
│   ├── Calendar (CalDAV)
│   ├── Email (IMAP/SMTP)
│   └── User Directory
│
└── VoiceAssist Stack (~/VoiceAssist/)
    ├── Microservices
    ├── Databases
    ├── Observability
    └── Integration with Nextcloud via APIs
```

### Why Separate?

**Benefits:**
✅ **Independence** - Update either system without affecting the other
✅ **Flexibility** - Use existing Nextcloud installation in production
✅ **Clarity** - Clear separation of concerns
✅ **Scalability** - Scale each system independently
✅ **Maintainability** - Easier to troubleshoot and maintain
✅ **Reusability** - Nextcloud can serve multiple applications

**Integration Method:**
- HTTP/HTTPS APIs (OIDC, WebDAV, CalDAV, CardDAV)
- Environment variables for configuration
- No shared Docker networks or volumes
- No shared databases

---

## Local Development Setup

### Directory Structure

```
~/Nextcloud-Dev/                    # Nextcloud development stack
├── docker-compose.yml              # Nextcloud + Database
├── .env                            # Nextcloud environment
├── data/                           # Nextcloud files
│   ├── data/                       # User files
│   ├── config/                     # Nextcloud config
│   └── apps/                       # Nextcloud apps
└── db/                             # Nextcloud database

~/VoiceAssist/                      # VoiceAssist stack (this repo)
├── docker-compose.yml              # VoiceAssist services
├── .env                            # Includes NEXTCLOUD_* variables
├── services/                       # Microservices
└── data/                           # VoiceAssist data
```

### Step 1: Set Up Nextcloud Dev Stack

#### Create ~/Nextcloud-Dev directory

```bash
mkdir -p ~/Nextcloud-Dev
cd ~/Nextcloud-Dev
```

#### Create docker-compose.yml

```yaml
version: '3.8'

services:
  nextcloud-db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: nextcloud
      POSTGRES_USER: nextcloud
      POSTGRES_PASSWORD: nextcloud_dev_password
    volumes:
      - nextcloud-db:/var/lib/postgresql/data
    networks:
      - nextcloud-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nextcloud"]
      interval: 10s
      timeout: 5s
      retries: 5

  nextcloud:
    image: nextcloud:latest
    ports:
      - "8080:80"
    environment:
      - POSTGRES_HOST=nextcloud-db
      - POSTGRES_DB=nextcloud
      - POSTGRES_USER=nextcloud
      - POSTGRES_PASSWORD=nextcloud_dev_password
      - NEXTCLOUD_ADMIN_USER=admin
      - NEXTCLOUD_ADMIN_PASSWORD=admin_dev_password
      - NEXTCLOUD_TRUSTED_DOMAINS=localhost nextcloud.local
      - OVERWRITEPROTOCOL=http
      - OVERWRITEHOST=localhost:8080
    volumes:
      - nextcloud-data:/var/www/html
    depends_on:
      nextcloud-db:
        condition: service_healthy
    networks:
      - nextcloud-network
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:80/status.php || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  nextcloud-network:
    driver: bridge

volumes:
  nextcloud-db:
    driver: local
  nextcloud-data:
    driver: local
```

#### Create .env file

```bash
cat > .env <<'EOF'
# Nextcloud Dev Environment

# Database
POSTGRES_DB=nextcloud
POSTGRES_USER=nextcloud
POSTGRES_PASSWORD=nextcloud_dev_password

# Nextcloud Admin
NEXTCLOUD_ADMIN_USER=admin
NEXTCLOUD_ADMIN_PASSWORD=admin_dev_password

# Nextcloud Config
NEXTCLOUD_TRUSTED_DOMAINS=localhost nextcloud.local
EOF
```

#### Start Nextcloud Dev Stack

```bash
cd ~/Nextcloud-Dev

# Start Nextcloud
docker compose up -d

# Wait for Nextcloud to initialize (first start takes 2-3 minutes)
docker compose logs -f nextcloud

# Check when you see: "Initializing finished"
```

#### Access Nextcloud

```
URL: http://localhost:8080
Username: admin
Password: admin_dev_password
```

### Step 2: Configure Nextcloud for VoiceAssist

#### Install Required Apps

1. **Access Nextcloud Admin**
   - Navigate to http://localhost:8080
   - Login as admin
   - Go to Apps (top right) → Search

2. **Install OIDC App**
   ```
   Search: "OpenID Connect"
   Install: "OpenID Connect user backend"
   ```

3. **Install External Storage (if not installed)**
   ```
   Search: "External storage support"
   Enable if not already enabled
   ```

#### Configure OIDC Provider

1. **Settings → Administration → Security → OAuth 2.0**
   - Click "Add client"
   - Name: `VoiceAssist`
   - Redirection URI: `http://localhost:8000/auth/callback`
   - Type: `Confidential`
   - Click "Add"
   - **Copy the Client ID and Client Secret** - you'll need these

2. **Save Credentials**
   ```bash
   # Example values (yours will be different):
   Client ID: s8dh2k3j4h5k6j7h8k9j0
   Client Secret: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
   ```

#### Create Test User

1. **Users → Add User**
   - Username: `testdoc`
   - Display name: `Test Doctor`
   - Email: `testdoc@example.com`
   - Password: `testdoc123`
   - Groups: `users` (create if needed)

2. **Verify User Can Login**
   - Logout as admin
   - Login as testdoc
   - Verify access works

### Step 3: Configure VoiceAssist to Connect to Nextcloud

#### Update ~/VoiceAssist/.env

Add these variables to your VoiceAssist `.env` file:

```bash
#==============================================
# Nextcloud Integration (Separate Stack)
#==============================================
# Base URL of Nextcloud instance
NEXTCLOUD_BASE_URL=http://localhost:8080

# OIDC Configuration
NEXTCLOUD_OIDC_ISSUER=http://localhost:8080
NEXTCLOUD_CLIENT_ID=s8dh2k3j4h5k6j7h8k9j0        # From Nextcloud OAuth config
NEXTCLOUD_CLIENT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6  # From Nextcloud
NEXTCLOUD_REDIRECT_URI=http://localhost:8000/auth/callback

# WebDAV (for file access)
NEXTCLOUD_WEBDAV_URL=http://localhost:8080/remote.php/dav
NEXTCLOUD_WEBDAV_USERNAME=admin
NEXTCLOUD_WEBDAV_PASSWORD=admin_dev_password

# CalDAV (for calendar integration)
NEXTCLOUD_CALDAV_URL=http://localhost:8080/remote.php/dav/calendars
NEXTCLOUD_CALDAV_USERNAME=admin
NEXTCLOUD_CALDAV_PASSWORD=admin_dev_password

# CardDAV (for contacts)
NEXTCLOUD_CARDDAV_URL=http://localhost:8080/remote.php/dav/addressbooks

# Admin credentials (for service account operations)
NEXTCLOUD_ADMIN_USER=admin
NEXTCLOUD_ADMIN_PASSWORD=admin_dev_password
```

### Step 4: Test Integration

Once VoiceAssist services are running (Phase 2+), test the integration:

```bash
# Test 1: Check Nextcloud is reachable
curl http://localhost:8080/status.php
# Should return JSON with Nextcloud status

# Test 2: Test OIDC discovery
curl http://localhost:8080/.well-known/openid-configuration
# Should return OIDC configuration

# Test 3: Test WebDAV access
curl -u admin:admin_dev_password \
  http://localhost:8080/remote.php/dav
# Should return WebDAV capabilities

# Test 4: From VoiceAssist auth service
# (This will be implemented in Phase 2)
docker exec voiceassist-auth-service python -c "
from app.integrations.nextcloud import NextcloudClient
client = NextcloudClient()
print(client.test_connection())
"
# Should print: Connection successful
```

---

## Production Setup

### Assumptions

In production, you likely have:
- Existing Nextcloud installation (e.g., https://cloud.asimo.io)
- OR need to deploy Nextcloud separately on Ubuntu server
- SSL certificates already configured
- MFA enabled for all users
- Regular backups in place

### Integration Steps

#### 1. Identify Nextcloud Instance

```bash
# If you have existing Nextcloud:
NEXTCLOUD_BASE_URL=https://cloud.asimo.io

# If deploying fresh Nextcloud on Ubuntu:
# Follow Nextcloud installation guide first
# https://docs.nextcloud.com/server/latest/admin_manual/installation/
```

#### 2. Configure OIDC in Production Nextcloud

Same steps as local dev, but with production URLs:

```
Name: VoiceAssist Production
Redirection URI: https://voiceassist.asimo.io/auth/callback
Type: Confidential
```

#### 3. Update Production VoiceAssist Environment

```bash
# In Ubuntu server: ~/VoiceAssist/.env
NEXTCLOUD_BASE_URL=https://cloud.asimo.io
NEXTCLOUD_OIDC_ISSUER=https://cloud.asimo.io
NEXTCLOUD_CLIENT_ID=<production_client_id>
NEXTCLOUD_CLIENT_SECRET=<production_client_secret>
NEXTCLOUD_REDIRECT_URI=https://voiceassist.asimo.io/auth/callback

# Use service account credentials
NEXTCLOUD_ADMIN_USER=voiceassist_service
NEXTCLOUD_ADMIN_PASSWORD=<secure_password>
```

#### 4. Create Service Account in Nextcloud

**Best Practice:** Don't use admin account for API access

```
1. Create user: voiceassist_service
2. Add to group: voiceassist_services
3. Grant necessary permissions:
   - WebDAV access
   - CalDAV access
   - User provisioning (if needed)
4. Generate app password for this account
```

#### 5. Test Production Integration

```bash
# SSH to Ubuntu server
ssh user@asimo.io

# Test Nextcloud connectivity
curl https://cloud.asimo.io/status.php

# Test from VoiceAssist
docker exec voiceassist-auth-service \
  python /app/scripts/test_nextcloud.py
```

---

## Integration Features

### 1. Authentication (OIDC)

**VoiceAssist Auth Service** implements OAuth 2.0 / OIDC client:

```python
# services/auth-service/app/integrations/nextcloud_oidc.py

from authlib.integrations.starlette_client import OAuth

oauth = OAuth()
oauth.register(
    name='nextcloud',
    client_id=settings.NEXTCLOUD_CLIENT_ID,
    client_secret=settings.NEXTCLOUD_CLIENT_SECRET,
    server_metadata_url=f'{settings.NEXTCLOUD_OIDC_ISSUER}/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid profile email'}
)

@app.get('/auth/login')
async def login(request: Request):
    redirect_uri = settings.NEXTCLOUD_REDIRECT_URI
    return await oauth.nextcloud.authorize_redirect(request, redirect_uri)

@app.get('/auth/callback')
async def auth_callback(request: Request):
    token = await oauth.nextcloud.authorize_access_token(request)
    user_info = token.get('userinfo')
    # Create/update user in VoiceAssist database
    # Generate VoiceAssist JWT token
    # Return to client
```

### 2. File Storage (WebDAV)

**File Indexer Service** accesses Nextcloud files:

```python
# services/file-indexer/app/integrations/nextcloud_webdav.py

from webdav3.client import Client

class NextcloudFileClient:
    def __init__(self):
        self.client = Client({
            'webdav_hostname': settings.NEXTCLOUD_WEBDAV_URL,
            'webdav_login': settings.NEXTCLOUD_WEBDAV_USERNAME,
            'webdav_password': settings.NEXTCLOUD_WEBDAV_PASSWORD
        })

    def list_files(self, path='/'):
        return self.client.list(path)

    def download_file(self, remote_path, local_path):
        self.client.download_sync(
            remote_path=remote_path,
            local_path=local_path
        )

    def upload_file(self, local_path, remote_path):
        self.client.upload_sync(
            remote_path=remote_path,
            local_path=local_path
        )
```

### 3. Calendar (CalDAV)

**Calendar Service** integrates with Nextcloud calendars:

```python
# services/calendar-email/app/integrations/nextcloud_caldav.py

import caldav
from datetime import datetime

class NextcloudCalendarClient:
    def __init__(self):
        self.client = caldav.DAVClient(
            url=settings.NEXTCLOUD_CALDAV_URL,
            username=settings.NEXTCLOUD_CALDAV_USERNAME,
            password=settings.NEXTCLOUD_CALDAV_PASSWORD
        )
        self.principal = self.client.principal()

    def get_calendars(self):
        return self.principal.calendars()

    def create_event(self, calendar_name, title, start, end, description=''):
        calendar = self.get_calendar_by_name(calendar_name)
        event = calendar.save_event(
            dtstart=start,
            dtend=end,
            summary=title,
            description=description
        )
        return event
```

### 4. Email (IMAP/SMTP or Nextcloud Mail API)

**Email Service** can use:
- **Option A:** IMAP/SMTP directly
- **Option B:** Nextcloud Mail API (if available)

```python
# services/calendar-email/app/integrations/nextcloud_email.py

import imaplib
import smtplib
from email.mime.text import MIMEText

class NextcloudEmailClient:
    def __init__(self):
        # IMAP for reading
        self.imap = imaplib.IMAP4_SSL('cloud.asimo.io', 993)
        self.imap.login(
            settings.NEXTCLOUD_EMAIL_USERNAME,
            settings.NEXTCLOUD_EMAIL_PASSWORD
        )

        # SMTP for sending
        self.smtp = smtplib.SMTP_SSL('cloud.asimo.io', 465)
        self.smtp.login(
            settings.NEXTCLOUD_EMAIL_USERNAME,
            settings.NEXTCLOUD_EMAIL_PASSWORD
        )

    def fetch_recent_emails(self, mailbox='INBOX', count=10):
        self.imap.select(mailbox)
        _, messages = self.imap.search(None, 'ALL')
        # Fetch and parse emails
        return emails

    def send_email(self, to, subject, body):
        msg = MIMEText(body)
        msg['Subject'] = subject
        msg['From'] = settings.NEXTCLOUD_EMAIL_USERNAME
        msg['To'] = to
        self.smtp.send_message(msg)
```

---

## Security Considerations

### Authentication Security

1. **OIDC Tokens**
   - Use short-lived access tokens (15 minutes)
   - Implement refresh tokens
   - Store tokens securely (encrypted in Redis)
   - Validate tokens on every request

2. **API Credentials**
   - Use app passwords instead of user passwords
   - Rotate credentials regularly
   - Store in environment variables, not code
   - Use separate service account for API access

### Network Security

**Local Development:**
- HTTP is acceptable for localhost
- Consider self-signed certs for HTTPS practice

**Production:**
- **ALWAYS use HTTPS** for Nextcloud communication
- Validate SSL certificates
- Use certificate pinning for critical operations
- Implement request signing for sensitive operations

### Data Privacy

1. **PHI Considerations**
   - Medical notes in Nextcloud must be encrypted
   - Use Nextcloud's encryption module
   - Never log file contents
   - Implement access controls in Nextcloud

2. **Audit Logging**
   - Log all Nextcloud API access
   - Track file downloads/uploads
   - Monitor authentication attempts
   - Alert on suspicious activity

---

## Troubleshooting

### Nextcloud Connection Issues

```bash
# Test 1: Can VoiceAssist reach Nextcloud?
docker exec voiceassist-auth-service \
  curl http://localhost:8080/status.php

# Test 2: Check OIDC configuration
curl http://localhost:8080/.well-known/openid-configuration

# Test 3: Verify OAuth client exists
# Login to Nextcloud → Settings → Administration → Security → OAuth 2.0
# Should see VoiceAssist client

# Test 4: Check redirect URI matches
# In Nextcloud OAuth config: http://localhost:8000/auth/callback
# In VoiceAssist .env: NEXTCLOUD_REDIRECT_URI=http://localhost:8000/auth/callback
```

### Authentication Failures

**Problem:** "Invalid redirect URI"
```
Solution: Ensure NEXTCLOUD_REDIRECT_URI in .env matches exactly
what's configured in Nextcloud OAuth client
```

**Problem:** "Client authentication failed"
```
Solution: Verify CLIENT_ID and CLIENT_SECRET are correct
Check for typos, extra spaces
```

**Problem:** "Token validation failed"
```
Solution: Ensure NEXTCLOUD_OIDC_ISSUER is correct
Check that Nextcloud OIDC app is enabled
```

### WebDAV Issues

**Problem:** "Unauthorized" when accessing files
```
Solution: Verify NEXTCLOUD_WEBDAV_USERNAME and PASSWORD
Check that user has permission to access files
```

**Problem:** "Method not allowed"
```
Solution: Ensure URL is correct: /remote.php/dav
Not /webdav or /dav
```

### CalDAV Issues

**Problem:** "Calendar not found"
```
Solution: Verify calendar exists for the user
Check CALDAV_URL includes /calendars/username/calendar-name
```

---

## Maintenance

### Updating Nextcloud Dev Stack

```bash
cd ~/Nextcloud-Dev

# Pull latest image
docker compose pull

# Restart with new image
docker compose down
docker compose up -d

# Check logs
docker compose logs -f nextcloud
```

### Backing Up Nextcloud Dev Data

```bash
# Backup volumes
docker run --rm \
  -v nextcloud-dev_nextcloud-data:/data \
  -v ~/Nextcloud-Dev/backups:/backup \
  ubuntu tar czf /backup/nextcloud-data-$(date +%Y%m%d).tar.gz /data

docker run --rm \
  -v nextcloud-dev_nextcloud-db:/data \
  -v ~/Nextcloud-Dev/backups:/backup \
  ubuntu tar czf /backup/nextcloud-db-$(date +%Y%m%d).tar.gz /data
```

### Cleaning Up

```bash
cd ~/Nextcloud-Dev

# Stop and remove containers
docker compose down

# Remove volumes (WARNING: deletes all data)
docker compose down -v

# Start fresh
docker compose up -d
```

---

## Summary

### Local Development Checklist

- [ ] Created ~/Nextcloud-Dev directory
- [ ] Created docker-compose.yml for Nextcloud
- [ ] Started Nextcloud stack
- [ ] Accessed http://localhost:8080
- [ ] Logged in as admin
- [ ] Installed OIDC app
- [ ] Created OAuth client for VoiceAssist
- [ ] Copied CLIENT_ID and CLIENT_SECRET
- [ ] Updated ~/VoiceAssist/.env with Nextcloud variables
- [ ] Created test user in Nextcloud
- [ ] Verified Nextcloud connectivity from VoiceAssist

### Production Deployment Checklist

- [ ] Identified/deployed production Nextcloud instance
- [ ] Configured OIDC with production URLs
- [ ] Created service account for VoiceAssist
- [ ] Generated app password
- [ ] Updated VoiceAssist production .env
- [ ] Tested connectivity from VoiceAssist
- [ ] Verified HTTPS is enforced
- [ ] Enabled MFA for all users
- [ ] Configured backup strategy
- [ ] Set up monitoring

### Integration Status

Track which integrations are implemented:

- [ ] Phase 0: Documentation complete
- [ ] Phase 1: N/A (databases only)
- [ ] Phase 2: OIDC authentication implemented
- [ ] Phase 3: N/A (internal services)
- [ ] Phase 4: N/A (voice pipeline)
- [ ] Phase 5: N/A (medical AI)
- [ ] Phase 6: WebDAV, CalDAV, file integration
- [ ] Phase 7: N/A (admin panel)
- [ ] Phase 8: N/A (observability)
- [ ] Phase 9: N/A (IaC)
- [ ] Phase 10: Load test Nextcloud integration

---

## References

- [Nextcloud Documentation](https://docs.nextcloud.com/)
- [Nextcloud OIDC App](https://github.com/nextcloud/openidconnect)
- [WebDAV Protocol](https://tools.ietf.org/html/rfc4918)
- [CalDAV Protocol](https://tools.ietf.org/html/rfc4791)
- [OAuth 2.0 Spec](https://oauth.net/2/)
- [OIDC Spec](https://openid.net/connect/)
