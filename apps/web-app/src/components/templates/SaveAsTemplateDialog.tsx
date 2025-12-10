/**
 * SaveAsTemplateDialog Component
 * Dialog for saving a conversation as a template
 */

import { useState, useEffect } from "react";
import { Button, Input } from "@voiceassist/ui";
import { extractErrorMessage } from "@voiceassist/types";

interface SaveAsTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    name: string,
    description?: string,
    category?: string,
    icon?: string,
    color?: string,
  ) => Promise<void>;
  conversationTitle: string;
}

const TEMPLATE_CATEGORIES = [
  "General",
  "Clinical",
  "Differential Diagnosis",
  "Patient Education",
  "Research",
  "Documentation",
  "Custom",
];

const TEMPLATE_ICONS = ["📋", "📝", "🏥", "⚕️", "💊", "🔬", "📊", "📁"];

const TEMPLATE_COLORS = [
  { name: "Blue", value: "#3B82F6" },
  { name: "Green", value: "#10B981" },
  { name: "Purple", value: "#8B5CF6" },
  { name: "Pink", value: "#EC4899" },
  { name: "Orange", value: "#F59E0B" },
  { name: "Red", value: "#EF4444" },
  { name: "Gray", value: "#6B7280" },
];

export function SaveAsTemplateDialog({
  isOpen,
  onClose,
  onSave,
  conversationTitle,
}: SaveAsTemplateDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const [icon, setIcon] = useState("📋");
  const [color, setColor] = useState("#3B82F6");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Pre-fill with conversation title
      setName(conversationTitle || "");
      setDescription("");
      setCategory("General");
      setIcon("📋");
      setColor("#3B82F6");
      setError(null);
    }
  }, [isOpen, conversationTitle]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Template name is required");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave(
        name.trim(),
        description.trim() || undefined,
        category,
        icon,
        color,
      );
      onClose();
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (
      e.key === "Enter" &&
      !isSaving &&
      (e.target as HTMLElement).tagName !== "TEXTAREA"
    ) {
      handleSave();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-template-dialog-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200">
          <h2
            id="save-template-dialog-title"
            className="text-lg font-semibold text-neutral-900"
          >
            Save as Template
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-neutral-100 rounded transition-colors"
            aria-label="Close dialog"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-5 h-5 text-neutral-500"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Template Name */}
          <div>
            <label
              htmlFor="template-name"
              className="block text-sm font-medium text-neutral-700 mb-1"
            >
              Template Name *
            </label>
            <Input
              id="template-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter template name"
              className="w-full"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="template-description"
              className="block text-sm font-medium text-neutral-700 mb-1"
            >
              Description (Optional)
            </label>
            <textarea
              id="template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this template is for..."
              rows={3}
              className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>

          {/* Category */}
          <div>
            <label
              htmlFor="template-category"
              className="block text-sm font-medium text-neutral-700 mb-1"
            >
              Category
            </label>
            <select
              id="template-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {TEMPLATE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Icon Selection */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Icon
            </label>
            <div className="flex gap-2 flex-wrap">
              {TEMPLATE_ICONS.map((i) => (
                <button
                  key={i}
                  onClick={() => setIcon(i)}
                  className={`w-10 h-10 rounded-md border-2 text-xl transition-all ${
                    icon === i
                      ? "border-primary-500 bg-primary-50 scale-110"
                      : "border-neutral-200 hover:border-neutral-300 hover:scale-105"
                  }`}
                  aria-label={`Select ${i} icon`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          {/* Color Selection */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Color
            </label>
            <div className="flex gap-2 flex-wrap">
              {TEMPLATE_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    color === c.value
                      ? "border-neutral-900 scale-110"
                      : "border-transparent hover:scale-105"
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                  aria-label={`Select ${c.name} color`}
                />
              ))}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Info */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-xs text-blue-800">
              This will save the current conversation's messages as a reusable
              template. You can use this template to start new conversations
              with the same structure.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-neutral-200">
          <Button onClick={onClose} variant="outline" disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !name.trim()}>
            {isSaving ? (
              <>
                <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              "Save Template"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
