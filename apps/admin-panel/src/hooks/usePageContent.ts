/**
 * usePageContent - API hooks for enhanced document content management
 *
 * Provides hooks for fetching, updating, and regenerating page content
 * with GPT-4 Vision analysis.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { fetchAPI } from "../lib/api";

// Content block types matching backend structure
export interface ContentBlock {
  type: "text" | "heading" | "table" | "figure";
  content?: string;
  headers?: string[];
  rows?: string[][];
  caption?: string;
  figure_id?: string;
  description?: string;
  bbox?: number[];
  style?: {
    font_size?: number;
    is_header?: boolean;
  };
}

export interface PageContent {
  page_number: number;
  content_blocks: ContentBlock[];
  voice_narration: string;
  raw_text: string;
  word_count: number;
  has_figures: boolean;
}

export interface EnhancedStructure {
  pages: PageContent[];
  metadata: {
    total_pages: number;
    processing_cost?: number;
    processed_at?: string;
  };
}

export interface EnhancedContentResponse {
  document_id: string;
  title: string;
  processing_stage: string;
  processing_progress: number;
  page_images_path: string | null;
  enhanced_structure: EnhancedStructure | null;
  // When fetching single page
  page?: PageContent;
}

// Hook for fetching enhanced page content
export function usePageContent(documentId: string, pageNumber?: number) {
  const [data, setData] = useState<EnhancedContentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const fetch = useCallback(async () => {
    if (!documentId) return;

    setLoading(true);
    setError(null);

    try {
      const params = pageNumber ? `?page=${pageNumber}` : "";
      const response = await fetchAPI<EnhancedContentResponse>(
        `/api/admin/kb/documents/${documentId}/enhanced-content${params}`
      );
      if (isMountedRef.current) {
        setData(response);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch content";
      if (isMountedRef.current) {
        setError(message);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [documentId, pageNumber]);

  useEffect(() => {
    isMountedRef.current = true;
    fetch();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

// Hook for saving page content updates
export function useSavePageContent() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const savePageContent = useCallback(
    async (
      documentId: string,
      pageNumber: number,
      contentBlocks: ContentBlock[],
      voiceNarration: string
    ): Promise<boolean> => {
      setSaving(true);
      setError(null);

      try {
        await fetchAPI(
          `/api/admin/kb/documents/${documentId}/page/${pageNumber}/content`,
          {
            method: "PUT",
            body: JSON.stringify({
              content_blocks: contentBlocks,
              voice_narration: voiceNarration,
            }),
          }
        );
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to save content";
        setError(message);
        return false;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  return { savePageContent, saving, error, clearError: () => setError(null) };
}

// Hook for regenerating page AI analysis
export function useRegeneratePageAI() {
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regeneratePage = useCallback(
    async (documentId: string, pageNumber: number): Promise<PageContent | null> => {
      setRegenerating(true);
      setError(null);

      try {
        const response = await fetchAPI<{ page: PageContent }>(
          `/api/admin/kb/documents/${documentId}/page/${pageNumber}/regenerate`,
          {
            method: "POST",
          }
        );
        return response.page;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to regenerate";
        setError(message);
        return null;
      } finally {
        setRegenerating(false);
      }
    },
    []
  );

  return { regeneratePage, regenerating, error, clearError: () => setError(null) };
}

// Hook for fetching page image URL
export function usePageImageUrl(documentId: string, pageNumber: number): string {
  // Return the API endpoint URL for the page image
  // The actual auth token will be added by the fetch call
  const baseUrl = import.meta.env.VITE_API_URL || "";
  return `${baseUrl}/api/admin/kb/documents/${documentId}/page-image/${pageNumber}`;
}

// Hook for processing existing document with enhanced extraction
export function useProcessEnhanced() {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processDocument = useCallback(async (documentId: string): Promise<boolean> => {
    setProcessing(true);
    setError(null);

    try {
      await fetchAPI(`/api/admin/kb/documents/${documentId}/process-enhanced`, {
        method: "POST",
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to process document";
      setError(message);
      return false;
    } finally {
      setProcessing(false);
    }
  }, []);

  return { processDocument, processing, error, clearError: () => setError(null) };
}
