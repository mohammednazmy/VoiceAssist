"use client";

import Fuse from "fuse.js";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { SearchDocument } from "@/lib/search";

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

const fuseOptions: Fuse.IFuseOptions<SearchDocument> = {
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 2,
  keys: [
    { name: "heading", weight: 0.5 },
    { name: "docTitle", weight: 0.35 },
    { name: "snippet", weight: 0.15 },
  ],
  threshold: 0.35,
};

export function SearchModal({ open, onClose }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [documents, setDocuments] = useState<SearchDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && documents.length === 0 && !isLoading) {
      setIsLoading(true);
      fetch("/search-index.json")
        .then((res) => res.json())
        .then((payload) => setDocuments(payload.docs || []))
        .catch(() =>
          setError(
            "Search index unavailable. Run the search index build step and retry.",
          ),
        )
        .finally(() => setIsLoading(false));
    }
  }, [documents.length, isLoading, open]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  const fuse = useMemo(() => {
    if (!documents.length) return null;
    return new Fuse(documents, fuseOptions);
  }, [documents]);

  const results = useMemo(() => {
    if (!documents.length) return [];
    if (!query.trim()) {
      return documents.slice(0, 20).map((item) => ({ item }));
    }

    if (!fuse) return [];
    return fuse.search(query, { limit: 20 });
  }, [documents, fuse, query]);

  const highlightText = (
    text: string,
    matches: Fuse.FuseResultMatch[] | undefined,
    key: string,
  ) => {
    const match = matches?.find((m) => m.key === key);
    if (!match || match.indices.length === 0) return text;

    const segments: (string | JSX.Element)[] = [];
    let lastIndex = 0;

    match.indices.forEach(([start, end], idx) => {
      if (start > lastIndex) {
        segments.push(text.slice(lastIndex, start));
      }
      segments.push(
        <mark key={`${key}-${idx}`}>{text.slice(start, end + 1)}</mark>,
      );
      lastIndex = end + 1;
    });

    if (lastIndex < text.length) {
      segments.push(text.slice(lastIndex));
    }

    return <>{segments}</>;
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5 text-gray-500"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search docs (Cmd/Ctrl + K)"
            className="w-full bg-transparent outline-none text-base text-gray-900 dark:text-white placeholder:text-gray-500"
          />
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="hidden sm:inline">Press Esc to close</span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Close search"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18 18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4 space-y-3">
          {isLoading && (
            <div className="text-sm text-gray-600 dark:text-gray-300">
              Building search index...
            </div>
          )}

          {error && (
            <div
              className="text-sm text-red-600 dark:text-red-400"
              role="alert"
            >
              {error}
            </div>
          )}

          {!isLoading && !error && results.length === 0 && (
            <div className="text-sm text-gray-600 dark:text-gray-300">
              No results yet. Try a different search term.
            </div>
          )}

          {!isLoading &&
            !error &&
            results.map((result) => {
              const { item, matches } =
                result as Fuse.FuseResult<SearchDocument>;

              return (
                <Link
                  key={item.id}
                  href={item.url}
                  className="block rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-primary-500 dark:hover:border-primary-400 p-4 transition-colors"
                  onClick={onClose}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        {highlightText(item.heading, matches, "heading")}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {highlightText(item.docTitle, matches, "docTitle")}
                      </div>
                    </div>
                    <span className="text-xs text-primary-600 dark:text-primary-400">
                      Jump to section →
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
                    {highlightText(item.snippet, matches, "snippet")}
                  </p>
                </Link>
              );
            })}
        </div>
      </div>
    </div>
  );
}
