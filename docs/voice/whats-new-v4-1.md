---
title: What's New in Voice Mode v4.1
slug: whats-new-v4-1
status: stable
stability: production
owner: platform
audience:
  - human
  - ai-agents
tags: [voice, release-notes, v4.1, features]
summary: Complete feature summary for Voice Mode v4.1 release
lastUpdated: "2024-12-04"
---

# What's New in Voice Mode v4.1

Voice Mode v4.1 is a major release that introduces a voice-first interface, advanced speech processing, healthcare integrations, and comprehensive Arabic/Quranic language support.

## Release Highlights

- **Voice-First Input Bar**: Redesigned interface optimized for speech interaction
- **Streaming Text Display**: Real-time response rendering with smooth animations
- **Speaker Diarization**: Multi-speaker detection and attribution
- **FHIR R4 Streaming**: Healthcare data integration with retry resilience
- **Adaptive Audio Quality**: Dynamic bitrate adjustment based on network conditions
- **Quranic Lexicon**: 662 terms including all 114 Surah names and Tajweed terminology

---

## New Features

### Voice-First Input Bar

The input interface has been completely redesigned to prioritize voice interaction:

```
┌─────────────────────────────────────────────────┐
│  [🎤 Tap to Speak]  │  [⌨️]  │  [⚙️]           │
│                                                 │
│  "Ask me anything about the Quran..."           │
└─────────────────────────────────────────────────┘
```

**Key Features:**

- Large, prominent microphone button for easy tap-to-speak
- Visual audio level indicator during recording
- Keyboard toggle for text input when needed
- Settings quick-access for VAD and voice preferences

**Usage:**

1. Tap the microphone button to start recording
2. Speak your question naturally
3. Release or tap again to send
4. Watch the real-time transcription appear

### Streaming Text Display

Responses now stream in real-time with smooth character-by-character rendering:

**Features:**

- Token-by-token streaming from the AI
- Smooth CSS animations for text appearance
- Markdown rendering with syntax highlighting
- Citation links with hover previews
- RTL support for Arabic text segments

**Technical Details:**

- Adaptive chunk sizing based on network latency
- Automatic scroll-to-bottom during streaming
- Graceful handling of connection interruptions

### Adaptive VAD Presets

Voice Activity Detection now includes three presets for different environments:

| Preset     | Sensitivity | Best For                                |
| ---------- | ----------- | --------------------------------------- |
| **Quiet**  | High        | Silent rooms, minimal background noise  |
| **Normal** | Medium      | Typical home/office environments        |
| **Noisy**  | Low         | Public spaces, background conversations |

**Settings Panel:**

```
Voice Settings
├── VAD Preset: [Quiet ▼]
├── Auto-stop delay: 1.5s
└── Push-to-talk: [ ] Enable
```

### PHI Indicator & Routing

Healthcare-compliant PHI (Protected Health Information) handling:

**Visual Indicator:**

- Green shield icon: No PHI detected
- Yellow shield: Potential PHI, review recommended
- Red shield: PHI detected, secure handling active

**Routing Features:**

- Automatic detection of 18 HIPAA identifiers
- Secure channel routing for PHI content
- Audit logging for compliance
- User notification when PHI is detected

### RTL Support for Arabic

Full right-to-left support for Arabic content:

**Features:**

- Automatic language detection
- Bidirectional text rendering
- RTL-aware UI layout
- Arabic numeral support
- Proper text alignment in mixed content

**Toggle:**

```
Display Settings
└── Text Direction: [Auto ▼] / LTR / RTL
```

### Unified Memory Context

Cross-session context management for personalized interactions:

**Capabilities:**

- Session history persistence
- User preference memory
- Conversation threading
- Context-aware follow-ups
- Learning style adaptation

---

## Phase 3 Features

### Speaker Diarization

Multi-speaker detection and attribution for group conversations:

**Capabilities:**

- Up to 4 concurrent speakers
- Real-time speaker change detection
- Speaker embedding extraction
- Cross-session speaker re-identification
- Confidence scoring per segment

**Use Cases:**

- Study circles with multiple participants
- Teacher-student Q&A sessions
- Family Quran recitation sessions

**Technical Specs:**

- Latency: <200ms for speaker change detection
- Accuracy: >90% speaker attribution
- Models: pyannote.audio segmentation

### FHIR R4 Streaming

Healthcare data integration with enterprise-grade resilience:

**Supported Resources:**

- Patient demographics
- Observations (vitals, lab results)
- Conditions (diagnoses)
- Medications
- Allergies

**Resilience Features:**

- Exponential backoff retry (1s → 2s → 4s → 8s)
- Circuit breaker pattern
- Partial response handling
- Connection pooling
- Health check monitoring

**Configuration:**

```yaml
fhir:
  base_url: https://fhir.example.com/r4
  timeout_ms: 5000
  max_retries: 3
  circuit_breaker_threshold: 5
```

### Adaptive Quality Controller

Dynamic audio quality adjustment based on network conditions:

**Quality Tiers:**

| Tier    | Bitrate | Sample Rate | Use Case          |
| ------- | ------- | ----------- | ----------------- |
| High    | 128kbps | 48kHz       | Excellent network |
| Medium  | 64kbps  | 24kHz       | Standard network  |
| Low     | 32kbps  | 16kHz       | Poor network      |
| Minimal | 16kbps  | 8kHz        | Very poor network |

**Hysteresis Behavior:**

- Upgrade: 10 consecutive good measurements
- Downgrade: 3 consecutive poor measurements
- Prevents quality oscillation

**Metrics Tracked:**

- RTT (Round Trip Time)
- Packet loss percentage
- Jitter
- Available bandwidth

---

## Lexicon Expansion

### Quranic Arabic Lexicon (328 terms)

Complete pronunciation coverage for Quranic content:

**Surah Names (114):**
All Surah names with accurate Modern Standard Arabic IPA:

- الفاتحة → /ʔalfaːtiħa/
- البقرة → /ʔalbaqara/
- آل عمران → /ʔaːl ʕimraːn/
- ... (all 114 Surahs)

**Tajweed Terms (50+):**

- تجويد → /tadʒwiːd/
- إدغام → /ʔidɣaːm/
- إخفاء → /ʔixfaːʔ/
- قلقلة → /qalqala/
- غنة → /ɣunna/
- مد → /madd/

**Islamic Vocabulary (200+):**

- Common phrases (Bismillah, Alhamdulillah)
- Names of Allah
- Prophet names
- Ritual terminology
- Theological concepts

### English Transliteration Lexicon (334 terms)

Transliterated Surah names and Islamic terms for English TTS:

**Multiple Spelling Variants:**

- Tajweed / tajwid
- Qur'an / Quran
- Insha'Allah / Inshallah

**IPA Approximations:**
Closest English phonemes for Arabic sounds:

- Al-Fatihah → /æl fɑːtiːhɑː/
- Bismillah → /bɪsmɪl lɑː/

---

## Configuration Reference

### Voice Settings

```javascript
// settings-panel.js configuration
voiceSettings: {
  vadPreset: 'normal',      // 'quiet' | 'normal' | 'noisy'
  autoStopDelay: 1500,      // ms
  pushToTalk: false,
  language: 'ar',           // 'ar' | 'en' | 'auto'
  rtlMode: 'auto'           // 'auto' | 'ltr' | 'rtl'
}
```

### Feature Flags

```python
# Feature flags for v4.1
VOICE_V4_INPUT_BAR = True
VOICE_V4_STREAMING_TEXT = True
VOICE_V4_SPEAKER_DIARIZATION = True
VOICE_V4_FHIR_STREAMING = True
VOICE_V4_ADAPTIVE_QUALITY = True
VOICE_V4_PHI_ROUTING = True
```

---

## Migration Guide

### From v4.0 to v4.1

**Breaking Changes:**

- None - v4.1 is fully backward compatible

**Recommended Updates:**

1. Enable new feature flags in configuration
2. Update client to use streaming text display
3. Configure VAD presets for your environment
4. Test lexicon pronunciations for Quranic content

**New Dependencies:**

```
pyannote.audio>=3.0.0  # Speaker diarization
fhir.resources>=7.0.0  # FHIR R4 support
```

---

## Performance Metrics

### Latency Targets

| Operation                    | Target  | Measured |
| ---------------------------- | ------- | -------- |
| Voice input to transcription | <500ms  | 320ms    |
| Speaker change detection     | <200ms  | 180ms    |
| Text streaming first token   | <300ms  | 250ms    |
| FHIR resource fetch          | <1000ms | 650ms    |
| Quality tier switch          | <100ms  | 80ms     |

### Resource Usage

| Component           | Memory | CPU |
| ------------------- | ------ | --- |
| Speaker diarization | +150MB | +5% |
| FHIR client         | +20MB  | +2% |
| Adaptive quality    | +5MB   | +1% |
| Lexicon service     | +10MB  | <1% |

---

## Known Issues

1. **Speaker diarization accuracy**: May decrease with >4 simultaneous speakers
2. **FHIR timeout**: First request after idle may timeout (connection pool warming)
3. **RTL mixed content**: Complex bidirectional text may occasionally misalign

---

## Acknowledgments

Voice Mode v4.1 was developed with contributions from:

- Platform team for core infrastructure
- Healthcare team for FHIR integration
- Localization team for Arabic/RTL support
- Community contributors for lexicon expansion

---

## UI Components Guide

> **Screenshots**: For visual reference, see the annotated screenshots in `/docs/voice/screenshots/`:
>
> - `voice-input-bar-states.png` - VoiceFirstInputBar in idle, recording, processing states
> - `streaming-text-rtl.png` - StreamingTextDisplay with RTL Arabic content
> - `quality-badge-tiers.png` - QualityBadge showing all 4 quality levels
> - `phi-indicator-states.png` - PHI indicator (green/yellow/red states)
> - `vad-presets-panel.png` - VAD preset selection in settings panel

### VoiceFirstInputBar Component

**Location:** `/var/www/quran/js/components/VoiceFirstInputBar.js`

The primary interface for voice interaction in v4.1:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│    ┌──────────────────────────────────────────────────┐    │
│    │  "What would you like to learn about today?"      │    │
│    └──────────────────────────────────────────────────┘    │
│                                                             │
│              ╭─────────────────────────╮                   │
│              │     [  🎤  ]            │  ← Tap to Speak   │
│              │   Recording...          │                   │
│              ╰─────────────────────────╯                   │
│                                                             │
│         [ ⌨️ Text ]    [ ⚙️ Settings ]    [ ❓ Help ]      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**States:**

| State      | Visual                 | Behavior                    |
| ---------- | ---------------------- | --------------------------- |
| Idle       | Grey microphone        | Tap to start recording      |
| Recording  | Pulsing red + waveform | Real-time audio levels      |
| Processing | Spinning indicator     | Transcription in progress   |
| Error      | Red outline + message  | Retry or switch to keyboard |

**Props:**

```javascript
<VoiceFirstInputBar
  onTranscript={(text) => handleSubmit(text)}
  vadPreset="normal"
  language="ar"
  placeholder="Ask about any Surah..."
  showKeyboardToggle={true}
/>
```

### StreamingTextDisplay Component

**Location:** `/var/www/quran/js/components/StreamingTextDisplay.js`

Renders AI responses with real-time streaming:

```
┌─────────────────────────────────────────────────────────────┐
│  🤖 Assistant                                    12:34 PM   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Surah Al-Fatihah (الفاتحة) is the opening chapter of     │
│  the Quran. It consists of seven verses and is recited     │
│  in every unit of prayer...                                │
│                                                             │
│  **Key Themes:**                                           │
│  • Praise of Allah (verses 1-4)                            │
│  • Request for guidance (verses 5-7)                       │
│  • The straight path (الصراط المستقيم)█                   │
│                                                    ↑cursor │
│  ─────────────────────────────────────────────────────────│
│  📖 Source: Tafsir Ibn Kathir, Vol 1, p.23  [View →]       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Features:**

- Token-by-token rendering with cursor animation
- Markdown support (bold, lists, code blocks)
- RTL text detection and rendering
- Citation card expansion on click
- Copy/share buttons on completion

**Props:**

```javascript
<StreamingTextDisplay
  stream={responseStream}
  onComplete={() => setIsStreaming(false)}
  showCitations={true}
  enableRTL="auto"
  animationSpeed={30} // ms per character
/>
```

### QualityBadge Component

**Location:** `/var/www/quran/js/components/QualityBadge.js`

Displays current audio quality and network status:

```
Normal view:          Expanded on hover/tap:
┌─────────┐          ┌─────────────────────────┐
│ 📶 High │          │ 📶 High Quality         │
└─────────┘          │ ─────────────────────── │
                     │ Bitrate: 128 kbps       │
                     │ RTT: 45ms               │
                     │ Packet Loss: 0.1%       │
                     └─────────────────────────┘
```

**Quality Indicators:**

| Badge   | Color  | Meaning              |
| ------- | ------ | -------------------- |
| 📶 High | Green  | Excellent connection |
| 📶 Med  | Yellow | Acceptable quality   |
| 📶 Low  | Orange | Degraded quality     |
| 📶 Min  | Red    | Minimal quality mode |

**Props:**

```javascript
<QualityBadge quality={networkQuality} showDetails={true} onQualityChange={(tier) => logQualityEvent(tier)} />
```

### Component Integration Example

```javascript
// Main voice interface integration
function VoiceInterface() {
  const [streaming, setStreaming] = useState(false);
  const [quality, setQuality] = useState("high");

  return (
    <div className="voice-interface">
      <QualityBadge quality={quality} />

      <StreamingTextDisplay stream={responseStream} onComplete={() => setStreaming(false)} showCitations={true} />

      <VoiceFirstInputBar onTranscript={handleSubmit} disabled={streaming} vadPreset={settings.vadPreset} />
    </div>
  );
}
```

---

## Related Documentation

- [Voice Mode Architecture](./voice-mode-v4-overview.md)
- [Speaker Diarization Service](./speaker-diarization-service.md)
- [FHIR Streaming Integration](./fhir-streaming-integration.md)
- [Adaptive Quality Controller](./adaptive-quality-controller.md)
- [Lexicon Service Guide](./lexicon-service-guide.md)

---

**Release Date:** December 2024
**Version:** 4.1.0
**Status:** Production Ready
