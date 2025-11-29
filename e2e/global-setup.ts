/**
 * Global Setup for E2E Tests
 *
 * Runs before all tests to set up authentication state.
 * For live backend tests, this fetches real JWT tokens.
 */

import fs from "fs";
import path from "path";

const AUTH_FILE = path.join(__dirname, ".auth/user.json");
const API_BASE_URL = process.env.API_URL || "http://localhost:8000";

// Test user credentials
const E2E_USER = {
  email: process.env.E2E_EMAIL || "e2e-test@voiceassist.io",
  password: process.env.E2E_PASSWORD || "E2eTestPassword123!",
  fullName: "E2E Test User",
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

async function globalSetup() {
  console.log("[E2E Setup] Starting global setup...");

  // Only run token refresh for live backend tests
  const isLiveTest =
    process.env.LIVE_REALTIME_E2E === "1" ||
    process.env.LIVE_BACKEND === "1";

  if (!isLiveTest) {
    console.log("[E2E Setup] Mock mode - skipping token refresh");
    return;
  }

  console.log(`[E2E Setup] Live mode - fetching tokens from ${API_BASE_URL}`);

  // Ensure test user exists
  await getOrCreateTestUser();

  // Login to get fresh tokens
  const result = await loginTestUser();
  if (!result) {
    console.error("[E2E Setup] Failed to get tokens - tests may fail");
    return;
  }

  const { tokens } = result;

  // Decode token to get user info
  const payload = await decodeJwtPayload(tokens.access_token);
  const userId = payload.sub as string;
  const userEmail = payload.email as string;

  console.log(`[E2E Setup] Got tokens for user: ${userEmail} (${userId})`);

  // Build auth state for localStorage
  const authState = {
    state: {
      user: {
        id: userId,
        email: userEmail,
        name: E2E_USER.fullName,
        role: tokens.role || "user",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      tokens: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
      },
      isAuthenticated: true,
      _hasHydrated: true,
    },
    version: 0,
  };

  // Build storage state file
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
}

export default globalSetup;
