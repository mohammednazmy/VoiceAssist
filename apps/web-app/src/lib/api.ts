import type { APIEnvelope } from "../types";

/**
 * Resolve the API base URL in a way that works for:
 * - Local dev (`vite dev` on :5173 talking to :8000)
 * - Local Docker (`frontend-gateway` on :8080 proxying to backend)
 * - Hosted environments (assist.asimo.io / voiceassist.example.com)
 *
 * Rules:
 * - If `VITE_API_URL` is set to a non-production host (e.g. localhost),
 *   always use it.
 * - If `VITE_API_URL` points at a production host but the current origin
 *   is localhost, prefer the current origin so Docker builds talk to the
 *   local gateway instead of the real cloud API.
 * - In all other cases, prefer `VITE_API_URL` and fall back to origin or
 *   the compiled default.
 */
export function resolveApiBaseUrl(): string {
  const envApiUrl = import.meta.env.VITE_API_URL as string | undefined;
  const defaultBase = "https://api.voiceassist.example.com";

  const isProdApiHost =
    typeof envApiUrl === "string" &&
    (envApiUrl.includes("assist.asimo.io") ||
      envApiUrl.includes("voiceassist.example.com"));

  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    const isLocalOrigin =
      origin.startsWith("http://localhost") ||
      origin.startsWith("http://127.0.0.1");

    // Dev: localhost origin + env pointing to localhost/8000 -> use env
    if (envApiUrl && (!isLocalOrigin || !isProdApiHost)) {
      return envApiUrl;
    }

    // Local Docker: localhost origin but env points at prod host -> prefer origin
    if (isLocalOrigin) {
      return origin;
    }

    // Hosted env with no explicit API URL: fall back to same-origin
    if (!envApiUrl) {
      return origin;
    }
  }

  // Non-browser / test fallback
  return envApiUrl || defaultBase;
}

const API_BASE = resolveApiBaseUrl();

export class APIError extends Error {
  code: string;
  traceId?: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    traceId?: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "APIError";
    this.code = code;
    this.traceId = traceId;
    this.details = details;
  }
}

/**
 * Get auth token from localStorage
 * Uses the same key as the auth store's persist middleware
 */
function getAuthToken(): string | null {
  try {
    const authData = localStorage.getItem("voiceassist-auth");
    if (!authData) return null;

    const parsed = JSON.parse(authData);
    return parsed.state?.tokens?.access_token || null;
  } catch {
    return null;
  }
}

export async function fetchAPI<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  // Get auth token from localStorage
  const token = getAuthToken();

  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
    ...options,
  });

  const env = (await res.json()) as APIEnvelope<T>;
  if (!env.success) {
    const code = env.error?.code || "INTERNAL_ERROR";
    const message = env.error?.message || "Unknown error";
    throw new APIError(
      message,
      code,
      env.trace_id,
      env.error?.details || undefined,
    );
  }
  return env.data as T;
}
