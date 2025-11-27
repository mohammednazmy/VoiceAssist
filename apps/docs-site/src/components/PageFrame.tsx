"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OnThisPage } from "./OnThisPage";
import { getFlattenedNavigation } from "@/lib/navigation";

const flattenedNavigation = getFlattenedNavigation();

function getAdjacentPages(pathname: string) {
  const currentIndex = flattenedNavigation.findIndex((item) => item.href === pathname);

  if (currentIndex === -1) {
    return { previous: null, next: null };
  }

  return {
    previous: flattenedNavigation[currentIndex - 1] || null,
    next: flattenedNavigation[currentIndex + 1] || null,
  };
}

export function PageFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { previous, next } = getAdjacentPages(pathname);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-12">
          {children}

          <div className="border-t border-gray-200 pt-6 dark:border-gray-800">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex flex-1 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3">
                {previous ? (
                  <Link
                    href={previous.href}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition hover:border-primary-500 hover:text-primary-700 dark:border-gray-700 dark:text-gray-200 dark:hover:border-primary-500 dark:hover:text-primary-300 sm:w-auto"
                  >
                    <span aria-hidden>←</span>
                    {previous.title}
                  </Link>
                ) : (
                  <div className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-400 dark:border-gray-800 dark:text-gray-500 sm:w-auto">
                    Beginning of guide
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                {next ? (
                  <Link
                    href={next.href}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition hover:border-primary-500 hover:text-primary-700 dark:border-gray-700 dark:text-gray-200 dark:hover:border-primary-500 dark:hover:text-primary-300 sm:w-auto"
                  >
                    {next.title}
                    <span aria-hidden>→</span>
                  </Link>
                ) : (
                  <div className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-400 dark:border-gray-800 dark:text-gray-500 sm:w-auto">
                    End of guide
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <OnThisPage />
      </div>
    </div>
  );
}
