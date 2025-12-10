/**
 * Turn Detection Types and Constants
 *
 * Defines the signals and patterns used for semantic turn detection
 * in voice conversations. These are used by SemanticTurnAnalyzer to
 * determine when a user has finished speaking.
 *
 * Reference: docs/planning/VOICE_MODE_BARGE_IN_IMPROVEMENT_PLAN_V3.md
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Turn completion signals configuration.
 * Used to detect when a user has finished their turn in a conversation.
 */
export interface TurnCompletionSignals {
  /**
   * Strong completion indicators (high confidence turn is done).
   * When detected, the AI should respond quickly.
   */
  strongCompletion: {
    /** Pattern for question endings (e.g., ?) */
    questionEndings: RegExp;
    /** Single-word commands that typically end a turn */
    commandVerbs: string[];
    /** Acknowledgment phrases that complete a turn */
    acknowledgments: string[];
    /** Farewell phrases */
    farewells: string[];
  };

  /**
   * Weak completion indicators (may be done, wait briefly).
   * The AI should wait a bit longer before responding.
   */
  weakCompletion: {
    /** Pattern for statement endings (e.g., . !) */
    statementEndings: RegExp;
    /** Pattern for trailing punctuation (e.g., , ; :) */
    trailingPunctuation: RegExp;
    /** Pattern for complete clause (Subject + Verb + Object) */
    completeClause: RegExp;
  };

  /**
   * Continuation indicators (user NOT done, keep listening).
   * When detected, the AI should wait for more speech.
   */
  continuationSignals: {
    /** Hesitation markers (um, uh, etc.) */
    hesitationMarkers: string[];
    /** Trailing conjunctions (and, but, etc.) */
    conjunctions: string[];
    /** Incomplete sentence patterns */
    incompletePatterns: RegExp[];
    /** Rising intonation detected (from prosody) */
    risingIntonation: boolean;
    /** Mid-sentence pause detected */
    midSentencePause: boolean;
  };
}

/**
 * Prosody hints from audio analysis.
 */
export interface ProsodyHints {
  /** Whether speech ends with rising intonation (question-like) */
  risingIntonation: boolean;
  /** Whether energy/volume is declining (trailing off) */
  energyDecline: boolean;
  /** Whether speech rate is slowing down */
  slowingRate?: boolean;
  /** Final pitch direction: up, down, or level */
  finalPitchDirection?: "up" | "down" | "level";
}

/**
 * Context for turn analysis.
 */
export interface TurnAnalysisContext {
  /** Whether the transcript is partial (still being spoken) */
  isPartial: boolean;
  /** Prosody hints from audio analysis */
  prosodyHints?: ProsodyHints;
  /** Previous utterances in the conversation */
  previousContext?: string[];
  /** Current conversation turn number */
  turnNumber?: number;
  /** Language code (for internationalization) */
  language?: string;
}

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default turn completion signals.
 * Tuned for English conversation patterns.
 */
export const DEFAULT_TURN_SIGNALS: TurnCompletionSignals = {
  strongCompletion: {
    questionEndings: /[?]\s*$/,
    commandVerbs: [
      "stop",
      "go",
      "start",
      "show",
      "tell",
      "help",
      "find",
      "search",
      "open",
      "close",
      "play",
      "pause",
      "next",
      "previous",
      "skip",
      "repeat",
      "cancel",
      "done",
      "finish",
      "end",
    ],
    acknowledgments: [
      "okay",
      "ok",
      "thanks",
      "thank you",
      "got it",
      "yes",
      "no",
      "sure",
      "right",
      "alright",
      "all right",
      "yep",
      "yeah",
      "nope",
      "nah",
      "fine",
      "great",
      "perfect",
      "cool",
      "understood",
    ],
    farewells: [
      "bye",
      "goodbye",
      "see you",
      "later",
      "good night",
      "goodnight",
      "take care",
      "see ya",
      "gotta go",
      "talk later",
    ],
  },

  weakCompletion: {
    statementEndings: /[.!]\s*$/,
    trailingPunctuation: /[,;:]\s*$/,
    completeClause:
      /^.+\s+(is|are|was|were|has|have|had|do|does|did|will|would|can|could|should|may|might)\s+.+[.!?]?\s*$/i,
  },

  continuationSignals: {
    hesitationMarkers: [
      "um",
      "uh",
      "er",
      "hmm",
      "like",
      "you know",
      "i mean",
      "well",
      "so",
      "anyway",
      "actually",
      "basically",
      "literally",
    ],
    conjunctions: [
      "and",
      "but",
      "or",
      "so",
      "because",
      "although",
      "however",
      "also",
      "then",
      "therefore",
      "moreover",
      "furthermore",
      "plus",
      "yet",
      "while",
      "whereas",
      "unless",
      "until",
      "since",
      "when",
      "where",
      "if",
      "though",
    ],
    incompletePatterns: [
      // "I want to...", "Can you...", etc.
      /^(i want to|i need to|i'd like to|i would like to|can you|could you|would you|will you|what if|how about|let me|let's|i'm going to|i'm gonna)\s*$/i,
      // Determiners without noun phrase completion
      /^(the|a|an|my|your|his|her|their|our|this|that|these|those|some|any)\s+\w+\s*$/i,
      // Trailing conjunctions
      /^.+\s+(and|but|or|so|because|while|if|when|where|although)\s*$/i,
      // Questions that are clearly incomplete
      /^(what|who|where|when|why|how|which)\s+$/i,
      // Comparative/superlative without completion
      /^.+\s+(more|less|better|worse|bigger|smaller|faster|slower)\s+(than\s*)?$/i,
    ],
    risingIntonation: false,
    midSentencePause: false,
  },
};

// =============================================================================
// Language-Specific Signals
// =============================================================================

/**
 * Hesitation markers for different languages.
 * Used for multilingual support.
 */
export const HESITATION_MARKERS_BY_LANGUAGE: Record<string, string[]> = {
  en: ["um", "uh", "er", "hmm", "like", "you know", "i mean", "well"],
  es: ["eh", "este", "pues", "bueno", "o sea", "digamos"],
  fr: ["euh", "heu", "ben", "donc", "enfin", "bon"],
  de: ["äh", "ähm", "also", "na ja", "tja", "halt"],
  it: ["ehm", "cioè", "allora", "praticamente", "tipo"],
  pt: ["é", "né", "tipo", "assim", "então", "bom"],
  ja: ["えーと", "あの", "その", "まあ", "なんか"],
  zh: ["呃", "嗯", "那个", "这个", "就是"],
  ko: ["음", "어", "그", "저", "그러니까"],
  ar: ["يعني", "إيه", "آه", "طيب"],
  ru: ["э", "ну", "вот", "так", "значит"],
  hi: ["उम", "अच्छा", "तो", "मतलब"],
};

/**
 * Get hesitation markers for a specific language.
 * Falls back to English if language not found.
 */
export function getHesitationMarkers(language: string = "en"): string[] {
  const langCode = language.toLowerCase().slice(0, 2);
  return HESITATION_MARKERS_BY_LANGUAGE[langCode] || HESITATION_MARKERS_BY_LANGUAGE["en"];
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a word is a hesitation marker.
 */
export function isHesitationMarker(word: string, language: string = "en"): boolean {
  const markers = getHesitationMarkers(language);
  const normalizedWord = word.toLowerCase().trim();
  return markers.some(
    (marker) =>
      normalizedWord === marker ||
      normalizedWord.startsWith(marker + " ") ||
      normalizedWord.endsWith(" " + marker)
  );
}

/**
 * Check if text ends with a continuation signal.
 */
export function endsWithContinuationSignal(
  text: string,
  signals: TurnCompletionSignals = DEFAULT_TURN_SIGNALS
): boolean {
  const normalizedText = text.toLowerCase().trim();

  // Check hesitation markers
  for (const marker of signals.continuationSignals.hesitationMarkers) {
    if (normalizedText.endsWith(marker) || normalizedText.endsWith(marker + " ")) {
      return true;
    }
  }

  // Check trailing conjunctions
  for (const conj of signals.continuationSignals.conjunctions) {
    if (
      normalizedText.endsWith(conj) ||
      normalizedText.endsWith(conj + " ") ||
      normalizedText.endsWith(conj + ",")
    ) {
      return true;
    }
  }

  // Check incomplete patterns
  for (const pattern of signals.continuationSignals.incompletePatterns) {
    if (pattern.test(normalizedText)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if text ends with a strong completion signal.
 */
export function endsWithStrongCompletion(
  text: string,
  signals: TurnCompletionSignals = DEFAULT_TURN_SIGNALS
): boolean {
  const normalizedText = text.toLowerCase().trim();

  // Check question endings
  if (signals.strongCompletion.questionEndings.test(text)) {
    return true;
  }

  // Check command verbs (single-word commands)
  const words = normalizedText.split(/\s+/);
  const lastWord = words[words.length - 1]?.replace(/[.!?,;:]/g, "");
  if (signals.strongCompletion.commandVerbs.includes(lastWord) && words.length <= 5) {
    return true;
  }

  // Check acknowledgments
  for (const ack of signals.strongCompletion.acknowledgments) {
    if (normalizedText === ack || normalizedText.endsWith(ack) || normalizedText.endsWith(ack + ".")) {
      return true;
    }
  }

  // Check farewells
  for (const farewell of signals.strongCompletion.farewells) {
    if (normalizedText === farewell || normalizedText.endsWith(farewell)) {
      return true;
    }
  }

  return false;
}
