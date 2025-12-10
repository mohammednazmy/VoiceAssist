#!/bin/bash
# =============================================================================
# Launch Chrome with Fake Audio for Voice Testing
# =============================================================================
#
# This script launches Google Chrome with fake microphone input from an audio file.
# The audio file will play on loop as if it were coming from your microphone.
#
# Usage:
#   ./scripts/chrome-with-fake-audio.sh                    # Use hello.wav
#   ./scripts/chrome-with-fake-audio.sh conversation-start # Use conversation-start.wav
#   ./scripts/chrome-with-fake-audio.sh /path/to/file.wav  # Use custom file
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

# Default values
BASE_URL="${E2E_BASE_URL:-http://localhost:5173}"
AUDIO_DIR="e2e/fixtures/audio"

# Parse audio argument
AUDIO_ARG="${1:-hello}"

# Determine audio file path
if [[ -f "$AUDIO_ARG" ]]; then
  # Full path provided
  AUDIO_FILE="$AUDIO_ARG"
elif [[ -f "${AUDIO_DIR}/${AUDIO_ARG}.wav" ]]; then
  # Fixture name provided (without .wav)
  AUDIO_FILE="${AUDIO_DIR}/${AUDIO_ARG}.wav"
elif [[ -f "${AUDIO_DIR}/${AUDIO_ARG}" ]]; then
  # Fixture name with extension
  AUDIO_FILE="${AUDIO_DIR}/${AUDIO_ARG}"
else
  echo -e "${RED}Audio file not found: ${AUDIO_ARG}${NC}"
  echo ""
  echo -e "${YELLOW}Available audio fixtures:${NC}"
  for f in ${AUDIO_DIR}/*.wav; do
    basename "$f" .wav
  done
  exit 1
fi

AUDIO_PATH="$(cd "$(dirname "$AUDIO_FILE")" && pwd)/$(basename "$AUDIO_FILE")"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Chrome with Fake Audio               ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${GREEN}Audio file: ${AUDIO_PATH}${NC}"
echo -e "${GREEN}Target URL: ${BASE_URL}/chat${NC}"
echo ""

# Find Chrome
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [[ ! -f "$CHROME_PATH" ]]; then
  echo -e "${RED}Google Chrome not found at: ${CHROME_PATH}${NC}"
  echo -e "${YELLOW}Please install Google Chrome or update the path in this script.${NC}"
  exit 1
fi

echo -e "${YELLOW}Launching Chrome...${NC}"
echo -e "${YELLOW}The fake microphone will play your audio file on loop.${NC}"
echo ""
echo -e "${BLUE}Tips:${NC}"
echo "  - Click 'Voice Mode' button to start voice session"
echo "  - Grant microphone permission when prompted"
echo "  - Your audio file will be used instead of real microphone"
echo "  - Audio loops continuously until you close the browser"
echo ""

# Launch Chrome with fake audio device
"$CHROME_PATH" \
  --use-fake-ui-for-media-stream \
  --use-fake-device-for-media-stream \
  "--use-file-for-fake-audio-capture=${AUDIO_PATH}" \
  --no-first-run \
  --disable-default-apps \
  "${BASE_URL}/chat"
