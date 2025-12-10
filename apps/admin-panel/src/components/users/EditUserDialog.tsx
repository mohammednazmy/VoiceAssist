/**
 * EditUserDialog Component
 *
 * Modal dialog for editing user details:
 * - Full name
 * - Role (user/viewer/admin via RoleSelector)
 * - Active status
 * - Optional reason for changes
 */

import { useState, useEffect, FormEvent } from "react";
import { useEditUser, UserUpdatePayload } from "../../hooks/useEditUser";
import { RoleSelector } from "./RoleSelector";

interface EditUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user: {
    id: string;
    email: string;
    full_name?: string;
    is_admin: boolean;
    admin_role: "user" | "admin" | "viewer";
    is_active: boolean;
  } | null;
}

export function EditUserDialog({
  isOpen,
  onClose,
  onSuccess,
  user,
}: EditUserDialogProps) {
  const { updateUser, isLoading, error, clearError } = useEditUser();

  // Form state
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"user" | "admin" | "viewer">("user");
  const [isActive, setIsActive] = useState(true);
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Reset form when dialog opens or user changes
  useEffect(() => {
    if (isOpen && user) {
      setFullName(user.full_name || "");
      setRole(user.admin_role || (user.is_admin ? "admin" : "user"));
      setIsActive(user.is_active);
      setReason("");
      setFormError(null);
      setSuccessMessage(null);
      clearError();
    }
  }, [isOpen, user, clearError]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setFormError(null);
    setSuccessMessage(null);

    // Build update payload (only include changed fields)
    const updates: UserUpdatePayload = {};

    if (fullName !== (user.full_name || "")) {
      updates.full_name = fullName;
    }

    if (role !== user.admin_role) {
      updates.admin_role = role;
    }

    if (isActive !== user.is_active) {
      updates.is_active = isActive;
    }

    if (Object.keys(updates).length === 0) {
      setFormError("No changes to save");
      return;
    }

    if (reason.trim()) {
      updates.action_reason = reason.trim();
    }

    try {
      await updateUser(user.id, updates);
      setSuccessMessage("User updated successfully");
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    } catch {
      // Error is handled by the hook
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      onClose();
    }
  };

  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />

      {/* Dialog */}
      <div className="relative bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100">Edit User</h2>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="text-slate-400 hover:text-slate-200 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Email (read-only) */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Email
            </label>
            <div className="px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-md text-slate-400">
              {user.email}
            </div>
          </div>

          {/* Full Name */}
          <div>
            <label
              htmlFor="fullName"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={isLoading}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-100
                focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Enter full name"
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Role
            </label>
            <RoleSelector
              value={role}
              onChange={setRole}
              disabled={isLoading}
            />
          </div>

          {/* Active Status */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={isLoading}
                className="h-4 w-4 text-indigo-500 border-slate-600 bg-slate-800 rounded
                  focus:ring-indigo-500 focus:ring-offset-0"
              />
              <span className="text-sm text-slate-300">Account is active</span>
            </label>
            {!isActive && (
              <p className="mt-1 text-xs text-amber-400">
                Deactivated users cannot log in
              </p>
            )}
          </div>

          {/* Reason (optional) */}
          <div>
            <label
              htmlFor="reason"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Reason for changes{" "}
              <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isLoading}
              rows={2}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-100
                focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                disabled:opacity-50 disabled:cursor-not-allowed resize-none"
              placeholder="e.g., Promoted to admin, Updated profile info..."
            />
          </div>

          {/* Error message */}
          {(error || formError) && (
            <div className="p-3 bg-red-950/50 border border-red-900 rounded-md text-red-400 text-sm">
              {error || formError}
            </div>
          )}

          {/* Success message */}
          {successMessage && (
            <div className="p-3 bg-green-950/50 border border-green-900 rounded-md text-green-400 text-sm">
              {successMessage}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm text-slate-300 hover:text-slate-100 transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium
                rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center gap-2"
            >
              {isLoading && (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {isLoading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditUserDialog;
