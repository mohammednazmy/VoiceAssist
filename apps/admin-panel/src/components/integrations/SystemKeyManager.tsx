/**
 * SystemKeyManager Component
 * Allows admins to view, update, and validate external service API keys
 * (OpenAI, ElevenLabs, PubMed, etc.)
 */

import { useState } from "react";
import {
  useSystemKeys,
  SystemKeyInfo,
  KeyValidationResult,
} from "../../hooks/useSystemKeys";
import { useAuth } from "../../contexts/AuthContext";

// Friendly names and icons for integrations
const INTEGRATION_META: Record<
  string,
  { name: string; icon: string; description: string }
> = {
  openai: {
    name: "OpenAI",
    icon: "🤖",
    description: "GPT models and embeddings",
  },
  google_ai: {
    name: "Google AI Studio",
    icon: "🔮",
    description: "Gemini models",
  },
  deepseek: {
    name: "DeepSeek",
    icon: "🔬",
    description: "DeepSeek chat models",
  },
  local_llm: {
    name: "Local LLM",
    icon: "💻",
    description: "Self-hosted models",
  },
  elevenlabs: { name: "ElevenLabs", icon: "🔊", description: "Text-to-speech" },
  deepgram: { name: "Deepgram", icon: "🎤", description: "Speech-to-text" },
  openevidence: {
    name: "OpenEvidence",
    icon: "📚",
    description: "Medical evidence API",
  },
  pubmed: { name: "PubMed", icon: "🏥", description: "Medical literature" },
  google_oauth: {
    name: "Google OAuth",
    icon: "🔐",
    description: "Google sign-in",
  },
  microsoft_oauth: {
    name: "Microsoft OAuth",
    icon: "🔐",
    description: "Microsoft sign-in",
  },
  sentry: { name: "Sentry", icon: "📊", description: "Error monitoring" },
};

function getIntegrationMeta(integrationId: string) {
  return (
    INTEGRATION_META[integrationId] || {
      name: integrationId
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      icon: "🔗",
      description: "External service",
    }
  );
}

interface KeyCardProps {
  keyInfo: SystemKeyInfo;
  onUpdate: (value: string) => Promise<void>;
  onClear: () => Promise<void>;
  onValidate: () => Promise<KeyValidationResult>;
  isAdmin: boolean;
}

function KeyCard({
  keyInfo,
  onUpdate,
  onClear,
  onValidate,
  isAdmin,
}: KeyCardProps) {
  const [editing, setEditing] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] =
    useState<KeyValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const meta = getIntegrationMeta(keyInfo.integration_id);

  const handleSave = async () => {
    if (!newValue.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onUpdate(newValue.trim());
      setEditing(false);
      setNewValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (
      !confirm(
        `Clear the database override for ${meta.name}? This will revert to the .env value.`,
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onClear();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear");
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    setValidationResult(null);
    try {
      const result = await onValidate();
      setValidationResult(result);
    } catch (err) {
      setValidationResult({
        success: false,
        message: err instanceof Error ? err.message : "Validation failed",
        latency_ms: 0,
      });
    } finally {
      setValidating(false);
    }
  };

  const getStatusColor = () => {
    if (!keyInfo.is_configured) return "border-slate-700 bg-slate-900/30";
    if (keyInfo.validation_status === "valid")
      return "border-green-800/50 bg-green-900/20";
    if (keyInfo.validation_status === "invalid")
      return "border-red-800/50 bg-red-900/20";
    return "border-slate-700 bg-slate-900/50";
  };

  const getSourceBadge = () => {
    if (keyInfo.source === "database") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-900/50 text-blue-400 border border-blue-800">
          DB Override
        </span>
      );
    }
    if (keyInfo.source === "environment") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
          .env
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-yellow-900/50 text-yellow-400 border border-yellow-800">
        Not Set
      </span>
    );
  };

  return (
    <div className={`rounded-lg border p-4 ${getStatusColor()}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="text-2xl">{meta.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-slate-100 truncate">
                {meta.name}
              </h3>
              {getSourceBadge()}
              {keyInfo.validation_status === "valid" && (
                <span className="text-green-400 text-xs">✓</span>
              )}
              {keyInfo.validation_status === "invalid" && (
                <span className="text-red-400 text-xs">✗</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{meta.description}</p>
            {keyInfo.masked_value && (
              <p className="text-xs font-mono text-slate-400 mt-1 truncate">
                {keyInfo.masked_value}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Validation Result */}
      {validationResult && (
        <div
          className={`mt-3 p-2 rounded text-xs ${
            validationResult.success
              ? "bg-green-900/30 text-green-400 border border-green-800/50"
              : "bg-red-900/30 text-red-400 border border-red-800/50"
          }`}
        >
          {validationResult.message}
          {validationResult.latency_ms > 0 && (
            <span className="opacity-75 ml-2">
              ({validationResult.latency_ms.toFixed(0)}ms)
            </span>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 p-2 rounded text-xs bg-red-900/30 text-red-400 border border-red-800/50">
          {error}
        </div>
      )}

      {/* Edit Form */}
      {editing && (
        <div className="mt-3 space-y-2">
          <input
            type="password"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Enter new API key..."
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !newValue.trim()}
              className="flex-1 px-3 py-1.5 text-xs bg-blue-900/50 hover:bg-blue-800/50 text-blue-400 border border-blue-800 rounded transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setNewValue("");
                setError(null);
              }}
              className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {!editing && isAdmin && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setEditing(true)}
            className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors"
          >
            {keyInfo.is_configured ? "Update" : "Set Key"}
          </button>
          {keyInfo.is_configured && (
            <button
              onClick={handleValidate}
              disabled={validating}
              className="px-2 py-1 text-xs bg-blue-900/50 hover:bg-blue-800/50 text-blue-400 border border-blue-800 rounded transition-colors disabled:opacity-50"
            >
              {validating ? "Testing..." : "Test"}
            </button>
          )}
          {keyInfo.is_override && (
            <button
              onClick={handleClear}
              disabled={saving}
              className="px-2 py-1 text-xs bg-red-900/50 hover:bg-red-800/50 text-red-400 border border-red-800 rounded transition-colors disabled:opacity-50"
            >
              Clear Override
            </button>
          )}
        </div>
      )}

      {/* Last validated */}
      {keyInfo.last_validated_at && (
        <p className="text-[10px] text-slate-600 mt-2">
          Last tested: {new Date(keyInfo.last_validated_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}

export function SystemKeyManager() {
  const { isAdmin } = useAuth();
  const {
    keys,
    summary,
    loading,
    error,
    lastUpdated,
    refreshKeys,
    updateKey,
    clearOverride,
    validateKey,
  } = useSystemKeys({ autoRefresh: true, refreshIntervalMs: 60000 });

  if (loading && keys.length === 0) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg">
        <div className="px-4 py-3 border-b border-slate-800">
          <h2 className="text-sm font-medium text-slate-200">
            System API Keys
          </h2>
          <p className="text-xs text-slate-500 mt-1">Loading...</p>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-slate-900/30 border border-slate-800 rounded-lg p-4 animate-pulse"
            >
              <div className="flex gap-3">
                <div className="h-8 w-8 bg-slate-800 rounded" />
                <div className="flex-1">
                  <div className="h-4 w-24 bg-slate-800 rounded" />
                  <div className="h-3 w-32 bg-slate-800 rounded mt-2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-slate-200">
            System API Keys
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage external service credentials
            {summary && ` (${summary.configured}/${summary.total} configured)`}
          </p>
        </div>
        <button
          onClick={() => refreshKeys()}
          disabled={loading}
          className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-900/20 border-b border-red-800 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="px-4 py-3 border-b border-slate-800 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="text-center">
            <div className="text-lg font-bold text-slate-100">
              {summary.total}
            </div>
            <div className="text-xs text-slate-500">Total</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-green-400">
              {summary.configured}
            </div>
            <div className="text-xs text-slate-500">Configured</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-blue-400">
              {summary.from_db}
            </div>
            <div className="text-xs text-slate-500">DB Overrides</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-yellow-400">
              {summary.not_configured}
            </div>
            <div className="text-xs text-slate-500">Not Set</div>
          </div>
        </div>
      )}

      {/* Key Grid */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {keys.map((keyInfo) => (
          <KeyCard
            key={keyInfo.integration_id}
            keyInfo={keyInfo}
            onUpdate={(value) => updateKey(keyInfo.integration_id, value)}
            onClear={() => clearOverride(keyInfo.integration_id)}
            onValidate={() => validateKey(keyInfo.integration_id)}
            isAdmin={isAdmin}
          />
        ))}
      </div>

      {/* Last Updated */}
      {lastUpdated && (
        <div className="px-4 py-2 border-t border-slate-800 text-xs text-slate-600 text-center">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
