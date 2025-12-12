/**
 * useLearning hook
 * Manages learning/flashcard operations for admin panel
 */

import { useCallback, useEffect, useState } from "react";
import { fetchAPI } from "../lib/api";

// Types matching the backend Learning models

export interface StudyDeck {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  tags?: string[];
  is_public: boolean;
  source_document_id?: string;
  total_cards: number;
  new_cards: number;
  learning_cards: number;
  review_cards: number;
  mastered_cards: number;
  mastery_percentage: number;
  created_at: string;
  updated_at?: string;
}

export interface Flashcard {
  id: string;
  deck_id: string;
  card_type: "basic" | "cloze" | "multiple_choice" | "true_false";
  front: string;
  back: string;
  hint?: string;
  explanation?: string;
  tags?: string[];
  media_url?: string;
  source_page?: number;
  source_chunk_id?: string;
  status: "new" | "learning" | "review" | "mastered" | "suspended" | "relearning";
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  due_date?: string;
  last_reviewed_at?: string;
  review_count: number;
  correct_count: number;
  accuracy: number;
  created_at: string;
  updated_at?: string;
}

export interface StudySession {
  id: string;
  user_id: string;
  deck_id: string;
  started_at: string;
  ended_at?: string;
  cards_studied: number;
  cards_correct: number;
  cards_incorrect: number;
  accuracy: number;
  duration_minutes?: number;
  study_mode: "learn" | "review" | "cram" | "test";
  created_at: string;
}

export interface FlashcardReview {
  id: string;
  session_id: string;
  card_id: string;
  rating: 1 | 2 | 3 | 4;
  response_time_ms: number;
  ease_factor_before: number;
  ease_factor_after: number;
  interval_before_days: number;
  interval_after_days: number;
  created_at: string;
}

export interface UserLearningStats {
  id: string;
  user_id: string;
  total_cards_studied: number;
  total_correct_reviews: number;
  total_reviews: number;
  total_study_time_minutes: number;
  current_streak_days: number;
  longest_streak_days: number;
  avg_retention_rate: number;
  last_study_date?: string;
  created_at: string;
  updated_at?: string;
}

export interface DeckStats {
  deck_id: string;
  total_cards: number;
  cards_by_status: {
    new: number;
    learning: number;
    review: number;
    mastered: number;
    suspended: number;
    relearning: number;
  };
  due_today: number;
  overdue: number;
  avg_ease_factor: number;
  avg_interval_days: number;
  retention_rate: number;
}

export interface CreateDeckRequest {
  name: string;
  description?: string;
  tags?: string[];
  is_public?: boolean;
  source_document_id?: string;
}

export interface CreateCardRequest {
  deck_id: string;
  card_type: string;
  front: string;
  back: string;
  hint?: string;
  explanation?: string;
  tags?: string[];
  source_page?: number;
}

export interface GenerateCardsRequest {
  document_id: string;
  page_range?: { start: number; end: number };
  num_cards?: number;
  card_types?: string[];
  difficulty?: "easy" | "medium" | "hard";
}

interface UseLearningOptions {
  autoLoad?: boolean;
  userId?: string;
}

interface UseLearningReturn {
  // Data
  decks: StudyDeck[];
  currentDeck: StudyDeck | null;
  cards: Flashcard[];
  sessions: StudySession[];
  userStats: UserLearningStats | null;
  deckStats: DeckStats | null;

  // Loading states
  loading: boolean;
  cardsLoading: boolean;
  sessionsLoading: boolean;
  statsLoading: boolean;

  // Error state
  error: string | null;

  // Deck actions
  loadDecks: (userId?: string) => Promise<void>;
  selectDeck: (deckId: string) => Promise<void>;
  createDeck: (data: CreateDeckRequest) => Promise<StudyDeck | null>;
  updateDeck: (deckId: string, updates: Partial<StudyDeck>) => Promise<boolean>;
  deleteDeck: (deckId: string) => Promise<boolean>;

  // Card actions
  loadCards: (deckId: string) => Promise<void>;
  createCard: (data: CreateCardRequest) => Promise<Flashcard | null>;
  updateCard: (cardId: string, updates: Partial<Flashcard>) => Promise<boolean>;
  deleteCard: (cardId: string) => Promise<boolean>;
  suspendCard: (cardId: string) => Promise<boolean>;
  unsuspendCard: (cardId: string) => Promise<boolean>;

  // Study actions
  loadDueCards: (deckId: string) => Promise<Flashcard[]>;
  loadStudyQueue: (deckId: string, limit?: number) => Promise<Flashcard[]>;
  reviewCard: (sessionId: string, cardId: string, rating: number) => Promise<boolean>;
  startSession: (deckId: string, mode?: string) => Promise<StudySession | null>;
  endSession: (sessionId: string) => Promise<boolean>;

  // AI generation
  generateCards: (request: GenerateCardsRequest) => Promise<Flashcard[] | null>;

  // Stats actions
  loadUserStats: (userId?: string) => Promise<void>;
  loadDeckStats: (deckId: string) => Promise<void>;
  loadSessions: (userId?: string, limit?: number) => Promise<void>;
}

export function useLearning(options: UseLearningOptions = {}): UseLearningReturn {
  const { autoLoad = true, userId } = options;

  // Data state
  const [decks, setDecks] = useState<StudyDeck[]>([]);
  const [currentDeck, setCurrentDeck] = useState<StudyDeck | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [userStats, setUserStats] = useState<UserLearningStats | null>(null);
  const [deckStats, setDeckStats] = useState<DeckStats | null>(null);

  // Loading states
  const [loading, setLoading] = useState(true);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Load decks
  const loadDecks = useCallback(async (userIdParam?: string) => {
    setLoading(true);
    try {
      const queryUserId = userIdParam || userId;
      const url = queryUserId
        ? `/api/learning/decks?user_id=${queryUserId}`
        : "/api/learning/decks";
      const response = await fetchAPI<{ data: StudyDeck[] }>(url);
      setDecks(response.data);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load decks";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Select deck
  const selectDeck = useCallback(async (deckId: string) => {
    try {
      const response = await fetchAPI<{ data: StudyDeck }>(
        `/api/learning/decks/${deckId}`
      );
      setCurrentDeck(response.data);
    } catch (err) {
      console.error("Failed to select deck:", err);
    }
  }, []);

  // Create deck
  const createDeck = useCallback(
    async (data: CreateDeckRequest): Promise<StudyDeck | null> => {
      try {
        const response = await fetchAPI<{ data: StudyDeck }>("/api/learning/decks", {
          method: "POST",
          body: JSON.stringify(data),
        });
        await loadDecks();
        return response.data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create deck";
        setError(message);
        return null;
      }
    },
    [loadDecks]
  );

  // Update deck
  const updateDeck = useCallback(
    async (deckId: string, updates: Partial<StudyDeck>): Promise<boolean> => {
      try {
        await fetchAPI(`/api/learning/decks/${deckId}`, {
          method: "PATCH",
          body: JSON.stringify(updates),
        });
        await loadDecks();
        if (currentDeck?.id === deckId) {
          await selectDeck(deckId);
        }
        return true;
      } catch (err) {
        console.error("Failed to update deck:", err);
        return false;
      }
    },
    [loadDecks, currentDeck, selectDeck]
  );

  // Delete deck
  const deleteDeck = useCallback(
    async (deckId: string): Promise<boolean> => {
      try {
        await fetchAPI(`/api/learning/decks/${deckId}`, {
          method: "DELETE",
        });
        await loadDecks();
        if (currentDeck?.id === deckId) {
          setCurrentDeck(null);
        }
        return true;
      } catch (err) {
        console.error("Failed to delete deck:", err);
        return false;
      }
    },
    [loadDecks, currentDeck]
  );

  // Load cards
  const loadCards = useCallback(async (deckId: string) => {
    setCardsLoading(true);
    try {
      const response = await fetchAPI<{ data: Flashcard[] }>(
        `/api/learning/decks/${deckId}/cards`
      );
      setCards(response.data);
    } catch (err) {
      console.error("Failed to load cards:", err);
    } finally {
      setCardsLoading(false);
    }
  }, []);

  // Create card
  const createCard = useCallback(
    async (data: CreateCardRequest): Promise<Flashcard | null> => {
      try {
        const response = await fetchAPI<{ data: Flashcard }>("/api/learning/cards", {
          method: "POST",
          body: JSON.stringify(data),
        });
        await loadCards(data.deck_id);
        return response.data;
      } catch (err) {
        console.error("Failed to create card:", err);
        return null;
      }
    },
    [loadCards]
  );

  // Update card
  const updateCard = useCallback(
    async (cardId: string, updates: Partial<Flashcard>): Promise<boolean> => {
      try {
        await fetchAPI(`/api/learning/cards/${cardId}`, {
          method: "PATCH",
          body: JSON.stringify(updates),
        });
        if (currentDeck) {
          await loadCards(currentDeck.id);
        }
        return true;
      } catch (err) {
        console.error("Failed to update card:", err);
        return false;
      }
    },
    [loadCards, currentDeck]
  );

  // Delete card
  const deleteCard = useCallback(
    async (cardId: string): Promise<boolean> => {
      try {
        await fetchAPI(`/api/learning/cards/${cardId}`, {
          method: "DELETE",
        });
        if (currentDeck) {
          await loadCards(currentDeck.id);
        }
        return true;
      } catch (err) {
        console.error("Failed to delete card:", err);
        return false;
      }
    },
    [loadCards, currentDeck]
  );

  // Suspend card
  const suspendCard = useCallback(
    async (cardId: string): Promise<boolean> => {
      return updateCard(cardId, { status: "suspended" });
    },
    [updateCard]
  );

  // Unsuspend card
  const unsuspendCard = useCallback(
    async (cardId: string): Promise<boolean> => {
      return updateCard(cardId, { status: "new" });
    },
    [updateCard]
  );

  // Load due cards
  const loadDueCards = useCallback(async (deckId: string): Promise<Flashcard[]> => {
    try {
      const response = await fetchAPI<{ data: Flashcard[] }>(
        `/api/learning/decks/${deckId}/due`
      );
      return response.data;
    } catch (err) {
      console.error("Failed to load due cards:", err);
      return [];
    }
  }, []);

  // Load study queue
  const loadStudyQueue = useCallback(
    async (deckId: string, limit = 20): Promise<Flashcard[]> => {
      try {
        const response = await fetchAPI<{ data: Flashcard[] }>(
          `/api/learning/decks/${deckId}/study-queue?limit=${limit}`
        );
        return response.data;
      } catch (err) {
        console.error("Failed to load study queue:", err);
        return [];
      }
    },
    []
  );

  // Review card
  const reviewCard = useCallback(
    async (sessionId: string, cardId: string, rating: number): Promise<boolean> => {
      try {
        await fetchAPI(`/api/learning/sessions/${sessionId}/review`, {
          method: "POST",
          body: JSON.stringify({ card_id: cardId, rating }),
        });
        return true;
      } catch (err) {
        console.error("Failed to review card:", err);
        return false;
      }
    },
    []
  );

  // Start session
  const startSession = useCallback(
    async (deckId: string, mode = "review"): Promise<StudySession | null> => {
      try {
        const response = await fetchAPI<{ data: StudySession }>(
          "/api/learning/sessions",
          {
            method: "POST",
            body: JSON.stringify({ deck_id: deckId, study_mode: mode }),
          }
        );
        return response.data;
      } catch (err) {
        console.error("Failed to start session:", err);
        return null;
      }
    },
    []
  );

  // End session
  const endSession = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      await fetchAPI(`/api/learning/sessions/${sessionId}/end`, {
        method: "POST",
      });
      return true;
    } catch (err) {
      console.error("Failed to end session:", err);
      return false;
    }
  }, []);

  // Generate cards using AI
  const generateCards = useCallback(
    async (request: GenerateCardsRequest): Promise<Flashcard[] | null> => {
      try {
        const response = await fetchAPI<{ data: Flashcard[] }>(
          "/api/learning/generate",
          {
            method: "POST",
            body: JSON.stringify(request),
          }
        );
        return response.data;
      } catch (err) {
        console.error("Failed to generate cards:", err);
        return null;
      }
    },
    []
  );

  // Load user stats
  const loadUserStats = useCallback(async (userIdParam?: string) => {
    setStatsLoading(true);
    try {
      const queryUserId = userIdParam || userId;
      const url = queryUserId
        ? `/api/learning/stats?user_id=${queryUserId}`
        : "/api/learning/stats";
      const response = await fetchAPI<{ data: UserLearningStats }>(url);
      setUserStats(response.data);
    } catch (err) {
      console.error("Failed to load user stats:", err);
    } finally {
      setStatsLoading(false);
    }
  }, [userId]);

  // Load deck stats
  const loadDeckStats = useCallback(async (deckId: string) => {
    setStatsLoading(true);
    try {
      const response = await fetchAPI<{ data: DeckStats }>(
        `/api/learning/decks/${deckId}/stats`
      );
      setDeckStats(response.data);
    } catch (err) {
      console.error("Failed to load deck stats:", err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // Load sessions
  const loadSessions = useCallback(
    async (userIdParam?: string, limit = 10) => {
      setSessionsLoading(true);
      try {
        const queryUserId = userIdParam || userId;
        const url = queryUserId
          ? `/api/learning/sessions?user_id=${queryUserId}&limit=${limit}`
          : `/api/learning/sessions?limit=${limit}`;
        const response = await fetchAPI<{ data: StudySession[] }>(url);
        setSessions(response.data);
      } catch (err) {
        console.error("Failed to load sessions:", err);
      } finally {
        setSessionsLoading(false);
      }
    },
    [userId]
  );

  // Initial load
  useEffect(() => {
    if (autoLoad) {
      loadDecks();
    }
  }, [autoLoad, loadDecks]);

  return {
    decks,
    currentDeck,
    cards,
    sessions,
    userStats,
    deckStats,
    loading,
    cardsLoading,
    sessionsLoading,
    statsLoading,
    error,
    loadDecks,
    selectDeck,
    createDeck,
    updateDeck,
    deleteDeck,
    loadCards,
    createCard,
    updateCard,
    deleteCard,
    suspendCard,
    unsuspendCard,
    loadDueCards,
    loadStudyQueue,
    reviewCard,
    startSession,
    endSession,
    generateCards,
    loadUserStats,
    loadDeckStats,
    loadSessions,
  };
}
