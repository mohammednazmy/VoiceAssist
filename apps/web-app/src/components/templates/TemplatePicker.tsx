/**
 * TemplatePicker Component
 * Dialog for selecting a template when creating a new conversation
 */

import { useState, useMemo } from "react";
import { Button, Input } from "@voiceassist/ui";
import type { ConversationTemplate } from "@voiceassist/types";

interface TemplatePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (template: ConversationTemplate) => void;
  templates: ConversationTemplate[];
}

export function TemplatePicker({
  isOpen,
  onClose,
  onSelect,
  templates,
}: TemplatePickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(templates.map((t) => t.category || "General"));
    return Array.from(cats).sort();
  }, [templates]);

  // Filter templates
  const filteredTemplates = useMemo(() => {
    let filtered = templates;

    // Filter by category
    if (selectedCategory) {
      filtered = filtered.filter((t) => t.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.description?.toLowerCase().includes(query) ||
          t.category?.toLowerCase().includes(query),
      );
    }

    // Sort by usage count (most used first), then by name
    return filtered.sort((a, b) => {
      if (b.usageCount !== a.usageCount) {
        return b.usageCount - a.usageCount;
      }
      return a.name.localeCompare(b.name);
    });
  }, [templates, selectedCategory, searchQuery]);

  const handleSelect = (template: ConversationTemplate) => {
    onSelect(template);
    setSearchQuery("");
    setSelectedCategory(null);
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-picker-dialog-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200">
          <div>
            <h2
              id="template-picker-dialog-title"
              className="text-lg font-semibold text-neutral-900"
            >
              Choose a Template
            </h2>
            <p className="text-sm text-neutral-600 mt-1">
              Start a new conversation from a saved template
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-neutral-100 rounded transition-colors"
            aria-label="Close dialog"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-5 h-5 text-neutral-500"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Search and Filter */}
        <div className="p-4 border-b border-neutral-200 space-y-3">
          {/* Search */}
          <div className="relative">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            <Input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-full"
            />
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                selectedCategory === null
                  ? "bg-primary-500 text-white"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              }`}
            >
              All
            </button>
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  selectedCategory === category
                    ? "bg-primary-500 text-white"
                    : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Template List */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-neutral-100 flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-8 h-8 text-neutral-400"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-neutral-900 mb-2">
                {searchQuery || selectedCategory
                  ? "No templates found"
                  : "No templates yet"}
              </h3>
              <p className="text-sm text-neutral-600 text-center">
                {searchQuery || selectedCategory
                  ? "Try adjusting your search or filter"
                  : "Save a conversation as a template to get started"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleSelect(template)}
                  className="p-4 border-2 border-neutral-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-all text-left group"
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div
                      className="w-10 h-10 rounded-md flex items-center justify-center text-xl shrink-0"
                      style={{
                        backgroundColor: `${template.color}20`,
                        color: template.color,
                      }}
                    >
                      {template.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-neutral-900 truncate group-hover:text-primary-700">
                        {template.name}
                      </h3>
                      {template.description && (
                        <p className="text-xs text-neutral-600 mt-1 line-clamp-2">
                          {template.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-neutral-500">
                        <span className="px-2 py-0.5 bg-neutral-100 rounded">
                          {template.category}
                        </span>
                        <span>{template.messages.length} messages</span>
                        {template.usageCount > 0 && (
                          <span>Used {template.usageCount}x</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-4 border-t border-neutral-200">
          <p className="text-sm text-neutral-600">
            {filteredTemplates.length}{" "}
            {filteredTemplates.length === 1 ? "template" : "templates"}
          </p>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
