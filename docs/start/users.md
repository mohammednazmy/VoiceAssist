---
title: User Guide - Getting Started
slug: start/users
summary: "Get started using VoiceAssist - voice mode, text chat, and key features."
status: stable
stability: production
owner: product
lastUpdated: "2025-12-01"
audience:
  - user
  - human
  - ai-agents
tags:
  - quickstart
  - user-guide
  - voice
  - chat
category: getting-started
component: "frontend/web-app"
relatedPaths:
  - "apps/web-app/src/App.tsx"
  - "apps/web-app/src/components/Chat.tsx"
  - "apps/web-app/src/components/voice/VoiceModePanel.tsx"
ai_summary: >-
  Last Updated: 2025-12-01 Welcome to VoiceAssist! This guide will help you get
  started with voice and text interactions. --- VoiceAssist is a HIPAA-compliant
  medical AI assistant that helps healthcare professionals with: - Medical
  Questions - Evidence-based answers with citations - Clinical Guidel...
---

# User Guide - Getting Started

**Last Updated:** 2025-12-01

Welcome to VoiceAssist! This guide will help you get started with voice and text interactions.

---

## What is VoiceAssist?

VoiceAssist is a HIPAA-compliant medical AI assistant that helps healthcare professionals with:

- **Medical Questions** - Evidence-based answers with citations
- **Clinical Guidelines** - Quick access to protocols and guidelines
- **Voice Interaction** - Hands-free operation in clinical settings
- **Knowledge Search** - Search medical textbooks and literature

---

## Quick Start

### Accessing VoiceAssist

1. Open your browser and navigate to `https://assist.asimo.io`
2. Log in with your credentials
3. You'll see the main chat interface

### Your First Conversation

1. **Text Mode:** Type a question in the input box and press Enter
2. **Voice Mode:** Click the microphone button to speak your question
3. The assistant will respond with evidence-based information

---

## Voice Mode

### Starting Voice Mode

1. Click the **microphone icon** in the chat input area
2. Grant microphone permissions if prompted
3. Speak your question naturally
4. The assistant will respond with voice and text

### Voice Commands

| Command       | Action                   |
| ------------- | ------------------------ |
| "Stop"        | Pause current response   |
| "Continue"    | Resume reading           |
| "Repeat that" | Replay last response     |
| "New topic"   | Start fresh conversation |

### Voice Settings

Access voice settings via the **gear icon**:

- **Voice Selection** - Choose assistant voice
- **Speech Rate** - Adjust speaking speed
- **Auto-Play** - Toggle automatic voice responses

---

## Text Mode

### Basic Usage

- Type questions in natural language
- Use markdown for formatting
- Press Enter to send (Shift+Enter for new line)

### Tips for Better Answers

1. **Be Specific** - Include relevant clinical context
2. **Ask Follow-ups** - Build on previous responses
3. **Request Sources** - Ask for citations when needed

### Example Questions

- "What are the first-line treatments for hypertension?"
- "Explain the mechanism of action of metformin"
- "Compare ACE inhibitors vs ARBs for diabetic patients"

---

## Key Features

### Medical Knowledge Base

VoiceAssist has access to:

- Medical textbooks and references
- Clinical practice guidelines
- Drug information databases
- PubMed literature (via OpenEvidence)

### Citations and Sources

All responses include:

- **Source citations** - Where information came from
- **Confidence indicators** - Reliability of information
- **Page references** - For deeper reading

### Conversation Management

- **Save conversations** - Automatically saved to your account
- **Export transcripts** - Download for documentation
- **Organize with folders** - Keep conversations organized

---

## Privacy and Security

### HIPAA Compliance

- All data encrypted in transit and at rest
- No PHI stored without consent
- Audit logging for compliance

### Best Practices

- Don't include patient identifiers in queries
- Use general clinical scenarios
- Log out when finished

---

## Troubleshooting

### Voice Not Working?

1. Check microphone permissions in browser
2. Ensure microphone is not muted
3. Try refreshing the page

### Slow Responses?

1. Check your internet connection
2. Shorter questions may respond faster
3. Try during off-peak hours

### Need Help?

- Click the **help icon** for quick tips
- Contact your system administrator
- See [Debugging Guide](../debugging/DEBUGGING_INDEX.md)

---

## Keyboard Shortcuts

| Shortcut      | Action                   |
| ------------- | ------------------------ |
| `Enter`       | Send message             |
| `Shift+Enter` | New line                 |
| `Ctrl+/`      | Toggle voice mode        |
| `Esc`         | Cancel current operation |
| `Ctrl+N`      | New conversation         |

---

## Next Steps

1. Explore [Voice Mode Settings](../VOICE_MODE_SETTINGS_GUIDE.md)
2. Learn about [Medical Features](../MEDICAL_FEATURES.md)
3. Review [Tips & Tricks](../USER_GUIDE.md)
