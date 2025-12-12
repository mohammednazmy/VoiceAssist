import { useMemo, useState, useCallback } from "react";
import type { KnowledgeDocument } from "../../hooks/useKnowledgeDocuments";

export type DocumentStatus = "indexed" | "pending" | "reindexing" | "failed";

export interface DocumentRow extends KnowledgeDocument {
  status: DocumentStatus;
  sizeMb?: number;
  source?: string;
  // Structure-related fields (from PDF parsing)
  totalPages?: number | null;
  hasToc?: boolean;
  hasFigures?: boolean;
  chunksIndexed?: number;
  // Ownership/visibility fields
  ownerId?: string | null;
  ownerName?: string | null;
  isPublic?: boolean;
  sourceType?: string;
  phiRisk?: string | null;
}

// Filter state interface
export interface DocumentFilters {
  search: string;
  status: DocumentStatus | "all";
  type: string | "all";
  visibility: "all" | "public" | "private";
  source: "all" | "system" | "user";
  hasStructure: "all" | "toc" | "figures" | "both";
  phiRisk: "all" | "any" | "high";
}

const defaultFilters: DocumentFilters = {
  search: "",
  status: "all",
  type: "all",
  visibility: "all",
  source: "all",
  hasStructure: "all",
  phiRisk: "all",
};

interface DocumentTableProps {
  documents: DocumentRow[];
  loading?: boolean;
  onDelete: (ids: string[]) => Promise<void> | void;
  onReindex: (ids: string[]) => Promise<void> | void;
  onOpenAudit: (doc: DocumentRow) => void;
  onOpenPreview?: (doc: DocumentRow) => void;
  narrationCoverage?: Record<
    string,
    { coverage_percent: number; ready: number; total_pages: number }
  >;
}

export function DocumentTable({
  documents,
  loading,
  onDelete,
  onReindex,
  onOpenAudit,
  onOpenPreview,
  narrationCoverage,
}: DocumentTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [filters, setFilters] = useState<DocumentFilters>(defaultFilters);
  const [showFilters, setShowFilters] = useState(false);

  // Get unique document types for filter dropdown
  const documentTypes = useMemo(() => {
    const types = new Set(documents.map((d) => d.type).filter(Boolean));
    return Array.from(types).sort();
  }, [documents]);

  // Apply filters to documents
  const filteredDocs = useMemo(() => {
    return documents.filter((doc) => {
      // Search filter (matches name/title)
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const nameMatch = doc.name?.toLowerCase().includes(searchLower);
        const typeMatch = doc.type?.toLowerCase().includes(searchLower);
        if (!nameMatch && !typeMatch) return false;
      }

      // Status filter
      if (filters.status !== "all" && doc.status !== filters.status) {
        return false;
      }

      // Type filter
      if (filters.type !== "all" && doc.type !== filters.type) {
        return false;
      }

      // Visibility filter
      if (filters.visibility !== "all") {
        if (filters.visibility === "public" && !doc.isPublic) return false;
        if (filters.visibility === "private" && doc.isPublic) return false;
      }

      // Source filter
      if (filters.source !== "all") {
        const isUserUpload = doc.sourceType?.startsWith("user_") || doc.sourceType === "uploaded";
        if (filters.source === "user" && !isUserUpload) return false;
        if (filters.source === "system" && isUserUpload) return false;
      }

      // Structure filter
      if (filters.hasStructure !== "all") {
        if (filters.hasStructure === "toc" && !doc.hasToc) return false;
        if (filters.hasStructure === "figures" && !doc.hasFigures) return false;
        if (filters.hasStructure === "both" && (!doc.hasToc || !doc.hasFigures)) return false;
      }

      // PHI risk filter
      if (filters.phiRisk !== "all") {
        const risk = doc.phiRisk || "none";
        if (filters.phiRisk === "any" && (risk === "none" || !risk)) return false;
        if (filters.phiRisk === "high" && risk !== "high") return false;
      }

      return true;
    });
  }, [documents, filters]);

  // Update filter
  const updateFilter = useCallback(<K extends keyof DocumentFilters>(key: K, value: DocumentFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    // Clear selection when filters change
    setSelected(new Set());
    setSelectAll(false);
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilters(defaultFilters);
    setSelected(new Set());
    setSelectAll(false);
  }, []);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return (
      filters.search !== "" ||
      filters.status !== "all" ||
      filters.type !== "all" ||
      filters.visibility !== "all" ||
      filters.source !== "all" ||
      filters.hasStructure !== "all" ||
      filters.phiRisk !== "all"
    );
  }, [filters]);

  const toggleAll = () => {
    if (selectAll) {
      setSelected(new Set());
      setSelectAll(false);
      return;
    }
    // Select all filtered documents
    setSelected(new Set(filteredDocs.map((d) => d.id)));
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
      setSelectAll(next.size === filteredDocs.length && filteredDocs.length > 0);
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

  const getEnhancedProcessingText = (doc: DocumentRow): string | null => {
    const stage = doc.processingStage || "";
    const progress =
      typeof doc.processingProgress === "number" ? doc.processingProgress : 0;

    if (!stage || stage === "pending") {
      return null;
    }

    const clampedProgress =
      progress > 0 ? Math.max(0, Math.min(100, Math.round(progress))) : 0;

    if (stage === "complete") {
      return "Enhanced complete";
    }

    if (stage === "failed") {
      return "Enhanced failed";
    }

    const label =
      stage === "extracting"
        ? "Extracting"
        : stage === "analyzing"
          ? "Analyzing"
          : stage === "indexing"
            ? "Indexing"
            : stage;

    if (clampedProgress > 0) {
      return `${label}… ${clampedProgress}%`;
    }

    return `${label}…`;
  };

  const renderPhiBadge = (phiRisk?: string | null) => {
    if (!phiRisk || phiRisk === "none") return null;

    let classes =
      "px-1.5 py-0.5 rounded text-xs border border-slate-700/60 bg-slate-800 text-slate-300";
    let label = "PHI";

    if (phiRisk === "high") {
      classes = "px-1.5 py-0.5 rounded text-xs bg-rose-900/50 text-rose-300 border border-rose-700/60";
      label = "PHI: High";
    } else if (phiRisk === "medium") {
      classes =
        "px-1.5 py-0.5 rounded text-xs bg-amber-900/50 text-amber-300 border border-amber-700/60";
      label = "PHI: Medium";
    } else if (phiRisk === "low") {
      classes =
        "px-1.5 py-0.5 rounded text-xs bg-emerald-900/40 text-emerald-300 border border-emerald-700/60";
      label = "PHI: Low";
    }

    return (
      <span
        className={classes}
        title="Risk that this document or its voice narrations contain PHI (for internal KB hygiene)."
      >
        {label}
      </span>
    );
  };

  const selectedCount = selected.size;

  const sortedDocs = useMemo(
    () => [...filteredDocs].sort((a, b) => a.name.localeCompare(b.name)),
    [filteredDocs],
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
          {hasActiveFilters ? (
            <div className="space-y-2">
              <p>No documents match your filters.</p>
              <button
                onClick={clearFilters}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            "No documents found. Upload a PDF or text file to get started."
          )}
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
            {doc.totalPages && <span>{doc.totalPages} pages</span>}
            <span>
              Size: {doc.sizeMb ? `${doc.sizeMb.toFixed(1)} MB` : "—"}
            </span>
            <span>
              Indexed:{" "}
              {doc.lastIndexedAt
                ? new Date(doc.lastIndexedAt).toLocaleDateString()
                : "—"}
            </span>
            {doc.hasEnhancedStructure && narrationCoverage?.[doc.id] && (
              <span className="flex items-center gap-1 text-emerald-300">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Narration:{" "}
                {narrationCoverage[doc.id].coverage_percent.toFixed(0)}%
              </span>
            )}
            {getEnhancedProcessingText(doc) && (
              <span className="text-slate-300">
                {/* Keep a single text node so tests can reliably match */}
                Enhanced: {getEnhancedProcessingText(doc)}
              </span>
            )}
          </div>

          {/* Structure badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {doc.hasToc && (
              <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-900/40 text-emerald-300 border border-emerald-700/40">
                TOC
              </span>
            )}
            {doc.hasFigures && (
              <span className="px-1.5 py-0.5 rounded text-xs bg-purple-900/40 text-purple-300 border border-purple-700/40">
                Figures
              </span>
            )}
            {doc.hasEnhancedStructure && (
              <span
                className="px-1.5 py-0.5 rounded text-xs bg-sky-900/40 text-sky-300 border border-sky-700/40"
                title={getEnhancedProcessingText(doc) || "Enhanced content available"}
              >
                Enhanced
              </span>
            )}
            {doc.isPublic && (
              <span className="px-1.5 py-0.5 rounded text-xs bg-blue-900/40 text-blue-300 border border-blue-700/40">
                Public
              </span>
            )}
            {doc.sourceType?.startsWith("user_") && (
              <span className="px-1.5 py-0.5 rounded text-xs bg-amber-900/40 text-amber-300 border border-amber-700/40">
                User Upload
              </span>
            )}
            {renderPhiBadge(doc.phiRisk)}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
            {onOpenPreview && (
              <button
                className="text-xs text-emerald-300 hover:text-emerald-100 px-2 py-1"
                onClick={() => onOpenPreview(doc)}
              >
                Preview
              </button>
            )}
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
      {/* Header with search and filters */}
      <div className="px-4 py-3 border-b border-slate-800 space-y-3">
        {/* Top row: Title, Search, and Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">Documents</div>
              <p className="text-xs text-slate-500 hidden sm:block">
                {filteredDocs.length} of {documents.length} documents
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-xl">
            {/* Search input */}
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search documents..."
                value={filters.search}
                onChange={(e) => updateFilter("search", e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-950 border border-slate-700 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-600"
              />
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Filter toggle button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-1.5 text-xs rounded border transition-colors flex items-center gap-1.5 ${
                hasActiveFilters
                  ? "bg-blue-900/40 text-blue-200 border-blue-700/60"
                  : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filters
              {hasActiveFilters && (
                <span className="px-1.5 py-0.5 text-[10px] bg-blue-600 text-white rounded-full">
                  {[filters.status, filters.type, filters.visibility, filters.source, filters.hasStructure]
                    .filter((v) => v !== "all").length}
                </span>
              )}
            </button>

            {/* Clear filters button */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                title="Clear all filters"
              >
                Clear
              </button>
            )}
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

        {/* Filter row (collapsible) */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800">
            {/* Status filter */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-slate-500">Status:</label>
              <select
                value={filters.status}
                onChange={(e) => updateFilter("status", e.target.value as DocumentFilters["status"])}
                className="px-2 py-1 text-xs bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-blue-600"
              >
                <option value="all">All</option>
                <option value="indexed">Indexed</option>
                <option value="pending">Pending</option>
                <option value="reindexing">Reindexing</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            {/* Type filter */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-slate-500">Type:</label>
              <select
                value={filters.type}
                onChange={(e) => updateFilter("type", e.target.value)}
                className="px-2 py-1 text-xs bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-blue-600"
              >
                <option value="all">All</option>
                {documentTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            {/* Visibility filter */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-slate-500">Visibility:</label>
              <select
                value={filters.visibility}
                onChange={(e) => updateFilter("visibility", e.target.value as DocumentFilters["visibility"])}
                className="px-2 py-1 text-xs bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-blue-600"
              >
                <option value="all">All</option>
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>

            {/* Source filter */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-slate-500">Source:</label>
              <select
                value={filters.source}
                onChange={(e) => updateFilter("source", e.target.value as DocumentFilters["source"])}
                className="px-2 py-1 text-xs bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-blue-600"
              >
                <option value="all">All</option>
                <option value="system">System</option>
                <option value="user">User Upload</option>
              </select>
            </div>

            {/* Structure filter */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-slate-500">Structure:</label>
              <select
                value={filters.hasStructure}
                onChange={(e) => updateFilter("hasStructure", e.target.value as DocumentFilters["hasStructure"])}
                className="px-2 py-1 text-xs bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-blue-600"
              >
                <option value="all">All</option>
                <option value="toc">Has TOC</option>
                <option value="figures">Has Figures</option>
                <option value="both">Has Both</option>
              </select>
            </div>

            {/* PHI risk filter */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-slate-500">PHI Risk:</label>
              <select
                value={filters.phiRisk}
                onChange={(e) => updateFilter("phiRisk", e.target.value as DocumentFilters["phiRisk"])}
                className="px-2 py-1 text-xs bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-blue-600"
              >
                <option value="all">All</option>
                <option value="any">Any PHI</option>
                <option value="high">High only</option>
              </select>
            </div>
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
            <th className="px-4 py-3 text-left">Pages</th>
            <th className="px-4 py-3 text-left">Structure</th>
            <th className="px-4 py-3 text-left">Chunks</th>
            <th className="px-4 py-3 text-left">Visibility</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {loading && (
            <tr>
              <td
                colSpan={9}
                className="px-4 py-6 text-center text-slate-500 text-sm"
              >
                Loading documents…
              </td>
            </tr>
          )}
          {!loading && sortedDocs.length === 0 && (
            <tr>
              <td
                colSpan={9}
                className="px-4 py-6 text-center text-slate-500 text-sm"
              >
                {hasActiveFilters ? (
                  <div className="space-y-2">
                    <p>No documents match your filters.</p>
                    <button
                      onClick={clearFilters}
                      className="text-sm text-blue-400 hover:text-blue-300"
                    >
                      Clear all filters
                    </button>
                  </div>
                ) : (
                  "No documents found. Upload a PDF or text file to get started."
                )}
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
                    {doc.totalPages ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {doc.hasToc && (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-900/40 text-emerald-300 border border-emerald-700/40">
                          TOC
                        </span>
                      )}
                      {doc.hasFigures && (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-purple-900/40 text-purple-300 border border-purple-700/40">
                          Figures
                        </span>
                      )}
                      {doc.hasEnhancedStructure && (
                        <span
                          className="px-1.5 py-0.5 rounded text-xs bg-sky-900/40 text-sky-300 border border-sky-700/40"
                          title={getEnhancedProcessingText(doc) || "Enhanced content available"}
                        >
                          Enhanced
                        </span>
                      )}
                      {!doc.hasToc && !doc.hasFigures && !doc.hasEnhancedStructure && (
                        <span className="text-slate-500">—</span>
                      )}
                    </div>
                    {getEnhancedProcessingText(doc) && (
                      <div className="mt-1 text-xs text-slate-400">
                        {getEnhancedProcessingText(doc)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {doc.chunksIndexed ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {doc.isPublic ? (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-blue-900/40 text-blue-300 border border-blue-700/40">
                          Public
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-slate-800 text-slate-400 border border-slate-700">
                          Private
                        </span>
                      )}
                      {doc.sourceType?.startsWith("user_") && (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-amber-900/40 text-amber-300 border border-amber-700/40">
                          User
                        </span>
                      )}
                      {renderPhiBadge(doc.phiRisk)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right space-x-3">
                    {onOpenPreview && (
                      <button
                        className="text-xs text-emerald-300 hover:text-emerald-100"
                        onClick={() => onOpenPreview(doc)}
                      >
                        Preview
                      </button>
                    )}
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
