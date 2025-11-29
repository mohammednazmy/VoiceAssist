/**
 * usePHI hook for Admin Security & PHI page
 * Manages PHI detection rules, testing, statistics, and routing configuration
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAPI } from "../lib/api";

export type PHIRuleStatus = "enabled" | "disabled";

export type PHIRuleType =
  | "ssn"
  | "phone"
  | "email"
  | "mrn"
  | "account"
  | "ip_address"
  | "url"
  | "dob"
  | "name"
  | "address"
  | "credit_card";

export type PHIRoutingMode = "local_only" | "cloud_allowed" | "hybrid";

export interface PHIRule {
  id: string;
  name: string;
  description: string;
  phi_type: PHIRuleType;
  status: PHIRuleStatus;
  pattern?: string;
  is_builtin: boolean;
  detection_count: number;
  last_detection?: string;
}

export interface PHIRulesResponse {
  rules: PHIRule[];
  total: number;
  enabled: number;
}

export interface PHITestRequest {
  text: string;
  include_redacted?: boolean;
}

export interface PHITestResult {
  contains_phi: boolean;
  phi_types: string[];
  confidence: number;
  details: Record<string, unknown>;
  redacted_text?: string;
}

export interface PHIRedactResult {
  original_length: number;
  redacted_length: number;
  redaction_count: number;
  redacted_text: string;
}

export interface PHIRoutingConfig {
  mode: PHIRoutingMode;
  confidence_threshold: number;
  local_llm_enabled: boolean;
  local_llm_url?: string;
  redact_before_cloud: boolean;
  audit_all_phi: boolean;
}

export interface PHIStats {
  total_detections: number;
  detections_today: number;
  detections_this_week: number;
  by_type: Record<string, number>;
  by_day: Array<{
    date: string;
    count: number;
    by_type: Record<string, number>;
  }>;
  routing_stats: {
    routed_local: number;
    redacted_cloud: number;
    blocked: number;
  };
}

export interface PHIEvent {
  id: string;
  timestamp: string;
  phi_types: string[];
  confidence: number;
  action_taken: string;
  user_id?: string;
  session_id?: string;
}

export interface PHIEventsResponse {
  events: PHIEvent[];
  total: number;
  limit: number;
  offset: number;
}

export interface PHIHealthStatus {
  overall: "healthy" | "degraded" | "unhealthy";
  components: {
    detector: string;
    redis_config: string;
    local_llm: string;
    audit_logging: string;
  };
  routing_mode: PHIRoutingMode;
  timestamp: string;
}

interface UsePHIOptions {
  autoRefresh?: boolean;
  refreshIntervalMs?: number;
}

interface UsePHIResult {
  rules: PHIRule[];
  rulesInfo: { total: number; enabled: number } | null;
  stats: PHIStats | null;
  routing: PHIRoutingConfig | null;
  health: PHIHealthStatus | null;
  events: PHIEvent[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refreshAll: () => Promise<void>;
  updateRule: (ruleId: string, status: PHIRuleStatus) => Promise<void>;
  testPHI: (text: string) => Promise<PHITestResult>;
  redactPHI: (text: string) => Promise<PHIRedactResult>;
  updateRouting: (config: Partial<PHIRoutingConfig>) => Promise<void>;
}

export function usePHI(options: UsePHIOptions = {}): UsePHIResult {
  const { autoRefresh = false, refreshIntervalMs = 30000 } = options;

  const [rules, setRules] = useState<PHIRule[]>([]);
  const [rulesInfo, setRulesInfo] = useState<{
    total: number;
    enabled: number;
  } | null>(null);
  const [stats, setStats] = useState<PHIStats | null>(null);
  const [routing, setRouting] = useState<PHIRoutingConfig | null>(null);
  const [health, setHealth] = useState<PHIHealthStatus | null>(null);
  const [events, setEvents] = useState<PHIEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchRules = useCallback(async () => {
    try {
      const response = await fetchAPI<PHIRulesResponse>("/api/admin/phi/rules");
      setRules(response.rules);
      setRulesInfo({ total: response.total, enabled: response.enabled });
      return response;
    } catch (err) {
      console.error("Failed to fetch PHI rules:", err);
      throw err;
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetchAPI<PHIStats>("/api/admin/phi/stats?days=7");
      setStats(response);
      return response;
    } catch (err) {
      console.error("Failed to fetch PHI stats:", err);
      throw err;
    }
  }, []);

  const fetchRouting = useCallback(async () => {
    try {
      const response = await fetchAPI<PHIRoutingConfig>(
        "/api/admin/phi/routing",
      );
      setRouting(response);
      return response;
    } catch (err) {
      console.error("Failed to fetch PHI routing:", err);
      throw err;
    }
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      const response = await fetchAPI<PHIHealthStatus>("/api/admin/phi/health");
      setHealth(response);
      return response;
    } catch (err) {
      console.error("Failed to fetch PHI health:", err);
      throw err;
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    try {
      const response = await fetchAPI<PHIEventsResponse>(
        "/api/admin/phi/events?limit=20",
      );
      setEvents(response.events);
      return response;
    } catch (err) {
      console.error("Failed to fetch PHI events:", err);
      throw err;
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        fetchRules(),
        fetchStats(),
        fetchRouting(),
        fetchHealth(),
        fetchEvents(),
      ]);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [fetchRules, fetchStats, fetchRouting, fetchHealth, fetchEvents]);

  const updateRule = useCallback(
    async (ruleId: string, status: PHIRuleStatus): Promise<void> => {
      await fetchAPI(`/api/admin/phi/rules/${ruleId}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      // Refresh rules after update
      await fetchRules();
    },
    [fetchRules],
  );

  const testPHI = useCallback(async (text: string): Promise<PHITestResult> => {
    const response = await fetchAPI<PHITestResult>("/api/admin/phi/test", {
      method: "POST",
      body: JSON.stringify({ text, include_redacted: true }),
    });
    return response;
  }, []);

  const redactPHI = useCallback(
    async (text: string): Promise<PHIRedactResult> => {
      const response = await fetchAPI<PHIRedactResult>(
        "/api/admin/phi/redact",
        {
          method: "POST",
          body: JSON.stringify({ text }),
        },
      );
      return response;
    },
    [],
  );

  const updateRouting = useCallback(
    async (config: Partial<PHIRoutingConfig>): Promise<void> => {
      await fetchAPI("/api/admin/phi/routing", {
        method: "PATCH",
        body: JSON.stringify(config),
      });
      // Refresh routing after update
      await fetchRouting();
    },
    [fetchRouting],
  );

  // Initial load
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const intervalId = setInterval(() => {
      refreshAll();
    }, refreshIntervalMs);

    return () => clearInterval(intervalId);
  }, [autoRefresh, refreshIntervalMs, refreshAll]);

  return useMemo(
    () => ({
      rules,
      rulesInfo,
      stats,
      routing,
      health,
      events,
      loading,
      error,
      lastUpdated,
      refreshAll,
      updateRule,
      testPHI,
      redactPHI,
      updateRouting,
    }),
    [
      rules,
      rulesInfo,
      stats,
      routing,
      health,
      events,
      loading,
      error,
      lastUpdated,
      refreshAll,
      updateRule,
      testPHI,
      redactPHI,
      updateRouting,
    ],
  );
}
