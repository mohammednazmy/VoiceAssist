# VoiceAssist macOS Client

## Overview

The native macOS client provides always-on voice interaction with VoiceAssist. It runs as a menu bar application with wake word detection and integrates directly with macOS system features (Calendar, Mail, Files, etc.).

## Features

- **Always-On Listening**: Wake word activation ("Hey Assistant" or custom)
- **Voice Interface**: OpenAI Realtime API for natural conversation
- **Local Processing**: Ollama for privacy-sensitive queries
- **System Integration**: Access to Calendar, Mail, Files, Reminders, Notes
- **File Indexing**: Automatic indexing of local documents
- **Menu Bar App**: Unobtrusive interface with quick access

## Architecture

```
┌─────────────────────────────────────────┐
│         Menu Bar Application            │
│  [Icon] VoiceAssist    Status: Listening│
└─────────────────┬───────────────────────┘
                  │
┌─────────────────┴───────────────────────┐
│      Voice Interface Manager            │
│  - Wake word detection (Porcupine)      │
│  - Audio capture and streaming          │
│  - OpenAI Realtime API connection       │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────┴───────────────────────┐
│         AI Orchestrator                 │
│  - Privacy classification               │
│  - Request routing (local vs cloud)     │
│  - Conversation context management      │
└──┬──────────────────────────────────┬───┘
   │                                  │
┌──┴────────────────┐    ┌───────────┴────┐
│  Local Services   │    │  Remote APIs   │
│  - Ollama LLM     │    │  - Server API  │
│  - File search    │    │  - OpenAI      │
│  - System access  │    │  - Medical KB  │
└───────────────────┘    └────────────────┘
```

## Directory Structure

```
macos-client/
├── main.py                     # Application entry point
├── config.py                   # Configuration management
├── ui/                         # User interface
│   ├── menu_bar.py            # Menu bar app
│   └── settings_window.py     # Settings UI
├── voice/                      # Voice interface
│   ├── wake_word.py           # Porcupine integration
│   ├── audio_stream.py        # Audio capture
│   └── realtime_api.py        # OpenAI Realtime API
├── ai/                         # AI orchestration
│   ├── orchestrator.py        # Request router
│   ├── local_llm.py           # Ollama client
│   └── privacy_classifier.py  # Privacy detection
├── integrations/               # macOS integrations
│   ├── calendar.py            # EventKit/AppleScript
│   ├── mail.py                # Mail.app access
│   ├── files.py               # File system
│   ├── reminders.py           # Reminders.app
│   └── notes.py               # Notes.app
├── indexing/                   # File indexing
│   ├── watcher.py             # Directory monitoring
│   └── indexer.py             # Embedding & search
├── utils/                      # Utilities
│   ├── logger.py
│   └── helpers.py
├── requirements.txt            # Python dependencies
├── setup.py                    # Installation script
└── .env.example
```

## Installation

### Prerequisites

- macOS 12 (Monterey) or newer
- Python 3.11+
- [Ollama](https://ollama.ai) installed
- Xcode Command Line Tools

### Setup

1. Install Ollama:

```bash
brew install ollama
```

2. Download a model:

```bash
ollama pull llama3.1:8b  # or llama3.1:70b if you have enough RAM
```

3. Install Python dependencies:

```bash
cd macos-client
pip3 install -r requirements.txt
```

4. Configure:

```bash
cp .env.example .env
# Edit .env with your settings
```

5. Grant permissions:

- Microphone access
- Accessibility access (for system integrations)
- Full Disk Access (for file indexing)

6. Run:

```bash
python3 main.py
```

### Auto-Start on Login

Install as LaunchAgent:

```bash
./install_launch_agent.sh
```

This creates `~/Library/LaunchAgents/io.asimo.voiceassist.plist`

To start/stop manually:

```bash
launchctl load ~/Library/LaunchAgents/io.asimo.voiceassist.plist
launchctl unload ~/Library/LaunchAgents/io.asimo.voiceassist.plist
```

## Configuration

Edit `.env` file:

```bash
# Server connection
SERVER_URL=https://voice.asimo.io
API_KEY=your-api-key

# Porcupine (wake word)
PORCUPINE_ACCESS_KEY=your-porcupine-key
WAKE_WORD=computer  # or custom wake word

# OpenAI
OPENAI_API_KEY=sk-...

# Ollama
OLLAMA_URL=http://localhost:11434
DEFAULT_LOCAL_MODEL=llama3.1:8b

# Voice settings
VOICE_ENABLED=true
VOICE_SELECTION=alloy  # alloy, echo, shimmer, etc.
AUDIO_INPUT_DEVICE=default

# File indexing
INDEX_DIRECTORIES=/Users/mohammednazmy/Documents,/Users/mohammednazmy/Desktop
EXCLUDE_DIRECTORIES=/Users/mohammednazmy/Library
MAX_FILE_SIZE_MB=10

# Privacy
PHI_KEYWORDS=patient,MRN,medical record
LOCAL_ONLY_PATHS=/Medical-Records,/Private

# Logging
LOG_LEVEL=INFO
LOG_FILE=/tmp/voiceassist.log
```

## Usage

### Wake Word Activation

1. The app runs in the menu bar
2. Say your wake word: "Hey Computer" (or custom)
3. Icon indicates listening
4. Speak your question/command
5. Hear the response
6. Conversation continues until you stop or timeout

### Push-to-Talk Mode

Hold Option key while speaking (configurable)

### Menu Bar Options

- **Status**: Current state (Listening, Processing, etc.)
- **Recent Queries**: Last 5 queries
- **Settings**: Open settings window
- **Pause**: Disable wake word temporarily
- **Quit**: Exit application

### Example Commands

**System Integration:**

- "What's on my calendar today?"
- "Read my recent emails"
- "Create a reminder to call the pharmacy at 3pm"
- "Show me files about diabetes"

**Medical Queries:**

- "Find recent papers on SGLT2 inhibitors"
- "What does Harrison's say about diabetic ketoacidosis?"
- "CDC guidelines for hypertension management"

**File Operations:**

- "Summarize the PDF on my desktop"
- "Find documents mentioning ACE inhibitors"

**General:**

- "What's the weather today?"
- "Set a timer for 25 minutes"
- "Search the web for latest medical news"

## System Integrations

### Calendar (EventKit/AppleScript)

Capabilities:

- Read events
- Create new events
- Update events
- Delete events
- Search events

Permissions required: Calendar access

### Mail

Capabilities:

- Read emails (IMAP or Mail.app)
- Send emails
- Search emails

Permissions required: Mail.app access

### Files

Capabilities:

- Search indexed files
- Read file contents
- File metadata

Permissions required: Full Disk Access

### Reminders

Capabilities:

- Create reminders
- List reminders
- Complete reminders

Permissions required: Reminders access

### Notes

Capabilities:

- Read notes
- Create notes
- Search notes

Permissions required: Notes access

## Privacy & Security

### Data Classification

**Tier 1 - Local Only (Highest Privacy):**

- Files in specified private directories
- Queries containing PHI keywords
- Patient information
- Personal medical records

**Tier 2 - Server (Private but not PHI):**

- General documents
- Calendar events
- Emails

**Tier 3 - Cloud APIs (Public knowledge):**

- Medical literature queries
- General questions
- Web searches

### File Indexing

- Only indexes specified directories
- Respects `.gitignore` and custom exclusions
- Embeddings stored locally (encrypted)
- No file contents sent to cloud unless explicitly requested

### Audit Logging

All queries logged locally with classification:

```
2024-11-19 14:32:15 [INFO] Query: "Calendar today" [Tier 2]
2024-11-19 14:33:01 [INFO] Query: "Latest diabetes guidelines" [Tier 3]
```

## Troubleshooting

### Wake word not detected

- Check microphone permissions
- Verify Porcupine API key
- Adjust sensitivity in settings
- Check microphone input level

### Ollama not responding

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Restart Ollama
killall ollama
ollama serve &
```

### High CPU usage

- Reduce file indexing scope
- Lower wake word detection sensitivity
- Use smaller local model (8B instead of 70B)

### Voice latency

- Check internet connection
- Verify OpenAI API status
- Consider push-to-talk mode

### System integration not working

- Grant necessary permissions in System Preferences
- Check logs for permission errors
- Restart application after granting permissions

## Development

### Running in Development Mode

```bash
export ENVIRONMENT=development
python3 main.py --debug
```

### Testing

```bash
pytest tests/
```

### Building Standalone App (Future)

```bash
# Using PyInstaller or py2app
python3 setup.py py2app
```

## Performance

### Resource Usage

Typical usage:

- CPU: 2-5% idle, 20-40% during voice processing
- RAM: 200-500 MB (excluding Ollama)
- Disk: 50-200 MB for embeddings

Ollama (with llama3.1:8b):

- RAM: 4-6 GB
- CPU: 50-100% during inference

### Optimization Tips

- Use 8B model instead of 70B
- Limit indexed directories
- Disable continuous wake word (use push-to-talk)
- Reduce embedding frequency

## Alternative: Swift/SwiftUI Implementation

For a truly native macOS experience, consider rewriting in Swift:

Benefits:

- Better performance
- Native UI
- Lower resource usage
- App Store distribution

Drawbacks:

- More development time
- Less code sharing with server

## Roadmap

- [ ] Swift/SwiftUI rewrite
- [ ] Visual feedback window
- [ ] Conversation history UI
- [ ] Offline mode improvements
- [ ] Custom wake word training
- [ ] Shortcuts integration
- [ ] iOS companion app sync

## License

Personal use project.
