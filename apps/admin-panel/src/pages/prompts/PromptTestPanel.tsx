import { useState } from "react";
import { usePrompts } from "../../hooks/usePrompts";
import type { Prompt, PromptTestResponse } from "../../types";
import { LoadingState } from "../../components/shared";

interface PromptTestPanelProps {
  prompt: Prompt;
  onClose: () => void;
}

export function PromptTestPanel({ prompt, onClose }: PromptTestPanelProps) {
  const { testPrompt } = usePrompts();

  // Test configuration
  const [testMessage, setTestMessage] = useState(
    "Hello, can you help me understand how to use this system?",
  );
  const [useDraft, setUseDraft] = useState(true);
  const [modelOverride, setModelOverride] = useState("");
  const [temperatureOverride, setTemperatureOverride] = useState("");
  const [maxTokensOverride, setMaxTokensOverride] = useState("");

  // Test state
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<PromptTestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Test history
  const [history, setHistory] = useState<PromptTestResponse[]>([]);

  const runTest = async () => {
    setTesting(true);
    setError(null);
    setResult(null);

    try {
      const response = await testPrompt(prompt.id, {
        test_message: testMessage,
        use_draft: useDraft,
        model_override: modelOverride || undefined,
        temperature_override: temperatureOverride
          ? parseFloat(temperatureOverride)
          : undefined,
        max_tokens_override: maxTokensOverride
          ? parseInt(maxTokensOverride)
          : undefined,
      });

      if (response) {
        setResult(response);
        setHistory((prev) => [response, ...prev.slice(0, 9)]); // Keep last 10
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-3xl bg-slate-900 border-l border-slate-700 flex flex-col shadow-xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">
              Test Prompt
            </h3>
            <p className="text-sm text-slate-400">{prompt.display_name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Test Configuration */}
          <div className="bg-slate-800/50 rounded-lg p-4 space-y-4">
            <h4 className="text-sm font-medium text-slate-200">
              Test Configuration
            </h4>

            {/* Test Message */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Test Message
              </label>
              <textarea
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                placeholder="Enter a test message..."
                rows={3}
                className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200 placeholder-slate-500 resize-none"
              />
            </div>

            {/* Options Row */}
            <div className="grid grid-cols-2 gap-4">
              {/* Use Draft Toggle */}
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-400">
                  Use Draft Content
                </label>
                <button
                  type="button"
                  onClick={() => setUseDraft(!useDraft)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    useDraft ? "bg-blue-600" : "bg-slate-700"
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                      useDraft ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {/* Model Override */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Model Override
                </label>
                <select
                  value={modelOverride}
                  onChange={(e) => setModelOverride(e.target.value)}
                  className="w-full px-2 py-1 text-xs bg-slate-900 border border-slate-600 rounded text-slate-200"
                >
                  <option value="">Default</option>
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="gpt-4o-mini">GPT-4o Mini</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo</option>
                </select>
              </div>
            </div>

            {/* Advanced Options Row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Temperature (0-2)
                </label>
                <input
                  type="number"
                  value={temperatureOverride}
                  onChange={(e) => setTemperatureOverride(e.target.value)}
                  placeholder="Default"
                  min="0"
                  max="2"
                  step="0.1"
                  className="w-full px-2 py-1 text-xs bg-slate-900 border border-slate-600 rounded text-slate-200 placeholder-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Max Tokens
                </label>
                <input
                  type="number"
                  value={maxTokensOverride}
                  onChange={(e) => setMaxTokensOverride(e.target.value)}
                  placeholder="Default"
                  min="1"
                  max="4096"
                  className="w-full px-2 py-1 text-xs bg-slate-900 border border-slate-600 rounded text-slate-200 placeholder-slate-500"
                />
              </div>
            </div>

            {/* Run Test Button */}
            <button
              type="button"
              onClick={runTest}
              disabled={testing || !testMessage.trim()}
              className="w-full px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed text-white rounded transition-colors"
            >
              {testing ? "Running Test..." : "Run Test"}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-4">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Loading */}
          {testing && (
            <div className="py-8">
              <LoadingState />
              <p className="text-center text-sm text-slate-400 mt-2">
                Running test...
              </p>
            </div>
          )}

          {/* Result */}
          {result && !testing && (
            <div className="bg-slate-800/50 rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-slate-200">
                  Test Result
                </h4>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span>{result.latency_ms}ms</span>
                  <span>{result.tokens_used} tokens</span>
                  {result.cost_estimate !== undefined && (
                    <span>${result.cost_estimate.toFixed(4)}</span>
                  )}
                </div>
              </div>

              {/* Meta Info */}
              <div className="flex items-center gap-3 text-xs">
                <span className="px-2 py-0.5 bg-slate-700 rounded text-slate-300">
                  {result.model}
                </span>
                <span
                  className={`px-2 py-0.5 rounded ${
                    result.used_draft
                      ? "bg-amber-900/30 text-amber-400"
                      : "bg-green-900/30 text-green-400"
                  }`}
                >
                  {result.used_draft ? "Draft" : "Published"}
                </span>
                {result.prompt_tokens !== undefined && (
                  <span className="text-slate-500">
                    {result.prompt_tokens} prompt / {result.completion_tokens}{" "}
                    completion
                  </span>
                )}
              </div>

              {/* Input */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Input
                </label>
                <div className="bg-slate-900 rounded p-3 text-sm text-slate-300">
                  {result.test_input}
                </div>
              </div>

              {/* Response */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Response
                </label>
                <div className="bg-slate-900 rounded p-3 text-sm text-slate-200 whitespace-pre-wrap">
                  {result.response}
                </div>
              </div>
            </div>
          )}

          {/* Test History */}
          {history.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-slate-400">
                Recent Tests ({history.length})
              </h4>
              <div className="space-y-2">
                {history.map((test, index) => (
                  <div
                    key={index}
                    className="bg-slate-800/30 rounded p-3 text-xs cursor-pointer hover:bg-slate-800/50 transition-colors"
                    onClick={() => setResult(test)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-300 truncate max-w-[70%]">
                        {test.test_input}
                      </span>
                      <span className="text-slate-500">
                        {test.latency_ms}ms
                      </span>
                    </div>
                    <p className="text-slate-500 line-clamp-1">
                      {test.response}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prompt Preview */}
          <div className="bg-slate-800/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-slate-400">
                Prompt Preview
              </h4>
              <span className="text-xs text-slate-500">
                {useDraft ? "Draft" : "Published"} content
              </span>
            </div>
            <pre className="text-xs font-mono bg-slate-900 p-3 rounded overflow-x-auto max-h-48 overflow-y-auto text-slate-400 whitespace-pre-wrap">
              {useDraft
                ? prompt.system_prompt
                : prompt.published_content || prompt.system_prompt}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
