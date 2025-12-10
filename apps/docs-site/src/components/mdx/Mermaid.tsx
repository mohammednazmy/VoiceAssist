"use client";

import mermaid from "mermaid";
import { useEffect, useMemo, useState } from "react";

interface MermaidProps {
  chart: string;
}

export function Mermaid({ chart }: MermaidProps) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const renderId = useMemo(
    () => `mermaid-${Math.random().toString(36).slice(2)}`,
    [],
  );

  useEffect(() => {
    mermaid.initialize({ startOnLoad: false });

    mermaid
      .render(renderId, chart)
      .then(({ svg }) => {
        setSvg(svg);
        setError("");
      })
      .catch((err) => {
        console.error("Mermaid render failed", err);
        setError("Unable to render diagram");
      });
  }, [chart, renderId]);

  if (error) {
    return (
      <div className="not-prose rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-100">
        {error}
      </div>
    );
  }

  return (
    <div
      className="not-prose overflow-x-auto rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
