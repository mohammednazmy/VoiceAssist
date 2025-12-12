/**
 * Learning Page
 * Admin management for study decks, flashcards, and learning analytics
 */

import { useEffect, useState } from "react";
import {
  PageContainer,
  PageHeader,
  LoadingState,
  ErrorState,
  EmptyState,
  StatCard,
  DataPanel,
  TabGroup,
  ConfirmDialog,
  StatusBadge,
  Tab,
} from "../components/shared";
import {
  useLearning,
  StudyDeck,
  Flashcard,
  StudySession,
  UserLearningStats,
  DeckStats,
  CreateDeckRequest,
  CreateCardRequest,
} from "../hooks/useLearning";

type LearningTab = "decks" | "cards" | "sessions" | "stats";

const tabs: Tab[] = [
  { id: "decks", label: "Study Decks" },
  { id: "cards", label: "Flashcards" },
  { id: "sessions", label: "Study Sessions" },
  { id: "stats", label: "User Stats" },
];

const cardTypeLabels: Record<string, string> = {
  basic: "Basic",
  cloze: "Cloze",
  multiple_choice: "Multiple Choice",
  true_false: "True/False",
};

const statusColors: Record<string, "success" | "warning" | "pending" | "error" | "inactive"> = {
  new: "pending",
  learning: "warning",
  review: "inactive",
  mastered: "success",
  suspended: "error",
  relearning: "warning",
};

export function LearningPage() {
  const [activeTab, setActiveTab] = useState<LearningTab>("decks");
  const [showCreateDeckDialog, setShowCreateDeckDialog] = useState(false);
  const [showCreateCardDialog, setShowCreateCardDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ type: "deck" | "card"; id: string } | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [newDeckData, setNewDeckData] = useState<CreateDeckRequest>({
    name: "",
    description: "",
    tags: [],
    is_public: false,
  });
  const [newCardData, setNewCardData] = useState<CreateCardRequest>({
    deck_id: "",
    card_type: "basic",
    front: "",
    back: "",
    hint: "",
    explanation: "",
  });
  const [tagInput, setTagInput] = useState("");

  const {
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
    updateCard: _updateCard,
    deleteCard,
    suspendCard,
    unsuspendCard,
    loadUserStats,
    loadDeckStats,
    loadSessions,
  } = useLearning({ userId: selectedUserId || undefined });

  // Load related data when deck is selected
  useEffect(() => {
    if (currentDeck) {
      loadCards(currentDeck.id);
      loadDeckStats(currentDeck.id);
    }
  }, [currentDeck, loadCards, loadDeckStats]);

  // Load sessions when user is selected
  useEffect(() => {
    if (selectedUserId) {
      loadSessions(selectedUserId);
      loadUserStats(selectedUserId);
    }
  }, [selectedUserId, loadSessions, loadUserStats]);

  const handleCreateDeck = async () => {
    const result = await createDeck(newDeckData);
    if (result) {
      setShowCreateDeckDialog(false);
      setNewDeckData({ name: "", description: "", tags: [], is_public: false });
      setTagInput("");
    }
  };

  const handleCreateCard = async () => {
    if (!currentDeck) return;
    const cardData = { ...newCardData, deck_id: currentDeck.id };
    const result = await createCard(cardData);
    if (result) {
      setShowCreateCardDialog(false);
      setNewCardData({
        deck_id: "",
        card_type: "basic",
        front: "",
        back: "",
        hint: "",
        explanation: "",
      });
    }
  };

  const handleDelete = async () => {
    if (!showDeleteConfirm) return;
    if (showDeleteConfirm.type === "deck") {
      await deleteDeck(showDeleteConfirm.id);
    } else {
      await deleteCard(showDeleteConfirm.id);
    }
    setShowDeleteConfirm(null);
  };

  const handleAddTag = () => {
    if (tagInput && !newDeckData.tags?.includes(tagInput)) {
      setNewDeckData({
        ...newDeckData,
        tags: [...(newDeckData.tags || []), tagInput],
      });
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setNewDeckData({
      ...newDeckData,
      tags: newDeckData.tags?.filter((t) => t !== tag) || [],
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  if (loading && decks.length === 0) {
    return (
      <PageContainer>
        <PageHeader title="Learning" description="Manage study decks and flashcards" />
        <LoadingState />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <PageHeader title="Learning" description="Manage study decks and flashcards" />
        <ErrorState message={error} onRetry={loadDecks} />
      </PageContainer>
    );
  }

  // Calculate overall stats
  const totalCards = decks.reduce((sum, d) => sum + d.total_cards, 0);
  const totalMastered = decks.reduce((sum, d) => sum + d.mastered_cards, 0);
  const avgMastery = decks.length > 0
    ? decks.reduce((sum, d) => sum + d.mastery_percentage, 0) / decks.length
    : 0;

  return (
    <PageContainer>
      <PageHeader
        title="Learning"
        description="Manage study decks, flashcards, and track learning progress"
        actions={
          <button
            onClick={() => setShowCreateDeckDialog(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create Deck
          </button>
        }
      />

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Decks"
          value={decks.length}
          icon="📚"
        />
        <StatCard
          title="Total Cards"
          value={totalCards}
          icon="📝"
        />
        <StatCard
          title="Mastered Cards"
          value={totalMastered}
          icon="✅"
          color="green"
        />
        <StatCard
          title="Avg. Mastery"
          value={`${Math.round(avgMastery)}%`}
          icon="📊"
          color="blue"
        />
      </div>

      {/* User Filter */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Filter by User ID (optional)
        </label>
        <input
          type="text"
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          placeholder="Enter user ID to filter..."
          className="w-full max-w-md px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Deck Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Select Deck
        </label>
        <select
          value={currentDeck?.id || ""}
          onChange={(e) => e.target.value && selectDeck(e.target.value)}
          className="w-full max-w-md px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select a deck...</option>
          {decks.map((deck) => (
            <option key={deck.id} value={deck.id}>
              {deck.name} ({deck.total_cards} cards)
            </option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <TabGroup
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as LearningTab)}
      />

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === "decks" && (
          <DecksList
            decks={decks}
            onSelect={selectDeck}
            onDelete={(id) => setShowDeleteConfirm({ type: "deck", id })}
            onTogglePublic={(deck) => updateDeck(deck.id, { is_public: !deck.is_public })}
            formatDate={formatDate}
          />
        )}

        {activeTab === "cards" && currentDeck && (
          <CardsList
            cards={cards}
            loading={cardsLoading}
            onCreateCard={() => setShowCreateCardDialog(true)}
            onDelete={(id) => setShowDeleteConfirm({ type: "card", id })}
            onSuspend={suspendCard}
            onUnsuspend={unsuspendCard}
            deckStats={deckStats}
          />
        )}

        {activeTab === "sessions" && (
          <SessionsList
            sessions={sessions}
            loading={sessionsLoading}
            formatDate={formatDate}
            formatDuration={formatDuration}
          />
        )}

        {activeTab === "stats" && (
          <UserStatsList
            userStats={userStats}
            loading={statsLoading}
            formatDuration={formatDuration}
          />
        )}

        {(activeTab === "cards" && !currentDeck) && (
          <EmptyState
            title="No Deck Selected"
            message="Please select a deck from the dropdown above to view cards."
          />
        )}
      </div>

      {/* Create Deck Dialog */}
      {showCreateDeckDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">Create Study Deck</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
                <input
                  type="text"
                  value={newDeckData.name}
                  onChange={(e) => setNewDeckData({ ...newDeckData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  placeholder="Deck name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
                <textarea
                  value={newDeckData.description || ""}
                  onChange={(e) => setNewDeckData({ ...newDeckData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  rows={3}
                  placeholder="Optional description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Tags</label>
                <div className="flex gap-2 mb-2 flex-wrap">
                  {newDeckData.tags?.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 bg-blue-600/30 text-blue-300 text-sm rounded-full flex items-center gap-1"
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-white"
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                    className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    placeholder="Add tag..."
                  />
                  <button
                    onClick={handleAddTag}
                    className="px-3 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-500"
                  >
                    Add
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_public"
                  checked={newDeckData.is_public}
                  onChange={(e) => setNewDeckData({ ...newDeckData, is_public: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700"
                />
                <label htmlFor="is_public" className="text-sm text-slate-300">
                  Make this deck public
                </label>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateDeckDialog(false)}
                className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDeck}
                disabled={!newDeckData.name}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Card Dialog */}
      {showCreateCardDialog && currentDeck && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold text-white mb-4">Create Flashcard</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Card Type</label>
                <select
                  value={newCardData.card_type}
                  onChange={(e) => setNewCardData({ ...newCardData, card_type: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="basic">Basic</option>
                  <option value="cloze">Cloze</option>
                  <option value="multiple_choice">Multiple Choice</option>
                  <option value="true_false">True/False</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Front</label>
                <textarea
                  value={newCardData.front}
                  onChange={(e) => setNewCardData({ ...newCardData, front: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  rows={3}
                  placeholder="Question or prompt"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Back</label>
                <textarea
                  value={newCardData.back}
                  onChange={(e) => setNewCardData({ ...newCardData, back: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  rows={3}
                  placeholder="Answer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Hint (optional)</label>
                <input
                  type="text"
                  value={newCardData.hint || ""}
                  onChange={(e) => setNewCardData({ ...newCardData, hint: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  placeholder="Optional hint"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Explanation (optional)</label>
                <textarea
                  value={newCardData.explanation || ""}
                  onChange={(e) => setNewCardData({ ...newCardData, explanation: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  rows={2}
                  placeholder="Optional explanation shown after answer"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateCardDialog(false)}
                className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCard}
                disabled={!newCardData.front || !newCardData.back}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!showDeleteConfirm}
        title={`Delete ${showDeleteConfirm?.type === "deck" ? "Deck" : "Card"}`}
        message={
          showDeleteConfirm?.type === "deck"
            ? "Are you sure you want to delete this deck? All cards in this deck will also be deleted."
            : "Are you sure you want to delete this card?"
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onClose={() => setShowDeleteConfirm(null)}
      />
    </PageContainer>
  );
}

// Sub-components

interface DecksListProps {
  decks: StudyDeck[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onTogglePublic: (deck: StudyDeck) => void;
  formatDate: (date: string) => string;
}

function DecksList({ decks, onSelect, onDelete, onTogglePublic, formatDate }: DecksListProps) {
  if (decks.length === 0) {
    return (
      <EmptyState
        title="No Study Decks"
        message="Create your first study deck to start adding flashcards."
      />
    );
  }

  return (
    <DataPanel title="All Decks" subtitle={`${decks.length} decks`}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {decks.map((deck) => (
          <div
            key={deck.id}
            className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 hover:border-blue-500/50 cursor-pointer transition-colors"
            onClick={() => onSelect(deck.id)}
          >
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-medium text-white">{deck.name}</h4>
              <div className="flex gap-1">
                {deck.is_public && (
                  <span className="px-2 py-0.5 bg-green-600/30 text-green-300 text-xs rounded">
                    Public
                  </span>
                )}
              </div>
            </div>
            {deck.description && (
              <p className="text-sm text-slate-400 mb-3 line-clamp-2">{deck.description}</p>
            )}
            {deck.tags && deck.tags.length > 0 && (
              <div className="flex gap-1 flex-wrap mb-3">
                {deck.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
              <div>
                <span className="text-slate-400">Total:</span>{" "}
                <span className="text-white">{deck.total_cards}</span>
              </div>
              <div>
                <span className="text-slate-400">Mastery:</span>{" "}
                <span className="text-green-400">{Math.round(deck.mastery_percentage)}%</span>
              </div>
              <div>
                <span className="text-slate-400">New:</span>{" "}
                <span className="text-blue-400">{deck.new_cards}</span>
              </div>
              <div>
                <span className="text-slate-400">Review:</span>{" "}
                <span className="text-amber-400">{deck.review_cards}</span>
              </div>
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-slate-700">
              <span className="text-xs text-slate-500">{formatDate(deck.created_at)}</span>
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePublic(deck);
                  }}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  {deck.is_public ? "Make Private" : "Make Public"}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(deck.id);
                  }}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </DataPanel>
  );
}

interface CardsListProps {
  cards: Flashcard[];
  loading: boolean;
  onCreateCard: () => void;
  onDelete: (id: string) => void;
  onSuspend: (id: string) => Promise<boolean>;
  onUnsuspend: (id: string) => Promise<boolean>;
  deckStats: DeckStats | null;
}

function CardsList({
  cards,
  loading,
  onCreateCard,
  onDelete,
  onSuspend,
  onUnsuspend,
  deckStats,
}: CardsListProps) {
  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      {/* Deck Stats */}
      {deckStats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="bg-slate-800/50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-blue-400">{deckStats.cards_by_status.new}</p>
            <p className="text-xs text-slate-400">New</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-amber-400">{deckStats.cards_by_status.learning}</p>
            <p className="text-xs text-slate-400">Learning</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-slate-300">{deckStats.cards_by_status.review}</p>
            <p className="text-xs text-slate-400">Review</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-400">{deckStats.cards_by_status.mastered}</p>
            <p className="text-xs text-slate-400">Mastered</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-red-400">{deckStats.due_today}</p>
            <p className="text-xs text-slate-400">Due Today</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-purple-400">{Math.round(deckStats.retention_rate * 100)}%</p>
            <p className="text-xs text-slate-400">Retention</p>
          </div>
        </div>
      )}

      <DataPanel
        title="Flashcards"
        subtitle={`${cards.length} cards`}
        headerAction={
          <button
            onClick={onCreateCard}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            Add Card
          </button>
        }
      >
        {cards.length === 0 ? (
          <EmptyState title="No Cards" message="Add flashcards to this deck to start studying." />
        ) : (
          <div className="space-y-3">
            {cards.map((card) => (
              <div
                key={card.id}
                className="bg-slate-800/30 rounded-lg p-4 border border-slate-700"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex gap-2">
                    <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">
                      {cardTypeLabels[card.card_type] || card.card_type}
                    </span>
                    <StatusBadge
                      status={statusColors[card.status] || "inactive"}
                      label={card.status}
                    />
                  </div>
                  <div className="flex gap-2">
                    {card.status === "suspended" ? (
                      <button
                        onClick={() => onUnsuspend(card.id)}
                        className="text-xs text-green-400 hover:text-green-300"
                      >
                        Unsuspend
                      </button>
                    ) : (
                      <button
                        onClick={() => onSuspend(card.id)}
                        className="text-xs text-amber-400 hover:text-amber-300"
                      >
                        Suspend
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(card.id)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Front</p>
                    <p className="text-white">{card.front}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Back</p>
                    <p className="text-slate-300">{card.back}</p>
                  </div>
                </div>
                {card.hint && (
                  <p className="text-xs text-slate-400 mt-2">
                    <span className="text-slate-500">Hint:</span> {card.hint}
                  </p>
                )}
                <div className="flex gap-4 mt-3 text-xs text-slate-500">
                  <span>Reviews: {card.review_count}</span>
                  <span>Accuracy: {Math.round(card.accuracy * 100)}%</span>
                  <span>Ease: {card.ease_factor.toFixed(2)}</span>
                  <span>Interval: {card.interval_days}d</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </DataPanel>
    </div>
  );
}

interface SessionsListProps {
  sessions: StudySession[];
  loading: boolean;
  formatDate: (date: string) => string;
  formatDuration: (minutes: number) => string;
}

function SessionsList({ sessions, loading, formatDate, formatDuration }: SessionsListProps) {
  if (loading) return <LoadingState />;

  return (
    <DataPanel title="Recent Study Sessions" subtitle={`${sessions.length} sessions`}>
      {sessions.length === 0 ? (
        <EmptyState title="No Sessions" message="Study sessions will appear here." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-slate-400 border-b border-slate-700">
                <th className="pb-3 font-medium">Started</th>
                <th className="pb-3 font-medium">Mode</th>
                <th className="pb-3 font-medium">Cards</th>
                <th className="pb-3 font-medium">Correct</th>
                <th className="pb-3 font-medium">Accuracy</th>
                <th className="pb-3 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className="border-b border-slate-700/50">
                  <td className="py-3 text-white">{formatDate(session.started_at)}</td>
                  <td className="py-3">
                    <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded capitalize">
                      {session.study_mode}
                    </span>
                  </td>
                  <td className="py-3 text-slate-300">{session.cards_studied}</td>
                  <td className="py-3 text-green-400">{session.cards_correct}</td>
                  <td className="py-3">
                    <span
                      className={
                        session.accuracy >= 0.8
                          ? "text-green-400"
                          : session.accuracy >= 0.6
                          ? "text-amber-400"
                          : "text-red-400"
                      }
                    >
                      {Math.round(session.accuracy * 100)}%
                    </span>
                  </td>
                  <td className="py-3 text-slate-300">
                    {session.duration_minutes ? formatDuration(session.duration_minutes) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DataPanel>
  );
}

interface UserStatsListProps {
  userStats: UserLearningStats | null;
  loading: boolean;
  formatDuration: (minutes: number) => string;
}

function UserStatsList({ userStats, loading, formatDuration }: UserStatsListProps) {
  if (loading) return <LoadingState />;

  if (!userStats) {
    return (
      <EmptyState
        title="No User Stats"
        message="Enter a user ID above to view their learning statistics."
      />
    );
  }

  return (
    <DataPanel title="User Learning Statistics">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 rounded-lg p-4">
          <p className="text-3xl font-bold text-white">{userStats.total_cards_studied}</p>
          <p className="text-sm text-slate-400">Cards Studied</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4">
          <p className="text-3xl font-bold text-white">{userStats.total_reviews}</p>
          <p className="text-sm text-slate-400">Total Reviews</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4">
          <p className="text-3xl font-bold text-green-400">
            {Math.round(userStats.avg_retention_rate * 100)}%
          </p>
          <p className="text-sm text-slate-400">Retention Rate</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4">
          <p className="text-3xl font-bold text-blue-400">
            {formatDuration(userStats.total_study_time_minutes)}
          </p>
          <p className="text-sm text-slate-400">Study Time</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4">
          <p className="text-3xl font-bold text-amber-400">{userStats.current_streak_days}</p>
          <p className="text-sm text-slate-400">Current Streak</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4">
          <p className="text-3xl font-bold text-purple-400">{userStats.longest_streak_days}</p>
          <p className="text-sm text-slate-400">Longest Streak</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4">
          <p className="text-3xl font-bold text-white">{userStats.total_correct_reviews}</p>
          <p className="text-sm text-slate-400">Correct Reviews</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4">
          <p className="text-sm text-slate-400">Last Study</p>
          <p className="text-white">
            {userStats.last_study_date
              ? new Date(userStats.last_study_date).toLocaleDateString()
              : "Never"}
          </p>
        </div>
      </div>
    </DataPanel>
  );
}
