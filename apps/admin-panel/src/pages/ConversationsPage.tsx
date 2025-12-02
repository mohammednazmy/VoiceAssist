import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAPI } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

interface Conversation {
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
}

interface ConversationsResponse {
  conversations: Conversation[];
  total: number;
  limit: number;
  offset: number;
}

export function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [userIdFilter, setUserIdFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { isViewer } = useAuth();

  useEffect(() => {
    loadConversations();
  }, [page, searchTerm, userIdFilter]);

  const loadConversations = async () => {
    setLoading(true);
    try {
      const offset = page * pageSize;
      let url = `/api/admin/conversations?offset=${offset}&limit=${pageSize}`;

      if (searchTerm) {
        url += `&title_search=${encodeURIComponent(searchTerm)}`;
      }
      if (userIdFilter) {
        url += `&user_id=${encodeURIComponent(userIdFilter)}`;
      }

      const data = await fetchAPI<ConversationsResponse>(url);
      setConversations(data.conversations);
      setTotal(data.total);
      setError(null);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load conversations";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetail = (id: string) => {
    navigate(`/conversations/${id}`);
  };

  const handleExport = async (id: string) => {
    try {
      const data = await fetchAPI<{
        export: { content: string; format: string };
      }>(`/api/admin/conversations/${id}/export`, {
        method: "POST",
        body: JSON.stringify({ format: "json" }),
      });

      const blob = new Blob([JSON.stringify(data.export.content, null, 2)], {
        type: "application/json",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `conversation-${id}.json`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert(
        err instanceof Error ? err.message : "Failed to export conversation",
      );
    }
  };

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedId) || null,
    [selectedId, conversations],
  );

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const renderTableRows = () => {
    if (loading) {
      return Array.from({ length: 5 }).map((_, idx) => (
        <tr
          key={idx}
          className="divide-x divide-slate-900 bg-slate-900/30 animate-pulse"
        >
          {Array.from({ length: 7 }).map((__, cellIdx) => (
            <td key={cellIdx} className="px-4 py-3">
              <div className="h-3 w-full max-w-[140px] bg-slate-800 rounded" />
            </td>
          ))}
        </tr>
      ));
    }

    return conversations.map((conv) => (
      <tr
        key={conv.id}
        className={`hover:bg-slate-800/50 cursor-pointer ${selectedId === conv.id ? "bg-slate-900/60" : ""}`}
        onClick={() => setSelectedId(conv.id)}
      >
        <td
          className="px-4 py-3 text-sm text-slate-300 max-w-[200px] truncate"
          title={conv.title}
        >
          {conv.title || "Untitled"}
        </td>
        <td className="px-4 py-3 text-sm text-slate-300 truncate">
          {conv.user_email || conv.user_id.slice(0, 8)}
        </td>
        <td className="px-4 py-3 text-sm text-slate-400 text-center">
          {conv.message_count}
        </td>
        <td className="px-4 py-3 text-sm text-slate-400 text-center">
          {conv.branch_count}
        </td>
        <td className="px-4 py-3 text-sm text-slate-500">
          {conv.model || "-"}
        </td>
        <td className="px-4 py-3 text-sm text-slate-400">
          {formatDate(conv.updated_at)}
        </td>
        <td className="px-4 py-3 text-sm text-right space-x-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleViewDetail(conv.id);
            }}
            className="text-blue-400 hover:text-blue-300 transition-colors"
            title="View details"
          >
            View
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleExport(conv.id);
            }}
            className="text-green-400 hover:text-green-300 transition-colors"
            title="Export"
          >
            Export
          </button>
        </td>
      </tr>
    ));
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Conversations</h1>
          <p className="text-sm text-slate-400 mt-1">
            Browse and manage all user conversations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadConversations()}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md text-sm border border-slate-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px] max-w-md">
          <input
            type="text"
            placeholder="Search by title..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(0);
            }}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="w-64">
          <input
            type="text"
            placeholder="Filter by user ID..."
            value={userIdFilter}
            onChange={(e) => {
              setUserIdFilter(e.target.value);
              setPage(0);
            }}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-950/50 border border-red-900 rounded-lg text-red-400 flex items-center justify-between gap-4">
          <span>{error}</span>
          <button
            onClick={loadConversations}
            className="px-3 py-1 text-xs bg-red-900/50 border border-red-800 rounded-md text-red-100 hover:bg-red-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* Desktop table view */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-900 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Title
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                User
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">
                Messages
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">
                Branches
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Model
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Updated
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {renderTableRows()}
          </tbody>
        </table>

        {!loading && conversations.length === 0 && !error && (
          <div className="p-8 text-center text-slate-400">
            No conversations found.
          </div>
        )}

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
            <div className="text-sm text-slate-400">
              Showing {page * pageSize + 1} to{" "}
              {Math.min((page + 1) * pageSize, total)} of {total} conversations
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
                Page {page + 1} of {Math.ceil(total / pageSize)}
              </span>
              <button
                onClick={() =>
                  setPage((p) =>
                    Math.min(Math.ceil(total / pageSize) - 1, p + 1),
                  )
                }
                disabled={(page + 1) * pageSize >= total}
                className="px-3 py-1 text-sm bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-600 text-slate-200 rounded border border-slate-700"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="text-xs text-slate-500">Total conversations: {total}</div>

      {/* Quick preview panel */}
      {selectedConversation && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">
              Preview:{" "}
              <span className="text-blue-400">
                {selectedConversation.title || "Untitled"}
              </span>
            </h2>
            <button
              onClick={() => setSelectedId(null)}
              className="text-sm text-slate-400 hover:text-slate-200"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-slate-500">User:</span>
              <span className="ml-2 text-slate-300">
                {selectedConversation.user_email ||
                  selectedConversation.user_id.slice(0, 8)}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Messages:</span>
              <span className="ml-2 text-slate-300">
                {selectedConversation.message_count}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Branches:</span>
              <span className="ml-2 text-slate-300">
                {selectedConversation.branch_count}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Model:</span>
              <span className="ml-2 text-slate-300">
                {selectedConversation.model || "-"}
              </span>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => handleViewDetail(selectedConversation.id)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
            >
              View Full Details
            </button>
            <button
              onClick={() => handleExport(selectedConversation.id)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md text-sm border border-slate-700"
            >
              Export
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
