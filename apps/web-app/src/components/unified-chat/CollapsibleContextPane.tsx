/**
 * Collapsible Context Pane
 *
 * Right-side panel for citations, clinical context, and conversation branches.
 */

import { useState, useMemo, useEffect } from "react";
import {
  PanelRightClose,
  PanelRightOpen,
  FileText,
  Stethoscope,
  GitBranch,
  Search,
  Loader2,
  AlertCircle,
  Plus,
  ChevronRight,
  ExternalLink,
  X,
} from "lucide-react";
import { useUnifiedConversationStore } from "../../stores/unifiedConversationStore";
import { useClinicalContext } from "../../hooks/useClinicalContext";
import { useBranching } from "../../hooks/useBranching";
import { useIsMobile } from "../../hooks/useIsMobile";
import type { Citation } from "../../types";

interface CollapsibleContextPaneProps {
  isOpen: boolean;
  onToggle: () => void;
  conversationId: string | null;
}

type TabId = "citations" | "clinical" | "branches";

export function CollapsibleContextPane({
  isOpen,
  onToggle,
  conversationId,
}: CollapsibleContextPaneProps) {
  const [activeTab, setActiveTab] = useState<TabId>("citations");
  const isMobile = useIsMobile();

  // Collapsed state - hidden on mobile when closed
  if (!isOpen) {
    // On mobile, don't render anything when closed
    if (isMobile) {
      return null;
    }
    // On desktop, show collapsed sidebar
    return (
      <div className="w-12 border-l border-neutral-200 bg-white flex flex-col items-center py-4">
        <button
          onClick={onToggle}
          className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
          aria-label="Open context pane"
        >
          <PanelRightOpen className="w-5 h-5 text-neutral-600" />
        </button>
      </div>
    );
  }

  const tabs = [
    { id: "citations" as const, label: "Citations", icon: FileText },
    { id: "clinical" as const, label: "Clinical", icon: Stethoscope },
    { id: "branches" as const, label: "Branches", icon: GitBranch },
  ];

  // Pane content component
  const paneContent = (
    <aside
      className={`${isMobile ? "w-full" : "w-80"} h-full border-l border-neutral-200 bg-white flex flex-col`}
      aria-label="Context and references"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
        <h2 className="font-semibold text-neutral-900">Context</h2>
        <button
          onClick={onToggle}
          className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors"
          aria-label="Close context pane"
        >
          {isMobile ? (
            <X className="w-5 h-5 text-neutral-500" />
          ) : (
            <PanelRightClose className="w-5 h-5 text-neutral-500" />
          )}
        </button>
      </div>

      {/* Tabs */}
      <div
        className="flex border-b border-neutral-100"
        role="tablist"
        aria-label="Context pane sections"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`${tab.id}-panel`}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "text-primary-600 border-b-2 border-primary-600"
                : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div
        id={`${activeTab}-panel`}
        className="flex-1 overflow-y-auto p-4"
        role="tabpanel"
        aria-label={`${activeTab} content`}
      >
        {activeTab === "citations" && (
          <CitationsTab conversationId={conversationId} />
        )}
        {activeTab === "clinical" && (
          <ClinicalTab conversationId={conversationId} />
        )}
        {activeTab === "branches" && (
          <BranchesTab conversationId={conversationId} />
        )}
      </div>
    </aside>
  );

  // On mobile, wrap with overlay backdrop
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-40 flex justify-end">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/50 transition-opacity duration-200"
          onClick={onToggle}
          aria-hidden="true"
        />
        {/* Pane - slide in from right */}
        <div className="relative z-50 h-full w-full max-w-md shadow-xl">
          {paneContent}
        </div>
      </div>
    );
  }

  // Desktop: render inline
  return paneContent;
}

// ============================================================================
// Tab Components
// ============================================================================

function CitationsTab({
  conversationId: _conversationId,
}: {
  conversationId: string | null;
}) {
  const messages = useUnifiedConversationStore((state) => state.messages);
  const [searchQuery, setSearchQuery] = useState("");

  // Aggregate citations from all messages
  const allCitations = useMemo(() => {
    const citationsMap = new Map<
      string,
      { citation: Citation; messageIndex: number }
    >();

    messages.forEach((message, index) => {
      const citations = message.metadata?.citations || message.citations || [];

      citations.forEach((citation: Citation) => {
        if (!citationsMap.has(citation.id)) {
          citationsMap.set(citation.id, {
            citation,
            messageIndex: index + 1,
          });
        }
      });
    });

    return Array.from(citationsMap.values());
  }, [messages]);

  // Filter citations by search query
  const filteredCitations = useMemo(() => {
    if (!searchQuery.trim()) return allCitations;

    const query = searchQuery.toLowerCase();
    return allCitations.filter(({ citation }) => {
      const searchableText = [
        citation.title,
        citation.subtitle,
        citation.reference,
        citation.snippet,
        citation.authors?.join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [allCitations, searchQuery]);

  if (allCitations.length === 0) {
    return (
      <div className="text-center text-neutral-500 py-8">
        <FileText className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
        <p className="text-sm">No citations yet</p>
        <p className="text-xs mt-1">
          Citations from AI responses will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          type="text"
          placeholder="Search citations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>

      {/* Citation Count */}
      <p className="text-xs text-neutral-500">
        {filteredCitations.length} of {allCitations.length} citations
      </p>

      {/* Citations List */}
      {filteredCitations.length === 0 ? (
        <div className="text-center text-neutral-500 py-4">
          <p className="text-sm">No citations match your search</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCitations.map(({ citation, messageIndex }) => (
            <div
              key={citation.id}
              className="p-3 bg-neutral-50 rounded-lg border border-neutral-200"
            >
              <h4 className="text-sm font-medium text-neutral-900 line-clamp-2">
                {citation.title}
              </h4>
              {citation.subtitle && (
                <p className="text-xs text-neutral-600 mt-1">
                  {citation.subtitle}
                </p>
              )}
              {citation.reference && (
                <p className="text-xs text-neutral-500 mt-1 italic">
                  {citation.reference}
                </p>
              )}
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-neutral-400">
                  Message #{messageIndex}
                </span>
                {citation.url && (
                  <a
                    href={citation.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
                  >
                    View <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ClinicalTab({ conversationId }: { conversationId: string | null }) {
  const { context, isLoading, error, saveContext, deleteContext, hasContext } =
    useClinicalContext(conversationId || undefined);

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    age: "",
    gender: "",
    chiefComplaint: "",
    problems: "",
    medications: "",
    allergies: "",
  });

  // Initialize form when context loads
  useEffect(() => {
    if (context) {
      setFormData({
        age: context.age?.toString() || "",
        gender: context.gender || "",
        chiefComplaint: context.chiefComplaint || "",
        problems: context.problems?.join(", ") || "",
        medications: context.medications?.join(", ") || "",
        allergies: context.allergies?.join(", ") || "",
      });
    }
  }, [context]);

  const handleSave = async () => {
    try {
      await saveContext({
        age: formData.age ? parseInt(formData.age) : undefined,
        gender: formData.gender || undefined,
        chiefComplaint: formData.chiefComplaint || undefined,
        problems: formData.problems
          ? formData.problems
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
        medications: formData.medications
          ? formData.medications
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
        allergies: formData.allergies
          ? formData.allergies
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
      });
      setIsEditing(false);
    } catch {
      // Error handled by hook
    }
  };

  const handleDelete = async () => {
    if (
      window.confirm("Are you sure you want to remove the clinical context?")
    ) {
      try {
        await deleteContext();
      } catch {
        // Error handled by hook
      }
    }
  };

  if (isLoading && !context) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-neutral-500 py-8">
        <AlertCircle className="w-12 h-12 mx-auto mb-3 text-error-400" />
        <p className="text-sm text-error-600">{error}</p>
      </div>
    );
  }

  if (!hasContext && !isEditing) {
    return (
      <div className="text-center text-neutral-500 py-8">
        <Stethoscope className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
        <p className="text-sm">No clinical context</p>
        <p className="text-xs mt-1">Add patient context to enhance responses</p>
        <button
          onClick={() => setIsEditing(true)}
          className="mt-4 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2 mx-auto"
        >
          <Plus className="w-4 h-4" />
          Add Context
        </button>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1">
            Age
          </label>
          <input
            type="number"
            value={formData.age}
            onChange={(e) => setFormData({ ...formData, age: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="e.g., 45"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1">
            Gender
          </label>
          <select
            value={formData.gender}
            onChange={(e) =>
              setFormData({ ...formData, gender: e.target.value })
            }
            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Select...</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1">
            Chief Complaint
          </label>
          <textarea
            value={formData.chiefComplaint}
            onChange={(e) =>
              setFormData({ ...formData, chiefComplaint: e.target.value })
            }
            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            rows={2}
            placeholder="Primary reason for consultation"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1">
            Problems / Diagnoses
          </label>
          <textarea
            value={formData.problems}
            onChange={(e) =>
              setFormData({ ...formData, problems: e.target.value })
            }
            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            rows={2}
            placeholder="Comma-separated list of problems"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1">
            Medications
          </label>
          <input
            type="text"
            value={formData.medications}
            onChange={(e) =>
              setFormData({ ...formData, medications: e.target.value })
            }
            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Comma-separated list"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1">
            Allergies
          </label>
          <input
            type="text"
            value={formData.allergies}
            onChange={(e) =>
              setFormData({ ...formData, allergies: e.target.value })
            }
            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Comma-separated list"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            {isLoading ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => setIsEditing(false)}
            className="px-4 py-2 bg-neutral-100 text-neutral-700 text-sm rounded-lg hover:bg-neutral-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Display existing context
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-neutral-900">
          Patient Context
        </h4>
        <div className="flex gap-2">
          <button
            onClick={() => setIsEditing(true)}
            className="text-xs text-primary-600 hover:text-primary-700"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            className="text-xs text-error-600 hover:text-error-700"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="space-y-3 text-sm">
        {context?.age && (
          <div>
            <span className="text-neutral-500">Age:</span>{" "}
            <span className="text-neutral-900">{context.age}</span>
          </div>
        )}
        {context?.gender && (
          <div>
            <span className="text-neutral-500">Gender:</span>{" "}
            <span className="text-neutral-900 capitalize">
              {context.gender}
            </span>
          </div>
        )}
        {context?.chiefComplaint && (
          <div>
            <span className="text-neutral-500">Chief Complaint:</span>
            <p className="text-neutral-900 mt-1">{context.chiefComplaint}</p>
          </div>
        )}
        {context?.problems && context.problems.length > 0 && (
          <div>
            <span className="text-neutral-500">Problems / Diagnoses:</span>
            <p className="text-neutral-900 mt-1">
              {context.problems.join(", ")}
            </p>
          </div>
        )}
        {context?.medications && context.medications.length > 0 && (
          <div>
            <span className="text-neutral-500">Medications:</span>
            <p className="text-neutral-900 mt-1">
              {context.medications.join(", ")}
            </p>
          </div>
        )}
        {context?.allergies && context.allergies.length > 0 && (
          <div>
            <span className="text-neutral-500">Allergies:</span>
            <p className="text-neutral-900 mt-1">
              {context.allergies.join(", ")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function BranchesTab({ conversationId }: { conversationId: string | null }) {
  const { branches, currentBranchId, isLoading, error, switchBranch } =
    useBranching(conversationId);

  if (isLoading && branches.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-neutral-500 py-8">
        <AlertCircle className="w-12 h-12 mx-auto mb-3 text-error-400" />
        <p className="text-sm text-error-600">{error}</p>
      </div>
    );
  }

  if (branches.length === 0) {
    return (
      <div className="text-center text-neutral-500 py-8">
        <GitBranch className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
        <p className="text-sm">No branches</p>
        <p className="text-xs mt-1">
          Create branches to explore alternative responses
        </p>
        <p className="text-xs mt-3 text-neutral-400">
          Click the branch icon on any message to create a branch from that
          point
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500">
        {branches.length} branch{branches.length === 1 ? "" : "es"}
      </p>

      <div className="space-y-2">
        {/* Main branch */}
        <button
          onClick={() => switchBranch("main")}
          className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
            currentBranchId === "main"
              ? "bg-primary-50 border-primary-200"
              : "bg-neutral-50 border-neutral-200 hover:bg-neutral-100"
          }`}
        >
          <GitBranch
            className={`w-4 h-4 ${
              currentBranchId === "main"
                ? "text-primary-600"
                : "text-neutral-400"
            }`}
          />
          <div className="flex-1 text-left">
            <p
              className={`text-sm font-medium ${
                currentBranchId === "main"
                  ? "text-primary-900"
                  : "text-neutral-900"
              }`}
            >
              Main
            </p>
            <p className="text-xs text-neutral-500">Original conversation</p>
          </div>
          {currentBranchId === "main" && (
            <span className="text-xs text-primary-600 font-medium">Active</span>
          )}
        </button>

        {/* Other branches */}
        {branches.map((branch) => (
          <button
            key={branch.branchId}
            onClick={() => switchBranch(branch.branchId)}
            className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
              currentBranchId === branch.branchId
                ? "bg-primary-50 border-primary-200"
                : "bg-neutral-50 border-neutral-200 hover:bg-neutral-100"
            }`}
          >
            <GitBranch
              className={`w-4 h-4 ${
                currentBranchId === branch.branchId
                  ? "text-primary-600"
                  : "text-neutral-400"
              }`}
            />
            <div className="flex-1 text-left">
              <p
                className={`text-sm font-medium ${
                  currentBranchId === branch.branchId
                    ? "text-primary-900"
                    : "text-neutral-900"
                }`}
              >
                Branch {branch.branchId.slice(0, 8)}
              </p>
              <p className="text-xs text-neutral-500">
                {branch.messageCount} message
                {branch.messageCount === 1 ? "" : "s"} · Created{" "}
                {new Date(branch.createdAt).toLocaleDateString()}
              </p>
            </div>
            <ChevronRight
              className={`w-4 h-4 ${
                currentBranchId === branch.branchId
                  ? "text-primary-600"
                  : "text-neutral-300"
              }`}
            />
          </button>
        ))}
      </div>

      <p className="text-xs text-neutral-400 mt-4">
        Switch between branches to explore different conversation paths
      </p>
    </div>
  );
}

export default CollapsibleContextPane;
