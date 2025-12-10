import type { ReactNode } from "react";

interface CalloutProps {
  title?: string;
  children: ReactNode;
  variant?: "info" | "warning" | "success";
}

const variantStyles: Record<NonNullable<CalloutProps["variant"]>, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-100",
  warning:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-100",
};

export function Callout({ title, children, variant = "info" }: CalloutProps) {
  return (
    <div
      className={`my-4 rounded-lg border p-4 shadow-sm backdrop-blur ${variantStyles[variant]}`}
    >
      {title && <div className="font-semibold mb-2">{title}</div>}
      <div className="space-y-2 text-sm leading-relaxed">{children}</div>
    </div>
  );
}
