/**
 * BranchTree Component
 *
 * Displays a hierarchical visualization of conversation branches.
 * Shows branch names, message counts, and allows switching between branches.
 */

import { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  MessageSquare,
} from "lucide-react";
import type { Branch } from "@voiceassist/types";

// ============================================================================
// Types
// ============================================================================

export interface BranchTreeProps {
  /** List of branches in the conversation */
  branches: Branch[];
  /** Currently active branch ID */
  currentBranchId: string;
  /** Callback when a branch is selected */
  onSelectBranch: (branchId: string) => void;
  /** Callback when compare mode is activated */
  onCompareBranches?: (branchIds: [string, string]) => void;
  /** Whether the tree is loading */
  isLoading?: boolean;
  /** Whether to show compare functionality */
  showCompare?: boolean;
  /** Custom class name */
  className?: string;
}

interface BranchNode {
  branch: Branch;
  children: BranchNode[];
  depth: number;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a tree structure from flat branches list
 */
function buildBranchTree(branches: Branch[]): BranchNode[] {
  const nodeMap = new Map<string, BranchNode>();
  const roots: BranchNode[] = [];

  // Create nodes for all branches
  for (const branch of branches) {
    nodeMap.set(branch.branchId, {
      branch,
      children: [],
      depth: 0,
    });
  }

  // Build tree structure
  for (const branch of branches) {
    const node = nodeMap.get(branch.branchId)!;

    if (branch.branchId === "main" || !branch.parentMessageId) {
      // Root node
      roots.push(node);
    } else {
      // Find parent - branches fork from messages, so we need to find which branch
      // contains the parent message. For now, assume main is the parent if no explicit parent.
      const mainNode = nodeMap.get("main");
      if (mainNode) {
        mainNode.children.push(node);
        node.depth = 1;
      } else {
        roots.push(node);
      }
    }
  }

  // Sort by creation date
  const sortNodes = (nodes: BranchNode[]) => {
    nodes.sort(
      (a, b) =>
        new Date(a.branch.createdAt).getTime() -
        new Date(b.branch.createdAt).getTime(),
    );
    for (const node of nodes) {
      sortNodes(node.children);
    }
  };
  sortNodes(roots);

  return roots;
}

/**
 * Format timestamp to relative time
 */
function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// ============================================================================
// Sub-components
// ============================================================================

interface BranchNodeItemProps {
  node: BranchNode;
  currentBranchId: string;
  selectedForCompare: Set<string>;
  onSelect: (branchId: string) => void;
  onToggleCompare: (branchId: string) => void;
  showCompare: boolean;
}

function BranchNodeItem({
  node,
  currentBranchId,
  selectedForCompare,
  onSelect,
  onToggleCompare,
  showCompare,
}: BranchNodeItemProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const { branch, children, depth } = node;
  const isActive = branch.branchId === currentBranchId;
  const isMainBranch = branch.branchId === "main";
  const hasChildren = children.length > 0;
  const isSelectedForCompare = selectedForCompare.has(branch.branchId);

  return (
    <div className="branch-node">
      <div
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer
          transition-colors duration-150
          ${isActive ? "bg-primary-100 dark:bg-primary-900/30 border-l-2 border-primary-500" : "hover:bg-gray-100 dark:hover:bg-gray-800"}
          ${depth > 0 ? "ml-" + depth * 4 : ""}
        `}
        onClick={() => onSelect(branch.branchId)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onSelect(branch.branchId)}
        aria-selected={isActive}
        aria-label={`Branch: ${isMainBranch ? "Main" : branch.branchId}`}
      >
        {/* Expand/collapse for branches with children */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            )}
          </button>
        ) : (
          <span className="w-5" /> // Spacer
        )}

        {/* Branch icon */}
        <GitBranch
          className={`w-4 h-4 ${isMainBranch ? "text-green-500" : "text-blue-500"}`}
        />

        {/* Branch name */}
        <span
          className={`
            flex-1 text-sm font-medium truncate
            ${isActive ? "text-primary-700 dark:text-primary-300" : "text-gray-700 dark:text-gray-300"}
          `}
        >
          {isMainBranch ? "Main" : branch.branchId}
        </span>

        {/* Message count */}
        <span
          className="flex items-center gap-1 text-xs text-gray-500"
          title={`${branch.messageCount} messages`}
        >
          <MessageSquare className="w-3 h-3" />
          {branch.messageCount}
        </span>

        {/* Last activity */}
        <span className="text-xs text-gray-400" title={branch.lastActivity}>
          {formatRelativeTime(branch.lastActivity)}
        </span>

        {/* Compare checkbox */}
        {showCompare && (
          <input
            type="checkbox"
            checked={isSelectedForCompare}
            onChange={(e) => {
              e.stopPropagation();
              onToggleCompare(branch.branchId);
            }}
            className="w-4 h-4 rounded border-gray-300"
            title="Select for comparison"
            aria-label={`Compare ${isMainBranch ? "Main" : branch.branchId}`}
          />
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="branch-children">
          {children.map((child) => (
            <BranchNodeItem
              key={child.branch.branchId}
              node={child}
              currentBranchId={currentBranchId}
              selectedForCompare={selectedForCompare}
              onSelect={onSelect}
              onToggleCompare={onToggleCompare}
              showCompare={showCompare}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function BranchTree({
  branches,
  currentBranchId,
  onSelectBranch,
  onCompareBranches,
  isLoading = false,
  showCompare = false,
  className = "",
}: BranchTreeProps) {
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(
    new Set(),
  );

  // Build tree structure
  const treeNodes = useMemo(() => buildBranchTree(branches), [branches]);

  // Handle compare toggle
  const handleToggleCompare = (branchId: string) => {
    setSelectedForCompare((prev) => {
      const next = new Set(prev);
      if (next.has(branchId)) {
        next.delete(branchId);
      } else {
        // Limit to 2 selections
        if (next.size >= 2) {
          const firstValue = next.values().next().value;
          if (firstValue !== undefined) {
            next.delete(firstValue);
          }
        }
        next.add(branchId);
      }
      return next;
    });
  };

  // Handle compare action
  const handleCompare = () => {
    if (selectedForCompare.size === 2 && onCompareBranches) {
      const [first, second] = Array.from(selectedForCompare);
      onCompareBranches([first, second]);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={`branch-tree ${className}`}>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500" />
          <span className="ml-2 text-sm text-gray-500">
            Loading branches...
          </span>
        </div>
      </div>
    );
  }

  // Empty state
  if (branches.length === 0) {
    return (
      <div className={`branch-tree ${className}`}>
        <div className="text-center py-8 text-gray-500">
          <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No branches yet</p>
          <p className="text-xs">
            Branch from any message to explore alternatives
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`branch-tree ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Branches
        </h3>
        <span className="text-xs text-gray-500">{branches.length} total</span>
      </div>

      {/* Tree */}
      <div className="py-2">
        {treeNodes.map((node) => (
          <BranchNodeItem
            key={node.branch.branchId}
            node={node}
            currentBranchId={currentBranchId}
            selectedForCompare={selectedForCompare}
            onSelect={onSelectBranch}
            onToggleCompare={handleToggleCompare}
            showCompare={showCompare}
          />
        ))}
      </div>

      {/* Compare button */}
      {showCompare && selectedForCompare.size === 2 && (
        <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleCompare}
            className="w-full py-2 px-4 bg-primary-500 text-white rounded-lg
                       hover:bg-primary-600 transition-colors text-sm font-medium"
          >
            Compare Selected Branches
          </button>
        </div>
      )}
    </div>
  );
}

export default BranchTree;
