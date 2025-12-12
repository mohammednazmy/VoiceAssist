import { getApiClient } from "./apiClient";
import type { APIEnvelope } from "../types";

// Local types to match axios config structure (avoids axios dependency)
type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";
interface RequestConfig {
  url: string;
  method: Method;
  headers?: Record<string, string>;
  data?: unknown;
}

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
  const apiClient = getApiClient();
  const headers = {
    "Content-Type": "application/json",
    ...(options?.headers || {}),
  } as Record<string, string>;

  const config: RequestConfig = {
    url: path,
    method: (options?.method as Method) || "GET",
    headers,
  };

  if (options?.body !== undefined) {
    config.data =
      typeof options.body === "string"
        ? (() => {
            try {
              return JSON.parse(options.body as string);
            } catch {
              return options.body;
            }
          })()
        : options.body;
  }

  const env = await apiClient.request<APIEnvelope<T>>(config);
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
