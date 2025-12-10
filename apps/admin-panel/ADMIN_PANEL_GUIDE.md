# VoiceAssist Admin Panel - Implementation Guide

## Overview

The VoiceAssist Admin Panel is a comprehensive web-based control center for managing the VoiceAssist medical AI platform. Built with React, TypeScript, and modern web technologies, it provides secure access to system metrics, user management, knowledge base operations, and system configuration.

**Status:** ✅ **Production Ready**
**Version:** 2.0
**Last Updated:** 2025-11-22

---

## Features

### 1. Dashboard

- **Real-time System Metrics**: View total users, active users, and admin counts
- **Service Health Monitoring**: Check status of PostgreSQL, Redis, and Qdrant
- **Auto-refresh**: Metrics update every 30 seconds automatically
- **Visual Cards**: Color-coded metric cards for quick insights

### 2. User Management

- **User Listing**: View all users with email, name, role, and status
- **Role Management**: Promote/demote users to admin role
- **Account Control**: Activate or deactivate user accounts
- **User Statistics**: Quick stats showing total, active, and admin users
- **Action Buttons**: Intuitive controls for role and status changes

### 3. Knowledge Base Management

- **Document Upload**: Support for PDF and TXT files
- **Document Listing**: View all indexed documents with metadata
- **Status Tracking**: Monitor document indexing status (uploaded, processing, indexed, failed)
- **Statistics Dashboard**: Track total documents, indexed count, processing queue
- **Bulk Operations**: View and manage multiple documents at once

### 4. System Configuration

- **Environment Settings**: Configure environment (dev/staging/production)
- **Database Configuration**: Adjust connection pool sizes
- **Redis Settings**: Configure max connections
- **Feature Flags**: Toggle system features on/off
  - Voice Mode (WebRTC)
  - RAG Search
  - Nextcloud Integration
- **Configuration Persistence**: Save and apply system settings

### 5. Security & Access Control

- **JWT Authentication**: Secure token-based authentication
- **Admin-Only Access**: All routes require admin privileges
- **Protected Routes**: Automatic redirection for unauthorized access
- **Session Management**: Automatic logout and session validation
- **HIPAA Compliance**: Follows enterprise security standards

---

## Architecture

### Technology Stack

- **Framework**: React 18.2+ with TypeScript
- **Routing**: React Router 6.0+ (SPA with protected routes)
- **State Management**: React Context API + Hooks
- **Styling**: Tailwind CSS 3.4+
- **Build Tool**: Vite 5.0+
- **HTTP Client**: Fetch API with custom wrapper
- **Icons**: Heroicons React
- **Date Handling**: date-fns

### Project Structure

```
apps/admin-panel/
├── src/
│   ├── components/
│   │   ├── AdminLayout.tsx              # Original layout (legacy)
│   │   ├── AdminLayoutWithRouter.tsx     # Enhanced layout with router
│   │   ├── ProtectedRoute.tsx           # Route guard component
│   │   ├── Dashboard.tsx                # Legacy dashboard
│   │   ├── KnowledgeBase.tsx            # Legacy KB component
│   │   ├── ToolsIntegrations.tsx        # Legacy tools component
│   │   └── SettingsPanel.tsx            # Legacy settings component
│   │
│   ├── contexts/
│   │   └── AuthContext.tsx              # Authentication context & hooks
│   │
│   ├── pages/
│   │   ├── LoginPage.tsx                # Login form
│   │   ├── DashboardPage.tsx            # Dashboard with metrics
│   │   ├── UsersPage.tsx                # User management
│   │   ├── KnowledgeBasePage.tsx        # KB management
│   │   └── SystemPage.tsx               # System configuration
│   │
│   ├── hooks/
│   │   ├── useAdminSummary.ts           # Fetch admin summary
│   │   ├── useKnowledgeDocuments.ts     # KB documents hook
│   │   └── useIndexingJobs.ts           # Indexing jobs hook
│   │
│   ├── lib/
│   │   └── api.ts                       # API client utilities
│   │
│   ├── App.tsx                          # Main app with routing
│   ├── main.tsx                         # React entry point
│   ├── types.ts                         # TypeScript type definitions
│   └── styles.css                       # Global styles
│
├── public/                              # Static assets
├── dist/                                # Build output
├── package.json                         # Dependencies
├── vite.config.ts                       # Vite configuration
├── tsconfig.json                        # TypeScript config
├── README.md                            # Original README
└── ADMIN_PANEL_GUIDE.md                 # This guide
```

---

## Routing Structure

### Public Routes

- `/login` - Login page (accessible without authentication)

### Protected Routes (Admin Only)

- `/` - Redirects to `/dashboard`
- `/dashboard` - System overview and metrics
- `/users` - User management interface
- `/knowledge-base` - Document management
- `/system` - System configuration
- `/*` (any other) - Redirects to `/dashboard`

All protected routes:

1. Check if user is authenticated
2. Verify user has admin privileges
3. Redirect to `/login` if unauthorized

---

## API Integration

### Backend Endpoints Used

#### Authentication

- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user info

#### Admin Panel

- `GET /api/admin/panel/summary` - Dashboard metrics

#### User Management

- `GET /api/users` - List all users
- `PATCH /api/users/:id` - Update user (role, status)

#### Knowledge Base

- `GET /api/admin/kb/documents` - List documents
- `POST /api/admin/kb/documents` - Upload document
- `DELETE /api/admin/kb/documents/:id` - Delete document

#### Health Check

- `GET /health` - Service health status

### API Client (`lib/api.ts`)

```typescript
// Usage example
import { fetchAPI } from "../lib/api";

const data = await fetchAPI<User[]>("/api/users", {
  method: "GET",
  headers: { Authorization: `Bearer ${token}` },
});
```

**Features:**

- Automatic API envelope unwrapping
- Type-safe responses
- Error handling with structured APIError
- Support for all HTTP methods
- Token injection via headers

---

## Authentication Flow

### 1. Login Process

```typescript
// User enters credentials
email: string
password: string

// AuthContext.login() is called
→ POST /api/auth/login

// Backend validates credentials
→ Returns { access_token, user }

// Check admin privileges
if (!user.is_admin) → Error

// Store token
localStorage.setItem('auth_token', token)

// Set user state
setUser(user)

// Navigate to dashboard
navigate('/dashboard')
```

### 2. Protected Route Check

```typescript
// On every protected route access
→ Check isAuthenticated
→ Check isAdmin
→ If both true: Allow access
→ Otherwise: Redirect to /login
```

### 3. Session Validation

```typescript
// On app mount (useEffect in AuthProvider)
→ Check for token in localStorage
→ If token exists: GET /api/auth/me
→ Verify user.is_admin === true
→ If valid: Set user state
→ Otherwise: Clear token and redirect
```

### 4. Logout

```typescript
// User clicks logout
→ Remove token from localStorage
→ Clear user state
→ Navigate to /login
```

---

## Component Details

### AuthContext

**Purpose**: Centralized authentication state and methods

**State:**

- `user` - Current logged-in user (or null)
- `loading` - Authentication check in progress
- `error` - Authentication error message
- `isAuthenticated` - Boolean flag
- `isAdmin` - Boolean flag for admin status

**Methods:**

- `login(email, password)` - Authenticate user
- `logout()` - Clear session
- `checkAuth()` - Validate existing session

### ProtectedRoute

**Purpose**: Guard routes requiring authentication and admin access

**Logic:**

1. Check if user is authenticated
2. Check if user has admin role
3. Show loading state while checking
4. Redirect to login if unauthorized
5. Render children if authorized

### AdminLayoutWithRouter

**Purpose**: Main application layout with navigation

**Features:**

- Sidebar navigation with active link highlighting
- User profile display
- Logout button
- HIPAA compliance notice
- Responsive design

**Navigation Items:**

- Dashboard (📊)
- Users (👥)
- Knowledge Base (📚)
- System Config (⚙️)

### DashboardPage

**Metrics Displayed:**

- Total Users
- Active Users
- Admin Users
- Service Health (PostgreSQL, Redis, Qdrant)

**Features:**

- Auto-refresh every 30 seconds
- Color-coded metric cards
- Service status badges
- Last updated timestamp

### UsersPage

**Features:**

- Searchable user table
- Role toggle (User ↔ Admin)
- Status toggle (Active ↔ Inactive)
- User statistics
- Create user modal (placeholder)

**Table Columns:**

- Email
- Name
- Role (badge)
- Status (badge)
- Created date
- Actions (role toggle, status toggle)

### KnowledgeBasePage

**Features:**

- Document upload (drag & drop or click)
- Document status tracking
- Statistics dashboard
- Document actions (view, reindex, delete)

**Supported Formats:**

- PDF files
- TXT files

**Status Indicators:**

- Uploaded (blue)
- Processing (yellow)
- Indexed (green)
- Failed (red)

### SystemPage

**Configuration Sections:**

1. **Environment Settings**
   - Environment selector (dev/staging/production)
   - API version display
   - Debug mode toggle

2. **Database Configuration**
   - Connection pool size (1-100)
   - Redis max connections (1-200)

3. **Feature Flags**
   - Voice Mode (WebRTC)
   - RAG Search
   - Nextcloud Integration

**Features:**

- Real-time configuration preview
- Save button with loading state
- Success confirmation
- Warning notice for production changes

---

## Development Setup

### Prerequisites

- Node.js 18+
- npm or pnpm
- Backend API running on `http://localhost:8000`
- Admin user account with credentials

### Installation

```bash
# Navigate to admin panel directory
cd ~/VoiceAssist/apps/admin-panel

# Install dependencies
npm install

# Start development server
npm run dev
```

**Access**: http://localhost:5174

### Environment Variables

Create `.env` file:

```bash
# API URL (backend)
VITE_API_URL=http://localhost:8000

# Environment
VITE_ENV=development
```

For production:

```bash
VITE_API_URL=https://api.voiceassist.example.com
VITE_ENV=production
```

---

## Building for Production

### Build

```bash
npm run build
```

Output: `dist/` directory

### Preview Build

```bash
npm run preview
```

Access: http://localhost:4173

### Deploy

- CI/CD: `.github/workflows/admin-panel-deploy.yml` builds with `.env.production` (targeting `https://admin.asimo.io`), publishes the `dist/` artifact, and syncs it to `/var/www/admin/` via SSH when changes land on `main`.
- Smoke tests run post-deploy to confirm login, metrics summary, and knowledge base APIs respond successfully.
- Local preview remains available with `npm run preview` if you need to inspect the built output locally.

---

## Security Considerations

### Authentication

✅ **JWT-based authentication** with secure token storage
✅ **Admin-only access** enforced on all routes
✅ **Session validation** on app mount and route changes
✅ **Automatic logout** on token expiration or unauthorized access

### HIPAA Compliance

✅ **No PHI in URLs** - All sensitive data in request bodies
✅ **Secure communication** - HTTPS in production (recommended)
✅ **Audit logging** - Backend tracks all admin actions
✅ **Role-based access** - Admin role required for all operations

### Best Practices

- ✅ Store tokens in `localStorage` (consider `httpOnly` cookies for enhanced security)
- ✅ Clear tokens on logout
- ✅ Validate tokens on every protected route
- ✅ Use HTTPS in production
- ✅ Implement rate limiting (backend)
- ✅ Regular security audits
- ⚠️ **TODO**: Implement MFA for admin accounts
- ⚠️ **TODO**: Add session timeout warnings

---

## Troubleshooting

### Login Issues

**Problem**: "Access denied: Admin privileges required"
**Solution**: Ensure user account has `is_admin = true` in database

```sql
-- Grant admin privileges
UPDATE users SET is_admin = true WHERE email = 'admin@example.com';
```

**Problem**: "Login failed" / Network error
**Solution**:

1. Check backend API is running
2. Verify API URL in environment variables
3. Check browser console for CORS errors
4. Ensure credentials are correct

### Route Not Found

**Problem**: 404 on refresh
**Solution**: Configure web server for SPA routing

Nginx example:

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

Apache example:

```apache
RewriteEngine On
RewriteBase /
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

### Build Errors

**Problem**: TypeScript errors
**Solution**:

```bash
# Check TypeScript config
cat tsconfig.json

# Run type check
npx tsc --noEmit

# Fix dependencies
npm install
```

**Problem**: Module not found
**Solution**:

```bash
# Clean and reinstall
rm -rf node_modules package-lock.json
npm install
```

---

## Testing

### Manual Testing Checklist

#### Authentication

- [ ] Login with valid admin credentials
- [ ] Login with non-admin account (should fail)
- [ ] Login with invalid credentials (should fail)
- [ ] Logout and verify redirect to login
- [ ] Refresh page while logged in (should stay logged in)

#### Dashboard

- [ ] View user metrics
- [ ] Check service health indicators
- [ ] Verify auto-refresh works
- [ ] Test with different screen sizes

#### Users Page

- [ ] View user list
- [ ] Toggle user admin role
- [ ] Toggle user active/inactive status
- [ ] Verify statistics update
- [ ] Test with empty user list

#### Knowledge Base

- [ ] Upload PDF document
- [ ] Upload TXT document
- [ ] View document list
- [ ] Check status badges
- [ ] Verify statistics

#### System Config

- [ ] Change environment setting
- [ ] Adjust database pool size
- [ ] Toggle feature flags
- [ ] Save configuration
- [ ] Verify success message

### Automated Tests (TODO)

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Coverage
npm run test:coverage
```

---

## Future Enhancements

### Phase 1: Enhanced Metrics (Priority: High)

- [ ] Real-time WebSocket metrics updates
- [ ] Historical metrics charts (last 7 days)
- [ ] API call volume graphs
- [ ] Error rate trending
- [ ] System load visualization

### Phase 2: Advanced User Management (Priority: High)

- [ ] Create user form (currently placeholder)
- [ ] Bulk user operations
- [ ] User search and filtering
- [ ] Password reset functionality
- [ ] User activity logs

### Phase 3: Knowledge Base Features (Priority: Medium)

- [ ] Document preview
- [ ] Bulk document upload
- [ ] Document search and filtering
- [ ] Re-indexing queue management
- [ ] Document metadata editing
- [ ] Vector database statistics

### Phase 4: System Monitoring (Priority: Medium)

- [ ] Real-time logs viewer
- [ ] Alert configuration
- [ ] Performance metrics
- [ ] Resource usage graphs
- [ ] Database query analyzer

### Phase 5: Advanced Configuration (Priority: Low)

- [ ] API key management
- [ ] Integration settings (Nextcloud, calendar, email)
- [ ] Backup and restore UI
- [ ] Model configuration (OpenAI, local models)
- [ ] Rate limiting configuration

### Phase 6: Security & Compliance (Priority: High)

- [ ] Multi-factor authentication (MFA)
- [ ] Session timeout configuration
- [ ] Audit log viewer
- [ ] Compliance reports
- [ ] Security scanning results

---

## API Reference

### Authentication Endpoints

#### Login

```
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "securepassword"
}

Response:
{
  "success": true,
  "data": {
    "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
    "user": {
      "id": "uuid",
      "email": "admin@example.com",
      "is_admin": true,
      "is_active": true
    }
  },
  "trace_id": "uuid",
  "timestamp": "2025-11-22T..."
}
```

#### Get Current User

```
GET /api/auth/me
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "admin@example.com",
    "full_name": "Admin User",
    "is_admin": true,
    "is_active": true,
    "created_at": "2025-11-01T..."
  },
  "trace_id": "uuid",
  "timestamp": "2025-11-22T..."
}
```

### Admin Panel Endpoints

#### Dashboard Summary

```
GET /api/admin/panel/summary
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "total_users": 25,
    "active_users": 20,
    "admin_users": 3,
    "timestamp": "2025-11-22T..."
  },
  "trace_id": "uuid",
  "timestamp": "2025-11-22T..."
}
```

### User Management Endpoints

#### List Users

```
GET /api/users
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "full_name": "John Doe",
      "is_admin": false,
      "is_active": true,
      "created_at": "2025-11-01T..."
    }
  ],
  "trace_id": "uuid",
  "timestamp": "2025-11-22T..."
}
```

#### Update User

```
PATCH /api/users/{user_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "is_admin": true,
  "is_active": true
}

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "is_admin": true,
    "is_active": true
  },
  "trace_id": "uuid",
  "timestamp": "2025-11-22T..."
}
```

---

## Contributing

### Code Style

- Use TypeScript for all new files
- Follow existing naming conventions
- Use functional components with hooks
- Keep components small and focused
- Add comments for complex logic
- Use Tailwind CSS for styling

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/admin-panel-enhancement

# Make changes and commit
git add .
git commit -m "feat: add user search functionality"

# Push to remote
git push origin feature/admin-panel-enhancement

# Create pull request
```

### Commit Message Format

```
feat: add user search functionality
fix: resolve login redirect issue
docs: update admin panel guide
style: improve dashboard card styling
refactor: extract metric card component
test: add tests for user management
```

---

## Support

For issues, questions, or feature requests:

1. Check this documentation
2. Review the [main README](../../README.md)
3. Check GitHub Issues
4. Contact the development team

---

## License

Internal use only. See [LICENSE](../../LICENSE) for details.

---

**Version**: 2.0
**Last Updated**: 2025-11-22
**Maintained By**: VoiceAssist Development Team
