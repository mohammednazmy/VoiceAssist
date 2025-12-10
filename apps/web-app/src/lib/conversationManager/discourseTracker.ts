/**
 * Discourse Tracker
 *
 * Tracks conversation flow, topic changes, and discourse patterns
 * to enable context-aware AI behavior.
 *
 * Phase 10: Advanced Conversation Management
 */

import type {
  DiscourseState,
  DiscourseUnit,
  ConversationPhase,
  SpeakerRole,
} from "./types";
import { INITIAL_DISCOURSE_STATE } from "./types";

// ============================================================================
// Topic Detection Patterns
// ============================================================================

/**
 * Keywords for topic detection
 */
const TOPIC_KEYWORDS: Record<string, string[]> = {
  greeting: ["hello", "hi", "hey", "good morning", "good evening", "salaam"],
  help: ["help", "assist", "support", "how do i", "how can i", "i need"],
  question: ["what", "who", "where", "when", "why", "how", "which", "can you"],
  command: ["do", "make", "create", "find", "search", "show", "tell", "give"],
  farewell: [
    "bye",
    "goodbye",
    "see you",
    "thank you",
    "thanks",
    "done",
    "that's all",
  ],
  clarification: [
    "what do you mean",
    "i don't understand",
    "clarify",
    "explain",
  ],
  confirmation: ["yes", "correct", "right", "exactly", "that's it", "perfect"],
  negation: ["no", "not", "wrong", "incorrect", "that's not"],
};

/**
 * Phase transition patterns
 */
const PHASE_PATTERNS: Array<{
  from: ConversationPhase[];
  trigger: RegExp;
  to: ConversationPhase;
}> = [
  // Opening -> Information Gathering
  {
    from: ["opening"],
    trigger: /^(i need|i want|can you|help me|show me|tell me)/i,
    to: "information_gathering",
  },

  // Any -> Clarification
  {
    from: ["explanation", "discussion", "information_gathering"],
    trigger: /(what do you mean|i don't understand|can you explain|clarify)/i,
    to: "clarification",
  },

  // Clarification -> Previous (explanation)
  {
    from: ["clarification"],
    trigger: /(ok|i see|got it|understand|makes sense)/i,
    to: "explanation",
  },

  // Any -> Summary
  {
    from: ["explanation", "discussion"],
    trigger: /(so to summarize|in summary|to recap|so basically)/i,
    to: "summary",
  },

  // Any -> Closing
  {
    from: ["summary", "discussion", "explanation"],
    trigger: /(thank you|thanks|bye|goodbye|that's all|i'm done)/i,
    to: "closing",
  },
];

// ============================================================================
// Discourse Tracker
// ============================================================================

/**
 * Tracks conversation flow and discourse patterns
 */
export class DiscourseTracker {
  private state: DiscourseState;
  private readonly maxUnits: number;

  /** Topic history for coherence calculation */
  private topicHistory: string[] = [];

  constructor(maxUnits: number = 10) {
    this.maxUnits = maxUnits;
    this.state = { ...INITIAL_DISCOURSE_STATE };
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Update discourse state with new utterance
   */
  update(text: string, speaker: SpeakerRole): DiscourseState {
    const normalizedText = text.toLowerCase().trim();

    // Create discourse unit
    const unit = this.createDiscourseUnit(normalizedText, speaker);
    this.addUnit(unit);

    // Detect topic
    const newTopic = this.detectTopic(normalizedText);
    if (newTopic && newTopic !== this.state.topic) {
      this.handleTopicChange(newTopic);
    }

    // Detect phase transition
    const newPhase = this.detectPhaseTransition(normalizedText);
    if (newPhase && newPhase !== this.state.phase) {
      this.state.phase = newPhase;
    }

    // Update coherence
    this.updateCoherence(normalizedText);

    // Detect intent patterns
    if (speaker === "user") {
      this.detectIntentPatterns(normalizedText);
    }

    return this.getState();
  }

  /**
   * Get current state
   */
  getState(): DiscourseState {
    return {
      ...this.state,
      recentUnits: [...this.state.recentUnits],
      intentPatterns: [...this.state.intentPatterns],
    };
  }

  /**
   * Reset tracker
   */
  reset(): void {
    this.state = { ...INITIAL_DISCOURSE_STATE };
    this.topicHistory = [];
  }

  /**
   * Get current topic
   */
  getTopic(): string | null {
    return this.state.topic;
  }

  /**
   * Get current phase
   */
  getPhase(): ConversationPhase {
    return this.state.phase;
  }

  /**
   * Check if topic has changed recently
   */
  hasRecentTopicChange(): boolean {
    return this.state.topicShiftCount > 0 && this.topicHistory.length < 3;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Create a discourse unit from text
   */
  private createDiscourseUnit(
    text: string,
    speaker: SpeakerRole,
  ): DiscourseUnit {
    return {
      id: this.generateId(),
      turn: this.state.recentUnits.length + 1,
      speaker,
      contentType: this.classifyContentType(text),
      topicKeywords: this.extractTopicKeywords(text),
      timestamp: Date.now(),
    };
  }

  /**
   * Add unit to history
   */
  private addUnit(unit: DiscourseUnit): void {
    this.state.recentUnits.push(unit);

    if (this.state.recentUnits.length > this.maxUnits) {
      this.state.recentUnits.shift();
    }
  }

  /**
   * Classify the content type of an utterance
   */
  private classifyContentType(text: string): DiscourseUnit["contentType"] {
    // Check for question
    if (
      text.match(/\?$/) ||
      text.match(/^(what|who|where|when|why|how|which|can|is|are|do|does)/i)
    ) {
      return "question";
    }

    // Check for command
    if (text.match(/^(do|make|create|find|search|show|tell|give|please)/i)) {
      return "command";
    }

    // Check for acknowledgment
    if (
      text.match(
        /^(ok|okay|yes|yeah|right|correct|got it|i see|understood|thanks|thank you)/i,
      )
    ) {
      return "acknowledgment";
    }

    return "statement";
  }

  /**
   * Extract topic keywords from text
   */
  private extractTopicKeywords(text: string): string[] {
    const keywords: string[] = [];
    const words = text.split(/\s+/);

    // Extract nouns and important words (simplified)
    for (const word of words) {
      // Skip common words
      if (this.isStopWord(word)) continue;

      // Keep words that might be topics
      if (word.length > 3) {
        keywords.push(word);
      }
    }

    return keywords.slice(0, 5);
  }

  /**
   * Check if word is a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      "the",
      "a",
      "an",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "must",
      "shall",
      "can",
      "need",
      "dare",
      "ought",
      "used",
      "to",
      "of",
      "in",
      "for",
      "on",
      "with",
      "at",
      "by",
      "from",
      "as",
      "into",
      "through",
      "during",
      "before",
      "after",
      "above",
      "below",
      "between",
      "under",
      "again",
      "further",
      "then",
      "once",
      "here",
      "there",
      "when",
      "where",
      "why",
      "how",
      "all",
      "each",
      "few",
      "more",
      "most",
      "other",
      "some",
      "such",
      "no",
      "nor",
      "not",
      "only",
      "own",
      "same",
      "so",
      "than",
      "too",
      "very",
      "just",
      "and",
      "but",
      "if",
      "or",
      "because",
      "until",
      "while",
      "i",
      "me",
      "my",
      "myself",
      "we",
      "our",
      "ours",
      "ourselves",
      "you",
      "your",
      "yours",
      "yourself",
      "yourselves",
      "he",
      "him",
      "his",
      "himself",
      "she",
      "her",
      "hers",
      "herself",
      "it",
      "its",
      "itself",
      "they",
      "them",
      "their",
      "theirs",
      "themselves",
      "what",
      "which",
      "who",
      "whom",
      "this",
      "that",
      "these",
      "those",
      "am",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
    ]);

    return stopWords.has(word.toLowerCase());
  }

  /**
   * Detect topic from text
   */
  private detectTopic(text: string): string | null {
    for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          return topic;
        }
      }
    }

    // Extract from recent keywords
    const recentKeywords = this.state.recentUnits
      .flatMap((u) => u.topicKeywords)
      .slice(-10);

    if (recentKeywords.length > 0) {
      // Find most common keyword
      const counts = new Map<string, number>();
      for (const kw of recentKeywords) {
        counts.set(kw, (counts.get(kw) || 0) + 1);
      }

      let maxCount = 0;
      let dominantTopic: string | null = null;
      for (const [kw, count] of counts) {
        if (count > maxCount) {
          maxCount = count;
          dominantTopic = kw;
        }
      }

      if (maxCount >= 2) {
        return dominantTopic;
      }
    }

    return null;
  }

  /**
   * Handle topic change
   */
  private handleTopicChange(newTopic: string): void {
    this.topicHistory.push(this.state.topic || "none");
    this.state.topic = newTopic;
    this.state.topicShiftCount++;

    // Keep limited history
    if (this.topicHistory.length > 10) {
      this.topicHistory.shift();
    }
  }

  /**
   * Detect phase transition
   */
  private detectPhaseTransition(text: string): ConversationPhase | null {
    for (const { from, trigger, to } of PHASE_PATTERNS) {
      if (from.includes(this.state.phase) && trigger.test(text)) {
        return to;
      }
    }

    return null;
  }

  /**
   * Update coherence score
   */
  private updateCoherence(text: string): void {
    if (this.state.recentUnits.length < 2) {
      this.state.coherence = 1.0;
      return;
    }

    // Calculate coherence based on topic continuity
    const recentKeywords = this.state.recentUnits
      .slice(-3)
      .flatMap((u) => u.topicKeywords);

    const currentKeywords = this.extractTopicKeywords(text);

    // Check for keyword overlap
    const overlap = currentKeywords.filter((kw) =>
      recentKeywords.some((rk) => rk.includes(kw) || kw.includes(rk)),
    ).length;

    const coherenceScore =
      currentKeywords.length > 0 ? overlap / currentKeywords.length : 1.0;

    // Smooth the coherence score
    this.state.coherence = this.state.coherence * 0.7 + coherenceScore * 0.3;
  }

  /**
   * Detect intent patterns from user utterances
   */
  private detectIntentPatterns(text: string): void {
    const patterns: string[] = [];

    // Check for seeking information
    if (text.match(/(tell me|what is|explain|how does|why|describe)/i)) {
      patterns.push("seeking_information");
    }

    // Check for task request
    if (text.match(/(do|make|create|find|search|show|help me)/i)) {
      patterns.push("task_request");
    }

    // Check for confirmation seeking
    if (text.match(/(is that right|correct|am i right)/i)) {
      patterns.push("seeking_confirmation");
    }

    // Check for expressing preference
    if (text.match(/(i prefer|i like|i want|i need)/i)) {
      patterns.push("expressing_preference");
    }

    // Check for disagreement
    if (text.match(/(no|not|wrong|incorrect|disagree)/i)) {
      patterns.push("disagreement");
    }

    // Update intent patterns (keep last 5)
    this.state.intentPatterns = [
      ...this.state.intentPatterns.slice(-4),
      ...patterns,
    ];
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `du_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new discourse tracker
 */
export function createDiscourseTracker(maxUnits?: number): DiscourseTracker {
  return new DiscourseTracker(maxUnits);
}
