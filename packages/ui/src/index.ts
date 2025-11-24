/**
 * VoiceAssist UI Component Library
 * Shared React components built with Radix UI and Tailwind CSS
 */

export { Button } from './components/Button';
export type { ButtonProps } from './components/Button';

export { Input } from './components/Input';
export type { InputProps } from './components/Input';

export { Label } from './components/Label';

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from './components/Card';

export { OAuthButton } from './components/OAuthButton';
export type { OAuthButtonProps } from './components/OAuthButton';

// New Components
export { Badge } from './components/Badge';
export type { BadgeProps } from './components/Badge';

export { Spinner, SpinnerOverlay } from './components/Spinner';
export type { SpinnerProps, SpinnerOverlayProps } from './components/Spinner';

export {
  Skeleton,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonTableRow,
} from './components/Skeleton';
export type { SkeletonProps } from './components/Skeleton';

export { Avatar, AvatarGroup } from './components/Avatar';
export type { AvatarProps, AvatarGroupProps } from './components/Avatar';

export { IconButton } from './components/IconButton';
export type { IconButtonProps } from './components/IconButton';

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from './components/Table';

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from './components/Dialog';
export type { DialogContentProps } from './components/Dialog';

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from './components/Select';
export type { SelectTriggerProps } from './components/Select';

// Providers
export { ThemeProvider, useTheme } from './providers';
export type { Theme, ResolvedTheme, ThemeContextValue } from './providers';

// Utilities
export { cn } from './lib/utils';
