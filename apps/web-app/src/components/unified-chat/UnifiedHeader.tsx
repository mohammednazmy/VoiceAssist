/**
 * Unified Header
 *
 * Header for the unified chat/voice interface with conversation title,
 * connection status, and action buttons.
 */

import { useState, useCallback } from "react";
import {
  PanelLeftOpen,
  PanelRightOpen,
  Share2,
  Download,
  Settings,
  Edit2,
  Check,
  X,
  Loader2,
  Menu,
} from "lucide-react";
import {
  useUnifiedConversationStore,
  selectConnectionStatus,
} from "../../stores/unifiedConversationStore";
import { useIsMobile } from "../../hooks/useIsMobile";
import type { Conversation } from "@voiceassist/types";

interface UnifiedHeaderProps {
  conversation: Conversation | null;
  isSidebarOpen: boolean;
  isContextPaneOpen: boolean;
  onToggleSidebar: () => void;
  onToggleContextPane: () => void;
  onTitleChange?: (newTitle: string) => Promise<void>;
  onExport?: () => void;
  onShare?: () => void;
  onSettings?: () => void;
}

export function UnifiedHeader({
  conversation,
  isSidebarOpen,
  isContextPaneOpen,
  onToggleSidebar,
  onToggleContextPane,
  onTitleChange,
  onExport,
  onShare,
  onSettings,
}: UnifiedHeaderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // Get unified connection status
  const connectionStatus = useUnifiedConversationStore(selectConnectionStatus);
  const voiceModeActive = useUnifiedConversationStore((s) => s.voiceModeActive);

  const handleStartEdit = useCallback(() => {
    setEditedTitle(conversation?.title || "New Conversation");
    setTitleError(null);
    setIsEditingTitle(true);
  }, [conversation?.title]);

  const handleSaveTitle = useCallback(async () => {
    const trimmedTitle = editedTitle.trim();

    // Validation
    if (!trimmedTitle) {
      setTitleError("Title cannot be empty");
      return;
    }

    if (trimmedTitle === conversation?.title) {
      setIsEditingTitle(false);
      return;
    }

    if (trimmedTitle.length > 100) {
      setTitleError("Title must be 100 characters or less");
      return;
    }

    setIsSavingTitle(true);
    setTitleError(null);

    try {
      if (onTitleChange) {
        await onTitleChange(trimmedTitle);
      }
      setIsEditingTitle(false);
    } catch (error) {
      setTitleError(
        error instanceof Error ? error.message : "Failed to save title",
      );
    } finally {
      setIsSavingTitle(false);
    }
  }, [editedTitle, conversation?.title, onTitleChange]);

  const handleCancelEdit = useCallback(() => {
    setIsEditingTitle(false);
    setEditedTitle("");
    setTitleError(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSaveTitle();
      } else if (e.key === "Escape") {
        handleCancelEdit();
      }
    },
    [handleSaveTitle, handleCancelEdit],
  );

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case "connected":
        return "bg-green-500";
      case "connecting":
      case "reconnecting":
        return "bg-amber-500 animate-pulse";
      case "error":
        return "bg-red-500";
      default:
        return "bg-neutral-400";
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case "connected":
        return voiceModeActive ? "Voice Connected" : "Connected";
      case "connecting":
        return "Connecting...";
      case "reconnecting":
        return "Reconnecting...";
      case "error":
        return "Connection Error";
      default:
        return "Disconnected";
    }
  };

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white">
      {/* Left Section */}
      <div className="flex items-center gap-3">
        {/* Sidebar Toggle - always visible on mobile, only when collapsed on desktop */}
        {(isMobile || !isSidebarOpen) && (
          <button
            onClick={onToggleSidebar}
            className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
            aria-label="Open sidebar"
          >
            {isMobile ? (
              <Menu className="w-5 h-5 text-neutral-600" />
            ) : (
              <PanelLeftOpen className="w-5 h-5 text-neutral-600" />
            )}
          </button>
        )}

        {/* Title */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => {
                    setEditedTitle(e.target.value);
                    setTitleError(null);
                  }}
                  className={`px-2 py-1 text-lg font-semibold border rounded focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                    titleError ? "border-red-300" : "border-primary-300"
                  }`}
                  autoFocus
                  disabled={isSavingTitle}
                  onKeyDown={handleKeyDown}
                  maxLength={100}
                  aria-label="Conversation title"
                  aria-invalid={!!titleError}
                />
                <button
                  onClick={handleSaveTitle}
                  disabled={isSavingTitle}
                  className="p-1.5 hover:bg-green-100 text-green-600 rounded transition-colors disabled:opacity-50"
                  aria-label="Save title"
                >
                  {isSavingTitle ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={handleCancelEdit}
                  disabled={isSavingTitle}
                  className="p-1.5 hover:bg-red-100 text-red-600 rounded transition-colors disabled:opacity-50"
                  aria-label="Cancel editing"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleStartEdit}
                className="flex items-center gap-2 group"
                disabled={!conversation}
              >
                <h1 className="text-lg font-semibold text-neutral-900">
                  {conversation?.title || "New Conversation"}
                </h1>
                {conversation && (
                  <Edit2 className="w-4 h-4 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </button>
            )}
          </div>

          {/* Title Error */}
          {titleError && (
            <p className="text-xs text-red-500 mt-1">{titleError}</p>
          )}
        </div>

        {/* Connection Status - hide text on mobile */}
        <div className="flex items-center gap-2 px-2 py-1 bg-neutral-50 rounded-full">
          <span
            className={`w-2 h-2 rounded-full ${getConnectionStatusColor()}`}
          />
          <span
            className={`text-xs text-neutral-600 ${isMobile ? "hidden sm:inline" : ""}`}
          >
            {getConnectionStatusText()}
          </span>
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Action Buttons - show share/export only on larger screens */}
        <button
          onClick={onShare}
          disabled={!conversation}
          className="hidden sm:block p-2 hover:bg-neutral-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Share conversation"
          title="Share"
        >
          <Share2 className="w-5 h-5 text-neutral-600" />
        </button>

        <button
          onClick={onExport}
          disabled={!conversation}
          className="hidden sm:block p-2 hover:bg-neutral-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Export conversation"
          title="Export"
        >
          <Download className="w-5 h-5 text-neutral-600" />
        </button>

        <button
          onClick={onSettings}
          className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
          aria-label="Settings"
          title="Settings"
        >
          <Settings className="w-5 h-5 text-neutral-600" />
        </button>

        {/* Context Pane Toggle - always visible on mobile, only when collapsed on desktop */}
        {(isMobile || !isContextPaneOpen) && (
          <button
            onClick={onToggleContextPane}
            className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
            aria-label="Open context pane"
          >
            <PanelRightOpen className="w-5 h-5 text-neutral-600" />
          </button>
        )}
      </div>
    </header>
  );
}

export default UnifiedHeader;
