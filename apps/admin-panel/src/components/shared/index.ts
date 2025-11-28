/**
 * Shared Admin Panel Components
 * Sprint 5: Standardization & Polish
 *
 * These components provide consistent patterns across all admin pages:
 * - PageContainer: Main page wrapper with padding and scroll
 * - PageHeader: Title, description, status badge, and actions
 * - LoadingState: Skeleton loaders for various content types
 * - ErrorState: Error display with retry action
 * - EmptyState: Empty content messaging
 * - StatusBadge: Consistent status indicators
 * - StatCard: Metric display cards
 * - DataPanel: Section containers with headers
 * - TabGroup: Tab navigation pattern
 * - ConfirmDialog: Confirmation dialogs for dangerous actions
 */

export { PageContainer } from "./PageContainer";
export { PageHeader } from "./PageHeader";
export {
  LoadingState,
  LoadingGrid,
  LoadingTable,
  LoadingCards,
} from "./LoadingState";
export { ErrorState } from "./ErrorState";
export { EmptyState } from "./EmptyState";
export { StatusBadge, type StatusType } from "./StatusBadge";
export { StatCard } from "./StatCard";
export { DataPanel } from "./DataPanel";
export { TabGroup, type Tab } from "./TabGroup";
export { ConfirmDialog } from "./ConfirmDialog";
export { RefreshButton } from "./RefreshButton";
