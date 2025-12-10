/**
 * useConversations Hook
 * Manages conversation list, search, and operations with optimistic updates
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./useAuth";
import type {
  Conversation,
  PaginatedResponse,
  Message,
  Citation,
} from "@voiceassist/types";
import { extractErrorMessage } from "@voiceassist/types";
import { createLogger } from "../lib/logger";

const log = createLogger("Conversations");

export interface UseConversationsOptions {
  /** Callback when an error occurs (for toast notifications) */
  onError?: (message: string, description?: string) => void;
  /** Initial page size for pagination */
  pageSize?: number;
}

export function useConversations(options: UseConversationsOptions = {}) {
  const { onError, pageSize = 20 } = options;
  const { apiClient } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const totalCountRef = useRef(0);

  // Refs to prevent infinite fetch loops
  const isLoadingRef = useRef(false);
  const hasInitializedRef = useRef(false);

  const loadConversations = useCallback(
    async (page = 1, append = false) => {
      log.debug(`loadConversations called (page: ${page}, append: ${append})`);
      // Guard against concurrent requests (prevents request storm)
      if (isLoadingRef.current && !append) {
        log.debug(`Skipping load - already loading (page: ${page})`);
        return;
      }

      isLoadingRef.current = true;

      if (page === 1) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      setError(null);

      try {
        const response: PaginatedResponse<Conversation> =
          await apiClient.getConversations(page, pageSize);

        log.debug(`Loaded ${response.items.length} conversations from API`);
        totalCountRef.current = response.totalCount;
        setHasMore(page < response.totalPages);
        setCurrentPage(page);

        if (append) {
          setConversations((prev) => [...prev, ...response.items]);
        } else {
          setConversations(response.items);
        }
      } catch (err: unknown) {
        const errorMessage = extractErrorMessage(err);
        setError(errorMessage);
        log.error("Failed to load conversations:", err);
        onError?.("Failed to load conversations", errorMessage);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
        isLoadingRef.current = false;
      }
    },
    [apiClient, pageSize, onError],
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || isLoadingRef.current) return;
    await loadConversations(currentPage + 1, true);
  }, [hasMore, isLoadingMore, currentPage, loadConversations]);

  // Initial load - runs only once on mount
  // Using hasInitializedRef to prevent re-fetching when dependencies change identity
  useEffect(() => {
    if (hasInitializedRef.current) {
      return;
    }
    hasInitializedRef.current = true;
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createConversation = useCallback(
    async (title: string) => {
      try {
        const newConversation = await apiClient.createConversation(title);
        setConversations((prev) => [newConversation, ...prev]);
        return newConversation;
      } catch (err: unknown) {
        const errorMessage = extractErrorMessage(err);
        setError(errorMessage);
        onError?.("Failed to create conversation", errorMessage);
        throw err;
      }
    },
    [apiClient, onError],
  );

  const updateConversation = useCallback(
    async (
      id: string,
      updates: { title?: string; folderId?: string | null },
    ) => {
      // Save original state for rollback
      const originalConversations = conversations;

      // Optimistically update
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === id
            ? { ...conv, ...updates, updatedAt: new Date().toISOString() }
            : conv,
        ),
      );

      try {
        const updated = await apiClient.updateConversation(id, updates);
        // Replace with server response
        setConversations((prev) =>
          prev.map((conv) => (conv.id === id ? updated : conv)),
        );
        return updated;
      } catch (err: unknown) {
        // Rollback on error
        setConversations(originalConversations);
        const errorMessage = extractErrorMessage(err);
        setError(errorMessage);
        onError?.("Failed to update conversation", errorMessage);
        throw err;
      }
    },
    [apiClient, conversations, onError],
  );

  const archiveConversation = useCallback(
    async (id: string) => {
      // Save original state for rollback
      const originalConversations = conversations;

      // Optimistically update
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === id
            ? { ...conv, archived: true, updatedAt: new Date().toISOString() }
            : conv,
        ),
      );

      try {
        const updated = await apiClient.archiveConversation(id);
        setConversations((prev) =>
          prev.map((conv) => (conv.id === id ? updated : conv)),
        );
        return updated;
      } catch (err: unknown) {
        // Rollback on error
        setConversations(originalConversations);
        const errorMessage = extractErrorMessage(err);
        setError(errorMessage);
        onError?.("Failed to archive conversation", errorMessage);
        throw err;
      }
    },
    [apiClient, conversations, onError],
  );

  const unarchiveConversation = useCallback(
    async (id: string) => {
      // Save original state for rollback
      const originalConversations = conversations;

      // Optimistically update
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === id
            ? { ...conv, archived: false, updatedAt: new Date().toISOString() }
            : conv,
        ),
      );

      try {
        const updated = await apiClient.unarchiveConversation(id);
        setConversations((prev) =>
          prev.map((conv) => (conv.id === id ? updated : conv)),
        );
        return updated;
      } catch (err: unknown) {
        // Rollback on error
        setConversations(originalConversations);
        const errorMessage = extractErrorMessage(err);
        setError(errorMessage);
        onError?.("Failed to unarchive conversation", errorMessage);
        throw err;
      }
    },
    [apiClient, conversations, onError],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      log.debug(`Deleting conversation: ${id}`);
      // Save original state for rollback
      const originalConversations = conversations;
      const deletedConversation = conversations.find((conv) => conv.id === id);

      // Optimistically remove
      log.debug(
        `Optimistically removing conversation, count before: ${conversations.length}`,
      );
      setConversations((prev) => {
        const newList = prev.filter((conv) => conv.id !== id);
        log.debug(`After filter, count: ${newList.length}`);
        return newList;
      });

      try {
        await apiClient.deleteConversation(id);
        log.debug(`API delete successful for: ${id}`);
      } catch (err: unknown) {
        // Rollback on error
        log.debug(`API delete failed, rolling back`);
        setConversations(originalConversations);
        const errorMessage = extractErrorMessage(err);
        setError(errorMessage);
        onError?.(
          "Failed to delete conversation",
          `"${deletedConversation?.title}" could not be deleted. ${errorMessage}`,
        );
        throw err;
      }
    },
    [apiClient, conversations, onError],
  );

  const deleteAllConversations = useCallback(async () => {
    // Save original state for rollback
    const originalConversations = conversations;
    const originalTotal = totalCountRef.current;
    const count = conversations.length;

    // Optimistically clear all
    setConversations([]);
    totalCountRef.current = 0;
    setHasMore(false);
    setCurrentPage(1);

    try {
      const result = await apiClient.deleteAllConversations();
      log.debug(`Deleted ${result.deleted_count} conversations`);
      return result;
    } catch (err: unknown) {
      // Rollback on error
      setConversations(originalConversations);
      totalCountRef.current = originalTotal;
      setHasMore(originalConversations.length >= pageSize);
      const errorMessage = extractErrorMessage(err);
      setError(errorMessage);
      onError?.(
        "Failed to delete all conversations",
        `Could not delete ${count} conversation(s). ${errorMessage}`,
      );
      throw err;
    }
  }, [apiClient, conversations, pageSize, onError]);

  const exportConversation = useCallback(
    async (id: string, format: "markdown" | "text" = "markdown") => {
      try {
        // Get the conversation details
        const conversation = conversations.find((conv) => conv.id === id);
        if (!conversation) {
          throw new Error("Conversation not found");
        }

        // Get all messages for this conversation
        const messagesResponse = await apiClient.getMessages(id);
        const messages = messagesResponse.items;

        // Generate export content based on format
        let content: string;
        let filename: string;
        let mimeType: string;

        if (format === "markdown") {
          content = generateMarkdownExport(conversation, messages);
          filename = `conversation-${conversation.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.md`;
          mimeType = "text/markdown";
        } else {
          content = generateTextExport(conversation, messages);
          filename = `conversation-${conversation.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.txt`;
          mimeType = "text/plain";
        }

        // Trigger download
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (err: unknown) {
        setError(extractErrorMessage(err));
        throw err;
      }
    },
    [apiClient, conversations],
  );

  // Filter conversations based on search and archive status
  const filteredConversations = conversations.filter((conv) => {
    const matchesSearch = conv.title
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesArchive = showArchived ? conv.archived : !conv.archived;
    return matchesSearch && matchesArchive;
  });

  return {
    conversations: filteredConversations,
    allConversations: conversations,
    isLoading,
    isLoadingMore,
    error,
    searchQuery,
    setSearchQuery,
    showArchived,
    setShowArchived,
    hasMore,
    totalCount: totalCountRef.current,
    createConversation,
    updateConversation,
    archiveConversation,
    unarchiveConversation,
    deleteConversation,
    deleteAllConversations,
    exportConversation,
    loadMore,
    reload: loadConversations,
  };
}

// Helper function to generate Markdown export
function generateMarkdownExport(
  conversation: Conversation,
  messages: Message[],
): string {
  const formattedDate = new Date(conversation.createdAt).toLocaleString();
  let markdown = `# ${conversation.title}\n\n`;
  markdown += `**Created:** ${formattedDate}\n`;
  markdown += `**Messages:** ${conversation.messageCount}\n`;
  if (conversation.archived) {
    markdown += `**Status:** Archived\n`;
  }
  markdown += `\n---\n\n`;

  messages.forEach((message) => {
    const timestamp = new Date(message.createdAt).toLocaleString();
    const role = message.role.charAt(0).toUpperCase() + message.role.slice(1);

    markdown += `## ${role} - ${timestamp}\n\n`;
    markdown += `${message.content}\n\n`;

    // Add citations if present
    if (message.metadata?.citations && message.metadata.citations.length > 0) {
      markdown += `### Citations\n\n`;
      message.metadata.citations.forEach(
        (citation: Citation, citIndex: number) => {
          markdown += `${citIndex + 1}. `;
          if (citation.title) {
            markdown += `**${citation.title}**`;
          }
          if (citation.reference) {
            markdown += ` (${citation.reference})`;
          }
          markdown += `\n`;
          if (citation.snippet) {
            markdown += `   > ${citation.snippet}\n`;
          }
          if (citation.doi) {
            markdown += `   DOI: [${citation.doi}](https://doi.org/${citation.doi})\n`;
          }
          if (citation.pubmedId) {
            markdown += `   PubMed: [${citation.pubmedId}](https://pubmed.ncbi.nlm.nih.gov/${citation.pubmedId}/)\n`;
          }
          markdown += `\n`;
        },
      );
    }

    markdown += `---\n\n`;
  });

  markdown += `\n_Exported from VoiceAssist on ${new Date().toLocaleString()}_\n`;
  return markdown;
}

// Helper function to generate plain text export
function generateTextExport(
  conversation: Conversation,
  messages: Message[],
): string {
  const formattedDate = new Date(conversation.createdAt).toLocaleString();
  let text = `${conversation.title}\n`;
  text += `${"=".repeat(conversation.title.length)}\n\n`;
  text += `Created: ${formattedDate}\n`;
  text += `Messages: ${conversation.messageCount}\n`;
  if (conversation.archived) {
    text += `Status: Archived\n`;
  }
  text += `\n${"-".repeat(80)}\n\n`;

  messages.forEach((message) => {
    const timestamp = new Date(message.createdAt).toLocaleString();
    const role = message.role.toUpperCase();

    text += `[${role}] ${timestamp}\n\n`;
    text += `${message.content}\n\n`;

    // Add citations if present
    if (message.metadata?.citations && message.metadata.citations.length > 0) {
      text += `CITATIONS:\n`;
      message.metadata.citations.forEach(
        (citation: Citation, citIndex: number) => {
          text += `  ${citIndex + 1}. `;
          if (citation.title) {
            text += citation.title;
          }
          if (citation.reference) {
            text += ` (${citation.reference})`;
          }
          text += `\n`;
          if (citation.snippet) {
            text += `     "${citation.snippet}"\n`;
          }
          if (citation.doi) {
            text += `     DOI: https://doi.org/${citation.doi}\n`;
          }
          if (citation.pubmedId) {
            text += `     PubMed: https://pubmed.ncbi.nlm.nih.gov/${citation.pubmedId}/\n`;
          }
        },
      );
      text += `\n`;
    }

    text += `${"-".repeat(80)}\n\n`;
  });

  text += `\nExported from VoiceAssist on ${new Date().toLocaleString()}\n`;
  return text;
}
