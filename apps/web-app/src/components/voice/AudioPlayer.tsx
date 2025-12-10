/**
 * Audio Player Component
 * Plays synthesized speech with controls
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@voiceassist/ui";

interface AudioPlayerProps {
  audioBlob: Blob | null;
  autoPlay?: boolean;
  onPlaybackEnd?: () => void;
}

export function AudioPlayer({
  audioBlob,
  autoPlay = false,
  onPlaybackEnd,
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
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
    // Explicitly set src to ensure metadata/loading fires in tests and browsers
    audio.src = url;

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
  }, [audioBlob, autoPlay, onPlaybackEnd]);

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

  const handleSeek = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!audioRef.current) return;

      const newTime = parseFloat(event.target.value);
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [],
  );

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!audioBlob) {
    return null;
  }

  return (
    <div className="flex items-center space-x-3 p-3 bg-primary-50 rounded-md border border-primary-200">
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
        <input
          type="range"
          min="0"
          max={duration || 0}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-2 bg-primary-200 rounded-lg appearance-none cursor-pointer accent-primary-500"
          aria-label="Audio progress"
        />
        <div className="flex justify-between text-xs text-neutral-600">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Volume Icon */}
      <div className="flex-shrink-0 text-primary-600">
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
            d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
          />
        </svg>
      </div>
    </div>
  );
}
