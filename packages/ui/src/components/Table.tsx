/**
 * Table Component
 * A styled table component for displaying tabular data
 *
 * Features:
 * - Responsive design
 * - Sortable columns
 * - Hover states
 * - Striped rows option
 * - Semantic HTML with proper accessibility
 */

import * as React from "react";
import { cn } from "../lib/utils";

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
));
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn("border-b border-border-default", className)}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement> & {
    /**
     * Show striped rows
     */
    striped?: boolean;
  }
>(({ className, striped, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn(
      "[&_tr:last-child]:border-0",
      striped &&
        "[&_tr:nth-child(even)]:bg-neutral-50 dark:[&_tr:nth-child(even)]:bg-neutral-800",
      className,
    )}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t border-border-default bg-neutral-50 font-medium dark:bg-neutral-800",
      className,
    )}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement> & {
    /**
     * Show hover state
     */
    hoverable?: boolean;

    /**
     * Selected state
     */
    selected?: boolean;
  }
>(({ className, hoverable, selected, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b border-border-default transition-colors",
      hoverable &&
        "hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer",
      selected && "bg-primary-50 dark:bg-primary-900/20",
      className,
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & {
    /**
     * Make the column sortable
     */
    sortable?: boolean;

    /**
     * Current sort direction
     */
    sortDirection?: "asc" | "desc" | null;

    /**
     * Sort handler
     */
    onSort?: () => void;
  }
>(({ className, sortable, sortDirection, onSort, children, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-12 px-4 text-left align-middle font-medium text-text-secondary [&:has([role=checkbox])]:pr-0",
      sortable && "cursor-pointer select-none hover:text-text-primary",
      className,
    )}
    onClick={sortable ? onSort : undefined}
    {...props}
  >
    <div className="flex items-center gap-2">
      {children}
      {sortable && (
        <span className="inline-flex" aria-hidden="true">
          {sortDirection === "asc" ? "↑" : sortDirection === "desc" ? "↓" : "↕"}
        </span>
      )}
    </div>
  </th>
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "p-4 align-middle [&:has([role=checkbox])]:pr-0 text-text-primary",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-text-tertiary", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
