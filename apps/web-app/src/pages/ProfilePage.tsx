/**
 * User Profile Page
 * Manage user profile information and settings
 */

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Button,
  Input,
  Label,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@voiceassist/ui';
import { useAuth } from '../hooks/useAuth';

const profileSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must not exceed 100 characters'),
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email address'),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(1, 'New password is required')
      .min(8, 'Password must be at least 8 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Password must contain at least one uppercase letter, one lowercase letter, and one number'
      ),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ProfileFormData = z.infer<typeof profileSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

export function ProfilePage() {
  const { user } = useAuth();

  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    formState: { errors: profileErrors, isSubmitting: isProfileSubmitting },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name || '',
      email: user?.email || '',
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
      // TODO: Implement profile update API call
      console.log('Update profile:', data);
      alert('Profile updated successfully!');
    } catch (err) {
      console.error('Profile update failed:', err);
      alert('Failed to update profile');
    }
  };

  const onPasswordSubmit = async (data: PasswordFormData) => {
    try {
      // TODO: Implement password change API call
      console.log('Change password');
      alert('Password changed successfully!');
      resetPasswordForm();
    } catch (err) {
      console.error('Password change failed:', err);
      alert('Failed to change password');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Profile Settings</h1>
        <p className="mt-2 text-neutral-600">
          Manage your account information and preferences
        </p>
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
          <form onSubmit={handleProfileSubmit(onProfileSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" required error={!!profileErrors.name}>
                Full Name
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                error={!!profileErrors.name}
                fullWidth
                {...registerProfile('name')}
                aria-invalid={profileErrors.name ? 'true' : 'false'}
                aria-describedby={profileErrors.name ? 'name-error' : undefined}
              />
              {profileErrors.name && (
                <p id="name-error" className="text-sm text-error-600" role="alert">
                  {profileErrors.name.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" required error={!!profileErrors.email}>
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                error={!!profileErrors.email}
                fullWidth
                {...registerProfile('email')}
                aria-invalid={profileErrors.email ? 'true' : 'false'}
                aria-describedby={profileErrors.email ? 'email-error' : undefined}
              />
              {profileErrors.email && (
                <p id="email-error" className="text-sm text-error-600" role="alert">
                  {profileErrors.email.message}
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isProfileSubmitting}>
                {isProfileSubmitting ? 'Saving...' : 'Save Changes'}
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
          <form onSubmit={handlePasswordSubmit(onPasswordSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label
                htmlFor="currentPassword"
                required
                error={!!passwordErrors.currentPassword}
              >
                Current Password
              </Label>
              <Input
                id="currentPassword"
                type="password"
                placeholder="••••••••"
                error={!!passwordErrors.currentPassword}
                fullWidth
                {...registerPassword('currentPassword')}
                aria-invalid={passwordErrors.currentPassword ? 'true' : 'false'}
                aria-describedby={
                  passwordErrors.currentPassword ? 'current-password-error' : undefined
                }
              />
              {passwordErrors.currentPassword && (
                <p
                  id="current-password-error"
                  className="text-sm text-error-600"
                  role="alert"
                >
                  {passwordErrors.currentPassword.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="newPassword"
                required
                error={!!passwordErrors.newPassword}
              >
                New Password
              </Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="••••••••"
                error={!!passwordErrors.newPassword}
                fullWidth
                {...registerPassword('newPassword')}
                aria-invalid={passwordErrors.newPassword ? 'true' : 'false'}
                aria-describedby={
                  passwordErrors.newPassword ? 'new-password-error' : undefined
                }
              />
              {passwordErrors.newPassword && (
                <p
                  id="new-password-error"
                  className="text-sm text-error-600"
                  role="alert"
                >
                  {passwordErrors.newPassword.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="confirmPassword"
                required
                error={!!passwordErrors.confirmPassword}
              >
                Confirm New Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                error={!!passwordErrors.confirmPassword}
                fullWidth
                {...registerPassword('confirmPassword')}
                aria-invalid={passwordErrors.confirmPassword ? 'true' : 'false'}
                aria-describedby={
                  passwordErrors.confirmPassword ? 'confirm-password-error' : undefined
                }
              />
              {passwordErrors.confirmPassword && (
                <p
                  id="confirm-password-error"
                  className="text-sm text-error-600"
                  role="alert"
                >
                  {passwordErrors.confirmPassword.message}
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isPasswordSubmitting}>
                {isPasswordSubmitting ? 'Changing...' : 'Change Password'}
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
          <dl className="space-y-4">
            <div>
              <dt className="text-sm font-medium text-neutral-500">User ID</dt>
              <dd className="mt-1 text-sm text-neutral-900">{user?.id}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-neutral-500">Role</dt>
              <dd className="mt-1 text-sm text-neutral-900">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
                  {user?.role}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-neutral-500">Account Created</dt>
              <dd className="mt-1 text-sm text-neutral-900">
                {user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : 'N/A'}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
