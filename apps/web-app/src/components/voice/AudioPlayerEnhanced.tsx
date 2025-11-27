/**
 * Enhanced Audio Player Component
 * Features:
 * - Barge-in support (interrupt AI speech)
 * - Playback speed control
 * - Volume control
 * - Multiple audio queue management
 * - Visualization during playback
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@voiceassist/ui";

interface AudioPlayerEnhancedProps {
  audioBlob: Blob | null;
  autoPlay?: boolean;
  playbackSpeed?: number;
  volume?: number;
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
  onBargeIn?: () => void;
  /** Allow user to interrupt playback */
  allowBargeIn?: boolean;
}

export function AudioPlayerEnhanced({
  audioBlob,
  autoPlay = false,
  playbackSpeed = 1.0,
  volume = 0.8,
  onPlaybackStart,
  onPlaybackEnd,
  onBargeIn,
  allowBargeIn = true,
}: AudioPlayerEnhancedProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentVolume, setCurrentVolume] = useState(volume);
  const [currentSpeed, setCurrentSpeed] = useState(playbackSpeed);
  const [showControls, setShowControls] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // Create audio element when blob changes
  useEffect(() => {
    if (!audioBlob) {
      // Clean up previous audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    // Revoke previous URL
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
    }

    // Create new audio URL
    const url = URL.createObjectURL(audioBlob);
    audioUrlRef.current = url;

    const audio = new Audio(url);
    audio.volume = currentVolume;
    audio.playbackRate = currentSpeed;

    audio.addEventListener("loadedmetadata", () => {
      setDuration(audio.duration);
    });

    audio.addEventListener("timeupdate", () => {
      setCurrentTime(audio.currentTime);
    });

    audio.addEventListener("ended", () => {
      setIsPlaying(false);
      setCurrentTime(0);
      onPlaybackEnd?.();
    });

    audio.addEventListener("play", () => {
      setIsPlaying(true);
      onPlaybackStart?.();
    });

    audio.addEventListener("pause", () => {
      setIsPlaying(false);
    });

    audioRef.current = audio;

    if (autoPlay) {
      audio.play().catch((err) => {
        console.error("Autoplay failed:", err);
      });
    }

    // Cleanup
    return () => {
      audio.pause();
      URL.revokeObjectURL(url);
    };
  }, [audioBlob]); // Only depend on audioBlob

  // Update audio properties when they change
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = currentVolume;
    }
  }, [currentVolume]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = currentSpeed;
    }
  }, [currentSpeed]);

  const togglePlayback = useCallback(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch((err) => {
        console.error("Playback failed:", err);
      });
    }
  }, [isPlaying]);

  const handleBargeIn = useCallback(() => {
    if (!audioRef.current || !allowBargeIn) return;

    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setIsPlaying(false);
    onBargeIn?.();
  }, [allowBargeIn, onBargeIn]);

  const handleSeek = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!audioRef.current) return;

      const newTime = parseFloat(event.target.value);
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [],
  );

  const handleVolumeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = parseFloat(event.target.value);
      setCurrentVolume(newVolume);
    },
    [],
  );

  const handleSpeedChange = useCallback((newSpeed: number) => {
    setCurrentSpeed(newSpeed);
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getProgress = (): number => {
    if (duration === 0) return 0;
    return (currentTime / duration) * 100;
  };

  if (!audioBlob) {
    return null;
  }

  return (
    <div className="flex flex-col space-y-2 p-3 bg-primary-50 rounded-md border border-primary-200">
      {/* Main Controls Row */}
      <div className="flex items-center space-x-3">
        {/* Play/Pause Button */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={togglePlayback}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="flex-shrink-0"
        >
          {isPlaying ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="currentColor"
              viewBox="0 0 24 24"
              className="w-5 h-5"
            >
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="currentColor"
              viewBox="0 0 24 24"
              className="w-5 h-5"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </Button>

        {/* Progress Bar */}
        <div className="flex-1 flex flex-col space-y-1">
          {/* Progress indicator */}
          <div className="relative h-1 bg-primary-200 rounded-full overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full bg-primary-500 transition-all duration-100"
              style={{ width: `${getProgress()}%` }}
            />
          </div>

          {/* Seekable range input (hidden but functional) */}
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="absolute opacity-0 w-full cursor-pointer"
            aria-label="Audio progress"
            style={{ marginTop: "-4px" }}
          />

          <div className="flex justify-between items-center text-xs text-neutral-600">
            <span>{formatTime(currentTime)}</span>
            {isPlaying && (
              <span className="text-primary-600 font-medium animate-pulse">
                Playing
              </span>
            )}
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Barge-in Button */}
        {allowBargeIn && isPlaying && (
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={handleBargeIn}
            className="flex-shrink-0"
            aria-label="Stop and interrupt"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </Button>
        )}

        {/* Settings Toggle */}
        <button
          type="button"
          onClick={() => setShowControls(!showControls)}
          className="flex-shrink-0 text-primary-600 hover:text-primary-700 focus:outline-none"
          aria-label="Toggle advanced controls"
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
              d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
            />
          </svg>
        </button>
      </div>

      {/* Advanced Controls */}
      {showControls && (
        <div className="pt-2 border-t border-primary-200 space-y-3">
          {/* Volume Control */}
          <div className="flex items-center space-x-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-4 h-4 text-primary-600 flex-shrink-0"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
              />
            </svg>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={currentVolume}
              onChange={handleVolumeChange}
              className="flex-1 h-2 bg-primary-200 rounded-lg appearance-none cursor-pointer accent-primary-500"
              aria-label="Volume"
            />
            <span className="text-xs text-neutral-600 w-12 text-right">
              {Math.round(currentVolume * 100)}%
            </span>
          </div>

          {/* Speed Control */}
          <div className="flex items-center space-x-2">
            <span className="text-xs text-neutral-600 flex-shrink-0">
              Speed:
            </span>
            <div className="flex space-x-1 flex-1">
              {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((speed) => (
                <button
                  key={speed}
                  type="button"
                  onClick={() => handleSpeedChange(speed)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    currentSpeed === speed
                      ? "bg-primary-500 text-white"
                      : "bg-white text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Barge-in Hint */}
      {allowBargeIn && isPlaying && (
        <p className="text-xs text-neutral-500 text-center italic">
          Click the × button to interrupt and speak
        </p>
      )}
    </div>
  );
}
