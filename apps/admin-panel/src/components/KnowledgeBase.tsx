import { useKnowledgeDocuments } from "../hooks/useKnowledgeDocuments";
import { useIndexingJobs } from "../hooks/useIndexingJobs";
import { useState } from "react";
import { fetchAPI } from "../lib/api";

export function KnowledgeBase() {
  const { docs, loading: docsLoading } = useKnowledgeDocuments();
  const { jobs, loading: jobsLoading } = useIndexingJobs();
  const [phiConscious, setPhiConscious] = useState(false);

  return (
    <section id="kb" className="flex-1 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            Knowledge Base
          </h2>
          <p className="text-xs text-slate-500">
            Textbooks, journals, guidelines, and notes indexed for RAG.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
            <input
              type="checkbox"
              checked={phiConscious}
              onChange={(e) => setPhiConscious(e.target.checked)}
              className="h-3 w-3 rounded border-slate-600 bg-slate-950"
            />
            <span>
              PHI-conscious mode{" "}
              <span className="text-slate-500">
                (exclude high-risk PHI in test queries)
              </span>
            </span>
          </label>
          <button className="px-3 py-1.5 text-xs rounded bg-slate-100 text-slate-900 hover:bg-white">
            + Upload document
          </button>
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 text-xs">
        <div className="bg-slate-950/70 border border-slate-800 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
            <div className="font-medium text-slate-200 text-xs">Documents</div>
            {docsLoading && (
              <div className="text-[10px] text-slate-500">Loading…</div>
            )}
          </div>
          <table className="w-full border-collapse text-[11px]">
            <thead className="bg-slate-950">
              <tr className="border-b border-slate-800">
                <th className="text-left px-3 py-2 text-slate-500 font-normal">
                  Name
                </th>
                <th className="text-left px-3 py-2 text-slate-500 font-normal">
                  Type
                </th>
                <th className="text-left px-3 py-2 text-slate-500 font-normal">
                  Version
                </th>
                <th className="text-left px-3 py-2 text-slate-500 font-normal">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr
                  key={d.id}
                  className="border-b border-slate-900 hover:bg-slate-900"
                >
                  <td className="px-3 py-2 text-slate-100">{d.name}</td>
                  <td className="px-3 py-2 text-slate-400">{d.type}</td>
                  <td className="px-3 py-2 text-slate-400">
                    {d.version ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {d.indexed ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-700/60">
                        indexed
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-200 border border-slate-600">
                        pending
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {docs.length === 0 && !docsLoading && (
                <tr>
                  <td
                    className="px-3 py-4 text-slate-500 text-center"
                    colSpan={4}
                  >
                    No documents yet. Upload a PDF or import from Nextcloud.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="bg-slate-950/70 border border-slate-800 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
            <div className="font-medium text-slate-200 text-xs">
              Indexing Jobs
            </div>
            {jobsLoading && (
              <div className="text-[10px] text-slate-500">Loading…</div>
            )}
          </div>
          <div className="p-3 space-y-2 text-[11px]">
            {jobs.map((j) => (
              <div
                key={j.id}
                className="border border-slate-800 rounded px-3 py-2 flex items-center justify-between"
              >
                <div>
                  <div className="text-slate-100 font-medium">
                    {j.documentId}
                  </div>
                  <div className="text-slate-500 text-[10px]">Job {j.id}</div>
                </div>
                <div className="text-slate-300 text-[10px] uppercase tracking-wide">
                  {j.state}
                </div>
              </div>
            ))}
            {jobs.length === 0 && !jobsLoading && (
              <div className="text-slate-500 text-[11px]">
                No indexing jobs yet. When documents are uploaded, jobs will
                appear here.
              </div>
            )}
          </div>
        </div>
      </div>
      {import.meta.env.DEV && (
        <div className="text-xs">
          <RagTestPanel phiConscious={phiConscious} />
        </div>
      )}
    </section>
  );
}

interface RagTestPanelProps {
  phiConscious: boolean;
}

interface RagSearchResult {
  chunk_id: string;
  document_id: string;
  content: string;
  score: number;
  title?: string | null;
  source_type?: string | null;
  source_tag?: string | null;
  metadata?: {
    phi_risk?: string;
    [key: string]: unknown;
  };
}

interface AdvancedSearchResponse {
  query: string;
  mode?: string;
  results: RagSearchResult[];
  total_results: number;
  applied_filters?: Record<string, unknown>;
}

function RagTestPanel({ phiConscious }: RagTestPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RagSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<
    Record<string, unknown> | null
  >(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setResults([]);
    setAppliedFilters(null);

    try {
      const body = {
        query: trimmed,
        top_k: 5,
        mode: "precise",
        exclude_phi: phiConscious,
        include_metrics: true,
      };

      const response = await fetchAPI<AdvancedSearchResponse>(
        "/api/search/advanced",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );

      setResults(response.results || []);
      setAppliedFilters(response.applied_filters || null);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to run test query";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const renderPhiBadge = (phiRisk?: string) => {
    if (!phiRisk || phiRisk === "none") return null;

    let classes =
      "px-1.5 py-0.5 rounded text-[10px] border border-slate-700/60 bg-slate-900 text-slate-300";
    let label = "PHI";

    if (phiRisk === "high") {
      classes =
        "px-1.5 py-0.5 rounded text-[10px] bg-rose-900/60 text-rose-200 border border-rose-700/60";
      label = "PHI: High";
    } else if (phiRisk === "medium") {
      classes =
        "px-1.5 py-0.5 rounded text-[10px] bg-amber-900/60 text-amber-200 border border-amber-700/60";
      label = "PHI: Medium";
    } else if (phiRisk === "low") {
      classes =
        "px-1.5 py-0.5 rounded text-[10px] bg-emerald-900/50 text-emerald-200 border border-emerald-700/60";
      label = "PHI: Low";
    }

    return (
      <span
        className={classes}
        title="Risk level inferred from PHI detectors for this chunk's source document."
      >
        {label}
      </span>
    );
  };

  return (
    <div className="mt-4 bg-slate-950/70 border border-dashed border-slate-700 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold text-slate-200">
            Developer RAG Test
          </div>
          <div className="text-[11px] text-slate-500">
            Run ad-hoc KB searches against the advanced RAG API.
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
            PHI-conscious mode:{" "}
            <span className={phiConscious ? "text-emerald-300" : "text-slate-400"}>
              {phiConscious ? "ON (exclude high-risk)" : "OFF"}
            </span>
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 text-[11px]">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask a medical question to test RAG (dev-only)…"
          className="flex-1 px-2 py-1.5 rounded bg-slate-950 border border-slate-700 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          className="px-3 py-1.5 rounded bg-blue-600 text-white text-[11px] disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={loading || !query.trim()}
        >
          {loading ? "Searching…" : "Run query"}
        </button>
      </form>

      {error && (
        <div className="text-[11px] text-rose-300 bg-rose-900/40 border border-rose-800 rounded px-2 py-1.5">
          {error}
        </div>
      )}

      {appliedFilters && Object.keys(appliedFilters).length > 0 && (
        <div className="text-[10px] text-slate-500">
          Applied filters:{" "}
          <code className="text-[10px] text-slate-300">
            {JSON.stringify(appliedFilters)}
          </code>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r) => {
            const phiRisk =
              (r.metadata && (r.metadata.phi_risk as string | undefined)) ||
              undefined;
            const preview =
              r.content.length > 220
                ? `${r.content.slice(0, 220)}…`
                : r.content;

            return (
              <div
                key={r.chunk_id}
                className="border border-slate-800 rounded-md px-3 py-2 bg-slate-950/80"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-[11px] font-medium text-slate-100 truncate">
                    {r.title || r.document_id}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] text-slate-400">
                      score: {r.score.toFixed(3)}
                    </span>
                    {phiRisk && renderPhiBadge(phiRisk)}
                  </div>
                </div>
                <div className="text-[11px] text-slate-300 whitespace-pre-wrap">
                  {preview}
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                  <span>
                    doc:{" "}
                    <code className="text-[10px] text-slate-400">
                      {r.document_id}
                    </code>
                  </span>
                  {r.source_type && (
                    <span className="uppercase tracking-wide">
                      {r.source_type}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && results.length === 0 && query && (
        <div className="text-[11px] text-slate-500">
          No results returned for this query.
        </div>
      )}
    </div>
  );
}
