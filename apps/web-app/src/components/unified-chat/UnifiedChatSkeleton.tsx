/**
 * Unified Chat Skeleton Components
 *
 * Loading state skeleton UI for the unified chat interface.
 * Extracted from UnifiedChatContainer.tsx for modularity.
 */

// ============================================================================
// Skeleton Components
// ============================================================================

export function MessageSkeleton({ isUser = false }: { isUser?: boolean }) {
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[70%] rounded-lg p-4 animate-pulse ${
          isUser ? "bg-primary-100" : "bg-white border border-neutral-200"
        }`}
      >
        <div className={`space-y-2 ${isUser ? "items-end" : "items-start"}`}>
          <div
            className={`h-4 rounded ${isUser ? "bg-primary-200" : "bg-neutral-200"} w-48`}
          />
          <div
            className={`h-4 rounded ${isUser ? "bg-primary-200" : "bg-neutral-200"} w-64`}
          />
          <div
            className={`h-4 rounded ${isUser ? "bg-primary-200" : "bg-neutral-200"} w-32`}
          />
        </div>
      </div>
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="flex flex-col h-full">
      {/* Header skeleton */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white">
        <div className="h-6 w-32 bg-neutral-200 rounded animate-pulse" />
        <div className="flex items-center space-x-2">
          <div className="h-8 w-20 bg-neutral-100 rounded animate-pulse" />
          <div className="h-8 w-20 bg-neutral-100 rounded animate-pulse" />
        </div>
      </div>
      {/* Messages skeleton */}
      <div className="flex-1 overflow-hidden bg-neutral-50 px-4 py-4">
        <MessageSkeleton isUser={true} />
        <MessageSkeleton isUser={false} />
        <MessageSkeleton isUser={true} />
        <MessageSkeleton isUser={false} />
      </div>
      {/* Input skeleton */}
      <div className="border-t border-neutral-200 bg-white px-4 py-3">
        <div className="h-12 bg-neutral-100 rounded-lg animate-pulse" />
      </div>
    </div>
  );
}

export default ChatSkeleton;
