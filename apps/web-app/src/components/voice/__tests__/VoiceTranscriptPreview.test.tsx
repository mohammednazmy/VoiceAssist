/**
 * VoiceTranscriptPreview Tests
 * Tests for the live speech-to-text preview component
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { VoiceTranscriptPreview } from "../VoiceTranscriptPreview";

describe("VoiceTranscriptPreview", () => {
  describe("rendering", () => {
    it("should render partial transcript when speaking", () => {
      render(
        <VoiceTranscriptPreview
          partialTranscript="Hello, I am speaking..."
          isSpeaking={true}
        />,
      );

      expect(
        screen.getByTestId("voice-transcript-preview"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("partial-transcript-text")).toHaveTextContent(
        "Hello, I am speaking...",
      );
    });

    it("should not render when not speaking", () => {
      render(
        <VoiceTranscriptPreview
          partialTranscript="Some text"
          isSpeaking={false}
        />,
      );

      expect(
        screen.queryByTestId("voice-transcript-preview"),
      ).not.toBeInTheDocument();
    });

    it("should not render when partialTranscript is empty", () => {
      render(<VoiceTranscriptPreview partialTranscript="" isSpeaking={true} />);

      expect(
        screen.queryByTestId("voice-transcript-preview"),
      ).not.toBeInTheDocument();
    });

    it("should not render when both conditions are false", () => {
      render(
        <VoiceTranscriptPreview partialTranscript="" isSpeaking={false} />,
      );

      expect(
        screen.queryByTestId("voice-transcript-preview"),
      ).not.toBeInTheDocument();
    });
  });

  describe("visual indicators", () => {
    it("should show Listening indicator when speaking", () => {
      render(
        <VoiceTranscriptPreview
          partialTranscript="Test transcript"
          isSpeaking={true}
        />,
      );

      expect(screen.getByText("Listening")).toBeInTheDocument();
    });

    it("should display transcript text with italic styling", () => {
      render(
        <VoiceTranscriptPreview
          partialTranscript="Test transcript"
          isSpeaking={true}
        />,
      );

      const transcriptText = screen.getByTestId("partial-transcript-text");
      expect(transcriptText).toHaveClass("italic");
    });
  });

  describe("accessibility", () => {
    it("should have aria-live region for screen readers", () => {
      render(
        <VoiceTranscriptPreview
          partialTranscript="Accessible text"
          isSpeaking={true}
        />,
      );

      const liveRegion = screen.getByRole("status");
      expect(liveRegion).toHaveAttribute("aria-live", "polite");
    });

    it("should have aria-atomic set to false for incremental updates", () => {
      render(
        <VoiceTranscriptPreview
          partialTranscript="Incremental update"
          isSpeaking={true}
        />,
      );

      const liveRegion = screen.getByRole("status");
      expect(liveRegion).toHaveAttribute("aria-atomic", "false");
    });

    it("should hide decorative elements from screen readers", () => {
      render(
        <VoiceTranscriptPreview partialTranscript="Test" isSpeaking={true} />,
      );

      // The pulsing indicator dot and cursor should be aria-hidden
      const hiddenElements = screen
        .getByTestId("voice-transcript-preview")
        .querySelectorAll('[aria-hidden="true"]');
      expect(hiddenElements.length).toBeGreaterThan(0);
    });
  });

  describe("content updates", () => {
    it("should update when partialTranscript changes", () => {
      const { rerender } = render(
        <VoiceTranscriptPreview
          partialTranscript="First part"
          isSpeaking={true}
        />,
      );

      expect(screen.getByTestId("partial-transcript-text")).toHaveTextContent(
        "First part",
      );

      rerender(
        <VoiceTranscriptPreview
          partialTranscript="First part of the sentence"
          isSpeaking={true}
        />,
      );

      expect(screen.getByTestId("partial-transcript-text")).toHaveTextContent(
        "First part of the sentence",
      );
    });

    it("should hide when isSpeaking becomes false", () => {
      const { rerender } = render(
        <VoiceTranscriptPreview
          partialTranscript="Speaking text"
          isSpeaking={true}
        />,
      );

      expect(
        screen.getByTestId("voice-transcript-preview"),
      ).toBeInTheDocument();

      rerender(
        <VoiceTranscriptPreview
          partialTranscript="Speaking text"
          isSpeaking={false}
        />,
      );

      expect(
        screen.queryByTestId("voice-transcript-preview"),
      ).not.toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("should handle very long transcripts", () => {
      const longText = "This is a very long transcript ".repeat(50).trim();
      render(
        <VoiceTranscriptPreview
          partialTranscript={longText}
          isSpeaking={true}
        />,
      );

      expect(screen.getByTestId("partial-transcript-text")).toHaveTextContent(
        longText,
      );
    });

    it("should handle special characters in transcript", () => {
      const specialText = "Hello! How are you? I'm fine... <test> & 'quotes'";
      render(
        <VoiceTranscriptPreview
          partialTranscript={specialText}
          isSpeaking={true}
        />,
      );

      expect(screen.getByTestId("partial-transcript-text")).toHaveTextContent(
        specialText,
      );
    });

    it("should handle unicode characters", () => {
      const unicodeText = "مرحبا بالعالم - Hello World - 你好世界";
      render(
        <VoiceTranscriptPreview
          partialTranscript={unicodeText}
          isSpeaking={true}
        />,
      );

      expect(screen.getByTestId("partial-transcript-text")).toHaveTextContent(
        unicodeText,
      );
    });
  });
});
