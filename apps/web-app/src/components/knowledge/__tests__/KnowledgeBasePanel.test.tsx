/**
 * KnowledgeBasePanel Unit Tests
 *
 * Verifies:
 * - KB Answer and Sources headings render after a successful query
 * - Filter chips affect the visible sources list
 * - "Insert into message" calls onInsertAnswer with attribution prefix
 * - Error state shows a retry button that re-calls runQuery
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { KnowledgeBasePanel } from "../KnowledgeBasePanel";

// Shared mutable state for the useKnowledgeBaseQuery mock
const kbState = {
  question: "",
  answer: null as string | null,
  sources: [] as Array<{ id: string; title: string; category?: string }>,
  isLoading: false,
  error: null as string | null,
};

const runQueryMock = vi.fn();
const setQuestionMock = vi.fn();

vi.mock("../../../hooks/useKnowledgeBaseQuery", () => ({
  useKnowledgeBaseQuery: () => ({
    question: kbState.question,
    setQuestion: setQuestionMock,
    answer: kbState.answer,
    sources: kbState.sources,
    isLoading: kbState.isLoading,
    error: kbState.error,
    results: [],
    runQuery: runQueryMock,
  }),
}));

// Mock useAnalytics to avoid hitting real analyticsService
const trackEventMock = vi.fn();
vi.mock("../../../hooks/useAnalytics", () => ({
  useAnalytics: () => ({
    trackEvent: trackEventMock,
  }),
}));

describe("KnowledgeBasePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    kbState.question = "";
    kbState.answer = null;
    kbState.sources = [];
    kbState.isLoading = false;
    kbState.error = null;
  });

  it("renders KB Answer and Sources headings after a successful query", async () => {
    // Simulate populated answer + sources from KB
    kbState.question = "Test question";
    kbState.answer = "This is a KB-backed answer.";
    kbState.sources = [
      { id: "doc-1", title: "Hospital guideline", category: "guideline" },
      { id: "doc-2", title: "Policy doc", category: "policy" },
    ];

    render(
      <KnowledgeBasePanel
        title="KB Panel"
        description="Test description"
        onInsertAnswer={vi.fn()}
      />,
    );

    expect(screen.getByText("KB Answer")).toBeInTheDocument();
    expect(screen.getByText("Sources")).toBeInTheDocument();
    expect(
      screen.getByText(/These documents were most influential/i),
    ).toBeInTheDocument();
  });

  it("filters sources using the filter chips", async () => {
    kbState.question = "Test question";
    kbState.answer = "Answer with multiple sources.";
    kbState.sources = [
      { id: "doc-1", title: "Guideline doc", category: "guideline" },
      { id: "doc-2", title: "Policy doc", category: "policy" },
    ];

    render(<KnowledgeBasePanel />);

    // Initially, both sources are visible
    expect(screen.getByText("Guideline doc")).toBeInTheDocument();
    expect(screen.getByText("Policy doc")).toBeInTheDocument();

    // Click the "Guidelines" filter chip
    fireEvent.click(screen.getByRole("button", { name: "Guidelines" }));

    await waitFor(() => {
      expect(screen.getByText("Guideline doc")).toBeInTheDocument();
      expect(screen.queryByText("Policy doc")).not.toBeInTheDocument();
    });
  });

  it('calls onInsertAnswer with KB attribution prefix when "Insert into message" is clicked', async () => {
    kbState.question = "Test question";
    kbState.answer = "Final KB answer.";
    kbState.sources = [
      { id: "doc-1", title: "Guideline doc", category: "guideline" },
      { id: "doc-2", title: "Policy doc", category: "policy" },
      { id: "doc-3", title: "Note", category: "note" },
    ];

    const onInsertAnswer = vi.fn();

    render(<KnowledgeBasePanel onInsertAnswer={onInsertAnswer} />);

    const insertButton = screen.getByRole("button", {
      name: /insert into message/i,
    });
    fireEvent.click(insertButton);

    expect(onInsertAnswer).toHaveBeenCalledTimes(1);
    const arg = onInsertAnswer.mock.calls[0][0] as string;
    expect(arg).toContain("KB answer (from 3 documents):");
    expect(arg).toContain("Final KB answer.");
  });

  it("shows error state with retry button when query fails and re-calls runQuery", async () => {
    kbState.question = "Test question";
    kbState.answer = null;
    kbState.sources = [];
    kbState.isLoading = false;
    kbState.error = "Backend unavailable";

    render(<KnowledgeBasePanel />);

    expect(
      screen.getByText(/Unable to query KB right now/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Backend unavailable")).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: /try again/i });
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(runQueryMock).toHaveBeenCalled();
    });
  });
}
