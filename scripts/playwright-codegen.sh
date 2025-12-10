#!/bin/bash
# =============================================================================
# Playwright Codegen Script for VoiceAssist
# =============================================================================
#
# Usage:
#   ./scripts/playwright-codegen.sh              # Launch codegen with auth
#   ./scripts/playwright-codegen.sh --voice      # Launch with fake audio device
#   ./scripts/playwright-codegen.sh /login       # Start at specific URL
#   ./scripts/playwright-codegen.sh --no-auth    # Launch without pre-auth
#
# This script launches Playwright's codegen tool with:
#   - Pre-populated auth state (logged in as test user)
#   - Console logging enabled
#   - Optional: fake audio device for voice testing
#
# =============================================================================

set -e
cd "$(dirname "$0")/.."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
BASE_URL="${E2E_BASE_URL:-http://localhost:5173}"
AUTH_STATE="e2e/.auth/user.json"
START_PATH=""
USE_VOICE=false
NO_AUTH=false
AUDIO_FILE="e2e/fixtures/audio/hello.wav"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --voice|-v)
      USE_VOICE=true
      shift
      ;;
    --no-auth)
      NO_AUTH=true
      shift
      ;;
    --audio)
      AUDIO_FILE="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS] [START_PATH]"
      echo ""
      echo "Options:"
      echo "  --voice, -v     Enable fake audio device for voice mode testing"
      echo "  --no-auth       Start without pre-authenticated state"
      echo "  --audio FILE    Specify audio file for fake microphone (default: hello.wav)"
      echo "  --help, -h      Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0                    # Start at home page, logged in"
      echo "  $0 /chat              # Start at /chat page"
      echo "  $0 --voice            # Enable fake microphone"
      echo "  $0 --voice --audio e2e/fixtures/audio/barge-in.wav"
      exit 0
      ;;
    /*)
      START_PATH="$1"
      shift
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Playwright Codegen for VoiceAssist   ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if auth state exists
if [[ ! -f "$AUTH_STATE" ]] && [[ "$NO_AUTH" == "false" ]]; then
  echo -e "${YELLOW}Auth state not found. Running global-setup to create it...${NC}"
  pnpm exec playwright test --project=chromium --grep="NEVER_MATCH_ANYTHING" 2>/dev/null || true
fi

# Build codegen command
CODEGEN_ARGS=()

# Add storage state for auth
if [[ "$NO_AUTH" == "false" ]] && [[ -f "$AUTH_STATE" ]]; then
  echo -e "${GREEN}Using auth state from: ${AUTH_STATE}${NC}"
  CODEGEN_ARGS+=("--load-storage=$AUTH_STATE")
else
  echo -e "${YELLOW}Starting without authentication${NC}"
fi

# Add save storage to capture any auth changes
CODEGEN_ARGS+=("--save-storage=e2e/.auth/codegen-session.json")

# Add viewport
CODEGEN_ARGS+=("--viewport-size=1280,720")

# Build target URL
TARGET_URL="${BASE_URL}${START_PATH}"
echo -e "${GREEN}Target URL: ${TARGET_URL}${NC}"

# Voice mode setup
if [[ "$USE_VOICE" == "true" ]]; then
  echo -e "${GREEN}Voice mode enabled with audio: ${AUDIO_FILE}${NC}"

  # Check audio file exists
  if [[ ! -f "$AUDIO_FILE" ]]; then
    echo -e "${RED}Audio file not found: ${AUDIO_FILE}${NC}"
    echo -e "${YELLOW}Available audio files:${NC}"
    ls -1 e2e/fixtures/audio/*.wav 2>/dev/null || echo "  (none found)"
    exit 1
  fi

  AUDIO_PATH="$(pwd)/${AUDIO_FILE}"

  # Launch with Chromium and fake audio device
  echo ""
  echo -e "${YELLOW}Launching Chromium codegen with fake microphone...${NC}"
  echo -e "${YELLOW}The microphone will play: ${AUDIO_FILE}${NC}"
  echo ""

  pnpm exec playwright codegen \
    --browser=chromium \
    "${CODEGEN_ARGS[@]}" \
    --channel=chrome \
    "$TARGET_URL" \
    -- \
    --use-fake-ui-for-media-stream \
    --use-fake-device-for-media-stream \
    "--use-file-for-fake-audio-capture=${AUDIO_PATH}"
else
  echo ""
  echo -e "${YELLOW}Launching codegen (no voice mode)...${NC}"
  echo ""

  pnpm exec playwright codegen \
    --browser=chromium \
    "${CODEGEN_ARGS[@]}" \
    "$TARGET_URL"
fi

echo ""
echo -e "${GREEN}Codegen session ended.${NC}"
echo -e "${BLUE}Session state saved to: e2e/.auth/codegen-session.json${NC}"
