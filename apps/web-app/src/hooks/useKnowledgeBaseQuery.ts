import { useState, useCallback } from "react";
import { useAuth } from "../hooks/useAuth";
import { useAnalytics } from "../hooks/useAnalytics";
import type { KBSearchResult, KBRAGAnswer } from "@voiceassist/types";

interface UseKnowledgeBaseQueryState {
  question: string;
  setQuestion: (value: string) => void;
  answer: string | null;
  sources: KBRAGAnswer["sources"];
  isLoading: boolean;
  error: string | null;
  results: KBSearchResult[];
  runQuery: () => Promise<void>;
}

/**
 * Lightweight hook for querying the user-facing KB + RAG surface.
 *
 * Uses /api/kb/documents/search for quick document lookup and
 * /api/kb/query for a full RAG-style answer.
 */
export function useKnowledgeBaseQuery(): UseKnowledgeBaseQueryState {
  const { apiClient } = useAuth();
  const { trackEvent } = useAnalytics();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<KBRAGAnswer["sources"]>([]);
  const [results, setResults] = useState<KBSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runQuery = useCallback(async () => {
    const trimmed = question.trim();
    if (!trimmed) {
      setError("Please enter a question for the knowledge base.");
      return;
    }

    setIsLoading(true);
    setError(null);

    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    trackEvent("custom", "kb.query_started", {
      category: "kb",
      properties: {
        channel: "chat",
        questionLength: trimmed.length,
      },
    });

    try {
      // 1) Quick search to surface potentially relevant documents
      const kbResults = await apiClient.searchKBDocuments({
        query: trimmed,
        searchType: "semantic",
        limit: 5,
      });
      setResults(kbResults);

      // 2) RAG-style answer that uses the same KB
      const kbAnswer = await apiClient.queryKB({
        question: trimmed,
        contextDocuments: 5,
      });

      setAnswer(kbAnswer.answer);
      setSources(kbAnswer.sources);

      const finishedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      const latencyMs = Math.max(finishedAt - startedAt, 0);

      trackEvent("custom", "kb.query_completed", {
        category: "kb",
        value: latencyMs,
        properties: {
          channel: "chat",
          latencyMs,
          hasAnswer: Boolean(kbAnswer.answer),
          sourcesCount: kbAnswer.sources?.length ?? 0,
        },
      });
    } catch (err) {
      console.error("[useKnowledgeBaseQuery] RAG query failed", err);
      const message =
        err instanceof Error
          ? err.message
          : "Unable to query knowledge base at this time.";

      setError(message);

      trackEvent("custom", "kb.query_failed", {
        category: "kb",
        properties: {
          channel: "chat",
          errorMessage: message,
        },
      });
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, question, trackEvent]);

  return {
    question,
    setQuestion,
    answer,
    sources,
    isLoading,
    error,
    results,
    runQuery,
  };
}
