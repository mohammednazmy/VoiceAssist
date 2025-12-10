/**
 * MessageActionMenu Component
 * Displays action buttons for messages (edit, regenerate, delete, copy, branch)
 *
 * Features:
 * - Radix UI DropdownMenu for accessibility
 * - Keyboard shortcuts displayed for each action
 * - Loading states during async operations
 * - Delete confirmation dialog integration
 */

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@voiceassist/ui";

// Icons as inline SVGs for consistency
const CopyIcon = () => (
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
      d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
    />
  </svg>
);

const EditIcon = () => (
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
);

const RegenerateIcon = () => (
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
      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
    />
  </svg>
);

const BranchIcon = () => (
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
      d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"
    />
  </svg>
);

const DeleteIcon = () => (
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
);

const MoreIcon = () => (
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
      d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"
    />
  </svg>
);

const SpinnerIcon = () => (
  <svg
    className="w-4 h-4 animate-spin"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

export interface MessageActionMenuProps {
  messageId: string;
  role: "user" | "assistant" | "system";
  onEdit?: () => void;
  onRegenerate?: () => void;
  onDelete?: () => void;
  onCopy?: () => void;
  onBranch?: () => void;
  /** Show loading spinner on delete action */
  isDeleting?: boolean;
  /** Show loading spinner on regenerate action */
  isRegenerating?: boolean;
  /** Show loading spinner on branch action */
  isBranching?: boolean;
}

export function MessageActionMenu({
  messageId: _messageId,
  role,
  onEdit,
  onRegenerate,
  onDelete,
  onCopy,
  onBranch,
  isDeleting = false,
  isRegenerating = false,
  isBranching = false,
}: MessageActionMenuProps) {
  // Don't show action menu for system messages
  if (role === "system") {
    return null;
  }

  // Check if any action is in progress
  const isLoading = isDeleting || isRegenerating || isBranching;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-opacity focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
          aria-label="Message actions"
          data-testid="message-action-menu-trigger"
        >
          <MoreIcon />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-48">
        {/* Copy */}
        {onCopy && (
          <DropdownMenuItem
            onClick={onCopy}
            disabled={isLoading}
            data-testid="action-copy"
          >
            <CopyIcon />
            <span className="ml-2">Copy</span>
            <DropdownMenuShortcut>⌘C</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}

        {/* Edit (for user messages only) */}
        {role === "user" && onEdit && (
          <DropdownMenuItem
            onClick={onEdit}
            disabled={isLoading}
            data-testid="action-edit"
          >
            <EditIcon />
            <span className="ml-2">Edit</span>
            <DropdownMenuShortcut>E</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}

        {/* Regenerate (for assistant messages only) */}
        {role === "assistant" && onRegenerate && (
          <DropdownMenuItem
            onClick={onRegenerate}
            disabled={isLoading}
            data-testid="action-regenerate"
          >
            {isRegenerating ? <SpinnerIcon /> : <RegenerateIcon />}
            <span className="ml-2">Regenerate</span>
            <DropdownMenuShortcut>R</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}

        {/* Branch conversation */}
        {onBranch && (
          <DropdownMenuItem
            onClick={onBranch}
            disabled={isLoading}
            data-testid="action-branch"
          >
            {isBranching ? <SpinnerIcon /> : <BranchIcon />}
            <span className="ml-2">Branch conversation</span>
            <DropdownMenuShortcut>B</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}

        {/* Delete */}
        {onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              disabled={isLoading}
              className="text-red-600 dark:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/20 focus:text-red-600 dark:focus:text-red-400"
              data-testid="action-delete"
            >
              {isDeleting ? <SpinnerIcon /> : <DeleteIcon />}
              <span className="ml-2">Delete</span>
              <DropdownMenuShortcut>Del</DropdownMenuShortcut>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
