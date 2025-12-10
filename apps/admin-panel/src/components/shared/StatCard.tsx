/**
 * StatCard - Consistent metric/stat display cards
 */
import { ReactNode } from "react";

type ColorVariant = "blue" | "green" | "purple" | "yellow" | "red" | "slate";

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: string | ReactNode;
  color?: ColorVariant;
  subtitle?: string;
  trend?: {
    value: number;
    label?: string;
    isPositiveGood?: boolean;
  };
  onClick?: () => void;
  className?: string;
}

const colorClasses: Record<ColorVariant, string> = {
  blue: "text-blue-400",
  green: "text-green-400",
  purple: "text-purple-400",
  yellow: "text-yellow-400",
  red: "text-red-400",
  slate: "text-slate-400",
};

const borderColorClasses: Record<ColorVariant, string> = {
  blue: "border-blue-800/50",
  green: "border-green-800/50",
  purple: "border-purple-800/50",
  yellow: "border-yellow-800/50",
  red: "border-red-800/50",
  slate: "border-slate-800",
};

export function StatCard({
  title,
  value,
  icon,
  color = "slate",
  subtitle,
  trend,
  onClick,
  className = "",
}: StatCardProps) {
  const valueColor = colorClasses[color];
  const borderColor = borderColorClasses[color];
  const isClickable = !!onClick;

  const formatValue = (v: string | number) => {
    if (typeof v === "number") {
      return v.toLocaleString();
    }
    return v;
  };

  const getTrendColor = (trendValue: number, isPositiveGood = true) => {
    if (trendValue === 0) return "text-slate-400";
    const isPositive = trendValue > 0;
    const isGood = isPositiveGood ? isPositive : !isPositive;
    return isGood ? "text-green-400" : "text-red-400";
  };

  const getTrendArrow = (trendValue: number) => {
    if (trendValue > 0) return "↑";
    if (trendValue < 0) return "↓";
    return "→";
  };

  const content = (
    <>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-400 truncate">
          {title}
        </span>
        {icon && (
          <span className="text-lg flex-shrink-0" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      <div className={`text-xl md:text-2xl font-bold ${valueColor} truncate`}>
        {formatValue(value)}
      </div>
      {(subtitle || trend) && (
        <div className="mt-1 flex items-center gap-2 text-xs">
          {subtitle && (
            <span className="text-slate-500 truncate">{subtitle}</span>
          )}
          {trend && (
            <span
              className={`flex items-center gap-0.5 ${getTrendColor(trend.value, trend.isPositiveGood)}`}
            >
              <span>{getTrendArrow(trend.value)}</span>
              <span>{Math.abs(trend.value)}%</span>
              {trend.label && (
                <span className="text-slate-500 ml-1">{trend.label}</span>
              )}
            </span>
          )}
        </div>
      )}
    </>
  );

  const baseClasses = `bg-slate-900/50 border ${borderColor} rounded-lg p-4 ${className}`;
  const interactiveClasses = isClickable
    ? "cursor-pointer hover:bg-slate-800/50 hover:border-slate-700 transition-colors"
    : "";

  if (isClickable) {
    return (
      <button
        onClick={onClick}
        className={`${baseClasses} ${interactiveClasses} text-left w-full`}
      >
        {content}
      </button>
    );
  }

  return <div className={baseClasses}>{content}</div>;
}
