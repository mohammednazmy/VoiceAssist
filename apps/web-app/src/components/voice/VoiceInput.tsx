/**
 * Voice Input Component
 * Push-to-talk voice input with real-time transcription
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@voiceassist/ui';
import { useAuth } from '../../hooks/useAuth';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

type RecordingState = 'idle' | 'recording' | 'processing';

export function VoiceInput({ onTranscript, disabled }: VoiceInputProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const { apiClient } = useAuth();

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());

        // Send to backend for transcription
        setRecordingState('processing');
        try {
          const text = await apiClient.transcribeAudio(audioBlob);
          setTranscript(text);
          onTranscript(text);
          setRecordingState('idle');
        } catch (err: any) {
          console.error('Transcription failed:', err);
          setError('Failed to transcribe audio');
          setRecordingState('idle');
        }
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setRecordingState('recording');
    } catch (err: any) {
      console.error('Failed to start recording:', err);
      setError('Microphone access denied or unavailable');
      setRecordingState('idle');
    }
  }, [apiClient, onTranscript]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const isRecording = recordingState === 'recording';
  const isProcessing = recordingState === 'processing';

  return (
    <div className="flex flex-col space-y-3">
      {/* Voice Input Button */}
      <div className="flex items-center space-x-3">
        <Button
          type="button"
          variant={isRecording ? 'destructive' : 'primary'}
          size="lg"
          disabled={disabled || isProcessing}
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onTouchStart={startRecording}
          onTouchEnd={stopRecording}
          className="flex-1"
          aria-label={isRecording ? 'Recording... Release to stop' : 'Hold to record'}
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
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
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
      </div>

      {/* Transcript Display */}
      {transcript && (
        <div className="p-3 bg-neutral-100 rounded-md border border-neutral-200">
          <p className="text-sm text-neutral-600 font-medium mb-1">Transcript:</p>
          <p className="text-sm text-neutral-900">{transcript}</p>
        </div>
      )}

      {/* Error Display */}
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Instructions */}
      <p className="text-xs text-neutral-500 text-center">
        Press and hold to record your voice. Release to send for transcription.
      </p>
    </div>
  );
}
