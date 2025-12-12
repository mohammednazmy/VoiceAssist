import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchAPI } from "../lib/api";

interface Message {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  tokens_used?: number;
  model?: string;
  branch_id?: string;
  parent_message_id?: string;
  attachments?: Attachment[];
  metadata?: Record<string, unknown>;
}

interface Attachment {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  mime_type?: string;
}

interface ConversationDetail {
  id: string;
  user_id: string;
  user_email?: string;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
  model?: string;
  branch_count: number;
  folder_name?: string;
   phi_mode?: "clinical" | "demo";
   tags?: string[];
}

interface MessagesResponse {
  messages: Message[];
  total: number;
  limit: number;
  offset: number;
}

export function ConversationDetailPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const [conversation, setConversation] = useState<ConversationDetail | null>(
    null,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);
  const [totalMessages, setTotalMessages] = useState(0);
  const [updatingMeta, setUpdatingMeta] = useState(false);
  const [phiModeDraft, setPhiModeDraft] = useState<"" | "clinical" | "demo">(
    "",
  );
  const [tagsDraft, setTagsDraft] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (conversationId) {
      loadConversation();
      loadMessages();
    }
  }, [conversationId]);

  useEffect(() => {
    if (conversationId) {
      loadMessages();
    }
  }, [page]);

  const loadConversation = async () => {
    setLoading(true);
    try {
      const data = await fetchAPI<{ conversation: ConversationDetail }>(
        `/api/admin/conversations/${conversationId}`,
      );
      setConversation(data.conversation);
      setPhiModeDraft(
        (data.conversation.phi_mode as "clinical" | "demo" | undefined) || "",
      );
      setTagsDraft(data.conversation.tags || []);
      setError(null);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load conversation";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMeta = async (
    phi_mode: "clinical" | "demo" | "",
    tags: string[],
  ) => {
    if (!conversationId) return;
    setUpdatingMeta(true);
    try {
      await fetchAPI(`/api/admin/conversations/${conversationId}/metadata`, {
        method: "PATCH",
        body: JSON.stringify({
          phi_mode: phi_mode || null,
          tags,
        }),
      });
      await loadConversation();
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : "Failed to update conversation metadata",
      );
    } finally {
      setUpdatingMeta(false);
    }
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    if (tagsDraft.includes(trimmed)) {
      setTagInput("");
      return;
    }
    setTagsDraft((prev) => [...prev, trimmed]);
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    setTagsDraft((prev) => prev.filter((t) => t !== tag));
  };

  const loadMessages = async () => {
    setMessagesLoading(true);
    try {
      const offset = page * pageSize;
      const data = await fetchAPI<MessagesResponse>(
        `/api/admin/conversations/${conversationId}/messages?offset=${offset}&limit=${pageSize}`,
      );
      setMessages(data.messages);
      setTotalMessages(data.total);
    } catch (err: unknown) {
      console.error("Failed to load messages:", err);
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleExport = async (format: "json" | "markdown") => {
    try {
      const data = await fetchAPI<{
        export: { content: string; format: string };
      }>(`/api/admin/conversations/${conversationId}/export`, {
        method: "POST",
        body: JSON.stringify({ format }),
      });

      const mimeType = format === "json" ? "application/json" : "text/markdown";
      const extension = format === "json" ? "json" : "md";
      const content =
        format === "json"
          ? JSON.stringify(data.export.content, null, 2)
          : data.export.content;

      const blob = new Blob([content], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `conversation-${conversationId}.${extension}`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert(
        err instanceof Error ? err.message : "Failed to export conversation",
      );
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "user":
        return "bg-blue-900/50 text-blue-300 border-blue-800";
      case "assistant":
        return "bg-green-900/50 text-green-300 border-green-800";
      case "system":
        return "bg-purple-900/50 text-purple-300 border-purple-800";
      default:
        return "bg-slate-900/50 text-slate-300 border-slate-800";
    }
  };

  if (loading) {
    return (
      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-slate-800 rounded" />
          <div className="h-4 w-96 bg-slate-800 rounded" />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 bg-slate-800 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !conversation) {
    return (
      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        <div className="p-4 bg-red-950/50 border border-red-900 rounded-lg text-red-400">
          {error || "Conversation not found"}
        </div>
        <button
          onClick={() => navigate("/conversations")}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md text-sm border border-slate-700"
        >
          Back to Conversations
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => navigate("/conversations")}
            className="text-sm text-slate-400 hover:text-slate-200 mb-2 flex items-center gap-1"
          >
            <span>Back to Conversations</span>
          </button>
          <h1 className="text-2xl font-bold text-slate-100">
            {conversation.title || "Untitled Conversation"}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Created {formatDate(conversation.created_at)}
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            <span>PHI Mode:</span>
            <span className="font-medium text-slate-200">
              {phiModeDraft
                ? phiModeDraft === "demo"
                  ? "Demo (PHI-conscious)"
                  : "Clinical"
                : "Not set"}
            </span>
            {tagsDraft.length > 0 && (
              <>
                <span className="ml-4">Tags:</span>
                <span className="flex flex-wrap gap-1">
                  {tagsDraft.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-slate-800 text-[11px] text-slate-200 border border-slate-700"
                    >
                      {tag}
                    </span>
                  ))}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport("json")}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md text-sm border border-slate-700"
          >
            Export JSON
          </button>
          <button
            onClick={() => handleExport("markdown")}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md text-sm border border-slate-700"
          >
            Export Markdown
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider">
            User
          </div>
          <div className="text-lg font-semibold text-slate-200 mt-1 truncate">
            {conversation.user_email || conversation.user_id.slice(0, 8)}
          </div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider">
            Messages
          </div>
          <div className="text-lg font-semibold text-slate-200 mt-1">
            {conversation.message_count}
          </div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider">
            Branches
          </div>
          <div className="text-lg font-semibold text-slate-200 mt-1">
            {conversation.branch_count}
          </div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider">
            Model
          </div>
          <div className="text-lg font-semibold text-slate-200 mt-1">
            {conversation.model || "-"}
          </div>
        </div>
      </div>

      {/* PHI Mode & Tags editor */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">
            PHI Mode & Tags
          </h2>
          {updatingMeta && (
            <span className="text-xs text-slate-400">Saving…</span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-xs text-slate-400">
              PHI Mode
            </label>
            <select
              value={phiModeDraft}
              onChange={(e) =>
                setPhiModeDraft(
                  e.target.value as "" | "clinical" | "demo",
                )
              }
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              disabled={updatingMeta}
            >
              <option value="">Not set</option>
              <option value="clinical">Clinical</option>
              <option value="demo">Demo (PHI-conscious)</option>
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Demo mode is safer for demos and screen sharing; clinical
              mode may include PHI in retrieval and responses.
            </p>
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-slate-400">
              Tags
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tagsDraft.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-[11px] text-slate-200 border border-slate-700"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="text-slate-400 hover:text-slate-200"
                    aria-label={`Remove tag ${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {tagsDraft.length === 0 && (
                <span className="text-xs text-slate-500">
                  No tags yet. Use tags like{" "}
                  <span className="italic">dictation</span>,{" "}
                  <span className="italic">consult</span>,{" "}
                  <span className="italic">billing</span>.
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                placeholder="Add tag and press Enter"
                disabled={updatingMeta}
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md text-sm border border-slate-700 disabled:opacity-50"
                disabled={updatingMeta || !tagInput.trim()}
              >
                Add
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => handleUpdateMeta(phiModeDraft, tagsDraft)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50"
            disabled={updatingMeta}
          >
            Save Changes
          </button>
          <button
            type="button"
            onClick={() => {
              if (!conversation) return;
              setPhiModeDraft(
                (conversation.phi_mode as "clinical" | "demo" | undefined) ||
                  "",
              );
              setTagsDraft(conversation.tags || []);
              setTagInput("");
            }}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md text-sm border border-slate-700 disabled:opacity-50"
            disabled={updatingMeta}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Messages</h2>
          <span className="text-sm text-slate-400">{totalMessages} total</span>
        </div>

        <div className="divide-y divide-slate-800">
          {messagesLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 animate-pulse">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-5 w-16 bg-slate-800 rounded" />
                  <div className="h-3 w-32 bg-slate-800 rounded" />
                </div>
                <div className="h-4 w-full bg-slate-800 rounded mb-2" />
                <div className="h-4 w-3/4 bg-slate-800 rounded" />
              </div>
            ))
          ) : messages.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              No messages found.
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className="p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`px-2 py-0.5 text-xs font-medium rounded border ${getRoleColor(message.role)}`}
                  >
                    {message.role}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatDate(message.created_at)}
                  </span>
                  {message.model && (
                    <span className="text-xs text-slate-600">
                      Model: {message.model}
                    </span>
                  )}
                  {message.tokens_used && (
                    <span className="text-xs text-slate-600">
                      {message.tokens_used} tokens
                    </span>
                  )}
                  {message.branch_id && (
                    <span className="text-xs text-amber-500">
                      Branch: {message.branch_id.slice(0, 8)}
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-300 whitespace-pre-wrap break-words">
                  {message.content}
                </div>
                {message.attachments && message.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {message.attachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex items-center gap-2 px-2 py-1 bg-slate-800 rounded text-xs text-slate-400"
                      >
                        <span>{attachment.file_name}</span>
                        <span className="text-slate-600">
                          {formatFileSize(attachment.file_size)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalMessages > pageSize && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
            <div className="text-sm text-slate-400">
              Showing {page * pageSize + 1} to{" "}
              {Math.min((page + 1) * pageSize, totalMessages)} of{" "}
              {totalMessages}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 text-sm bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-600 text-slate-200 rounded border border-slate-700"
              >
                Previous
              </button>
              <span className="text-sm text-slate-400">
                Page {page + 1} of {Math.ceil(totalMessages / pageSize)}
              </span>
              <button
                onClick={() =>
                  setPage((p) =>
                    Math.min(Math.ceil(totalMessages / pageSize) - 1, p + 1),
                  )
                }
                disabled={(page + 1) * pageSize >= totalMessages}
                className="px-3 py-1 text-sm bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-600 text-slate-200 rounded border border-slate-700"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
