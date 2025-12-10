/**
 * Two-Factor Authentication Settings Component
 *
 * Allows users to:
 * - View 2FA status
 * - Enable 2FA with QR code
 * - View and regenerate backup codes
 * - Disable 2FA
 */

import { useState } from "react";
import { use2FA } from "../../hooks/use2FA";

export function TwoFactorSettings() {
  const {
    status,
    loading,
    error,
    setupData,
    setupLoading,
    verifyLoading,
    disableLoading,
    startSetup,
    verifyAndEnable,
    disable,
    regenerateBackupCodes,
    clearSetupData,
  } = use2FA();

  // Local state
  const [verifyCode, setVerifyCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [showDisableForm, setShowDisableForm] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [regenerateCode, setRegenerateCode] = useState("");
  const [showRegenerateForm, setShowRegenerateForm] = useState(false);

  const handleStartSetup = async () => {
    await startSetup();
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await verifyAndEnable(verifyCode);
    if (success) {
      setVerifyCode("");
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await disable(disablePassword, disableCode);
    if (success) {
      setDisablePassword("");
      setDisableCode("");
      setShowDisableForm(false);
    }
  };

  const handleRegenerateBackupCodes = async (e: React.FormEvent) => {
    e.preventDefault();
    const codes = await regenerateBackupCodes(regenerateCode);
    if (codes) {
      setBackupCodes(codes);
      setShowBackupCodes(true);
      setRegenerateCode("");
      setShowRegenerateForm(false);
    }
  };

  const handleCancelSetup = () => {
    clearSetupData();
    setVerifyCode("");
  };

  if (loading) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-5 w-48 bg-slate-800 rounded mb-4" />
          <div className="h-4 w-72 bg-slate-800 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg">
      <div className="px-4 py-3 border-b border-slate-800">
        <h2 className="text-sm font-medium text-slate-200">
          Two-Factor Authentication
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Add an extra layer of security to your account
        </p>
      </div>

      <div className="p-4 space-y-4">
        {error && (
          <div className="bg-red-900/20 border border-red-800 text-red-400 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Status Display */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center ${
                status?.enabled
                  ? "bg-green-900/50 text-green-400"
                  : "bg-slate-800 text-slate-500"
              }`}
            >
              {status?.enabled ? (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-5 h-5"
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
              )}
            </div>
            <div>
              <div className="text-sm font-medium text-slate-200">
                {status?.enabled ? "2FA Enabled" : "2FA Not Enabled"}
              </div>
              {status?.enabled && status.verified_at && (
                <div className="text-xs text-slate-500">
                  Enabled on {new Date(status.verified_at).toLocaleDateString()}
                </div>
              )}
              {status?.enabled && (
                <div className="text-xs text-slate-500">
                  {status.backup_codes_remaining} backup codes remaining
                </div>
              )}
            </div>
          </div>

          {!status?.enabled && !setupData && (
            <button
              onClick={handleStartSetup}
              disabled={setupLoading}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50"
            >
              {setupLoading ? "Setting up..." : "Enable 2FA"}
            </button>
          )}

          {status?.enabled && !showDisableForm && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowRegenerateForm(true)}
                className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors"
              >
                Regenerate Codes
              </button>
              <button
                onClick={() => setShowDisableForm(true)}
                className="px-3 py-1.5 text-xs bg-red-900/50 hover:bg-red-800/50 text-red-400 border border-red-800 rounded transition-colors"
              >
                Disable 2FA
              </button>
            </div>
          )}
        </div>

        {/* Setup Flow */}
        {setupData && (
          <div className="border border-slate-700 rounded-lg p-4 space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-medium text-slate-200 mb-2">
                Scan QR Code
              </h3>
              <p className="text-sm text-slate-400 mb-4">
                Scan this QR code with your authenticator app (Google
                Authenticator, Authy, etc.)
              </p>
              <div className="inline-block p-4 bg-white rounded-lg">
                <img
                  src={setupData.qr_code}
                  alt="2FA QR Code"
                  className="w-48 h-48"
                />
              </div>
            </div>

            <div className="text-center">
              <p className="text-xs text-slate-500 mb-2">
                Or enter this code manually:
              </p>
              <code className="px-3 py-1.5 bg-slate-800 text-slate-300 text-sm rounded font-mono">
                {setupData.manual_entry_key}
              </code>
            </div>

            {/* Backup Codes */}
            <div className="bg-amber-900/20 border border-amber-800 rounded-lg p-4">
              <h4 className="text-sm font-medium text-amber-400 mb-2">
                Backup Codes
              </h4>
              <p className="text-xs text-amber-300/80 mb-3">
                Save these codes in a safe place. You can use them to access
                your account if you lose your authenticator.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {setupData.backup_codes.map((code, idx) => (
                  <code
                    key={idx}
                    className="px-2 py-1 bg-slate-800 text-slate-300 text-xs rounded font-mono text-center"
                  >
                    {code}
                  </code>
                ))}
              </div>
            </div>

            {/* Verify Code */}
            <form onSubmit={handleVerify} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Enter the 6-digit code from your authenticator app
                </label>
                <input
                  type="text"
                  value={verifyCode}
                  onChange={(e) =>
                    setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="000000"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 text-center text-lg font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500"
                  maxLength={6}
                  pattern="\d{6}"
                  required
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={verifyLoading || verifyCode.length !== 6}
                  className="flex-1 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50"
                >
                  {verifyLoading ? "Verifying..." : "Verify & Enable"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelSetup}
                  className="px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Disable Form */}
        {showDisableForm && (
          <form
            onSubmit={handleDisable}
            className="border border-red-800/50 rounded-lg p-4 space-y-4"
          >
            <h3 className="text-sm font-medium text-red-400">
              Disable Two-Factor Authentication
            </h3>
            <p className="text-xs text-slate-400">
              Enter your password and a verification code to disable 2FA.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Authenticator Code (or Backup Code)
                </label>
                <input
                  type="text"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  placeholder="000000 or XXXX-XXXX"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                  required
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={disableLoading}
                className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors disabled:opacity-50"
              >
                {disableLoading ? "Disabling..." : "Disable 2FA"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDisableForm(false);
                  setDisablePassword("");
                  setDisableCode("");
                }}
                className="px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Regenerate Backup Codes Form */}
        {showRegenerateForm && (
          <form
            onSubmit={handleRegenerateBackupCodes}
            className="border border-slate-700 rounded-lg p-4 space-y-4"
          >
            <h3 className="text-sm font-medium text-slate-200">
              Regenerate Backup Codes
            </h3>
            <p className="text-xs text-slate-400">
              This will invalidate your existing backup codes and generate new
              ones.
            </p>
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Enter your authenticator code to confirm
              </label>
              <input
                type="text"
                value={regenerateCode}
                onChange={(e) =>
                  setRegenerateCode(
                    e.target.value.replace(/\D/g, "").slice(0, 6),
                  )
                }
                placeholder="000000"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 text-center text-lg font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500"
                maxLength={6}
                required
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={regenerateCode.length !== 6}
                className="flex-1 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50"
              >
                Regenerate Codes
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRegenerateForm(false);
                  setRegenerateCode("");
                }}
                className="px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* New Backup Codes Display */}
        {showBackupCodes && backupCodes && (
          <div className="bg-green-900/20 border border-green-800 rounded-lg p-4">
            <h4 className="text-sm font-medium text-green-400 mb-2">
              New Backup Codes Generated
            </h4>
            <p className="text-xs text-green-300/80 mb-3">
              Save these codes in a safe place. Previous codes are now invalid.
            </p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {backupCodes.map((code, idx) => (
                <code
                  key={idx}
                  className="px-2 py-1 bg-slate-800 text-slate-300 text-xs rounded font-mono text-center"
                >
                  {code}
                </code>
              ))}
            </div>
            <button
              onClick={() => {
                setShowBackupCodes(false);
                setBackupCodes(null);
              }}
              className="w-full px-3 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
