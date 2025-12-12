import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { usePrompts } from "../../hooks/usePrompts";
import type {
  Prompt,
  PromptCreate,
  PromptUpdate,
  PromptType,
  PromptStatus,
  PromptStats,
} from "../../types";
import {
  PageContainer,
  PageHeader,
  StatusBadge,
  StatCard,
  DataPanel,
  LoadingGrid,
  ErrorState,
  EmptyState,
  RefreshButton,
  ConfirmDialog,
  TabGroup,
  Tab,
} from "../../components/shared";
import { PromptEditorModal } from "./PromptEditorModal";
import { VersionHistoryDrawer } from "./VersionHistoryDrawer";
import { PromptTestPanel } from "./PromptTestPanel";

const PROMPT_TYPE_LABELS: Record<PromptType, string> = {
  chat: "Chat Mode",
  voice: "Voice Mode",
  persona: "Persona",
  system: "System",
};

const STATUS_COLORS: Record<PromptStatus, "success" | "warning" | "info"> = {
  draft: "warning",
  published: "success",
  archived: "info",
};

export function PromptsPage() {
  const { isAdmin } = useAuth();
  const {
    prompts,
    total,
    page,
    totalPages,
    loading,
    error,
    lastUpdated,
    refreshPrompts,
    createPrompt,
    updatePrompt,
    deletePrompt,
    publishPrompt,
    archivePrompt,
    toggleActive,
    getStats,
    filters,
    setFilters,
  } = usePrompts();

  const [stats, setStats] = useState<PromptStats | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [deletingPrompt, setDeletingPrompt] = useState<Prompt | null>(null);
  const [publishingPrompt, setPublishingPrompt] = useState<Prompt | null>(null);
  const [versionHistoryPrompt, setVersionHistoryPrompt] =
    useState<Prompt | null>(null);
  const [testingPrompt, setTestingPrompt] = useState<Prompt | null>(null);
  const [updating, setUpdating] = useState(false);

  // Active tab for filtering by type
  const [activeTab, setActiveTab] = useState<string>("all");

  // Load stats on mount
  useEffect(() => {
    getStats().then(setStats);
  }, [getStats]);

  // Tab definitions
  const tabs: Tab[] = [
    { id: "all", label: "All Prompts", count: stats?.total },
    { id: "chat", label: "Chat Mode", count: stats?.by_type?.chat },
    { id: "voice", label: "Voice Mode", count: stats?.by_type?.voice },
    { id: "persona", label: "Personas", count: stats?.by_type?.persona },
  ];

  // Handle tab change
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    if (tabId === "all") {
      setFilters({ ...filters, prompt_type: undefined, page: 1 });
    } else {
      setFilters({ ...filters, prompt_type: tabId as PromptType, page: 1 });
    }
  };

  // Handle status filter
  const handleStatusFilter = (status: PromptStatus | "all") => {
    if (status === "all") {
      setFilters({ ...filters, status: undefined, page: 1 });
    } else {
      setFilters({ ...filters, status, page: 1 });
    }
  };

  // Handle create
  const handleCreate = async (data: PromptCreate | PromptUpdate) => {
    // For create, we cast to PromptCreate since the modal provides all required fields
    setUpdating(true);
    const result = await createPrompt(data as PromptCreate);
    if (result) {
      setShowCreateModal(false);
      await getStats().then(setStats);
    }
    setUpdating(false);
    return !!result;
  };

  // Handle update
  const handleUpdate = async (data: PromptUpdate) => {
    if (!editingPrompt) return false;
    setUpdating(true);
    const result = await updatePrompt(editingPrompt.id, {
      display_name: data.display_name,
      description: data.description,
      system_prompt: data.system_prompt,
      intent_category: data.intent_category,
      metadata: data.metadata,
      change_summary: data.change_summary,
    });
    if (result) {
      setEditingPrompt(null);
    }
    setUpdating(false);
    return !!result;
  };

  // Handle delete
  const handleDelete = async () => {
    if (!deletingPrompt) return;
    setUpdating(true);
    await deletePrompt(deletingPrompt.id);
    setDeletingPrompt(null);
    await getStats().then(setStats);
    setUpdating(false);
  };

  // Handle publish
  const handlePublish = async () => {
    if (!publishingPrompt) return;
    setUpdating(true);
    await publishPrompt(publishingPrompt.id);
    setPublishingPrompt(null);
    await getStats().then(setStats);
    setUpdating(false);
  };

  // Handle archive
  const handleArchive = async (prompt: Prompt) => {
    await archivePrompt(prompt.id);
    await getStats().then(setStats);
  };

  // Handle toggle active
  const handleToggleActive = async (prompt: Prompt) => {
    await toggleActive(prompt.id);
  };

  // Handle pagination
  const handlePageChange = (newPage: number) => {
    setFilters({ ...filters, page: newPage });
  };

  // Loading state
  if (loading && !prompts.length) {
    return (
      <PageContainer>
        <PageHeader
          title="Prompt Management"
          description="Manage AI prompts, system instructions, and personas"
        />
        <LoadingGrid count={4} cols={4} />
        <LoadingGrid count={6} cols={1} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* Header */}
      <PageHeader
        title="Prompt Management"
        description="Manage AI prompts, system instructions, and personas for Chat and Voice modes"
        lastUpdated={lastUpdated}
        actions={
          <div className="flex items-center gap-3">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Create Prompt
              </button>
            )}
            <RefreshButton onClick={refreshPrompts} isLoading={loading} />
          </div>
        }
      />

      {/* Error Banner */}
      {error && <ErrorState message={error} onRetry={refreshPrompts} />}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Prompts"
          value={stats?.total ?? 0}
          icon="P"
          color="blue"
        />
        <StatCard
          title="Published"
          value={stats?.published ?? 0}
          icon="P"
          color="green"
        />
        <StatCard
          title="Drafts"
          value={stats?.draft ?? 0}
          icon="D"
          color="yellow"
        />
        <StatCard
          title="Archived"
          value={stats?.archived ?? 0}
          icon="A"
          color="purple"
        />
      </div>

      {/* Tabs and Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <TabGroup
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Status:</span>
          <select
            value={filters.status ?? "all"}
            onChange={(e) =>
              handleStatusFilter(e.target.value as PromptStatus | "all")
            }
            className="px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-slate-200"
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {/* Prompts List */}
      <DataPanel title={`Prompts (${total})`} noPadding>
        {prompts.length === 0 ? (
          <div className="p-4">
            <EmptyState
              message="No prompts found"
              icon="P"
              action={
                isAdmin
                  ? {
                      label: "Create First Prompt",
                      onClick: () => setShowCreateModal(true),
                    }
                  : undefined
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {prompts.map((prompt) => (
              <PromptRow
                key={prompt.id}
                prompt={prompt}
                isAdmin={isAdmin}
                onEdit={() => setEditingPrompt(prompt)}
                onDelete={() => setDeletingPrompt(prompt)}
                onPublish={() => setPublishingPrompt(prompt)}
                onArchive={() => handleArchive(prompt)}
                onToggleActive={() => handleToggleActive(prompt)}
                onViewVersions={() => setVersionHistoryPrompt(prompt)}
                onTest={() => setTestingPrompt(prompt)}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
                className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-slate-200"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages}
                className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-slate-200"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </DataPanel>

      {/* Create Modal */}
      {showCreateModal && (
        <PromptEditorModal
          title="Create New Prompt"
          onSave={handleCreate}
          onCancel={() => setShowCreateModal(false)}
          isLoading={updating}
        />
      )}

      {/* Edit Modal */}
      {editingPrompt && (
        <PromptEditorModal
          title={`Edit: ${editingPrompt.display_name}`}
          prompt={editingPrompt}
          onSave={handleUpdate}
          onCancel={() => setEditingPrompt(null)}
          isLoading={updating}
        />
      )}

      {/* Version History Drawer */}
      {versionHistoryPrompt && (
        <VersionHistoryDrawer
          prompt={versionHistoryPrompt}
          onClose={() => setVersionHistoryPrompt(null)}
        />
      )}

      {/* Test Panel */}
      {testingPrompt && (
        <PromptTestPanel
          prompt={testingPrompt}
          onClose={() => setTestingPrompt(null)}
        />
      )}

      {/* Publish Confirmation */}
      <ConfirmDialog
        isOpen={!!publishingPrompt}
        onClose={() => setPublishingPrompt(null)}
        onConfirm={handlePublish}
        title="Publish Prompt"
        message={
          <>
            Are you sure you want to publish{" "}
            <strong className="text-slate-200">
              {publishingPrompt?.display_name}
            </strong>
            ? This will make the current draft content live and create a new
            version snapshot.
          </>
        }
        confirmLabel="Publish"
        variant="info"
        isLoading={updating}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deletingPrompt}
        onClose={() => setDeletingPrompt(null)}
        onConfirm={handleDelete}
        title="Delete Prompt"
        message={
          <>
            Are you sure you want to delete{" "}
            <strong className="text-slate-200">
              {deletingPrompt?.display_name}
            </strong>
            ? This action cannot be undone.
          </>
        }
        confirmLabel="Delete"
        variant="danger"
        isLoading={updating}
      />
    </PageContainer>
  );
}

// Prompt Row Component
interface PromptRowProps {
  prompt: Prompt;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onPublish: () => void;
  onArchive: () => void;
  onToggleActive: () => void;
  onViewVersions: () => void;
  onTest: () => void;
}

function PromptRow({
  prompt,
  isAdmin,
  onEdit,
  onDelete,
  onPublish,
  onArchive,
  onToggleActive,
  onViewVersions,
  onTest,
}: PromptRowProps) {
  const hasUnpublishedChanges =
    prompt.status === "draft" ||
    (prompt.published_content &&
      prompt.system_prompt !== prompt.published_content);

  return (
    <div className="p-4 hover:bg-slate-800/30 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h4 className="font-medium text-slate-200 truncate">
              {prompt.display_name}
            </h4>
            <StatusBadge
              status={STATUS_COLORS[prompt.status]}
              label={prompt.status}
              size="sm"
              showDot={false}
            />
            <span className="text-xs text-slate-500 px-2 py-0.5 bg-slate-800 rounded">
              {PROMPT_TYPE_LABELS[prompt.prompt_type]}
            </span>
            {prompt.intent_category && (
              <span className="text-xs text-slate-500 px-2 py-0.5 bg-slate-800/50 rounded">
                {prompt.intent_category}
              </span>
            )}
            {hasUnpublishedChanges && prompt.status !== "draft" && (
              <span className="text-xs text-amber-400 px-2 py-0.5 bg-amber-900/30 rounded border border-amber-700/50">
                Unpublished changes
              </span>
            )}
          </div>

          {/* Description */}
          {prompt.description && (
            <p className="text-sm text-slate-400 mb-2 line-clamp-2">
              {prompt.description}
            </p>
          )}

          {/* Meta info */}
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span>v{prompt.current_version}</span>
            <span>{prompt.character_count?.toLocaleString() ?? "—"} chars</span>
            <span>
              ~{prompt.token_estimate?.toLocaleString() ?? "—"} tokens
            </span>
            <span>
              Updated: {new Date(prompt.updated_at).toLocaleDateString()}
            </span>
            {prompt.updated_by_email && (
              <span>by {prompt.updated_by_email}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Active toggle */}
          <button
            type="button"
            onClick={onToggleActive}
            disabled={!isAdmin}
            title={prompt.is_active ? "Active" : "Inactive"}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              prompt.is_active ? "bg-green-600" : "bg-slate-700"
            } ${!isAdmin ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                prompt.is_active ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onTest}
              className="px-2 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
              title="Test prompt"
            >
              Test
            </button>
            <button
              type="button"
              onClick={onViewVersions}
              className="px-2 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
              title="View version history"
            >
              History
            </button>
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={onEdit}
                  className="px-2 py-1 text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded transition-colors"
                >
                  Edit
                </button>
                {hasUnpublishedChanges && (
                  <button
                    type="button"
                    onClick={onPublish}
                    className="px-2 py-1 text-xs font-medium text-green-400 hover:text-green-300 hover:bg-green-900/30 rounded transition-colors"
                  >
                    Publish
                  </button>
                )}
                {prompt.status !== "archived" && (
                  <button
                    type="button"
                    onClick={onArchive}
                    className="px-2 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
                  >
                    Archive
                  </button>
                )}
                <button
                  type="button"
                  onClick={onDelete}
                  className="px-2 py-1 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
