# @voiceassist/telemetry

Shared telemetry utilities for VoiceAssist applications. Provides unified error tracking, performance monitoring, and logging.

## Installation

```bash
pnpm add @voiceassist/telemetry
```

## Features

- Sentry integration for error tracking
- Web Vitals monitoring (CLS, FCP, FID, INP, LCP, TTFB)
- Grafana Loki integration for log aggregation
- Unified telemetry client interface

## Usage

### Basic Setup

```typescript
import { createTelemetryClient } from "@voiceassist/telemetry";

const telemetry = createTelemetryClient({
  sentryDsn: process.env.SENTRY_DSN,
  grafanaUrl: process.env.GRAFANA_LOKI_URL,
  grafanaToken: process.env.GRAFANA_TOKEN,
  release: "1.0.0",
  environment: "production",
  app: "web-app",
  context: {
    userId: currentUser?.id,
  },
});
```

### Error Tracking

```typescript
// Capture errors
try {
  await riskyOperation();
} catch (error) {
  telemetry.captureError(error, {
    component: "ChatPanel",
    action: "sendMessage",
  });
}

// Capture messages
telemetry.captureMessage("User completed onboarding", "info");
```

### Web Vitals

```typescript
// Initialize web vitals tracking
// Call this once in your app entry point
telemetry.trackWebVitals();
```

This automatically tracks:

| Metric   | Description               |
| -------- | ------------------------- |
| **CLS**  | Cumulative Layout Shift   |
| **FCP**  | First Contentful Paint    |
| **FID**  | First Input Delay         |
| **INP**  | Interaction to Next Paint |
| **LCP**  | Largest Contentful Paint  |
| **TTFB** | Time to First Byte        |

### Flushing Before Page Unload

```typescript
// Ensure all events are sent before page unload
window.addEventListener("beforeunload", async () => {
  await telemetry.flush();
});
```

## Configuration Options

```typescript
interface TelemetryOptions {
  // Sentry DSN for error tracking
  sentryDsn?: string;

  // Grafana Loki URL for log aggregation
  grafanaUrl?: string;

  // Auth token for Grafana
  grafanaToken?: string;

  // Release version
  release?: string;

  // Environment (production, staging, development)
  environment?: string;

  // Application name
  app?: string;

  // Additional context for all events
  context?: Record<string, unknown>;
}
```

## API Reference

### TelemetryClient

```typescript
interface TelemetryClient {
  // Capture an error with optional context
  captureError: (error: unknown, context?: Record<string, unknown>) => void;

  // Capture a message with severity level
  captureMessage: (message: string, level?: SeverityLevel) => void;

  // Start tracking Web Vitals
  trackWebVitals: () => void;

  // Flush pending events (returns true if successful)
  flush: () => Promise<boolean>;
}
```

### Severity Levels

- `fatal` - Application crash
- `error` - Error conditions
- `warning` - Warning conditions
- `info` - Informational messages
- `debug` - Debug information

## Integration with React

```typescript
// App.tsx
import { createTelemetryClient } from '@voiceassist/telemetry';
import { useEffect } from 'react';

const telemetry = createTelemetryClient({
  sentryDsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  app: 'web-app',
});

function App() {
  useEffect(() => {
    telemetry.trackWebVitals();
  }, []);

  return <YourApp />;
}
```

## Dependencies

- `@sentry/browser` - Error tracking
- `web-vitals` - Core Web Vitals measurement

## Development

```bash
# Build
pnpm build

# Watch mode
pnpm dev
```
