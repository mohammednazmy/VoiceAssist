/**
 * useMessagePagination Hook
 * Manages pagination for message history with scroll-to-load functionality
 *
 * This hook handles:
 * - Initial message loading
 * - Loading older messages when scrolling to top
 * - Tracking pagination state (hasMore, loading)
 * - Prepending older messages to existing list
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { Message, PaginatedResponse } from "@voiceassist/types";

export interface UseMessagePaginationOptions {
  /** API function to fetch messages */
  fetchMessages: (
    page: number,
    pageSize: number,
  ) => Promise<PaginatedResponse<Message>>;
  /** Messages per page (default: 50) */
  pageSize?: number;
  /** Initial messages to display (from context/props) */
  initialMessages?: Message[];
  /** Callback when initial load completes */
  onInitialLoad?: (messages: Message[]) => void;
  /** Whether to enable pagination (default: true) */
  enabled?: boolean;
}

export interface UseMessagePaginationReturn {
  /** All loaded messages, sorted by timestamp (oldest first) */
  messages: Message[];
  /** Whether more messages are available to load */
  hasMore: boolean;
  /** Whether currently loading messages */
  isLoading: boolean;
  /** Whether initial load is in progress */
  isInitialLoading: boolean;
  /** Error from last load attempt */
  error: Error | null;
  /** Load the next page of older messages */
  loadMore: () => Promise<void>;
  /** Reset pagination state and reload from beginning */
  reset: () => void;
  /** Add a new message to the list (for realtime updates) */
  addMessage: (message: Message) => void;
  /** Update an existing message in the list */
  updateMessage: (messageId: string, updates: Partial<Message>) => void;
  /** Remove a message from the list */
  removeMessage: (messageId: string) => void;
  /** Total number of messages in the conversation */
  totalCount: number;
  /** Current oldest loaded page (for debugging) */
  oldestPage: number;
}

/**
 * Sort messages by timestamp (oldest first for chat display)
 */
function sortByTimestamp(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Merge old and new messages, avoiding duplicates
 */
function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  const existingIds = new Set(existing.map((m) => m.id));
  const newMessages = incoming.filter((m) => !existingIds.has(m.id));
  return sortByTimestamp([...newMessages, ...existing]);
}

export function useMessagePagination(
  options: UseMessagePaginationOptions,
): UseMessagePaginationReturn {
  const {
    fetchMessages,
    pageSize = 50,
    initialMessages = [],
    onInitialLoad,
    enabled = true,
  } = options;

  // State
  const [messages, setMessages] = useState<Message[]>(
    sortByTimestamp(initialMessages),
  );
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  // Track the oldest page we've loaded (we load from newest to oldest)
  // Start from a high page number and work backwards
  const oldestPageRef = useRef<number | null>(null);
  const initialLoadDoneRef = useRef(false);

  /**
   * Load initial (most recent) messages
   */
  const loadInitial = useCallback(async () => {
    if (!enabled || initialLoadDoneRef.current) return;

    setIsInitialLoading(true);
    setError(null);

    try {
      // First, fetch page 1 to get total count and calculate last page
      const firstResponse = await fetchMessages(1, pageSize);
      const total = firstResponse.total;
      setTotalCount(total);

      if (total === 0) {
        setMessages([]);
        setHasMore(false);
        setIsInitialLoading(false);
        initialLoadDoneRef.current = true;
        onInitialLoad?.([]);
        return;
      }

      // Calculate the last page (most recent messages)
      const lastPage = Math.ceil(total / pageSize);

      // If there's only one page, use the first response
      if (lastPage === 1) {
        const sortedMessages = sortByTimestamp(firstResponse.items);
        setMessages(sortedMessages);
        setHasMore(false);
        oldestPageRef.current = 1;
        setIsInitialLoading(false);
        initialLoadDoneRef.current = true;
        onInitialLoad?.(sortedMessages);
        return;
      }

      // Otherwise, fetch the last page (most recent)
      const lastPageResponse = await fetchMessages(lastPage, pageSize);
      const sortedMessages = sortByTimestamp(lastPageResponse.items);

      setMessages(sortedMessages);
      setHasMore(lastPage > 1);
      oldestPageRef.current = lastPage;
      setIsInitialLoading(false);
      initialLoadDoneRef.current = true;
      onInitialLoad?.(sortedMessages);
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error("Failed to load messages"),
      );
      setIsInitialLoading(false);
    }
  }, [enabled, fetchMessages, pageSize, onInitialLoad]);

  /**
   * Load older messages (previous page)
   */
  const loadMore = useCallback(async () => {
    if (
      !enabled ||
      isLoading ||
      !hasMore ||
      oldestPageRef.current === null ||
      oldestPageRef.current <= 1
    ) {
      return;
    }

    setIsLoading(true);
    setError(null);

    const nextPage = oldestPageRef.current - 1;

    try {
      const response = await fetchMessages(nextPage, pageSize);

      setMessages((prev) => mergeMessages(prev, response.items));
      oldestPageRef.current = nextPage;
      setHasMore(nextPage > 1);
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error("Failed to load more messages"),
      );
    } finally {
      setIsLoading(false);
    }
  }, [enabled, isLoading, hasMore, fetchMessages, pageSize]);

  /**
   * Reset pagination state
   */
  const reset = useCallback(() => {
    setMessages([]);
    setHasMore(true);
    setIsLoading(false);
    setIsInitialLoading(true);
    setError(null);
    setTotalCount(0);
    oldestPageRef.current = null;
    initialLoadDoneRef.current = false;
  }, []);

  /**
   * Add a new message (from WebSocket/realtime updates)
   */
  const addMessage = useCallback((message: Message) => {
    setMessages((prev) => {
      // Check if message already exists
      const existingIndex = prev.findIndex((m) => m.id === message.id);
      if (existingIndex >= 0) {
        // Update existing message
        return prev.map((m, i) => (i === existingIndex ? message : m));
      }
      // Add and resort
      return sortByTimestamp([...prev, message]);
    });
    setTotalCount((prev) => prev + 1);
  }, []);

  /**
   * Update an existing message
   */
  const updateMessage = useCallback(
    (messageId: string, updates: Partial<Message>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, ...updates } : m)),
      );
    },
    [],
  );

  /**
   * Remove a message
   */
  const removeMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    setTotalCount((prev) => Math.max(0, prev - 1));
  }, []);

  // Load initial messages on mount
  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // Reset when initial messages change from outside (e.g., conversation switch)
  useEffect(() => {
    if (initialMessages.length > 0 && !initialLoadDoneRef.current) {
      setMessages(sortByTimestamp(initialMessages));
    }
  }, [initialMessages]);

  return {
    messages,
    hasMore,
    isLoading,
    isInitialLoading,
    error,
    loadMore,
    reset,
    addMessage,
    updateMessage,
    removeMessage,
    totalCount,
    oldestPage: oldestPageRef.current ?? 0,
  };
}
