/**
 * VoiceAssist UI Component Library
 * Shared React components built with Radix UI and Tailwind CSS
 */

export { Button } from "./components/Button";
export type { ButtonProps } from "./components/Button";

export { Input } from "./components/Input";
export type { InputProps } from "./components/Input";

export { Label } from "./components/Label";

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from "./components/Card";

export { OAuthButton } from "./components/OAuthButton";
export type { OAuthButtonProps } from "./components/OAuthButton";

// New Components
export { Badge } from "./components/Badge";
export type { BadgeProps } from "./components/Badge";

export { Spinner, SpinnerOverlay } from "./components/Spinner";
export type { SpinnerProps, SpinnerOverlayProps } from "./components/Spinner";

export {
  Skeleton,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonTableRow,
} from "./components/Skeleton";
export type { SkeletonProps } from "./components/Skeleton";

export { Avatar, AvatarGroup } from "./components/Avatar";
export type { AvatarProps, AvatarGroupProps } from "./components/Avatar";

export { IconButton } from "./components/IconButton";
export type { IconButtonProps } from "./components/IconButton";

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "./components/Table";

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
} from "./components/Dialog";
export type { DialogContentProps } from "./components/Dialog";

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
} from "./components/Select";
export type { SelectTriggerProps } from "./components/Select";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
} from "./components/DropdownMenu";
export type {
  DropdownMenuProps,
  DropdownMenuTriggerProps,
  DropdownMenuContentProps,
  DropdownMenuItemProps,
  DropdownMenuCheckboxItemProps,
  DropdownMenuRadioItemProps,
  DropdownMenuLabelProps,
  DropdownMenuSeparatorProps,
} from "./components/DropdownMenu";

// Feedback Components
export { FeedbackRating } from "./components/FeedbackRating";
export type {
  FeedbackRatingProps,
  FeedbackRatingValue,
} from "./components/FeedbackRating";

export { FeedbackForm } from "./components/FeedbackForm";
export type {
  FeedbackFormProps,
  FeedbackFormData,
  FeedbackCategory,
  FeedbackSeverity,
} from "./components/FeedbackForm";

export { LocaleSwitcher } from "./components/LocaleSwitcher";
export type {
  LocaleSwitcherProps,
  LocaleOption,
} from "./components/LocaleSwitcher";

// Providers
export { ThemeProvider, useTheme } from "./providers";
export type { Theme, ResolvedTheme, ThemeContextValue } from "./providers";

// Medical Components
export {
  VitalSignCard,
  MedicationList,
  MedicationItem,
  AlertBanner,
} from "./components/medical";
export type {
  VitalSignCardProps,
  MedicationListProps,
  Medication,
  AlertBannerProps,
  AlertAction,
} from "./components/medical";

// Utilities
export { cn } from "./lib/utils";
