/**
 * Voice Test Page
 * Test and demonstrate voice mode features:
 * - VAD (Voice Activity Detection)
 * - Waveform visualization
 * - Push-to-talk vs. Auto mode
 * - TTS with barge-in
 * - Voice settings
 */

import { useState } from "react";
import { extractErrorMessage } from "@voiceassist/types";
import { VoiceInputEnhanced } from "../components/voice/VoiceInputEnhanced";
import { AudioPlayerEnhanced } from "../components/voice/AudioPlayerEnhanced";
import {
  VoiceSettingsEnhanced,
  useVoiceSettings,
} from "../components/voice/VoiceSettingsEnhanced";
import { ThinkerTalkerVoicePanel } from "../components/voice/ThinkerTalkerVoicePanel";
import { useAuth } from "../hooks/useAuth";

export default function VoiceTestPage() {
  const [transcript, setTranscript] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [synthesisText, setSynthesisText] = useState(
    "Hello! This is a test of the text-to-speech system. How does it sound?",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { apiClient } = useAuth();
  const { settings, getVADConfig } = useVoiceSettings();

  const handleTranscript = (text: string) => {
    setTranscript(text);
    console.log("Transcript received:", text);
  };

  const handleSynthesizeSpeech = async () => {
    if (!synthesisText.trim()) {
      setError("Please enter some text to synthesize");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const blob = await apiClient.synthesizeSpeech(
        synthesisText,
        settings.voiceId,
      );
      setAudioBlob(blob);
    } catch (err: unknown) {
      console.error("Speech synthesis failed:", err);
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleBargeIn = () => {
    console.log("Barge-in triggered!");
    setAudioBlob(null);
  };

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="max-w-5xl mx-auto px-4 space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">
            Voice Mode Test Page
          </h1>
          <p className="text-neutral-600">
            Test voice input, transcription, TTS, and all voice features
          </p>
        </div>

        {/* Status Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-900 mb-2">
            Feature Status:
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <ul className="text-sm text-blue-800 space-y-1">
              <li>✅ Voice Activity Detection (VAD)</li>
              <li>✅ Waveform Visualization</li>
              <li>✅ Push-to-Talk Mode</li>
              <li>✅ OpenAI Whisper Transcription</li>
            </ul>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>✅ OpenAI TTS Synthesis</li>
              <li>✅ Barge-in Support</li>
              <li>✅ Voice Settings Panel</li>
              <li>✅ OpenAI Realtime API (Full-duplex voice)</li>
            </ul>
          </div>
        </div>

        {/* Voice Input Section */}
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6 space-y-4">
          <h2 className="text-xl font-semibold text-neutral-900">
            Voice Input & Transcription
          </h2>
          <p className="text-sm text-neutral-600">
            Use VAD (auto-detect) or push-to-talk mode to record your voice and
            transcribe it.
          </p>

          <VoiceInputEnhanced
            onTranscript={handleTranscript}
            vadConfig={getVADConfig()}
          />

          {transcript && (
            <div className="mt-4 p-4 bg-green-50 rounded-md border border-green-200">
              <h4 className="text-sm font-medium text-green-900 mb-2">
                Latest Transcript:
              </h4>
              <p className="text-sm text-green-800">{transcript}</p>
            </div>
          )}
        </div>

        {/* Text-to-Speech Section */}
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6 space-y-4">
          <h2 className="text-xl font-semibold text-neutral-900">
            Text-to-Speech (TTS)
          </h2>
          <p className="text-sm text-neutral-600">
            Enter text below and click "Synthesize Speech" to hear it spoken
            using your selected voice.
          </p>

          {/* Text Input */}
          <div className="space-y-2">
            <label
              htmlFor="synthesis-text"
              className="block text-sm font-medium text-neutral-700"
            >
              Text to Synthesize:
            </label>
            <textarea
              id="synthesis-text"
              value={synthesisText}
              onChange={(e) => setSynthesisText(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Enter text to convert to speech..."
            />
            <p className="text-xs text-neutral-500">
              Max 4096 characters. Uses voice:{" "}
              <strong>{settings.voiceId}</strong>
            </p>
          </div>

          {/* Synthesize Button */}
          <button
            type="button"
            onClick={handleSynthesizeSpeech}
            disabled={isLoading || !synthesisText.trim()}
            className="w-full px-4 py-3 bg-primary-500 text-white rounded-md hover:bg-primary-600 disabled:bg-neutral-300 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <div className="w-5 h-5 mr-2 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Synthesizing...
              </span>
            ) : (
              "Synthesize Speech"
            )}
          </button>

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-50 rounded-md border border-red-200">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Audio Player */}
          {audioBlob && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-neutral-700 mb-2">
                Generated Audio:
              </h4>
              <AudioPlayerEnhanced
                audioBlob={audioBlob}
                autoPlay={settings.autoPlay}
                playbackSpeed={settings.speed}
                volume={settings.volume}
                allowBargeIn={true}
                onBargeIn={handleBargeIn}
                onPlaybackEnd={() => console.log("Playback ended")}
              />
            </div>
          )}
        </div>

        {/* Realtime Voice Mode Section */}
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6 space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900 mb-2">
              Thinker/Talker Voice Mode
            </h2>
            <p className="text-sm text-neutral-600 mb-4">
              Full-duplex voice conversation with Deepgram STT and ElevenLabs
              TTS. Features tool calling support and lower latency than OpenAI
              Realtime.
            </p>
          </div>
          <ThinkerTalkerVoicePanel
            onUserMessage={(text) => {
              console.log("T/T transcript:", text);
            }}
          />
        </div>

        {/* Voice Settings Section */}
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <VoiceSettingsEnhanced />
        </div>

        {/* Quick Test Scenarios */}
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6 space-y-4">
          <h2 className="text-xl font-semibold text-neutral-900">
            Quick Test Scenarios
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => {
                setSynthesisText(
                  "The quick brown fox jumps over the lazy dog.",
                );
                setTimeout(handleSynthesizeSpeech, 100);
              }}
              className="p-4 bg-neutral-50 rounded-md border border-neutral-200 hover:bg-neutral-100 transition-colors text-left"
            >
              <h4 className="font-medium text-neutral-900 mb-1">
                Test 1: Pangram
              </h4>
              <p className="text-sm text-neutral-600">
                "The quick brown fox jumps over the lazy dog"
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setSynthesisText(
                  "Hello! I am your medical AI assistant. How can I help you today?",
                );
                setTimeout(handleSynthesizeSpeech, 100);
              }}
              className="p-4 bg-neutral-50 rounded-md border border-neutral-200 hover:bg-neutral-100 transition-colors text-left"
            >
              <h4 className="font-medium text-neutral-900 mb-1">
                Test 2: Greeting
              </h4>
              <p className="text-sm text-neutral-600">
                Medical assistant greeting
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setSynthesisText(
                  "Atrial fibrillation is a type of arrhythmia characterized by rapid and irregular beating of the atria.",
                );
                setTimeout(handleSynthesizeSpeech, 100);
              }}
              className="p-4 bg-neutral-50 rounded-md border border-neutral-200 hover:bg-neutral-100 transition-colors text-left"
            >
              <h4 className="font-medium text-neutral-900 mb-1">
                Test 3: Medical Term
              </h4>
              <p className="text-sm text-neutral-600">
                Complex medical terminology
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setSynthesisText(
                  "One, two, three, four, five. Testing numbers: 123, 456, 789. Date: November 24th, 2025.",
                );
                setTimeout(handleSynthesizeSpeech, 100);
              }}
              className="p-4 bg-neutral-50 rounded-md border border-neutral-200 hover:bg-neutral-100 transition-colors text-left"
            >
              <h4 className="font-medium text-neutral-900 mb-1">
                Test 4: Numbers & Dates
              </h4>
              <p className="text-sm text-neutral-600">
                Number and date pronunciation
              </p>
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-yellow-900 mb-2">
            Testing Instructions:
          </h3>
          <ol className="text-sm text-yellow-800 space-y-1 list-decimal list-inside">
            <li>Allow microphone access when prompted</li>
            <li>Try both VAD (auto) and push-to-talk modes</li>
            <li>Test waveform visualization while speaking</li>
            <li>Adjust VAD sensitivity in settings if needed</li>
            <li>Try synthesizing different voices and speeds</li>
            <li>Test barge-in by clicking × during playback</li>
            <li>Verify all features work in your browser</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
