/**
 * RoleBadge Component
 *
 * A styled badge for displaying user roles with appropriate colors.
 * - Admin: Purple
 * - Viewer: Blue
 * - User: Slate (default)
 */

interface RoleBadgeProps {
  role: "user" | "admin" | "viewer";
  size?: "sm" | "md";
}

const ROLE_STYLES: Record<
  "user" | "admin" | "viewer",
  { bg: string; text: string; label: string }
> = {
  admin: {
    bg: "bg-purple-900/50",
    text: "text-purple-400",
    label: "Admin",
  },
  viewer: {
    bg: "bg-blue-900/50",
    text: "text-blue-400",
    label: "Viewer",
  },
  user: {
    bg: "bg-slate-800",
    text: "text-slate-400",
    label: "User",
  },
};

export function RoleBadge({ role, size = "sm" }: RoleBadgeProps) {
  const styles = ROLE_STYLES[role] || ROLE_STYLES.user;

  const sizeClasses =
    size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full ${styles.bg} ${styles.text} ${sizeClasses}`}
    >
      {styles.label}
    </span>
  );
}

export default RoleBadge;
