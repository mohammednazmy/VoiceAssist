import { ChangeEvent } from "react";

export type Timeframe = "1h" | "6h" | "12h" | "24h" | "7d";

export type LogLevel = "all" | "debug" | "info" | "warn" | "error";

export interface LogFiltersState {
  timeframe: Timeframe;
  search: string;
  level: LogLevel;
  service: string;
}

interface LogFiltersProps {
  value: LogFiltersState;
  onChange: (next: LogFiltersState) => void;
}

const timeframeOptions: Array<{ label: string; value: Timeframe }> = [
  { label: "1h", value: "1h" },
  { label: "6h", value: "6h" },
  { label: "12h", value: "12h" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
];

const levels: Array<{ label: string; value: LogLevel }> = [
  { label: "All", value: "all" },
  { label: "Debug", value: "debug" },
  { label: "Info", value: "info" },
  { label: "Warn", value: "warn" },
  { label: "Error", value: "error" },
];

export function LogFilters({ value, onChange }: LogFiltersProps) {
  const updateField = <K extends keyof LogFiltersState>(
    field: K,
    nextValue: LogFiltersState[K],
  ) => {
    onChange({ ...value, [field]: nextValue } as LogFiltersState);
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateField("search", event.target.value);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-md p-1">
        {timeframeOptions.map((option) => {
          const active = value.timeframe === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => updateField("timeframe", option.value)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                active
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <select
        value={value.level}
        onChange={(event) =>
          updateField("level", event.target.value as LogFiltersState["level"])
        }
        className="px-3 py-2 rounded-md bg-slate-900/60 border border-slate-800 text-sm text-slate-200"
      >
        {levels.map((level) => (
          <option key={level.value} value={level.value}>
            {level.label}
          </option>
        ))}
      </select>

      <input
        type="text"
        value={value.service}
        onChange={(event) => updateField("service", event.target.value)}
        placeholder="Service (e.g. api, worker)"
        className="px-3 py-2 rounded-md bg-slate-900/60 border border-slate-800 text-sm text-slate-200 placeholder:text-slate-500"
      />

      <div className="flex-1 min-w-[240px]">
        <input
          type="search"
          value={value.search}
          onChange={handleSearchChange}
          placeholder="Search logs"
          className="w-full px-3 py-2 rounded-md bg-slate-900/60 border border-slate-800 text-sm text-slate-200 placeholder:text-slate-500"
        />
      </div>
    </div>
  );
}
