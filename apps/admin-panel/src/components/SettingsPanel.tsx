/**
 * SettingsPanel Component
 * System-wide configuration for VoiceAssist admin panel
 * Includes model routing, session settings, and AI behavior defaults
 */

import { useState } from "react";
import {
  useModelAnalytics,
  ModelRoutingConfig,
} from "../hooks/useModelAnalytics";
import { useAuth } from "../contexts/AuthContext";

interface SettingsCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

function SettingsCard({ title, description, children }: SettingsCardProps) {
  return (
    <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-3">
      <div>
        <h3 className="font-medium text-slate-200 text-sm">{title}</h3>
        {description && (
          <p className="text-slate-500 text-xs mt-1">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: ToggleProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <span className="text-sm text-slate-300">{label}</span>
        {description && (
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        )}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
          checked ? "bg-blue-600" : "bg-slate-700"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

interface SelectProps {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}

function Select({ label, value, options, onChange, disabled }: SelectProps) {
  return (
    <div className="space-y-1">
      <label className="text-sm text-slate-300">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  displayValue?: string;
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled,
  displayValue,
}: SliderProps) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <label className="text-sm text-slate-300">{label}</label>
        <span className="text-sm text-slate-400">{displayValue ?? value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
      />
    </div>
  );
}

// Model options for routing
const CHAT_MODELS = [
  { value: "gpt-4-turbo-preview", label: "GPT-4 Turbo" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  { value: "local-llama", label: "Local LLM (Llama)" },
];

const EMBEDDING_MODELS = [
  { value: "text-embedding-3-small", label: "text-embedding-3-small" },
  { value: "text-embedding-3-large", label: "text-embedding-3-large" },
  { value: "text-embedding-ada-002", label: "text-embedding-ada-002" },
];

export function SettingsPanel() {
  const { isAdmin } = useAuth();
  const { routingConfig, updateRouting, loading, error } = useModelAnalytics({
    autoRefresh: false,
  });

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Local state for settings (AI behavior defaults)
  const [aiDefaults, setAiDefaults] = useState({
    temperature: 0.7,
    maxTokens: 4096,
    streamResponses: true,
  });

  // Session settings (would typically come from backend)
  const [sessionSettings, setSessionSettings] = useState({
    idleTimeoutMinutes: 60,
    absoluteTimeoutHours: 24,
    sessionConcurrency: 3,
  });

  const handleRoutingChange = async (updates: Partial<ModelRoutingConfig>) => {
    if (!isAdmin) return;

    setSaving(true);
    setSaveMessage(null);

    try {
      const success = await updateRouting(updates);
      if (success) {
        setSaveMessage({ type: "success", text: "Settings saved" });
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setSaveMessage({ type: "error", text: "Failed to save settings" });
      }
    } catch (err) {
      setSaveMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section id="settings" className="flex-1 p-6 space-y-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-800 rounded w-1/4" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-48 bg-slate-800 rounded" />
            <div className="h-48 bg-slate-800 rounded" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="settings" className="flex-1 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Settings</h2>
          <p className="text-sm text-slate-500">
            System-wide configuration for VoiceAssist
          </p>
        </div>
        {saveMessage && (
          <div
            className={`px-3 py-1.5 rounded-md text-sm ${
              saveMessage.type === "success"
                ? "bg-green-900/50 text-green-400 border border-green-800"
                : "bg-red-900/50 text-red-400 border border-red-800"
            }`}
          >
            {saveMessage.text}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-800 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Model Routing Card */}
        <SettingsCard
          title="Model Routing"
          description="Configure which models to use for different tasks"
        >
          <div className="space-y-4">
            <Select
              label="Default Chat Model"
              value={routingConfig?.default_chat_model || "gpt-4o"}
              options={CHAT_MODELS}
              onChange={(value) =>
                handleRoutingChange({ default_chat_model: value })
              }
              disabled={!isAdmin || saving}
            />

            <Select
              label="Default Embedding Model"
              value={
                routingConfig?.default_embedding_model ||
                "text-embedding-3-small"
              }
              options={EMBEDDING_MODELS}
              onChange={(value) =>
                handleRoutingChange({ default_embedding_model: value })
              }
              disabled={!isAdmin || saving}
            />

            <Select
              label="Fallback Model"
              value={routingConfig?.fallback_model || "gpt-3.5-turbo"}
              options={CHAT_MODELS}
              onChange={(value) =>
                handleRoutingChange({ fallback_model: value })
              }
              disabled={!isAdmin || saving || !routingConfig?.fallback_enabled}
            />

            <Toggle
              label="Enable Fallback"
              description="Use fallback model when primary fails"
              checked={routingConfig?.fallback_enabled ?? false}
              onChange={(checked) =>
                handleRoutingChange({ fallback_enabled: checked })
              }
              disabled={!isAdmin || saving}
            />
          </div>
        </SettingsCard>

        {/* PHI Routing Card */}
        <SettingsCard
          title="PHI Routing"
          description="HIPAA-compliant routing for Protected Health Information"
        >
          <div className="space-y-4">
            <Toggle
              label="PHI Detection"
              description="Automatically detect PHI in messages"
              checked={routingConfig?.phi_detection_enabled ?? true}
              onChange={(checked) =>
                handleRoutingChange({ phi_detection_enabled: checked })
              }
              disabled={!isAdmin || saving}
            />

            <Toggle
              label="Route PHI to Local Models"
              description="Send PHI-containing requests to local/on-premise models"
              checked={routingConfig?.phi_route_to_local ?? true}
              onChange={(checked) =>
                handleRoutingChange({ phi_route_to_local: checked })
              }
              disabled={!isAdmin || saving}
            />

            <div className="bg-slate-900/50 border border-slate-700 rounded-md p-3 text-xs text-slate-400">
              <strong className="text-slate-300">HIPAA Compliance:</strong> When
              enabled, messages containing PHI are routed to local models to
              ensure data doesn't leave your infrastructure.
            </div>
          </div>
        </SettingsCard>

        {/* Session Settings Card */}
        <SettingsCard
          title="Session Settings"
          description="Configure session timeouts and security"
        >
          <div className="space-y-4">
            <Slider
              label="Idle Timeout"
              value={sessionSettings.idleTimeoutMinutes}
              min={5}
              max={120}
              step={5}
              onChange={(value) =>
                setSessionSettings((s) => ({ ...s, idleTimeoutMinutes: value }))
              }
              disabled={!isAdmin}
              displayValue={`${sessionSettings.idleTimeoutMinutes} min`}
            />

            <Slider
              label="Absolute Timeout"
              value={sessionSettings.absoluteTimeoutHours}
              min={1}
              max={72}
              step={1}
              onChange={(value) =>
                setSessionSettings((s) => ({
                  ...s,
                  absoluteTimeoutHours: value,
                }))
              }
              disabled={!isAdmin}
              displayValue={`${sessionSettings.absoluteTimeoutHours} hours`}
            />

            <Slider
              label="Max Concurrent Sessions"
              value={sessionSettings.sessionConcurrency}
              min={1}
              max={10}
              step={1}
              onChange={(value) =>
                setSessionSettings((s) => ({
                  ...s,
                  sessionConcurrency: value,
                }))
              }
              disabled={!isAdmin}
              displayValue={`${sessionSettings.sessionConcurrency}`}
            />
          </div>
        </SettingsCard>

        {/* AI Behavior Defaults */}
        <SettingsCard
          title="AI Behavior Defaults"
          description="Default parameters for AI responses"
        >
          <div className="space-y-4">
            <Slider
              label="Temperature"
              value={aiDefaults.temperature}
              min={0}
              max={2}
              step={0.1}
              onChange={(value) =>
                setAiDefaults((s) => ({ ...s, temperature: value }))
              }
              disabled={!isAdmin}
              displayValue={aiDefaults.temperature.toFixed(1)}
            />

            <Slider
              label="Max Tokens"
              value={aiDefaults.maxTokens}
              min={256}
              max={16384}
              step={256}
              onChange={(value) =>
                setAiDefaults((s) => ({ ...s, maxTokens: value }))
              }
              disabled={!isAdmin}
              displayValue={aiDefaults.maxTokens.toLocaleString()}
            />

            <Toggle
              label="Stream Responses"
              description="Enable real-time streaming of AI responses"
              checked={aiDefaults.streamResponses}
              onChange={(checked) =>
                setAiDefaults((s) => ({ ...s, streamResponses: checked }))
              }
              disabled={!isAdmin}
            />
          </div>
        </SettingsCard>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <QuickLink
          href="/security"
          icon="🔐"
          label="PHI Rules"
          description="Configure PHI detection"
        />
        <QuickLink
          href="/integrations"
          icon="🔗"
          label="API Keys"
          description="Manage integrations"
        />
        <QuickLink
          href="/analytics"
          icon="📊"
          label="Analytics"
          description="View usage metrics"
        />
        <QuickLink
          href="/troubleshooting"
          icon="🔧"
          label="Diagnostics"
          description="System health"
        />
      </div>

      {/* Viewer Notice */}
      {!isAdmin && (
        <div className="bg-yellow-900/30 border border-yellow-800/50 rounded-lg p-4 text-sm text-yellow-400">
          <strong>View Only:</strong> You have viewer access. Contact an
          administrator to modify settings.
        </div>
      )}
    </section>
  );
}

interface QuickLinkProps {
  href: string;
  icon: string;
  label: string;
  description: string;
}

function QuickLink({ href, icon, label, description }: QuickLinkProps) {
  return (
    <a
      href={href}
      className="bg-slate-950/50 border border-slate-800 rounded-lg p-3 hover:bg-slate-900/70 hover:border-slate-700 transition-colors group"
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <span className="text-sm font-medium text-slate-200 group-hover:text-white">
          {label}
        </span>
      </div>
      <p className="text-xs text-slate-500 mt-1">{description}</p>
    </a>
  );
}
