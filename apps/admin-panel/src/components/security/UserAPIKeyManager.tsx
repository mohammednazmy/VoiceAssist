/**
 * UserAPIKeyManager Component
 * Allows users to create, view, and revoke their personal API keys
 * for programmatic access to the VoiceAssist API.
 */

import { useState } from "react";
import {
  useUserAPIKeys,
  UserAPIKey,
  UserAPIKeyCreated,
} from "../../hooks/useUserAPIKeys";

interface CreateKeyFormProps {
  onSubmit: (
    name: string,
    expiresInDays?: number,
  ) => Promise<UserAPIKeyCreated>;
  onCancel: () => void;
}

function CreateKeyForm({ onSubmit, onCancel }: CreateKeyFormProps) {
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<UserAPIKeyCreated | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError(null);
    try {
      const result = await onSubmit(
        name.trim(),
        expiresInDays ? Number(expiresInDays) : undefined,
      );
      setCreatedKey(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Show the created key (only shown once!)
  if (createdKey) {
    return (
      <div className="bg-green-900/20 border border-green-800 rounded-lg p-4 space-y-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🔑</span>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-green-400">
              API Key Created
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Save this key now! It will not be shown again.
            </p>
          </div>
        </div>

        <div className="relative">
          <div className="p-3 bg-slate-900 border border-slate-700 rounded font-mono text-sm text-slate-200 break-all">
            {createdKey.key}
          </div>
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        <div className="text-xs text-slate-500 space-y-1">
          <p>
            <strong>Name:</strong> {createdKey.name}
          </p>
          <p>
            <strong>Prefix:</strong> {createdKey.key_prefix}...
          </p>
          {createdKey.expires_at && (
            <p>
              <strong>Expires:</strong>{" "}
              {new Date(createdKey.expires_at).toLocaleDateString()}
            </p>
          )}
        </div>

        <div className="bg-yellow-900/20 border border-yellow-800 rounded p-2 text-xs text-yellow-400">
          ⚠️ Store this key securely. You will need to create a new key if you
          lose it.
        </div>

        <button
          onClick={onCancel}
          className="w-full px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 space-y-4"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">🔑</span>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-slate-200">
            Create New API Key
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Generate a key for programmatic access to the VoiceAssist API
          </p>
        </div>
      </div>

      {error && (
        <div className="p-2 bg-red-900/30 border border-red-800/50 rounded text-xs text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">
            Key Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Development, Production, CI/CD"
            maxLength={255}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">
            Expiration (days){" "}
            <span className="text-slate-600">
              - leave empty for no expiration
            </span>
          </label>
          <select
            value={expiresInDays}
            onChange={(e) =>
              setExpiresInDays(e.target.value ? Number(e.target.value) : "")
            }
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Never expires</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="180">180 days</option>
            <option value="365">1 year</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="flex-1 px-4 py-2 text-sm bg-blue-900/50 hover:bg-blue-800/50 text-blue-400 border border-blue-800 rounded transition-colors disabled:opacity-50"
        >
          {saving ? "Creating..." : "Create Key"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-400 rounded transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

interface KeyCardProps {
  apiKey: UserAPIKey;
  onRevoke: () => Promise<void>;
}

function KeyCard({ apiKey, onRevoke }: KeyCardProps) {
  const [revoking, setRevoking] = useState(false);

  const handleRevoke = async () => {
    if (
      !confirm(
        `Revoke the API key "${apiKey.name}"? This action cannot be undone.`,
      )
    ) {
      return;
    }
    setRevoking(true);
    try {
      await onRevoke();
    } finally {
      setRevoking(false);
    }
  };

  const isExpired =
    apiKey.expires_at && new Date(apiKey.expires_at) < new Date();

  return (
    <div
      className={`bg-slate-900/50 border rounded-lg p-4 ${
        apiKey.is_revoked
          ? "border-red-800/50 opacity-60"
          : isExpired
            ? "border-yellow-800/50"
            : "border-slate-800"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-slate-100 truncate">
              {apiKey.name}
            </h3>
            {apiKey.is_revoked && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-red-900/50 text-red-400 border border-red-800">
                Revoked
              </span>
            )}
            {isExpired && !apiKey.is_revoked && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-yellow-900/50 text-yellow-400 border border-yellow-800">
                Expired
              </span>
            )}
          </div>
          <p className="text-xs font-mono text-slate-500 mt-1">
            {apiKey.key_prefix}...
          </p>
        </div>
        {!apiKey.is_revoked && (
          <button
            onClick={handleRevoke}
            disabled={revoking}
            className="px-2 py-1 text-xs bg-red-900/50 hover:bg-red-800/50 text-red-400 border border-red-800 rounded transition-colors disabled:opacity-50"
          >
            {revoking ? "Revoking..." : "Revoke"}
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-slate-500">Created:</span>{" "}
          <span className="text-slate-400">
            {new Date(apiKey.created_at).toLocaleDateString()}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Expires:</span>{" "}
          <span
            className={`${isExpired ? "text-yellow-400" : "text-slate-400"}`}
          >
            {apiKey.expires_at
              ? new Date(apiKey.expires_at).toLocaleDateString()
              : "Never"}
          </span>
        </div>
        <div className="col-span-2">
          <span className="text-slate-500">Last used:</span>{" "}
          <span className="text-slate-400">
            {apiKey.last_used_at
              ? new Date(apiKey.last_used_at).toLocaleString()
              : "Never"}
          </span>
        </div>
      </div>
    </div>
  );
}

export function UserAPIKeyManager() {
  const {
    keys,
    loading,
    error,
    lastUpdated,
    refreshKeys,
    createKey,
    revokeKey,
  } = useUserAPIKeys();
  const [showCreateForm, setShowCreateForm] = useState(false);

  const activeKeys = keys.filter((k) => !k.is_revoked);
  const revokedKeys = keys.filter((k) => k.is_revoked);

  if (loading && keys.length === 0) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg">
        <div className="px-4 py-3 border-b border-slate-800">
          <h2 className="text-sm font-medium text-slate-200">API Keys</h2>
          <p className="text-xs text-slate-500 mt-1">Loading...</p>
        </div>
        <div className="p-4">
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 2 }).map((_, idx) => (
              <div key={idx} className="h-20 bg-slate-800/50 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-slate-200">API Keys</h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage keys for programmatic API access
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refreshKeys()}
            disabled={loading}
            className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          {!showCreateForm && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-2 py-1 text-xs bg-blue-900/50 hover:bg-blue-800/50 text-blue-400 border border-blue-800 rounded transition-colors"
            >
              + New Key
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-900/20 border-b border-red-800 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* Create Form */}
        {showCreateForm && (
          <CreateKeyForm
            onSubmit={createKey}
            onCancel={() => setShowCreateForm(false)}
          />
        )}

        {/* Usage Instructions */}
        {!showCreateForm && keys.length === 0 && (
          <div className="text-center py-8">
            <span className="text-4xl">🔑</span>
            <h3 className="text-sm font-medium text-slate-300 mt-3">
              No API Keys
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              Create an API key to access the VoiceAssist API programmatically
              using the X-API-Key header.
            </p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="mt-4 px-4 py-2 text-sm bg-blue-900/50 hover:bg-blue-800/50 text-blue-400 border border-blue-800 rounded transition-colors"
            >
              Create Your First Key
            </button>
          </div>
        )}

        {/* Active Keys */}
        {activeKeys.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs text-slate-500 uppercase tracking-wide">
              Active Keys ({activeKeys.length})
            </h3>
            <div className="space-y-3">
              {activeKeys.map((key) => (
                <KeyCard
                  key={key.id}
                  apiKey={key}
                  onRevoke={() => revokeKey(key.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Revoked Keys */}
        {revokedKeys.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs text-slate-500 uppercase tracking-wide">
              Revoked Keys ({revokedKeys.length})
            </h3>
            <div className="space-y-3">
              {revokedKeys.map((key) => (
                <KeyCard
                  key={key.id}
                  apiKey={key}
                  onRevoke={() => revokeKey(key.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Usage Example */}
        {activeKeys.length > 0 && !showCreateForm && (
          <div className="mt-6 pt-4 border-t border-slate-800">
            <h3 className="text-xs text-slate-500 uppercase tracking-wide mb-2">
              Usage
            </h3>
            <div className="p-3 bg-slate-800/50 rounded font-mono text-xs text-slate-400">
              <code>
                curl -H "X-API-Key: va_k_..."
                https://api.voiceassist.example.com/...
              </code>
            </div>
          </div>
        )}
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
