/**
 * Intent Classifier
 *
 * Classifies user intent from transcript and audio features.
 * Uses pattern matching and heuristics for quick client-side classification.
 * Can optionally defer to server-side ML for complex cases.
 *
 * Phase 3: Context-Aware Interruption Intelligence
 */

import type { SupportedLanguage } from "../../hooks/useIntelligentBargeIn/types";
import type {
  BargeInClassificationType,
  UserIntent,
  InterruptionPriority,
  ClassificationResult,
  ClassificationAction,
  ClassificationMetadata,
  AudioFeatures,
  BargeInClassifierConfig,
  DEFAULT_CLASSIFIER_CONFIG,
} from "./types";
import {
  HARD_BARGE_PATTERNS,
  COMMAND_PATTERNS,
  getRandomAcknowledgment,
} from "./phraseLibrary";
import { BackchannelDetector } from "./backchannelDetector";

// ============================================================================
// Intent Classifier Class
// ============================================================================

export class IntentClassifier {
  private config: BargeInClassifierConfig;
  private backchannelDetector: BackchannelDetector;

  constructor(config: Partial<BargeInClassifierConfig> = {}) {
    this.config = { ...DEFAULT_CLASSIFIER_CONFIG, ...config };
    this.backchannelDetector = new BackchannelDetector({
      language: this.config.language,
      escalationWindowMs: this.config.backchannelEscalationWindow,
      escalationThreshold: this.config.backchannelEscalationThreshold,
      maxBackchannelDuration: this.config.maxBackchannelDuration,
    });
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  setLanguage(language: SupportedLanguage): void {
    this.config.language = language;
    this.backchannelDetector.setLanguage(language);
  }

  updateConfig(config: Partial<BargeInClassifierConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.language) {
      this.backchannelDetector.setLanguage(config.language);
    }
  }

  // ==========================================================================
  // Main Classification
  // ==========================================================================

  /**
   * Classify a barge-in event
   */
  classify(
    transcript: string,
    duration: number,
    vadProbability: number,
    duringAISpeech: boolean,
    audioFeatures?: AudioFeatures,
  ): ClassificationResult {
    const timeSinceLastUtterance = 0; // Would be tracked externally

    // Step 1: Check for commands (highest priority)
    const commandResult = this.detectCommand(transcript);
    if (commandResult) {
      return this.buildResult(
        "command",
        commandResult.intent,
        commandResult.priority,
        1.0,
        transcript,
        duration,
        vadProbability,
        duringAISpeech,
        timeSinceLastUtterance,
        audioFeatures,
      );
    }

    // Step 2: Check for backchannels (if during AI speech)
    if (duringAISpeech) {
      const backchannelResult = this.backchannelDetector.detect(
        transcript,
        duration,
        vadProbability,
      );

      if (backchannelResult.isBackchannel) {
        return this.buildResult(
          "backchannel",
          "acknowledge",
          "low",
          backchannelResult.score,
          transcript,
          duration,
          vadProbability,
          duringAISpeech,
          timeSinceLastUtterance,
          audioFeatures,
        );
      }

      // Check if escalation triggered
      if (backchannelResult.shouldEscalate) {
        return this.buildResult(
          "hard_barge",
          "stop",
          "high",
          0.9,
          transcript,
          duration,
          vadProbability,
          duringAISpeech,
          timeSinceLastUtterance,
          audioFeatures,
        );
      }

      // Step 3: Check for soft barge
      const softBargeResult =
        this.backchannelDetector.detectSoftBarge(transcript);
      if (softBargeResult.isSoftBarge) {
        return this.buildResult(
          "soft_barge",
          "pause",
          "medium",
          0.8,
          transcript,
          duration,
          vadProbability,
          duringAISpeech,
          timeSinceLastUtterance,
          audioFeatures,
        );
      }
    }

    // Step 4: Check for hard barge patterns
    const hardBargeResult = this.detectHardBarge(transcript);
    if (hardBargeResult) {
      return this.buildResult(
        "hard_barge",
        hardBargeResult.intent,
        "high",
        0.9,
        transcript,
        duration,
        vadProbability,
        duringAISpeech,
        timeSinceLastUtterance,
        audioFeatures,
      );
    }

    // Step 5: Check for correction patterns
    if (this.detectCorrection(transcript)) {
      return this.buildResult(
        "correction",
        "correct",
        "high",
        0.85,
        transcript,
        duration,
        vadProbability,
        duringAISpeech,
        timeSinceLastUtterance,
        audioFeatures,
      );
    }

    // Step 6: Check for clarification requests
    if (this.detectClarification(transcript)) {
      return this.buildResult(
        "clarification",
        "clarify",
        "medium",
        0.8,
        transcript,
        duration,
        vadProbability,
        duringAISpeech,
        timeSinceLastUtterance,
        audioFeatures,
      );
    }

    // Step 7: Use audio features for prosodic classification
    if (audioFeatures && this.config.enableProsodicAnalysis) {
      const prosodicResult = this.classifyFromProsody(
        audioFeatures,
        duration,
        duringAISpeech,
      );
      if (prosodicResult) {
        return this.buildResult(
          prosodicResult.classification,
          prosodicResult.intent,
          prosodicResult.priority,
          prosodicResult.confidence,
          transcript,
          duration,
          vadProbability,
          duringAISpeech,
          timeSinceLastUtterance,
          audioFeatures,
        );
      }
    }

    // Step 8: Default classification based on duration and context
    return this.defaultClassification(
      transcript,
      duration,
      vadProbability,
      duringAISpeech,
      timeSinceLastUtterance,
      audioFeatures,
    );
  }

  // ==========================================================================
  // Detection Methods
  // ==========================================================================

  private detectCommand(
    transcript: string,
  ): { intent: UserIntent; priority: InterruptionPriority } | null {
    const normalized = transcript.toLowerCase().trim();
    const commands =
      COMMAND_PATTERNS[this.config.language] || COMMAND_PATTERNS.en;

    for (const pattern of commands) {
      for (const phrase of pattern.phrases) {
        if (
          normalized === phrase.toLowerCase() ||
          normalized.startsWith(phrase.toLowerCase() + " ")
        ) {
          return {
            intent: "command",
            priority: pattern.priority,
          };
        }
      }
    }

    return null;
  }

  private detectHardBarge(transcript: string): { intent: UserIntent } | null {
    const normalized = transcript.toLowerCase().trim();
    const hardBarges =
      HARD_BARGE_PATTERNS[this.config.language] || HARD_BARGE_PATTERNS.en;

    for (const pattern of hardBarges) {
      for (const phrase of pattern.phrases) {
        if (
          normalized === phrase.toLowerCase() ||
          normalized.startsWith(phrase.toLowerCase() + " ")
        ) {
          return { intent: pattern.intent };
        }
      }
    }

    return null;
  }

  private detectCorrection(transcript: string): boolean {
    const correctionPhrases: Record<SupportedLanguage, string[]> = {
      en: [
        "no",
        "that's wrong",
        "incorrect",
        "not right",
        "actually",
        "you're wrong",
      ],
      ar: ["لا", "خطأ", "مش صحيح", "غلط", "في الحقيقة"],
      es: ["no", "eso está mal", "incorrecto", "en realidad"],
      fr: ["non", "c'est faux", "incorrect", "en fait"],
      de: ["nein", "das ist falsch", "nicht richtig", "eigentlich"],
      zh: ["不", "不对", "错了", "其实"],
      ja: ["いいえ", "違う", "間違い", "実は"],
      ko: ["아니", "틀려", "아니야", "사실은"],
      pt: ["não", "está errado", "incorreto", "na verdade"],
      ru: ["нет", "это неправильно", "неверно", "на самом деле"],
      hi: ["नहीं", "गलत", "सही नहीं", "असल में"],
      tr: ["hayır", "yanlış", "doğru değil", "aslında"],
    };

    const normalized = transcript.toLowerCase().trim();
    const phrases =
      correctionPhrases[this.config.language] || correctionPhrases.en;

    return phrases.some(
      (phrase) => normalized === phrase || normalized.startsWith(phrase + " "),
    );
  }

  private detectClarification(transcript: string): boolean {
    const clarificationPhrases: Record<SupportedLanguage, string[]> = {
      en: [
        "what do you mean",
        "can you explain",
        "I don't understand",
        "what",
        "huh",
        "sorry",
        "pardon",
      ],
      ar: ["ماذا تعني", "ممكن تشرح", "لا أفهم", "ماذا", "عفوا"],
      es: [
        "qué quieres decir",
        "puedes explicar",
        "no entiendo",
        "qué",
        "perdón",
      ],
      fr: [
        "qu'est-ce que tu veux dire",
        "peux-tu expliquer",
        "je ne comprends pas",
        "quoi",
        "pardon",
      ],
      de: [
        "was meinst du",
        "kannst du erklären",
        "ich verstehe nicht",
        "was",
        "entschuldigung",
      ],
      zh: ["什么意思", "能解释一下", "我不明白", "什么", "对不起"],
      ja: ["どういう意味", "説明して", "わかりません", "何", "すみません"],
      ko: ["무슨 말이야", "설명해줘", "이해가 안 돼", "뭐", "미안"],
      pt: [
        "o que você quer dizer",
        "pode explicar",
        "não entendo",
        "o quê",
        "desculpe",
      ],
      ru: [
        "что ты имеешь в виду",
        "можешь объяснить",
        "не понимаю",
        "что",
        "извините",
      ],
      hi: ["इसका मतलब क्या है", "समझाओ", "समझ नहीं आया", "क्या", "माफ़ करो"],
      tr: ["ne demek istiyorsun", "açıklar mısın", "anlamadım", "ne", "pardon"],
    };

    const normalized = transcript.toLowerCase().trim();
    const phrases =
      clarificationPhrases[this.config.language] || clarificationPhrases.en;

    return phrases.some(
      (phrase) => normalized === phrase || normalized.startsWith(phrase + " "),
    );
  }

  private classifyFromProsody(
    features: AudioFeatures,
    duration: number,
    duringAISpeech: boolean,
  ): {
    classification: BargeInClassificationType;
    intent: UserIntent;
    priority: InterruptionPriority;
    confidence: number;
  } | null {
    // Rising intonation often indicates a question
    if (features.risingIntonation && duration > 500) {
      return {
        classification: "clarification",
        intent: "ask_question",
        priority: "medium",
        confidence: 0.7,
      };
    }

    // High volume + fast rate suggests urgency
    if (features.avgVolume > -20 && features.speakingRate > 4) {
      return {
        classification: duringAISpeech ? "hard_barge" : "command",
        intent: "stop",
        priority: "high",
        confidence: 0.75,
      };
    }

    // Very short with low variation = likely backchannel
    if (duration < 400 && features.pitchVariance < 50 && duringAISpeech) {
      return {
        classification: "backchannel",
        intent: "acknowledge",
        priority: "low",
        confidence: 0.65,
      };
    }

    return null;
  }

  private defaultClassification(
    transcript: string,
    duration: number,
    vadProbability: number,
    duringAISpeech: boolean,
    timeSinceLastUtterance: number,
    audioFeatures?: AudioFeatures,
  ): ClassificationResult {
    // Short utterance during AI speech = likely wants to interject
    if (duringAISpeech && duration > this.config.minHardBargeDuration) {
      return this.buildResult(
        "soft_barge",
        "pause",
        "medium",
        0.6,
        transcript,
        duration,
        vadProbability,
        duringAISpeech,
        timeSinceLastUtterance,
        audioFeatures,
      );
    }

    // Default: unknown classification
    return this.buildResult(
      "unknown",
      "uncertain",
      "medium",
      0.5,
      transcript,
      duration,
      vadProbability,
      duringAISpeech,
      timeSinceLastUtterance,
      audioFeatures,
    );
  }

  // ==========================================================================
  // Result Building
  // ==========================================================================

  private buildResult(
    classification: BargeInClassificationType,
    intent: UserIntent,
    priority: InterruptionPriority,
    confidence: number,
    transcript: string,
    duration: number,
    vadProbability: number,
    duringAISpeech: boolean,
    timeSinceLastUtterance: number,
    audioFeatures?: AudioFeatures,
  ): ClassificationResult {
    const action = this.determineAction(classification, intent, priority);
    const metadata = this.buildMetadata(
      vadProbability,
      duringAISpeech,
      timeSinceLastUtterance,
      audioFeatures,
    );

    return {
      classification,
      intent,
      priority,
      confidence,
      language: this.config.language,
      transcript,
      duration,
      action,
      metadata,
    };
  }

  private determineAction(
    classification: BargeInClassificationType,
    intent: UserIntent,
    priority: InterruptionPriority,
  ): ClassificationAction {
    switch (classification) {
      case "backchannel":
        return {
          type: "acknowledge",
          shouldAcknowledge: false,
          shouldSaveContext: false,
        };

      case "soft_barge":
        return {
          type: "pause",
          shouldAcknowledge: true,
          acknowledgmentPhrase: getRandomAcknowledgment(this.config.language),
          pauseDuration: 1500,
          shouldSaveContext: true,
        };

      case "hard_barge":
      case "command":
        return {
          type: intent === "stop" ? "stop" : "yield",
          shouldAcknowledge: true,
          acknowledgmentPhrase: getRandomAcknowledgment(this.config.language),
          shouldSaveContext: true,
        };

      case "correction":
        return {
          type: "respond",
          shouldAcknowledge: true,
          shouldSaveContext: true,
        };

      case "clarification":
        return {
          type: "respond",
          shouldAcknowledge: true,
          shouldSaveContext: false,
        };

      case "topic_change":
        return {
          type: "yield",
          shouldAcknowledge: true,
          shouldSaveContext: false,
        };

      default:
        return {
          type: priority === "low" ? "continue" : "wait",
          shouldAcknowledge: false,
          shouldSaveContext: false,
        };
    }
  }

  private buildMetadata(
    vadProbability: number,
    duringAISpeech: boolean,
    timeSinceLastUtterance: number,
    audioFeatures?: AudioFeatures,
  ): ClassificationMetadata {
    return {
      vadProbability,
      duringAISpeech,
      timeSinceLastUtterance,
      recentBackchannelCount: this.backchannelDetector.getTotalRecentCount(),
      prosodicUrgency:
        audioFeatures !== undefined &&
        audioFeatures.avgVolume > -20 &&
        audioFeatures.speakingRate > 4,
      audioFeatures,
    };
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  reset(): void {
    this.backchannelDetector.reset();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createIntentClassifier(
  config?: Partial<BargeInClassifierConfig>,
): IntentClassifier {
  return new IntentClassifier(config);
}
