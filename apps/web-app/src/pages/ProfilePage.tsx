/**
 * User Profile Page
 * Manage user profile information and settings
 */

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Button,
  Input,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Avatar,
  Badge,
} from "@voiceassist/ui";
import { extractErrorMessage } from "@voiceassist/types";
import { useAuth } from "../hooks/useAuth";

const profileSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must not exceed 100 characters"),
  email: z.string().min(1, "Email is required").email("Invalid email address"),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(1, "New password is required")
      .min(8, "Password must be at least 8 characters")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        "Password must contain at least one uppercase letter, one lowercase letter, and one number",
      ),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ProfileFormData = z.infer<typeof profileSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

export function ProfilePage() {
  const { user, updateProfile, changePassword } = useAuth();

  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    formState: { errors: profileErrors, isSubmitting: isProfileSubmitting },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name || "",
      email: user?.email || "",
    },
  });

  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    formState: { errors: passwordErrors, isSubmitting: isPasswordSubmitting },
    reset: resetPasswordForm,
  } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  });

  const onProfileSubmit = async (data: ProfileFormData) => {
    try {
      await updateProfile(data);
      alert("Profile updated successfully!");
    } catch (err: unknown) {
      console.error("Profile update failed:", err);
      alert(extractErrorMessage(err));
    }
  };

  const onPasswordSubmit = async (data: PasswordFormData) => {
    try {
      await changePassword(data.currentPassword, data.newPassword);
      alert("Password changed successfully!");
      resetPasswordForm();
    } catch (err: unknown) {
      console.error("Password change failed:", err);
      alert(extractErrorMessage(err));
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 lg:p-8 space-y-6">
        {/* Header with Avatar */}
        <div className="flex items-start space-x-6">
          <Avatar
            alt={user?.name || "User"}
            size="xl"
            className="ring-4 ring-neutral-100 dark:ring-neutral-800"
          />
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-text-primary">
              Profile Settings
            </h1>
            <p className="mt-2 text-text-secondary">
              Manage your account information and preferences
            </p>
          </div>
        </div>

        {/* Profile Information */}
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>
              Update your name and email address
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleProfileSubmit(onProfileSubmit)}
              className="space-y-4"
            >
              <Input
                id="name"
                label="Full Name"
                type="text"
                placeholder="John Doe"
                required
                error={!!profileErrors.name}
                errorMessage={profileErrors.name?.message}
                fullWidth
                {...registerProfile("name")}
              />

              <Input
                id="email"
                label="Email Address"
                type="email"
                placeholder="name@example.com"
                required
                error={!!profileErrors.email}
                errorMessage={profileErrors.email?.message}
                fullWidth
                {...registerProfile("email")}
              />

              <div className="flex justify-end pt-2">
                <Button type="submit" loading={isProfileSubmitting}>
                  Save Changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Password Change */}
        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>
              Update your password to keep your account secure
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handlePasswordSubmit(onPasswordSubmit)}
              className="space-y-4"
            >
              <Input
                id="currentPassword"
                label="Current Password"
                type="password"
                placeholder="••••••••"
                required
                error={!!passwordErrors.currentPassword}
                errorMessage={passwordErrors.currentPassword?.message}
                fullWidth
                {...registerPassword("currentPassword")}
              />

              <Input
                id="newPassword"
                label="New Password"
                type="password"
                placeholder="••••••••"
                required
                error={!!passwordErrors.newPassword}
                errorMessage={passwordErrors.newPassword?.message}
                helperText="Must be at least 8 characters with uppercase, lowercase, and number"
                fullWidth
                {...registerPassword("newPassword")}
              />

              <Input
                id="confirmPassword"
                label="Confirm New Password"
                type="password"
                placeholder="••••••••"
                required
                error={!!passwordErrors.confirmPassword}
                errorMessage={passwordErrors.confirmPassword?.message}
                fullWidth
                {...registerPassword("confirmPassword")}
              />

              <div className="flex justify-end pt-2">
                <Button type="submit" loading={isPasswordSubmitting}>
                  Change Password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Account Information */}
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>Your account details and role</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-6">
              <div className="flex items-center justify-between py-3 border-b border-neutral-200 dark:border-neutral-700">
                <dt className="text-sm font-medium text-text-secondary">
                  User ID
                </dt>
                <dd className="text-sm font-mono text-text-primary">
                  {user?.id}
                </dd>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-neutral-200 dark:border-neutral-700">
                <dt className="text-sm font-medium text-text-secondary">
                  Role
                </dt>
                <dd>
                  <Badge variant="secondary" size="md">
                    {user?.role
                      ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
                      : "User"}
                  </Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between py-3">
                <dt className="text-sm font-medium text-text-secondary">
                  Account Created
                </dt>
                <dd className="text-sm text-text-primary">
                  {user?.createdAt
                    ? new Date(user.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    : "N/A"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
