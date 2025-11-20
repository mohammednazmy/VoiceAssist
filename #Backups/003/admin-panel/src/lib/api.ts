
import type { APIEnvelope } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export class APIError extends Error {
  code: string;
  traceId?: string;
  details?: Record<string, unknown>;

  constructor(message: string, code: string, traceId?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'APIError';
    this.code = code;
    this.traceId = traceId;
    this.details = details;
  }
}

export async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });

  const env = (await res.json()) as APIEnvelope<T>;
  if (!env.success) {
    const code = env.error?.code || 'INTERNAL_ERROR';
    const message = env.error?.message || 'Unknown error';
    throw new APIError(message, code, env.trace_id, env.error?.details || undefined);
  }
  return env.data as T;
}
