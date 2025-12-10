/**
 * TranscriptScorer
 *
 * Test-only utility for evaluating STT transcript quality and
 * detecting echo/contamination from AI TTS in user transcripts.
 *
 * This should only be used from Playwright tests and helpers under e2e/.
 */

export interface AccuracyScore {
  characterAccuracy: number; // Levenshtein-based (0-1)
  wordAccuracy: number; // Word-level matching (0-1)
  semanticSimilarity: number; // Meaning preservation (0-1)
  overallScore: number; // Weighted combination
  details: {
    expectedLength: number;
    actualLength: number;
    editDistance: number;
    matchedWords: number;
    totalWords: number;
    insertions: number;
    deletions: number;
    substitutions: number;
  };
}

export interface EchoContaminationResult {
  detected: boolean;
  confidence: number;
  contaminatedWords: string[];
  cleanTranscript: string;
}

export class TranscriptScorer {
  /**
   * Calculate comprehensive accuracy score between expected and actual text.
   */
  score(expected: string, actual: string): AccuracyScore {
    const charAccuracy = this.levenshteinAccuracy(expected, actual);
    const wordAccuracy = this.wordLevelAccuracy(expected, actual);
    const semanticSim = this.semanticSimilarity(expected, actual);
    const editDetails = this.editDistanceDetails(expected, actual);

    const overallScore =
      charAccuracy * 0.3 + wordAccuracy * 0.4 + semanticSim * 0.3;

    return {
      characterAccuracy: charAccuracy,
      wordAccuracy,
      semanticSimilarity: semanticSim,
      overallScore,
      details: {
        expectedLength: expected.length,
        actualLength: actual.length,
        editDistance: editDetails.distance,
        matchedWords: editDetails.matchedWords,
        totalWords: editDetails.totalWords,
        insertions: editDetails.insertions,
        deletions: editDetails.deletions,
        substitutions: editDetails.substitutions,
      },
    };
  }

  /**
   * Detect whether AI speech has leaked into the user transcript.
   *
   * - `aiKeywords` should contain salient words/phrases from the AI response.
   * - `aiFullResponse` is optional full AI text, used to detect longer phrases.
   */
  detectEchoContamination(
    userTranscript: string,
    aiKeywords: string[],
    aiFullResponse?: string,
  ): EchoContaminationResult {
    const userWords = userTranscript.toLowerCase().split(/\s+/);
    const contaminatedWords: string[] = [];

    // Check for AI keywords in user transcript (fuzzy word-level match).
    for (const keyword of aiKeywords) {
      const keywordLower = keyword.toLowerCase();
      for (const userWord of userWords) {
        if (this.fuzzyMatch(userWord, keywordLower, 0.8)) {
          contaminatedWords.push(keyword);
        }
      }
    }

    // Check for short phrases from full AI response.
    if (aiFullResponse) {
      const aiPhrases = this.extractPhrases(aiFullResponse, 3);
      for (const phrase of aiPhrases) {
        if (userTranscript.toLowerCase().includes(phrase.toLowerCase())) {
          contaminatedWords.push(`[phrase: ${phrase}]`);
        }
      }
    }

    const confidence =
      contaminatedWords.length > 0
        ? Math.min(1, contaminatedWords.length / 3)
        : 0;

    // Generate "clean" transcript by removing contaminated words.
    let cleanTranscript = userTranscript;
    for (const word of contaminatedWords) {
      if (!word.startsWith("[phrase:")) {
        cleanTranscript = cleanTranscript
          .replace(new RegExp(word, "gi"), "")
          .trim();
      }
    }

    return {
      detected: contaminatedWords.length > 0,
      confidence,
      contaminatedWords,
      cleanTranscript: cleanTranscript.replace(/\s+/g, " ").trim(),
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private levenshteinAccuracy(expected: string, actual: string): number {
    const e = expected.toLowerCase().trim();
    const a = actual.toLowerCase().trim();

    if (e.length === 0 && a.length === 0) return 1;
    if (e.length === 0 || a.length === 0) return 0;

    const distance = this.levenshteinDistance(e, a);
    return 1 - distance / Math.max(e.length, a.length);
  }

  private wordLevelAccuracy(expected: string, actual: string): number {
    const expectedWords = new Set(
      expected
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
    const actualWords = new Set(
      actual
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );

    if (expectedWords.size === 0) {
      return actualWords.size === 0 ? 1 : 0;
    }

    let matches = 0;
    for (const word of expectedWords) {
      if (actualWords.has(word)) matches++;
    }

    return matches / expectedWords.size;
  }

  private semanticSimilarity(expected: string, actual: string): number {
    const expectedConcepts = this.extractKeyConcepts(expected);
    const actualConcepts = this.extractKeyConcepts(actual);

    if (expectedConcepts.length === 0) {
      return actualConcepts.length === 0 ? 1 : 0;
    }

    let matches = 0;
    for (const concept of expectedConcepts) {
      if (actualConcepts.some((c) => this.fuzzyMatch(c, concept, 0.8))) {
        matches++;
      }
    }

    return matches / expectedConcepts.length;
  }

  private extractKeyConcepts(text: string): string[] {
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
      "can",
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
      "or",
      "and",
      "but",
      "if",
      "then",
      "so",
      "what",
      "which",
      "who",
      "when",
      "where",
      "why",
      "how",
      "this",
      "that",
      "these",
      "those",
      "i",
      "you",
      "he",
      "she",
      "it",
      "we",
      "they",
      "me",
      "him",
      "her",
      "us",
      "them",
      "my",
      "your",
      "his",
      "its",
      "our",
      "their",
    ]);

    return text
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w))
      .slice(0, 10);
  }

  private extractPhrases(text: string, wordCount: number): string[] {
    const words = text.split(/\s+/);
    const phrases: string[] = [];

    for (let i = 0; i <= words.length - wordCount; i++) {
      phrases.push(words.slice(i, i + wordCount).join(" "));
    }

    return phrases;
  }

  private fuzzyMatch(a: string, b: string, threshold: number): boolean {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 3) return false;

    const distance = this.levenshteinDistance(a, b);
    const similarity = 1 - distance / Math.max(a.length, a.length, b.length);
    return similarity >= threshold;
  }

  private levenshteinDistance(s1: string, s2: string): number {
    const m = s1.length;
    const n = s2.length;
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] =
            1 +
            Math.min(
              dp[i - 1][j],
              dp[i][j - 1],
              dp[i - 1][j - 1],
            );
        }
      }
    }

    return dp[m][n];
  }

  private editDistanceDetails(
    s1: string,
    s2: string,
  ): {
    distance: number;
    matchedWords: number;
    totalWords: number;
    insertions: number;
    deletions: number;
    substitutions: number;
  } {
    const words1 = s1.toLowerCase().split(/\s+/);
    const words2 = s2.toLowerCase().split(/\s+/);

    const set1 = new Set(words1);
    const set2 = new Set(words2);

    let matchedWords = 0;
    for (const w of set1) {
      if (set2.has(w)) matchedWords++;
    }

    return {
      distance: this.levenshteinDistance(
        s1.toLowerCase(),
        s2.toLowerCase(),
      ),
      matchedWords,
      totalWords: set1.size,
      insertions: Array.from(set2).filter((w) => !set1.has(w)).length,
      deletions: Array.from(set1).filter((w) => !set2.has(w)).length,
      substitutions: 0,
    };
  }
}

// Singleton instance for use in tests.
export const transcriptScorer = new TranscriptScorer();
