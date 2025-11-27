/**
 * Feedback Form Component
 *
 * A detailed feedback form for collecting categorized feedback.
 * Supports categories, comments, and optional follow-up consent.
 *
 * @example
 * ```tsx
 * <FeedbackForm
 *   rating="negative"
 *   onSubmit={(data) => submitFeedback(data)}
 *   onCancel={() => setShowForm(false)}
 * />
 * ```
 */

import * as React from "react";
import { cn } from "../lib/utils";

/**
 * Feedback category type
 */
export type FeedbackCategory =
  | "accuracy"
  | "relevance"
  | "completeness"
  | "clarity"
  | "outdated"
  | "helpful"
  | "sources"
  | "other";

/**
 * Severity level
 */
export type FeedbackSeverity = "low" | "medium" | "high" | "critical";

/**
 * Feedback form data
 */
export interface FeedbackFormData {
  categories: FeedbackCategory[];
  comments: string;
  suggestedCorrection?: string;
  severity?: FeedbackSeverity;
  allowFollowUp: boolean;
  contactEmail?: string;
}

/**
 * Category option
 */
interface CategoryOption {
  value: FeedbackCategory;
  label: string;
  description: string;
}

const CATEGORY_OPTIONS: CategoryOption[] = [
  {
    value: "accuracy",
    label: "Inaccurate",
    description: "The information was factually incorrect",
  },
  {
    value: "relevance",
    label: "Not relevant",
    description: "The answer didn't address my question",
  },
  {
    value: "completeness",
    label: "Incomplete",
    description: "Important information was missing",
  },
  {
    value: "clarity",
    label: "Unclear",
    description: "The response was confusing or hard to understand",
  },
  {
    value: "outdated",
    label: "Outdated",
    description: "The information is no longer current",
  },
  {
    value: "sources",
    label: "Source issues",
    description: "Problems with the cited sources",
  },
  {
    value: "other",
    label: "Other",
    description: "Something else",
  },
];

const SEVERITY_OPTIONS: { value: FeedbackSeverity; label: string }[] = [
  { value: "low", label: "Minor issue" },
  { value: "medium", label: "Moderate issue" },
  { value: "high", label: "Significant issue" },
  { value: "critical", label: "Critical/dangerous" },
];

/**
 * Props for the FeedbackForm component
 */
export interface FeedbackFormProps {
  /** Initial rating that triggered the form */
  rating?: "positive" | "negative" | "neutral";
  /** Callback when form is submitted */
  onSubmit?: (data: FeedbackFormData) => void;
  /** Callback when form is cancelled */
  onCancel?: () => void;
  /** Whether form is submitting */
  isSubmitting?: boolean;
  /** Additional class names */
  className?: string;
  /** Show severity selector (for negative feedback) */
  showSeverity?: boolean;
  /** Show correction suggestion field */
  showCorrectionField?: boolean;
  /** Minimum comment length */
  minCommentLength?: number;
  /** Maximum comment length */
  maxCommentLength?: number;
}

/**
 * Check Icon
 */
const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/**
 * FeedbackForm Component
 */
export const FeedbackForm = React.forwardRef<
  HTMLFormElement,
  FeedbackFormProps
>(
  (
    {
      rating = "negative",
      onSubmit,
      onCancel,
      isSubmitting = false,
      className,
      showSeverity = true,
      showCorrectionField = true,
      minCommentLength = 10,
      maxCommentLength = 1000,
    },
    ref,
  ) => {
    const [categories, setCategories] = React.useState<FeedbackCategory[]>([]);
    const [comments, setComments] = React.useState("");
    const [suggestedCorrection, setSuggestedCorrection] = React.useState("");
    const [severity, setSeverity] = React.useState<FeedbackSeverity>("medium");
    const [allowFollowUp, setAllowFollowUp] = React.useState(false);
    const [contactEmail, setContactEmail] = React.useState("");
    const [errors, setErrors] = React.useState<Record<string, string>>({});

    const toggleCategory = (category: FeedbackCategory) => {
      setCategories((prev) =>
        prev.includes(category)
          ? prev.filter((c) => c !== category)
          : [...prev, category],
      );
      // Clear category error when user selects one
      if (errors.categories) {
        setErrors((prev) => ({ ...prev, categories: "" }));
      }
    };

    const validate = (): boolean => {
      const newErrors: Record<string, string> = {};

      if (categories.length === 0) {
        newErrors.categories = "Please select at least one category";
      }

      if (comments.length < minCommentLength) {
        newErrors.comments = `Please provide at least ${minCommentLength} characters of feedback`;
      }

      if (allowFollowUp && contactEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(contactEmail)) {
          newErrors.contactEmail = "Please enter a valid email address";
        }
      }

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();

      if (!validate()) return;

      onSubmit?.({
        categories,
        comments,
        suggestedCorrection: suggestedCorrection || undefined,
        severity: showSeverity && rating === "negative" ? severity : undefined,
        allowFollowUp,
        contactEmail: allowFollowUp && contactEmail ? contactEmail : undefined,
      });
    };

    const isPositive = rating === "positive";

    return (
      <form
        ref={ref}
        onSubmit={handleSubmit}
        className={cn(
          "rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-800",
          className,
        )}
      >
        {/* Header */}
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {isPositive ? "What was helpful?" : "What went wrong?"}
          </h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Your feedback helps us improve our AI responses
          </p>
        </div>

        {/* Categories */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Select all that apply
            {errors.categories && (
              <span className="ml-2 text-error-600 dark:text-error-400">
                {errors.categories}
              </span>
            )}
          </label>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleCategory(option.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors",
                  categories.includes(option.value)
                    ? "bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-300"
                    : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600",
                )}
                title={option.description}
              >
                {categories.includes(option.value) && (
                  <CheckIcon className="h-3.5 w-3.5" />
                )}
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Severity (for negative feedback) */}
        {showSeverity && !isPositive && (
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              How severe is this issue?
            </label>
            <div className="flex flex-wrap gap-2">
              {SEVERITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSeverity(option.value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors",
                    severity === option.value
                      ? option.value === "critical"
                        ? "bg-error-100 text-error-800 dark:bg-error-900/40 dark:text-error-300"
                        : option.value === "high"
                          ? "bg-warning-100 text-warning-800 dark:bg-warning-900/40 dark:text-warning-300"
                          : "bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-300"
                      : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Comments */}
        <div className="mb-4">
          <label
            htmlFor="feedback-comments"
            className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            Tell us more
            {errors.comments && (
              <span className="ml-2 text-error-600 dark:text-error-400">
                {errors.comments}
              </span>
            )}
          </label>
          <textarea
            id="feedback-comments"
            value={comments}
            onChange={(e) => {
              setComments(e.target.value);
              if (errors.comments) {
                setErrors((prev) => ({ ...prev, comments: "" }));
              }
            }}
            placeholder={
              isPositive
                ? "What specifically was helpful about this response?"
                : "What was wrong or could be improved?"
            }
            rows={3}
            maxLength={maxCommentLength}
            className={cn(
              "w-full rounded-md border bg-white px-3 py-2 text-sm placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-neutral-900",
              errors.comments
                ? "border-error-500"
                : "border-neutral-300 dark:border-neutral-600",
            )}
          />
          <p className="mt-1 text-xs text-neutral-500">
            {comments.length}/{maxCommentLength} characters
          </p>
        </div>

        {/* Suggested Correction */}
        {showCorrectionField && !isPositive && (
          <div className="mb-4">
            <label
              htmlFor="feedback-correction"
              className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Suggested correction (optional)
            </label>
            <textarea
              id="feedback-correction"
              value={suggestedCorrection}
              onChange={(e) => setSuggestedCorrection(e.target.value)}
              placeholder="If you know the correct information, please share it here"
              rows={2}
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-900"
            />
          </div>
        )}

        {/* Follow-up Consent */}
        <div className="mb-4">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={allowFollowUp}
              onChange={(e) => setAllowFollowUp(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">
              I'm willing to be contacted for follow-up questions
            </span>
          </label>
          {allowFollowUp && (
            <div className="mt-2 pl-6">
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => {
                  setContactEmail(e.target.value);
                  if (errors.contactEmail) {
                    setErrors((prev) => ({ ...prev, contactEmail: "" }));
                  }
                }}
                placeholder="your@email.com (optional)"
                className={cn(
                  "w-full rounded-md border bg-white px-3 py-2 text-sm placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-neutral-900",
                  errors.contactEmail
                    ? "border-error-500"
                    : "border-neutral-300 dark:border-neutral-600",
                )}
              />
              {errors.contactEmail && (
                <p className="mt-1 text-xs text-error-600 dark:text-error-400">
                  {errors.contactEmail}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-md px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 dark:bg-primary-500 dark:hover:bg-primary-600"
          >
            {isSubmitting ? "Submitting..." : "Submit Feedback"}
          </button>
        </div>
      </form>
    );
  },
);

FeedbackForm.displayName = "FeedbackForm";
