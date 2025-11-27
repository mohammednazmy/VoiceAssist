import { useEffect, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { feedbackService } from "../../services/feedback";
import type { FeedbackRating } from "../../services/feedback";
import { useAuth } from "../../hooks/useAuth";

const FALLBACK_MESSAGE_ID = "ui-feedback";
const FALLBACK_CONVERSATION_ID = "global";

export function FeedbackWidget() {
  const { user } = useAuth();
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    feedbackService.setUserId(user?.id ?? null);
  }, [user?.id]);

  const handleSubmit = async () => {
    if (!rating) return;

    setIsSubmitting(true);
    setStatus("idle");
    setError(null);

    try {
      if (comment.trim()) {
        await feedbackService.submitDetailedFeedback({
          rating,
          comments: comment.trim(),
          categories: ["other"],
          conversationId: FALLBACK_CONVERSATION_ID,
          messageId: FALLBACK_MESSAGE_ID,
          allowFollowUp: false,
        });
      } else {
        await feedbackService.submitQuickFeedback(
          FALLBACK_MESSAGE_ID,
          FALLBACK_CONVERSATION_ID,
          rating,
        );
      }

      setStatus("success");
      setComment("");
      setRating(null);
    } catch (submissionError) {
      console.error("[FeedbackWidget] submission failed", submissionError);
      setStatus("error");
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to send feedback. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 max-w-full">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls="feedback-panel"
      >
        <span>How was your experience?</span>
        <span aria-hidden="true">{isOpen ? "−" : "+"}</span>
      </button>

      {isOpen && (
        <div
          id="feedback-panel"
          className="mt-2 rounded-lg border border-neutral-200 bg-white p-4 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
            Send quick feedback
          </p>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Choose a rating and add an optional comment to help us improve.
          </p>

          <div
            className="mt-3 flex items-center gap-2"
            role="group"
            aria-label="Rate your experience"
          >
            <button
              type="button"
              className={`flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 ${
                rating === "positive"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-400/80 dark:bg-emerald-900/30"
                  : "border-neutral-300 text-neutral-800 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
              }`}
              onClick={() => setRating("positive")}
              aria-pressed={rating === "positive"}
            >
              <ThumbsUp className="h-4 w-4" aria-hidden="true" />
              <span>Thumbs up</span>
            </button>

            <button
              type="button"
              className={`flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 ${
                rating === "negative"
                  ? "border-rose-500 bg-rose-50 text-rose-700 dark:border-rose-400/80 dark:bg-rose-900/30"
                  : "border-neutral-300 text-neutral-800 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
              }`}
              onClick={() => setRating("negative")}
              aria-pressed={rating === "negative"}
            >
              <ThumbsDown className="h-4 w-4" aria-hidden="true" />
              <span>Thumbs down</span>
            </button>
          </div>

          <label
            className="mt-3 block text-sm font-medium text-neutral-900 dark:text-neutral-100"
            htmlFor="feedback-comment"
          >
            Optional comments
          </label>
          <textarea
            id="feedback-comment"
            className="mt-1 w-full rounded-md border border-neutral-300 bg-white p-2 text-sm text-neutral-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
            rows={3}
            placeholder="Tell us what worked well or what could be better"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />

          <div className="mt-3 flex items-center justify-between">
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              Feedback may be queued if you are offline.
            </div>
            <button
              type="button"
              className="rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-primary-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
              onClick={handleSubmit}
              disabled={!rating || isSubmitting}
            >
              {isSubmitting ? "Sending..." : "Submit"}
            </button>
          </div>

          <div
            className="mt-2 min-h-[1.5rem] text-sm"
            role="status"
            aria-live="polite"
          >
            {status === "success" && (
              <span className="text-emerald-600 dark:text-emerald-400">
                Thanks! Your feedback was received.
              </span>
            )}
            {status === "error" && (
              <span className="text-rose-600 dark:text-rose-400">
                {error || "Something went wrong."}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
