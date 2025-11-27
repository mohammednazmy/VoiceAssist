"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface TabsContextValue {
  activeIndex: number;
  setActiveIndex: (index: number) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

export function Tabs({ children, defaultIndex = 0 }: { children: ReactNode; defaultIndex?: number }) {
  const [activeIndex, setActiveIndex] = useState(defaultIndex);
  const value = useMemo(() => ({ activeIndex, setActiveIndex }), [activeIndex]);

  return (
    <TabsContext.Provider value={value}>
      <div className="not-prose w-full rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export function TabList({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
      {children}
    </div>
  );
}

export function Tab({ children, index }: { children: ReactNode; index: number }) {
  const ctx = useContext(TabsContext);
  if (!ctx) return null;

  const isActive = ctx.activeIndex === index;

  return (
    <button
      type="button"
      onClick={() => ctx.setActiveIndex(index)}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary-500 dark:focus:ring-offset-slate-900 ${
        isActive
          ? "bg-primary-600 text-white shadow-sm"
          : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

export function TabPanels({ children }: { children: ReactNode }) {
  return <div className="p-4 text-sm text-slate-700 dark:text-slate-200">{children}</div>;
}

export function TabPanel({ children, index }: { children: ReactNode; index: number }) {
  const ctx = useContext(TabsContext);
  if (!ctx || ctx.activeIndex !== index) return null;

  return (
    <div className="prose prose-slate max-w-none dark:prose-invert">
      {children}
    </div>
  );
}
