import { useState, useEffect } from 'react';

interface SystemConfig {
  environment: string;
  debug: boolean;
  api_version: string;
  database_pool_size: number;
  redis_max_connections: number;
}

export function SystemPage() {
  const [config, setConfig] = useState<SystemConfig>({
    environment: 'production',
    debug: false,
    api_version: '2.0',
    database_pool_size: 20,
    redis_max_connections: 50,
  });

  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    // Simulate save
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSaved(true);
    setLoading(false);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">System Configuration</h1>
        <p className="text-sm text-slate-400 mt-1">
          Manage system settings and environment variables
        </p>
      </div>

      {/* Environment Settings */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-200">Environment Settings</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Environment
            </label>
            <select
              value={config.environment}
              onChange={(e) => setConfig({ ...config, environment: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="development">Development</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              API Version
            </label>
            <input
              type="text"
              value={config.api_version}
              onChange={(e) => setConfig({ ...config, api_version: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              readOnly
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="debug"
            checked={config.debug}
            onChange={(e) => setConfig({ ...config, debug: e.target.checked })}
            className="w-4 h-4 text-blue-600 bg-slate-800 border-slate-700 rounded focus:ring-blue-500"
          />
          <label htmlFor="debug" className="text-sm font-medium text-slate-300">
            Enable debug mode
          </label>
        </div>
      </div>

      {/* Database Settings */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-200">Database Configuration</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Connection Pool Size
            </label>
            <input
              type="number"
              value={config.database_pool_size}
              onChange={(e) => setConfig({ ...config, database_pool_size: parseInt(e.target.value) })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="1"
              max="100"
            />
            <p className="mt-1 text-xs text-slate-500">
              Current: {config.database_pool_size} connections
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Redis Max Connections
            </label>
            <input
              type="number"
              value={config.redis_max_connections}
              onChange={(e) => setConfig({ ...config, redis_max_connections: parseInt(e.target.value) })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="1"
              max="200"
            />
            <p className="mt-1 text-xs text-slate-500">
              Current: {config.redis_max_connections} connections
            </p>
          </div>
        </div>
      </div>

      {/* Feature Flags */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-200">Feature Flags</h2>

        <div className="space-y-3">
          <FeatureToggle
            id="voice-mode"
            label="Voice Mode (WebRTC)"
            description="Enable real-time voice interaction via WebRTC"
            enabled={true}
          />
          <FeatureToggle
            id="rag-search"
            label="RAG Search"
            description="Enable semantic search in knowledge base"
            enabled={true}
          />
          <FeatureToggle
            id="nextcloud-sync"
            label="Nextcloud Integration"
            description="Automatic file indexing from Nextcloud"
            enabled={false}
          />
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center space-x-4">
        <button
          onClick={handleSave}
          disabled={loading}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium transition-colors"
        >
          {loading ? 'Saving...' : 'Save Configuration'}
        </button>

        {saved && (
          <span className="text-sm text-green-400">✓ Configuration saved</span>
        )}
      </div>

      <div className="text-xs text-slate-500 p-4 bg-yellow-950/30 border border-yellow-900/50 rounded-lg">
        <strong>Note:</strong> Some configuration changes require a service restart to take effect.
        Make sure to coordinate with your operations team before applying changes in production.
      </div>
    </div>
  );
}

function FeatureToggle({ id, label, description, enabled }: {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}) {
  const [isEnabled, setIsEnabled] = useState(enabled);

  return (
    <div className="flex items-start justify-between p-3 bg-slate-800/50 rounded-lg">
      <div className="flex-1">
        <label htmlFor={id} className="block text-sm font-medium text-slate-300">
          {label}
        </label>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
      <button
        id={id}
        onClick={() => setIsEnabled(!isEnabled)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
          isEnabled ? 'bg-blue-600' : 'bg-slate-700'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white transition duration-200 ease-in-out ${
            isEnabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
