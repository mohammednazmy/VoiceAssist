"use client";

import Link from "next/link";
import { useHeadings } from "./HeadingContext";

export function OnThisPage() {
  const { headings } = useHeadings();
  const filtered = headings.filter((heading) => heading.level <= 3);

  if (filtered.length === 0) {
    return null;
  }

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-24 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">On this page</h2>
        <nav className="mt-3 space-y-2 text-sm">
          {filtered.map((heading) => (
            <Link
              key={heading.id}
              href={`#${heading.id}`}
              className={`block rounded px-2 py-1 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-white ${
                heading.level === 2 ? "font-medium text-gray-700 dark:text-gray-300" : "text-gray-600 dark:text-gray-400 ml-3"
              }`}
            >
              {heading.text}
            </Link>
          ))}
        </nav>
      </div>
    </aside>
  );
}
