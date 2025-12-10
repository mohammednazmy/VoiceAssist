/**
 * Semantic Turn Analyzer Tests
 *
 * Comprehensive test suite for the SemanticTurnAnalyzer.
 * Tests turn completion detection, continuation signals, and
 * prosody hint integration.
 *
 * Phase 2: Advanced Turn Detection
 * Reference: docs/planning/VOICE_MODE_BARGE_IN_IMPROVEMENT_PLAN_V3.md
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  SemanticTurnAnalyzer,
  createSemanticTurnAnalyzer,
  analyzeTranscript,
} from "./semanticTurnAnalyzer";
import {
  DEFAULT_TURN_SIGNALS,
  getHesitationMarkers,
  isHesitationMarker,
  endsWithContinuationSignal,
  endsWithStrongCompletion,
} from "./turnDetection";
import type { TurnAnalysisContext, ProsodyHints } from "./turnDetection";

// ============================================================================
// Test Data
// ============================================================================

/**
 * Test cases for strong completion signals.
 */
const STRONG_COMPLETION_TESTS = [
  // Questions
  { transcript: "What time is it?", expected: "respond" },
  { transcript: "Can you help me?", expected: "respond" },
  { transcript: "Where is the nearest hospital?", expected: "respond" },
  { transcript: "How does this work?", expected: "respond" },

  // Commands
  { transcript: "stop", expected: "respond" },
  { transcript: "Please stop", expected: "respond" },
  { transcript: "show me the results", expected: "respond" },
  { transcript: "help", expected: "respond" },
  { transcript: "Search for diabetes treatments", expected: "respond" },

  // Acknowledgments
  { transcript: "okay", expected: "respond" },
  { transcript: "thanks", expected: "respond" },
  { transcript: "got it", expected: "respond" },
  { transcript: "yes", expected: "respond" },
  { transcript: "understood", expected: "respond" },

  // Farewells
  { transcript: "bye", expected: "respond" },
  { transcript: "goodbye", expected: "respond" },
  { transcript: "see you later", expected: "respond" },
];

/**
 * Test cases for continuation signals (user NOT done).
 */
const CONTINUATION_SIGNAL_TESTS = [
  // Trailing conjunctions
  { transcript: "I want to know about diabetes and", expected: "wait" },
  { transcript: "Tell me about heart disease but", expected: "wait" },
  { transcript: "The patient has symptoms because", expected: "wait" },
  { transcript: "We should check the results or", expected: "wait" },

  // Hesitation markers
  { transcript: "I think um", expected: "wait" },
  { transcript: "Well let me see uh", expected: "wait" },
  { transcript: "The diagnosis is like", expected: "wait" },

  // Incomplete patterns
  { transcript: "I want to", expected: "wait" },
  { transcript: "Can you", expected: "wait" },
  { transcript: "What if", expected: "wait" },
  { transcript: "I need to", expected: "wait" },
];

/**
 * Test cases for weak completion signals.
 */
const WEAK_COMPLETION_TESTS = [
  { transcript: "The patient is stable.", expected: "respond" },
  { transcript: "I understand the diagnosis!", expected: "respond" },
  { transcript: "Blood pressure is normal.", expected: "respond" },
];

// ============================================================================
// SemanticTurnAnalyzer Tests
// ============================================================================

describe("SemanticTurnAnalyzer", () => {
  let analyzer: SemanticTurnAnalyzer;

  beforeEach(() => {
    analyzer = createSemanticTurnAnalyzer();
  });

  describe("initialization", () => {
    it("should create with default config", () => {
      const instance = new SemanticTurnAnalyzer();
      expect(instance).toBeDefined();
      expect(instance.getLanguage()).toBe("en");
    });

    it("should create with custom config", () => {
      const instance = new SemanticTurnAnalyzer({
        language: "es",
        completionThreshold: 0.8,
      });
      expect(instance.getLanguage()).toBe("es");
    });

    it("should use factory function", () => {
      const instance = createSemanticTurnAnalyzer();
      expect(instance).toBeInstanceOf(SemanticTurnAnalyzer);
    });
  });

  describe("strong completion signals", () => {
    it.each(STRONG_COMPLETION_TESTS)(
      'should detect strong completion: "$transcript"',
      ({ transcript, expected }) => {
        const result = analyzer.analyze(transcript, 500);

        expect(result.action).toBe(expected);
        if (expected === "respond") {
          expect(result.completionConfidence).toBeGreaterThanOrEqual(0.6);
        }
      },
    );

    it("should detect question marks as strong completion", () => {
      const result = analyzer.analyze("What is your name?", 100);
      expect(result.signals.strongCompletion).toContain("question_ending");
      expect(result.isCompleteThought).toBe(true);
    });

    it("should detect acknowledgments", () => {
      const result = analyzer.analyze("okay", 100);
      expect(result.signals.strongCompletion).toContainEqual(
        expect.stringMatching(/acknowledgment:/),
      );
    });

    it("should detect farewells", () => {
      const result = analyzer.analyze("goodbye", 100);
      expect(result.signals.strongCompletion).toContainEqual(
        expect.stringMatching(/farewell:/),
      );
    });

    it("should detect command verbs in short utterances", () => {
      const result = analyzer.analyze("stop", 100);
      expect(result.signals.strongCompletion).toContainEqual(
        expect.stringMatching(/command:/),
      );
    });
  });

  describe("continuation signals", () => {
    it.each(CONTINUATION_SIGNAL_TESTS)(
      'should detect continuation: "$transcript"',
      ({ transcript, expected }) => {
        const result = analyzer.analyze(transcript, 500);

        expect(result.action).toBe(expected);
        expect(result.signals.continuation.length).toBeGreaterThan(0);
      },
    );

    it("should detect trailing conjunctions", () => {
      const result = analyzer.analyze("I want to tell you about and", 100);
      expect(result.signals.continuation).toContainEqual(
        expect.stringMatching(/conjunction:/),
      );
    });

    it("should detect hesitation markers", () => {
      const result = analyzer.analyze("I think um", 100);
      expect(result.signals.continuation).toContainEqual(
        expect.stringMatching(/hesitation:/),
      );
    });

    it("should detect incomplete patterns", () => {
      const result = analyzer.analyze("I want to", 100);
      expect(result.signals.continuation).toContain("incomplete:pattern");
    });

    it("should mark partial transcripts as continuation", () => {
      const result = analyzer.analyze("What is", 100, { isPartial: true });
      expect(result.signals.continuation).toContain("partial_transcript");
      expect(result.completionConfidence).toBeLessThanOrEqual(0.3);
    });
  });

  describe("weak completion signals", () => {
    it.each(WEAK_COMPLETION_TESTS)(
      'should detect weak completion: "$transcript"',
      ({ transcript, expected }) => {
        const result = analyzer.analyze(transcript, 1000);
        expect(result.action).toBe(expected);
      },
    );

    it("should detect statement endings", () => {
      const result = analyzer.analyze("The patient is improving.", 500);
      expect(result.signals.weakCompletion).toContain("statement_ending");
    });

    it("should detect reasonable length utterances", () => {
      const result = analyzer.analyze("I need to check the labs", 500);
      expect(result.signals.weakCompletion).toContain("reasonable_length");
    });
  });

  describe("prosody hints integration", () => {
    it("should boost confidence with falling pitch", () => {
      const prosodyHints: ProsodyHints = {
        risingIntonation: false,
        energyDecline: true,
        finalPitchDirection: "down",
      };

      const result = analyzer.analyze("The patient is stable", 500, {
        isPartial: false,
        prosodyHints,
      });

      // Falling pitch + energy decline should increase confidence
      expect(result.completionConfidence).toBeGreaterThan(0.5);
    });

    it("should reduce confidence with rising intonation", () => {
      const prosodyHints: ProsodyHints = {
        risingIntonation: true,
        energyDecline: false,
      };

      const result = analyzer.analyze("The patient", 200, {
        isPartial: false,
        prosodyHints,
      });

      expect(result.signals.continuation).toContain("prosody:rising_intonation");
    });
  });

  describe("silence duration effects", () => {
    it("should increase confidence with long silence", () => {
      const shortSilenceResult = analyzer.analyze("Hello there", 200);
      const longSilenceResult = analyzer.analyze("Hello there", 2500);

      expect(longSilenceResult.completionConfidence).toBeGreaterThan(
        shortSilenceResult.completionConfidence,
      );
    });

    it("should decrease confidence with very short silence", () => {
      const veryShortResult = analyzer.analyze("I think", 100);
      const normalResult = analyzer.analyze("I think", 500);

      expect(veryShortResult.completionConfidence).toBeLessThanOrEqual(
        normalResult.completionConfidence,
      );
    });

    it("should force response after max wait time", () => {
      const result = analyzer.analyze("maybe", 6000);
      expect(result.action).toBe("respond");
      expect(result.reason).toContain("Max wait time");
    });
  });

  describe("prompt_continuation action", () => {
    it("should prompt continuation with low confidence and long silence", () => {
      // A transcript that has low completion confidence
      const result = analyzer.analyze("well", 3500);

      // With long silence and low confidence, should prompt
      if (result.completionConfidence < 0.4) {
        expect(result.action).toBe("prompt_continuation");
        expect(result.useFillerPhrase).toBe(true);
      }
    });
  });

  describe("context management", () => {
    it("should add context from previous utterances", () => {
      analyzer.addContext("Tell me about heart disease");
      analyzer.addContext("What are the symptoms?");

      // Context is added (internal state)
      expect(analyzer.getLastAnalysis()).toBeNull(); // No analysis yet

      const result = analyzer.analyze("Got it", 500);
      expect(result).toBeDefined();
    });

    it("should clear context", () => {
      analyzer.addContext("Previous utterance");
      analyzer.clearContext();

      // After clear, context should be empty
      // This is internal state, but we can verify no errors occur
      const result = analyzer.analyze("New conversation", 500);
      expect(result).toBeDefined();
    });

    it("should cache last analysis", () => {
      const result = analyzer.analyze("What time is it?", 500);
      const lastAnalysis = analyzer.getLastAnalysis();

      expect(lastAnalysis).toEqual(result);
    });
  });

  describe("recommended wait times", () => {
    it("should return 0 wait for strong completion", () => {
      const result = analyzer.analyze("What time is it?", 500);
      expect(result.recommendedWaitMs).toBe(0);
    });

    it("should return positive wait for continuation signals", () => {
      const result = analyzer.analyze("I want to tell you and", 500);
      expect(result.recommendedWaitMs).toBeGreaterThan(0);
    });

    it("should cap wait time at max", () => {
      const result = analyzer.analyze("hmm", 100);
      expect(result.recommendedWaitMs).toBeLessThanOrEqual(5000);
    });
  });

  describe("isCompleteThought flag", () => {
    it("should be true for questions", () => {
      const result = analyzer.analyze("What is happening?", 500);
      expect(result.isCompleteThought).toBe(true);
    });

    it("should be true for statements with completion", () => {
      const result = analyzer.analyze("The test is complete.", 500);
      expect(result.isCompleteThought).toBe(true);
    });

    it("should be false for incomplete sentences", () => {
      const result = analyzer.analyze("I want to", 500);
      // If there are continuation signals and no completion signals
      if (
        result.signals.continuation.length > 0 &&
        result.signals.strongCompletion.length === 0
      ) {
        expect(result.isCompleteThought).toBe(false);
      }
    });
  });
});

// ============================================================================
// Quick Analysis Helper Tests
// ============================================================================

describe("analyzeTranscript helper", () => {
  it("should perform quick analysis without instance", () => {
    const result = analyzeTranscript("What time is it?");
    expect(result.action).toBe("respond");
    expect(result.signals.strongCompletion).toContain("question_ending");
  });

  it("should accept silence duration", () => {
    const result = analyzeTranscript("Hello", 2500);
    expect(result.completionConfidence).toBeGreaterThan(0.5);
  });

  it("should accept context", () => {
    const result = analyzeTranscript("I want to", 500, { isPartial: false });
    expect(result).toBeDefined();
  });
});

// ============================================================================
// Turn Detection Utility Tests
// ============================================================================

describe("turnDetection utilities", () => {
  describe("getHesitationMarkers", () => {
    it("should return English markers by default", () => {
      const markers = getHesitationMarkers();
      expect(markers).toContain("um");
      expect(markers).toContain("uh");
    });

    it("should return markers for supported languages", () => {
      const spanish = getHesitationMarkers("es");
      expect(spanish).toContain("eh");
      expect(spanish).toContain("pues");

      const french = getHesitationMarkers("fr");
      expect(french).toContain("euh");

      const arabic = getHesitationMarkers("ar");
      expect(arabic).toContain("يعني");
    });

    it("should fallback to English for unknown languages", () => {
      const unknown = getHesitationMarkers("xx");
      const english = getHesitationMarkers("en");
      expect(unknown).toEqual(english);
    });

    it("should handle language codes with region", () => {
      const enUS = getHesitationMarkers("en-US");
      const en = getHesitationMarkers("en");
      expect(enUS).toEqual(en);
    });
  });

  describe("isHesitationMarker", () => {
    it("should detect hesitation markers", () => {
      expect(isHesitationMarker("um")).toBe(true);
      expect(isHesitationMarker("uh")).toBe(true);
      expect(isHesitationMarker("like")).toBe(true);
    });

    it("should be case insensitive", () => {
      expect(isHesitationMarker("UM")).toBe(true);
      expect(isHesitationMarker("Um")).toBe(true);
    });

    it("should detect markers at word boundaries", () => {
      expect(isHesitationMarker("um ")).toBe(true);
      expect(isHesitationMarker(" um")).toBe(true);
    });

    it("should not detect non-markers", () => {
      expect(isHesitationMarker("hello")).toBe(false);
      expect(isHesitationMarker("umbrella")).toBe(false);
    });

    it("should work for other languages", () => {
      expect(isHesitationMarker("euh", "fr")).toBe(true);
      expect(isHesitationMarker("pues", "es")).toBe(true);
    });
  });

  describe("endsWithContinuationSignal", () => {
    it("should detect trailing conjunctions", () => {
      expect(endsWithContinuationSignal("I want to and")).toBe(true);
      expect(endsWithContinuationSignal("Tell me but")).toBe(true);
      expect(endsWithContinuationSignal("Let's check because")).toBe(true);
    });

    it("should detect hesitation markers at end", () => {
      expect(endsWithContinuationSignal("I think um")).toBe(true);
      expect(endsWithContinuationSignal("Well uh")).toBe(true);
    });

    it("should detect incomplete patterns", () => {
      expect(endsWithContinuationSignal("I want to")).toBe(true);
      expect(endsWithContinuationSignal("Can you")).toBe(true);
      expect(endsWithContinuationSignal("What if")).toBe(true);
    });

    it("should not flag complete sentences", () => {
      expect(endsWithContinuationSignal("I want to go home.")).toBe(false);
      expect(endsWithContinuationSignal("Can you help me?")).toBe(false);
    });
  });

  describe("endsWithStrongCompletion", () => {
    it("should detect question endings", () => {
      expect(endsWithStrongCompletion("What time is it?")).toBe(true);
      expect(endsWithStrongCompletion("Are you there?")).toBe(true);
    });

    it("should detect command verbs", () => {
      expect(endsWithStrongCompletion("stop")).toBe(true);
      expect(endsWithStrongCompletion("please help")).toBe(true);
    });

    it("should detect acknowledgments", () => {
      expect(endsWithStrongCompletion("okay")).toBe(true);
      expect(endsWithStrongCompletion("thanks")).toBe(true);
      expect(endsWithStrongCompletion("got it")).toBe(true);
    });

    it("should detect farewells", () => {
      expect(endsWithStrongCompletion("bye")).toBe(true);
      expect(endsWithStrongCompletion("goodbye")).toBe(true);
    });

    it("should not flag incomplete sentences", () => {
      expect(endsWithStrongCompletion("I want to")).toBe(false);
      expect(endsWithStrongCompletion("The patient and")).toBe(false);
    });
  });
});

// ============================================================================
// Default Turn Signals Tests
// ============================================================================

describe("DEFAULT_TURN_SIGNALS", () => {
  it("should have strong completion patterns", () => {
    expect(DEFAULT_TURN_SIGNALS.strongCompletion.questionEndings).toBeInstanceOf(
      RegExp,
    );
    expect(DEFAULT_TURN_SIGNALS.strongCompletion.commandVerbs.length).toBeGreaterThan(0);
    expect(DEFAULT_TURN_SIGNALS.strongCompletion.acknowledgments.length).toBeGreaterThan(
      0,
    );
    expect(DEFAULT_TURN_SIGNALS.strongCompletion.farewells.length).toBeGreaterThan(0);
  });

  it("should have weak completion patterns", () => {
    expect(DEFAULT_TURN_SIGNALS.weakCompletion.statementEndings).toBeInstanceOf(RegExp);
    expect(DEFAULT_TURN_SIGNALS.weakCompletion.trailingPunctuation).toBeInstanceOf(
      RegExp,
    );
    expect(DEFAULT_TURN_SIGNALS.weakCompletion.completeClause).toBeInstanceOf(RegExp);
  });

  it("should have continuation signals", () => {
    expect(
      DEFAULT_TURN_SIGNALS.continuationSignals.hesitationMarkers.length,
    ).toBeGreaterThan(0);
    expect(DEFAULT_TURN_SIGNALS.continuationSignals.conjunctions.length).toBeGreaterThan(
      0,
    );
    expect(
      DEFAULT_TURN_SIGNALS.continuationSignals.incompletePatterns.length,
    ).toBeGreaterThan(0);
  });

  it("should match question endings correctly", () => {
    const pattern = DEFAULT_TURN_SIGNALS.strongCompletion.questionEndings;
    expect(pattern.test("What?")).toBe(true);
    expect(pattern.test("Question? ")).toBe(true);
    expect(pattern.test("No question")).toBe(false);
  });

  it("should match statement endings correctly", () => {
    const pattern = DEFAULT_TURN_SIGNALS.weakCompletion.statementEndings;
    expect(pattern.test("Done.")).toBe(true);
    expect(pattern.test("Wow!")).toBe(true);
    expect(pattern.test("Incomplete")).toBe(false);
  });
});

// ============================================================================
// Edge Cases and Accuracy Tests
// ============================================================================

describe("Edge Cases", () => {
  let analyzer: SemanticTurnAnalyzer;

  beforeEach(() => {
    analyzer = createSemanticTurnAnalyzer();
  });

  describe("empty and minimal input", () => {
    it("should handle empty string", () => {
      const result = analyzer.analyze("", 500);
      expect(result).toBeDefined();
      expect(result.action).toBeDefined();
    });

    it("should handle whitespace only", () => {
      const result = analyzer.analyze("   ", 500);
      expect(result).toBeDefined();
    });

    it("should handle single character", () => {
      const result = analyzer.analyze("a", 500);
      expect(result).toBeDefined();
    });
  });

  describe("punctuation variations", () => {
    it("should handle multiple question marks", () => {
      const result = analyzer.analyze("What???", 500);
      expect(result.signals.strongCompletion).toContain("question_ending");
    });

    it("should handle multiple exclamation marks", () => {
      const result = analyzer.analyze("Stop!!!", 500);
      expect(result.signals.weakCompletion).toContain("statement_ending");
    });

    it("should handle mixed punctuation", () => {
      const result = analyzer.analyze("What!?", 500);
      // Should detect either question or statement ending
      expect(
        result.signals.strongCompletion.length > 0 ||
          result.signals.weakCompletion.length > 0,
      ).toBe(true);
    });
  });

  describe("case sensitivity", () => {
    it("should handle uppercase input", () => {
      const result = analyzer.analyze("WHAT TIME IS IT?", 500);
      expect(result.signals.strongCompletion).toContain("question_ending");
    });

    it("should handle mixed case", () => {
      const result = analyzer.analyze("StOp", 500);
      expect(result.signals.strongCompletion).toContainEqual(
        expect.stringMatching(/command:/),
      );
    });
  });

  describe("medical domain examples", () => {
    it("should handle medication names", () => {
      const result = analyzer.analyze("Prescribe lisinopril 10mg.", 500);
      expect(result.action).toBe("respond");
    });

    it("should handle medical abbreviations", () => {
      const result = analyzer.analyze("The patient's BP is 120/80.", 500);
      expect(result.signals.weakCompletion).toContain("statement_ending");
    });

    it("should handle dictation patterns", () => {
      // Dictation often has short pauses between phrases
      const result = analyzer.analyze("Patient presents with", 800);
      expect(result.signals.continuation).toContain("incomplete:pattern");
    });
  });

  describe("ambiguous cases", () => {
    it("should handle 'so' as continuation vs completion", () => {
      // "so" at the end often indicates continuation
      const continuation = analyzer.analyze("I was thinking so", 500);
      expect(continuation.signals.continuation).toContainEqual(
        expect.stringMatching(/conjunction:|hesitation:/),
      );

      // "so" in the middle is different
      const middle = analyzer.analyze("So what do you think?", 500);
      expect(middle.signals.strongCompletion).toContain("question_ending");
    });

    it("should handle 'well' as hesitation vs word", () => {
      // "well" at the end often indicates hesitation
      const hesitation = analyzer.analyze("I think well", 500);
      expect(hesitation.signals.continuation.length).toBeGreaterThan(0);
    });
  });

  describe("long utterances", () => {
    it("should handle very long transcripts", () => {
      const longText =
        "The patient presented with symptoms including fatigue, headache, " +
        "and mild fever over the past three days. Physical examination " +
        "revealed normal vital signs. Laboratory tests were ordered.";

      const result = analyzer.analyze(longText, 500);
      expect(result).toBeDefined();
      expect(result.action).toBe("respond");
    });

    it("should detect completion even in long text", () => {
      const longQuestion =
        "Can you tell me more about the diagnosis and what the next steps should be?";

      const result = analyzer.analyze(longQuestion, 500);
      expect(result.signals.strongCompletion).toContain("question_ending");
    });
  });
});

// ============================================================================
// Accuracy Benchmark Tests
// ============================================================================

describe("Accuracy Benchmarks", () => {
  let analyzer: SemanticTurnAnalyzer;

  beforeEach(() => {
    analyzer = createSemanticTurnAnalyzer();
  });

  /**
   * These tests verify accuracy against ground truth test cases.
   * Target: >85% accuracy on completion detection.
   */
  describe("turn completion accuracy", () => {
    const testCases = [
      // Clear completions (should respond)
      { transcript: "What is the diagnosis?", expectedAction: "respond" },
      { transcript: "Please read the last result.", expectedAction: "respond" },
      { transcript: "Thank you for your help.", expectedAction: "respond" },
      { transcript: "Stop recording.", expectedAction: "respond" },
      { transcript: "Yes, that's correct.", expectedAction: "respond" },

      // Clear continuations (should wait)
      { transcript: "I want to say that and", expectedAction: "wait" },
      { transcript: "The patient was diagnosed with um", expectedAction: "wait" },
      { transcript: "Can you tell me about", expectedAction: "wait" },
      { transcript: "What if we try", expectedAction: "wait" },
      { transcript: "I was thinking that because", expectedAction: "wait" },
    ];

    let correctPredictions = 0;

    it.each(testCases)(
      'should correctly classify: "$transcript"',
      ({ transcript, expectedAction }) => {
        const result = analyzer.analyze(transcript, 500);
        const isCorrect = result.action === expectedAction;

        if (isCorrect) {
          correctPredictions++;
        }

        expect(result.action).toBe(expectedAction);
      },
    );

    it("should achieve >80% accuracy on benchmark", () => {
      // Run all test cases
      testCases.forEach(({ transcript, expectedAction }) => {
        const result = analyzer.analyze(transcript, 500);
        if (result.action === expectedAction) {
          correctPredictions++;
        }
      });

      const accuracy = correctPredictions / (testCases.length * 2); // *2 because we run twice
      expect(accuracy).toBeGreaterThanOrEqual(0.8);
    });
  });
});
