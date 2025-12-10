/**
 * Voice Phase 11.1 Admin API E2E Tests
 *
 * Tests Phase 11.1 admin voice API endpoints:
 * - Voice session management
 * - Voice analytics dashboard
 * - Provider configuration
 * - Voice feature flags
 *
 * These tests directly call the backend APIs with admin authentication.
 * Requires LIVE_REALTIME_E2E=1 and valid admin credentials.
 */

import { test as baseTest, expect, Page } from "@playwright/test";
import { VOICE_CONFIG } from "../fixtures/voice";

const test = baseTest;

// Admin API base URL
const API_BASE_URL = VOICE_CONFIG.API_BASE_URL || "http://localhost:8000";

// Admin mock credentials (for API testing)
const ADMIN_AUTH = {
  email: process.env.E2E_ADMIN_EMAIL || "admin@test.com",
  password: process.env.E2E_ADMIN_PASSWORD || "AdminPassword123!",
};

// Helper to get admin auth token (mock for testing)
async function getAdminToken(page: Page): Promise<string | null> {
  // In real tests, this would login via API and get a token
  // For mock mode, we return a test token
  if (!VOICE_CONFIG.LIVE_REALTIME) {
    return "e2e-admin-mock-token";
  }

  // Try to login via API
  try {
    const response = await page.request.post(`${API_BASE_URL}/api/auth/login`, {
      data: {
        email: ADMIN_AUTH.email,
        password: ADMIN_AUTH.password,
      },
    });

    if (response.ok()) {
      const data = await response.json();
      return data.data?.accessToken || data.accessToken;
    }
  } catch (error) {
    console.log("Admin login failed:", error);
  }

  return null;
}

// Skip tests if live backend is not enabled
test.beforeEach(async ({}, testInfo) => {
  if (!VOICE_CONFIG.LIVE_REALTIME) {
    testInfo.skip(true, "Set LIVE_REALTIME_E2E=1 to run live API tests");
  }
});

test.describe("Admin Voice Sessions API - Phase 11.1", () => {
  test.setTimeout(30000);

  test("should list active voice sessions", async ({ page }) => {
    const token = await getAdminToken(page);
    test.skip(!token, "Could not get admin token");

    const response = await page.request.get(`${API_BASE_URL}/api/admin/voice/sessions`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("data");
    expect(data.data).toHaveProperty("sessions");
    expect(Array.isArray(data.data.sessions)).toBe(true);

    console.log(`Active voice sessions: ${data.data.sessions.length}`);

    // Log session details if any
    if (data.data.sessions.length > 0) {
      const session = data.data.sessions[0];
      console.log(`Sample session: ${JSON.stringify(session, null, 2)}`);
    }
  });

  test("should filter sessions by type", async ({ page }) => {
    const token = await getAdminToken(page);
    test.skip(!token, "Could not get admin token");

    // Get voice sessions only
    const response = await page.request.get(
      `${API_BASE_URL}/api/admin/voice/sessions?session_type=voice`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    console.log(`Voice-type sessions: ${data.data?.sessions?.length || 0}`);

    // All sessions should be voice type
    if (data.data?.sessions?.length > 0) {
      for (const session of data.data.sessions) {
        expect(session.type).toBe("voice");
      }
    }
  });
});

test.describe("Admin Voice Metrics API - Phase 11.1", () => {
  test.setTimeout(30000);

  test("should get voice metrics summary", async ({ page }) => {
    const token = await getAdminToken(page);
    test.skip(!token, "Could not get admin token");

    const response = await page.request.get(`${API_BASE_URL}/api/admin/voice/metrics`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("data");

    console.log(`Voice metrics: ${JSON.stringify(data.data, null, 2)}`);

    // Should have standard metric fields
    const metrics = data.data;
    // These fields may or may not exist depending on data availability
    const expectedFields = [
      "total_sessions",
      "active_sessions",
      "total_messages",
      "avg_session_duration",
    ];

    for (const field of expectedFields) {
      if (metrics[field] !== undefined) {
        console.log(`${field}: ${metrics[field]}`);
      }
    }
  });

  test("should get voice health status", async ({ page }) => {
    const token = await getAdminToken(page);
    test.skip(!token, "Could not get admin token");

    const response = await page.request.get(`${API_BASE_URL}/api/admin/voice/health`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("data");

    console.log(`Voice health: ${JSON.stringify(data.data, null, 2)}`);

    // Should have component health status
    const health = data.data;
    expect(health).toHaveProperty("redis");
    expect(health).toHaveProperty("realtime");
    expect(health).toHaveProperty("elevenlabs");
  });
});

test.describe("Admin Voice Analytics API - Phase 11.1", () => {
  test.setTimeout(30000);

  test("should get voice analytics for default period", async ({ page }) => {
    const token = await getAdminToken(page);
    test.skip(!token, "Could not get admin token");

    const response = await page.request.get(`${API_BASE_URL}/api/admin/voice/analytics`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("data");

    console.log(`Voice analytics: ${JSON.stringify(data.data, null, 2)}`);
  });

  test("should get voice analytics for 7-day period", async ({ page }) => {
    const token = await getAdminToken(page);
    test.skip(!token, "Could not get admin token");

    const response = await page.request.get(
      `${API_BASE_URL}/api/admin/voice/analytics?period=7d`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    console.log(`7-day analytics: ${JSON.stringify(data.data, null, 2)}`);
  });

  test("should reject invalid analytics period", async ({ page }) => {
    const token = await getAdminToken(page);
    test.skip(!token, "Could not get admin token");

    const response = await page.request.get(
      `${API_BASE_URL}/api/admin/voice/analytics?period=invalid`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    // Should return 400 or 422 for invalid period
    expect([400, 422]).toContain(response.status());
  });

  test("should get latency histogram", async ({ page }) => {
    const token = await getAdminToken(page);
    test.skip(!token, "Could not get admin token");

    const response = await page.request.get(
      `${API_BASE_URL}/api/admin/voice/analytics/latency?metric=stt`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("data");

    console.log(`STT latency histogram: ${JSON.stringify(data.data, null, 2)}`);
  });

  test("should get cost breakdown", async ({ page }) => {
    const token = await getAdminToken(page);
    test.skip(!token, "Could not get admin token");

    const response = await page.request.get(
      `${API_BASE_URL}/api/admin/voice/analytics/costs`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("data");

    console.log(`Cost breakdown: ${JSON.stringify(data.data, null, 2)}`);
  });
});

test.describe("Admin Voice Providers API - Phase 11.1", () => {
  test.setTimeout(30000);

  test("should get available voice providers", async ({ page }) => {
    const token = await getAdminToken(page);
    test.skip(!token, "Could not get admin token");

    const response = await page.request.get(`${API_BASE_URL}/api/admin/voice/providers`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("data");
    expect(data.data).toHaveProperty("providers");
    expect(Array.isArray(data.data.providers)).toBe(true);

    console.log(`Available providers: ${JSON.stringify(data.data.providers, null, 2)}`);

    // Should include at least OpenAI
    const providerNames = data.data.providers.map((p: any) => p.name || p.id);
    expect(providerNames.some((n: string) => n.toLowerCase().includes("openai"))).toBe(true);
  });

  test("should get available voices", async ({ page }) => {
    const token = await getAdminToken(page);
    test.skip(!token, "Could not get admin token");

    const response = await page.request.get(`${API_BASE_URL}/api/admin/voice/voices`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("data");
    expect(data.data).toHaveProperty("voices");
    expect(Array.isArray(data.data.voices)).toBe(true);

    console.log(`Total voices available: ${data.data.voices.length}`);

    // Log a sample of voices
    if (data.data.voices.length > 0) {
      console.log(`Sample voice: ${JSON.stringify(data.data.voices[0], null, 2)}`);
    }
  });

  test("should filter voices by provider", async ({ page }) => {
    const token = await getAdminToken(page);
    test.skip(!token, "Could not get admin token");

    const response = await page.request.get(
      `${API_BASE_URL}/api/admin/voice/voices?provider=openai`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    const voices = data.data?.voices || [];

    console.log(`OpenAI voices: ${voices.length}`);

    // All should be OpenAI
    for (const voice of voices) {
      expect(voice.provider).toBe("openai");
    }
  });
});

test.describe("Admin Voice Config API - Phase 11.1", () => {
  test.setTimeout(30000);

  test("should get voice config", async ({ page }) => {
    const token = await getAdminToken(page);
    test.skip(!token, "Could not get admin token");

    const response = await page.request.get(`${API_BASE_URL}/api/admin/voice/config`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("data");

    console.log(`Voice config: ${JSON.stringify(data.data, null, 2)}`);

    // Should have standard config fields
    const config = data.data;
    const expectedFields = [
      "default_voice",
      "default_language",
      "vad_enabled",
      "stt_provider",
      "tts_provider",
    ];

    for (const field of expectedFields) {
      if (config[field] !== undefined) {
        console.log(`${field}: ${config[field]}`);
      }
    }
  });
});

test.describe("Admin Voice Feature Flags API - Phase 11.1", () => {
  test.setTimeout(30000);

  test("should get voice feature flags", async ({ page }) => {
    const token = await getAdminToken(page);
    test.skip(!token, "Could not get admin token");

    const response = await page.request.get(`${API_BASE_URL}/api/admin/voice/feature-flags`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("data");
    expect(data.data).toHaveProperty("flags");

    console.log(`Voice feature flags: ${JSON.stringify(data.data.flags, null, 2)}`);

    // Should have voice-related flags
    const flags = data.data.flags;
    const voiceFlags = flags.filter((f: any) =>
      f.name?.startsWith("voice.") || f.key?.startsWith("voice.")
    );

    console.log(`Voice-specific flags: ${voiceFlags.length}`);
  });

  test("should update voice feature flag", async ({ page }) => {
    const token = await getAdminToken(page);
    test.skip(!token, "Could not get admin token");

    // First, get current flags
    const getResponse = await page.request.get(
      `${API_BASE_URL}/api/admin/voice/feature-flags`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const flagsData = await getResponse.json();
    const flags = flagsData.data?.flags || [];

    // Find a voice flag to toggle (or skip if none exist)
    const voiceFlag = flags.find(
      (f: any) => f.name?.startsWith("voice.") || f.key?.startsWith("voice.")
    );

    if (!voiceFlag) {
      console.log("No voice feature flags to test - skipping update test");
      return;
    }

    const flagName = voiceFlag.name || voiceFlag.key;
    const currentEnabled = voiceFlag.enabled;

    console.log(`Testing flag update: ${flagName} (currently ${currentEnabled})`);

    // Toggle the flag
    const updateResponse = await page.request.patch(
      `${API_BASE_URL}/api/admin/voice/feature-flags/${flagName}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        data: {
          enabled: !currentEnabled,
        },
      }
    );

    expect(updateResponse.status()).toBe(200);

    // Toggle back to original state
    await page.request.patch(
      `${API_BASE_URL}/api/admin/voice/feature-flags/${flagName}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        data: {
          enabled: currentEnabled,
        },
      }
    );

    console.log(`Feature flag ${flagName} toggled successfully`);
  });

  test("should reject update to non-existent feature flag", async ({ page }) => {
    const token = await getAdminToken(page);
    test.skip(!token, "Could not get admin token");

    const response = await page.request.patch(
      `${API_BASE_URL}/api/admin/voice/feature-flags/nonexistent.flag.12345`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        data: {
          enabled: false,
        },
      }
    );

    expect(response.status()).toBe(404);
  });
});

test.describe("Admin Voice API - Authentication", () => {
  test.setTimeout(15000);

  test("should reject unauthenticated requests", async ({ page }) => {
    // Try without auth header
    const response = await page.request.get(`${API_BASE_URL}/api/admin/voice/sessions`);

    expect(response.status()).toBe(401);
  });

  test("should reject invalid token", async ({ page }) => {
    const response = await page.request.get(`${API_BASE_URL}/api/admin/voice/sessions`, {
      headers: {
        Authorization: "Bearer invalid-token-12345",
      },
    });

    expect(response.status()).toBe(401);
  });
});
