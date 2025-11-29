import { useState, useEffect, useCallback, FormEvent } from "react";
import {
  useCreateUser,
  CreateUserPayload,
  InviteUserPayload,
} from "../../hooks/useCreateUser";
import { RoleSelector } from "./RoleSelector";

interface CreateUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface PasswordStrength {
  score: number; // 0-4
  label: string;
  color: string;
  checks: {
    length: boolean;
    uppercase: boolean;
    lowercase: boolean;
    number: boolean;
    special: boolean;
  };
}

function calculatePasswordStrength(password: string): PasswordStrength {
  const checks = {
    length: password.length >= 12,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };

  const passedChecks = Object.values(checks).filter(Boolean).length;

  if (password.length === 0) {
    return { score: 0, label: "", color: "", checks };
  }
  if (password.length < 8) {
    return { score: 1, label: "Too short", color: "bg-red-500", checks };
  }
  if (passedChecks <= 2) {
    return { score: 1, label: "Weak", color: "bg-red-500", checks };
  }
  if (passedChecks === 3) {
    return { score: 2, label: "Fair", color: "bg-yellow-500", checks };
  }
  if (passedChecks === 4) {
    return { score: 3, label: "Good", color: "bg-blue-500", checks };
  }
  return { score: 4, label: "Strong", color: "bg-green-500", checks };
}

export function CreateUserDialog({
  isOpen,
  onClose,
  onSuccess,
}: CreateUserDialogProps) {
  const {
    createUser,
    inviteUser,
    isLoading,
    error: hookError,
    checkEmailExists,
  } = useCreateUser();

  // Form state
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [adminRole, setAdminRole] = useState<"user" | "admin" | "viewer">(
    "user",
  );
  const [isActive, setIsActive] = useState(true);
  const [passwordMethod, setPasswordMethod] = useState<"manual" | "invitation">(
    "manual",
  );

  // Validation state
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Password strength
  const passwordStrength = calculatePasswordStrength(password);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setEmail("");
      setFullName("");
      setPassword("");
      setShowPassword(false);
      setAdminRole("user");
      setIsActive(true);
      setPasswordMethod("manual");
      setEmailError(null);
      setFormError(null);
      setSuccessMessage(null);
    }
  }, [isOpen]);

  // Debounced email validation
  useEffect(() => {
    if (!email) {
      setEmailError(null);
      return;
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError("Please enter a valid email address");
      return;
    }

    // Check uniqueness after debounce
    const timeoutId = setTimeout(async () => {
      setIsCheckingEmail(true);
      try {
        const exists = await checkEmailExists(email);
        if (exists) {
          setEmailError("This email is already registered");
        } else {
          setEmailError(null);
        }
      } finally {
        setIsCheckingEmail(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [email, checkEmailExists]);

  // Check if form is valid
  const isFormValid = useCallback(() => {
    if (!email || emailError || isCheckingEmail) return false;
    if (passwordMethod === "manual") {
      if (!password || passwordStrength.score < 3) return false;
    }
    // Invitation method just needs valid email
    return true;
  }, [
    email,
    emailError,
    isCheckingEmail,
    passwordMethod,
    password,
    passwordStrength.score,
  ]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    if (!isFormValid()) {
      setFormError("Please fix the errors above");
      return;
    }

    try {
      if (passwordMethod === "invitation") {
        // Use invitation flow
        const payload: InviteUserPayload = {
          email,
          full_name: fullName || undefined,
          admin_role: adminRole,
        };

        const result = await inviteUser(payload);
        if (result.invitation_sent) {
          setSuccessMessage(`Invitation sent to ${email}!`);
        } else {
          setSuccessMessage(
            `User ${email} created. Invitation email could not be sent.`,
          );
        }
      } else {
        // Use manual password flow
        const payload: CreateUserPayload = {
          email,
          full_name: fullName,
          password,
          admin_role: adminRole,
          is_active: isActive,
        };

        await createUser(payload);
        setSuccessMessage(`User ${email} created successfully!`);
      }

      // Close after brief delay to show success
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    } catch (err) {
      // Error is already set in the hook
      setFormError(
        hookError ||
          (err instanceof Error ? err.message : "Failed to create user"),
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 className="text-lg font-bold text-slate-100">Create New User</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
            aria-label="Close"
          >
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-5">
          {/* Success Message */}
          {successMessage && (
            <div className="p-3 bg-green-900/50 border border-green-800 rounded-md text-green-300 text-sm">
              {successMessage}
            </div>
          )}

          {/* Form Error */}
          {(formError || hookError) && !successMessage && (
            <div className="p-3 bg-red-950/50 border border-red-900 rounded-md text-red-400 text-sm">
              {formError || hookError}
            </div>
          )}

          {/* Email Field */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
              Email Address <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className={`w-full px-3 py-2 bg-slate-800 border rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  emailError ? "border-red-500" : "border-slate-700"
                }`}
                disabled={isLoading}
              />
              {isCheckingEmail && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {!isCheckingEmail && email && !emailError && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-400">
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
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              )}
            </div>
            {emailError && (
              <p className="mt-1 text-xs text-red-400">{emailError}</p>
            )}
          </div>

          {/* Full Name Field */}
          <div>
            <label
              htmlFor="fullName"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Smith"
              maxLength={100}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            />
          </div>

          {/* Role Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Role
            </label>
            <RoleSelector
              value={adminRole}
              onChange={setAdminRole}
              disabled={isLoading}
            />
          </div>

          {/* Active Status - only show for manual password method */}
          {passwordMethod === "manual" && (
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="sr-only"
                    disabled={isLoading}
                  />
                  <div
                    className={`w-10 h-6 rounded-full transition-colors ${
                      isActive ? "bg-blue-600" : "bg-slate-700"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${
                        isActive ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </div>
                </div>
                <span className="text-sm font-medium text-slate-300">
                  Account Active
                </span>
              </label>
            </div>
          )}

          {/* Password Method */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Password Setup
            </label>
            <div className="space-y-2">
              <label
                className={`flex items-start gap-3 p-3 bg-slate-800/50 border rounded-md cursor-pointer hover:bg-slate-800 transition-colors ${
                  passwordMethod === "invitation"
                    ? "border-blue-500 bg-blue-950/30"
                    : "border-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="passwordMethod"
                  checked={passwordMethod === "invitation"}
                  onChange={() => setPasswordMethod("invitation")}
                  className="mt-0.5"
                  disabled={isLoading}
                />
                <div>
                  <div className="text-sm font-medium text-slate-200">
                    Send invitation email
                  </div>
                  <div className="text-xs text-slate-400">
                    User will receive an email to set their own password
                  </div>
                </div>
              </label>
              <label
                className={`flex items-start gap-3 p-3 bg-slate-800/50 border rounded-md cursor-pointer hover:bg-slate-800 transition-colors ${
                  passwordMethod === "manual"
                    ? "border-blue-500 bg-blue-950/30"
                    : "border-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="passwordMethod"
                  checked={passwordMethod === "manual"}
                  onChange={() => setPasswordMethod("manual")}
                  className="mt-0.5"
                  disabled={isLoading}
                />
                <div>
                  <div className="text-sm font-medium text-slate-200">
                    Set temporary password
                  </div>
                  <div className="text-xs text-slate-400">
                    Share the password securely with the user
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Password Field (only if manual) */}
          {passwordMethod === "manual" && (
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-300 mb-1.5"
              >
                Temporary Password <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 12 characters"
                  className="w-full px-3 py-2 pr-10 bg-slate-800 border border-slate-700 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? (
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
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                      />
                    </svg>
                  ) : (
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
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              </div>

              {/* Password Strength Meter */}
              {password && (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${passwordStrength.color}`}
                        style={{
                          width: `${(passwordStrength.score / 4) * 100}%`,
                        }}
                      />
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        passwordStrength.score >= 3
                          ? "text-green-400"
                          : passwordStrength.score >= 2
                            ? "text-yellow-400"
                            : "text-red-400"
                      }`}
                    >
                      {passwordStrength.label}
                    </span>
                  </div>

                  {/* Requirements Checklist */}
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <div
                      className={
                        passwordStrength.checks.length
                          ? "text-green-400"
                          : "text-slate-500"
                      }
                    >
                      {passwordStrength.checks.length ? "✓" : "○"} 12+
                      characters
                    </div>
                    <div
                      className={
                        passwordStrength.checks.uppercase
                          ? "text-green-400"
                          : "text-slate-500"
                      }
                    >
                      {passwordStrength.checks.uppercase ? "✓" : "○"} Uppercase
                      letter
                    </div>
                    <div
                      className={
                        passwordStrength.checks.lowercase
                          ? "text-green-400"
                          : "text-slate-500"
                      }
                    >
                      {passwordStrength.checks.lowercase ? "✓" : "○"} Lowercase
                      letter
                    </div>
                    <div
                      className={
                        passwordStrength.checks.number
                          ? "text-green-400"
                          : "text-slate-500"
                      }
                    >
                      {passwordStrength.checks.number ? "✓" : "○"} Number
                    </div>
                    <div
                      className={
                        passwordStrength.checks.special
                          ? "text-green-400"
                          : "text-slate-500"
                      }
                    >
                      {passwordStrength.checks.special ? "✓" : "○"} Special
                      character
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md text-sm transition-colors"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isFormValid() || isLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-950 disabled:text-slate-400 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2"
            >
              {isLoading && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {passwordMethod === "invitation"
                ? "Send Invitation"
                : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
