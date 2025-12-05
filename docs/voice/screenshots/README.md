# Voice Mode v4.1 Screenshots

This directory contains annotated screenshots for the Voice Mode v4.1 documentation.

> **Note**: Screenshots require manual capture from a running instance of the Voice Mode UI.
> Use the browser at https://quran.asimo.io to capture each state.

## Capture Status

| Screenshot                 | Status     | Notes                            |
| -------------------------- | ---------- | -------------------------------- |
| voice-input-bar-states.png | ⏳ Pending | Requires UI interaction          |
| streaming-text-rtl.png     | ⏳ Pending | Requires Arabic content response |
| quality-badge-tiers.png    | ⏳ Pending | Requires network throttling      |
| phi-indicator-states.png   | ⏳ Pending | Requires PHI-triggering input    |
| vad-presets-panel.png      | ⏳ Pending | Settings panel screenshot        |

## Required Screenshots

### 1. voice-input-bar-states.png

**Description:** VoiceFirstInputBar component in all states

**Content:**

- Idle state (grey microphone)
- Recording state (pulsing red with waveform)
- Processing state (spinning indicator)
- Error state (red outline with message)

**Annotations needed:**

- Label each state
- Arrow pointing to microphone button
- Arrow pointing to keyboard toggle
- Arrow pointing to settings button

### 2. streaming-text-rtl.png

**Description:** StreamingTextDisplay showing RTL Arabic content

**Content:**

- Mixed English/Arabic response
- Streaming cursor visible
- Citation card at bottom

**Annotations needed:**

- Label the streaming cursor
- Show RTL text direction indicator
- Label the citation source

### 3. quality-badge-tiers.png

**Description:** QualityBadge showing all 4 quality levels

**Content:**

- High (green): 128kbps, 48kHz
- Medium (yellow): 64kbps, 24kHz
- Low (orange): 32kbps, 16kHz
- Minimal (red): 16kbps, 8kHz

**Annotations needed:**

- Label each tier
- Show bitrate/sample rate for each
- Show expanded details view

### 4. phi-indicator-states.png

**Description:** PHI indicator in all states

**Content:**

- Green shield: No PHI detected
- Yellow shield: Potential PHI, review recommended
- Red shield: PHI detected, secure handling active

**Annotations needed:**

- Label each state
- Show tooltip or detail popup

### 5. vad-presets-panel.png

**Description:** VAD preset selection in settings panel

**Content:**

- Settings panel open
- VAD preset dropdown expanded
- Quiet/Normal/Noisy options visible

**Annotations needed:**

- Label the preset options
- Show sensitivity descriptions
- Show auto-stop delay slider

## Capture Guidelines

1. **Resolution:** 1280x720 minimum
2. **Format:** PNG with transparency where appropriate
3. **Annotations:** Use red or bright blue for visibility
4. **Font:** System font, minimum 14pt for labels
5. **Arrows:** Use solid arrows with drop shadow

## Tools Recommended

- Browser DevTools for consistent captures
- Annotate with Figma, Excalidraw, or similar
- Use consistent arrow styles and colors
