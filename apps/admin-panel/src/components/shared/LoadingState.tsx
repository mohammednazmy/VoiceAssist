/**
 * LoadingState - Consistent loading skeletons for various content types
 */
import { ReactNode } from "react";

interface LoadingStateProps {
  children?: ReactNode;
  className?: string;
}

// Base skeleton pulse animation
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-slate-800 rounded animate-pulse ${className}`} />;
}

// Generic loading container
export function LoadingState({ children, className = "" }: LoadingStateProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      {children || (
        <>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-4 w-full max-w-sm" />
        </>
      )}
    </div>
  );
}

// Grid of loading cards (for metrics/stats)
interface LoadingGridProps {
  count?: number;
  cols?: 1 | 2 | 3 | 4 | 5;
  cardHeight?: string;
}

export function LoadingGrid({
  count = 4,
  cols = 4,
  cardHeight = "h-24",
}: LoadingGridProps) {
  const gridCols = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 md:grid-cols-4",
    5: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
  };

  return (
    <div className={`grid ${gridCols[cols]} gap-4`}>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className={`bg-slate-900/50 border border-slate-800 rounded-lg p-4 animate-pulse ${cardHeight}`}
        >
          <Skeleton className="h-3 w-20 mb-3" />
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

// Loading table rows
interface LoadingTableProps {
  rows?: number;
  cols?: number;
}

export function LoadingTable({ rows = 5, cols = 5 }: LoadingTableProps) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
      <div className="bg-slate-800/50 px-4 py-3">
        <div className="flex gap-4">
          {Array.from({ length: cols }).map((_, idx) => (
            <Skeleton key={idx} className="h-4 w-20" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-slate-800">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={rowIdx} className="px-4 py-3 flex gap-4 animate-pulse">
            {Array.from({ length: cols }).map((__, colIdx) => (
              <Skeleton key={colIdx} className="h-4 flex-1 max-w-[140px]" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Loading cards in a list/grid
interface LoadingCardsProps {
  count?: number;
  className?: string;
}

export function LoadingCards({ count = 3, className = "" }: LoadingCardsProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 animate-pulse"
        >
          <div className="flex items-start justify-between">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-8 w-20 rounded" />
            <Skeleton className="h-8 w-16 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
