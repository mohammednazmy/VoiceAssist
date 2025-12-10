/**
 * FolderSidebar Component
 * Displays hierarchical folder tree for organizing conversations
 */

import { useState, useEffect } from "react";
import { createFoldersApi, type Folder } from "../../lib/api/foldersApi";
import { useAuthStore } from "../../stores/authStore";

export interface FolderSidebarProps {
  onFolderSelect?: (folderId: string | null) => void;
  selectedFolderId?: string | null;
}

export function FolderSidebar({
  onFolderSelect,
  selectedFolderId,
}: FolderSidebarProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);

  const { tokens } = useAuthStore();

  const foldersApi = createFoldersApi(
    import.meta.env.VITE_API_URL || "http://localhost:8000",
    () => tokens?.accessToken || null,
  );

  // Load folder tree on mount
  useEffect(() => {
    loadFolders();
  }, []);

  async function loadFolders() {
    try {
      setLoading(true);
      setError(null);
      const tree = await foldersApi.getFolderTree();
      setFolders(tree);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load folders");
      console.error("Failed to load folders:", err);
    } finally {
      setLoading(false);
    }
  }

  function toggleFolder(folderId: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;

    try {
      await foldersApi.createFolder({
        name: newFolderName.trim(),
        parent_folder_id: newFolderParent || undefined,
      });
      setNewFolderName("");
      setNewFolderParent(null);
      setCreatingFolder(false);
      await loadFolders();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create folder");
    }
  }

  async function handleRenameFolder(folderId: string) {
    if (!editName.trim()) return;

    try {
      await foldersApi.updateFolder(folderId, { name: editName.trim() });
      setEditingFolder(null);
      setEditName("");
      await loadFolders();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to rename folder");
    }
  }

  async function handleDeleteFolder(folderId: string) {
    if (
      !confirm(
        "Are you sure? All conversations in this folder will be moved to the root level.",
      )
    ) {
      return;
    }

    try {
      await foldersApi.deleteFolder(folderId);
      await loadFolders();
      if (selectedFolderId === folderId) {
        onFolderSelect?.(null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete folder");
    }
  }

  function startEdit(folder: Folder) {
    setEditingFolder(folder.id);
    setEditName(folder.name);
  }

  function cancelEdit() {
    setEditingFolder(null);
    setEditName("");
  }

  function renderFolder(folder: Folder, level: number = 0) {
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolderId === folder.id;
    const isEditing = editingFolder === folder.id;
    const hasChildren = folder.children && folder.children.length > 0;

    return (
      <div key={folder.id} style={{ marginLeft: `${level * 16}px` }}>
        <div
          className={`flex items-center justify-between p-2 rounded-md hover:bg-neutral-100 cursor-pointer ${
            isSelected ? "bg-primary-100" : ""
          }`}
        >
          <div className="flex items-center flex-1">
            {/* Expand/collapse button */}
            {hasChildren && (
              <button
                type="button"
                onClick={() => toggleFolder(folder.id)}
                className="mr-1 text-neutral-600 hover:text-neutral-900"
                aria-label={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? "▼" : "▶"}
              </button>
            )}

            {/* Folder icon */}
            <span className="mr-2 text-lg">{folder.icon || "📁"}</span>

            {/* Folder name or edit input */}
            {isEditing ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameFolder(folder.id);
                  if (e.key === "Escape") cancelEdit();
                }}
                className="flex-1 px-2 py-1 text-sm border rounded"
                autoFocus
              />
            ) : (
              <span
                className="flex-1 text-sm"
                onClick={() => onFolderSelect?.(folder.id)}
              >
                {folder.name}
              </span>
            )}
          </div>

          {/* Action buttons */}
          {!isEditing && (
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => {
                  setNewFolderParent(folder.id);
                  setCreatingFolder(true);
                }}
                className="p-1 text-neutral-600 hover:text-primary-600"
                aria-label="Add subfolder"
                title="Add subfolder"
              >
                ➕
              </button>
              <button
                type="button"
                onClick={() => startEdit(folder)}
                className="p-1 text-neutral-600 hover:text-primary-600"
                aria-label="Rename"
                title="Rename"
              >
                ✏️
              </button>
              <button
                type="button"
                onClick={() => handleDeleteFolder(folder.id)}
                className="p-1 text-neutral-600 hover:text-red-600"
                aria-label="Delete"
                title="Delete"
              >
                🗑️
              </button>
            </div>
          )}

          {/* Edit actions */}
          {isEditing && (
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => handleRenameFolder(folder.id)}
                className="px-2 py-1 text-xs bg-primary-500 text-white rounded hover:bg-primary-600"
              >
                Save
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="px-2 py-1 text-xs bg-neutral-300 rounded hover:bg-neutral-400"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Render children if expanded */}
        {isExpanded && hasChildren && (
          <div>
            {folder.children!.map((child) => renderFolder(child, level + 1))}
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-neutral-200 rounded mb-2"></div>
          <div className="h-4 bg-neutral-200 rounded mb-2"></div>
          <div className="h-4 bg-neutral-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="text-red-600 text-sm">Error: {error}</div>
        <button
          type="button"
          onClick={loadFolders}
          className="mt-2 px-3 py-1 text-sm bg-primary-500 text-white rounded hover:bg-primary-600"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Folders</h2>
        <button
          type="button"
          onClick={() => {
            setNewFolderParent(null);
            setCreatingFolder(true);
          }}
          className="px-3 py-1 text-sm bg-primary-500 text-white rounded hover:bg-primary-600"
          aria-label="New folder"
        >
          + New
        </button>
      </div>

      {/* All Conversations (root) */}
      <div
        className={`flex items-center p-2 mb-2 rounded-md cursor-pointer hover:bg-neutral-100 ${
          selectedFolderId === null ? "bg-primary-100" : ""
        }`}
        onClick={() => onFolderSelect?.(null)}
      >
        <span className="mr-2 text-lg">📂</span>
        <span className="text-sm font-medium">All Conversations</span>
      </div>

      {/* Create folder input */}
      {creatingFolder && (
        <div className="mb-4 p-3 border rounded-md bg-neutral-50">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateFolder();
              if (e.key === "Escape") {
                setCreatingFolder(false);
                setNewFolderName("");
                setNewFolderParent(null);
              }
            }}
            placeholder={
              newFolderParent ? "New subfolder name..." : "New folder name..."
            }
            className="w-full px-2 py-1 text-sm border rounded mb-2"
            autoFocus
          />
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
              className="px-3 py-1 text-sm bg-primary-500 text-white rounded hover:bg-primary-600 disabled:bg-neutral-300"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setCreatingFolder(false);
                setNewFolderName("");
                setNewFolderParent(null);
              }}
              className="px-3 py-1 text-sm bg-neutral-300 rounded hover:bg-neutral-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Folder tree */}
      {folders.length === 0 ? (
        <div className="text-sm text-neutral-500 text-center py-4">
          No folders yet. Create your first folder to organize conversations.
        </div>
      ) : (
        <div className="space-y-1">
          {folders.map((folder) => renderFolder(folder))}
        </div>
      )}
    </div>
  );
}
