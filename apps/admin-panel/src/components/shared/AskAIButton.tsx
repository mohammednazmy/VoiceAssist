/**
 * AskAIButton - Ask AI about documentation
 *
 * A button that opens a dialog for asking the AI assistant questions about
 * the VoiceAssist platform. Pre-fills context from the current page and
 * renders AI responses with markdown formatting and doc citations.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { fetchAPI } from "../../lib/api";

export interface AskAIButtonProps {
  /**
   * Current page context to pre-fill the AI with
   * e.g., "Knowledge Base management page"
   */
  pageContext?: string;

  /**
   * Optional doc path for additional context
   * e.g., "admin/knowledge-base"
   */
  docPath?: string;

  /**
   * Button variant
   * @default "icon"
   */
  variant?: "icon" | "text" | "full";

  /**
   * Custom button label (for text and full variants)
   * @default "Ask AI"
   */
  label?: string;

  /**
   * Additional className for the button
   */
  className?: string;
}

interface AIResponse {
  answer: string;
  citations?: Array<{
    title: string;
    path: string;
    section?: string;
    relevance?: number;
  }>;
  confidence?: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: AIResponse["citations"];
  timestamp: Date;
}

export function AskAIButton({
  pageContext,
  docPath,
  variant = "icon",
  label = "Ask AI",
  className,
}: AskAIButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, isLoading]);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setError(null);

    // Add user message
    setMessages((prev) => [
      ...prev,
      { role: "user", content: userMessage, timestamp: new Date() },
    ]);

    setIsLoading(true);

    try {
      // Build context-enriched query
      const contextParts: string[] = [];
      if (pageContext) {
        contextParts.push(`Current page: ${pageContext}`);
      }
      if (docPath) {
        contextParts.push(`Related docs: ${docPath}`);
      }

      const response = await fetchAPI<AIResponse>("/api/ai/docs/ask", {
        method: "POST",
        body: JSON.stringify({
          question: userMessage,
          context:
            contextParts.length > 0 ? contextParts.join("\n") : undefined,
          include_citations: true,
        }),
      });

      // Add assistant response
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response.answer,
          citations: response.citations,
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to get AI response";
      setError(errorMessage);
      // Remove the last user message on error so they can retry
      setMessages((prev) => prev.slice(0, -1));
      setInput(userMessage);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, pageContext, docPath]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const clearConversation = () => {
    setMessages([]);
    setError(null);
  };

  const docsBaseUrl =
    import.meta.env.VITE_DOCS_URL || "http://localhost:3001/";

  const buttonContent = () => {
    const iconSvg = (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4"
      >
        <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
        <path d="M18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
      </svg>
    );

    switch (variant) {
      case "icon":
        return iconSvg;
      case "text":
        return label;
      case "full":
        return (
          <>
            {iconSvg}
            <span className="ml-2">{label}</span>
          </>
        );
    }
  };

  const baseButtonStyles =
    "inline-flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 focus:ring-offset-slate-900";

  const variantStyles = {
    icon: "w-8 h-8 rounded-full border border-slate-600 bg-slate-800 hover:bg-slate-700 hover:border-slate-500 text-slate-400 hover:text-slate-200",
    text: "text-sm text-slate-400 hover:text-slate-200",
    full: "px-3 py-1.5 text-sm rounded-md border border-slate-600 bg-slate-800 hover:bg-slate-700 hover:border-slate-500 text-slate-300 hover:text-slate-100",
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`${baseButtonStyles} ${variantStyles[variant]} ${className || ""}`}
        aria-label="Ask AI about documentation"
        title="Ask AI"
      >
        {buttonContent()}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isLoading) {
              setIsOpen(false);
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ask-ai-dialog-title"
        >
          <div
            ref={dialogRef}
            className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4"
                  >
                    <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                  </svg>
                </div>
                <div>
                  <h2
                    id="ask-ai-dialog-title"
                    className="text-sm font-semibold text-slate-100"
                  >
                    Ask AI Assistant
                  </h2>
                  <p className="text-xs text-slate-500">
                    {pageContext
                      ? `Context: ${pageContext}`
                      : "Ask about VoiceAssist documentation"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={clearConversation}
                    className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1"
                    disabled={isLoading}
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="text-slate-400 hover:text-slate-200 p-1"
                  disabled={isLoading}
                  aria-label="Close dialog"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    className="w-5 h-5"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[200px]">
              {messages.length === 0 ? (
                <div className="text-center text-slate-500 py-8">
                  <p className="text-sm">
                    Ask any question about VoiceAssist platform
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {[
                      "How do I upload documents?",
                      "What are the security features?",
                      "How does RAG search work?",
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setInput(suggestion)}
                        className="text-xs px-3 py-1.5 rounded-full bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300 transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((message, idx) => (
                  <div
                    key={idx}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-4 py-2.5 ${
                        message.role === "user"
                          ? "bg-blue-600 text-white"
                          : "bg-slate-800 text-slate-200"
                      }`}
                    >
                      <div className="text-sm whitespace-pre-wrap">
                        {message.content}
                      </div>

                      {/* Citations */}
                      {message.citations && message.citations.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-slate-700">
                          <p className="text-xs text-slate-400 mb-1.5">
                            Sources:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {message.citations.map((citation, cidx) => (
                              <a
                                key={cidx}
                                href={`${docsBaseUrl}${citation.path}${citation.section ? `#${citation.section}` : ""}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-slate-700/50 text-blue-400 hover:text-blue-300 hover:bg-slate-700 transition-colors"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                  className="w-3 h-3"
                                >
                                  <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                                  <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
                                </svg>
                                {citation.title}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="mt-1 text-[10px] opacity-50">
                        {message.timestamp.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                ))
              )}

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-800 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <span
                          className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"
                          style={{ animationDelay: "0ms" }}
                        />
                        <span
                          className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"
                          style={{ animationDelay: "150ms" }}
                        />
                        <span
                          className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"
                          style={{ animationDelay: "300ms" }}
                        />
                      </div>
                      <span className="text-xs text-slate-500">
                        Searching docs...
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Error */}
            {error && (
              <div className="mx-4 mb-2 p-2 bg-red-900/30 border border-red-800 rounded text-xs text-red-300">
                {error}
              </div>
            )}

            {/* Input */}
            <div className="p-4 border-t border-slate-800">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your question..."
                  rows={1}
                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  style={{
                    minHeight: "40px",
                    maxHeight: "120px",
                    height: "auto",
                  }}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!input.trim() || isLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {isLoading ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-5 h-5"
                    >
                      <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.155.75.75 0 0 0 0-1.114A28.897 28.897 0 0 0 3.105 2.288Z" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="mt-2 text-[10px] text-slate-600 text-center">
                Press Enter to send, Shift+Enter for new line
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

AskAIButton.displayName = "AskAIButton";
