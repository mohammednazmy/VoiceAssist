/**
 * useVoiceDocumentSession Hook
 * Manages voice document navigation sessions for reading documents aloud
 *
 * Features:
 * - Start/end document sessions
 * - Track current page and section
 * - Navigate pages and sections
 * - Get page content and TOC
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import type {
  VoiceDocumentSession,
  InactiveVoiceDocumentSession,
  VoiceDocumentPageContent,
  VoiceDocumentTOC,
} from "@voiceassist/api-client";

export interface UseVoiceDocumentSessionOptions {
  /** Conversation ID to track session for */
  conversationId: string;
  /** Auto-load session state on mount */
  autoLoad?: boolean;
}

export interface UseVoiceDocumentSessionResult {
  /** Current session state (null if no active session) */
  session: VoiceDocumentSession | null;
  /** Whether session is loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Whether a document session is active */
  isActive: boolean;

  /** Start a new document session */
  startSession: (documentId: string) => Promise<VoiceDocumentSession>;
  /** End the current session */
  endSession: () => Promise<void>;
  /** Refresh session state */
  refreshSession: () => Promise<void>;

  /** Navigate to a specific page */
  goToPage: (pageNumber: number) => Promise<VoiceDocumentPageContent>;
  /** Navigate to next page */
  nextPage: () => Promise<VoiceDocumentPageContent | null>;
  /** Navigate to previous page */
  previousPage: () => Promise<VoiceDocumentPageContent | null>;

  /** Get current page content */
  getCurrentPageContent: () => Promise<VoiceDocumentPageContent>;
  /** Get table of contents */
  getTableOfContents: () => Promise<VoiceDocumentTOC>;

  /** Update position in document */
  updatePosition: (
    page?: number,
    sectionId?: string
  ) => Promise<void>;
}

export function useVoiceDocumentSession(
  options: UseVoiceDocumentSessionOptions
): UseVoiceDocumentSessionResult {
  const { conversationId, autoLoad = true } = options;

  const { apiClient } = useAuth();
  const [session, setSession] = useState<VoiceDocumentSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isActive = session !== null;

  // Load session state
  const refreshSession = useCallback(async () => {
    if (!conversationId) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await apiClient.getVoiceDocumentSession(conversationId);

      // Check if session is active
      if ("active" in result && result.active === false) {
        setSession(null);
      } else {
        setSession(result as VoiceDocumentSession);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load session state"
      );
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, conversationId]);

  // Auto-load on mount
  useEffect(() => {
    if (autoLoad && conversationId) {
      refreshSession();
    }
  }, [autoLoad, conversationId, refreshSession]);

  // Start a new session
  const startSession = useCallback(
    async (documentId: string): Promise<VoiceDocumentSession> => {
      setIsLoading(true);
      setError(null);

      try {
        const newSession = await apiClient.startVoiceDocumentSession(
          documentId,
          conversationId
        );
        setSession(newSession);
        return newSession;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to start session";
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [apiClient, conversationId]
  );

  // End the current session
  const endSession = useCallback(async () => {
    if (!conversationId) return;

    setIsLoading(true);
    setError(null);

    try {
      await apiClient.endVoiceDocumentSession(conversationId);
      setSession(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to end session"
      );
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, conversationId]);

  // Navigate to a specific page
  const goToPage = useCallback(
    async (pageNumber: number): Promise<VoiceDocumentPageContent> => {
      if (!conversationId) {
        throw new Error("No conversation ID");
      }

      const content = await apiClient.getVoiceDocumentPage(
        conversationId,
        pageNumber
      );

      // Update session state with new page
      if (session) {
        setSession((prev) =>
          prev ? { ...prev, current_page: pageNumber } : null
        );
      }

      return content;
    },
    [apiClient, conversationId, session]
  );

  // Navigate to next page
  const nextPage = useCallback(async (): Promise<VoiceDocumentPageContent | null> => {
    if (!session) {
      throw new Error("No active session");
    }

    const nextPageNum = session.current_page + 1;

    // Check if we're at the end
    if (session.total_pages && nextPageNum > session.total_pages) {
      return null;
    }

    return await goToPage(nextPageNum);
  }, [session, goToPage]);

  // Navigate to previous page
  const previousPage = useCallback(async (): Promise<VoiceDocumentPageContent | null> => {
    if (!session) {
      throw new Error("No active session");
    }

    const prevPageNum = session.current_page - 1;

    // Check if we're at the beginning
    if (prevPageNum < 1) {
      return null;
    }

    return await goToPage(prevPageNum);
  }, [session, goToPage]);

  // Get current page content
  const getCurrentPageContent = useCallback(async (): Promise<VoiceDocumentPageContent> => {
    if (!session) {
      throw new Error("No active session");
    }

    return await goToPage(session.current_page);
  }, [session, goToPage]);

  // Get table of contents
  const getTableOfContents = useCallback(async (): Promise<VoiceDocumentTOC> => {
    if (!conversationId) {
      throw new Error("No conversation ID");
    }

    return await apiClient.getVoiceDocumentToc(conversationId);
  }, [apiClient, conversationId]);

  // Update position
  const updatePosition = useCallback(
    async (page?: number, sectionId?: string): Promise<void> => {
      if (!conversationId) return;

      await apiClient.updateVoiceDocumentPosition(
        conversationId,
        page,
        sectionId
      );

      // Update local session state
      setSession((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          ...(page !== undefined && { current_page: page }),
          ...(sectionId !== undefined && { current_section_id: sectionId }),
        };
      });
    },
    [apiClient, conversationId]
  );

  return {
    session,
    isLoading,
    error,
    isActive,
    startSession,
    endSession,
    refreshSession,
    goToPage,
    nextPage,
    previousPage,
    getCurrentPageContent,
    getTableOfContents,
    updatePosition,
  };
}
