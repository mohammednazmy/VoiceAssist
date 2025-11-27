/**
 * Playback Speed Control Component
 * Allows users to adjust AI response audio playback speed
 *
 * Phase 9.3: Enhanced Voice Features
 */

import { useState } from "react";

export type PlaybackSpeed = 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2;

interface PlaybackSpeedControlProps {
  /** Current playback speed */
  speed: PlaybackSpeed;
  /** Called when speed changes */
  onSpeedChange: (speed: PlaybackSpeed) => void;
  /** Whether control is disabled */
  disabled?: boolean;
  /** Display variant */
  variant?: "buttons" | "dropdown" | "slider";
  /** Custom class name */
  className?: string;
}

const SPEED_OPTIONS: PlaybackSpeed[] = [0.5, 0.75, 1, 1.25, 1.5, 2];

const SPEED_LABELS: Record<PlaybackSpeed, string> = {
  0.5: "0.5x",
  0.75: "0.75x",
  1: "1x",
  1.25: "1.25x",
  1.5: "1.5x",
  2: "2x",
};

export function PlaybackSpeedControl({
  speed,
  onSpeedChange,
  disabled = false,
  variant = "buttons",
  className = "",
}: PlaybackSpeedControlProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Button variant
  if (variant === "buttons") {
    return (
      <div className={`flex items-center space-x-1 ${className}`}>
        <span className="text-xs font-medium text-neutral-600 mr-2">
          Speed:
        </span>
        {SPEED_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSpeedChange(s)}
            disabled={disabled}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
              speed === s
                ? "bg-primary-500 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {SPEED_LABELS[s]}
          </button>
        ))}
      </div>
    );
  }

  // Dropdown variant
  if (variant === "dropdown") {
    return (
      <div className={`relative ${className}`}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          className="flex items-center space-x-2 px-3 py-2 text-sm bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-4 h-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062A1.125 1.125 0 013 16.81V8.688zM12.75 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062a1.125 1.125 0 01-1.683-.977V8.688z"
            />
          </svg>
          <span>{SPEED_LABELS[speed]}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 8.25l-7.5 7.5-7.5-7.5"
            />
          </svg>
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute right-0 mt-1 w-32 py-1 bg-white border border-neutral-200 rounded-md shadow-lg z-50">
              {SPEED_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    onSpeedChange(s);
                    setIsOpen(false);
                  }}
                  className={`block w-full px-4 py-2 text-sm text-left hover:bg-neutral-100 ${
                    speed === s
                      ? "bg-primary-50 text-primary-700 font-medium"
                      : "text-neutral-700"
                  }`}
                >
                  {SPEED_LABELS[s]}
                  {s === 1 && (
                    <span className="ml-2 text-xs text-neutral-400">
                      (Normal)
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // Slider variant
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <label
          htmlFor="playback-speed-slider"
          className="text-sm font-medium text-neutral-700"
        >
          Playback Speed
        </label>
        <span className="text-sm font-semibold text-primary-600">
          {SPEED_LABELS[speed]}
        </span>
      </div>
      <input
        id="playback-speed-slider"
        type="range"
        min={0}
        max={SPEED_OPTIONS.length - 1}
        step={1}
        value={SPEED_OPTIONS.indexOf(speed)}
        onChange={(e) =>
          onSpeedChange(SPEED_OPTIONS[parseInt(e.target.value, 10)])
        }
        disabled={disabled}
        className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <div className="flex justify-between text-xs text-neutral-400">
        <span>0.5x</span>
        <span>2x</span>
      </div>
    </div>
  );
}
