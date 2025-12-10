/**
 * PageContainer - Consistent page wrapper component
 */
import { ReactNode } from "react";

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

export function PageContainer({
  children,
  className = "",
}: PageContainerProps) {
  return (
    <div
      className={`flex-1 p-4 md:p-6 space-y-4 md:space-y-6 overflow-y-auto ${className}`}
    >
      {children}
    </div>
  );
}
