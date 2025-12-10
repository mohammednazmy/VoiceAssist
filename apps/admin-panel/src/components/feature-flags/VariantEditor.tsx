/**
 * VariantEditor Component
 * Phase 3.2: Edit multivariate flag variants for A/B testing
 *
 * Allows creating, editing, and reordering variants with weights.
 */

import { useState, useCallback } from "react";
import type { FlagVariant } from "@voiceassist/types";

interface VariantEditorProps {
  /** Current list of variants */
  variants: FlagVariant[];
  /** Callback when variants change */
  onChange: (variants: FlagVariant[]) => void;
  /** Whether editing is disabled */
  disabled?: boolean;
}

/**
 * Editor for multivariate flag variants.
 * Supports adding, editing, removing, and validating variant weights.
 */
export function VariantEditor({
  variants,
  onChange,
  disabled = false,
}: VariantEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<FlagVariant>>({});

  // Calculate total weight
  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
  const isWeightValid = totalWeight === 100;

  // Generate unique ID for new variants
  const generateId = useCallback(() => {
    return `variant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Add new variant
  const handleAdd = useCallback(() => {
    const remainingWeight = Math.max(0, 100 - totalWeight);
    const newVariant: FlagVariant = {
      id: generateId(),
      name: `Variant ${variants.length + 1}`,
      value: null,
      weight: remainingWeight,
      description: "",
    };
    onChange([...variants, newVariant]);
  }, [variants, totalWeight, onChange, generateId]);

  // Remove variant
  const handleRemove = useCallback(
    (index: number) => {
      const newVariants = [...variants];
      newVariants.splice(index, 1);
      onChange(newVariants);
    },
    [variants, onChange],
  );

  // Start editing a variant
  const handleEdit = useCallback(
    (index: number) => {
      setEditingIndex(index);
      setEditForm(variants[index]);
    },
    [variants],
  );

  // Save edited variant
  const handleSave = useCallback(() => {
    if (editingIndex === null) return;

    const newVariants = [...variants];
    newVariants[editingIndex] = {
      ...newVariants[editingIndex],
      ...editForm,
      weight: Number(editForm.weight) || 0,
    };
    onChange(newVariants);
    setEditingIndex(null);
    setEditForm({});
  }, [editingIndex, editForm, variants, onChange]);

  // Cancel editing
  const handleCancel = useCallback(() => {
    setEditingIndex(null);
    setEditForm({});
  }, []);

  // Distribute weights evenly
  const handleEvenDistribution = useCallback(() => {
    if (variants.length === 0) return;
    const evenWeight = Math.floor(100 / variants.length);
    const remainder = 100 % variants.length;

    const newVariants = variants.map((v, i) => ({
      ...v,
      weight: evenWeight + (i < remainder ? 1 : 0),
    }));
    onChange(newVariants);
  }, [variants, onChange]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-slate-200">Variants</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Define variants for A/B testing. Weights must total 100%.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2 py-1 rounded ${
              isWeightValid
                ? "bg-green-900/50 text-green-400"
                : "bg-red-900/50 text-red-400"
            }`}
          >
            Total: {totalWeight}%
          </span>
        </div>
      </div>

      {/* Variants List */}
      <div className="space-y-2">
        {variants.map((variant, index) => (
          <div
            key={variant.id}
            className="bg-slate-800/50 border border-slate-700 rounded-lg p-3"
          >
            {editingIndex === index ? (
              // Edit mode
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      value={editForm.name || ""}
                      onChange={(e) =>
                        setEditForm({ ...editForm, name: e.target.value })
                      }
                      className="w-full px-2 py-1.5 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200"
                      placeholder="Variant name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Weight (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={editForm.weight || 0}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          weight: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-full px-2 py-1.5 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Value (JSON)
                  </label>
                  <input
                    type="text"
                    value={
                      typeof editForm.value === "string"
                        ? editForm.value
                        : JSON.stringify(editForm.value)
                    }
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value);
                        setEditForm({ ...editForm, value: parsed });
                      } catch {
                        setEditForm({ ...editForm, value: e.target.value });
                      }
                    }}
                    className="w-full px-2 py-1.5 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200 font-mono"
                    placeholder='"control" or {"feature": true}'
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={editForm.description || ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, description: e.target.value })
                    }
                    className="w-full px-2 py-1.5 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200"
                    placeholder="What this variant tests..."
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-3 py-1 text-xs text-slate-400 hover:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              // View mode
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-200">
                      {variant.name}
                    </span>
                    <span className="text-xs bg-slate-700 px-2 py-0.5 rounded text-slate-300">
                      {variant.weight}%
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      {typeof variant.value === "string"
                        ? `"${variant.value}"`
                        : JSON.stringify(variant.value)}
                    </span>
                  </div>
                  {variant.description && (
                    <p className="text-xs text-slate-500 mt-1">
                      {variant.description}
                    </p>
                  )}
                </div>
                {!disabled && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleEdit(index)}
                      className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(index)}
                      className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      {!disabled && (
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleAdd}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded transition-colors"
          >
            + Add Variant
          </button>
          {variants.length > 1 && (
            <button
              type="button"
              onClick={handleEvenDistribution}
              className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
            >
              Distribute Evenly
            </button>
          )}
        </div>
      )}

      {/* Weight Warning */}
      {!isWeightValid && variants.length > 0 && (
        <div className="bg-yellow-900/30 border border-yellow-800/50 rounded-lg p-3 text-xs text-yellow-400">
          Variant weights must total 100%. Current total: {totalWeight}%
        </div>
      )}
    </div>
  );
}

export default VariantEditor;
