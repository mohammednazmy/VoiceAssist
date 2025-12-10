/**
 * Context Resumer
 *
 * Handles context-aware resumption after interruptions.
 * Captures interrupted content, generates summaries,
 * and provides natural resumption phrases.
 *
 * Phase 5: Natural Turn-Taking
 */

import type {
  ResumptionContext,
  ResumptionConfig,
  SupportedLanguage,
} from "./types";
import { DEFAULT_RESUMPTION_CONFIG } from "./types";

// ============================================================================
// Resumption Phrases by Language
// ============================================================================

/**
 * Language-specific resumption phrases
 */
const RESUMPTION_PHRASES: Record<
  SupportedLanguage,
  {
    brief: string[];
    detailed: string[];
    askUser: string[];
  }
> = {
  en: {
    brief: [
      "As I was saying,",
      "Continuing from where I was,",
      "To continue,",
      "Going back to what I was saying,",
    ],
    detailed: [
      "Before we were interrupted, I was explaining that",
      "To summarize what I said: {summary}. Now,",
      "Let me recap: {summary}. Continuing,",
      "Where were we? Ah yes, {summary}. Now,",
    ],
    askUser: [
      "Would you like me to continue from where I left off, or start fresh?",
      "Should I continue, or would you prefer to ask something else?",
      "Do you want me to finish what I was saying, or move on?",
    ],
  },
  ar: {
    brief: ["كما كنت أقول،", "استمرارًا لما كنت أقوله،", "للاستمرار،"],
    detailed: [
      "قبل أن نتوقف، كنت أشرح أن",
      "للتلخيص: {summary}. والآن،",
      "دعني ألخص: {summary}. نكمل،",
    ],
    askUser: [
      "هل تريد أن أكمل من حيث توقفت، أم تفضل البدء من جديد؟",
      "هل أستمر، أم تفضل أن تسأل شيئًا آخر؟",
    ],
  },
  es: {
    brief: [
      "Como estaba diciendo,",
      "Continuando con lo que decía,",
      "Para continuar,",
    ],
    detailed: [
      "Antes de que nos interrumpieran, estaba explicando que",
      "Para resumir lo que dije: {summary}. Ahora,",
      "Permíteme recapitular: {summary}. Continuando,",
    ],
    askUser: [
      "¿Te gustaría que continuara desde donde me quedé, o prefieres empezar de nuevo?",
      "¿Debo continuar, o prefieres preguntar otra cosa?",
    ],
  },
  fr: {
    brief: [
      "Comme je disais,",
      "Pour reprendre où j'en étais,",
      "Pour continuer,",
    ],
    detailed: [
      "Avant l'interruption, j'expliquais que",
      "Pour résumer ce que j'ai dit: {summary}. Maintenant,",
      "Laissez-moi récapituler: {summary}. En continuant,",
    ],
    askUser: [
      "Voulez-vous que je reprenne là où je m'étais arrêté?",
      "Dois-je continuer, ou préférez-vous poser une autre question?",
    ],
  },
  de: {
    brief: [
      "Wie ich sagte,",
      "Um fortzufahren,",
      "Weiter mit dem, was ich sagte,",
    ],
    detailed: [
      "Bevor wir unterbrochen wurden, erklärte ich, dass",
      "Zusammengefasst: {summary}. Nun,",
      "Lassen Sie mich rekapitulieren: {summary}. Weiter,",
    ],
    askUser: [
      "Möchten Sie, dass ich fortfahre, oder lieber etwas Neues?",
      "Soll ich weitermachen, oder haben Sie eine andere Frage?",
    ],
  },
  zh: {
    brief: ["正如我所说的，", "继续我刚才说的，", "接着说，"],
    detailed: [
      "在我们被打断之前，我在解释",
      "总结一下我说的：{summary}。现在，",
      "让我回顾一下：{summary}。继续，",
    ],
    askUser: [
      "您希望我从中断的地方继续，还是重新开始？",
      "我应该继续，还是您想问别的问题？",
    ],
  },
  ja: {
    brief: ["先ほど言ったように、", "続けますと、", "話を戻しますと、"],
    detailed: [
      "中断する前に説明していたのは",
      "要約すると：{summary}。さて、",
      "おさらいしますと：{summary}。続けて、",
    ],
    askUser: [
      "続きをお話ししましょうか、それとも新しい話題に移りましょうか？",
      "続けてもよろしいですか、それとも別のご質問がありますか？",
    ],
  },
  ko: {
    brief: ["말씀드린 대로,", "이어서 말씀드리면,", "계속하자면,"],
    detailed: [
      "중단되기 전에 설명하던 것은",
      "요약하면: {summary}. 이제,",
      "정리하면: {summary}. 계속해서,",
    ],
    askUser: [
      "제가 멈춘 곳에서 계속할까요, 아니면 새로 시작할까요?",
      "계속 진행해도 될까요, 아니면 다른 질문이 있으신가요?",
    ],
  },
  ru: {
    brief: ["Как я говорил,", "Продолжая с того места,", "Чтобы продолжить,"],
    detailed: [
      "Прежде чем нас прервали, я объяснял, что",
      "Подводя итог: {summary}. Теперь,",
      "Позвольте повторить: {summary}. Продолжая,",
    ],
    askUser: [
      "Хотите, чтобы я продолжил с того места, или начать заново?",
      "Мне продолжать, или у вас есть другой вопрос?",
    ],
  },
  hi: {
    brief: [
      "जैसा कि मैं कह रहा था,",
      "जहां से रुका था वहां से जारी रखते हुए,",
      "आगे बढ़ते हुए,",
    ],
    detailed: [
      "बाधा आने से पहले, मैं समझा रहा था कि",
      "संक्षेप में: {summary}। अब,",
      "दोहराते हुए: {summary}। आगे,",
    ],
    askUser: [
      "क्या आप चाहते हैं कि मैं जहां रुका था वहां से जारी रखूं, या नए सिरे से शुरू करूं?",
      "क्या मैं जारी रखूं, या आप कुछ और पूछना चाहेंगे?",
    ],
  },
  pt: {
    brief: [
      "Como eu estava dizendo,",
      "Continuando de onde parei,",
      "Para continuar,",
    ],
    detailed: [
      "Antes de sermos interrompidos, eu estava explicando que",
      "Resumindo o que eu disse: {summary}. Agora,",
      "Deixe-me recapitular: {summary}. Continuando,",
    ],
    askUser: [
      "Gostaria que eu continuasse de onde parei, ou prefere começar de novo?",
      "Devo continuar, ou você prefere fazer outra pergunta?",
    ],
  },
  it: {
    brief: [
      "Come stavo dicendo,",
      "Continuando da dove ero rimasto,",
      "Per continuare,",
    ],
    detailed: [
      "Prima dell'interruzione, stavo spiegando che",
      "Per riassumere quello che ho detto: {summary}. Ora,",
      "Ricapitolando: {summary}. Continuando,",
    ],
    askUser: [
      "Vuoi che continui da dove mi ero fermato, o preferisci ricominciare?",
      "Devo continuare, o preferisci fare un'altra domanda?",
    ],
  },
};

// ============================================================================
// Context Resumer
// ============================================================================

/**
 * Handles context-aware resumption after interruptions
 */
export class ContextResumer {
  private config: ResumptionConfig;

  /** Last captured context */
  private lastContext: ResumptionContext | null = null;

  /** History of interruptions */
  private interruptionHistory: ResumptionContext[] = [];
  private readonly MAX_HISTORY_SIZE = 5;

  /** Statistics */
  private stats = {
    totalInterruptions: 0,
    resumptionsGenerated: 0,
    avgCompletionAtInterrupt: 0,
  };

  constructor(config: Partial<ResumptionConfig> = {}) {
    this.config = { ...DEFAULT_RESUMPTION_CONFIG, ...config };
  }

  // ==========================================================================
  // Context Capture
  // ==========================================================================

  /**
   * Capture context when interrupted
   *
   * @param fullResponse - The full content that was being delivered
   * @param interruptedAtIndex - Character index where interruption occurred
   * @param reason - Reason for interruption
   * @returns Captured context
   */
  captureInterruptedContext(
    fullResponse: string,
    interruptedAtIndex: number,
    reason: ResumptionContext["interruptionReason"] = "user_barge_in",
  ): ResumptionContext {
    const words = fullResponse.split(/\s+/);
    const spokenContent = fullResponse.substring(0, interruptedAtIndex);
    const interruptedAtWord = spokenContent.split(/\s+/).length;
    const completionPercentage = (interruptedAtWord / words.length) * 100;

    // Extract key points
    const keyPoints = this.extractKeyPoints(fullResponse);

    // Generate summary
    const summary = this.generateSummary(spokenContent);

    const context: ResumptionContext = {
      interruptedContent: fullResponse,
      interruptedAtWord,
      totalWords: words.length,
      completionPercentage,
      keyPoints,
      summary,
      timestamp: Date.now(),
      interruptionReason: reason,
    };

    this.lastContext = context;

    // Add to history
    this.interruptionHistory.push(context);
    if (this.interruptionHistory.length > this.MAX_HISTORY_SIZE) {
      this.interruptionHistory.shift();
    }

    // Update statistics
    this.stats.totalInterruptions++;
    this.stats.avgCompletionAtInterrupt =
      0.9 * this.stats.avgCompletionAtInterrupt + 0.1 * completionPercentage;

    return context;
  }

  // ==========================================================================
  // Resumption Generation
  // ==========================================================================

  /**
   * Generate resumption prefix for continuing after interruption
   *
   * @returns Resumption phrase to use before continuing
   */
  generateResumptionPrefix(): string {
    if (!this.lastContext) {
      return "";
    }

    this.stats.resumptionsGenerated++;

    // Get phrases for current language
    const phrases =
      RESUMPTION_PHRASES[this.config.language] || RESUMPTION_PHRASES.en;

    // Map resumptionStyle to phrase key
    const styleKey =
      this.config.resumptionStyle === "ask-user"
        ? "askUser"
        : this.config.resumptionStyle;

    const templates = phrases[styleKey];

    if (!templates || templates.length === 0) {
      return "";
    }

    // Select a random template
    const template = templates[Math.floor(Math.random() * templates.length)];

    // Replace {summary} placeholder if present
    if (
      this.config.includeSummaryInResumption &&
      template.includes("{summary}")
    ) {
      return template.replace("{summary}", this.lastContext.summary);
    }

    return template;
  }

  /**
   * Get the remaining content after interruption
   *
   * @returns Remaining content to deliver
   */
  getRemainingContent(): string {
    if (!this.lastContext) {
      return "";
    }

    const words = this.lastContext.interruptedContent.split(/\s+/);
    const remaining = words.slice(this.lastContext.interruptedAtWord).join(" ");

    return remaining;
  }

  /**
   * Get full resumption with prefix and remaining content
   *
   * @returns Object with prefix and remaining content
   */
  getFullResumption(): {
    prefix: string;
    remaining: string;
    shouldAskUser: boolean;
  } {
    const prefix = this.generateResumptionPrefix();
    const remaining = this.getRemainingContent();

    // Check if we should ask user
    const shouldAskUser =
      this.config.resumptionStyle === "ask-user" ||
      (this.lastContext && this.lastContext.completionPercentage > 70);

    return {
      prefix,
      remaining,
      shouldAskUser,
    };
  }

  /**
   * Check if auto-resume should be triggered
   *
   * @returns Whether to auto-resume
   */
  shouldAutoResume(): boolean {
    if (!this.config.autoResume || !this.lastContext) {
      return false;
    }

    return (
      this.lastContext.completionPercentage < this.config.autoResumeThreshold
    );
  }

  // ==========================================================================
  // Content Analysis
  // ==========================================================================

  /**
   * Extract key points from content
   *
   * Simple heuristic extraction. In production, use NLP/LLM.
   */
  private extractKeyPoints(content: string): string[] {
    // Split into sentences
    const sentences = content
      .split(/[.!?]+/)
      .filter((s) => s.trim().length > 0);

    // Keywords that indicate important points
    const keywords = [
      "important",
      "key",
      "main",
      "first",
      "second",
      "third",
      "finally",
      "remember",
      "note",
      "specifically",
      "essentially",
      "basically",
      "crucial",
      "significant",
    ];

    // Extract sentences containing keywords
    const keyPointSentences = sentences.filter((sentence) =>
      keywords.some((kw) => sentence.toLowerCase().includes(kw)),
    );

    // Return up to 3 key points
    return keyPointSentences.slice(0, 3).map((s) => s.trim());
  }

  /**
   * Generate a brief summary of content
   *
   * Simple extraction. In production, use summarization model.
   */
  private generateSummary(content: string): string {
    // Get first complete sentence
    const firstSentence = content.split(/[.!?]/)[0];

    if (firstSentence.length <= this.config.maxSummaryLength) {
      return firstSentence.trim();
    }

    // Truncate if too long
    return (
      firstSentence.substring(0, this.config.maxSummaryLength - 3).trim() +
      "..."
    );
  }

  // ==========================================================================
  // Context Management
  // ==========================================================================

  /**
   * Check if there's a pending context to resume
   */
  hasContext(): boolean {
    return this.lastContext !== null;
  }

  /**
   * Get the last captured context
   */
  getLastContext(): ResumptionContext | null {
    return this.lastContext ? { ...this.lastContext } : null;
  }

  /**
   * Get interruption history
   */
  getHistory(): ResumptionContext[] {
    return this.interruptionHistory.map((c) => ({ ...c }));
  }

  /**
   * Clear the current context
   */
  clear(): void {
    this.lastContext = null;
  }

  /**
   * Clear all history
   */
  clearHistory(): void {
    this.lastContext = null;
    this.interruptionHistory = [];
  }

  // ==========================================================================
  // Configuration and State
  // ==========================================================================

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ResumptionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): ResumptionConfig {
    return { ...this.config };
  }

  /**
   * Set language for resumption phrases
   */
  setLanguage(language: SupportedLanguage): void {
    this.config.language = language;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalInterruptions: number;
    resumptionsGenerated: number;
    avgCompletionAtInterrupt: number;
  } {
    return { ...this.stats };
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.lastContext = null;
    this.interruptionHistory = [];
    this.stats = {
      totalInterruptions: 0,
      resumptionsGenerated: 0,
      avgCompletionAtInterrupt: 0,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new ContextResumer with optional configuration
 */
export function createContextResumer(
  config?: Partial<ResumptionConfig>,
): ContextResumer {
  return new ContextResumer(config);
}
