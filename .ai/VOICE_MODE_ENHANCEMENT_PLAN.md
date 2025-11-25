# Voice Mode Enhancement Plan
**Version:** 1.0
**Date:** 2025-11-25
**Status:** Planning
**Owner:** Engineering Team

---

## Executive Summary

This document outlines a comprehensive enhancement plan for the VoiceAssist Voice Mode feature, transforming it from a functional MVP to a production-grade, physician-optimized voice interaction system. The plan is organized into **5 major phases** covering reliability, UX, performance, clinical integration, and advanced features.

**Current State:**
- ✅ Working end-to-end voice pipeline (OpenAI Realtime API integration)
- ✅ Basic UI with connect/disconnect, transcript display, audio playback
- ✅ Auto-open flow from Home page
- ✅ Unit and E2E test coverage

**Target State:**
- 🎯 Enterprise-grade reliability (99.9% uptime, automatic recovery)
- 🎯 Physician-optimized UX (voice commands, clinical context integration)
- 🎯 High performance (< 500ms latency, optimized bundles)
- 🎯 HIPAA-compliant with full audit trail
- 🎯 Advanced features (multi-language, analytics, offline support)

---

## Table of Contents

1. [Phase 1: Reliability & Resilience](#phase-1-reliability--resilience)
2. [Phase 2: UX & Features](#phase-2-ux--features)
3. [Phase 3: Performance & Optimization](#phase-3-performance--optimization)
4. [Phase 4: Clinical Integration](#phase-4-clinical-integration)
5. [Phase 5: Advanced Features](#phase-5-advanced-features)
6. [Phase 6: Security & Compliance](#phase-6-security--compliance)
7. [Phase 7: Monitoring & Observability](#phase-7-monitoring--observability)
8. [Phase 8: Testing & Quality Assurance](#phase-8-testing--quality-assurance)
9. [Implementation Priority Matrix](#implementation-priority-matrix)
10. [Success Metrics](#success-metrics)
11. [Timeline & Resource Estimates](#timeline--resource-estimates)

---

## Phase 1: Reliability & Resilience

**Goal:** Ensure Voice Mode works consistently in adverse conditions (network issues, API failures, browser quirks).

### 1.1 Automatic Reconnection Logic

**Priority:** 🔴 P0 (Critical)
**Effort:** Medium (3-5 days)
**Impact:** High
**Status:** ✅ **IMPLEMENTED** (2025-11-25)

#### Implementation Summary

Automatic reconnection with exponential backoff has been implemented in `useRealtimeVoiceSession.ts`:

- ✅ Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s (max)
- ✅ Max 5 reconnection attempts before marking as "failed"
- ✅ Respects intentional disconnects (won't auto-reconnect if user manually stops)
- ✅ Session expiry monitoring with proactive refresh (<60s remaining)
- ✅ New connection states: "reconnecting", "failed", "expired"
- ✅ Reset attempt counter on successful connection

#### Enhancement (Planned vs Implemented)

**Frontend (`useRealtimeVoiceSession.ts`):**

```typescript
// Add reconnection state
const [reconnectAttempts, setReconnectAttempts] = useState(0);
const [isReconnecting, setIsReconnecting] = useState(false);
const maxReconnectAttempts = 5;
const baseRetryDelay = 1000; // 1 second

// Exponential backoff calculation
const calculateRetryDelay = (attempt: number) => {
  return Math.min(baseRetryDelay * Math.pow(2, attempt), 30000); // Max 30s
};

// Auto-reconnect on disconnect
useEffect(() => {
  if (
    status === "disconnected" &&
    reconnectAttempts < maxReconnectAttempts &&
    sessionConfig &&
    !isReconnecting
  ) {
    const delay = calculateRetryDelay(reconnectAttempts);

    console.log(`[RealtimeVoiceSession] Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`);
    setIsReconnecting(true);

    const timeout = setTimeout(async () => {
      try {
        await connect();
        setReconnectAttempts(0); // Reset on success
      } catch (err) {
        setReconnectAttempts(prev => prev + 1);
      } finally {
        setIsReconnecting(false);
      }
    }, delay);

    reconnectTimeoutRef.current = timeout;
    return () => clearTimeout(timeout);
  }
}, [status, reconnectAttempts, sessionConfig, isReconnecting]);

// Reset reconnect attempts on successful connection
useEffect(() => {
  if (status === "connected") {
    setReconnectAttempts(0);
  }
}, [status]);
```

**UI Updates (`VoiceModePanel.tsx`):**

```tsx
{/* Reconnection status */}
{isReconnecting && (
  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center space-x-2">
    <div className="animate-spin h-4 w-4 border-2 border-yellow-600 border-t-transparent rounded-full" />
    <span className="text-sm text-yellow-800">
      Reconnecting... (Attempt {reconnectAttempts + 1}/{maxReconnectAttempts})
    </span>
  </div>
)}

{/* Max attempts reached */}
{reconnectAttempts >= maxReconnectAttempts && status === "disconnected" && (
  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
    <p className="text-sm font-medium text-red-900">Connection Lost</p>
    <p className="text-sm text-red-700 mt-1">
      Unable to reconnect after {maxReconnectAttempts} attempts.
    </p>
    <button
      onClick={() => {
        setReconnectAttempts(0);
        connect();
      }}
      className="mt-2 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
    >
      Retry Manually
    </button>
  </div>
)}
```

**Test Cases:**
- ✅ Reconnects automatically on unexpected disconnect
- ✅ Exponential backoff delays work correctly
- ✅ Max attempts reached triggers manual retry UI
- ✅ Successful reconnect resets attempt counter
- ✅ User can cancel auto-reconnect via disconnect button

---

### 1.2 Session Expiry Handling

**Priority:** 🔴 P0 (Critical)
**Effort:** Small (1-2 days)
**Impact:** Medium

#### Enhancement

**Frontend:**

```typescript
// Monitor session expiry
useEffect(() => {
  if (!sessionConfig) return;

  const checkExpiry = () => {
    const now = Date.now();
    const expiresAt = sessionConfig.expires_at * 1000;
    const timeUntilExpiry = expiresAt - now;

    if (timeUntilExpiry <= 0) {
      updateStatus("expired");
      disconnect();
      options.onError?.(new Error("Session expired"));
    } else if (timeUntilExpiry < 60000 && status === "connected") {
      // Warn user 1 minute before expiry
      console.warn("[RealtimeVoiceSession] Session expires in < 1 minute");
      // TODO: Show UI warning
    }
  };

  const interval = setInterval(checkExpiry, 10000); // Check every 10s
  return () => clearInterval(interval);
}, [sessionConfig, status]);

// Auto-refresh session on expiry warning
const refreshSession = useCallback(async () => {
  if (status === "connected") {
    console.log("[RealtimeVoiceSession] Refreshing session...");

    // Fetch new config
    const newConfig = await fetchSessionConfig();

    // Seamless reconnect (TODO: implement handover)
    disconnect();
    await connect();
  }
}, [status, disconnect, connect, fetchSessionConfig]);
```

**UI Warning:**

```tsx
{/* Session expiry warning */}
{sessionConfig && (
  <SessionExpiryWarning
    expiresAt={sessionConfig.expires_at}
    onRefresh={refreshSession}
  />
)}
```

---

### 1.3 Network Quality Monitoring

**Priority:** 🟡 P1 (High)
**Effort:** Medium (3-4 days)
**Impact:** Medium

#### Enhancement

**Add network quality indicators:**

```typescript
// Network quality state
const [networkQuality, setNetworkQuality] = useState<"good" | "fair" | "poor">("good");
const [latency, setLatency] = useState<number>(0);
const [packetLoss, setPacketLoss] = useState<number>(0);

// Ping/pong for latency measurement
const measureLatency = useCallback(() => {
  if (wsRef.current?.readyState === WebSocket.OPEN) {
    const pingStart = Date.now();

    wsRef.current.send(JSON.stringify({ type: "ping" }));

    // Await pong response (implement in message handler)
    // Calculate RTT and update latency state
  }
}, []);

// Periodic latency checks
useEffect(() => {
  if (status === "connected") {
    const interval = setInterval(measureLatency, 5000);
    return () => clearInterval(interval);
  }
}, [status, measureLatency]);

// Network quality calculation
useEffect(() => {
  if (latency < 150 && packetLoss < 2) {
    setNetworkQuality("good");
  } else if (latency < 300 && packetLoss < 5) {
    setNetworkQuality("fair");
  } else {
    setNetworkQuality("poor");
  }
}, [latency, packetLoss]);
```

**UI Indicator:**

```tsx
{/* Network quality indicator */}
<div className="flex items-center space-x-2 text-xs">
  <div className={`w-2 h-2 rounded-full ${
    networkQuality === "good" ? "bg-green-500" :
    networkQuality === "fair" ? "bg-yellow-500" :
    "bg-red-500"
  }`} />
  <span className="text-neutral-600">
    {networkQuality === "good" ? "Excellent" :
     networkQuality === "fair" ? "Fair" : "Poor"} connection
    ({latency}ms)
  </span>
</div>
```

---

### 1.4 Error Recovery & Graceful Degradation

**Priority:** 🟡 P1 (High)
**Effort:** Medium (4-5 days)
**Impact:** High

#### Enhancements

**Audio Fallback:**

```typescript
// Fallback to text-only mode if microphone fails
const [fallbackMode, setFallbackMode] = useState<"voice" | "text">("voice");

const initializeAudioStreaming = useCallback(async (ws: WebSocket) => {
  try {
    // Existing microphone initialization
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { ... } });
    // ...
  } catch (err) {
    console.error("[RealtimeVoiceSession] Microphone access denied, falling back to text mode");

    setFallbackMode("text");
    options.onError?.(new Error("Microphone unavailable - using text mode"));

    // Continue session in text-only mode
    ws.send(JSON.stringify({
      type: "session.update",
      session: {
        modalities: ["text"], // Text only
        // ... other config
      }
    }));
  }
}, []);
```

**Partial Transcript Recovery:**

```typescript
// Buffer partial transcripts
const partialTranscriptsRef = useRef<RealtimeTranscript[]>([]);

// On disconnect, save partial state
const disconnect = useCallback(() => {
  // Save partial transcripts to localStorage for recovery
  if (partialTranscriptsRef.current.length > 0) {
    localStorage.setItem(
      `voice_session_${sessionConfig?.session_id}`,
      JSON.stringify({
        transcripts: partialTranscriptsRef.current,
        timestamp: Date.now()
      })
    );
  }

  // ... rest of disconnect logic
}, [sessionConfig]);

// On connect, restore partial state
const connect = useCallback(async () => {
  // ... connection logic

  // Restore partial transcripts if available
  const savedSession = localStorage.getItem(`voice_session_${sessionConfig?.session_id}`);
  if (savedSession) {
    const { transcripts, timestamp } = JSON.parse(savedSession);

    // Only restore if < 5 minutes old
    if (Date.now() - timestamp < 300000) {
      partialTranscriptsRef.current = transcripts;
      // Optionally display in UI
    }

    localStorage.removeItem(`voice_session_${sessionConfig?.session_id}`);
  }
}, [sessionConfig]);
```

---

## Phase 2: UX & Features

**Goal:** Transform Voice Mode into a physician-optimized, feature-rich interface.

### 2.1 Conversation Transcript Persistence

**Priority:** 🔴 P0 (Critical)
**Effort:** Medium (4-6 days)
**Impact:** Very High

#### Current State
- Transcripts are ephemeral (lost on panel close)
- No integration with chat message history
- No way to review past voice conversations

#### Enhancement

**Backend: Voice Message Storage**

Create new models for voice messages:

```python
# services/api-gateway/app/models/voice_message.py

from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from app.db.base_class import Base

class VoiceMessage(Base):
    """Voice conversation message"""
    __tablename__ = "voice_messages"

    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    session_id = Column(String(255), nullable=False, index=True)

    # Message content
    role = Column(String(20), nullable=False)  # "user" or "assistant"
    transcript = Column(Text, nullable=False)
    audio_url = Column(String(512), nullable=True)  # S3/object storage URL

    # Metadata
    is_final = Column(Boolean, default=False)
    latency_ms = Column(Integer, nullable=True)
    confidence_score = Column(Float, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    conversation = relationship("Conversation", back_populates="voice_messages")
```

**Backend: Voice Message API**

```python
# services/api-gateway/app/api/voice.py

@router.post("/messages", response_model=VoiceMessageResponse)
async def save_voice_message(
    request: VoiceMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Save a voice message to the conversation history.

    Called by frontend when a final transcript is received.
    """
    # Verify conversation belongs to user
    conversation = db.query(Conversation).filter(
        Conversation.id == request.conversation_id,
        Conversation.user_id == current_user.id
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Create voice message
    voice_message = VoiceMessage(
        conversation_id=request.conversation_id,
        session_id=request.session_id,
        role=request.role,
        transcript=request.transcript,
        is_final=request.is_final,
        latency_ms=request.latency_ms,
    )

    db.add(voice_message)
    db.commit()
    db.refresh(voice_message)

    # Also add to regular chat messages for unified view
    chat_message = Message(
        conversation_id=request.conversation_id,
        role=request.role,
        content=request.transcript,
        metadata={"source": "voice", "session_id": request.session_id}
    )
    db.add(chat_message)
    db.commit()

    return VoiceMessageResponse.from_orm(voice_message)


@router.get("/messages/{conversation_id}", response_model=List[VoiceMessageResponse])
async def get_voice_messages(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all voice messages for a conversation."""
    # Verify ownership
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id,
        Conversation.user_id == current_user.id
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = db.query(VoiceMessage).filter(
        VoiceMessage.conversation_id == conversation_id
    ).order_by(VoiceMessage.created_at).all()

    return [VoiceMessageResponse.from_orm(m) for m in messages]
```

**Frontend: Auto-save Transcripts**

```typescript
// In VoiceModePanel.tsx

const { conversationId } = props;
const [savedTranscripts, setSavedTranscripts] = useState<VoiceMessage[]>([]);

// Auto-save final transcripts
const handleTranscript = useCallback((transcript: RealtimeTranscript) => {
  if (transcript.is_final && conversationId) {
    // Save to backend
    apiClient.saveVoiceMessage({
      conversation_id: conversationId,
      session_id: sessionConfig?.session_id,
      role: transcript.role, // "user" or "assistant"
      transcript: transcript.text,
      is_final: true,
      latency_ms: Date.now() - transcript.timestamp,
    }).then(savedMessage => {
      setSavedTranscripts(prev => [...prev, savedMessage]);
    }).catch(err => {
      console.error("Failed to save voice message:", err);
      // Queue for retry
    });
  }
}, [conversationId, sessionConfig, apiClient]);

// Use in hook options
const { ... } = useRealtimeVoiceSession({
  conversation_id: conversationId,
  onTranscript: handleTranscript,
  // ...
});
```

**UI: Transcript History View**

```tsx
{/* Transcript history */}
<div className="space-y-2 max-h-64 overflow-y-auto">
  <h4 className="text-xs font-semibold text-neutral-700 uppercase">
    Conversation History
  </h4>
  {savedTranscripts.map((msg, idx) => (
    <div
      key={idx}
      className={`p-2 rounded ${
        msg.role === "user"
          ? "bg-blue-50 border-blue-200"
          : "bg-purple-50 border-purple-200"
      } border`}
    >
      <p className="text-xs font-semibold mb-1">
        {msg.role === "user" ? "You" : "AI Assistant"}
        <span className="text-neutral-500 ml-2">
          {formatTime(msg.created_at)}
        </span>
      </p>
      <p className="text-sm">{msg.transcript}</p>
    </div>
  ))}
</div>
```

---

### 2.2 Voice Mode Settings UI

**Priority:** 🟡 P1 (High)
**Effort:** Medium (5-7 days)
**Impact:** High

#### Enhancement

**Settings Modal Component:**

```tsx
// apps/web-app/src/components/voice/VoiceSettingsModal.tsx

interface VoiceSettings {
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  vadThreshold: number; // 0.0 - 1.0
  vadSilenceDuration: number; // ms
  inputAudioFormat: "pcm16" | "g711_ulaw" | "g711_alaw";
  outputAudioFormat: "pcm16" | "g711_ulaw" | "g711_alaw";
  transcriptionEnabled: boolean;
  language: string; // "en", "es", "fr", etc.
}

export function VoiceSettingsModal({
  isOpen,
  onClose,
  currentSettings,
  onSave,
}: VoiceSettingsModalProps) {
  const [settings, setSettings] = useState<VoiceSettings>(currentSettings);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Voice Mode Settings">
      {/* Voice Selection */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            AI Voice
          </label>
          <select
            value={settings.voice}
            onChange={(e) => setSettings({ ...settings, voice: e.target.value as any })}
            className="w-full border rounded px-3 py-2"
          >
            <option value="alloy">Alloy (Neutral)</option>
            <option value="echo">Echo (Male)</option>
            <option value="fable">Fable (British Male)</option>
            <option value="onyx">Onyx (Deep Male)</option>
            <option value="nova">Nova (Female)</option>
            <option value="shimmer">Shimmer (Soft Female)</option>
          </select>
          <p className="text-xs text-neutral-500 mt-1">
            Choose the AI assistant's voice
          </p>
        </div>

        {/* VAD Sensitivity */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Voice Detection Sensitivity
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={settings.vadThreshold}
            onChange={(e) => setSettings({ ...settings, vadThreshold: parseFloat(e.target.value) })}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-neutral-500 mt-1">
            <span>Less Sensitive</span>
            <span className="font-medium">{(settings.vadThreshold * 100).toFixed(0)}%</span>
            <span>More Sensitive</span>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Higher sensitivity detects speech more quickly but may pick up background noise
          </p>
        </div>

        {/* Silence Duration */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Pause Detection (ms)
          </label>
          <input
            type="number"
            min="200"
            max="2000"
            step="100"
            value={settings.vadSilenceDuration}
            onChange={(e) => setSettings({ ...settings, vadSilenceDuration: parseInt(e.target.value) })}
            className="w-full border rounded px-3 py-2"
          />
          <p className="text-xs text-neutral-500 mt-1">
            How long to wait before considering you've finished speaking
          </p>
        </div>

        {/* Transcription Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-medium">
              Show Transcripts
            </label>
            <p className="text-xs text-neutral-500 mt-1">
              Display text version of conversations
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.transcriptionEnabled}
            onChange={(e) => setSettings({ ...settings, transcriptionEnabled: e.target.checked })}
            className="h-5 w-5"
          />
        </div>

        {/* Language Selection */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Language
          </label>
          <select
            value={settings.language}
            onChange={(e) => setSettings({ ...settings, language: e.target.value })}
            className="w-full border rounded px-3 py-2"
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="it">Italian</option>
            <option value="pt">Portuguese</option>
            <option value="zh">Chinese</option>
            <option value="ja">Japanese</option>
          </select>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end space-x-3 mt-6 pt-4 border-t">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            onSave(settings);
            onClose();
          }}
        >
          Save Settings
        </Button>
      </div>
    </Modal>
  );
}
```

**Settings Persistence:**

```typescript
// Store settings in localStorage and user preferences
const VOICE_SETTINGS_KEY = "voice_mode_settings";

export function useVoiceSettings() {
  const [settings, setSettings] = useState<VoiceSettings>(() => {
    const saved = localStorage.getItem(VOICE_SETTINGS_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_VOICE_SETTINGS;
  });

  const saveSettings = useCallback((newSettings: VoiceSettings) => {
    setSettings(newSettings);
    localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(newSettings));

    // Optionally sync to backend user preferences
    apiClient.updateUserPreferences({
      voice_settings: newSettings
    });
  }, []);

  return { settings, saveSettings };
}
```

**Integration with Voice Hook:**

```typescript
// In VoiceModePanel.tsx

const { settings } = useVoiceSettings();

const { ... } = useRealtimeVoiceSession({
  conversation_id: conversationId,
  voiceConfig: {
    voice: settings.voice,
    turn_detection: {
      type: "server_vad",
      threshold: settings.vadThreshold,
      silence_duration_ms: settings.vadSilenceDuration,
    },
    input_audio_transcription: {
      model: "whisper-1",
      language: settings.language,
    },
  },
  // ...
});
```

---

### 2.3 Keyboard Shortcuts

**Priority:** 🟢 P2 (Medium)
**Effort:** Small (2-3 days)
**Impact:** Medium

#### Enhancement

```typescript
// apps/web-app/src/hooks/useVoiceKeyboardShortcuts.ts

export function useVoiceKeyboardShortcuts({
  onToggleVoice,
  onStartSession,
  onEndSession,
  onOpenSettings,
  isConnected,
}: VoiceKeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Shift + V: Toggle voice panel
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "V") {
        e.preventDefault();
        onToggleVoice();
        return;
      }

      // Cmd/Ctrl + Shift + S: Start/Stop session
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "S") {
        e.preventDefault();
        if (isConnected) {
          onEndSession();
        } else {
          onStartSession();
        }
        return;
      }

      // Cmd/Ctrl + Shift + ,: Open settings
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === ",") {
        e.preventDefault();
        onOpenSettings();
        return;
      }

      // Space bar: Push-to-talk (when panel is focused)
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        // TODO: Implement push-to-talk mode
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isConnected, onToggleVoice, onStartSession, onEndSession, onOpenSettings]);
}
```

**Keyboard Shortcuts Help:**

```tsx
{/* Keyboard shortcuts indicator */}
<div className="text-xs text-neutral-500 space-y-1">
  <p><kbd>⌘ Shift V</kbd> Toggle Voice Mode</p>
  <p><kbd>⌘ Shift S</kbd> Start/Stop Session</p>
  <p><kbd>⌘ Shift ,</kbd> Settings</p>
</div>
```

---

### 2.4 Visual Enhancements

**Priority:** 🟢 P2 (Medium)
**Effort:** Small (3-4 days)
**Impact:** Medium

#### Enhancements

**Real-time Waveform Animation:**

```typescript
// Enhanced waveform visualization during speech

const updateWaveform = useCallback((audioData: Float32Array) => {
  if (!waveformRef.current) return;

  // Calculate amplitude
  const amplitude = audioData.reduce((sum, val) => sum + Math.abs(val), 0) / audioData.length;

  // Animate waveform based on amplitude
  waveformRef.current.animate(amplitude);
}, []);

// In audio processor
processor.onaudioprocess = (event) => {
  const inputData = event.inputBuffer.getChannelData(0);

  // Update waveform visualization
  updateWaveform(inputData);

  // ... rest of audio processing
};
```

**Speaking Indicator Animation:**

```tsx
{/* Enhanced speaking indicator with pulse animation */}
{isSpeaking && (
  <div className="flex items-center space-x-2">
    <div className="flex space-x-1">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="w-1 bg-green-500 rounded-full animate-pulse"
          style={{
            height: "20px",
            animationDelay: `${i * 150}ms`,
            animationDuration: "0.6s",
          }}
        />
      ))}
    </div>
    <span className="text-sm font-medium text-green-600">
      Listening...
    </span>
  </div>
)}
```

**Transcript Formatting:**

```tsx
// Highlight medical terms, medications, etc.
function formatTranscript(text: string): React.ReactNode {
  // Medical term detection (simplified)
  const medicalTerms = /\b(hypertension|diabetes|medication|diagnosis|treatment)\b/gi;

  return text.split(medicalTerms).map((part, idx) => {
    if (idx % 2 === 1) {
      return (
        <mark key={idx} className="bg-blue-100 text-blue-900 px-1 rounded">
          {part}
        </mark>
      );
    }
    return part;
  });
}
```

---

## Phase 3: Performance & Optimization

**Goal:** Optimize Voice Mode for low latency, efficient resource usage, and fast load times.

### 3.1 Bundle Size Optimization

**Priority:** 🔴 P0 (Critical)
**Effort:** Medium (4-5 days)
**Impact:** High

#### Current State
- ChatPage bundle: **709 kB** (gzipped: 206 kB)
- Voice components loaded eagerly
- Large chunk size warning in build

#### Enhancement

**Code Splitting for Voice Components:**

```typescript
// apps/web-app/src/pages/ChatPage.tsx

import { lazy, Suspense } from "react";

// Lazy load VoiceModePanel
const VoiceModePanel = lazy(() =>
  import("../components/voice/VoiceModePanel").then(m => ({ default: m.VoiceModePanel }))
);

// Lazy load waveform visualizer
const WaveformVisualizer = lazy(() =>
  import("../utils/waveform").then(m => ({ default: m.WaveformVisualizer }))
);

// In component
{showRealtimeVoice && (
  <Suspense fallback={
    <div className="flex items-center justify-center p-4">
      <div className="animate-spin h-6 w-6 border-2 border-primary-500 border-t-transparent rounded-full" />
      <span className="ml-2 text-sm text-neutral-600">Loading Voice Mode...</span>
    </div>
  }>
    <VoiceModePanel
      conversationId={conversationId}
      onClose={() => setShowRealtimeVoice(false)}
    />
  </Suspense>
)}
```

**Manual Chunk Splitting:**

```typescript
// vite.config.ts

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-ui": ["@voiceassist/ui"],

          // Feature chunks
          "voice-mode": [
            "./src/hooks/useRealtimeVoiceSession.ts",
            "./src/components/voice/VoiceModePanel.tsx",
            "./src/utils/waveform.ts",
          ],

          // Large dependencies
          "markdown": ["react-markdown", "remark-gfm"],
          "charts": ["recharts"],
        },
      },
    },
    chunkSizeWarningLimit: 600, // Increase limit for main bundle
  },
});
```

**Expected Results:**
- ChatPage main bundle: **< 400 kB** (reduction of ~300 kB)
- Voice Mode chunk: **~150 kB** (loaded on-demand)
- Initial page load: **~50% faster**

---

### 3.2 Audio Processing Optimization

**Priority:** 🟡 P1 (High)
**Effort:** Medium (4-5 days)
**Impact:** Medium

#### Enhancement

**Replace ScriptProcessorNode with AudioWorklet:**

```typescript
// apps/web-app/public/audio-processor.worklet.js

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const inputChannel = input[0];

    // Accumulate audio samples
    for (let i = 0; i < inputChannel.length; i++) {
      this.buffer[this.bufferIndex++] = inputChannel[i];

      // When buffer is full, send to main thread
      if (this.bufferIndex >= this.bufferSize) {
        this.port.postMessage({
          type: "audio",
          data: this.buffer.slice(),
        });
        this.bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor("audio-processor", AudioProcessor);
```

**Use in Hook:**

```typescript
// Replace ScriptProcessorNode with AudioWorklet

const initializeAudioStreaming = useCallback(async (ws: WebSocket) => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 24000,
        channelCount: 1,
      },
    });

    mediaStreamRef.current = stream;

    const audioContext = new AudioContext({ sampleRate: 24000 });
    audioContextRef.current = audioContext;

    // Load AudioWorklet
    await audioContext.audioWorklet.addModule("/audio-processor.worklet.js");

    const source = audioContext.createMediaStreamSource(stream);
    const workletNode = new AudioWorkletNode(audioContext, "audio-processor");

    // Handle messages from worklet
    workletNode.port.onmessage = (event) => {
      if (event.data.type === "audio" && ws.readyState === WebSocket.OPEN) {
        const audioData = event.data.data;

        // Convert Float32 to PCM16
        const pcm16 = new Int16Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
          const s = Math.max(-1, Math.min(1, audioData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Send to Realtime API
        ws.send(JSON.stringify({
          type: "input_audio_buffer.append",
          audio: btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer))),
        }));
      }
    };

    source.connect(workletNode);
    workletNode.connect(audioContext.destination);

    processorNodeRef.current = workletNode;

  } catch (err) {
    throw new Error(`Failed to initialize audio: ${err.message}`);
  }
}, []);
```

**Benefits:**
- ✅ Runs in separate thread (no main thread blocking)
- ✅ Lower latency (no GC pauses)
- ✅ Better audio quality (consistent processing)

---

### 3.3 WebSocket Message Batching

**Priority:** 🟢 P2 (Medium)
**Effort:** Small (2-3 days)
**Impact:** Low

#### Enhancement

```typescript
// Batch small audio chunks to reduce WebSocket overhead

const audioBatchRef = useRef<Int16Array[]>([]);
const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

const sendAudioBatch = useCallback((ws: WebSocket) => {
  if (audioBatchRef.current.length === 0) return;

  // Concatenate all chunks
  const totalLength = audioBatchRef.current.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Int16Array(totalLength);

  let offset = 0;
  for (const chunk of audioBatchRef.current) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  // Send merged chunk
  ws.send(JSON.stringify({
    type: "input_audio_buffer.append",
    audio: btoa(String.fromCharCode(...new Uint8Array(merged.buffer))),
  }));

  // Clear batch
  audioBatchRef.current = [];
}, []);

// In audio processor
workletNode.port.onmessage = (event) => {
  if (event.data.type === "audio" && ws.readyState === WebSocket.OPEN) {
    const pcm16 = convertToPCM16(event.data.data);

    // Add to batch
    audioBatchRef.current.push(pcm16);

    // Send batch every 100ms or when batch size exceeds threshold
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
    }

    if (audioBatchRef.current.length >= 5) {
      // Batch size threshold reached
      sendAudioBatch(ws);
    } else {
      // Schedule batched send
      batchTimeoutRef.current = setTimeout(() => {
        sendAudioBatch(ws);
      }, 100);
    }
  }
};
```

---

## Phase 4: Clinical Integration

**Goal:** Integrate Voice Mode with clinical workflows and medical documentation.

### 4.1 Voice Commands for Clinical Context

**Priority:** 🟡 P1 (High)
**Effort:** Large (10-15 days)
**Impact:** Very High

#### Enhancement

**Command Detection & Parsing:**

```typescript
// apps/web-app/src/hooks/useVoiceCommands.ts

interface VoiceCommand {
  intent: string;
  entities: Record<string, any>;
  confidence: number;
}

export function useVoiceCommands() {
  const parseCommand = useCallback((transcript: string): VoiceCommand | null => {
    const lower = transcript.toLowerCase();

    // Add vital signs
    if (lower.includes("add vital") || lower.includes("record vital")) {
      return parseVitalSignsCommand(transcript);
    }

    // Add medication
    if (lower.includes("add medication") || lower.includes("prescribe")) {
      return parseMedicationCommand(transcript);
    }

    // Add diagnosis
    if (lower.includes("diagnose") || lower.includes("add diagnosis")) {
      return parseDiagnosisCommand(transcript);
    }

    // Search knowledge base
    if (lower.includes("search for") || lower.includes("look up")) {
      return parseSearchCommand(transcript);
    }

    return null;
  }, []);

  return { parseCommand };
}

// Example: Parse vital signs command
function parseVitalSignsCommand(transcript: string): VoiceCommand {
  // "Add vital signs: blood pressure 120 over 80, heart rate 72"

  const bpMatch = transcript.match(/blood pressure (\d+) (?:over|slash) (\d+)/i);
  const hrMatch = transcript.match(/heart rate (\d+)/i);
  const tempMatch = transcript.match(/temperature (\d+\.?\d*)/i);

  return {
    intent: "add_vital_signs",
    entities: {
      blood_pressure: bpMatch ? {
        systolic: parseInt(bpMatch[1]),
        diastolic: parseInt(bpMatch[2]),
      } : null,
      heart_rate: hrMatch ? parseInt(hrMatch[1]) : null,
      temperature: tempMatch ? parseFloat(tempMatch[1]) : null,
    },
    confidence: 0.85,
  };
}

// Example: Parse medication command
function parseMedicationCommand(transcript: string): VoiceCommand {
  // "Prescribe metformin 500 milligrams twice daily"

  const medicationMatch = transcript.match(/(?:prescribe|add medication) (.+?) (\d+)\s*(mg|milligrams?|mcg)/i);
  const frequencyMatch = transcript.match(/(\w+)\s+(?:daily|a day|per day)/i);

  return {
    intent: "add_medication",
    entities: {
      medication_name: medicationMatch?.[1]?.trim(),
      dosage: medicationMatch ? parseInt(medicationMatch[2]) : null,
      dosage_unit: medicationMatch?.[3],
      frequency: frequencyMatch?.[1], // "once", "twice", "three times"
    },
    confidence: 0.75,
  };
}
```

**Command Execution with Confirmation:**

```tsx
// In VoiceModePanel.tsx

const { parseCommand } = useVoiceCommands();
const [pendingCommand, setPendingCommand] = useState<VoiceCommand | null>(null);

const handleTranscript = useCallback((transcript: RealtimeTranscript) => {
  if (!transcript.is_final) return;

  // Check for voice commands
  const command = parseCommand(transcript.text);

  if (command) {
    // Show confirmation dialog
    setPendingCommand(command);
  }
}, [parseCommand]);

// Command confirmation UI
{pendingCommand && (
  <div className="p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
    <h4 className="font-semibold text-blue-900 mb-2">
      Voice Command Detected
    </h4>
    <CommandPreview command={pendingCommand} />

    <div className="flex space-x-2 mt-3">
      <Button
        variant="primary"
        size="sm"
        onClick={() => {
          executeCommand(pendingCommand);
          setPendingCommand(null);
        }}
      >
        Execute
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setPendingCommand(null)}
      >
        Cancel
      </Button>
    </div>
  </div>
)}
```

**Command Preview Component:**

```tsx
function CommandPreview({ command }: { command: VoiceCommand }) {
  if (command.intent === "add_vital_signs") {
    return (
      <div className="text-sm space-y-1">
        <p><strong>Action:</strong> Add Vital Signs</p>
        {command.entities.blood_pressure && (
          <p><strong>BP:</strong> {command.entities.blood_pressure.systolic}/{command.entities.blood_pressure.diastolic}</p>
        )}
        {command.entities.heart_rate && (
          <p><strong>HR:</strong> {command.entities.heart_rate} bpm</p>
        )}
        {command.entities.temperature && (
          <p><strong>Temp:</strong> {command.entities.temperature}°F</p>
        )}
      </div>
    );
  }

  if (command.intent === "add_medication") {
    return (
      <div className="text-sm space-y-1">
        <p><strong>Action:</strong> Add Medication</p>
        <p><strong>Medication:</strong> {command.entities.medication_name}</p>
        <p><strong>Dosage:</strong> {command.entities.dosage} {command.entities.dosage_unit}</p>
        <p><strong>Frequency:</strong> {command.entities.frequency} daily</p>
      </div>
    );
  }

  return <p className="text-sm">{JSON.stringify(command.entities, null, 2)}</p>;
}
```

**Command Execution:**

```typescript
async function executeCommand(command: VoiceCommand) {
  switch (command.intent) {
    case "add_vital_signs":
      await apiClient.addVitalSigns({
        conversation_id: conversationId,
        ...command.entities,
      });
      toast.success("Vital signs added");
      break;

    case "add_medication":
      await apiClient.addMedication({
        conversation_id: conversationId,
        ...command.entities,
      });
      toast.success("Medication added");
      break;

    case "add_diagnosis":
      // Navigate to clinical context with pre-filled diagnosis
      navigate("/clinical-context", {
        state: {
          diagnosis: command.entities.diagnosis_text,
        },
      });
      break;

    default:
      console.warn("Unknown command intent:", command.intent);
  }
}
```

---

### 4.2 SOAP Note Generation from Voice

**Priority:** 🟡 P1 (High)
**Effort:** Large (12-18 days)
**Impact:** Very High

#### Enhancement

**Backend: SOAP Note Extraction**

```python
# services/api-gateway/app/services/soap_extraction.py

from typing import Dict, List, Optional
import openai
from app.core.config import settings

class SOAPNoteExtractor:
    """
    Extract structured SOAP notes from voice conversation transcripts.

    SOAP format:
    - Subjective: Patient's description of symptoms
    - Objective: Observable facts (vitals, exam findings)
    - Assessment: Diagnosis or clinical impression
    - Plan: Treatment plan, prescriptions, follow-up
    """

    def __init__(self):
        self.client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)

    def extract_soap_note(
        self,
        transcripts: List[Dict[str, str]],
        clinical_context: Optional[Dict] = None
    ) -> Dict[str, str]:
        """
        Extract SOAP note from conversation transcripts.

        Args:
            transcripts: List of {role: "user"|"assistant", content: str}
            clinical_context: Optional clinical context (vitals, demographics, etc.)

        Returns:
            Dict with keys: subjective, objective, assessment, plan
        """
        # Build prompt
        conversation = "\n".join([
            f"{t['role'].upper()}: {t['content']}"
            for t in transcripts
        ])

        context_str = ""
        if clinical_context:
            context_str = f"\n\nClinical Context:\n{self._format_clinical_context(clinical_context)}"

        prompt = f"""Extract a structured SOAP note from the following medical conversation.

Conversation:
{conversation}{context_str}

Please provide a structured SOAP note with the following sections:

1. SUBJECTIVE: Patient's reported symptoms, history, and concerns
2. OBJECTIVE: Observable data including vital signs, examination findings
3. ASSESSMENT: Clinical diagnosis or impression
4. PLAN: Treatment plan, medications, follow-up instructions

Format each section clearly."""

        # Call GPT-4
        response = self.client.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=[
                {"role": "system", "content": "You are a medical documentation assistant. Extract accurate, structured SOAP notes from physician-patient conversations."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,  # Low temperature for consistency
        )

        # Parse response
        soap_text = response.choices[0].message.content
        return self._parse_soap_sections(soap_text)

    def _format_clinical_context(self, context: Dict) -> str:
        """Format clinical context for prompt."""
        lines = []

        if context.get("demographics"):
            demo = context["demographics"]
            lines.append(f"Patient: {demo.get('age')}y/o {demo.get('gender')}")

        if context.get("vitals"):
            vitals = context["vitals"]
            lines.append(f"Vitals: BP {vitals.get('bp')}, HR {vitals.get('hr')}, Temp {vitals.get('temp')}")

        if context.get("medications"):
            meds = ", ".join(context["medications"])
            lines.append(f"Current Medications: {meds}")

        if context.get("problems"):
            problems = ", ".join(context["problems"])
            lines.append(f"Problem List: {problems}")

        return "\n".join(lines)

    def _parse_soap_sections(self, soap_text: str) -> Dict[str, str]:
        """Parse SOAP sections from GPT response."""
        sections = {
            "subjective": "",
            "objective": "",
            "assessment": "",
            "plan": "",
        }

        current_section = None
        lines = soap_text.split("\n")

        for line in lines:
            line_upper = line.strip().upper()

            if "SUBJECTIVE" in line_upper:
                current_section = "subjective"
            elif "OBJECTIVE" in line_upper:
                current_section = "objective"
            elif "ASSESSMENT" in line_upper:
                current_section = "assessment"
            elif "PLAN" in line_upper:
                current_section = "plan"
            elif current_section and line.strip():
                sections[current_section] += line.strip() + "\n"

        return sections


# API endpoint
@router.post("/voice/generate-soap-note", response_model=SOAPNoteResponse)
async def generate_soap_note(
    request: SOAPNoteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate SOAP note from voice conversation.

    Args:
        request: Contains conversation_id or transcript list
    """
    # Get voice messages for conversation
    messages = db.query(VoiceMessage).filter(
        VoiceMessage.conversation_id == request.conversation_id,
        VoiceMessage.is_final == True
    ).order_by(VoiceMessage.created_at).all()

    transcripts = [
        {"role": msg.role, "content": msg.transcript}
        for msg in messages
    ]

    # Get clinical context if available
    clinical_context = get_clinical_context_for_conversation(
        db, request.conversation_id
    )

    # Extract SOAP note
    extractor = SOAPNoteExtractor()
    soap_note = extractor.extract_soap_note(transcripts, clinical_context)

    # Save SOAP note
    note = SOAPNote(
        conversation_id=request.conversation_id,
        user_id=current_user.id,
        subjective=soap_note["subjective"],
        objective=soap_note["objective"],
        assessment=soap_note["assessment"],
        plan=soap_note["plan"],
    )
    db.add(note)
    db.commit()
    db.refresh(note)

    return SOAPNoteResponse.from_orm(note)
```

**Frontend: SOAP Note Generator UI**

```tsx
// apps/web-app/src/components/voice/SOAPNoteGenerator.tsx

export function SOAPNoteGenerator({
  conversationId,
  onClose,
}: SOAPNoteGeneratorProps) {
  const [soapNote, setSOAPNote] = useState<SOAPNote | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateNote = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const note = await apiClient.generateSOAPNote({ conversation_id: conversationId });
      setSOAPNote(note);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="SOAP Note Generator" size="large">
      {!soapNote && (
        <div className="text-center py-8">
          <p className="text-neutral-600 mb-4">
            Generate a structured SOAP note from your voice conversation
          </p>
          <Button
            variant="primary"
            onClick={generateNote}
            disabled={isGenerating}
          >
            {isGenerating ? "Generating..." : "Generate SOAP Note"}
          </Button>
        </div>
      )}

      {soapNote && (
        <div className="space-y-4">
          {/* Subjective */}
          <div>
            <h3 className="font-semibold text-lg mb-2">Subjective</h3>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded">
              <p className="text-sm whitespace-pre-wrap">{soapNote.subjective}</p>
            </div>
          </div>

          {/* Objective */}
          <div>
            <h3 className="font-semibold text-lg mb-2">Objective</h3>
            <div className="p-3 bg-green-50 border border-green-200 rounded">
              <p className="text-sm whitespace-pre-wrap">{soapNote.objective}</p>
            </div>
          </div>

          {/* Assessment */}
          <div>
            <h3 className="font-semibold text-lg mb-2">Assessment</h3>
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-sm whitespace-pre-wrap">{soapNote.assessment}</p>
            </div>
          </div>

          {/* Plan */}
          <div>
            <h3 className="font-semibold text-lg mb-2">Plan</h3>
            <div className="p-3 bg-purple-50 border border-purple-200 rounded">
              <p className="text-sm whitespace-pre-wrap">{soapNote.plan}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex space-x-3 pt-4 border-t">
            <Button variant="primary" onClick={() => {
              // Copy to clipboard
              navigator.clipboard.writeText(formatSOAPNote(soapNote));
              toast.success("Copied to clipboard");
            }}>
              Copy Note
            </Button>
            <Button variant="outline" onClick={() => {
              // Export as PDF
              exportSOAPNotePDF(soapNote);
            }}>
              Export PDF
            </Button>
            <Button variant="outline" onClick={() => {
              // Add to EHR
              addToEHR(soapNote);
            }}>
              Add to EHR
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
    </Modal>
  );
}
```

---

### 4.3 Medical Entity Recognition

**Priority:** 🟢 P2 (Medium)
**Effort:** Large (10-12 days)
**Impact:** High

#### Enhancement

Use NLP to extract medical entities from transcripts:

```python
# services/api-gateway/app/services/medical_ner.py

from typing import List, Dict
import spacy

class MedicalNER:
    """
    Extract medical entities from text using scispaCy.

    Entities:
    - DISEASE: Diseases, conditions, syndromes
    - DRUG: Medications, drugs
    - PROCEDURE: Medical procedures
    - ANATOMY: Anatomical structures
    - SYMPTOM: Symptoms
    """

    def __init__(self):
        # Load scispaCy model
        self.nlp = spacy.load("en_core_sci_md")

    def extract_entities(self, text: str) -> List[Dict]:
        """Extract medical entities from text."""
        doc = self.nlp(text)

        entities = []
        for ent in doc.ents:
            entities.append({
                "text": ent.text,
                "type": ent.label_,
                "start": ent.start_char,
                "end": ent.end_char,
                "confidence": 1.0,  # scispaCy doesn't provide confidence
            })

        return entities

    def extract_from_conversation(
        self,
        transcripts: List[Dict[str, str]]
    ) -> Dict[str, List[str]]:
        """
        Extract entities from entire conversation.

        Returns:
            Dict with entity types as keys, lists of unique entities as values
        """
        all_entities = {
            "diseases": set(),
            "drugs": set(),
            "procedures": set(),
            "symptoms": set(),
        }

        for transcript in transcripts:
            entities = self.extract_entities(transcript["content"])

            for entity in entities:
                if entity["type"] == "DISEASE":
                    all_entities["diseases"].add(entity["text"])
                elif entity["type"] == "DRUG":
                    all_entities["drugs"].add(entity["text"])
                elif entity["type"] == "PROCEDURE":
                    all_entities["procedures"].add(entity["text"])
                elif "SYMPTOM" in entity["type"]:
                    all_entities["symptoms"].add(entity["text"])

        # Convert sets to lists
        return {k: list(v) for k, v in all_entities.items()}
```

**Frontend: Entity Highlighting**

```tsx
// Highlight entities in transcript display

function TranscriptWithEntities({
  text,
  entities
}: {
  text: string;
  entities: MedicalEntity[]
}) {
  // Sort entities by start position
  const sortedEntities = entities.sort((a, b) => a.start - b.start);

  const segments: React.ReactNode[] = [];
  let lastEnd = 0;

  for (const entity of sortedEntities) {
    // Add text before entity
    if (entity.start > lastEnd) {
      segments.push(text.slice(lastEnd, entity.start));
    }

    // Add highlighted entity
    segments.push(
      <mark
        key={entity.start}
        className={getEntityClassName(entity.type)}
        title={`${entity.type} (${(entity.confidence * 100).toFixed(0)}%)`}
      >
        {entity.text}
      </mark>
    );

    lastEnd = entity.end;
  }

  // Add remaining text
  if (lastEnd < text.length) {
    segments.push(text.slice(lastEnd));
  }

  return <>{segments}</>;
}

function getEntityClassName(type: string): string {
  switch (type) {
    case "DISEASE":
      return "bg-red-100 text-red-900 px-1 rounded";
    case "DRUG":
      return "bg-blue-100 text-blue-900 px-1 rounded";
    case "PROCEDURE":
      return "bg-green-100 text-green-900 px-1 rounded";
    case "SYMPTOM":
      return "bg-yellow-100 text-yellow-900 px-1 rounded";
    default:
      return "bg-neutral-100 text-neutral-900 px-1 rounded";
  }
}
```

---

## Phase 5: Advanced Features

**Goal:** Add cutting-edge capabilities to differentiate Voice Mode.

### 5.1 Multi-Language Support

**Priority:** 🟢 P2 (Medium)
**Effort:** Medium (6-8 days)
**Impact:** Medium

#### Enhancement

**Backend: Language Detection**

```python
from langdetect import detect

def detect_language(text: str) -> str:
    """Detect language of text."""
    try:
        return detect(text)
    except:
        return "en"  # Default to English


@router.post("/voice/realtime-session")
async def create_realtime_session(
    request: RealtimeSessionRequest,
    current_user: User = Depends(get_current_user),
):
    # ... existing code

    # Detect user's preferred language (from profile or recent messages)
    user_language = current_user.preferred_language or "en"

    # Update voice config with language
    config["voice_config"]["input_audio_transcription"]["language"] = user_language

    # Adjust system instructions for language
    config["voice_config"]["instructions"] = get_multilingual_instructions(user_language)

    return config


def get_multilingual_instructions(language: str) -> str:
    """Get system instructions in specified language."""
    instructions = {
        "en": "You are a helpful medical AI assistant...",
        "es": "Eres un asistente médico de IA útil...",
        "fr": "Vous êtes un assistant médical IA utile...",
        "de": "Sie sind ein hilfreicher medizinischer KI-Assistent...",
        "zh": "您是一位有用的医疗人工智能助手...",
    }
    return instructions.get(language, instructions["en"])
```

**Frontend: Language Selection**

```tsx
// In VoiceSettingsModal

<div>
  <label className="block text-sm font-medium mb-2">
    Conversation Language
  </label>
  <select
    value={settings.language}
    onChange={(e) => setSettings({ ...settings, language: e.target.value })}
    className="w-full border rounded px-3 py-2"
  >
    <option value="en">🇺🇸 English</option>
    <option value="es">🇪🇸 Español (Spanish)</option>
    <option value="fr">🇫🇷 Français (French)</option>
    <option value="de">🇩🇪 Deutsch (German)</option>
    <option value="it">🇮🇹 Italiano (Italian)</option>
    <option value="pt">🇵🇹 Português (Portuguese)</option>
    <option value="zh">🇨🇳 中文 (Chinese)</option>
    <option value="ja">🇯🇵 日本語 (Japanese)</option>
    <option value="ko">🇰🇷 한국어 (Korean)</option>
    <option value="ar">🇸🇦 العربية (Arabic)</option>
    <option value="hi">🇮🇳 हिन्दी (Hindi)</option>
  </select>
  <p className="text-xs text-neutral-500 mt-1">
    Language for voice recognition and AI responses
  </p>
</div>
```

---

### 5.2 Offline Support (Progressive Web App)

**Priority:** 🟢 P3 (Low)
**Effort:** Large (15-20 days)
**Impact:** Medium

#### Enhancement

**Service Worker for Caching:**

```javascript
// apps/web-app/public/sw.js

const CACHE_NAME = "voiceassist-v1";
const OFFLINE_URLS = [
  "/",
  "/offline.html",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
];

// Install service worker
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_URLS);
    })
  );
});

// Serve from cache when offline
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    }).catch(() => {
      // Offline fallback
      if (event.request.destination === "document") {
        return caches.match("/offline.html");
      }
    })
  );
});
```

**Offline Voice Recording (IndexedDB):**

```typescript
// Queue voice messages for sync when back online

import { openDB } from "idb";

const db = await openDB("voiceassist-offline", 1, {
  upgrade(db) {
    db.createObjectStore("pendingMessages", { keyPath: "id", autoIncrement: true });
  },
});

// Save message offline
async function queueMessageForSync(message: VoiceMessage) {
  await db.add("pendingMessages", {
    ...message,
    timestamp: Date.now(),
  });
}

// Sync when back online
window.addEventListener("online", async () => {
  const pending = await db.getAll("pendingMessages");

  for (const msg of pending) {
    try {
      await apiClient.saveVoiceMessage(msg);
      await db.delete("pendingMessages", msg.id);
    } catch (err) {
      console.error("Failed to sync message:", err);
    }
  }
});
```

---

### 5.3 Voice Analytics & Insights

**Priority:** 🟢 P3 (Low)
**Effort:** Medium (8-10 days)
**Impact:** Medium

#### Enhancement

**Backend: Voice Analytics**

```python
# services/api-gateway/app/services/voice_analytics.py

class VoiceAnalytics:
    """Analyze voice conversation patterns and generate insights."""

    def analyze_conversation(
        self,
        conversation_id: int,
        db: Session
    ) -> Dict[str, Any]:
        """Generate analytics for a voice conversation."""

        messages = db.query(VoiceMessage).filter(
            VoiceMessage.conversation_id == conversation_id
        ).all()

        # Calculate metrics
        total_duration = sum(m.duration_ms for m in messages if m.duration_ms) / 1000
        user_messages = [m for m in messages if m.role == "user"]
        assistant_messages = [m for m in messages if m.role == "assistant"]

        avg_latency = sum(m.latency_ms for m in messages if m.latency_ms) / len(messages)

        # Word count
        user_words = sum(len(m.transcript.split()) for m in user_messages)
        assistant_words = sum(len(m.transcript.split()) for m in assistant_messages)

        # Speaking rate (words per minute)
        user_wpm = (user_words / total_duration) * 60 if total_duration > 0 else 0

        # Sentiment analysis (simplified)
        sentiment = self._analyze_sentiment([m.transcript for m in user_messages])

        # Medical entities
        entities = self._extract_medical_entities([m.transcript for m in messages])

        return {
            "total_duration_sec": total_duration,
            "message_count": len(messages),
            "user_message_count": len(user_messages),
            "assistant_message_count": len(assistant_messages),
            "avg_latency_ms": avg_latency,
            "user_speaking_rate_wpm": user_wpm,
            "sentiment": sentiment,
            "medical_entities": entities,
        }
```

**Frontend: Analytics Dashboard**

```tsx
// apps/web-app/src/components/voice/VoiceAnalyticsDashboard.tsx

export function VoiceAnalyticsDashboard({ conversationId }: Props) {
  const [analytics, setAnalytics] = useState<VoiceAnalytics | null>(null);

  useEffect(() => {
    apiClient.getVoiceAnalytics(conversationId).then(setAnalytics);
  }, [conversationId]);

  if (!analytics) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* Session metrics */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          title="Duration"
          value={formatDuration(analytics.total_duration_sec)}
          icon="⏱️"
        />
        <MetricCard
          title="Messages"
          value={analytics.message_count}
          icon="💬"
        />
        <MetricCard
          title="Avg Latency"
          value={`${analytics.avg_latency_ms}ms`}
          icon="⚡"
        />
      </div>

      {/* Speaking rate */}
      <div className="p-4 bg-white rounded-lg border">
        <h3 className="font-semibold mb-2">Speaking Rate</h3>
        <p className="text-2xl font-bold text-primary-600">
          {analytics.user_speaking_rate_wpm.toFixed(0)} WPM
        </p>
        <p className="text-xs text-neutral-500 mt-1">
          Average: 150-160 WPM
        </p>
      </div>

      {/* Medical entities */}
      <div className="p-4 bg-white rounded-lg border">
        <h3 className="font-semibold mb-3">Medical Concepts Discussed</h3>
        <div className="space-y-2">
          {analytics.medical_entities.diseases.length > 0 && (
            <EntityBadges
              title="Conditions"
              entities={analytics.medical_entities.diseases}
              color="red"
            />
          )}
          {analytics.medical_entities.drugs.length > 0 && (
            <EntityBadges
              title="Medications"
              entities={analytics.medical_entities.drugs}
              color="blue"
            />
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## Phase 6: Security & Compliance

**Goal:** Ensure Voice Mode meets healthcare security and compliance standards.

### 6.1 Ephemeral API Key Generation

**Priority:** 🔴 P0 (Critical)
**Effort:** Medium (5-7 days)
**Impact:** Very High
**Status:** ✅ **IMPLEMENTED** (2025-11-25)

#### Implementation Summary

The ephemeral token system has been implemented using **OpenAI's native ephemeral session API** rather than a custom JWT wrapper. This provides better security and compatibility with OpenAI's Realtime API.

**Key Changes:**
1. Backend calls `POST /v1/realtime/sessions` to get real OpenAI ephemeral client secrets
2. Client secrets (starting with `ek_`) are time-limited (typically 60 seconds)
3. Frontend receives `auth.token` instead of raw `api_key`
4. WebSocket connection uses ephemeral token for authentication
5. Raw `OPENAI_API_KEY` never leaves the backend

#### Implemented Solution

**Backend: OpenAI Ephemeral Session Integration**

The implementation calls OpenAI's native session creation endpoint to obtain real ephemeral client secrets:

```python
# services/api-gateway/app/services/realtime_voice_service.py

async def create_openai_ephemeral_session(
    self, model: str, voice: str = "alloy"
) -> Dict[str, Any]:
    """
    Create an ephemeral session with OpenAI's Realtime API.

    Returns:
        Dict containing:
        - client_secret: Ephemeral token for client use (starts with "ek_")
        - expires_at: Unix timestamp when token expires
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/realtime/sessions",
            headers={
                "Authorization": f"Bearer {self.api_key}",  # Server-side key
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "voice": voice,
            },
        )

        data = response.json()
        client_secret_data = data.get("client_secret", {})

        return {
            "client_secret": client_secret_data.get("value"),
            "expires_at": client_secret_data.get("expires_at"),
        }

async def generate_session_config(
    self, user_id: str, conversation_id: str | None = None
) -> Dict[str, Any]:
    """Generate session configuration with OpenAI ephemeral token."""

    # Create ephemeral session with OpenAI
    openai_session = await self.create_openai_ephemeral_session(
        model=self.model,
        voice="alloy",
    )

    client_secret = openai_session["client_secret"]
    expires_at = openai_session["expires_at"]

    # Return config with ephemeral token
    return {
        "url": self.base_url,
        "model": self.model,
        "session_id": session_id,
        "expires_at": expires_at,
        "conversation_id": conversation_id,
        "auth": {
            "type": "ephemeral_token",
            "token": client_secret,  # Real OpenAI ephemeral token
            "expires_at": expires_at,
        },
        "voice_config": { ... },
    }
```

**API Response Format:**

```typescript
// GET /api/voice/realtime-session response
{
  "url": "wss://api.openai.com/v1/realtime",
  "model": "gpt-4o-realtime-preview-2024-12-17",
  "session_id": "rtc_user123_xyz",
  "expires_at": 1732534800,
  "conversation_id": null,
  "auth": {
    "type": "ephemeral_token",
    "token": "ek_...",  // OpenAI ephemeral client secret
    "expires_at": 1732534800
  },
  "voice_config": {
    "voice": "alloy",
    "modalities": ["text", "audio"],
    "input_audio_format": "pcm16",
    "output_audio_format": "pcm16",
    "input_audio_transcription": {"model": "whisper-1"},
    "turn_detection": {
      "type": "server_vad",
      "threshold": 0.5,
      "prefix_padding_ms": 300,
      "silence_duration_ms": 500
    }
  }
}
```

**Frontend: WebSocket Authentication**

```typescript
// apps/web-app/src/hooks/useRealtimeVoiceSession.ts

const initializeWebSocket = (config: RealtimeSessionConfig) => {
  const wsUrl = `${config.url}?model=${config.model}`;
  const ws = new WebSocket(wsUrl, [
    "realtime",
    "openai-beta.realtime-v1",
    `openai-insecure-api-key.${config.auth.token}`,  // Use ephemeral token
  ]);

  // ... WebSocket event handlers
};
```

**Security Benefits:**
- ✅ Raw `OPENAI_API_KEY` never sent to browser
- ✅ Tokens expire automatically (typically 60 seconds)
- ✅ Tokens are session-specific and cannot be reused
- ✅ No custom token validation needed (OpenAI handles it)
- ✅ Compatible with OpenAI's authentication flow

**Testing Strategy:**

The implementation includes CI-safe tests that avoid hitting live OpenAI endpoints by default:

```python
# tests/integration/test_openai_config.py

# CI-safe test (runs always) - uses mocked OpenAI calls
@pytest.mark.asyncio
async def test_realtime_service_generates_session_config_mocked(self):
    """Test session config generation with mocked OpenAI call (CI-safe)."""

    # Mock the OpenAI session creation
    mock_openai_session = {
        "client_secret": "ek_test_mock_ephemeral_token_abc123",
        "expires_at": int(time.time()) + 300,
    }

    with patch.object(
        service, "create_openai_ephemeral_session",
        new=AsyncMock(return_value=mock_openai_session)
    ):
        config = await service.generate_session_config(
            user_id="test-user-123",
            conversation_id="conv-456"
        )

    # Verify auth structure
    assert "auth" in config
    assert config["auth"]["type"] == "ephemeral_token"
    assert config["auth"]["token"] == "ek_test_mock_ephemeral_token_abc123"
    assert "api_key" not in config  # Security check

# Live test (only runs with LIVE_REALTIME_TESTS=1)
@pytest.mark.skipif(
    not LIVE_REALTIME_TESTS,
    reason="Live Realtime tests disabled. Set LIVE_REALTIME_TESTS=1 to enable.",
)
@pytest.mark.asyncio
async def test_live_realtime_session_creation(self):
    """Test live OpenAI Realtime session creation."""

    config = await service.generate_session_config(
        user_id="live-test-user",
        conversation_id=None
    )

    # Verify real OpenAI ephemeral token format
    token = config["auth"]["token"]
    assert token.startswith("ek_"), "OpenAI ephemeral token should start with 'ek_'"
```

**Running Tests:**
```bash
# Run CI-safe tests only (default)
pytest tests/integration/test_openai_config.py -v

# Run live Realtime tests (requires valid OPENAI_API_KEY)
LIVE_REALTIME_TESTS=1 pytest tests/integration/test_openai_config.py -v
```

**Legacy HMAC Methods:**

For future server-side proxy implementations, HMAC-based token methods are still available:

```python
# DEPRECATED FOR DIRECT CLIENT USE - KEPT FOR FUTURE PROXY
class EphemeralTokenService:
    """
    Generate short-lived tokens for OpenAI Realtime API access.

    Instead of exposing the full API key, generate JWT tokens that:
    - Expire after a short duration (15-30 minutes)
    - Are tied to a specific user and session
    - Can be validated by OpenAI or a proxy
    """

    def __init__(self):
        self.secret_key = settings.JWT_SECRET_KEY
        self.token_expiry = 1800  # 30 minutes

    def generate_token(
        self,
        user_id: str,
        session_id: str
    ) -> str:
        """Generate ephemeral token for voice session."""

        payload = {
            "user_id": user_id,
            "session_id": session_id,
            "iat": int(time.time()),
            "exp": int(time.time()) + self.token_expiry,
            "purpose": "realtime_voice",
        }

        token = jwt.encode(payload, self.secret_key, algorithm="HS256")
        return token

    def validate_token(self, token: str) -> Dict:
        """Validate and decode token."""
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=["HS256"])
            return payload
        except jwt.ExpiredSignatureError:
            raise ValueError("Token expired")
        except jwt.InvalidTokenError:
            raise ValueError("Invalid token")


# Use in realtime session endpoint
def generate_session_config(user_id: str, conversation_id: str | None) -> Dict:
    # ... existing code

    # Generate ephemeral token instead of using full API key
    token_service = EphemeralTokenService()
    ephemeral_token = token_service.generate_token(user_id, session_id)

    config["api_key"] = ephemeral_token  # Use token instead of real key

    # Return proxy URL that validates token
    config["url"] = f"{settings.REALTIME_PROXY_URL}"  # Our proxy, not direct OpenAI

    return config
```

**Proxy Server for Token Validation:**

```python
# services/api-gateway/app/api/voice_proxy.py

from fastapi import WebSocket, WebSocketDisconnect, Header, HTTPException
import websockets

@router.websocket("/voice/proxy")
async def voice_proxy(
    websocket: WebSocket,
    authorization: str = Header(...),
):
    """
    WebSocket proxy that validates ephemeral tokens and forwards to OpenAI.

    Flow:
    1. Client connects with ephemeral token
    2. Proxy validates token
    3. Proxy opens connection to OpenAI with real API key
    4. Proxy bidirectionally forwards messages
    """
    await websocket.accept()

    try:
        # Validate token
        token = authorization.replace("Bearer ", "")
        token_service = EphemeralTokenService()
        payload = token_service.validate_token(token)

        user_id = payload["user_id"]
        session_id = payload["session_id"]

        logger.info(f"Voice proxy connection for user {user_id}, session {session_id}")

        # Connect to OpenAI with real API key
        openai_ws_url = f"wss://api.openai.com/v1/realtime?model={settings.REALTIME_MODEL}"

        async with websockets.connect(
            openai_ws_url,
            extra_headers={
                "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                "OpenAI-Beta": "realtime=v1",
            }
        ) as openai_ws:

            # Bidirectional message forwarding
            async def forward_to_openai():
                while True:
                    data = await websocket.receive_text()
                    await openai_ws.send(data)

            async def forward_to_client():
                async for message in openai_ws:
                    await websocket.send_text(message)

            # Run both tasks concurrently
            await asyncio.gather(
                forward_to_openai(),
                forward_to_client(),
            )

    except ValueError as e:
        await websocket.close(code=1008, reason=str(e))
    except WebSocketDisconnect:
        logger.info(f"Voice proxy disconnected for session {session_id}")
```

**Security Benefits:**
- ✅ Real API key never exposed to client
- ✅ Tokens expire automatically
- ✅ Tokens tied to specific users/sessions
- ✅ Centralized access control and logging
- ✅ Can revoke tokens without changing API key

---

### 6.2 Audit Logging

**Priority:** 🔴 P0 (Critical)
**Effort:** Medium (4-6 days)
**Impact:** High

#### Enhancement

```python
# services/api-gateway/app/models/voice_audit_log.py

class VoiceAuditLog(Base):
    """Audit log for voice interactions (HIPAA compliance)."""
    __tablename__ = "voice_audit_logs"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    session_id = Column(String(255), nullable=False, index=True)

    # Event details
    event_type = Column(String(50), nullable=False)  # "session_start", "message_sent", "session_end"
    event_data = Column(JSON, nullable=True)

    # Access metadata
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(512), nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


# Logging service
class VoiceAuditLogger:
    def log_event(
        self,
        db: Session,
        user_id: int,
        session_id: str,
        event_type: str,
        event_data: Dict,
        request: Request,
    ):
        """Log voice event for audit trail."""

        audit_log = VoiceAuditLog(
            user_id=user_id,
            session_id=session_id,
            event_type=event_type,
            event_data=event_data,
            ip_address=request.client.host,
            user_agent=request.headers.get("user-agent"),
        )

        db.add(audit_log)
        db.commit()

        # Also log to external audit system (e.g., CloudWatch, Splunk)
        logger.info(
            f"Voice audit: {event_type}",
            extra={
                "user_id": user_id,
                "session_id": session_id,
                "event_type": event_type,
                "ip": request.client.host,
            }
        )


# Use in endpoints
@router.post("/voice/realtime-session")
async def create_realtime_session(
    request: RealtimeSessionRequest,
    current_user: User = Depends(get_current_user),
    http_request: Request,
    db: Session = Depends(get_db),
):
    # ... create session

    # Log session creation
    audit_logger = VoiceAuditLogger()
    audit_logger.log_event(
        db=db,
        user_id=current_user.id,
        session_id=config["session_id"],
        event_type="session_start",
        event_data={"conversation_id": request.conversation_id},
        request=http_request,
    )

    return config
```

---

### 6.3 PHI Redaction (De-identification)

**Priority:** 🟡 P1 (High)
**Effort:** Large (10-12 days)
**Impact:** Very High

#### Enhancement

```python
# services/api-gateway/app/services/phi_redaction.py

import re
from typing import List, Tuple

class PHIRedactor:
    """
    Redact Protected Health Information (PHI) from text.

    HIPAA identifiers to redact:
    - Names, addresses, phone numbers
    - SSN, medical record numbers
    - Dates (except year)
    - Geographic subdivisions smaller than state
    - Account numbers, certificate/license numbers
    """

    def __init__(self):
        self.patterns = [
            # SSN: 123-45-6789
            (r'\b\d{3}-\d{2}-\d{4}\b', '[SSN]'),

            # Phone: (123) 456-7890 or 123-456-7890
            (r'\b(\+\d{1,2}\s?)?(\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b', '[PHONE]'),

            # Email
            (r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[EMAIL]'),

            # Dates (MM/DD/YYYY, MM-DD-YYYY)
            (r'\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b', '[DATE]'),

            # Addresses (simplified - street numbers + street names)
            (r'\b\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b', '[ADDRESS]'),

            # ZIP codes
            (r'\b\d{5}(-\d{4})?\b', '[ZIP]'),

            # Medical record numbers (MRN: followed by digits)
            (r'\b(?:MRN|Medical Record Number):?\s*\d+\b', '[MRN]'),
        ]

    def redact(self, text: str, preserve_context: bool = True) -> Tuple[str, List[Dict]]:
        """
        Redact PHI from text.

        Args:
            text: Original text
            preserve_context: If True, replace with tokens like [NAME]; if False, remove entirely

        Returns:
            Tuple of (redacted_text, list_of_redactions)
        """
        redacted = text
        redactions = []

        for pattern, replacement in self.patterns:
            matches = re.finditer(pattern, redacted, re.IGNORECASE)

            for match in matches:
                redactions.append({
                    "original": match.group(0),
                    "replacement": replacement,
                    "start": match.start(),
                    "end": match.end(),
                    "type": replacement.strip('[]'),
                })

                if preserve_context:
                    redacted = redacted[:match.start()] + replacement + redacted[match.end():]
                else:
                    redacted = redacted[:match.start()] + redacted[match.end():]

        return redacted, redactions

    def redact_for_logging(self, text: str) -> str:
        """Redact text for safe logging (more aggressive)."""
        redacted, _ = self.redact(text, preserve_context=False)
        return redacted


# Use in voice message storage
@router.post("/voice/messages")
async def save_voice_message(
    request: VoiceMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Redact PHI before storing
    redactor = PHIRedactor()
    redacted_transcript, redactions = redactor.redact(request.transcript)

    voice_message = VoiceMessage(
        conversation_id=request.conversation_id,
        session_id=request.session_id,
        role=request.role,
        transcript=redacted_transcript,  # Store redacted version
        original_transcript_encrypted=encrypt(request.transcript),  # Store encrypted original
        redactions=redactions,  # Store redaction metadata
        is_final=request.is_final,
    )

    db.add(voice_message)
    db.commit()

    return VoiceMessageResponse.from_orm(voice_message)
```

---

## Phase 7: Monitoring & Observability

**Goal:** Instrument Voice Mode for production monitoring and troubleshooting.

### 7.1 Voice Session Metrics

**Priority:** 🟡 P1 (High)
**Effort:** Medium (5-7 days)
**Impact:** High

#### Enhancement

**Backend: Prometheus Metrics**

```python
# services/api-gateway/app/monitoring/voice_metrics.py

from prometheus_client import Counter, Histogram, Gauge

# Session metrics
voice_sessions_total = Counter(
    "voice_sessions_total",
    "Total number of voice sessions",
    ["status"]  # "started", "completed", "failed"
)

voice_session_duration = Histogram(
    "voice_session_duration_seconds",
    "Voice session duration",
    buckets=[10, 30, 60, 120, 300, 600, 1800, 3600]
)

voice_messages_total = Counter(
    "voice_messages_total",
    "Total voice messages",
    ["role"]  # "user", "assistant"
)

# Performance metrics
voice_latency = Histogram(
    "voice_latency_milliseconds",
    "Latency for voice responses",
    buckets=[50, 100, 200, 500, 1000, 2000, 5000]
)

voice_transcription_errors = Counter(
    "voice_transcription_errors_total",
    "Transcription errors"
)

# Active sessions
voice_active_sessions = Gauge(
    "voice_active_sessions",
    "Number of active voice sessions"
)


# Use in endpoints
@router.post("/voice/realtime-session")
async def create_realtime_session(...):
    voice_sessions_total.labels(status="started").inc()
    voice_active_sessions.inc()

    # ... create session

    return config


@router.post("/voice/messages")
async def save_voice_message(...):
    voice_messages_total.labels(role=request.role).inc()

    if request.latency_ms:
        voice_latency.observe(request.latency_ms)

    # ... save message
```

**Grafana Dashboard:**

```yaml
# dashboards/voice-mode.json

{
  "dashboard": {
    "title": "Voice Mode Metrics",
    "panels": [
      {
        "title": "Active Sessions",
        "targets": [
          {
            "expr": "voice_active_sessions"
          }
        ]
      },
      {
        "title": "Session Success Rate",
        "targets": [
          {
            "expr": "rate(voice_sessions_total{status=\"completed\"}[5m]) / rate(voice_sessions_total[5m])"
          }
        ]
      },
      {
        "title": "Avg Session Duration",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(voice_session_duration_seconds_bucket[5m]))"
          }
        ]
      },
      {
        "title": "Voice Latency (p95)",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(voice_latency_milliseconds_bucket[5m]))"
          }
        ]
      }
    ]
  }
}
```

---

### 7.2 Error Tracking & Alerting

**Priority:** 🟡 P1 (High)
**Effort:** Small (3-4 days)
**Impact:** Medium

#### Enhancement

**Sentry Integration:**

```typescript
// apps/web-app/src/hooks/useRealtimeVoiceSession.ts

import * as Sentry from "@sentry/react";

const handleError = useCallback((err: Error) => {
  console.error("[RealtimeVoiceSession] Error:", err);

  // Report to Sentry with context
  Sentry.captureException(err, {
    tags: {
      feature: "voice_mode",
      session_id: sessionConfig?.session_id,
      connection_status: status,
    },
    contexts: {
      voice_session: {
        conversation_id: options.conversation_id,
        model: sessionConfig?.model,
        voice: sessionConfig?.voice_config?.voice,
        network_quality: networkQuality,
      },
    },
  });

  setError(err);
  updateStatus("error");
  options.onError?.(err);
}, [sessionConfig, status, options, networkQuality]);
```

**Alerts (PagerDuty/Slack):**

```yaml
# monitoring/alerts/voice-mode.yml

groups:
  - name: voice_mode
    interval: 1m
    rules:
      # High error rate
      - alert: VoiceSessionHighErrorRate
        expr: rate(voice_sessions_total{status="failed"}[5m]) / rate(voice_sessions_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High voice session error rate ({{ $value | humanizePercentage }})"

      # High latency
      - alert: VoiceHighLatency
        expr: histogram_quantile(0.95, rate(voice_latency_milliseconds_bucket[5m])) > 2000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Voice latency p95 > 2s ({{ $value }}ms)"

      # No active sessions (potential outage)
      - alert: VoiceNoActiveSessions
        expr: voice_active_sessions == 0 and rate(voice_sessions_total[30m]) > 0
        for: 15m
        labels:
          severity: critical
        annotations:
          summary: "No active voice sessions despite recent activity"
```

---

## Phase 8: Testing & Quality Assurance

**Goal:** Comprehensive test coverage for Voice Mode reliability.

### 8.1 Expanded E2E Test Coverage

**Priority:** 🔴 P0 (Critical)
**Effort:** Medium (6-8 days)
**Impact:** High

#### Enhancement

```typescript
// e2e/ai/voice-mode-advanced.spec.ts

import { test, expect } from "@playwright/test";
import { setupAuthenticatedState, stubMediaDevices } from "../fixtures/auth";

test.describe("Voice Mode - Advanced Scenarios", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedState(page);
    await stubMediaDevices(page);
  });

  test("should auto-reconnect after network interruption", async ({ page, context }) => {
    // Open voice mode
    await page.goto("/chat");
    await page.click('[data-testid="voice-mode-toggle"]');
    await page.click('[data-testid="start-voice-session"]');
    await expect(page.locator('text=Connected')).toBeVisible();

    // Simulate network disconnection
    await context.setOffline(true);

    // Should show reconnecting state
    await expect(page.locator('text=Reconnecting...')).toBeVisible({ timeout: 5000 });

    // Restore network
    await context.setOffline(false);

    // Should reconnect automatically
    await expect(page.locator('text=Connected')).toBeVisible({ timeout: 10000 });
  });

  test("should handle session expiry gracefully", async ({ page }) => {
    // Mock session config with near-expiry
    await page.route('/api/voice/realtime-session', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          url: "wss://api.openai.com/v1/realtime",
          model: "gpt-4o-realtime-preview-2024-10-01",
          api_key: "test-key",
          session_id: "test-session",
          expires_at: Math.floor(Date.now() / 1000) + 5, // Expires in 5 seconds
          voice_config: { /* ... */ },
        }),
      });
    });

    await page.goto("/chat");
    await page.click('[data-testid="voice-mode-toggle"]');
    await page.click('[data-testid="start-voice-session"]');

    // Wait for expiry
    await page.waitForTimeout(6000);

    // Should show expiry warning
    await expect(page.locator('text=Session expired')).toBeVisible();
  });

  test("should save transcripts to conversation history", async ({ page }) => {
    await page.goto("/chat");
    await page.click('[data-testid="voice-mode-toggle"]');
    await page.click('[data-testid="start-voice-session"]');

    // Simulate receiving transcripts
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('voice-transcript', {
        detail: {
          text: "What are the symptoms of diabetes?",
          is_final: true,
          role: "user",
        },
      }));
    });

    await page.waitForTimeout(1000);

    // Close voice panel
    await page.click('[data-testid="close-voice-mode"]');

    // Check that transcript appears in chat history
    await expect(page.locator('.message-list')).toContainText("What are the symptoms of diabetes?");
  });

  test("should execute voice command for vital signs", async ({ page }) => {
    await page.goto("/chat");
    await page.click('[data-testid="voice-mode-toggle"]');
    await page.click('[data-testid="start-voice-session"]');

    // Simulate voice command
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('voice-transcript', {
        detail: {
          text: "Add vital signs: blood pressure 120 over 80, heart rate 72",
          is_final: true,
          role: "user",
        },
      }));
    });

    // Should show command confirmation
    await expect(page.locator('text=Voice Command Detected')).toBeVisible();
    await expect(page.locator('text=Add Vital Signs')).toBeVisible();
    await expect(page.locator('text=120/80')).toBeVisible();

    // Execute command
    await page.click('button:has-text("Execute")');

    // Verify vital signs were added
    await expect(page.locator('text=Vital signs added')).toBeVisible();
  });

  test("should handle microphone permission denial gracefully", async ({ page, context }) => {
    // Deny microphone permission
    await context.grantPermissions([]);

    await page.goto("/chat");
    await page.click('[data-testid="voice-mode-toggle"]');
    await page.click('[data-testid="start-voice-session"]');

    // Should fall back to text mode
    await expect(page.locator('text=Microphone unavailable - using text mode')).toBeVisible();

    // Should still show connected status (text-only mode)
    await expect(page.locator('text=Connected')).toBeVisible();
  });
});
```

---

### 8.2 Load Testing

**Priority:** 🟢 P2 (Medium)
**Effort:** Medium (5-6 days)
**Impact:** Medium

#### Enhancement

**Locust Load Test:**

```python
# load-tests/voice_mode_load.py

from locust import HttpUser, task, between
import json
import time

class VoiceModeUser(HttpUser):
    wait_time = between(5, 15)

    def on_start(self):
        """Login before starting voice sessions."""
        response = self.client.post("/api/auth/login", json={
            "email": "test@example.com",
            "password": "testpass",
        })
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}

    @task(3)
    def create_voice_session(self):
        """Create a voice session."""
        response = self.client.post(
            "/api/voice/realtime-session",
            headers=self.headers,
            json={"conversation_id": None},
        )

        if response.status_code == 200:
            session_config = response.json()
            self.session_id = session_config["session_id"]
        else:
            response.failure(f"Failed to create session: {response.status_code}")

    @task(5)
    def send_voice_message(self):
        """Simulate sending a voice message."""
        if not hasattr(self, "session_id"):
            return

        response = self.client.post(
            "/api/voice/messages",
            headers=self.headers,
            json={
                "conversation_id": 1,
                "session_id": self.session_id,
                "role": "user",
                "transcript": "What are the symptoms of hypertension?",
                "is_final": True,
                "latency_ms": 150,
            },
        )

        if response.status_code != 200:
            response.failure(f"Failed to send message: {response.status_code}")

    @task(1)
    def generate_soap_note(self):
        """Generate SOAP note from conversation."""
        response = self.client.post(
            "/api/voice/generate-soap-note",
            headers=self.headers,
            json={"conversation_id": 1},
        )

        if response.status_code != 200:
            response.failure(f"Failed to generate SOAP note: {response.status_code}")


# Run with:
# locust -f load-tests/voice_mode_load.py --host=https://api.asimo.io
```

**Target Metrics:**
- 100 concurrent voice sessions
- < 500ms average latency for session creation
- < 1000ms average latency for message storage
- < 5% error rate
- < 2s SOAP note generation time (p95)

---

## Implementation Priority Matrix

| Phase | Feature | Priority | Effort | Impact | Timeline |
|-------|---------|----------|--------|--------|----------|
| **P0 (Must Have - Q1 2026)** |
| 1.1 | Automatic Reconnection | 🔴 P0 | Medium | High | Week 1-2 |
| 1.2 | Session Expiry Handling | 🔴 P0 | Small | Medium | Week 2 |
| 2.1 | Transcript Persistence | 🔴 P0 | Medium | Very High | Week 3-4 |
| 3.1 | Bundle Size Optimization | 🔴 P0 | Medium | High | Week 5-6 |
| 6.1 | Ephemeral API Keys | 🔴 P0 | Medium | Very High | Week 7-8 |
| 6.2 | Audit Logging | 🔴 P0 | Medium | High | Week 8-9 |
| 8.1 | Expanded E2E Tests | 🔴 P0 | Medium | High | Week 9-10 |
| **P1 (Should Have - Q2 2026)** |
| 1.3 | Network Quality Monitoring | 🟡 P1 | Medium | Medium | Week 11-12 |
| 1.4 | Error Recovery & Degradation | 🟡 P1 | Medium | High | Week 13-14 |
| 2.2 | Voice Settings UI | 🟡 P1 | Medium | High | Week 15-16 |
| 3.2 | Audio Processing Optimization | 🟡 P1 | Medium | Medium | Week 17-18 |
| 4.1 | Voice Commands (Clinical) | 🟡 P1 | Large | Very High | Week 19-22 |
| 4.2 | SOAP Note Generation | 🟡 P1 | Large | Very High | Week 23-26 |
| 6.3 | PHI Redaction | 🟡 P1 | Large | Very High | Week 27-29 |
| 7.1 | Session Metrics & Monitoring | 🟡 P1 | Medium | High | Week 30-31 |
| 7.2 | Error Tracking & Alerting | 🟡 P1 | Small | Medium | Week 31-32 |
| **P2 (Nice to Have - Q3 2026)** |
| 2.3 | Keyboard Shortcuts | 🟢 P2 | Small | Medium | Week 33-34 |
| 2.4 | Visual Enhancements | 🟢 P2 | Small | Medium | Week 34-35 |
| 3.3 | WebSocket Message Batching | 🟢 P2 | Small | Low | Week 35 |
| 4.3 | Medical Entity Recognition | 🟢 P2 | Large | High | Week 36-38 |
| 5.1 | Multi-Language Support | 🟢 P2 | Medium | Medium | Week 39-40 |
| 8.2 | Load Testing | 🟢 P2 | Medium | Medium | Week 41-42 |
| **P3 (Future - Q4 2026)** |
| 5.2 | Offline Support (PWA) | 🟢 P3 | Large | Medium | Week 43-46 |
| 5.3 | Voice Analytics & Insights | 🟢 P3 | Medium | Medium | Week 47-48 |

---

## Success Metrics

### User Experience Metrics
- **Voice Session Success Rate:** > 95%
- **Average Session Duration:** 5-15 minutes (target)
- **User Satisfaction Score:** > 4.5/5
- **Net Promoter Score (NPS):** > 50

### Performance Metrics
- **Time to First Byte (TTFB):** < 200ms
- **Voice Recognition Latency:** < 500ms (p95)
- **AI Response Latency:** < 1000ms (p95)
- **Audio Playback Latency:** < 300ms
- **Bundle Load Time:** < 3s (on 4G)

### Reliability Metrics
- **Uptime:** > 99.9%
- **Auto-reconnect Success Rate:** > 90%
- **Error Rate:** < 2%
- **Transcript Save Success Rate:** > 99%

### Clinical Workflow Metrics
- **Voice Command Accuracy:** > 85%
- **SOAP Note Quality Score:** > 4/5 (physician rating)
- **Time Saved per Encounter:** > 5 minutes
- **Clinical Context Completion Rate:** > 80%

### Security & Compliance Metrics
- **PHI Redaction Accuracy:** > 99%
- **Audit Log Completeness:** 100%
- **Token Expiry Compliance:** 100%
- **HIPAA Compliance Score:** 100%

---

## Timeline & Resource Estimates

### Total Effort: ~48 weeks (1 year)

**Phase Breakdown:**
- **Phase 1 (Reliability):** 6 weeks, 1 senior engineer
- **Phase 2 (UX):** 8 weeks, 1 frontend engineer + 1 designer
- **Phase 3 (Performance):** 6 weeks, 1 senior engineer
- **Phase 4 (Clinical Integration):** 12 weeks, 2 engineers + 1 clinical advisor
- **Phase 5 (Advanced Features):** 8 weeks, 2 engineers
- **Phase 6 (Security):** 8 weeks, 1 security engineer + 1 backend engineer
- **Phase 7 (Monitoring):** 4 weeks, 1 DevOps engineer
- **Phase 8 (Testing):** 6 weeks, 1 QA engineer + 1 automation engineer

**Concurrent Tracks:**
- Reliability + Security: Can run in parallel (Weeks 1-9)
- UX + Performance: Can run in parallel (Weeks 10-18)
- Clinical + Advanced: Sequential (Weeks 19-38)
- Monitoring + Testing: Can run in parallel (Weeks 39-48)

**Minimum Viable Product (MVP+):**
- Focus on P0 items only
- Timeline: **10 weeks**
- Team: 2-3 engineers

**Full Feature Set:**
- All P0 + P1 items
- Timeline: **32 weeks** (8 months)
- Team: 4-5 engineers

---

## Risk Mitigation

### Technical Risks
1. **OpenAI API Changes:** Monitor beta API updates, maintain fallback options
2. **Browser Compatibility:** Extensive testing on Chrome, Safari, Firefox, Edge
3. **Audio Processing Performance:** Profile and optimize, use Web Workers
4. **WebSocket Scalability:** Load test early, implement connection pooling

### Compliance Risks
1. **HIPAA Violations:** Legal review of all voice features, regular audits
2. **Data Retention:** Clear policies, automated deletion after retention period
3. **Consent Management:** Explicit user consent for voice recording/processing

### User Adoption Risks
1. **Learning Curve:** In-app tutorials, onboarding videos, documentation
2. **Trust Issues:** Transparent privacy policy, opt-in model, clear benefits
3. **Performance Concerns:** Set clear expectations, provide feedback

---

## Conclusion

This enhancement plan transforms Voice Mode from a functional prototype into a **production-grade, physician-optimized voice interaction system** that:

✅ **Enhances Reliability:** Auto-reconnect, error recovery, graceful degradation
✅ **Improves UX:** Settings UI, keyboard shortcuts, transcript history
✅ **Optimizes Performance:** Code splitting, AudioWorklet, bundle optimization
✅ **Integrates Clinically:** Voice commands, SOAP notes, medical NER
✅ **Ensures Security:** Ephemeral tokens, audit logs, PHI redaction
✅ **Enables Monitoring:** Metrics, alerts, analytics
✅ **Guarantees Quality:** Comprehensive tests, load testing

**Next Steps:**
1. Review and prioritize features with product team
2. Allocate engineering resources
3. Begin P0 implementation (10-week sprint)
4. Iterate based on physician feedback
5. Scale to full feature set (32-week roadmap)

---

**Document Version:** 1.0
**Last Updated:** 2025-11-25
**Prepared By:** AI Engineering Team
**Review Status:** Draft - Awaiting Product Review
