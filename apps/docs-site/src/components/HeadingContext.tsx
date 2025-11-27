"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export interface Heading {
  id: string;
  text: string;
  level: number;
}

type HeadingUpdater = Heading[] | ((prev: Heading[]) => Heading[]);

interface HeadingContextValue {
  headings: Heading[];
  setHeadings: (next: HeadingUpdater) => void;
}

const HeadingContext = createContext<HeadingContextValue | undefined>(
  undefined,
);

export function HeadingProvider({ children }: { children: React.ReactNode }) {
  const [headings, internalSetHeadings] = useState<Heading[]>([]);

  const setHeadings = useCallback((next: HeadingUpdater) => {
    internalSetHeadings((prev) =>
      typeof next === "function" ? next(prev) : next,
    );
  }, []);

  const value = useMemo(
    () => ({ headings, setHeadings }),
    [headings, setHeadings],
  );

  return (
    <HeadingContext.Provider value={value}>{children}</HeadingContext.Provider>
  );
}

export function useHeadings() {
  const context = useContext(HeadingContext);

  if (!context) {
    throw new Error("useHeadings must be used within a HeadingProvider");
  }

  return context;
}
