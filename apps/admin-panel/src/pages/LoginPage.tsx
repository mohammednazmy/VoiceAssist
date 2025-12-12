import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getApiClient, persistTokens, persistRole } from "../lib/apiClient";
import { isTwoFactorRequired } from "@voiceassist/api-client";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 2FA state
  const [requires2FA, setRequires2FA] = useState(false);
  const [userId, setUserId] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [isBackupCode, setIsBackupCode] = useState(false);
  const [verifying2FA, setVerifying2FA] = useState(false);

  const { login: _login } = useAuth();
  const _navigate = useNavigate();
  const apiClient = getApiClient();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await apiClient.login({ email, password });

      if (isTwoFactorRequired(result)) {
        // 2FA is required - show 2FA form
        setUserId(result.user_id);
        setRequires2FA(true);
        setLoading(false);
        return;
      }

      // Login successful without 2FA
      persistTokens(result.accessToken, result.refreshToken);
      const profile = await apiClient.getCurrentUser();
      // Map API role to admin panel role (admin panel only has admin/viewer)
      const role = profile.role === "admin" ? "admin" : "viewer";
      persistRole(role);

      // Force a page reload to re-initialize auth state
      window.location.href = "/admin/dashboard";
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
      setLoading(false);
    }
  };

  const handle2FASubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setVerifying2FA(true);

    try {
      const tokens = await apiClient.verify2FALogin(
        userId,
        twoFactorCode,
        isBackupCode,
      );

      persistTokens(tokens.accessToken, tokens.refreshToken);
      const profile = await apiClient.getCurrentUser();
      // Map API role to admin panel role (admin panel only has admin/viewer)
      const role = profile.role === "admin" ? "admin" : "viewer";
      persistRole(role);

      // Force a page reload to re-initialize auth state
      window.location.href = "/admin/dashboard";
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Verification failed";
      setError(message);
    } finally {
      setVerifying2FA(false);
    }
  };

  const handleBackToLogin = () => {
    setRequires2FA(false);
    setUserId("");
    setTwoFactorCode("");
    setIsBackupCode(false);
    setError("");
  };

  // 2FA Verification Form
  if (requires2FA) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-full max-w-md p-8 space-y-6 bg-slate-900 rounded-lg border border-slate-800">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-blue-900/30 flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-100">
              Two-Factor Authentication
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Enter the code from your authenticator app
            </p>
          </div>

          <form onSubmit={handle2FASubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-400 bg-red-950/50 border border-red-900 rounded">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="twoFactorCode"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                {isBackupCode ? "Backup Code" : "Authentication Code"}
              </label>
              <input
                id="twoFactorCode"
                type="text"
                required
                value={twoFactorCode}
                onChange={(e) =>
                  setTwoFactorCode(
                    isBackupCode
                      ? e.target.value.toUpperCase()
                      : e.target.value.replace(/\D/g, "").slice(0, 6),
                  )
                }
                className="block w-full px-3 py-3 bg-slate-800 border border-slate-700 rounded-md text-slate-100 text-center text-xl font-mono tracking-wider placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={isBackupCode ? "XXXX-XXXX" : "000000"}
                autoFocus
              />
            </div>

            <div className="flex items-center">
              <input
                id="useBackupCode"
                type="checkbox"
                checked={isBackupCode}
                onChange={(e) => {
                  setIsBackupCode(e.target.checked);
                  setTwoFactorCode("");
                }}
                className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-blue-500"
              />
              <label
                htmlFor="useBackupCode"
                className="ml-2 text-sm text-slate-400"
              >
                Use a backup code instead
              </label>
            </div>

            <button
              type="submit"
              disabled={verifying2FA}
              className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900"
            >
              {verifying2FA ? "Verifying..." : "Verify"}
            </button>

            <button
              type="button"
              onClick={handleBackToLogin}
              className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-md transition-colors"
            >
              Back to Login
            </button>
          </form>

          <div className="text-center text-xs text-slate-500">
            Lost your device? Use a backup code
          </div>
        </div>
      </div>
    );
  }

  // Standard Login Form
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="w-full max-w-md p-8 space-y-6 bg-slate-900 rounded-lg border border-slate-800">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-100">
            VoiceAssist Admin
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Sign in to access the admin panel
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-400 bg-red-950/50 border border-red-900 rounded">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-300"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-300"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="text-center text-xs text-slate-500">
          Admin access only • HIPAA compliant
        </div>
      </div>
    </div>
  );
}
