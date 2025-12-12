import { useMemo, useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@voiceassist/ui";
import { useKnowledgeBaseQuery } from "../../hooks/useKnowledgeBaseQuery";
import { useAnalytics } from "../../hooks/useAnalytics";

export interface KnowledgeBasePanelProps {
  /** Optional label to show above the search box. */
  title?: string;
  /** Optional description text under the title. */
  description?: string;
  /**
   * Optional callback to insert the current KB answer into another surface
   * (for example, pre-filling the chat input).
   */
  onInsertAnswer?: (answer: string) => void;
}

/**
 * Compact Knowledge Base search + RAG panel.
 *
 * Uses the /api/kb/documents/search and /api/kb/query endpoints via the
 * shared useKnowledgeBaseQuery hook. Designed to be embedded alongside
 * chat or other primary views.
 */
export function KnowledgeBasePanel({
  title = "Knowledge Base",
  description = "Search your indexed documents and get a KB-backed answer.",
  onInsertAnswer,
}: KnowledgeBasePanelProps) {
  const kb = useKnowledgeBaseQuery();
  const { trackEvent } = useAnalytics();

  type FilterId = "all" | "guidelines" | "policies" | "ehr_notes" | "other";
  const [activeFilter, setActiveFilter] = useState<FilterId>("all");

  const filteredSources = useMemo(() => {
    if (!kb.sources || kb.sources.length === 0) {
      return [];
    }

    if (activeFilter === "all") {
      return kb.sources;
    }

    const matchesFilter = (category: string | undefined | null, filter: FilterId) => {
      const value = (category || "").toLowerCase();
      if (!value) return filter === "other";

      if (filter === "guidelines") {
        return value.includes("guideline") || value.includes("protocol");
      }
      if (filter === "policies") {
        return value.includes("policy") || value.includes("procedure");
      }
      if (filter === "ehr_notes") {
        return value.includes("ehr") || value.includes("note") || value.includes("progress");
      }
      if (filter === "other") {
        return (
          !value.includes("guideline") &&
          !value.includes("protocol") &&
          !value.includes("policy") &&
          !value.includes("procedure") &&
          !value.includes("ehr") &&
          !value.includes("note") &&
          !value.includes("progress")
        );
      }
      return false;
    };

    return kb.sources.filter((source) => matchesFilter(source.category, activeFilter));
  }, [activeFilter, kb.sources]);

  const handleInsertAnswer = () => {
    if (!onInsertAnswer || !kb.answer) return;
    const docCount = kb.sources.length;
    const prefixBase =
      docCount > 0
        ? `KB answer (from ${docCount} document${docCount === 1 ? "" : "s"}): `
        : "KB answer: ";
    const text = `${prefixBase}${kb.answer}`;
    onInsertAnswer(text);
    trackEvent("custom", "kb.answer_inserted_into_chat", {
      category: "kb",
      properties: {
        channel: "chat",
        answerLength: kb.answer.length,
        sourcesCount: kb.sources.length,
      },
    });
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        <p className="mt-1 text-xs text-neutral-500">{description}</p>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3 overflow-hidden">
        <label htmlFor="kb-query-input" className="sr-only">
          Knowledge base query
        </label>
        <textarea
          id="kb-query-input"
          aria-label="Enter your knowledge base query"
          aria-describedby="kb-query-description"
          className="w-full min-h-[80px] rounded-md border border-neutral-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          placeholder='e.g. "First-line therapy for new-onset AFib?"'
          value={kb.question}
          onChange={(e) => kb.setQuestion(e.target.value)}
        />
        <span id="kb-query-description" className="sr-only">
          Type a clinical question to search the knowledge base
        </span>
        <div className="flex items-center justify-between">
          <Button
            size="sm"
            onClick={() => void kb.runQuery()}
            disabled={kb.isLoading || !kb.question.trim()}
            className="text-xs px-3 py-1.5"
          >
            {kb.isLoading ? "Searching..." : "Ask KB"}
          </Button>
        </div>

        <div
          className="mt-2 flex-1 overflow-y-auto space-y-2 border-t border-slate-800 pt-2"
          aria-live="polite"
          aria-atomic="false"
        >
          {kb.isLoading && (
            <p className="text-xs text-slate-500" role="status" aria-busy="true">
              Searching knowledge base…
            </p>
          )}

          {!kb.isLoading && kb.error && (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2"
            >
              <div className="text-[11px] font-semibold text-red-300 mb-1">
                Unable to query KB right now
              </div>
              <p className="text-[11px] text-red-200 mb-2">
                {kb.error || "Please try again in a few moments."}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="text-[11px] px-2 py-1"
                onClick={() => void kb.runQuery()}
              >
                Try again
              </Button>
            </div>
          )}

          {!kb.isLoading && !kb.error && kb.answer && (
            <>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">
                  KB Answer
                </div>
                {onInsertAnswer && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[11px] px-2 py-1"
                    onClick={handleInsertAnswer}
                  >
                    Insert into message
                  </Button>
                )}
              </div>
              <div className="rounded-md border border-emerald-700/60 bg-emerald-950/40 px-3 py-2">
                <p className="text-xs text-slate-100 whitespace-pre-line">
                  {kb.answer}
                </p>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] font-semibold uppercase text-slate-500">
                    Sources
                  </div>
                  {kb.sources.length > 0 && (
                    <p className="text-[10px] text-slate-400">
                      These documents were most influential for this answer.
                    </p>
                  )}
                </div>

                {kb.sources.length === 0 && (
                  <p className="text-xs text-slate-500">
                    No strong matches; try a more specific clinical term or
                    include key medications or diagnoses.
                  </p>
                )}

                {kb.sources.length > 0 && (
                  <>
                    <div
                      className="flex flex-wrap gap-1 mb-2"
                      role="group"
                      aria-label="Filter sources by category"
                    >
                      {[
                        { id: "all" as FilterId, label: "All" },
                        { id: "guidelines" as FilterId, label: "Guidelines" },
                        { id: "policies" as FilterId, label: "Policies" },
                        { id: "ehr_notes" as FilterId, label: "EHR Notes" },
                        { id: "other" as FilterId, label: "Other" },
                      ].map((filter) => (
                        <button
                          key={filter.id}
                          type="button"
                          onClick={() => setActiveFilter(filter.id)}
                          aria-pressed={activeFilter === filter.id}
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${
                            activeFilter === filter.id
                              ? "border-emerald-400 bg-emerald-900/60 text-emerald-100"
                              : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-emerald-500 hover:text-emerald-100"
                          }`}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>

                    {filteredSources.length === 0 ? (
                      <p className="text-[11px] text-slate-500">
                        No sources in this category. Try a different filter to
                        see other documents that contributed.
                      </p>
                    ) : (
                      <ul className="space-y-1 text-[11px] text-slate-300">
                        {filteredSources.map((source) => (
                          <li key={source.id}>
                            •{" "}
                            <span className="font-medium">
                              {source.title}
                            </span>
                            {source.category && (
                              <span className="ml-1 text-slate-500">
                                ({source.category})
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {!kb.isLoading && !kb.error && !kb.answer && (
            <p className="text-xs text-slate-500">
              KB answers will appear here once you run a query.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
