import { useState, useEffect, useRef } from "react";
import type {
  Prompt,
  PromptCreate,
  PromptUpdate,
  PromptType,
  IntentCategory,
} from "../../types";

interface PromptEditorModalProps {
  title: string;
  prompt?: Prompt | null;
  onSave: (data: PromptCreate | PromptUpdate) => Promise<boolean>;
  onCancel: () => void;
  isLoading: boolean;
}

const PROMPT_TYPES: { value: PromptType; label: string }[] = [
  { value: "chat", label: "Chat Mode" },
  { value: "voice", label: "Voice Mode" },
  { value: "persona", label: "Persona" },
  { value: "system", label: "System" },
];

const INTENT_CATEGORIES: { value: IntentCategory; label: string }[] = [
  { value: "diagnosis", label: "Diagnosis" },
  { value: "treatment", label: "Treatment" },
  { value: "drug", label: "Drug Information" },
  { value: "guideline", label: "Clinical Guidelines" },
  { value: "summary", label: "Summary" },
  { value: "other", label: "Other" },
];

export function PromptEditorModal({
  title,
  prompt,
  onSave,
  onCancel,
  isLoading,
}: PromptEditorModalProps) {
  const isEdit = !!prompt;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Form state
  const [name, setName] = useState(prompt?.name ?? "");
  const [displayName, setDisplayName] = useState(prompt?.display_name ?? "");
  const [description, setDescription] = useState(prompt?.description ?? "");
  const [promptType, setPromptType] = useState<PromptType>(
    prompt?.prompt_type ?? "chat",
  );
  const [intentCategory, setIntentCategory] = useState<IntentCategory | "">(
    prompt?.intent_category ?? "",
  );
  const [systemPrompt, setSystemPrompt] = useState(prompt?.system_prompt ?? "");
  const [changeSummary, setChangeSummary] = useState("");

  // Model settings
  const [temperature, setTemperature] = useState<number>(
    prompt?.temperature ?? 0.7,
  );
  const [maxTokens, setMaxTokens] = useState<number>(
    prompt?.max_tokens ?? 1024,
  );
  const [modelName, setModelName] = useState(prompt?.model_name ?? "");

  // Character and token count
  const characterCount = systemPrompt.length;
  const tokenEstimate = Math.ceil(characterCount / 4); // Rough estimate

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.max(300, textareaRef.current.scrollHeight)}px`;
    }
  }, [systemPrompt]);

  // Generate name from display name
  useEffect(() => {
    if (!isEdit && displayName && !name) {
      const generatedName = displayName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      setName(generatedName);
    }
  }, [displayName, isEdit, name]);

  const handleSave = async () => {
    if (isEdit) {
      const success = await onSave({
        display_name: displayName,
        description: description || undefined,
        system_prompt: systemPrompt,
        intent_category: intentCategory || undefined,
        temperature: temperature,
        max_tokens: maxTokens,
        model_name: modelName || undefined,
        change_summary: changeSummary || undefined,
      });
      if (success) {
        onCancel();
      }
    } else {
      const success = await onSave({
        name,
        display_name: displayName,
        description: description || undefined,
        prompt_type: promptType,
        intent_category: intentCategory || undefined,
        system_prompt: systemPrompt,
        temperature: temperature,
        max_tokens: maxTokens,
        model_name: modelName || undefined,
      });
      if (success) {
        onCancel();
      }
    }
  };

  const isValid = name && displayName && systemPrompt.length > 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col border border-slate-700 shadow-xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
          <button
            type="button"
            onClick={onCancel}
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
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Basic Info Row */}
          <div className="grid grid-cols-2 gap-4">
            {/* Name (only for create) */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Internal Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isEdit}
                placeholder="prompt_name_here"
                className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 placeholder-slate-500 disabled:opacity-50 font-mono"
              />
              <p className="text-xs text-slate-500 mt-1">
                Unique identifier (auto-generated from display name)
              </p>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Display Name *
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="My Prompt Name"
                className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 placeholder-slate-500"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this prompt does..."
              rows={2}
              className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 placeholder-slate-500 resize-none"
            />
          </div>

          {/* Type and Intent Row */}
          <div className="grid grid-cols-2 gap-4">
            {/* Prompt Type */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Prompt Type *
              </label>
              <select
                value={promptType}
                onChange={(e) => setPromptType(e.target.value as PromptType)}
                disabled={isEdit}
                className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 disabled:opacity-50"
              >
                {PROMPT_TYPES.map((pt) => (
                  <option key={pt.value} value={pt.value}>
                    {pt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Intent Category */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Intent Category
              </label>
              <select
                value={intentCategory}
                onChange={(e) =>
                  setIntentCategory(e.target.value as IntentCategory | "")
                }
                className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200"
              >
                <option value="">None</option>
                {INTENT_CATEGORIES.map((ic) => (
                  <option key={ic.value} value={ic.value}>
                    {ic.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Used for intent-based prompt routing
              </p>
            </div>
          </div>

          {/* Model Settings Row */}
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <h4 className="text-sm font-medium text-slate-300 mb-3">
              Model Settings
            </h4>
            <div className="grid grid-cols-3 gap-4">
              {/* Temperature */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Temperature
                  <span className="ml-2 text-blue-400 font-mono">
                    {temperature.toFixed(2)}
                  </span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>Precise (0)</span>
                  <span>Creative (2)</span>
                </div>
              </div>

              {/* Max Tokens */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Max Tokens
                </label>
                <input
                  type="number"
                  min="64"
                  max="4096"
                  step="64"
                  value={maxTokens}
                  onChange={(e) =>
                    setMaxTokens(parseInt(e.target.value) || 1024)
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Response length limit
                </p>
              </div>

              {/* Model Override */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Model Override
                </label>
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="e.g., gpt-4o"
                  className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 placeholder-slate-500 font-mono"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Leave empty for default
                </p>
              </div>
            </div>
          </div>

          {/* System Prompt Editor */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-slate-300">
                System Prompt *
              </label>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span>{characterCount.toLocaleString()} characters</span>
                <span>~{tokenEstimate.toLocaleString()} tokens</span>
              </div>
            </div>
            <textarea
              ref={textareaRef}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are a helpful AI assistant..."
              className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-600 rounded text-slate-200 placeholder-slate-500 font-mono leading-relaxed resize-none min-h-[300px]"
              style={{ tabSize: 2 }}
            />
            <p className="text-xs text-slate-500 mt-1">
              The system instruction that will be sent to the AI model. Supports
              markdown and variables like {"{{user_name}}"}.
            </p>
          </div>

          {/* Change Summary (only for edit) */}
          {isEdit && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Change Summary
              </label>
              <input
                type="text"
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                placeholder="Brief description of changes made..."
                className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 placeholder-slate-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                This will be recorded in the version history
              </p>
            </div>
          )}

          {/* Current vs Published comparison (only for edit with published content) */}
          {isEdit &&
            prompt?.published_content &&
            prompt.published_content !== systemPrompt && (
              <div className="bg-amber-900/20 border border-amber-700/50 rounded p-3">
                <div className="flex items-center gap-2 mb-2">
                  <svg
                    className="w-4 h-4 text-amber-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <span className="text-sm font-medium text-amber-400">
                    Unpublished Changes
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  The current draft differs from the published version. Publish
                  to make changes live.
                </p>
              </div>
            )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isLoading || !isValid}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            {isLoading
              ? "Saving..."
              : isEdit
                ? "Save Changes"
                : "Create Prompt"}
          </button>
        </div>
      </div>
    </div>
  );
}
