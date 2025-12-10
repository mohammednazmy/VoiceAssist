/**
 * RegenerationOptionsDialog
 *
 * Dialog for configuring message regeneration options:
 * - Temperature slider (creativity/randomness)
 * - Length preference (short/medium/detailed)
 * - Clinical context toggle
 *
 * Creates a branch to preserve the original message.
 */

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@voiceassist/ui";
import { Slider } from "@voiceassist/ui";

export type LengthPreference = "short" | "medium" | "detailed";

export interface RegenerationOptions {
  /** Temperature for generation (0.0 - 2.0, default 0.7) */
  temperature: number;
  /** Response length preference */
  lengthPreference: LengthPreference;
  /** Whether to apply clinical context */
  useClinicalContext: boolean;
  /** Whether to create a branch (preserve original) */
  createBranch: boolean;
}

export interface RegenerationOptionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onRegenerate: (options: RegenerationOptions) => void;
  /** Message being regenerated (for preview) */
  originalContent?: string;
  /** Whether regeneration is in progress */
  isRegenerating?: boolean;
  /** Whether clinical context is available */
  hasClinicalContext?: boolean;
}

const LENGTH_OPTIONS: {
  value: LengthPreference;
  label: string;
  description: string;
}[] = [
  { value: "short", label: "Short", description: "Brief, concise responses" },
  {
    value: "medium",
    label: "Medium",
    description: "Balanced detail and length",
  },
  {
    value: "detailed",
    label: "Detailed",
    description: "Comprehensive explanations",
  },
];

export function RegenerationOptionsDialog({
  isOpen,
  onClose,
  onRegenerate,
  originalContent,
  isRegenerating = false,
  hasClinicalContext = false,
}: RegenerationOptionsDialogProps) {
  const [temperature, setTemperature] = useState(0.7);
  const [lengthPreference, setLengthPreference] =
    useState<LengthPreference>("medium");
  const [useClinicalContext, setUseClinicalContext] = useState(true);
  const [createBranch, setCreateBranch] = useState(true);

  const handleRegenerate = useCallback(() => {
    onRegenerate({
      temperature,
      lengthPreference,
      useClinicalContext: hasClinicalContext && useClinicalContext,
      createBranch,
    });
  }, [
    temperature,
    lengthPreference,
    useClinicalContext,
    createBranch,
    hasClinicalContext,
    onRegenerate,
  ]);

  const handleClose = useCallback(() => {
    if (!isRegenerating) {
      onClose();
    }
  }, [isRegenerating, onClose]);

  // Reset to defaults when dialog opens
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        handleClose();
      }
    },
    [handleClose],
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        data-testid="regeneration-options-dialog"
      >
        <DialogHeader>
          <DialogTitle>Regenerate Response</DialogTitle>
          <DialogDescription>
            Customize how the AI generates a new response. The original will be
            preserved in a branch.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Temperature Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label
                htmlFor="temperature-slider"
                className="text-sm font-medium text-neutral-900"
              >
                Creativity
              </label>
              <span className="text-sm text-neutral-500">
                {temperature.toFixed(1)}
              </span>
            </div>
            <Slider
              id="temperature-slider"
              min={0}
              max={2}
              step={0.1}
              value={[temperature]}
              onValueChange={(value) => setTemperature(value[0])}
              className="w-full"
              aria-label="Temperature slider"
              data-testid="temperature-slider"
            />
            <div className="flex justify-between text-xs text-neutral-500">
              <span>Focused</span>
              <span>Balanced</span>
              <span>Creative</span>
            </div>
          </div>

          {/* Length Preference */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-neutral-900">
              Response Length
            </label>
            <div className="grid grid-cols-3 gap-2">
              {LENGTH_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setLengthPreference(option.value)}
                  className={`
                    flex flex-col items-center p-3 rounded-lg border-2 transition-all
                    ${
                      lengthPreference === option.value
                        ? "border-primary-500 bg-primary-50 text-primary-900"
                        : "border-neutral-200 bg-white hover:border-neutral-300 text-neutral-700"
                    }
                  `}
                  data-testid={`length-option-${option.value}`}
                  aria-pressed={lengthPreference === option.value}
                >
                  <span className="font-medium text-sm">{option.label}</span>
                  <span className="text-xs mt-1 text-center opacity-70">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Clinical Context Toggle */}
          {hasClinicalContext && (
            <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
              <div className="space-y-1">
                <label
                  htmlFor="clinical-context-toggle"
                  className="text-sm font-medium text-neutral-900"
                >
                  Use Clinical Context
                </label>
                <p className="text-xs text-neutral-500">
                  Apply active patient context to the response
                </p>
              </div>
              <button
                id="clinical-context-toggle"
                type="button"
                role="switch"
                aria-checked={useClinicalContext}
                onClick={() => setUseClinicalContext(!useClinicalContext)}
                className={`
                  relative w-11 h-6 rounded-full transition-colors
                  ${useClinicalContext ? "bg-primary-500" : "bg-neutral-300"}
                `}
                data-testid="clinical-context-toggle"
              >
                <span
                  className={`
                    absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform
                    ${useClinicalContext ? "translate-x-5" : "translate-x-0"}
                  `}
                />
              </button>
            </div>
          )}

          {/* Create Branch Toggle */}
          <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
            <div className="space-y-1">
              <label
                htmlFor="branch-toggle"
                className="text-sm font-medium text-neutral-900"
              >
                Preserve Original
              </label>
              <p className="text-xs text-neutral-500">
                Create a branch to keep the original response
              </p>
            </div>
            <button
              id="branch-toggle"
              type="button"
              role="switch"
              aria-checked={createBranch}
              onClick={() => setCreateBranch(!createBranch)}
              className={`
                relative w-11 h-6 rounded-full transition-colors
                ${createBranch ? "bg-primary-500" : "bg-neutral-300"}
              `}
              data-testid="branch-toggle"
            >
              <span
                className={`
                  absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform
                  ${createBranch ? "translate-x-5" : "translate-x-0"}
                `}
              />
            </button>
          </div>

          {/* Original Content Preview */}
          {originalContent && (
            <div className="p-3 bg-neutral-100 rounded-lg">
              <p className="text-xs font-medium text-neutral-500 mb-1">
                Original Response
              </p>
              <p className="text-sm text-neutral-700 line-clamp-3">
                {originalContent}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <button
            type="button"
            onClick={handleClose}
            disabled={isRegenerating}
            className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors disabled:opacity-50"
            data-testid="regenerate-cancel-button"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            data-testid="regenerate-confirm-button"
          >
            {isRegenerating && (
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            {isRegenerating ? "Regenerating..." : "Regenerate"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RegenerationOptionsDialog;
