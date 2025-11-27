---
title: "Oauth Login Config"
slug: "oauth-login-config"
summary: "This document explains how to configure Google and Microsoft OAuth login for VoiceAssist."
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience: ["human"]
tags: ["oauth", "login", "config"]
---

# OAuth Login Configuration Guide

This document explains how to configure Google and Microsoft OAuth login for VoiceAssist.

## Overview

VoiceAssist supports OAuth 2.0 authentication with:

- **Google** (Google Sign-In)
- **Microsoft** (Microsoft Entra ID / Azure AD)

When configured, users can sign in using their existing Google or Microsoft accounts instead of creating a separate password.

## Environment Variables

Add these environment variables to your `.env` file or deployment configuration:

### Google OAuth

```env
# Google OAuth (optional - leave empty to disable)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_OAUTH_REDIRECT_URI=https://your-domain.com/auth/callback/google
```

### Microsoft OAuth

```env
# Microsoft OAuth (optional - leave empty to disable)
MICROSOFT_CLIENT_ID=your-microsoft-application-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
MICROSOFT_OAUTH_REDIRECT_URI=https://your-domain.com/auth/callback/microsoft
```

## Setting Up OAuth Providers

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services > Credentials**
4. Click **Create Credentials > OAuth client ID**
5. Select **Web application** as the application type
6. Configure authorized redirect URIs:
   - For development: `http://localhost:5173/auth/callback/google`
   - For production: `https://your-domain.com/auth/callback/google`
7. Copy the Client ID and Client Secret to your environment variables

### Microsoft OAuth Setup

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Microsoft Entra ID > App registrations**
3. Click **New registration**
4. Enter a name for your application
5. Select supported account types (typically "Accounts in any organizational directory and personal Microsoft accounts")
6. Add redirect URI:
   - Platform: Web
   - For development: `http://localhost:5173/auth/callback/microsoft`
   - For production: `https://your-domain.com/auth/callback/microsoft`
7. Under **Certificates & secrets**, create a new client secret
8. Copy the Application (client) ID and client secret value to your environment variables

## API Endpoints

### Get OAuth Authorization URL

```
GET /api/auth/oauth/{provider}/authorize
```

**Parameters:**

- `provider`: `google` or `microsoft`

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "url": "https://accounts.google.com/o/oauth2/v2/auth?...",
    "state": "random-csrf-state-token"
  },
  "error": null,
  "metadata": {...},
  "timestamp": "2024-01-15T10:00:00.000Z"
}
```

**Response (503 Service Unavailable):**
When provider is not configured:

```json
{
  "detail": "Google OAuth is not configured. Please contact the administrator."
}
```

### OAuth Callback

```
POST /api/auth/oauth/{provider}/callback
```

**Parameters:**

- `provider`: `google` or `microsoft`

**Request Body:**

```json
{
  "code": "authorization-code-from-provider"
}
```

**Response (200 OK):**

```json
{
  "access_token": "jwt-access-token",
  "refresh_token": "jwt-refresh-token",
  "token_type": "bearer",
  "expires_in": 900
}
```

### Check Provider Status

```
GET /api/auth/oauth/{provider}/status
```

**Response:**

```json
{
  "success": true,
  "data": {
    "provider": "google",
    "configured": true,
    "enabled": true
  },
  "error": null,
  "metadata": {...},
  "timestamp": "2024-01-15T10:00:00.000Z"
}
```

## Frontend Integration

The frontend OAuth flow works as follows:

1. User clicks "Sign in with Google" or "Sign in with Microsoft"
2. Frontend calls `GET /api/auth/oauth/{provider}/authorize`
3. Frontend receives the authorization URL and redirects the browser to it
4. User authenticates with the provider
5. Provider redirects back to `/auth/callback/{provider}?code=...`
6. Frontend extracts the code and calls `POST /api/auth/oauth/{provider}/callback`
7. Backend exchanges code for tokens and creates/finds the user
8. Backend returns JWT tokens
9. Frontend stores tokens and redirects to the app

## User Account Behavior

### New Users

When a user signs in via OAuth for the first time:

- A new account is created using their email from the OAuth provider
- The user's name is taken from the provider profile
- No password is set (OAuth-only account)

### Existing Users

If a user with the same email already exists:

- The OAuth provider is linked to the existing account
- User can now sign in with either method (password or OAuth)

### Account Security

- OAuth accounts without passwords cannot use password-based login
- OAuth provider ID is stored to prevent account hijacking
- Users cannot change their email to another user's OAuth-linked email

## Troubleshooting

### "OAuth not configured" Error

- Verify the environment variables are set correctly
- Ensure both `CLIENT_ID` and `CLIENT_SECRET` are provided
- Restart the API server after changing environment variables

### "Failed to exchange authorization code"

- Check that the redirect URI matches exactly (including trailing slashes)
- Verify the client secret is correct
- Check server logs for detailed error messages

### User Not Found After OAuth

- Check that the email scope is included in the OAuth request
- Verify the provider returned an email address
- Check server logs for user creation errors

## Running Tests

Run the OAuth integration tests:

```bash
cd services/api-gateway
source venv/bin/activate
pytest tests/integration/test_auth_oauth.py -v
```

## Security Considerations

1. **State Parameter**: The authorize endpoint generates a random state parameter for CSRF protection
2. **HTTPS Required**: OAuth redirect URIs must use HTTPS in production
3. **Secret Storage**: Never commit OAuth secrets to version control
4. **Token Validation**: All tokens from OAuth providers are validated before use
5. **Rate Limiting**: OAuth endpoints have rate limits to prevent abuse
