/**
 * StreamingIndicator Component
 * Visual indicator for streaming AI responses (Milestone 1, Phase 1, Week 4)
 * Shows animated typing indicator with smooth transitions
 */

import React from "react";

interface StreamingIndicatorProps {
  /** Optional message to display alongside the indicator */
  message?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * StreamingIndicator displays an animated typing indicator
 * for real-time streaming responses from the AI
 */
export const StreamingIndicator: React.FC<StreamingIndicatorProps> = ({
  message = "AI is thinking...",
  className = "",
}) => {
  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 text-sm text-gray-600 ${className}`}
      role="status"
      aria-live="polite"
      aria-label="AI is generating a response"
    >
      {/* Animated dots */}
      <div className="flex gap-1">
        <span
          className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-bounce"
          style={{ animationDelay: "0ms", animationDuration: "1.4s" }}
          aria-hidden="true"
        />
        <span
          className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-bounce"
          style={{ animationDelay: "200ms", animationDuration: "1.4s" }}
          aria-hidden="true"
        />
        <span
          className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-bounce"
          style={{ animationDelay: "400ms", animationDuration: "1.4s" }}
          aria-hidden="true"
        />
      </div>

      {/* Message text */}
      <span className="text-gray-700 font-medium">{message}</span>
    </div>
  );
};

export default StreamingIndicator;
