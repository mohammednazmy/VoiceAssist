/**
 * Security & PHI Admin Page (Sprint 3)
 * Manages PHI detection rules, testing, statistics, and routing configuration
 */

import { useState } from "react";
import { HelpButton } from "@voiceassist/ui";
import { AskAIButton } from "../components/shared";
import {
  usePHI,
  PHIRule,
  PHIRuleStatus,
  PHITestResult,
  PHIRedactResult,
  PHIRoutingMode,
} from "../hooks/usePHI";
import { useAuth } from "../contexts/AuthContext";
import { TwoFactorSettings } from "../components/security/TwoFactorSettings";
import { AuditLogViewer } from "../components/security/AuditLogViewer";
import { UserAPIKeyManager } from "../components/security/UserAPIKeyManager";

export function SecurityPage() {
  const { isAdmin } = useAuth();

  const {
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
  } = usePHI({ autoRefresh: true, refreshIntervalMs: 60000 });

  // Test panel state
  const [testText, setTestText] = useState("");
  const [testResult, setTestResult] = useState<PHITestResult | null>(null);
  const [redactResult, setRedactResult] = useState<PHIRedactResult | null>(
    null,
  );
  const [testing, setTesting] = useState(false);

  // Rule toggling state
  const [togglingRule, setTogglingRule] = useState<string | null>(null);

  // Routing update state
  const [updatingRouting, setUpdatingRouting] = useState(false);

  const handleTest = async () => {
    if (!testText.trim()) return;
    setTesting(true);
    setTestResult(null);
    setRedactResult(null);
    try {
      const result = await testPHI(testText);
      setTestResult(result);
    } catch (err) {
      console.error("PHI test failed:", err);
    } finally {
      setTesting(false);
    }
  };

  const handleRedact = async () => {
    if (!testText.trim()) return;
    setTesting(true);
    setRedactResult(null);
    try {
      const result = await redactPHI(testText);
      setRedactResult(result);
    } catch (err) {
      console.error("PHI redaction failed:", err);
    } finally {
      setTesting(false);
    }
  };

  const handleToggleRule = async (rule: PHIRule) => {
    if (!isAdmin) return;
    setTogglingRule(rule.id);
    try {
      const newStatus: PHIRuleStatus =
        rule.status === "enabled" ? "disabled" : "enabled";
      await updateRule(rule.id, newStatus);
    } catch (err) {
      console.error("Failed to toggle rule:", err);
    } finally {
      setTogglingRule(null);
    }
  };

  const handleRoutingModeChange = async (mode: PHIRoutingMode) => {
    if (!isAdmin) return;
    setUpdatingRouting(true);
    try {
      await updateRouting({ mode });
    } catch (err) {
      console.error("Failed to update routing mode:", err);
    } finally {
      setUpdatingRouting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "enabled":
      case "healthy":
        return "bg-green-900/50 text-green-400 border-green-800";
      case "disabled":
      case "degraded":
        return "bg-yellow-900/50 text-yellow-400 border-yellow-800";
      case "unhealthy":
      case "error":
        return "bg-red-900/50 text-red-400 border-red-800";
      default:
        return "bg-slate-900/50 text-slate-400 border-slate-800";
    }
  };

  const getPHITypeIcon = (type: string) => {
    switch (type) {
      case "ssn":
        return "🔢";
      case "phone":
        return "📞";
      case "email":
        return "📧";
      case "mrn":
        return "🏥";
      case "account":
        return "💳";
      case "ip_address":
        return "🌐";
      case "url":
        return "🔗";
      case "dob":
        return "📅";
      case "name":
        return "👤";
      case "address":
        return "🏠";
      case "credit_card":
        return "💳";
      default:
        return "🔒";
    }
  };

  const formatPHIType = (type: string) => {
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  if (loading && !health) {
    return (
      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">
              Security & PHI
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              PHI detection, routing, and compliance monitoring
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 animate-pulse"
            >
              <div className="h-3 w-20 bg-slate-800 rounded" />
              <div className="h-8 w-16 bg-slate-800 rounded mt-3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-100">
              Security & PHI
            </h1>
            <HelpButton
              docPath="admin/security"
              tooltipText="View security documentation"
              docsBaseUrl={import.meta.env.VITE_DOCS_URL}
            />
            <AskAIButton
              pageContext="Security & PHI management"
              docPath="admin/security"
            />
          </div>
          <p className="text-sm text-slate-400 mt-1">
            PHI detection, routing, and compliance monitoring
          </p>
        </div>
        <div className="flex items-center gap-2">
          {health && (
            <span
              className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border ${getStatusColor(health.overall)}`}
            >
              {health.overall === "healthy" && "● "}
              {health.overall.charAt(0).toUpperCase() + health.overall.slice(1)}
            </span>
          )}
          <button
            onClick={() => refreshAll()}
            disabled={loading}
            className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-400 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Two-Factor Authentication Section */}
      <TwoFactorSettings />

      {/* User API Keys Section */}
      <UserAPIKeyManager />

      {/* Stats Summary Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">
              Total Detections
            </div>
            <div className="text-2xl font-bold text-slate-100 mt-1">
              {stats.total_detections}
            </div>
          </div>
          <div className="bg-slate-900/50 border border-blue-800/50 rounded-lg p-4">
            <div className="text-xs text-blue-400 uppercase tracking-wide">
              Today
            </div>
            <div className="text-2xl font-bold text-blue-400 mt-1">
              {stats.detections_today}
            </div>
          </div>
          <div className="bg-slate-900/50 border border-purple-800/50 rounded-lg p-4">
            <div className="text-xs text-purple-400 uppercase tracking-wide">
              This Week
            </div>
            <div className="text-2xl font-bold text-purple-400 mt-1">
              {stats.detections_this_week}
            </div>
          </div>
          <div className="bg-slate-900/50 border border-green-800/50 rounded-lg p-4">
            <div className="text-xs text-green-400 uppercase tracking-wide">
              Routed Local
            </div>
            <div className="text-2xl font-bold text-green-400 mt-1">
              {stats.routing_stats.routed_local}
            </div>
          </div>
          <div className="bg-slate-900/50 border border-yellow-800/50 rounded-lg p-4">
            <div className="text-xs text-yellow-400 uppercase tracking-wide">
              Redacted
            </div>
            <div className="text-2xl font-bold text-yellow-400 mt-1">
              {stats.routing_stats.redacted_cloud}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PHI Detection Rules */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg">
          <div className="px-4 py-3 border-b border-slate-800">
            <h2 className="text-sm font-medium text-slate-200">
              PHI Detection Rules
            </h2>
            {rulesInfo && (
              <p className="text-xs text-slate-500 mt-1">
                {rulesInfo.enabled} of {rulesInfo.total} rules enabled
              </p>
            )}
          </div>
          <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">
                    {getPHITypeIcon(rule.phi_type)}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-slate-200">
                      {rule.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {rule.description}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${getStatusColor(rule.status)}`}
                  >
                    {rule.status}
                  </span>
                  {isAdmin && (
                    <button
                      onClick={() => handleToggleRule(rule)}
                      disabled={togglingRule === rule.id}
                      className={`w-10 h-5 rounded-full transition-colors relative ${
                        rule.status === "enabled"
                          ? "bg-green-600"
                          : "bg-slate-600"
                      } ${togglingRule === rule.id ? "opacity-50" : ""}`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                          rule.status === "enabled"
                            ? "translate-x-5"
                            : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* PHI Test Panel */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg">
          <div className="px-4 py-3 border-b border-slate-800">
            <h2 className="text-sm font-medium text-slate-200">
              PHI Detection Test
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Test text for PHI detection and redaction
            </p>
          </div>
          <div className="p-4 space-y-4">
            <textarea
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="Enter text to test for PHI (e.g., SSN: 123-45-6789, email: patient@example.com)"
              className="w-full h-24 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleTest}
                disabled={testing || !testText.trim()}
                className="flex-1 px-3 py-2 text-sm bg-blue-900/50 hover:bg-blue-800/50 text-blue-400 border border-blue-800 rounded transition-colors disabled:opacity-50"
              >
                {testing ? "Testing..." : "Detect PHI"}
              </button>
              <button
                onClick={handleRedact}
                disabled={testing || !testText.trim()}
                className="flex-1 px-3 py-2 text-sm bg-purple-900/50 hover:bg-purple-800/50 text-purple-400 border border-purple-800 rounded transition-colors disabled:opacity-50"
              >
                {testing ? "Redacting..." : "Redact PHI"}
              </button>
            </div>

            {/* Test Result */}
            {testResult && (
              <div
                className={`p-3 rounded-lg border ${
                  testResult.contains_phi
                    ? "bg-yellow-900/20 border-yellow-800"
                    : "bg-green-900/20 border-green-800"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-sm font-medium ${testResult.contains_phi ? "text-yellow-400" : "text-green-400"}`}
                  >
                    {testResult.contains_phi
                      ? "PHI Detected"
                      : "No PHI Detected"}
                  </span>
                  <span className="text-xs text-slate-500">
                    Confidence: {(testResult.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                {testResult.phi_types.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {testResult.phi_types.map((type) => (
                      <span
                        key={type}
                        className="inline-flex items-center px-2 py-0.5 bg-yellow-900/50 text-yellow-400 text-xs rounded"
                      >
                        {getPHITypeIcon(type)} {formatPHIType(type)}
                      </span>
                    ))}
                  </div>
                )}
                {testResult.redacted_text && (
                  <div className="mt-2 p-2 bg-slate-800/50 rounded text-xs font-mono text-slate-300">
                    {testResult.redacted_text}
                  </div>
                )}
              </div>
            )}

            {/* Redact Result */}
            {redactResult && (
              <div className="p-3 rounded-lg border bg-purple-900/20 border-purple-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-purple-400">
                    Redaction Complete
                  </span>
                  <span className="text-xs text-slate-500">
                    {redactResult.redaction_count} item(s) redacted
                  </span>
                </div>
                <div className="p-2 bg-slate-800/50 rounded text-xs font-mono text-slate-300">
                  {redactResult.redacted_text}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Routing Configuration */}
      {routing && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg">
          <div className="px-4 py-3 border-b border-slate-800">
            <h2 className="text-sm font-medium text-slate-200">
              PHI Routing Configuration
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Configure how queries containing PHI are processed
            </p>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Routing Mode */}
              <div className="space-y-2">
                <label className="text-xs text-slate-500 uppercase tracking-wide">
                  Routing Mode
                </label>
                <div className="flex flex-col gap-2">
                  {(
                    [
                      "local_only",
                      "cloud_allowed",
                      "hybrid",
                    ] as PHIRoutingMode[]
                  ).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => handleRoutingModeChange(mode)}
                      disabled={!isAdmin || updatingRouting}
                      className={`px-3 py-2 text-sm rounded border transition-colors ${
                        routing.mode === mode
                          ? "bg-blue-900/50 border-blue-800 text-blue-400"
                          : "bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600"
                      } ${!isAdmin || updatingRouting ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      {formatPHIType(mode)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Configuration Info */}
              <div className="space-y-2">
                <label className="text-xs text-slate-500 uppercase tracking-wide">
                  Current Settings
                </label>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">
                      Confidence Threshold:
                    </span>
                    <span className="text-slate-300">
                      {(routing.confidence_threshold * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Redact Before Cloud:</span>
                    <span className="text-slate-300">
                      {routing.redact_before_cloud ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Audit All PHI:</span>
                    <span className="text-slate-300">
                      {routing.audit_all_phi ? "Yes" : "No"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Local LLM Status */}
              <div className="space-y-2">
                <label className="text-xs text-slate-500 uppercase tracking-wide">
                  Local LLM
                </label>
                <div
                  className={`p-3 rounded-lg border ${
                    routing.local_llm_enabled
                      ? "bg-green-900/20 border-green-800"
                      : "bg-slate-800/50 border-slate-700"
                  }`}
                >
                  <div className="text-sm font-medium text-slate-300">
                    {routing.local_llm_enabled
                      ? "Configured"
                      : "Not Configured"}
                  </div>
                  {routing.local_llm_url && (
                    <div className="text-xs text-slate-500 mt-1 truncate">
                      {routing.local_llm_url}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Events */}
      {events.length > 0 && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg">
          <div className="px-4 py-3 border-b border-slate-800">
            <h2 className="text-sm font-medium text-slate-200">
              Recent PHI Detection Events
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-2">Timestamp</th>
                  <th className="px-4 py-2">PHI Types</th>
                  <th className="px-4 py-2">Confidence</th>
                  <th className="px-4 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {events.slice(0, 10).map((event) => (
                  <tr key={event.id} className="text-slate-300">
                    <td className="px-4 py-2 text-xs">
                      {new Date(event.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {event.phi_types.map((type) => (
                          <span
                            key={type}
                            className="inline-flex items-center px-1.5 py-0.5 bg-slate-800 text-xs rounded"
                          >
                            {getPHITypeIcon(type)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {(event.confidence * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                          event.action_taken === "routed_local"
                            ? "bg-green-900/50 text-green-400"
                            : event.action_taken === "redacted_cloud"
                              ? "bg-yellow-900/50 text-yellow-400"
                              : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {formatPHIType(event.action_taken)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Security Audit Log */}
      <AuditLogViewer />

      {/* Last Updated */}
      {lastUpdated && (
        <div className="text-xs text-slate-500 text-center">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
