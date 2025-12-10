/**
 * Global Setup for E2E Tests
 *
 * Runs before all tests to set up authentication state.
 * For live backend tests, this fetches real JWT tokens.
 *
 * Features:
 * - Token caching: Reuses valid cached tokens to avoid rate limits
 * - Retry logic: Handles rate limiting with exponential backoff
 * - Graceful degradation: Falls back to mock auth if backend unavailable
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load E2E environment variables from e2e/.env.e2e
dotenv.config({ path: path.join(__dirname, ".env.e2e") });

const AUTH_FILE = path.join(__dirname, ".auth/user.json");
const ADMIN_AUTH_FILE = path.join(__dirname, ".auth/admin.json");
const API_BASE_URL = process.env.API_URL || "http://localhost:8000";

// Token validity buffer - refresh if token expires within this many seconds
const TOKEN_REFRESH_BUFFER_SECONDS = 60;

// Test user credentials
const E2E_USER = {
  email: process.env.E2E_EMAIL || "e2e-test@voiceassist.io",
  password: process.env.E2E_PASSWORD || "E2eTestPassword123!",
  fullName: "E2E Test User",
};

// Admin user credentials (for feature flag operations)
const E2E_ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL || "mo@asimo.io",
  password: process.env.E2E_ADMIN_PASSWORD || "",
};

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in: number;
  role: string;
}

interface UserResponse {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_admin: boolean;
  admin_role: string;
  created_at: string;
}

async function getOrCreateTestUser(): Promise<UserResponse | null> {
  // Try to register (will fail if user exists, which is fine)
  try {
    const registerRes = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: E2E_USER.email,
        password: E2E_USER.password,
        full_name: E2E_USER.fullName,
      }),
    });

    if (registerRes.ok) {
      const user = (await registerRes.json()) as UserResponse;
      console.log(`[E2E Setup] Created new test user: ${user.email}`);
      return user;
    }
  } catch (e) {
    // Registration failed, user may already exist
  }

  return null;
}

async function loginTestUser(): Promise<{
  tokens: TokenResponse;
  user: UserResponse | null;
} | null> {
  try {
    const loginRes = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: E2E_USER.email,
        password: E2E_USER.password,
      }),
    });

    if (!loginRes.ok) {
      const error = await loginRes.text();
      console.error(`[E2E Setup] Login failed: ${error}`);
      return null;
    }

    const tokens = (await loginRes.json()) as TokenResponse;
    return { tokens, user: null };
  } catch (e) {
    console.error(`[E2E Setup] Login error:`, e);
    return null;
  }
}

async function loginAdminUser(): Promise<TokenResponse | null> {
  // Skip if no admin password provided
  if (!E2E_ADMIN.password) {
    console.log("[E2E Setup] No admin password provided - skipping admin auth");
    return null;
  }

  // Use retry logic for admin login too
  return loginWithRetry(E2E_ADMIN.email, E2E_ADMIN.password);
}

/**
 * Check if admin tokens are still valid and refresh if needed
 */
async function refreshAdminTokensIfNeeded(): Promise<void> {
  if (!E2E_ADMIN.password) return;

  try {
    if (fs.existsSync(ADMIN_AUTH_FILE)) {
      const adminData = JSON.parse(fs.readFileSync(ADMIN_AUTH_FILE, "utf-8"));
      if (adminData.accessToken && isTokenValid(adminData.accessToken)) {
        console.log("[E2E Setup] Admin tokens still valid - skipping refresh");
        return;
      }
    }
  } catch {
    // Fall through to refresh
  }

  console.log("[E2E Setup] Refreshing admin tokens...");
  const adminTokens = await loginAdminUser();
  if (adminTokens) {
    const adminAuthData = {
      accessToken: adminTokens.access_token,
      refreshToken: adminTokens.refresh_token,
      email: E2E_ADMIN.email,
    };
    fs.writeFileSync(ADMIN_AUTH_FILE, JSON.stringify(adminAuthData, null, 2));
    console.log(`[E2E Setup] Wrote admin auth state to ${ADMIN_AUTH_FILE}`);
  }
}

async function decodeJwtPayload(token: string): Promise<Record<string, unknown>> {
  const parts = token.split(".");
  if (parts.length !== 3) return {};

  try {
    const payload = Buffer.from(parts[1], "base64").toString("utf-8");
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

/**
 * Check if a cached token is still valid (not expired or about to expire)
 */
function isTokenValid(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
    const exp = payload.exp as number;

    if (!exp) return false;

    // Token is valid if it expires more than TOKEN_REFRESH_BUFFER_SECONDS in the future
    const expiresAt = exp * 1000;
    const now = Date.now();
    const bufferMs = TOKEN_REFRESH_BUFFER_SECONDS * 1000;

    return expiresAt > (now + bufferMs);
  } catch {
    return false;
  }
}

/**
 * Try to get cached tokens from storage state file
 */
function getCachedTokens(): { accessToken: string; refreshToken: string } | null {
  try {
    if (!fs.existsSync(AUTH_FILE)) return null;

    const storageState = JSON.parse(fs.readFileSync(AUTH_FILE, "utf-8"));
    const authStorage = storageState.origins?.[0]?.localStorage?.find(
      (item: { name: string }) => item.name === "voiceassist-auth"
    );

    if (!authStorage) return null;

    const authState = JSON.parse(authStorage.value);
    const accessToken = authState.state?.tokens?.accessToken;
    const refreshToken = authState.state?.tokens?.refreshToken;

    if (!accessToken || !refreshToken) return null;

    // Check if access token is still valid
    if (!isTokenValid(accessToken)) {
      console.log("[E2E Setup] Cached token expired or about to expire");
      return null;
    }

    return { accessToken, refreshToken };
  } catch (e) {
    console.log("[E2E Setup] Failed to read cached tokens:", e);
    return null;
  }
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Login with retry logic for rate limiting
 */
async function loginWithRetry(
  email: string,
  password: string,
  maxRetries = 3
): Promise<TokenResponse | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const loginRes = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (loginRes.ok) {
        return (await loginRes.json()) as TokenResponse;
      }

      const errorText = await loginRes.text();

      // Check for rate limiting
      if (loginRes.status === 429 || errorText.includes("Rate limit")) {
        // Extract wait time from error message if available, otherwise use exponential backoff
        const waitMs = Math.min(1000 * Math.pow(2, attempt), 60000); // Max 60 seconds
        console.log(`[E2E Setup] Rate limited (attempt ${attempt}/${maxRetries}), waiting ${waitMs}ms...`);
        await sleep(waitMs);
        continue;
      }

      console.error(`[E2E Setup] Login failed (${loginRes.status}): ${errorText}`);
      return null;
    } catch (e) {
      console.error(`[E2E Setup] Login error (attempt ${attempt}/${maxRetries}):`, e);
      if (attempt < maxRetries) {
        const waitMs = 1000 * attempt;
        await sleep(waitMs);
      }
    }
  }

  return null;
}

async function globalSetup() {
  console.log("[E2E Setup] Starting global setup...");

  // Only run token refresh for live backend tests
  const isLiveTest =
    process.env.LIVE_REALTIME_E2E === "1" ||
    process.env.LIVE_BACKEND === "1";

  if (!isLiveTest) {
    console.log("[E2E Setup] Mock mode - creating placeholder auth state");

    // Create a mock auth state for non-live tests
    // IMPORTANT: Use backend format (snake_case) as that's what the frontend stores after real login
    const mockAuthState = {
      state: {
        user: {
          id: "mock-user-id",
          email: E2E_USER.email,
          full_name: E2E_USER.fullName,
          is_active: true,
          is_admin: true,
          admin_role: "admin",
          nextcloud_user_id: null,
          created_at: new Date().toISOString(),
          last_login: new Date().toISOString(),
        },
        tokens: {
          accessToken: "mock-access-token",
          refreshToken: "mock-refresh-token",
          expiresIn: 3600,
        },
        isAuthenticated: true,
      },
      version: 0,
    };

    // Include sw-cleanup-version to prevent service worker cleanup from reloading
    // the page and losing the auth state. Must match the version in index.html.
    const SW_CLEANUP_VERSION = "20251207i";

    const mockStorageState = {
      cookies: [],
      origins: [
        {
          origin: "http://localhost:5173",
          localStorage: [
            {
              name: "voiceassist-auth",
              value: JSON.stringify(mockAuthState),
            },
            {
              name: "sw-cleanup-version",
              value: SW_CLEANUP_VERSION,
            },
          ],
        },
      ],
    };

    // Ensure .auth directory exists
    const authDir = path.dirname(AUTH_FILE);
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    // Write the mock storage state file
    fs.writeFileSync(AUTH_FILE, JSON.stringify(mockStorageState, null, 2));
    console.log(`[E2E Setup] Wrote mock auth state to ${AUTH_FILE}`);
    return;
  }

  console.log(`[E2E Setup] Live mode - fetching tokens from ${API_BASE_URL}`);

  // First, check if we have valid cached tokens
  const cachedTokens = getCachedTokens();
  if (cachedTokens) {
    console.log("[E2E Setup] Using cached valid tokens - skipping login");
    // Also check and refresh admin tokens if needed
    await refreshAdminTokensIfNeeded();
    return;
  }

  console.log("[E2E Setup] No valid cached tokens - performing login...");

  // Ensure test user exists
  await getOrCreateTestUser();

  // Login to get fresh tokens with retry logic
  const tokens = await loginWithRetry(E2E_USER.email, E2E_USER.password);
  if (!tokens) {
    console.error("[E2E Setup] Failed to get tokens after retries - tests may fail");
    // Check if we have any existing auth file to use as fallback
    if (fs.existsSync(AUTH_FILE)) {
      console.log("[E2E Setup] Using existing auth file as fallback");
    }
    return;
  }

  // Decode token to get user info
  const payload = await decodeJwtPayload(tokens.access_token);
  const userId = payload.sub as string;
  const userEmail = payload.email as string;

  console.log(`[E2E Setup] Got tokens for user: ${userEmail} (${userId})`);

  // Build auth state for localStorage
  // IMPORTANT: Use backend format (snake_case) as that's what the frontend stores after real login
  const authState = {
    state: {
      user: {
        id: userId,
        email: userEmail,
        full_name: E2E_USER.fullName,
        is_active: true,
        is_admin: tokens.role === "admin" || tokens.role === "super_admin",
        admin_role: tokens.role || "admin",
        nextcloud_user_id: null,
        created_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
      },
      tokens: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
      },
      isAuthenticated: true,
    },
    version: 0,
  };

  // Build storage state file
  // Include sw-cleanup-version to prevent service worker cleanup from reloading
  // the page and losing the auth state. The cleanup version must match index.html.
  const SW_CLEANUP_VERSION = "20251207i";

  const storageState = {
    cookies: [],
    origins: [
      {
        origin: "http://localhost:5173",
        localStorage: [
          {
            name: "voiceassist-auth",
            value: JSON.stringify(authState),
          },
          {
            name: "sw-cleanup-version",
            value: SW_CLEANUP_VERSION,
          },
        ],
      },
    ],
  };

  // Ensure .auth directory exists
  const authDir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Write the storage state file
  fs.writeFileSync(AUTH_FILE, JSON.stringify(storageState, null, 2));
  console.log(`[E2E Setup] Wrote auth state to ${AUTH_FILE}`);

  // Calculate token expiry
  const exp = payload.exp as number;
  const expiresAt = new Date(exp * 1000);
  console.log(`[E2E Setup] Token expires at: ${expiresAt.toISOString()}`);

  // Also get admin tokens for feature flag operations
  await refreshAdminTokensIfNeeded();
}

export default globalSetup;
