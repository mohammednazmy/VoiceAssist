/**
 * ConversationList Component
 * Displays list of user's conversations with actions
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Input } from '@voiceassist/ui';
import type { Conversation } from '@voiceassist/types';
import { ConversationListItem } from './ConversationListItem';

export interface ConversationListProps {
  showArchived?: boolean;
}

export function ConversationList({ showArchived = false }: ConversationListProps) {
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId: string }>();
  const { apiClient } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadConversations();
  }, [showArchived]);

  const loadConversations = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.getConversations(1, 50);
      let filtered = response.items;

      // Filter by archived status
      if (showArchived) {
        filtered = filtered.filter((c) => c.archived);
      } else {
        filtered = filtered.filter((c) => !c.archived);
      }

      // Sort by most recently updated first
      filtered.sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      setConversations(filtered);
    } catch (err) {
      console.error('Failed to load conversations:', err);
      setError('Failed to load conversations');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNew = async () => {
    setIsCreating(true);
    try {
      const newConversation = await apiClient.createConversation('New Conversation');
      setConversations((prev) => [newConversation, ...prev]);
      navigate(`/chat/${newConversation.id}`);
    } catch (err) {
      console.error('Failed to create conversation:', err);
      setError('Failed to create conversation');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRename = async (id: string, newTitle: string) => {
    try {
      const updated = await apiClient.updateConversation(id, { title: newTitle });
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? updated : c))
      );
    } catch (err) {
      console.error('Failed to rename conversation:', err);
      throw err;
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await apiClient.archiveConversation(id);
      // Remove from current list
      setConversations((prev) => prev.filter((c) => c.id !== id));

      // If archiving the active conversation, navigate away
      if (id === conversationId) {
        navigate('/chat');
      }
    } catch (err) {
      console.error('Failed to archive conversation:', err);
      throw err;
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.deleteConversation(id);
      // Remove from list
      setConversations((prev) => prev.filter((c) => c.id !== id));

      // If deleting the active conversation, navigate away
      if (id === conversationId) {
        navigate('/chat');
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
      throw err;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 mx-auto mb-3 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-neutral-600">Loading conversations...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-6 h-6 text-red-600"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-neutral-900 mb-1">{error}</p>
          <button
            type="button"
            onClick={loadConversations}
            className="text-sm text-primary-600 hover:text-primary-700 underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-neutral-100 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-8 h-8 text-neutral-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
              />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-neutral-900 mb-2">
            {showArchived ? 'No archived conversations' : 'No conversations yet'}
          </h3>
          <p className="text-sm text-neutral-600 mb-6">
            {showArchived
              ? 'Archived conversations will appear here.'
              : 'Start a new conversation to get going!'}
          </p>
          {!showArchived && (
            <button
              type="button"
              onClick={handleCreateNew}
              disabled={isCreating}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? (
                <>
                  <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-4 h-4 mr-2"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  New Conversation
                </>
              )}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Filter conversations based on search
  const filteredConversations = conversations.filter((conv) =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header with New Conversation button */}
      <div className="flex flex-col px-4 py-3 border-b border-neutral-200 bg-white space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">
            {showArchived ? 'Archived' : 'Conversations'}
          </h2>
          {!showArchived && (
            <button
              type="button"
              onClick={handleCreateNew}
              disabled={isCreating}
              className="p-1.5 text-primary-600 hover:bg-primary-50 rounded-md transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
              aria-label="New conversation"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          )}
        </div>

        {/* Search Input */}
        <div className="relative">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <Input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-sm"
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1" role="list">
        {filteredConversations.length === 0 && searchQuery && (
          <div className="p-4 text-center">
            <p className="text-sm text-neutral-600">No conversations found</p>
          </div>
        )}
        {filteredConversations.map((conversation) => (
          <ConversationListItem
            key={conversation.id}
            conversation={conversation}
            isActive={conversation.id === conversationId}
            onRename={handleRename}
            onArchive={handleArchive}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}
