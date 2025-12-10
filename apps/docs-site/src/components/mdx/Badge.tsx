import type { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "info";
}

const toneStyles: Record<NonNullable<BadgeProps["tone"]>, string> = {
  neutral: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100",
  success:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  warning:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
};

export function Badge({ children, tone = "neutral" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${toneStyles[tone]}`}
    >
      {children}
    </span>
  );
}
