/**
 * useOfflineVoiceCapture Hook
 *
 * Provides offline voice recording capability with local storage.
 * When the user is offline or has enabled offline mode, voice recordings
 * are stored locally and can be uploaded when back online.
 *
 * Features:
 * - MediaRecorder API for audio capture
 * - IndexedDB storage for offline recordings
 * - Automatic sync when online
 * - Progress tracking
 *
 * @module hooks/useOfflineVoiceCapture
 */

import { useState, useCallback, useRef, useEffect } from "react";

// ============================================================================
// Types
// ============================================================================

export interface OfflineRecording {
  id: string;
  conversationId: string;
  audioBlob: Blob;
  mimeType: string;
  duration: number; // seconds
  createdAt: Date;
  status: "pending" | "uploading" | "uploaded" | "failed";
  retryCount: number;
}

/** API client interface for voice operations */
export interface VoiceApiClient {
  transcribeAudio: (audio: Blob, filename?: string) => Promise<string>;
}

/** Maximum retry attempts for failed uploads */
const MAX_UPLOAD_RETRIES = 3;

export interface UseOfflineVoiceCaptureOptions {
  /** Conversation ID to associate recordings with */
  conversationId: string;
  /** API client for uploading recordings (required for sync functionality) */
  apiClient?: VoiceApiClient;
  /** Enable offline mode even when online */
  forceOffline?: boolean;
  /** Callback when a recording is ready */
  onRecordingComplete?: (recording: OfflineRecording) => void;
  /** Callback when a recording is uploaded with transcribed text */
  onUploadComplete?: (
    recording: OfflineRecording,
    transcribedText: string,
  ) => void;
  /** Callback for errors */
  onError?: (error: Error) => void;
}

export interface UseOfflineVoiceCaptureReturn {
  /** Whether currently recording */
  isRecording: boolean;
  /** Whether in offline mode */
  isOfflineMode: boolean;
  /** Current recording duration in seconds */
  recordingDuration: number;
  /** Pending recordings count */
  pendingCount: number;
  /** Start recording */
  startRecording: () => Promise<void>;
  /** Stop recording */
  stopRecording: () => Promise<OfflineRecording | null>;
  /** Cancel current recording */
  cancelRecording: () => void;
  /** Upload all pending recordings */
  syncPendingRecordings: () => Promise<void>;
  /** Get all pending recordings */
  getPendingRecordings: () => Promise<OfflineRecording[]>;
  /** Delete a recording */
  deleteRecording: (id: string) => Promise<void>;
  /** Toggle offline mode */
  setOfflineMode: (enabled: boolean) => void;
}

// ============================================================================
// IndexedDB Helpers
// ============================================================================

const DB_NAME = "voiceassist-offline";
const DB_VERSION = 1;
const STORE_NAME = "recordings";

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("conversationId", "conversationId", {
          unique: false,
        });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
  });
}

async function saveRecording(recording: OfflineRecording): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(recording);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function getRecordingsByConversation(
  conversationId: string,
): Promise<OfflineRecording[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("conversationId");
    const request = index.getAll(conversationId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function getPendingRecordings(): Promise<OfflineRecording[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("status");
    const request = index.getAll("pending");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function deleteRecordingFromDB(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useOfflineVoiceCapture({
  conversationId,
  apiClient,
  forceOffline = false,
  onRecordingComplete,
  onUploadComplete,
  onError,
}: UseOfflineVoiceCaptureOptions): UseOfflineVoiceCaptureReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(forceOffline);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update pending count
  const updatePendingCount = useCallback(async () => {
    try {
      const pending = await getPendingRecordings();
      setPendingCount(pending.length);
    } catch (error) {
      console.error("Failed to get pending count:", error);
    }
  }, []);

  // Initialize pending count
  useEffect(() => {
    updatePendingCount();
  }, [updatePendingCount]);

  // Reference to syncPendingRecordings for use in online event handler
  // Initialized to null, will be set in effect after syncPendingRecordings is defined
  const syncPendingRecordingsRef = useRef<(() => Promise<void>) | null>(null);

  // Check online status and auto-sync when coming back online
  useEffect(() => {
    const handleOnline = () => {
      if (!forceOffline) {
        setIsOfflineMode(false);
        // Auto-sync when coming back online
        console.log("[OfflineVoice] Back online, triggering auto-sync");
        syncPendingRecordingsRef.current?.();
      }
    };

    const handleOffline = () => {
      setIsOfflineMode(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Set initial state
    if (!navigator.onLine) {
      setIsOfflineMode(true);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [forceOffline]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      startTimeRef.current = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = (_event) => {
        onError?.(new Error("MediaRecorder error"));
        setIsRecording(false);
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setRecordingDuration(0);

      // Update duration every second
      durationIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setRecordingDuration(elapsed);
      }, 1000);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }, [onError]);

  const stopRecording =
    useCallback(async (): Promise<OfflineRecording | null> => {
      return new Promise((resolve) => {
        const mediaRecorder = mediaRecorderRef.current;
        if (!mediaRecorder || mediaRecorder.state === "inactive") {
          resolve(null);
          return;
        }

        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }

        mediaRecorder.onstop = async () => {
          try {
            const audioBlob = new Blob(chunksRef.current, {
              type: mediaRecorder.mimeType,
            });
            const duration = Math.floor(
              (Date.now() - startTimeRef.current) / 1000,
            );

            const recording: OfflineRecording = {
              id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              conversationId,
              audioBlob,
              mimeType: mediaRecorder.mimeType,
              duration,
              createdAt: new Date(),
              status: "pending",
              retryCount: 0,
            };

            await saveRecording(recording);
            await updatePendingCount();

            setIsRecording(false);
            setRecordingDuration(0);

            // Stop all tracks
            mediaRecorder.stream.getTracks().forEach((track) => track.stop());

            onRecordingComplete?.(recording);
            resolve(recording);
          } catch (error) {
            onError?.(
              error instanceof Error ? error : new Error(String(error)),
            );
            resolve(null);
          }
        };

        mediaRecorder.stop();
      });
    }, [conversationId, onRecordingComplete, onError, updatePendingCount]);

  const cancelRecording = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current;
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    }

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    setIsRecording(false);
    setRecordingDuration(0);
    chunksRef.current = [];
  }, []);

  const syncPendingRecordings = useCallback(async () => {
    // Check if apiClient is available
    if (!apiClient) {
      console.warn(
        "[OfflineVoice] Cannot sync recordings: apiClient not provided",
      );
      return;
    }

    // Check if we're online
    if (!navigator.onLine) {
      console.log("[OfflineVoice] Cannot sync: offline");
      return;
    }

    const pending = await getPendingRecordings();
    if (pending.length === 0) {
      console.log("[OfflineVoice] No pending recordings to sync");
      return;
    }

    console.log(
      `[OfflineVoice] Syncing ${pending.length} pending recording(s)`,
    );

    for (const recording of pending) {
      // Skip recordings that have exceeded retry limit
      if (recording.retryCount >= MAX_UPLOAD_RETRIES) {
        console.warn(
          `[OfflineVoice] Recording ${recording.id} exceeded max retries (${MAX_UPLOAD_RETRIES}), skipping`,
        );
        continue;
      }

      try {
        // Mark as uploading
        recording.status = "uploading";
        await saveRecording(recording);

        // Determine filename from mime type
        const extension = recording.mimeType.includes("webm") ? "webm" : "ogg";
        const filename = `offline_recording_${recording.id}.${extension}`;

        console.log(
          `[OfflineVoice] Uploading recording ${recording.id} (${recording.duration}s, ${recording.audioBlob.size} bytes)`,
        );

        // Upload and transcribe the audio
        const transcribedText = await apiClient.transcribeAudio(
          recording.audioBlob,
          filename,
        );

        console.log(
          `[OfflineVoice] Recording ${recording.id} transcribed: "${transcribedText.substring(0, 50)}..."`,
        );

        // Mark as uploaded
        recording.status = "uploaded";
        await saveRecording(recording);

        // Call completion callback with transcribed text
        onUploadComplete?.(recording, transcribedText);

        // Delete recording after successful upload to free up storage
        await deleteRecordingFromDB(recording.id);
        console.log(
          `[OfflineVoice] Recording ${recording.id} uploaded and deleted`,
        );
      } catch (error) {
        console.error(
          `[OfflineVoice] Failed to upload recording ${recording.id}:`,
          error,
        );

        // Mark as failed and increment retry count
        recording.status = "failed";
        recording.retryCount++;
        await saveRecording(recording);

        // Report error if callback provided
        onError?.(
          error instanceof Error
            ? error
            : new Error(`Failed to upload recording: ${String(error)}`),
        );
      }
    }

    await updatePendingCount();
  }, [apiClient, onUploadComplete, onError, updatePendingCount]);

  // Update ref whenever syncPendingRecordings changes (for use in event handlers)
  useEffect(() => {
    syncPendingRecordingsRef.current = syncPendingRecordings;
  }, [syncPendingRecordings]);

  const getPendingRecordingsList = useCallback(async () => {
    return getRecordingsByConversation(conversationId);
  }, [conversationId]);

  const deleteRecording = useCallback(
    async (id: string) => {
      await deleteRecordingFromDB(id);
      await updatePendingCount();
    },
    [updatePendingCount],
  );

  const setOfflineModeHandler = useCallback((enabled: boolean) => {
    setIsOfflineMode(enabled);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelRecording();
    };
  }, [cancelRecording]);

  return {
    isRecording,
    isOfflineMode,
    recordingDuration,
    pendingCount,
    startRecording,
    stopRecording,
    cancelRecording,
    syncPendingRecordings,
    getPendingRecordings: getPendingRecordingsList,
    deleteRecording,
    setOfflineMode: setOfflineModeHandler,
  };
}

export default useOfflineVoiceCapture;
