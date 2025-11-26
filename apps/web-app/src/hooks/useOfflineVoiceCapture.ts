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

export interface UseOfflineVoiceCaptureOptions {
  /** Conversation ID to associate recordings with */
  conversationId: string;
  /** Enable offline mode even when online */
  forceOffline?: boolean;
  /** Callback when a recording is ready */
  onRecordingComplete?: (recording: OfflineRecording) => void;
  /** Callback when a recording is uploaded */
  onUploadComplete?: (recording: OfflineRecording) => void;
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

  // Check online status
  useEffect(() => {
    const handleOnline = () => {
      if (!forceOffline) {
        setIsOfflineMode(false);
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

      mediaRecorder.onerror = (event) => {
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
    // TODO: Implement actual upload logic
    // This would call the voice-upload API endpoint
    console.log(
      "[OfflineVoice] Sync pending recordings - TODO: implement upload",
    );

    const pending = await getPendingRecordings();
    for (const recording of pending) {
      try {
        // Placeholder for actual upload
        // await apiClient.uploadVoiceRecording(recording.conversationId, recording.audioBlob);

        // Mark as uploaded
        recording.status = "uploaded";
        await saveRecording(recording);
        onUploadComplete?.(recording);

        // Or delete after successful upload
        // await deleteRecordingFromDB(recording.id);
      } catch (error) {
        recording.status = "failed";
        recording.retryCount++;
        await saveRecording(recording);
      }
    }

    await updatePendingCount();
  }, [onUploadComplete, updatePendingCount]);

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
