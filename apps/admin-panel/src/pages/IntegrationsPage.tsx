import { useState } from "react";
import {
  useIntegrations,
  IntegrationSummary,
  IntegrationDetail,
  IntegrationTestResult,
} from "../hooks/useIntegrations";
import { useAuth } from "../contexts/AuthContext";

export function IntegrationsPage() {
  const { isAdmin } = useAuth();

  const {
    integrations,
    health,
    loading,
    error,
    lastUpdated,
    refreshAll,
    getIntegrationDetail,
    testIntegration,
  } = useIntegrations({ autoRefresh: true, refreshIntervalMs: 30000 });

  const [selectedIntegration, setSelectedIntegration] =
    useState<IntegrationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<IntegrationTestResult | null>(
    null,
  );
  const [lastTestedId, setLastTestedId] = useState<string | null>(null);

  const handleViewDetails = async (integrationId: string) => {
    setDetailLoading(true);
    setTestResult(null);
    try {
      const detail = await getIntegrationDetail(integrationId);
      setSelectedIntegration(detail);
    } catch (err) {
      console.error("Failed to fetch integration details:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleTest = async (integrationId: string) => {
    if (!isAdmin) return;
    setTestingId(integrationId);
    setTestResult(null);
    setLastTestedId(null);
    try {
      const result = await testIntegration(integrationId);
      setTestResult(result);
      setLastTestedId(integrationId);
    } catch (err) {
      setTestResult({
        success: false,
        latency_ms: 0,
        message: err instanceof Error ? err.message : "Test failed",
      });
      setLastTestedId(integrationId);
    } finally {
      setTestingId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "connected":
      case "healthy":
        return "bg-green-900/50 text-green-400 border-green-800";
      case "degraded":
        return "bg-yellow-900/50 text-yellow-400 border-yellow-800";
      case "error":
      case "unhealthy":
      case "critical":
        return "bg-red-900/50 text-red-400 border-red-800";
      case "disconnected":
      case "not_configured":
        return "bg-slate-900/50 text-slate-400 border-slate-800";
      default:
        return "bg-slate-900/50 text-slate-400 border-slate-800";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "database":
        return "🗄️";
      case "cache":
        return "⚡";
      case "vector_db":
        return "🔮";
      case "storage":
        return "📁";
      case "llm":
        return "🤖";
      case "tts":
        return "🔊";
      case "stt":
        return "🎤";
      case "realtime":
        return "📡";
      case "oauth":
        return "🔐";
      case "monitoring":
        return "📊";
      case "external_api":
        return "🌐";
      default:
        return "🔗";
    }
  };

  const formatStatus = (status: string) => {
    return status
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Group integrations by type
  const groupedIntegrations = integrations.reduce(
    (acc, int) => {
      if (!acc[int.type]) acc[int.type] = [];
      acc[int.type].push(int);
      return acc;
    },
    {} as Record<string, IntegrationSummary[]>,
  );

  if (loading && !health) {
    return (
      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Integrations</h1>
            <p className="text-sm text-slate-400 mt-1">
              Monitor and test external service connections
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
          <h1 className="text-2xl font-bold text-slate-100">Integrations</h1>
          <p className="text-sm text-slate-400 mt-1">
            Monitor and test external service connections
          </p>
        </div>
        <div className="flex items-center gap-2">
          {health && (
            <span
              className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border ${getStatusColor(health.overall_status)}`}
            >
              {health.overall_status === "healthy" && "● "}
              {formatStatus(health.overall_status)}
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

      {/* Health Summary Cards */}
      {health && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">
              Total
            </div>
            <div className="text-2xl font-bold text-slate-100 mt-1">
              {health.total_integrations}
            </div>
          </div>
          <div className="bg-slate-900/50 border border-green-800/50 rounded-lg p-4">
            <div className="text-xs text-green-400 uppercase tracking-wide">
              Connected
            </div>
            <div className="text-2xl font-bold text-green-400 mt-1">
              {health.connected}
            </div>
          </div>
          <div className="bg-slate-900/50 border border-yellow-800/50 rounded-lg p-4">
            <div className="text-xs text-yellow-400 uppercase tracking-wide">
              Degraded
            </div>
            <div className="text-2xl font-bold text-yellow-400 mt-1">
              {health.degraded}
            </div>
          </div>
          <div className="bg-slate-900/50 border border-red-800/50 rounded-lg p-4">
            <div className="text-xs text-red-400 uppercase tracking-wide">
              Errors
            </div>
            <div className="text-2xl font-bold text-red-400 mt-1">
              {health.errors}
            </div>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">
              Not Configured
            </div>
            <div className="text-2xl font-bold text-slate-400 mt-1">
              {health.not_configured}
            </div>
          </div>
        </div>
      )}

      {/* Integration Groups */}
      <div className="space-y-6">
        {Object.entries(groupedIntegrations).map(([type, items]) => (
          <div key={type}>
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              <span>{getTypeIcon(type)}</span>
              {formatStatus(type)}
              <span className="text-slate-600">({items.length})</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((integration) => (
                <div
                  key={integration.id}
                  className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-slate-100 truncate">
                          {integration.name}
                        </h3>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${getStatusColor(integration.status)}`}
                        >
                          {formatStatus(integration.status)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {integration.provider}
                      </p>
                      {integration.error_message && (
                        <p className="text-xs text-red-400 mt-2 truncate">
                          {integration.error_message}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    <button
                      onClick={() => handleViewDetails(integration.id)}
                      className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors"
                    >
                      Details
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => handleTest(integration.id)}
                        disabled={testingId === integration.id}
                        className="px-2 py-1 text-xs bg-blue-900/50 hover:bg-blue-800/50 text-blue-400 border border-blue-800 rounded transition-colors disabled:opacity-50"
                      >
                        {testingId === integration.id ? "Testing..." : "Test"}
                      </button>
                    )}
                    {/* Show test result inline */}
                    {lastTestedId === integration.id && testResult && (
                      <span
                        className={`text-xs ${testResult.success ? "text-green-400" : "text-red-400"}`}
                      >
                        {testResult.success ? "✓ Passed" : "✗ Failed"}
                      </span>
                    )}
                  </div>
                  {/* Show test message below buttons */}
                  {lastTestedId === integration.id && testResult && (
                    <div
                      className={`mt-2 text-xs p-2 rounded ${
                        testResult.success
                          ? "bg-green-900/20 text-green-400 border border-green-800/50"
                          : "bg-red-900/20 text-red-400 border border-red-800/50"
                      }`}
                    >
                      {testResult.message}
                      {testResult.latency_ms > 0 && (
                        <span className="opacity-75 ml-2">
                          ({testResult.latency_ms.toFixed(0)}ms)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Last Updated */}
      {lastUpdated && (
        <div className="text-xs text-slate-500 text-center">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
      )}

      {/* Detail Modal */}
      {selectedIntegration && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-100">
                {selectedIntegration.name}
              </h3>
              <button
                onClick={() => {
                  setSelectedIntegration(null);
                  setTestResult(null);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              {detailLoading ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-4 w-32 bg-slate-800 rounded" />
                  <div className="h-4 w-48 bg-slate-800 rounded" />
                  <div className="h-4 w-40 bg-slate-800 rounded" />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getStatusColor(selectedIntegration.status)}`}
                    >
                      {formatStatus(selectedIntegration.status)}
                    </span>
                    <span className="text-xs text-slate-500">
                      {selectedIntegration.provider}
                    </span>
                  </div>

                  <p className="text-sm text-slate-400">
                    {selectedIntegration.description}
                  </p>

                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Configuration
                    </h4>
                    <div className="bg-slate-800/50 rounded-lg p-3 space-y-2 text-xs font-mono">
                      {selectedIntegration.config.host && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Host:</span>
                          <span className="text-slate-300">
                            {selectedIntegration.config.host}
                          </span>
                        </div>
                      )}
                      {selectedIntegration.config.port && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Port:</span>
                          <span className="text-slate-300">
                            {selectedIntegration.config.port}
                          </span>
                        </div>
                      )}
                      {selectedIntegration.config.endpoint && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Endpoint:</span>
                          <span className="text-slate-300 truncate max-w-[200px]">
                            {selectedIntegration.config.endpoint}
                          </span>
                        </div>
                      )}
                      {selectedIntegration.config.model && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Model:</span>
                          <span className="text-slate-300">
                            {selectedIntegration.config.model}
                          </span>
                        </div>
                      )}
                      {selectedIntegration.config.enabled !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Enabled:</span>
                          <span className="text-slate-300">
                            {selectedIntegration.config.enabled ? "Yes" : "No"}
                          </span>
                        </div>
                      )}
                      {selectedIntegration.config.timeout_sec && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Timeout:</span>
                          <span className="text-slate-300">
                            {selectedIntegration.config.timeout_sec}s
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-500">API Key:</span>
                        <span className="text-slate-300">
                          {selectedIntegration.has_api_key
                            ? "Configured ✓"
                            : "Not set"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {selectedIntegration.error_message && (
                    <div className="bg-red-900/20 border border-red-800 text-red-400 px-3 py-2 rounded text-xs">
                      {selectedIntegration.error_message}
                    </div>
                  )}

                  {/* Test Result */}
                  {testResult && (
                    <div
                      className={`border rounded-lg p-3 text-sm ${
                        testResult.success
                          ? "bg-green-900/20 border-green-800 text-green-400"
                          : "bg-red-900/20 border-red-800 text-red-400"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{testResult.message}</span>
                        <span className="text-xs opacity-75">
                          {testResult.latency_ms.toFixed(0)}ms
                        </span>
                      </div>
                      {testResult.details &&
                        Object.keys(testResult.details).length > 0 && (
                          <div className="mt-2 text-xs opacity-75">
                            {Object.entries(testResult.details).map(
                              ([key, value]) => (
                                <div key={key}>
                                  {key}: {String(value)}
                                </div>
                              ),
                            )}
                          </div>
                        )}
                    </div>
                  )}

                  {/* Actions */}
                  {isAdmin && (
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => handleTest(selectedIntegration.id)}
                        disabled={testingId === selectedIntegration.id}
                        className="flex-1 px-3 py-2 text-sm bg-blue-900/50 hover:bg-blue-800/50 text-blue-400 border border-blue-800 rounded transition-colors disabled:opacity-50"
                      >
                        {testingId === selectedIntegration.id
                          ? "Testing..."
                          : "Test Connection"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
