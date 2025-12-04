/**
 * RuleEditor Component
 * Phase 3.2: Edit targeting rules for feature flag segmentation
 *
 * Allows creating and editing targeting rules with conditions.
 */

import { useState, useCallback } from "react";
import type {
  TargetingRule,
  TargetingCondition,
  TargetingOperator,
  TargetingAttribute,
} from "@voiceassist/types";

// Available targeting attributes
const TARGETING_ATTRIBUTES: Array<{
  value: TargetingAttribute;
  label: string;
}> = [
  { value: "user_id", label: "User ID" },
  { value: "user_email", label: "User Email" },
  { value: "user_role", label: "User Role" },
  { value: "user_plan", label: "Subscription Plan" },
  { value: "user_country", label: "Country" },
  { value: "user_language", label: "Language" },
  { value: "app_version", label: "App Version" },
  { value: "platform", label: "Platform" },
  { value: "custom", label: "Custom Attribute" },
];

// Available operators grouped by type
const OPERATORS: Array<{
  value: TargetingOperator;
  label: string;
  group: string;
}> = [
  { value: "equals", label: "Equals", group: "String" },
  { value: "not_equals", label: "Not Equals", group: "String" },
  { value: "in", label: "In List", group: "String" },
  { value: "not_in", label: "Not In List", group: "String" },
  { value: "contains", label: "Contains", group: "String" },
  { value: "starts_with", label: "Starts With", group: "String" },
  { value: "ends_with", label: "Ends With", group: "String" },
  { value: "regex", label: "Regex Match", group: "String" },
  { value: "gt", label: "Greater Than", group: "Numeric" },
  { value: "gte", label: "Greater Than or Equal", group: "Numeric" },
  { value: "lt", label: "Less Than", group: "Numeric" },
  { value: "lte", label: "Less Than or Equal", group: "Numeric" },
  { value: "semver_gt", label: "Version >", group: "Version" },
  { value: "semver_gte", label: "Version >=", group: "Version" },
  { value: "semver_lt", label: "Version <", group: "Version" },
  { value: "semver_lte", label: "Version <=", group: "Version" },
];

interface RuleEditorProps {
  /** Current list of rules */
  rules: TargetingRule[];
  /** Callback when rules change */
  onChange: (rules: TargetingRule[]) => void;
  /** Available variants for multivariate flags */
  variants?: Array<{ id: string; name: string }>;
  /** Whether this is a boolean flag */
  isBoolean?: boolean;
  /** Whether editing is disabled */
  disabled?: boolean;
}

/**
 * Editor for feature flag targeting rules.
 * Supports creating rules with multiple AND conditions.
 */
export function RuleEditor({
  rules,
  onChange,
  variants = [],
  isBoolean = true,
  disabled = false,
}: RuleEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<TargetingRule>>({});

  // Generate unique ID
  const generateId = useCallback(() => {
    return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Add new rule
  const handleAdd = useCallback(() => {
    const newRule: TargetingRule = {
      id: generateId(),
      name: `Rule ${rules.length + 1}`,
      priority: rules.length,
      conditions: [],
      enabled: isBoolean ? true : undefined,
      variant: !isBoolean && variants.length > 0 ? variants[0].id : undefined,
      description: "",
    };
    onChange([...rules, newRule]);
    setEditingIndex(rules.length);
    setEditForm(newRule);
  }, [rules, isBoolean, variants, onChange, generateId]);

  // Remove rule
  const handleRemove = useCallback(
    (index: number) => {
      const newRules = [...rules];
      newRules.splice(index, 1);
      // Re-index priorities
      newRules.forEach((r, i) => (r.priority = i));
      onChange(newRules);
      if (editingIndex === index) {
        setEditingIndex(null);
        setEditForm({});
      }
    },
    [rules, editingIndex, onChange],
  );

  // Start editing
  const handleEdit = useCallback(
    (index: number) => {
      setEditingIndex(index);
      setEditForm({ ...rules[index] });
    },
    [rules],
  );

  // Save rule
  const handleSave = useCallback(() => {
    if (editingIndex === null) return;

    const newRules = [...rules];
    newRules[editingIndex] = {
      ...newRules[editingIndex],
      ...editForm,
      priority: editingIndex,
    } as TargetingRule;
    onChange(newRules);
    setEditingIndex(null);
    setEditForm({});
  }, [editingIndex, editForm, rules, onChange]);

  // Cancel editing
  const handleCancel = useCallback(() => {
    // If this is a new rule (no conditions), remove it
    if (
      editingIndex !== null &&
      rules[editingIndex]?.conditions?.length === 0
    ) {
      handleRemove(editingIndex);
    }
    setEditingIndex(null);
    setEditForm({});
  }, [editingIndex, rules, handleRemove]);

  // Move rule up/down
  const handleMove = useCallback(
    (index: number, direction: "up" | "down") => {
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= rules.length) return;

      const newRules = [...rules];
      [newRules[index], newRules[newIndex]] = [
        newRules[newIndex],
        newRules[index],
      ];
      // Re-index priorities
      newRules.forEach((r, i) => (r.priority = i));
      onChange(newRules);
    },
    [rules, onChange],
  );

  // Add condition to current rule
  const handleAddCondition = useCallback(() => {
    const newCondition: TargetingCondition = {
      attribute: "user_role",
      operator: "equals",
      value: "",
    };
    setEditForm({
      ...editForm,
      conditions: [...(editForm.conditions || []), newCondition],
    });
  }, [editForm]);

  // Update condition
  const handleUpdateCondition = useCallback(
    (condIndex: number, updates: Partial<TargetingCondition>) => {
      const conditions = [...(editForm.conditions || [])];
      conditions[condIndex] = { ...conditions[condIndex], ...updates };
      setEditForm({ ...editForm, conditions });
    },
    [editForm],
  );

  // Remove condition
  const handleRemoveCondition = useCallback(
    (condIndex: number) => {
      const conditions = [...(editForm.conditions || [])];
      conditions.splice(condIndex, 1);
      setEditForm({ ...editForm, conditions });
    },
    [editForm],
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-slate-200">
            Targeting Rules
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Rules are evaluated in order. First matching rule wins.
          </p>
        </div>
      </div>

      {/* Rules List */}
      <div className="space-y-3">
        {rules.map((rule, index) => (
          <div
            key={rule.id}
            className={`bg-slate-800/50 border rounded-lg ${
              editingIndex === index ? "border-blue-600" : "border-slate-700"
            }`}
          >
            {editingIndex === index ? (
              // Edit Mode
              <div className="p-4 space-y-4">
                {/* Rule Header */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Rule Name
                    </label>
                    <input
                      type="text"
                      value={editForm.name || ""}
                      onChange={(e) =>
                        setEditForm({ ...editForm, name: e.target.value })
                      }
                      className="w-full px-2 py-1.5 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200"
                      placeholder="e.g., Beta Users"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      {isBoolean ? "Enabled When Matched" : "Serve Variant"}
                    </label>
                    {isBoolean ? (
                      <select
                        value={editForm.enabled ? "true" : "false"}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            enabled: e.target.value === "true",
                          })
                        }
                        className="w-full px-2 py-1.5 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200"
                      >
                        <option value="true">Enable Flag</option>
                        <option value="false">Disable Flag</option>
                      </select>
                    ) : (
                      <select
                        value={editForm.variant || ""}
                        onChange={(e) =>
                          setEditForm({ ...editForm, variant: e.target.value })
                        }
                        className="w-full px-2 py-1.5 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200"
                      >
                        {variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Description */}
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
                    placeholder="What this rule targets..."
                  />
                </div>

                {/* Conditions */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-slate-400">
                      Conditions (ALL must match)
                    </label>
                  </div>

                  {(editForm.conditions || []).map((condition, condIndex) => (
                    <div
                      key={condIndex}
                      className="flex items-center gap-2 bg-slate-900/50 p-2 rounded"
                    >
                      {/* Attribute */}
                      <select
                        value={condition.attribute}
                        onChange={(e) =>
                          handleUpdateCondition(condIndex, {
                            attribute: e.target.value as TargetingAttribute,
                          })
                        }
                        className="flex-1 px-2 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-slate-200"
                      >
                        {TARGETING_ATTRIBUTES.map((attr) => (
                          <option key={attr.value} value={attr.value}>
                            {attr.label}
                          </option>
                        ))}
                      </select>

                      {/* Custom attribute key */}
                      {condition.attribute === "custom" && (
                        <input
                          type="text"
                          value={condition.customAttributeKey || ""}
                          onChange={(e) =>
                            handleUpdateCondition(condIndex, {
                              customAttributeKey: e.target.value,
                            })
                          }
                          className="w-24 px-2 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-slate-200"
                          placeholder="Key"
                        />
                      )}

                      {/* Operator */}
                      <select
                        value={condition.operator}
                        onChange={(e) =>
                          handleUpdateCondition(condIndex, {
                            operator: e.target.value as TargetingOperator,
                          })
                        }
                        className="flex-1 px-2 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-slate-200"
                      >
                        {OPERATORS.map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.label}
                          </option>
                        ))}
                      </select>

                      {/* Value */}
                      <input
                        type="text"
                        value={
                          Array.isArray(condition.value)
                            ? condition.value.join(", ")
                            : String(condition.value)
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          // Parse as array for in/not_in operators
                          const parsed =
                            condition.operator === "in" ||
                            condition.operator === "not_in"
                              ? val.split(",").map((s) => s.trim())
                              : val;
                          handleUpdateCondition(condIndex, { value: parsed });
                        }}
                        className="flex-1 px-2 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-slate-200"
                        placeholder={
                          condition.operator === "in" ||
                          condition.operator === "not_in"
                            ? "value1, value2"
                            : "value"
                        }
                      />

                      {/* Remove */}
                      <button
                        type="button"
                        onClick={() => handleRemoveCondition(condIndex)}
                        className="p-1 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
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
                  ))}

                  <button
                    type="button"
                    onClick={handleAddCondition}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    + Add Condition
                  </button>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-700">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={(editForm.conditions || []).length === 0}
                    className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded"
                  >
                    Save Rule
                  </button>
                </div>
              </div>
            ) : (
              // View Mode
              <div className="p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-slate-500">
                        #{index + 1}
                      </span>
                      <span className="text-sm font-medium text-slate-200">
                        {rule.name}
                      </span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          isBoolean
                            ? rule.enabled
                              ? "bg-green-900/50 text-green-400"
                              : "bg-red-900/50 text-red-400"
                            : "bg-purple-900/50 text-purple-400"
                        }`}
                      >
                        {isBoolean
                          ? rule.enabled
                            ? "Enable"
                            : "Disable"
                          : variants.find((v) => v.id === rule.variant)?.name ||
                            rule.variant}
                      </span>
                    </div>
                    {rule.description && (
                      <p className="text-xs text-slate-500 mb-2">
                        {rule.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {rule.conditions.map((cond, i) => (
                        <span
                          key={i}
                          className="text-xs bg-slate-700/50 px-2 py-0.5 rounded text-slate-300"
                        >
                          {cond.attribute}
                          {cond.customAttributeKey
                            ? `[${cond.customAttributeKey}]`
                            : ""}{" "}
                          {cond.operator}{" "}
                          {Array.isArray(cond.value)
                            ? `[${cond.value.join(", ")}]`
                            : String(cond.value)}
                        </span>
                      ))}
                    </div>
                  </div>
                  {!disabled && (
                    <div className="flex items-center gap-1">
                      {index > 0 && (
                        <button
                          type="button"
                          onClick={() => handleMove(index, "up")}
                          className="p-1 text-slate-400 hover:text-slate-200"
                          title="Move up"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 15l7-7 7 7"
                            />
                          </svg>
                        </button>
                      )}
                      {index < rules.length - 1 && (
                        <button
                          type="button"
                          onClick={() => handleMove(index, "down")}
                          className="p-1 text-slate-400 hover:text-slate-200"
                          title="Move down"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </button>
                      )}
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
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Rule Button */}
      {!disabled && editingIndex === null && (
        <button
          type="button"
          onClick={handleAdd}
          className="w-full py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700/50 border border-dashed border-slate-600 hover:border-slate-500 rounded-lg transition-colors"
        >
          + Add Targeting Rule
        </button>
      )}

      {/* Empty State */}
      {rules.length === 0 && editingIndex === null && (
        <div className="text-center py-4 text-slate-500 text-sm">
          No targeting rules. All users will receive the default value.
        </div>
      )}
    </div>
  );
}

export default RuleEditor;
