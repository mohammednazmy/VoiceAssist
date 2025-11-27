/**
 * Enhanced Voice Input Component
 * Features:
 * - Voice Activity Detection (VAD)
 * - Waveform visualization
 * - Push-to-talk mode toggle
 * - Microphone permission handling
 * - Real-time energy visualization
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@voiceassist/ui";
import { useAuth } from "../../hooks/useAuth";
import {
  VoiceActivityDetector,
  testMicrophoneAccess,
  isGetUserMediaSupported,
  getOptimalAudioConstraints,
  type VADConfig,
} from "../../utils/vad";
import { WaveformVisualizer } from "../../utils/waveform";

interface VoiceInputEnhancedProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  /** Use push-to-talk instead of VAD */
  pushToTalk?: boolean;
  /** Custom VAD configuration */
  vadConfig?: Partial<VADConfig>;
}

type RecordingState = "idle" | "recording" | "processing";
type MicrophoneState =
  | "unknown"
  | "checking"
  | "granted"
  | "denied"
  | "unavailable";

export function VoiceInputEnhanced({
  onTranscript,
  disabled,
  pushToTalk = false,
  vadConfig,
}: VoiceInputEnhancedProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [microphoneState, setMicrophoneState] =
    useState<MicrophoneState>("unknown");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [energy, setEnergy] = useState(0);
  const [mode, setMode] = useState<"vad" | "push-to-talk">(
    pushToTalk ? "push-to-talk" : "vad",
  );

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const vadRef = useRef<VoiceActivityDetector | null>(null);
  const waveformRef = useRef<WaveformVisualizer | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { apiClient } = useAuth();

  // Check microphone permission on mount
  useEffect(() => {
    checkMicrophonePermission();
  }, []);

  const checkMicrophonePermission = useCallback(async () => {
    if (!isGetUserMediaSupported()) {
      setMicrophoneState("unavailable");
      setError("Your browser does not support microphone access");
      return;
    }

    setMicrophoneState("checking");

    const result = await testMicrophoneAccess();

    if (result.hasPermission) {
      setMicrophoneState("granted");
      setError(null);
    } else {
      setMicrophoneState("denied");
      setError(result.errorMessage || "Microphone access denied");
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);

      // Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: getOptimalAudioConstraints(),
      });

      streamRef.current = stream;

      // Setup waveform visualization
      if (canvasRef.current && !waveformRef.current) {
        waveformRef.current = new WaveformVisualizer(canvasRef.current, {
          width: canvasRef.current.width,
          height: canvasRef.current.height,
          color: "#3b82f6",
        });
        await waveformRef.current.connect(stream);
      } else if (waveformRef.current) {
        await waveformRef.current.connect(stream);
      }

      // Setup MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });

        // Clean up stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        // Send to backend for transcription
        setRecordingState("processing");
        try {
          const text = await apiClient.transcribeAudio(audioBlob);
          setTranscript(text);
          onTranscript(text);
          setRecordingState("idle");
        } catch (err: any) {
          console.error("Transcription failed:", err);
          setError("Failed to transcribe audio");
          setRecordingState("idle");
        }
      };

      // Start recording
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setRecordingState("recording");

      // Setup VAD if in VAD mode
      if (mode === "vad") {
        vadRef.current = new VoiceActivityDetector(vadConfig);
        await vadRef.current.connect(stream);

        vadRef.current.on("speechStart", () => {
          setIsSpeaking(true);
        });

        vadRef.current.on("speechEnd", () => {
          setIsSpeaking(false);
          // Auto-stop recording when speech ends
          stopRecording();
        });

        vadRef.current.on("energyChange", (newEnergy: number) => {
          setEnergy(newEnergy);
        });
      }
    } catch (err: any) {
      console.error("Failed to start recording:", err);
      setError("Microphone access denied or unavailable");
      setRecordingState("idle");
      setMicrophoneState("denied");
    }
  }, [apiClient, onTranscript, mode, vadConfig]);

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }

    // Cleanup VAD
    if (vadRef.current) {
      vadRef.current.disconnect();
      vadRef.current = null;
    }

    // Cleanup waveform
    if (waveformRef.current) {
      waveformRef.current.disconnect();
      waveformRef.current = null;
    }

    setIsSpeaking(false);
    setEnergy(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording"
      ) {
        mediaRecorderRef.current.stop();
      }
      if (vadRef.current) {
        vadRef.current.disconnect();
      }
      if (waveformRef.current) {
        waveformRef.current.disconnect();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const isRecording = recordingState === "recording";
  const isProcessing = recordingState === "processing";
  const canRecord = microphoneState === "granted" && !disabled && !isProcessing;

  // Render microphone permission error
  if (microphoneState === "denied" || microphoneState === "unavailable") {
    return (
      <div className="flex flex-col space-y-3">
        <div className="p-4 bg-red-50 rounded-md border border-red-200">
          <div className="flex items-start space-x-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-6 h-6 text-red-600 flex-shrink-0"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-red-900">
                Microphone Access Required
              </h4>
              <p className="text-sm text-red-700 mt-1">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={checkMicrophonePermission}
                className="mt-3"
              >
                Retry
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-3">
      {/* Mode Toggle */}
      <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-md border border-neutral-200">
        <span className="text-sm font-medium text-neutral-700">
          Voice Input Mode
        </span>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setMode("vad")}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              mode === "vad"
                ? "bg-primary-500 text-white"
                : "bg-white text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            Auto (VAD)
          </button>
          <button
            type="button"
            onClick={() => setMode("push-to-talk")}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              mode === "push-to-talk"
                ? "bg-primary-500 text-white"
                : "bg-white text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            Push-to-Talk
          </button>
        </div>
      </div>

      {/* Waveform Visualization */}
      <div className="p-3 bg-white rounded-md border border-neutral-200">
        <canvas
          ref={canvasRef}
          width={600}
          height={100}
          className="w-full h-24 rounded"
          style={{ maxWidth: "100%", height: "auto" }}
        />
        {/* Energy indicator */}
        {isRecording && (
          <div className="mt-2 flex items-center space-x-2">
            <span className="text-xs text-neutral-600">Energy:</span>
            <div className="flex-1 h-2 bg-neutral-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-100 ${
                  isSpeaking ? "bg-green-500" : "bg-neutral-400"
                }`}
                style={{ width: `${Math.min(energy * 100 * 5, 100)}%` }}
              />
            </div>
            {isSpeaking && (
              <span className="text-xs font-medium text-green-600">
                Speaking
              </span>
            )}
          </div>
        )}
      </div>

      {/* Voice Input Button */}
      <div className="flex items-center space-x-3">
        {mode === "push-to-talk" ? (
          <Button
            type="button"
            variant={isRecording ? "danger" : "primary"}
            size="lg"
            disabled={!canRecord}
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            className="flex-1"
            aria-label={
              isRecording ? "Recording... Release to stop" : "Hold to record"
            }
          >
            {isProcessing ? (
              <>
                <div className="w-5 h-5 mr-2 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Processing...
              </>
            ) : isRecording ? (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  className="w-5 h-5 mr-2 animate-pulse"
                >
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
                Recording... (Release to stop)
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-5 h-5 mr-2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                  />
                </svg>
                Hold to Record
              </>
            )}
          </Button>
        ) : (
          <Button
            type="button"
            variant={isRecording ? "danger" : "primary"}
            size="lg"
            disabled={!canRecord}
            onClick={isRecording ? stopRecording : startRecording}
            className="flex-1"
            aria-label={isRecording ? "Stop recording" : "Start recording"}
          >
            {isProcessing ? (
              <>
                <div className="w-5 h-5 mr-2 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Processing...
              </>
            ) : isRecording ? (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  className="w-5 h-5 mr-2 animate-pulse"
                >
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                Stop Recording
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  className="w-5 h-5 mr-2"
                >
                  <circle cx="12" cy="12" r="8" />
                </svg>
                Start Recording (Auto-detect)
              </>
            )}
          </Button>
        )}
      </div>

      {/* Transcript Display */}
      {transcript && (
        <div className="p-3 bg-neutral-100 rounded-md border border-neutral-200">
          <p className="text-sm text-neutral-600 font-medium mb-1">
            Transcript:
          </p>
          <p className="text-sm text-neutral-900">{transcript}</p>
        </div>
      )}

      {/* Error Display - only show for non-microphone-permission errors */}
      {error && (
          <div className="p-3 bg-red-50 rounded-md border border-red-200 flex items-start space-x-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5 text-red-600 flex-shrink-0"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-red-800 font-medium">Error</p>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-700 focus:outline-none"
              aria-label="Dismiss error"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}

      {/* Instructions */}
      <p className="text-xs text-neutral-500 text-center">
        {mode === "vad"
          ? "Start recording and speak. Recording will automatically stop after you finish speaking."
          : "Press and hold to record your voice. Release to send for transcription."}
      </p>
    </div>
  );
}
