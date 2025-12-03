/**
 * useEditUser Hook
 *
 * Provides functionality for editing user details including:
 * - Full name
 * - Role (user/viewer/admin)
 * - Active status
 * - Field-level validation and dirty tracking
 */

import { useState, useCallback, useMemo } from "react";
import { fetchAPI } from "../lib/api";

export interface UserUpdatePayload {
  full_name?: string;
  admin_role?: "user" | "admin" | "viewer";
  is_active?: boolean;
  action_reason?: string;
}

interface RateLimitInfo {
  limit?: number;
  remaining?: number;
  reset_in?: number | null;
}

interface UpdateUserResponse {
  user: {
    id: string;
    email: string;
    full_name?: string;
    is_admin: boolean;
    admin_role: string;
    is_active: boolean;
  };
  rate_limit?: RateLimitInfo;
}

export interface ValidationErrors {
  full_name?: string;
  admin_role?: string;
  action_reason?: string;
}

export interface OriginalUserData {
  full_name?: string;
  admin_role?: "user" | "admin" | "viewer";
  is_active?: boolean;
}

export function useEditUser() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(
    null,
  );
  const [originalData, setOriginalData] = useState<OriginalUserData | null>(
    null,
  );
  const [currentData, setCurrentData] = useState<UserUpdatePayload>({});
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>(
    {},
  );

  // Track which fields have been modified
  const dirtyFields = useMemo(() => {
    if (!originalData) return new Set<string>();
    const dirty = new Set<string>();

    if (
      currentData.full_name !== undefined &&
      currentData.full_name !== originalData.full_name
    ) {
      dirty.add("full_name");
    }
    if (
      currentData.admin_role !== undefined &&
      currentData.admin_role !== originalData.admin_role
    ) {
      dirty.add("admin_role");
    }
    if (
      currentData.is_active !== undefined &&
      currentData.is_active !== originalData.is_active
    ) {
      dirty.add("is_active");
    }

    return dirty;
  }, [originalData, currentData]);

  const isDirty = dirtyFields.size > 0;

  // Validate a single field
  const validateField = useCallback(
    (field: keyof UserUpdatePayload, value: unknown): string | undefined => {
      switch (field) {
        case "full_name":
          if (typeof value === "string") {
            if (value.length > 0 && value.length < 2) {
              return "Name must be at least 2 characters";
            }
            if (value.length > 100) {
              return "Name must be less than 100 characters";
            }
          }
          break;
        case "admin_role":
          if (value && !["user", "admin", "viewer"].includes(value as string)) {
            return "Invalid role";
          }
          break;
        case "action_reason":
          if (typeof value === "string" && value.length > 500) {
            return "Reason must be less than 500 characters";
          }
          break;
      }
      return undefined;
    },
    [],
  );

  // Validate all fields
  const validate = useCallback(
    (data: UserUpdatePayload): ValidationErrors => {
      const errors: ValidationErrors = {};

      if (data.full_name !== undefined) {
        const error = validateField("full_name", data.full_name);
        if (error) errors.full_name = error;
      }
      if (data.admin_role !== undefined) {
        const error = validateField("admin_role", data.admin_role);
        if (error) errors.admin_role = error;
      }
      if (data.action_reason !== undefined) {
        const error = validateField("action_reason", data.action_reason);
        if (error) errors.action_reason = error;
      }

      return errors;
    },
    [validateField],
  );

  // Initialize with original user data for dirty tracking
  const initializeUser = useCallback((userData: OriginalUserData) => {
    setOriginalData(userData);
    setCurrentData({});
    setValidationErrors({});
  }, []);

  // Update a single field with validation
  const setField = useCallback(
    <K extends keyof UserUpdatePayload>(
      field: K,
      value: UserUpdatePayload[K],
    ) => {
      setCurrentData((prev) => ({ ...prev, [field]: value }));

      const fieldError = validateField(field, value);
      setValidationErrors((prev) => ({
        ...prev,
        [field]: fieldError,
      }));
    },
    [validateField],
  );

  // Reset to original values
  const resetChanges = useCallback(() => {
    setCurrentData({});
    setValidationErrors({});
  }, []);

  const updateUser = useCallback(
    async (
      userId: string,
      updates: UserUpdatePayload,
    ): Promise<UpdateUserResponse> => {
      // Validate before submitting
      const errors = validate(updates);
      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        throw new Error("Validation failed");
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetchAPI<UpdateUserResponse>(
          `/api/admin/panel/users/${userId}`,
          {
            method: "PUT",
            body: JSON.stringify(updates),
          },
        );

        if (response.rate_limit) {
          setRateLimitInfo(response.rate_limit);
        }

        // Update original data after successful save
        setOriginalData((prev) => ({
          ...prev,
          ...updates,
        }));
        setCurrentData({});

        return response;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update user";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [validate],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const isValid = Object.keys(validationErrors).every(
    (key) => !validationErrors[key as keyof ValidationErrors],
  );

  return {
    updateUser,
    isLoading,
    error,
    rateLimitInfo,
    clearError,
    // Dirty tracking
    initializeUser,
    setField,
    resetChanges,
    currentData,
    dirtyFields,
    isDirty,
    // Validation
    validationErrors,
    isValid,
    validate,
  };
}

export default useEditUser;
