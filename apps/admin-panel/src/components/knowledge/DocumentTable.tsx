import { useMemo, useState } from "react";
import type { KnowledgeDocument } from "../../hooks/useKnowledgeDocuments";

export type DocumentStatus = "indexed" | "pending" | "reindexing" | "failed";

export interface DocumentRow extends KnowledgeDocument {
  status: DocumentStatus;
  sizeMb?: number;
  source?: string;
}

interface DocumentTableProps {
  documents: DocumentRow[];
  loading?: boolean;
  onDelete: (ids: string[]) => Promise<void> | void;
  onReindex: (ids: string[]) => Promise<void> | void;
  onOpenAudit: (doc: DocumentRow) => void;
}

export function DocumentTable({
  documents,
  loading,
  onDelete,
  onReindex,
  onOpenAudit,
}: DocumentTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  const toggleAll = () => {
    if (selectAll) {
      setSelected(new Set());
      setSelectAll(false);
      return;
    }
    setSelected(new Set(documents.map((d) => d.id)));
    setSelectAll(true);
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      setSelectAll(next.size === documents.length && documents.length > 0);
      return next;
    });
  };

  const bulkDelete = () => {
    if (!selected.size) return;
    onDelete(Array.from(selected));
    setSelected(new Set());
    setSelectAll(false);
  };

  const bulkReindex = () => {
    if (!selected.size) return;
    onReindex(Array.from(selected));
    setSelected(new Set());
    setSelectAll(false);
  };

  const statusBadge = (status: DocumentStatus) => {
    const common = "px-2 py-1 rounded-full text-xs font-medium";
    switch (status) {
      case "indexed":
        return (
          <span
            className={`${common} bg-emerald-500/10 text-emerald-200 border border-emerald-700/40`}
          >
            Indexed
          </span>
        );
      case "pending":
        return (
          <span
            className={`${common} bg-slate-700/40 text-slate-200 border border-slate-600`}
          >
            Pending
          </span>
        );
      case "reindexing":
        return (
          <span
            className={`${common} bg-blue-500/10 text-blue-200 border border-blue-700/40`}
          >
            Reindexing…
          </span>
        );
      case "failed":
      default:
        return (
          <span
            className={`${common} bg-rose-500/10 text-rose-200 border border-rose-700/40`}
          >
            Failed
          </span>
        );
    }
  };

  const selectedCount = selected.size;

  const sortedDocs = useMemo(
    () => [...documents].sort((a, b) => a.name.localeCompare(b.name)),
    [documents],
  );

  // Mobile card view renderer
  const renderMobileCards = () => {
    if (loading) {
      return Array.from({ length: 3 }).map((_, idx) => (
        <div
          key={idx}
          className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 animate-pulse space-y-3"
        >
          <div className="h-4 w-3/4 bg-slate-800 rounded" />
          <div className="h-3 w-1/2 bg-slate-800 rounded" />
          <div className="flex gap-2">
            <div className="h-6 w-16 bg-slate-800 rounded" />
          </div>
        </div>
      ));
    }

    if (sortedDocs.length === 0) {
      return (
        <div className="p-6 text-center text-slate-400 bg-slate-900/50 border border-slate-800 rounded-lg">
          No documents found. Upload a PDF or text file to get started.
        </div>
      );
    }

    return sortedDocs.map((doc) => {
      const isChecked = selected.has(doc.id);
      return (
        <div
          key={doc.id}
          className={`bg-slate-900/50 border rounded-lg p-4 space-y-3 ${
            isChecked ? "border-blue-700 bg-slate-900/80" : "border-slate-800"
          }`}
        >
          {/* Header with checkbox and title */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              className="h-4 w-4 mt-1 rounded border-slate-700 bg-slate-900 flex-shrink-0"
              checked={isChecked}
              onChange={() => toggleOne(doc.id)}
              aria-label={`Select ${doc.name}`}
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-200 break-words">
                {doc.name}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-slate-400">{doc.type}</span>
                {statusBadge(doc.status)}
              </div>
            </div>
          </div>

          {/* Metadata */}
          <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
            <span>Version: {doc.version ?? "—"}</span>
            <span>
              Size: {doc.sizeMb ? `${doc.sizeMb.toFixed(1)} MB` : "—"}
            </span>
            <span>
              Indexed:{" "}
              {doc.lastIndexedAt
                ? new Date(doc.lastIndexedAt).toLocaleDateString()
                : "—"}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
            <button
              className="text-xs text-slate-300 hover:text-white px-2 py-1"
              onClick={() => onOpenAudit(doc)}
            >
              Audit
            </button>
            <button
              className="text-xs text-blue-300 hover:text-blue-100 px-2 py-1"
              onClick={() => onReindex([doc.id])}
            >
              Reindex
            </button>
            <button
              className="text-xs text-rose-300 hover:text-rose-100 px-2 py-1"
              onClick={() => onDelete([doc.id])}
            >
              Delete
            </button>
          </div>
        </div>
      );
    });
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-slate-800">
        <div>
          <div className="text-sm font-semibold text-slate-100">Documents</div>
          <p className="text-xs text-slate-500 hidden sm:block">
            Bulk select to delete or reindex. Audit opens per document.
          </p>
        </div>
        {selectedCount > 0 && (
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1.5 text-xs rounded bg-rose-900/60 text-rose-100 border border-rose-700/60 hover:bg-rose-900"
              onClick={bulkDelete}
            >
              Delete ({selectedCount})
            </button>
            <button
              className="px-3 py-1.5 text-xs rounded bg-blue-900/40 text-blue-100 border border-blue-700/60 hover:bg-blue-900/60"
              onClick={bulkReindex}
            >
              Reindex
            </button>
          </div>
        )}
      </div>

      {/* Mobile card view */}
      <div className="md:hidden p-3 space-y-3">{renderMobileCards()}</div>

      {/* Desktop table view */}
      <table className="hidden md:table w-full text-sm">
        <thead className="bg-slate-950 border-b border-slate-800 text-xs text-slate-400 uppercase tracking-wide">
          <tr>
            <th className="px-4 py-3 text-left w-10">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-700 bg-slate-900"
                checked={selectAll}
                onChange={toggleAll}
                aria-label="Select all documents"
              />
            </th>
            <th className="px-4 py-3 text-left">Title</th>
            <th className="px-4 py-3 text-left">Type</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-left">Version</th>
            <th className="px-4 py-3 text-left">Size</th>
            <th className="px-4 py-3 text-left">Last Indexed</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {loading && (
            <tr>
              <td
                colSpan={8}
                className="px-4 py-6 text-center text-slate-500 text-sm"
              >
                Loading documents…
              </td>
            </tr>
          )}
          {!loading && sortedDocs.length === 0 && (
            <tr>
              <td
                colSpan={8}
                className="px-4 py-6 text-center text-slate-500 text-sm"
              >
                No documents found. Upload a PDF or text file to get started.
              </td>
            </tr>
          )}
          {!loading &&
            sortedDocs.map((doc) => {
              const isChecked = selected.has(doc.id);
              return (
                <tr key={doc.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-700 bg-slate-900"
                      checked={isChecked}
                      onChange={() => toggleOne(doc.id)}
                      aria-label={`Select ${doc.name}`}
                    />
                  </td>
                  <td className="px-4 py-3 text-slate-100 font-medium">
                    {doc.name}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{doc.type}</td>
                  <td className="px-4 py-3">{statusBadge(doc.status)}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {doc.version ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {doc.sizeMb ? `${doc.sizeMb.toFixed(1)} MB` : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {doc.lastIndexedAt
                      ? new Date(doc.lastIndexedAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right space-x-3">
                    <button
                      className="text-xs text-slate-300 hover:text-white"
                      onClick={() => onOpenAudit(doc)}
                    >
                      Audit
                    </button>
                    <button
                      className="text-xs text-blue-300 hover:text-blue-100"
                      onClick={() => onReindex([doc.id])}
                    >
                      Reindex
                    </button>
                    <button
                      className="text-xs text-rose-300 hover:text-rose-100"
                      onClick={() => onDelete([doc.id])}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
