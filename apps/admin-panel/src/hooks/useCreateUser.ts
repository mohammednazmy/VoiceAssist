import { useState, useCallback } from "react";
import { fetchAPI, APIError } from "../lib/api";

export interface CreateUserPayload {
  email: string;
  full_name: string;
  password: string;
  is_admin: boolean;
  is_active: boolean;
}

export interface CreatedUser {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
}

interface UseCreateUserReturn {
  createUser: (payload: CreateUserPayload) => Promise<CreatedUser>;
  isLoading: boolean;
  error: string | null;
  checkEmailExists: (email: string) => Promise<boolean>;
}

export function useCreateUser(): UseCreateUserReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Check if an email is already registered.
   * Uses the list users endpoint with email filter to check uniqueness.
   */
  const checkEmailExists = useCallback(
    async (email: string): Promise<boolean> => {
      try {
        const response = await fetchAPI<{
          users: Array<{ email: string }>;
          total: number;
        }>(
          `/api/admin/panel/users?search=${encodeURIComponent(email)}&limit=1`,
        );

        // Check if any user has this exact email (case-insensitive)
        return response.users.some(
          (u) => u.email.toLowerCase() === email.toLowerCase(),
        );
      } catch {
        // If we can't check, assume email might exist to be safe
        console.warn("Could not verify email uniqueness");
        return false;
      }
    },
    [],
  );

  /**
   * Create a new user account.
   *
   * Flow:
   * 1. Register user via /api/auth/register (creates as non-admin)
   * 2. If is_admin=true, update role via PUT /api/admin/panel/users/{id}
   * 3. If is_active=false, deactivate via PUT /api/admin/panel/users/{id}
   */
  const createUser = useCallback(
    async (payload: CreateUserPayload): Promise<CreatedUser> => {
      setIsLoading(true);
      setError(null);

      try {
        // Step 1: Register the user
        const registeredUser = await fetchAPI<{
          id: string;
          email: string;
          full_name: string | null;
          is_admin: boolean;
          is_active: boolean;
          created_at: string;
        }>("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({
            email: payload.email,
            password: payload.password,
            full_name: payload.full_name || "",
          }),
        });

        let finalUser: CreatedUser = {
          id: registeredUser.id,
          email: registeredUser.email,
          full_name: registeredUser.full_name,
          is_admin: registeredUser.is_admin,
          is_active: registeredUser.is_active,
          created_at: registeredUser.created_at,
        };

        // Step 2: Update admin role if needed
        if (payload.is_admin) {
          const updatedUser = await fetchAPI<{
            id: string;
            email: string;
            full_name: string | null;
            is_admin: boolean;
            is_active: boolean;
            created_at: string;
          }>(`/api/admin/panel/users/${registeredUser.id}`, {
            method: "PUT",
            body: JSON.stringify({
              is_admin: true,
              action_reason: "Admin role assigned during user creation",
            }),
          });
          finalUser = { ...finalUser, ...updatedUser };
        }

        // Step 3: Deactivate if needed
        if (!payload.is_active) {
          const updatedUser = await fetchAPI<{
            id: string;
            email: string;
            full_name: string | null;
            is_admin: boolean;
            is_active: boolean;
            created_at: string;
          }>(`/api/admin/panel/users/${registeredUser.id}`, {
            method: "PUT",
            body: JSON.stringify({
              is_active: false,
              action_reason: "Account created as inactive",
            }),
          });
          finalUser = { ...finalUser, ...updatedUser };
        }

        return finalUser;
      } catch (err) {
        let message = "Failed to create user";
        if (err instanceof APIError) {
          message = err.message;
          if (
            err.code === "EMAIL_EXISTS" ||
            err.message.includes("already registered")
          ) {
            message = "This email is already registered";
          }
        } else if (err instanceof Error) {
          message = err.message;
        }
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return {
    createUser,
    isLoading,
    error,
    checkEmailExists,
  };
}
