# Playwright Debugging Guide

This guide covers three essential debugging tools for VoiceAssist E2E tests:

1. **Codegen** - Record browser interactions to generate test code
2. **Console Logging** - Capture all browser console output for debugging
3. **Mock Audio** - Use pre-recorded audio files as microphone input

---

## 1. Playwright Codegen

Codegen records your browser interactions and generates Playwright test code automatically.

### Quick Start

```bash
# Basic usage (starts logged in at home page)
./scripts/playwright-codegen.sh

# Start at specific page
./scripts/playwright-codegen.sh /chat

# With voice mode (fake microphone)
./scripts/playwright-codegen.sh --voice

# Voice mode with specific audio file
./scripts/playwright-codegen.sh --voice --audio e2e/fixtures/audio/hello.wav

# Without authentication (for testing login flow)
./scripts/playwright-codegen.sh --no-auth /login
```

### What Codegen Does

1. Launches a browser with pre-populated authentication
2. Opens the Playwright Inspector alongside
3. Records every click, fill, navigation you perform
4. Generates TypeScript code you can copy into tests
5. Saves session state when you close (to `e2e/.auth/codegen-session.json`)

### Tips for Codegen

- **Click "Record"** to start recording interactions
- **Click "Pick Locator"** to find the best selector for an element
- **Use Assert** button to add visibility/text assertions
- **Pause recording** when navigating to avoid extra steps
- **Copy the generated code** directly into your spec files

### Voice Mode in Codegen

When using `--voice`, the browser has a fake microphone that plays your audio file on loop:

```bash
# Record with hello.wav playing as microphone
./scripts/playwright-codegen.sh --voice /chat

# Use custom audio file
./scripts/playwright-codegen.sh --voice --audio e2e/fixtures/audio/my-question.wav
```

---

## 2. Console Logging

All browser console output can be captured for debugging test failures.

### Enable Verbose Console Logging

```bash
# Run any test with full console output
VERBOSE_CONSOLE=1 pnpm exec playwright test e2e/voice-mode-navigation.spec.ts

# Logs are automatically saved to: test-results/console-logs/
```

### Using the Console Logger Fixture

Add to your test file:

```typescript
import { test, expect } from "../fixtures/console-logger";

test("my test", async ({ page, consoleLogger }) => {
  await page.goto("/chat");

  // Your test code...

  // Access logs programmatically
  const logs = consoleLogger.getLogs();
  console.log(`Captured ${logs.length} console messages`);

  // Logs are auto-saved after test
});
```

### Log Filtering

The logger automatically:

- **Always shows**: errors, warnings, logs containing `[Test]` or `[Voice]`
- **Filters out**: HMR noise, Vite messages, React DevTools
- **Saves all logs** to file regardless of filter

To customize filtering:

```typescript
import { attachConsoleLogger } from "../fixtures/console-logger";

const logger = attachConsoleLogger(page, testInfo.title, {
  verbose: true, // Show ALL logs in terminal
  types: ["error", "warn"], // Only capture these types
  includePatterns: ["[Voice]", "[WS]"], // Only logs matching these
  excludePatterns: ["[HMR]"], // Exclude these patterns
});
```

### Reading Log Files

After test runs, logs are saved to:

```
test-results/console-logs/<test-name>-<timestamp>.log
```

Format:

```
[2024-01-15T10:30:45.123Z] [ERROR] Something went wrong
  at http://localhost:5173/src/hooks/useVoice.ts:123:45
  args: {"error": "Connection failed"}

[2024-01-15T10:30:45.456Z] [LOG] [Voice] State changed to: listening
```

---

## 3. Mock Audio (Fake Microphone)

Playwright can inject pre-recorded audio as microphone input for voice tests.

### How It Works

Chrome's `--use-file-for-fake-audio-capture` flag replaces the real microphone with an audio file:

1. Browser requests microphone access
2. Instead of real mic, Chrome streams the audio file
3. Audio loops continuously until the browser closes
4. Your voice tests receive this audio as if spoken by a real user

### Recording New Audio Fixtures

```bash
# Record a 3-second greeting
./scripts/record-audio-fixture.sh hello 3

# Record a question (stops when you press Ctrl+C)
./scripts/record-audio-fixture.sh my-question

# Record barge-in phrase
./scripts/record-audio-fixture.sh stop-command 2
```

The script:

1. Records from your microphone
2. Converts to Playwright-compatible format (WAV, 16kHz, mono, 16-bit PCM)
3. Saves to `e2e/fixtures/audio/<name>.wav`

### Audio Format Requirements

For Chrome fake audio capture:

- **Format**: WAV (PCM)
- **Sample rate**: 16000 Hz (16kHz)
- **Channels**: Mono (1 channel)
- **Bit depth**: 16-bit

If you have audio in another format, convert it:

```bash
# Using ffmpeg
ffmpeg -i input.mp3 -ar 16000 -ac 1 -acodec pcm_s16le output.wav

# Using sox
sox input.mp3 -r 16000 -c 1 -b 16 output.wav
```

### Using Audio in Tests

**Option 1: Environment variable**

```bash
# Use predefined fixture name
VOICE_AUDIO_TYPE=hello pnpm exec playwright test --project=voice-live

# Available types: hello, bargeIn, conversationStart, followUp, yes, twoPhaseBargeIn
```

**Option 2: Specific project**

```bash
# Projects are pre-configured with different audio:
pnpm exec playwright test --project=voice-barge-in       # Uses conversationStart.wav
pnpm exec playwright test --project=voice-barge-in-two-phase  # Uses two-phase-barge-in.wav
```

**Option 3: Custom launch args**

```typescript
// In playwright.config.ts or test file
use: {
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--use-file-for-fake-audio-capture=/absolute/path/to/audio.wav',
    ],
  },
}
```

### Existing Audio Fixtures

| File                     | Content                                       | Duration |
| ------------------------ | --------------------------------------------- | -------- |
| `hello.wav`              | "Hello"                                       | ~1.7s    |
| `conversation-start.wav` | "Hello, what can you do?"                     | ~3.2s    |
| `barge-in.wav`           | "Stop! Wait a moment please"                  | ~2.2s    |
| `follow-up.wav`          | Follow-up question                            | ~2.5s    |
| `yes.wav`                | "Yes"                                         | ~0.6s    |
| `two-phase-barge-in.wav` | Question + 10s silence + "Stop!" (for timing) | ~15.4s   |

### Creating Multi-Phase Audio

For tests that need specific timing (e.g., speak → wait for AI → interrupt):

```bash
# Method 1: Use sox to concatenate with silence
sox hello.wav -p pad 0 10 | sox - barge-in.wav two-phase.wav

# Method 2: Use ffmpeg
ffmpeg -i hello.wav -af "apad=pad_dur=10" -i barge-in.wav \
  -filter_complex "[0:a][1:a]concat=n=2:v=0:a=1" two-phase.wav

# Method 3: Record naturally with pauses
./scripts/record-audio-fixture.sh two-phase 20
# Speak your question, wait 10 seconds, then say "Stop!"
```

---

## Complete Debugging Workflow

### Step 1: Record a Manual Test

```bash
# Start codegen with voice mode
./scripts/playwright-codegen.sh --voice /chat
```

1. Navigate through the app manually
2. Observe what works and what doesn't
3. Copy generated code for your test

### Step 2: Create Test with Console Logging

```typescript
// e2e/voice/my-new-test.spec.ts
import { test, expect } from "../fixtures/console-logger";

test("voice mode should work", async ({ page, consoleLogger }) => {
  await page.goto("/chat");

  // Paste codegen output here...

  // Add custom logging
  await page.evaluate(() => {
    console.log("[Test] Starting voice mode test");
  });

  // Test assertions...
});
```

### Step 3: Run with Full Logging

```bash
# Run with verbose output
VERBOSE_CONSOLE=1 LIVE_REALTIME_E2E=1 pnpm exec playwright test e2e/voice/my-new-test.spec.ts --project=voice-live

# View saved logs
cat test-results/console-logs/*.log
```

### Step 4: Debug Failures

1. Check console logs for errors
2. View screenshots in `test-results/`
3. Watch video recordings (if enabled)
4. Re-run codegen to reproduce manually

---

## Troubleshooting

### "Audio not being captured"

- Ensure WAV file is 16kHz, mono, 16-bit PCM
- Use absolute path in `--use-file-for-fake-audio-capture`
- Check file exists: `ls -la e2e/fixtures/audio/`

### "Authentication not working"

- Delete and regenerate auth state: `rm -rf e2e/.auth && pnpm exec playwright test --project=chromium`
- Check `e2e/.auth/user.json` exists and has valid tokens

### "Console logs not showing"

- Set `VERBOSE_CONSOLE=1` environment variable
- Check `test-results/console-logs/` directory for saved logs
- Ensure you're using the `consoleLogger` fixture

### "Codegen not recording clicks"

- Click "Record" button in Playwright Inspector
- Ensure target element is not inside an iframe
- Try clicking "Pick Locator" first to verify element is accessible

---

## Quick Reference

```bash
# Codegen
./scripts/playwright-codegen.sh                    # Basic
./scripts/playwright-codegen.sh --voice            # With mic
./scripts/playwright-codegen.sh /chat              # Specific page

# Recording audio
./scripts/record-audio-fixture.sh <name> [seconds]

# Running tests with logging
VERBOSE_CONSOLE=1 pnpm exec playwright test ...

# Running voice tests
VOICE_AUDIO_TYPE=hello pnpm exec playwright test --project=voice-live
```
