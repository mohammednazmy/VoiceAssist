/**
 * Hook for managing Two-Factor Authentication (2FA)
 */

import { useState, useCallback, useEffect } from "react";
import { getApiClient } from "../lib/apiClient";

interface TwoFactorStatus {
  enabled: boolean;
  verified_at: string | null;
  backup_codes_remaining: number;
}

interface TwoFactorSetupData {
  qr_code: string;
  manual_entry_key: string;
  backup_codes: string[];
}

interface Use2FAResult {
  status: TwoFactorStatus | null;
  loading: boolean;
  error: string | null;
  setupData: TwoFactorSetupData | null;
  setupLoading: boolean;
  verifyLoading: boolean;
  disableLoading: boolean;
  refreshStatus: () => Promise<void>;
  startSetup: () => Promise<TwoFactorSetupData | null>;
  verifyAndEnable: (code: string) => Promise<boolean>;
  disable: (password: string, code: string) => Promise<boolean>;
  regenerateBackupCodes: (code: string) => Promise<string[] | null>;
  clearSetupData: () => void;
}

export function use2FA(): Use2FAResult {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupData, setSetupData] = useState<TwoFactorSetupData | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [disableLoading, setDisableLoading] = useState(false);

  const apiClient = getApiClient();

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.request<TwoFactorStatus>({
        method: "GET",
        url: "/api/auth/2fa/status",
      });
      setStatus(response);
    } catch (err) {
      console.error("Failed to get 2FA status:", err);
      setError("Failed to load 2FA status");
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  const startSetup =
    useCallback(async (): Promise<TwoFactorSetupData | null> => {
      setSetupLoading(true);
      setError(null);
      try {
        const response = await apiClient.request<TwoFactorSetupData>({
          method: "POST",
          url: "/api/auth/2fa/setup",
        });
        setSetupData(response);
        return response;
      } catch (err: any) {
        const message =
          err?.response?.data?.detail || "Failed to start 2FA setup";
        setError(message);
        return null;
      } finally {
        setSetupLoading(false);
      }
    }, [apiClient]);

  const verifyAndEnable = useCallback(
    async (code: string): Promise<boolean> => {
      setVerifyLoading(true);
      setError(null);
      try {
        await apiClient.request({
          method: "POST",
          url: "/api/auth/2fa/verify",
          data: { code },
        });
        // Refresh status after enabling
        await refreshStatus();
        setSetupData(null);
        return true;
      } catch (err: any) {
        const message =
          err?.response?.data?.detail || "Invalid verification code";
        setError(message);
        return false;
      } finally {
        setVerifyLoading(false);
      }
    },
    [apiClient, refreshStatus],
  );

  const disable = useCallback(
    async (password: string, code: string): Promise<boolean> => {
      setDisableLoading(true);
      setError(null);
      try {
        await apiClient.request({
          method: "POST",
          url: "/api/auth/2fa/disable",
          data: { password, code },
        });
        // Refresh status after disabling
        await refreshStatus();
        return true;
      } catch (err: any) {
        const message = err?.response?.data?.detail || "Failed to disable 2FA";
        setError(message);
        return false;
      } finally {
        setDisableLoading(false);
      }
    },
    [apiClient, refreshStatus],
  );

  const regenerateBackupCodes = useCallback(
    async (code: string): Promise<string[] | null> => {
      setError(null);
      try {
        const response = await apiClient.request<{ backup_codes: string[] }>({
          method: "POST",
          url: "/api/auth/2fa/backup-codes",
          data: { code },
        });
        // Refresh status to update backup_codes_remaining
        await refreshStatus();
        return response.backup_codes;
      } catch (err: any) {
        const message =
          err?.response?.data?.detail || "Failed to regenerate backup codes";
        setError(message);
        return null;
      }
    },
    [apiClient, refreshStatus],
  );

  const clearSetupData = useCallback(() => {
    setSetupData(null);
  }, []);

  // Load status on mount
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  return {
    status,
    loading,
    error,
    setupData,
    setupLoading,
    verifyLoading,
    disableLoading,
    refreshStatus,
    startSetup,
    verifyAndEnable,
    disable,
    regenerateBackupCodes,
    clearSetupData,
  };
}
