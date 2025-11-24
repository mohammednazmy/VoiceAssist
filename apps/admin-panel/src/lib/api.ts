import type { APIEnvelope } from "../types";

// Use same origin (proxied via Apache in production)
// Build timestamp: 2025-11-24T02:26:00Z
const API_BASE = import.meta.env.VITE_API_URL || "";

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

export async function fetchAPI<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  // Get auth token from localStorage
  const token = localStorage.getItem("auth_token");

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
