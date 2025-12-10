#!/bin/bash
# =============================================================================
# Audio Fixture Recording Script for VoiceAssist E2E Tests
# =============================================================================
#
# This script records audio from your microphone and saves it in the format
# required by Playwright's fake audio capture (WAV, 16-bit PCM, mono).
#
# Requirements:
#   - macOS: Uses built-in `sox` or `ffmpeg` (install via: brew install sox ffmpeg)
#   - The recording is automatically converted to the correct format
#
# Usage:
#   ./scripts/record-audio-fixture.sh <name> [duration_seconds]
#
# Examples:
#   ./scripts/record-audio-fixture.sh hello 3        # Record 3 seconds
#   ./scripts/record-audio-fixture.sh barge-in       # Record until Ctrl+C
#   ./scripts/record-audio-fixture.sh my-question 5  # Record 5 seconds
#
# =============================================================================

set -e
cd "$(dirname "$0")/.."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

FIXTURES_DIR="e2e/fixtures/audio"

# Parse arguments
NAME="${1:-recording}"
DURATION="${2:-}"

if [[ -z "$NAME" ]]; then
  echo -e "${RED}Usage: $0 <name> [duration_seconds]${NC}"
  echo ""
  echo "Examples:"
  echo "  $0 hello 3         # Record 3 seconds as 'hello.wav'"
  echo "  $0 question        # Record until Ctrl+C as 'question.wav'"
  exit 1
fi

OUTPUT_FILE="${FIXTURES_DIR}/${NAME}.wav"
TEMP_FILE="${FIXTURES_DIR}/.temp_recording.wav"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Audio Fixture Recorder               ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check for recording tools
RECORDER=""
if command -v sox &> /dev/null; then
  RECORDER="sox"
elif command -v ffmpeg &> /dev/null; then
  RECORDER="ffmpeg"
else
  echo -e "${RED}Error: Neither sox nor ffmpeg found.${NC}"
  echo -e "${YELLOW}Install one of them:${NC}"
  echo "  brew install sox"
  echo "  brew install ffmpeg"
  exit 1
fi

echo -e "${GREEN}Using recorder: ${RECORDER}${NC}"
echo -e "${GREEN}Output file: ${OUTPUT_FILE}${NC}"
echo ""

# Ensure output directory exists
mkdir -p "$FIXTURES_DIR"

# Recording function
record_audio() {
  if [[ "$RECORDER" == "sox" ]]; then
    if [[ -n "$DURATION" ]]; then
      echo -e "${YELLOW}Recording for ${DURATION} seconds...${NC}"
      echo -e "${YELLOW}Speak now!${NC}"
      sox -d -r 16000 -c 1 -b 16 "$TEMP_FILE" trim 0 "$DURATION"
    else
      echo -e "${YELLOW}Recording... Press Ctrl+C to stop.${NC}"
      echo -e "${YELLOW}Speak now!${NC}"
      # Use trap to handle Ctrl+C gracefully
      trap "echo ''; echo -e '${GREEN}Recording stopped.${NC}'" INT
      sox -d -r 16000 -c 1 -b 16 "$TEMP_FILE" || true
      trap - INT
    fi
  elif [[ "$RECORDER" == "ffmpeg" ]]; then
    if [[ -n "$DURATION" ]]; then
      echo -e "${YELLOW}Recording for ${DURATION} seconds...${NC}"
      echo -e "${YELLOW}Speak now!${NC}"
      ffmpeg -f avfoundation -i ":0" -t "$DURATION" -ar 16000 -ac 1 -acodec pcm_s16le "$TEMP_FILE" -y 2>/dev/null
    else
      echo -e "${YELLOW}Recording... Press Ctrl+C to stop.${NC}"
      echo -e "${YELLOW}Speak now!${NC}"
      trap "echo ''; echo -e '${GREEN}Recording stopped.${NC}'" INT
      ffmpeg -f avfoundation -i ":0" -ar 16000 -ac 1 -acodec pcm_s16le "$TEMP_FILE" -y 2>/dev/null || true
      trap - INT
    fi
  fi
}

# Conversion function (ensure correct format)
convert_audio() {
  echo ""
  echo -e "${YELLOW}Converting to Playwright-compatible format...${NC}"

  if command -v ffmpeg &> /dev/null; then
    # FFmpeg conversion to ensure correct format
    ffmpeg -i "$TEMP_FILE" -ar 16000 -ac 1 -acodec pcm_s16le "$OUTPUT_FILE" -y 2>/dev/null
  elif command -v sox &> /dev/null; then
    # Sox conversion
    sox "$TEMP_FILE" -r 16000 -c 1 -b 16 "$OUTPUT_FILE"
  else
    # Just move the file if no converter available
    mv "$TEMP_FILE" "$OUTPUT_FILE"
  fi

  # Clean up temp file
  rm -f "$TEMP_FILE"
}

# Main recording flow
echo -e "${BLUE}Preparation:${NC}"
echo "  1. Make sure your microphone is connected"
echo "  2. Speak clearly when prompted"
echo "  3. The recording will be saved to: ${OUTPUT_FILE}"
echo ""
read -p "Press Enter to start recording..."

record_audio
convert_audio

# Display info about the recording
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Recording Complete!                  ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

if command -v sox &> /dev/null; then
  echo -e "${BLUE}Recording info:${NC}"
  soxi "$OUTPUT_FILE" 2>/dev/null || true
fi

echo ""
echo -e "${GREEN}File saved to: ${OUTPUT_FILE}${NC}"
echo ""
echo -e "${BLUE}To use in Playwright tests:${NC}"
echo "  VOICE_AUDIO_TYPE=${NAME} pnpm exec playwright test --project=voice-live"
echo ""
echo -e "${BLUE}Or specify directly:${NC}"
echo "  pnpm exec playwright codegen --browser=chromium \\"
echo "    -- --use-fake-ui-for-media-stream \\"
echo "    --use-fake-device-for-media-stream \\"
echo "    \"--use-file-for-fake-audio-capture=\$(pwd)/${OUTPUT_FILE}\" \\"
echo "    http://localhost:5173"
