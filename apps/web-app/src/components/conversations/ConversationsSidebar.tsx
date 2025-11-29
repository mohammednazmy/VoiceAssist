/**
 * Conversations Sidebar
 * Displays list of conversations with search, folder organization, and management
 */

import { useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { Button, Input } from "@voiceassist/ui";
import { useConversations } from "../../hooks/useConversations";
import { useFolders } from "../../hooks/useFolders";
import { FolderDialog } from "../folders/FolderDialog";
import { useToastContext } from "../../contexts/ToastContext";
import type { Folder } from "@voiceassist/types";

export function ConversationsSidebar() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const toast = useToastContext();

  const {
    conversations,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    showArchived,
    setShowArchived,
    createConversation,
    archiveConversation,
    unarchiveConversation,
    deleteConversation,
    exportConversation,
    updateConversation,
  } = useConversations();

  const { folders, createFolder, updateFolder, deleteFolder } = useFolders();

  const [isCreating, setIsCreating] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [folderDialogMode, setFolderDialogMode] = useState<"create" | "edit">(
    "create",
  );
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [folderMenuOpenId, setFolderMenuOpenId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    new Set(),
  );
  const [showFolders, setShowFolders] = useState(true);
  const [movingConversationId, setMovingConversationId] = useState<
    string | null
  >(null);

  const handleCreateConversation = async () => {
    setIsCreating(true);
    try {
      await createConversation("New Conversation");
    } catch (err) {
      console.error("Failed to create conversation:", err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleArchive = async (id: string, archived: boolean) => {
    try {
      if (archived) {
        await unarchiveConversation(id);
      } else {
        await archiveConversation(id);
      }
      setMenuOpenId(null);
    } catch (err) {
      console.error("Failed to archive conversation:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this conversation?")) return;

    try {
      await deleteConversation(id);
      setMenuOpenId(null);
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  };

  const handleExport = async (id: string, format: "markdown" | "text") => {
    try {
      await exportConversation(id, format);
      setMenuOpenId(null);
    } catch (err) {
      console.error("Failed to export conversation:", err);
    }
  };

  const handleMoveToFolder = async (
    conversationId: string,
    folderId: string | null,
  ) => {
    try {
      await updateConversation(conversationId, { folderId });
      setMovingConversationId(null);
      setMenuOpenId(null);
      toast?.success(
        `Conversation moved to ${folderId ? "folder" : "root level"}`,
      );
    } catch (err) {
      console.error("Failed to move conversation:", err);
      toast?.error("Failed to move conversation");
    }
  };

  const handleCreateFolder = () => {
    setFolderDialogMode("create");
    setEditingFolder(null);
    setIsFolderDialogOpen(true);
  };

  const handleEditFolder = (folder: Folder) => {
    setFolderDialogMode("edit");
    setEditingFolder(folder);
    setFolderMenuOpenId(null);
    setIsFolderDialogOpen(true);
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this folder? Conversations in this folder will be moved to the root.",
      )
    ) {
      return;
    }
    try {
      await deleteFolder(folderId);
      setFolderMenuOpenId(null);
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null);
      }
      toast?.success("Folder deleted");
    } catch (err) {
      console.error("Failed to delete folder:", err);
      toast?.error("Failed to delete folder");
    }
  };

  const handleSaveFolder = async (
    name: string,
    color?: string | null,
    icon?: string | null,
  ) => {
    if (folderDialogMode === "create") {
      await createFolder({ name, color, icon });
      toast?.success("Folder created");
    } else if (editingFolder) {
      await updateFolder(editingFolder.id, { name, color, icon });
      toast?.success("Folder updated");
    }
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const renderFolderTree = (
    folderList: typeof folders,
    level: number = 0,
  ): JSX.Element[] => {
    return folderList.map((folder) => {
      const isExpanded = expandedFolderIds.has(folder.id);
      const isSelected = selectedFolderId === folder.id;
      const hasChildren = folder.children && folder.children.length > 0;
      const isMenuOpen = folderMenuOpenId === folder.id;

      return (
        <div key={folder.id} className="relative group">
          <button
            onClick={() => setSelectedFolderId(folder.id)}
            className={`w-full flex items-center px-4 py-2 text-sm hover:bg-neutral-100 ${
              isSelected ? "bg-primary-50" : ""
            }`}
            style={{ paddingLeft: `${16 + level * 16}px` }}
          >
            {hasChildren && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFolder(folder.id);
                }}
                className="mr-1 text-neutral-600 cursor-pointer"
              >
                {isExpanded ? "▼" : "▶"}
              </span>
            )}
            <span
              className="mr-2"
              style={folder.color ? { color: folder.color } : undefined}
            >
              {folder.icon || "📁"}
            </span>
            <span className="flex-1 text-left truncate">{folder.name}</span>
            {/* Folder menu button */}
            <span
              onClick={(e) => {
                e.stopPropagation();
                setFolderMenuOpenId(isMenuOpen ? null : folder.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-neutral-200 rounded transition-opacity"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-3 h-3 text-neutral-600"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"
                />
              </svg>
            </span>
          </button>
          {/* Folder context menu */}
          {isMenuOpen && (
            <div className="absolute left-full top-0 ml-1 w-36 bg-white border border-neutral-200 rounded-md shadow-lg z-20">
              <button
                onClick={() => handleEditFolder(folder)}
                className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center space-x-2"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"
                  />
                </svg>
                <span>Edit</span>
              </button>
              <button
                onClick={() => handleDeleteFolder(folder.id)}
                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                  />
                </svg>
                <span>Delete</span>
              </button>
            </div>
          )}
          {isExpanded &&
            hasChildren &&
            renderFolderTree(folder.children!, level + 1)}
        </div>
      );
    });
  };

  const filteredConversations = useMemo(() => {
    let filtered = conversations;

    // Filter by folder
    if (selectedFolderId !== null) {
      filtered = filtered.filter((conv) => conv.folderId === selectedFolderId);
    } else if (selectedFolderId === "root") {
      filtered = filtered.filter((conv) => !conv.folderId);
    }

    return filtered;
  }, [conversations, selectedFolderId]);

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="w-80 h-full bg-white border-r border-neutral-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-neutral-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-neutral-900">
            Conversations
          </h2>
          <Button
            onClick={handleCreateConversation}
            disabled={isCreating}
            size="sm"
            aria-label="New conversation"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-4 h-4 mr-1"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            New
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <Input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Archive Toggle */}
        <button
          onClick={() => setShowArchived(!showArchived)}
          className="mt-2 text-sm text-neutral-600 hover:text-neutral-900 flex items-center space-x-1"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-4 h-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
            />
          </svg>
          <span>{showArchived ? "Show Active" : "Show Archived"}</span>
        </button>

        {/* Folders Toggle */}
        <button
          onClick={() => setShowFolders(!showFolders)}
          className="mt-2 text-sm text-neutral-600 hover:text-neutral-900 flex items-center space-x-1"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-4 h-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
            />
          </svg>
          <span>{showFolders ? "Hide Folders" : "Show Folders"}</span>
        </button>
      </div>

      {/* Folder Tree */}
      {showFolders && (
        <div className="border-b border-neutral-200 max-h-64 overflow-y-auto">
          {/* New Folder Button */}
          <button
            onClick={handleCreateFolder}
            className="w-full flex items-center px-4 py-2 text-sm text-primary-600 hover:bg-primary-50 border-b border-neutral-100"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-4 h-4 mr-2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            <span className="font-medium">New Folder</span>
          </button>

          {/* All Conversations (root) */}
          <button
            onClick={() => setSelectedFolderId(null)}
            className={`w-full flex items-center px-4 py-2 text-sm hover:bg-neutral-100 ${
              selectedFolderId === null ? "bg-primary-50" : ""
            }`}
          >
            <span className="mr-2">📂</span>
            <span className="flex-1 text-left font-medium">
              All Conversations
            </span>
          </button>

          {/* Render folder tree */}
          {folders.length > 0 && renderFolderTree(folders)}
        </div>
      )}

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="p-4 text-center">
            <div className="w-8 h-8 mx-auto rounded-full border-4 border-primary-500 border-t-transparent animate-spin" />
            <p className="mt-2 text-sm text-neutral-600">Loading...</p>
          </div>
        )}

        {error && (
          <div className="p-4 m-4 bg-red-50 rounded-md border border-red-200">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {!isLoading && filteredConversations.length === 0 && (
          <div className="p-4 text-center">
            <p className="text-sm text-neutral-600">
              {searchQuery ? "No conversations found" : "No conversations yet"}
            </p>
          </div>
        )}

        {!isLoading &&
          filteredConversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`relative group ${
                conversationId === conversation.id
                  ? "bg-primary-50"
                  : "hover:bg-neutral-50"
              }`}
            >
              <Link
                to={`/chat/${conversation.id}`}
                className="block p-4 border-b border-neutral-100"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0 pr-8">
                    <h3 className="text-sm font-medium text-neutral-900 truncate">
                      {conversation.title || "Untitled Conversation"}
                    </h3>
                    <p className="text-xs text-neutral-500 mt-1">
                      {formatDate(
                        new Date(
                          conversation.updatedAt || conversation.createdAt,
                        ).getTime(),
                      )}
                    </p>
                  </div>

                  {/* Menu Button */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setMenuOpenId(
                        menuOpenId === conversation.id ? null : conversation.id,
                      );
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-neutral-200 rounded transition-opacity"
                    aria-label="Conversation options"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="w-4 h-4 text-neutral-600"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"
                      />
                    </svg>
                  </button>
                </div>
              </Link>

              {/* Dropdown Menu */}
              {menuOpenId === conversation.id && (
                <div className="absolute right-4 top-12 w-48 bg-white border border-neutral-200 rounded-md shadow-lg z-10">
                  <button
                    onClick={() =>
                      handleArchive(
                        conversation.id,
                        conversation.archived || false,
                      )
                    }
                    className="w-full px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center space-x-2"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-4 h-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
                      />
                    </svg>
                    <span>
                      {conversation.archived ? "Unarchive" : "Archive"}
                    </span>
                  </button>
                  <div className="border-t border-neutral-200">
                    <button
                      onClick={() => handleExport(conversation.id, "markdown")}
                      className="w-full px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center space-x-2"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="w-4 h-4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                        />
                      </svg>
                      <span>Export as Markdown</span>
                    </button>
                    <button
                      onClick={() => handleExport(conversation.id, "text")}
                      className="w-full px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center space-x-2"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="w-4 h-4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                        />
                      </svg>
                      <span>Export as Text</span>
                    </button>
                  </div>
                  <div className="border-t border-neutral-200">
                    <button
                      onClick={() => setMovingConversationId(conversation.id)}
                      className="w-full px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center space-x-2"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="w-4 h-4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
                        />
                      </svg>
                      <span>Move to Folder</span>
                    </button>
                  </div>
                  <div className="border-t border-neutral-200">
                    <button
                      onClick={() => handleDelete(conversation.id)}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="w-4 h-4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                        />
                      </svg>
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Folder Picker Submenu */}
              {movingConversationId === conversation.id && (
                <div className="absolute right-4 top-12 w-56 bg-white border border-neutral-200 rounded-md shadow-lg z-20 max-h-96 overflow-y-auto">
                  <div className="p-2 border-b border-neutral-200 bg-neutral-50">
                    <p className="text-xs font-medium text-neutral-700">
                      Select Destination Folder
                    </p>
                  </div>
                  <button
                    onClick={() => handleMoveToFolder(conversation.id, null)}
                    className="w-full px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center space-x-2"
                  >
                    <span className="mr-2">📂</span>
                    <span>Root (No Folder)</span>
                  </button>
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() =>
                        handleMoveToFolder(conversation.id, folder.id)
                      }
                      className="w-full px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center space-x-2"
                    >
                      <span className="mr-2">{folder.icon || "📁"}</span>
                      <span className="truncate">{folder.name}</span>
                    </button>
                  ))}
                  <div className="border-t border-neutral-200">
                    <button
                      onClick={() => setMovingConversationId(null)}
                      className="w-full px-4 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
      </div>

      {/* Folder Dialog */}
      <FolderDialog
        isOpen={isFolderDialogOpen}
        onClose={() => {
          setIsFolderDialogOpen(false);
          setEditingFolder(null);
        }}
        onSave={handleSaveFolder}
        folder={editingFolder}
        mode={folderDialogMode}
      />
    </div>
  );
}
