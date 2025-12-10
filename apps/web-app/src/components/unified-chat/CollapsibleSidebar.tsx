/**
 * Collapsible Sidebar
 *
 * Sidebar for the unified interface with conversation list,
 * pinned conversations, and search.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Star,
  Mic,
  Keyboard,
  Loader2,
  AlertCircle,
  Archive,
  Trash2,
  X,
} from "lucide-react";
import { useConversations } from "../../hooks/useConversations";
import { useToastContext } from "../../contexts/ToastContext";
import { useIsMobile } from "../../hooks/useIsMobile";
import { DeleteAllConfirmDialog } from "../sidebar/DeleteAllConfirmDialog";
import type { Conversation } from "@voiceassist/types";

// ============================================================================
// Types
// ============================================================================

interface CollapsibleSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  conversationId: string | null;
  onNewConversation?: () => void;
}

// Local storage key for pinned conversations
const PINNED_CONVERSATIONS_KEY = "voiceassist_pinned_conversations";

// ============================================================================
// Component
// ============================================================================

export function CollapsibleSidebar({
  isOpen,
  onToggle,
  conversationId,
  onNewConversation,
}: CollapsibleSidebarProps) {
  const navigate = useNavigate();
  const toast = useToastContext();
  const listRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Use conversations hook
  const {
    conversations = [],
    allConversations: rawAllConversations,
    isLoading = false,
    isLoadingMore = false,
    error = null,
    searchQuery = "",
    setSearchQuery = () => {},
    hasMore = false,
    loadMore = () => Promise.resolve(),
    deleteConversation = () => {},
    deleteAllConversations = async () => ({ deleted_count: 0 }),
    archiveConversation = () => {},
    reload = () => Promise.resolve(),
  } = useConversations({
    onError: (message, description) => toast.error(message, description),
  });
  const allConversations = rawAllConversations ?? conversations;

  // Delete All state
  const [isDeleteAllDialogOpen, setIsDeleteAllDialogOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // Load pinned conversations from localStorage
  const getPinnedIds = useCallback((): Set<string> => {
    try {
      const stored = localStorage.getItem(PINNED_CONVERSATIONS_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  }, []);

  const pinnedIds = getPinnedIds();

  // Toggle pin status
  const togglePin = useCallback(
    (id: string) => {
      const pinned = getPinnedIds();
      if (pinned.has(id)) {
        pinned.delete(id);
      } else {
        pinned.add(id);
      }
      localStorage.setItem(
        PINNED_CONVERSATIONS_KEY,
        JSON.stringify([...pinned]),
      );
      // Force re-render by touching state would be needed here if using useState
    },
    [getPinnedIds],
  );

  // Split conversations into pinned and recent
  const pinnedConversations = conversations.filter((c) => pinnedIds.has(c.id));
  const recentConversations = conversations.filter((c) => !pinnedIds.has(c.id));

  // Handle infinite scroll
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = list;
      // Load more when scrolled to bottom (with 100px threshold)
      if (
        scrollHeight - scrollTop - clientHeight < 100 &&
        hasMore &&
        !isLoadingMore
      ) {
        loadMore();
      }
    };

    list.addEventListener("scroll", handleScroll);
    return () => list.removeEventListener("scroll", handleScroll);
  }, [hasMore, isLoadingMore, loadMore]);

  // Handle new conversation
  const handleNewConversation = () => {
    if (onNewConversation) {
      onNewConversation();
    } else {
      navigate("/chat");
    }
  };

  // Handle delete conversation
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this conversation?")) {
      try {
        await deleteConversation(id);
        toast.success("Conversation deleted");

        // Navigate away if current conversation was deleted
        if (id === conversationId) {
          // Find another conversation to navigate to (avoid auto-creating new one)
          const remainingConversations = conversations.filter(
            (c) => c.id !== id,
          );
          if (remainingConversations.length > 0) {
            // Navigate to the most recent remaining conversation
            navigate(`/chat/${remainingConversations[0].id}`);
          } else {
            // No conversations left, go to empty chat
            navigate("/chat");
          }
        } else {
          // Only reload if staying on current page (no remount will happen)
          await reload();
        }
      } catch {
        // Error handled by hook
      }
    }
  };

  // Handle archive conversation
  const handleArchive = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await archiveConversation(id);
      toast.success("Conversation archived");
    } catch {
      // Error handled by hook
    }
  };

  // Handle delete all conversations
  const handleDeleteAll = async () => {
    setIsDeletingAll(true);
    try {
      const result = await deleteAllConversations();
      setIsDeleteAllDialogOpen(false);
      toast.success(
        `Deleted ${result.deleted_count} conversation${result.deleted_count !== 1 ? "s" : ""}`,
      );
      // Force reload to ensure fresh data from backend
      await reload();
      // Navigate to new chat if we were viewing a conversation
      if (conversationId) {
        navigate("/chat");
      }
    } catch {
      // Error handled by hook
    } finally {
      setIsDeletingAll(false);
    }
  };

  // Handle navigation with auto-close on mobile
  const handleNavigate = useCallback(
    (path: string) => {
      navigate(path);
      if (isMobile) {
        onToggle(); // Close sidebar after navigation on mobile
      }
    },
    [navigate, isMobile, onToggle],
  );

  // Collapsed state - hidden on mobile when closed
  if (!isOpen) {
    // On mobile, don't render anything when closed
    if (isMobile) {
      return null;
    }
    // On desktop, show collapsed sidebar
    return (
      <div className="w-12 border-r border-neutral-200 bg-white flex flex-col items-center py-4">
        <button
          onClick={onToggle}
          className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
          aria-label="Open sidebar"
        >
          <PanelLeftOpen className="w-5 h-5 text-neutral-600" />
        </button>
        <button
          onClick={handleNewConversation}
          className="mt-4 p-2 hover:bg-neutral-100 rounded-lg transition-colors"
          aria-label="New conversation"
        >
          <Plus className="w-5 h-5 text-neutral-600" />
        </button>
      </div>
    );
  }

  // Sidebar content component
  const sidebarContent = (
    <nav
      className={`${isMobile ? "w-80 max-w-[85vw]" : "w-64"} h-full border-r border-neutral-200 bg-white flex flex-col`}
      aria-label="Conversation history"
      data-testid="collapsible-sidebar"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
        <h2 className="font-semibold text-neutral-900">Conversations</h2>
        <button
          onClick={onToggle}
          className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors"
          aria-label="Close sidebar"
          data-testid="sidebar-toggle"
        >
          {isMobile ? (
            <X className="w-5 h-5 text-neutral-500" />
          ) : (
            <PanelLeftClose className="w-5 h-5 text-neutral-500" />
          )}
        </button>
      </div>

      {/* New Conversation Button */}
      <div className="px-3 py-2">
        <button
          onClick={handleNewConversation}
          className="w-full flex items-center gap-2 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          data-testid="new-chat-button"
        >
          <Plus className="w-4 h-4" />
          <span>New Conversation</span>
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            data-testid="conversation-search"
          />
        </div>
      </div>

      {/* Conversation List */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto"
        data-testid="conversation-list"
      >
        {/* Loading State */}
        {isLoading && conversations.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
          </div>
        )}

        {/* Error State */}
        {error && conversations.length === 0 && (
          <div className="px-4 py-8 text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Pinned Section */}
        {pinnedConversations.length > 0 && (
          <div className="px-3 py-2">
            <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">
              Pinned
            </h3>
            <ul className="space-y-1">
              {pinnedConversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === conversationId}
                  isPinned={true}
                  onClick={() => handleNavigate(`/chat/${conv.id}`)}
                  onPin={() => togglePin(conv.id)}
                  onDelete={(e) => handleDelete(conv.id, e)}
                  onArchive={(e) => handleArchive(conv.id, e)}
                />
              ))}
            </ul>
          </div>
        )}

        {/* Recent Section */}
        {recentConversations.length > 0 && (
          <div className="px-3 py-2">
            <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">
              Recent
            </h3>
            <ul className="space-y-1">
              {recentConversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === conversationId}
                  isPinned={false}
                  onClick={() => handleNavigate(`/chat/${conv.id}`)}
                  onPin={() => togglePin(conv.id)}
                  onDelete={(e) => handleDelete(conv.id, e)}
                  onArchive={(e) => handleArchive(conv.id, e)}
                />
              ))}
            </ul>
          </div>
        )}

        {/* Loading More Indicator */}
        {isLoadingMore && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 text-neutral-400 animate-spin" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && conversations.length === 0 && !error && (
          <div className="px-4 py-8 text-center text-neutral-500">
            {searchQuery ? (
              <>
                <Search className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
                <p className="text-sm">No conversations found</p>
                <p className="text-xs mt-1">Try a different search term</p>
              </>
            ) : (
              <>
                <p className="text-sm">No conversations yet</p>
                <p className="text-xs mt-1">
                  Start a new conversation to get started
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Delete All Button - Footer */}
      {allConversations.length > 0 && (
        <div className="px-3 py-3 border-t border-neutral-200">
          <button
            onClick={() => setIsDeleteAllDialogOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm
                       text-red-600 hover:text-red-700 hover:bg-red-50
                       rounded-lg transition-colors"
            data-testid="delete-all-button"
          >
            <Trash2 className="w-4 h-4" />
            Delete All Conversations
          </button>
        </div>
      )}
    </nav>
  );

  // Delete All Confirmation Dialog (rendered in both mobile and desktop)
  const deleteAllDialog = (
    <DeleteAllConfirmDialog
      isOpen={isDeleteAllDialogOpen}
      conversationCount={allConversations.length}
      onConfirm={handleDeleteAll}
      onCancel={() => setIsDeleteAllDialogOpen(false)}
      isDeleting={isDeletingAll}
    />
  );

  // On mobile, wrap with overlay backdrop
  if (isMobile) {
    return (
      <>
        <div className="fixed inset-0 z-40 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 transition-opacity duration-200"
            onClick={onToggle}
            aria-hidden="true"
          />
          {/* Sidebar - slide in from left */}
          <div className="relative z-50 h-full shadow-xl">{sidebarContent}</div>
        </div>
        {deleteAllDialog}
      </>
    );
  }

  // Desktop: render inline
  return (
    <>
      {sidebarContent}
      {deleteAllDialog}
    </>
  );
}

// ============================================================================
// Conversation Item
// ============================================================================

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  isPinned: boolean;
  onClick: () => void;
  onPin: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onArchive: (e: React.MouseEvent) => void;
}

function ConversationItem({
  conversation,
  isActive,
  isPinned,
  onClick,
  onPin,
  onDelete,
  onArchive,
}: ConversationItemProps) {
  // Determine mode from conversation metadata
  // Check if conversation has voice-related metadata
  const hasVoiceMessages =
    (conversation as any).metadata?.hasVoiceMessages === true;

  const handleClick = () => {
    onClick();
  };

  return (
    <li className="group relative">
      {/* Main clickable area */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
          isActive
            ? "bg-primary-100 text-primary-900"
            : "hover:bg-neutral-100 text-neutral-700"
        }`}
        aria-current={isActive ? "true" : undefined}
      >
        {/* Mode Badge */}
        <span className="flex-shrink-0">
          {hasVoiceMessages ? (
            <Mic className="w-4 h-4 text-neutral-400" />
          ) : (
            <Keyboard className="w-4 h-4 text-neutral-400" />
          )}
        </span>

        {/* Title and Meta */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{conversation.title}</p>
          <p className="text-xs text-neutral-500">
            {formatRelativeTime(conversation.updatedAt)}
          </p>
        </div>

        {/* Pinned Indicator (when not hovering) */}
        {isPinned && (
          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 flex-shrink-0 group-hover:hidden" />
        )}
      </div>

      {/* Actions - positioned absolutely, visible on hover */}
      {/* pointer-events-none when hidden to prevent blocking clicks on the main area */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
        <div className="flex items-center gap-1 bg-white rounded shadow-sm border border-neutral-200 p-0.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPin();
            }}
            className={`p-1 rounded hover:bg-neutral-100 ${
              isPinned ? "text-amber-500" : "text-neutral-400"
            }`}
            title={isPinned ? "Unpin" : "Pin"}
          >
            <Star
              className={`w-3.5 h-3.5 ${isPinned ? "fill-amber-500" : ""}`}
            />
          </button>
          <button
            onClick={onArchive}
            className="p-1 rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            title="Archive"
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded text-neutral-400 hover:bg-red-50 hover:text-red-600"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

export default CollapsibleSidebar;
