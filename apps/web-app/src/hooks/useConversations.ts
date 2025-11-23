/**
 * useConversations Hook
 * Manages conversation list, search, and operations
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import type { Conversation, PaginatedResponse } from '@voiceassist/types';

export function useConversations() {
  const { apiClient } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const loadConversations = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response: PaginatedResponse<Conversation> = await apiClient.getConversations(1, 100);
      setConversations(response.items);
    } catch (err: any) {
      setError(err.message || 'Failed to load conversations');
      console.error('Failed to load conversations:', err);
    } finally {
      setIsLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const createConversation = useCallback(async (title: string) => {
    try {
      const newConversation = await apiClient.createConversation(title);
      setConversations((prev) => [newConversation, ...prev]);
      return newConversation;
    } catch (err: any) {
      setError(err.message || 'Failed to create conversation');
      throw err;
    }
  }, [apiClient]);

  const updateConversation = useCallback(async (id: string, updates: { title?: string }) => {
    try {
      const updated = await apiClient.updateConversation(id, updates);
      setConversations((prev) =>
        prev.map((conv) => (conv.id === id ? updated : conv))
      );
      return updated;
    } catch (err: any) {
      setError(err.message || 'Failed to update conversation');
      throw err;
    }
  }, [apiClient]);

  const archiveConversation = useCallback(async (id: string) => {
    try {
      const updated = await apiClient.archiveConversation(id);
      setConversations((prev) =>
        prev.map((conv) => (conv.id === id ? updated : conv))
      );
    } catch (err: any) {
      setError(err.message || 'Failed to archive conversation');
      throw err;
    }
  }, [apiClient]);

  const unarchiveConversation = useCallback(async (id: string) => {
    try {
      const updated = await apiClient.unarchiveConversation(id);
      setConversations((prev) =>
        prev.map((conv) => (conv.id === id ? updated : conv))
      );
    } catch (err: any) {
      setError(err.message || 'Failed to unarchive conversation');
      throw err;
    }
  }, [apiClient]);

  const deleteConversation = useCallback(async (id: string) => {
    try {
      await apiClient.deleteConversation(id);
      setConversations((prev) => prev.filter((conv) => conv.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete conversation');
      throw err;
    }
  }, [apiClient]);

  // Filter conversations based on search and archive status
  const filteredConversations = conversations.filter((conv) => {
    const matchesSearch = conv.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesArchive = showArchived ? conv.archived : !conv.archived;
    return matchesSearch && matchesArchive;
  });

  return {
    conversations: filteredConversations,
    allConversations: conversations,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    showArchived,
    setShowArchived,
    createConversation,
    updateConversation,
    archiveConversation,
    unarchiveConversation,
    deleteConversation,
    reload: loadConversations,
  };
}
