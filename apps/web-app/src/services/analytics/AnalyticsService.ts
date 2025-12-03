/**
 * Client-Side Analytics Service
 *
 * Comprehensive frontend telemetry and analytics tracking.
 * Supports Core Web Vitals, custom events, and user flow analysis.
 *
 * @example
 * ```typescript
 * import { analyticsService } from '@/services/analytics';
 *
 * // Track page view
 * analyticsService.trackPageView('/dashboard', 'Dashboard');
 *
 * // Track custom event
 * analyticsService.trackEvent('button_click', 'send_message', { category: 'chat' });
 *
 * // Track performance
 * analyticsService.trackTiming('api_call', 150, { endpoint: '/api/chat' });
 * ```
 */

import {
  type AnalyticsEvent,
  type AnalyticsEventType,
  type WebVitalMetric,
  type WebVitalName,
  type WebVitalRating,
  type PerformanceTiming,
  type ResourceTiming,
  type UserSession,
  type AnalyticsSummary,
  type AnalyticsConfig,
  type UserFlow,
  type FlowStep,
} from "./types";

/**
 * Default configuration
 */
const DEFAULT_CONFIG: AnalyticsConfig = {
  apiEndpoint: "/api/analytics",
  batchSize: 20,
  batchInterval: 10000, // 10 seconds
  debug: false,
  samplingRate: 1.0, // 100%
  trackWebVitals: true,
  trackErrors: true,
  trackResources: false,
  anonymize: true,
};

/**
 * Web Vitals thresholds
 */
const WEB_VITAL_THRESHOLDS: Record<
  WebVitalName,
  { good: number; poor: number }
> = {
  LCP: { good: 2500, poor: 4000 },
  FID: { good: 100, poor: 300 },
  CLS: { good: 0.1, poor: 0.25 },
  TTFB: { good: 800, poor: 1800 },
  FCP: { good: 1800, poor: 3000 },
  INP: { good: 200, poor: 500 },
};

/**
 * Analytics Service class
 */
class AnalyticsService {
  private config: AnalyticsConfig;
  private session: UserSession;
  private eventQueue: AnalyticsEvent[] = [];
  private batchIntervalId: ReturnType<typeof setInterval> | null = null;
  private activeFlows: Map<string, UserFlow> = new Map();
  private lastPageView: { url: string; timestamp: number } | null = null;

  constructor(config: Partial<AnalyticsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.session = this.initSession();
    this.setupEventListeners();
    this.startBatchInterval();
  }

  /**
   * Initialize a new session
   */
  private initSession(): UserSession {
    const session: UserSession = {
      id: this.generateSessionId(),
      startTime: Date.now(),
      lastActivityTime: Date.now(),
      device: this.getDeviceInfo(),
      location: this.getLocationInfo(),
      engagement: {
        pageViews: 0,
        events: 0,
        totalTime: 0,
      },
    };

    // Store session ID
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("analytics_session_id", session.id);
    }

    return session;
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `an-${timestamp}-${random}`;
  }

  /**
   * Get device information
   */
  private getDeviceInfo(): UserSession["device"] {
    if (typeof window === "undefined") {
      return {
        type: "desktop",
        browser: "unknown",
        os: "unknown",
        screenWidth: 0,
        screenHeight: 0,
      };
    }

    const width = window.innerWidth;
    const type = width < 768 ? "mobile" : width < 1024 ? "tablet" : "desktop";

    return {
      type,
      browser: this.getBrowser(),
      os: this.getOS(),
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
    };
  }

  /**
   * Get browser name
   */
  private getBrowser(): string {
    if (typeof navigator === "undefined") return "unknown";
    const ua = navigator.userAgent;
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Chrome")) return "Chrome";
    if (ua.includes("Safari")) return "Safari";
    if (ua.includes("Edge")) return "Edge";
    return "unknown";
  }

  /**
   * Get OS name
   */
  private getOS(): string {
    if (typeof navigator === "undefined") return "unknown";
    const ua = navigator.userAgent;
    if (ua.includes("Windows")) return "Windows";
    if (ua.includes("Mac")) return "macOS";
    if (ua.includes("Linux")) return "Linux";
    if (ua.includes("Android")) return "Android";
    if (ua.includes("iOS") || ua.includes("iPhone") || ua.includes("iPad"))
      return "iOS";
    return "unknown";
  }

  /**
   * Get location information
   */
  private getLocationInfo(): UserSession["location"] {
    if (typeof navigator === "undefined" || typeof Intl === "undefined") {
      return undefined;
    }

    return {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
    };
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    if (typeof window === "undefined") return;

    // Track errors
    if (this.config.trackErrors) {
      window.addEventListener("error", (event) => {
        this.trackError(event.error || event.message, {
          component: "global",
          severity: "high",
        });
      });

      window.addEventListener("unhandledrejection", (event) => {
        this.trackError(event.reason, {
          component: "promise",
          severity: "high",
        });
      });
    }

    // Track visibility changes
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.flush();
      }
    });

    // Track before unload
    window.addEventListener("beforeunload", () => {
      this.flush();
    });
  }

  /**
   * Start batch interval
   */
  private startBatchInterval(): void {
    if (this.batchIntervalId) return;

    this.batchIntervalId = setInterval(() => {
      this.flush();
    }, this.config.batchInterval);
  }

  /**
   * Stop batch interval
   */
  stopBatchInterval(): void {
    if (this.batchIntervalId) {
      clearInterval(this.batchIntervalId);
      this.batchIntervalId = null;
    }
  }

  /**
   * Check if event should be sampled
   */
  private shouldSample(): boolean {
    return Math.random() < this.config.samplingRate;
  }

  /**
   * Set user ID
   */
  setUserId(userId: string | null): void {
    this.session.userId = userId ?? undefined;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.session.id;
  }

  /**
   * Track a page view
   */
  trackPageView(path: string, title: string, referrer?: string): void {
    if (!this.shouldSample()) return;

    // Calculate time on previous page
    let timeOnPreviousPage: number | undefined;
    if (this.lastPageView) {
      timeOnPreviousPage = Date.now() - this.lastPageView.timestamp;
    }

    const event: AnalyticsEvent = {
      type: "page_view",
      name: "page_view",
      timestamp: Date.now(),
      sessionId: this.session.id,
      userId: this.session.userId,
      url: typeof window !== "undefined" ? window.location.href : path,
      properties: {
        path,
        title,
        referrer:
          referrer ??
          (typeof document !== "undefined" ? document.referrer : undefined),
        timeOnPreviousPage,
      },
    };

    this.queueEvent(event);
    this.session.engagement.pageViews++;
    this.lastPageView = { url: path, timestamp: Date.now() };

    if (this.config.debug) {
      console.log("[Analytics] Page view:", path);
    }
  }

  /**
   * Track a custom event
   */
  trackEvent(
    type: AnalyticsEventType,
    name: string,
    options?: {
      category?: string;
      label?: string;
      value?: number;
      properties?: Record<string, unknown>;
    },
  ): void {
    if (!this.shouldSample()) return;

    const event: AnalyticsEvent = {
      type,
      name,
      category: options?.category,
      label: options?.label,
      value: options?.value,
      timestamp: Date.now(),
      sessionId: this.session.id,
      userId: this.session.userId,
      url: typeof window !== "undefined" ? window.location.href : "",
      properties: options?.properties,
    };

    this.queueEvent(event);
    this.session.engagement.events++;

    if (this.config.debug) {
      console.log("[Analytics] Event:", type, name, options);
    }
  }

  /**
   * Track an error
   */
  trackError(
    error: Error | string,
    options?: {
      component?: string;
      severity?: "low" | "medium" | "high" | "critical";
      handled?: boolean;
    },
  ): void {
    const errorObj = error instanceof Error ? error : new Error(String(error));

    const event: AnalyticsEvent = {
      type: "error",
      name: "error",
      timestamp: Date.now(),
      sessionId: this.session.id,
      userId: this.session.userId,
      url: typeof window !== "undefined" ? window.location.href : "",
      properties: {
        message: errorObj.message,
        errorType: errorObj.name,
        stack: errorObj.stack?.split("\n").slice(0, 5).join("\n"),
        component: options?.component,
        severity: options?.severity ?? "medium",
        handled: options?.handled ?? false,
      },
    };

    this.queueEvent(event);

    if (this.config.debug) {
      console.log("[Analytics] Error:", errorObj.message);
    }
  }

  /**
   * Track a performance timing
   */
  trackTiming(
    name: string,
    duration: number,
    details?: Record<string, unknown>,
  ): void {
    if (!this.shouldSample()) return;

    this.trackEvent("custom", name, {
      category: "performance",
      value: duration,
      properties: {
        type: "timing",
        ...details,
      },
    });
  }

  /**
   * Track a Web Vital metric
   */
  trackWebVital(name: WebVitalName, value: number, delta?: number): void {
    if (!this.config.trackWebVitals) return;

    const rating = this.getWebVitalRating(name, value);
    // Note: metric object captures all Web Vital data for potential future use
    const _metric: WebVitalMetric = {
      name,
      value,
      rating,
      delta,
      timestamp: Date.now(),
      url: typeof window !== "undefined" ? window.location.href : "",
      navigationType:
        typeof window !== "undefined"
          ? (
              window.performance?.getEntriesByType(
                "navigation",
              )[0] as PerformanceNavigationTiming
            )?.type
          : undefined,
    };

    this.trackEvent("custom", `web_vital_${name.toLowerCase()}`, {
      category: "web_vitals",
      value: Math.round(value),
      properties: {
        rating,
        delta,
      },
    });

    if (this.config.debug) {
      console.log("[Analytics] Web Vital:", name, value, rating);
    }
  }

  /**
   * Get Web Vital rating
   */
  private getWebVitalRating(name: WebVitalName, value: number): WebVitalRating {
    const thresholds = WEB_VITAL_THRESHOLDS[name];
    if (value <= thresholds.good) return "good";
    if (value <= thresholds.poor) return "needs-improvement";
    return "poor";
  }

  /**
   * Track resource timing (API calls)
   */
  trackResource(resource: ResourceTiming): void {
    if (!this.config.trackResources) return;

    this.trackEvent("custom", "resource_timing", {
      category: "performance",
      value: resource.duration,
      properties: {
        url: resource.url,
        type: resource.type,
        status: resource.status,
        cached: resource.cached,
        size: resource.size,
      },
    });
  }

  /**
   * Start a user flow
   */
  startFlow(flowName: string): void {
    const flow: UserFlow = {
      name: flowName,
      sessionId: this.session.id,
      steps: [],
      completed: false,
      totalDuration: 0,
    };

    this.activeFlows.set(flowName, flow);

    if (this.config.debug) {
      console.log("[Analytics] Flow started:", flowName);
    }
  }

  /**
   * Record a flow step
   */
  recordFlowStep(
    flowName: string,
    stepName: string,
    location: string,
    completed: boolean = true,
  ): void {
    const flow = this.activeFlows.get(flowName);
    if (!flow) return;

    const step: FlowStep = {
      name: stepName,
      location,
      duration:
        flow.steps.length > 0
          ? Date.now() - flow.steps[flow.steps.length - 1].timestamp
          : 0,
      completed,
      timestamp: Date.now(),
    };

    flow.steps.push(step);

    if (this.config.debug) {
      console.log("[Analytics] Flow step:", flowName, stepName);
    }
  }

  /**
   * Complete a user flow
   */
  completeFlow(flowName: string, completed: boolean = true): void {
    const flow = this.activeFlows.get(flowName);
    if (!flow) return;

    flow.completed = completed;
    flow.totalDuration = Date.now() - (flow.steps[0]?.timestamp ?? Date.now());

    if (!completed && flow.steps.length > 0) {
      flow.dropOffStep = flow.steps[flow.steps.length - 1].name;
    }

    // Track flow completion
    this.trackEvent("custom", `flow_${completed ? "completed" : "abandoned"}`, {
      category: "user_flow",
      label: flowName,
      value: flow.totalDuration,
      properties: {
        steps: flow.steps.length,
        dropOffStep: flow.dropOffStep,
      },
    });

    this.activeFlows.delete(flowName);

    if (this.config.debug) {
      console.log("[Analytics] Flow completed:", flowName, completed);
    }
  }

  /**
   * Queue an event for batched sending
   */
  private queueEvent(event: AnalyticsEvent): void {
    // Anonymize if configured
    if (this.config.anonymize) {
      event = this.anonymizeEvent(event);
    }

    this.eventQueue.push(event);
    this.session.lastActivityTime = Date.now();

    // Flush if batch size reached
    if (this.eventQueue.length >= this.config.batchSize) {
      this.flush();
    }
  }

  /**
   * Anonymize event data
   */
  private anonymizeEvent(event: AnalyticsEvent): AnalyticsEvent {
    // Remove potential PII from properties
    const sanitized = { ...event };
    if (sanitized.properties) {
      const props = { ...sanitized.properties };
      // Remove any fields that might contain PII
      delete props.email;
      delete props.phone;
      delete props.name;
      delete props.address;
      sanitized.properties = props;
    }
    return sanitized;
  }

  /**
   * Flush queued events to the backend
   */
  async flush(): Promise<void> {
    if (this.eventQueue.length === 0) return;

    const events = [...this.eventQueue];
    this.eventQueue = [];

    try {
      // Use sendBeacon for reliability during page unload
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify({ events })], {
          type: "application/json",
        });
        navigator.sendBeacon(this.config.apiEndpoint, blob);
      } else {
        await fetch(this.config.apiEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ events }),
          keepalive: true,
        });
      }

      if (this.config.debug) {
        console.log("[Analytics] Flushed", events.length, "events");
      }
    } catch (error) {
      // Re-queue events on failure
      this.eventQueue = [...events, ...this.eventQueue];
      console.warn("[Analytics] Flush failed:", error);
    }
  }

  /**
   * Get current session info
   */
  getSession(): UserSession {
    return {
      ...this.session,
      engagement: {
        ...this.session.engagement,
        totalTime: Date.now() - this.session.startTime,
      },
    };
  }

  /**
   * Get analytics summary from the API
   */
  async getSummary(period?: {
    start: number;
    end: number;
  }): Promise<AnalyticsSummary | null> {
    try {
      const params = new URLSearchParams();
      if (period) {
        params.set("start", period.start.toString());
        params.set("end", period.end.toString());
      }

      const response = await fetch(
        `${this.config.apiEndpoint}/summary?${params.toString()}`,
      );
      if (!response.ok) return null;
      return response.json();
    } catch (error) {
      console.warn("[Analytics] Failed to fetch summary:", error);
      return null;
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopBatchInterval();
    this.flush();
  }
}

/**
 * Singleton instance
 */
export const analyticsService = new AnalyticsService();

/**
 * Create a new analytics service instance with custom config
 */
export function createAnalyticsService(
  config: Partial<AnalyticsConfig>,
): AnalyticsService {
  return new AnalyticsService(config);
}

// Re-export types
export type {
  AnalyticsEvent,
  AnalyticsEventType,
  WebVitalMetric,
  WebVitalName,
  WebVitalRating,
  PerformanceTiming,
  ResourceTiming,
  UserSession,
  AnalyticsSummary,
  AnalyticsConfig,
  UserFlow,
  FlowStep,
};
