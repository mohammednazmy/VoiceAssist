import * as Sentry from "@sentry/browser";
import type { Metric } from "web-vitals";
import { onCLS, onFCP, onFID, onINP, onLCP, onTTFB } from "web-vitals";

export interface TelemetryOptions {
  release?: string;
  environment?: string;
  sentryDsn?: string;
  grafanaUrl?: string;
  app?: string;
  /**
   * Optional auth token for Grafana Loki/OTLP ingestion
   */
  grafanaToken?: string;
  /**
   * Additional context shared with all events
   */
  context?: Record<string, unknown>;
}

export interface TelemetryClient {
  captureError: (error: unknown, context?: Record<string, unknown>) => void;
  captureMessage: (message: string, level?: Sentry.SeverityLevel) => void;
  trackWebVitals: () => void;
  flush: () => Promise<boolean>;
}

interface GrafanaPayload {
  stream: Record<string, string>;
  values: [string, string][];
}

function sendToGrafana(
  metric: Metric | { message: string; level: Sentry.SeverityLevel },
  options: TelemetryOptions,
) {
  if (!options.grafanaUrl) return;

  const nowNs = `${BigInt(Date.now()) * 1_000_000n}`;
  const baseStream: Record<string, string> = {
    app: options.app || "voiceassist",
    env: options.environment || "unknown",
  };

  const payload: GrafanaPayload = {
    stream: baseStream,
    values: [
      [
        nowNs,
        JSON.stringify({
          type: "telemetry",
          metric,
          context: options.context,
        }),
      ],
    ],
  };

  fetch(options.grafanaUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.grafanaToken
        ? { Authorization: `Bearer ${options.grafanaToken}` }
        : {}),
    },
    body: JSON.stringify({ streams: [payload] }),
  }).catch((error) => {
    console.warn("[telemetry] grafana ingestion failed", error);
  });
}

export function createTelemetryClient(options: TelemetryOptions): TelemetryClient {
  if (options.sentryDsn) {
    Sentry.init({
      dsn: options.sentryDsn,
      release: options.release,
      environment: options.environment,
      integrations: [Sentry.browserTracingIntegration()],
      tracesSampleRate: 0.2,
      replaysSessionSampleRate: 0,
    });
  }

  const captureError = (error: unknown, context?: Record<string, unknown>) => {
    if (options.sentryDsn) {
      Sentry.captureException(error, { extra: context });
    }
    sendToGrafana({ message: String(error), level: "error" }, options);
  };

  const captureMessage = (message: string, level: Sentry.SeverityLevel = "info") => {
    if (options.sentryDsn) {
      Sentry.captureMessage(message, level);
    }
    sendToGrafana({ message, level }, options);
  };

  const trackWebVitals = () => {
    const handler = (metric: Metric) => {
      captureMessage(`web-vital:${metric.name}:${metric.value.toFixed(2)}`, "info");
      sendToGrafana(metric, options);
    };

    onCLS(handler);
    onFCP(handler);
    onFID(handler);
    onINP(handler);
    onLCP(handler);
    onTTFB(handler);
  };

  const flush = async () => {
    if (!Sentry.getCurrentHub().getClient()) return true;
    const result = await Sentry.flush(3000);
    return result;
  };

  return { captureError, captureMessage, trackWebVitals, flush };
}

export { Sentry };
