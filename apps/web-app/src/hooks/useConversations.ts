/**
 * useConversations Hook
 * Manages conversation list, search, and operations with optimistic updates
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./useAuth";
import type { Conversation, PaginatedResponse } from "@voiceassist/types";

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

  const loadConversations = useCallback(
    async (page = 1, append = false) => {
      if (page === 1) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      setError(null);

      try {
        const response: PaginatedResponse<Conversation> =
          await apiClient.getConversations(page, pageSize);

        totalCountRef.current = response.totalCount;
        setHasMore(page < response.totalPages);
        setCurrentPage(page);

        if (append) {
          setConversations((prev) => [...prev, ...response.items]);
        } else {
          setConversations(response.items);
        }
      } catch (err: any) {
        const errorMessage = err.message || "Failed to load conversations";
        setError(errorMessage);
        console.error("Failed to load conversations:", err);
        onError?.("Failed to load conversations", errorMessage);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [apiClient, pageSize, onError],
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore) return;
    await loadConversations(currentPage + 1, true);
  }, [hasMore, isLoadingMore, currentPage, loadConversations]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const createConversation = useCallback(
    async (title: string) => {
      try {
        const newConversation = await apiClient.createConversation(title);
        setConversations((prev) => [newConversation, ...prev]);
        return newConversation;
      } catch (err: any) {
        const errorMessage = err.message || "Failed to create conversation";
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
      } catch (err: any) {
        // Rollback on error
        setConversations(originalConversations);
        const errorMessage = err.message || "Failed to update conversation";
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
      } catch (err: any) {
        // Rollback on error
        setConversations(originalConversations);
        const errorMessage = err.message || "Failed to archive conversation";
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
      } catch (err: any) {
        // Rollback on error
        setConversations(originalConversations);
        const errorMessage = err.message || "Failed to unarchive conversation";
        setError(errorMessage);
        onError?.("Failed to unarchive conversation", errorMessage);
        throw err;
      }
    },
    [apiClient, conversations, onError],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      // Save original state for rollback
      const originalConversations = conversations;
      const deletedConversation = conversations.find((conv) => conv.id === id);

      // Optimistically remove
      setConversations((prev) => prev.filter((conv) => conv.id !== id));

      try {
        await apiClient.deleteConversation(id);
      } catch (err: any) {
        // Rollback on error
        setConversations(originalConversations);
        const errorMessage = err.message || "Failed to delete conversation";
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

  const exportConversation = useCallback(
    async (id: string, format: "markdown" | "text" = "markdown") => {
      try {
        // Get the conversation details
        const conversation = conversations.find((conv) => conv.id === id);
        if (!conversation) {
          throw new Error("Conversation not found");
        }

        // Get all messages for this conversation
        const messages = await apiClient.getMessages(id);

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
      } catch (err: any) {
        setError(err.message || "Failed to export conversation");
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
    exportConversation,
    loadMore,
    reload: loadConversations,
  };
}

// Helper function to generate Markdown export
function generateMarkdownExport(
  conversation: Conversation,
  messages: any[],
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
      message.metadata.citations.forEach((citation: any, citIndex: number) => {
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
      });
    }

    markdown += `---\n\n`;
  });

  markdown += `\n_Exported from VoiceAssist on ${new Date().toLocaleString()}_\n`;
  return markdown;
}

// Helper function to generate plain text export
function generateTextExport(
  conversation: Conversation,
  messages: any[],
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
      message.metadata.citations.forEach((citation: any, citIndex: number) => {
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
      });
      text += `\n`;
    }

    text += `${"-".repeat(80)}\n\n`;
  });

  text += `\nExported from VoiceAssist on ${new Date().toLocaleString()}\n`;
  return text;
}
