#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$ROOT_DIR/build"
APPS=(voiceassist-client voiceassist-admin voiceassist-docs)

mkdir -p "$BUILD_DIR"

for app in "${APPS[@]}"; do
  ARCHIVE_NAME="${app}.tar.gz"
  ARCHIVE_PATH="$BUILD_DIR/$ARCHIVE_NAME"
  echo "Packaging $app -> $ARCHIVE_PATH"
  tar -czf "$ARCHIVE_PATH" -C "$ROOT_DIR" "$app" \
    --exclude "$BUILD_DIR" \
    --exclude "*.tar.gz"

done

echo "Artifacts available in $BUILD_DIR"
