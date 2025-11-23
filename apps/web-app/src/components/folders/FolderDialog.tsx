/**
 * FolderDialog Component
 * Dialog for creating or editing folders
 */

import { useState, useEffect } from "react";
import { Button, Input } from "@voiceassist/ui";
import type { Folder } from "@voiceassist/types";

interface FolderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, color?: string | null, icon?: string | null) => Promise<void>;
  folder?: Folder | null;
  mode: "create" | "edit";
}

const FOLDER_COLORS = [
  { name: "Blue", value: "#3B82F6" },
  { name: "Green", value: "#10B981" },
  { name: "Yellow", value: "#F59E0B" },
  { name: "Red", value: "#EF4444" },
  { name: "Purple", value: "#8B5CF6" },
  { name: "Pink", value: "#EC4899" },
  { name: "Gray", value: "#6B7280" },
];

const FOLDER_ICONS = [
  "📁", "📂", "🗂️", "📋", "📊", "💼", "🏥", "⚕️",
];

export function FolderDialog({ isOpen, onClose, onSave, folder, mode }: FolderDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (mode === "edit" && folder) {
        setName(folder.name);
        setColor(folder.color || null);
        setIcon(folder.icon || null);
      } else {
        setName("");
        setColor(null);
        setIcon(null);
      }
      setError(null);
    }
  }, [isOpen, mode, folder]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Folder name is required");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave(name.trim(), color, icon);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save folder");
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isSaving) {
      handleSave();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-dialog-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200">
          <h2 id="folder-dialog-title" className="text-lg font-semibold text-neutral-900">
            {mode === "create" ? "New Folder" : "Edit Folder"}
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Folder Name */}
          <div>
            <label htmlFor="folder-name" className="block text-sm font-medium text-neutral-700 mb-1">
              Folder Name
            </label>
            <Input
              id="folder-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter folder name"
              className="w-full"
              autoFocus
            />
          </div>

          {/* Color Selection */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Color (Optional)
            </label>
            <div className="flex gap-2 flex-wrap">
              {FOLDER_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setColor(color === c.value ? null : c.value)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    color === c.value ? "border-neutral-900 scale-110" : "border-transparent hover:scale-105"
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                  aria-label={`Select ${c.name} color`}
                />
              ))}
            </div>
          </div>

          {/* Icon Selection */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Icon (Optional)
            </label>
            <div className="flex gap-2 flex-wrap">
              {FOLDER_ICONS.map((i) => (
                <button
                  key={i}
                  onClick={() => setIcon(icon === i ? null : i)}
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

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
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
              <>{mode === "create" ? "Create Folder" : "Save Changes"}</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
