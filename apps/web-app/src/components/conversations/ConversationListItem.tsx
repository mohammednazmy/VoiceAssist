/**
 * ConversationListItem Component
 * Individual conversation item in the list
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Conversation } from '@voiceassist/types';
import { relativeTime } from '@voiceassist/utils';

export interface ConversationListItemProps {
  conversation: Conversation;
  isActive: boolean;
  onRename: (id: string, newTitle: string) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function ConversationListItem({
  conversation,
  isActive,
  onRename,
  onArchive,
  onDelete,
}: ConversationListItemProps) {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(conversation.title);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleClick = () => {
    if (!isEditing) {
      navigate(`/chat/${conversation.id}`);
    }
  };

  const handleRename = async () => {
    if (editedTitle.trim() && editedTitle !== conversation.title) {
      await onRename(conversation.id, editedTitle.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRename();
    } else if (e.key === 'Escape') {
      setEditedTitle(conversation.title);
      setIsEditing(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(conversation.id);
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      setIsDeleting(false);
    }
  };

  const displayTitle = conversation.title || `Conversation ${conversation.id.slice(0, 8)}`;
  const preview = conversation.lastMessagePreview || 'No messages yet';
  const timeAgo = relativeTime(conversation.updatedAt);

  return (
    <>
      <div
        className={`group relative flex items-center px-3 py-2.5 rounded-md cursor-pointer transition-colors ${
          isActive
            ? 'bg-primary-50 border-l-2 border-primary-500'
            : 'hover:bg-neutral-100'
        }`}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label={`Conversation: ${displayTitle}`}
        aria-current={isActive ? 'page' : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleRename}
              onKeyDown={handleKeyDown}
              className="w-full px-2 py-1 text-sm font-medium border border-primary-500 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              <h3 className={`text-sm font-medium truncate ${isActive ? 'text-primary-700' : 'text-neutral-900'}`}>
                {displayTitle}
              </h3>
              <p className="text-xs text-neutral-500 truncate mt-0.5">{preview}</p>
              <p className="text-xs text-neutral-400 mt-0.5">{timeAgo}</p>
            </>
          )}
        </div>

        {/* Actions Menu */}
        {!isEditing && (
          <div className="relative ml-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen(!isMenuOpen);
              }}
              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-neutral-200 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary-500"
              aria-label="Conversation actions"
              aria-expanded={isMenuOpen}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-4 h-4 text-neutral-600"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"
                />
              </svg>
            </button>

            {isMenuOpen && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setIsMenuOpen(false)}
                  aria-hidden="true"
                />

                {/* Menu */}
                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-md shadow-lg border border-neutral-200 z-20">
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMenuOpen(false);
                        setIsEditing(true);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 flex items-center space-x-2"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="w-4 h-4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                        />
                      </svg>
                      <span>Rename</span>
                    </button>

                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        setIsMenuOpen(false);
                        await onArchive(conversation.id);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 flex items-center space-x-2"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="w-4 h-4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
                        />
                      </svg>
                      <span>Archive</span>
                    </button>

                    <hr className="my-1 border-neutral-200" />

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMenuOpen(false);
                        setShowDeleteConfirm(true);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="w-4 h-4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                        />
                      </svg>
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-neutral-900 mb-2">Delete Conversation?</h3>
            <p className="text-sm text-neutral-600 mb-6">
              This will permanently delete "{displayTitle}" and all its messages. This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 rounded-md hover:bg-neutral-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center space-x-2"
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
