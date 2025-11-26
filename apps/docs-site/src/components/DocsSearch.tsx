"use client";

/**
 * DocsSearch Component
 * Client-side searchable docs index
 */

import { useState, useMemo } from "react";
import Link from "next/link";

export interface DocItem {
  name: string;
  path: string;
  category: string;
}

export interface DocsSearchProps {
  docs: DocItem[];
}

// Map category to URL path and color
const categoryConfig: Record<
  string,
  { path: string; color: string; bg: string }
> = {
  General: {
    path: "/overview",
    color: "text-blue-700 dark:text-blue-300",
    bg: "bg-blue-100 dark:bg-blue-900/30",
  },
  "Client Implementation": {
    path: "/frontend",
    color: "text-green-700 dark:text-green-300",
    bg: "bg-green-100 dark:bg-green-900/30",
  },
  Architecture: {
    path: "/architecture",
    color: "text-purple-700 dark:text-purple-300",
    bg: "bg-purple-100 dark:bg-purple-900/30",
  },
  Operations: {
    path: "/operations",
    color: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-100 dark:bg-amber-900/30",
  },
  Testing: {
    path: "/reference",
    color: "text-cyan-700 dark:text-cyan-300",
    bg: "bg-cyan-100 dark:bg-cyan-900/30",
  },
  Infrastructure: {
    path: "/operations",
    color: "text-rose-700 dark:text-rose-300",
    bg: "bg-rose-100 dark:bg-rose-900/30",
  },
  Voice: {
    path: "/backend",
    color: "text-indigo-700 dark:text-indigo-300",
    bg: "bg-indigo-100 dark:bg-indigo-900/30",
  },
  Overview: {
    path: "/overview",
    color: "text-teal-700 dark:text-teal-300",
    bg: "bg-teal-100 dark:bg-teal-900/30",
  },
};

export function DocsSearch({ docs }: DocsSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(docs.map((d) => d.category));
    return Array.from(cats).sort();
  }, [docs]);

  // Filter docs based on search and category
  const filteredDocs = useMemo(() => {
    return docs.filter((doc) => {
      const matchesSearch =
        searchQuery === "" ||
        doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.path.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        selectedCategory === null || doc.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [docs, searchQuery, selectedCategory]);

  // Group by category
  const groupedDocs = useMemo(() => {
    const groups: Record<string, DocItem[]> = {};
    filteredDocs.forEach((doc) => {
      if (!groups[doc.category]) {
        groups[doc.category] = [];
      }
      groups[doc.category].push(doc);
    });
    return groups;
  }, [filteredDocs]);

  return (
    <div className="space-y-6">
      {/* Search Input */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search documentation..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-4 h-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18 18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Category Filters */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedCategory(null)}
          className={`px-3 py-1 text-sm rounded-full transition-colors ${
            selectedCategory === null
              ? "bg-blue-600 text-white"
              : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          All ({docs.length})
        </button>
        {categories.map((cat) => {
          const count = docs.filter((d) => d.category === cat).length;
          return (
            <button
              key={cat}
              type="button"
              onClick={() =>
                setSelectedCategory(selectedCategory === cat ? null : cat)
              }
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                selectedCategory === cat
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {/* Results Count */}
      <div className="text-sm text-gray-600 dark:text-gray-400">
        {filteredDocs.length} document{filteredDocs.length !== 1 ? "s" : ""}{" "}
        found
        {searchQuery && ` for "${searchQuery}"`}
      </div>

      {/* Results */}
      {Object.entries(groupedDocs).length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500 dark:text-gray-400">
            No documents found matching your criteria.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSelectedCategory(null);
            }}
            className="mt-2 text-blue-600 dark:text-blue-400 hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedDocs).map(([category, categoryDocs]) => {
            const config = categoryConfig[category] || {
              path: "/overview",
              color: "text-gray-700 dark:text-gray-300",
              bg: "bg-gray-100 dark:bg-gray-800",
            };
            return (
              <div key={category}>
                <h3
                  className={`font-semibold text-lg mb-3 ${config.color.split(" ")[0]}`}
                >
                  {category}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {categoryDocs.map((doc) => (
                    <Link
                      key={doc.path}
                      href={`${config.path}/${doc.name.toLowerCase().replace(/ /g, "-")}`}
                      className={`block p-3 rounded-lg ${config.bg} hover:opacity-80 transition-opacity`}
                    >
                      <span
                        className={`text-sm font-medium ${config.color}`}
                        title={doc.path}
                      >
                        {doc.name}
                      </span>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono truncate">
                        {doc.path}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
