/**
 * useEditUser Hook
 *
 * Provides functionality for editing user details including:
 * - Full name
 * - Role (user/viewer/admin)
 * - Active status
 */

import { useState, useCallback } from "react";
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

export function useEditUser() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(
    null,
  );

  const updateUser = useCallback(
    async (
      userId: string,
      updates: UserUpdatePayload,
    ): Promise<UpdateUserResponse> => {
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
    [],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    updateUser,
    isLoading,
    error,
    rateLimitInfo,
    clearError,
  };
}

export default useEditUser;
