#!/usr/bin/env python3
"""
OpenAI API Key Verification Script

This script verifies that the OPENAI_API_KEY environment variable is:
1. Properly loaded via the Pydantic Settings config
2. Valid and can connect to OpenAI's API

Usage:
    # From repo root (uses .env automatically)
    python scripts/check_openai_key.py

    # From services/api-gateway with venv activated
    cd services/api-gateway
    . venv/bin/activate
    python ../../scripts/check_openai_key.py

    # Or via Make target
    make check-openai

    # Run with verbose output
    python scripts/check_openai_key.py --verbose

Exit codes:
    0 - Success (API key valid and working)
    1 - Configuration error (key not set or invalid format)
    2 - API connection error (key rejected or network issue)

Security Note:
    This script NEVER prints the actual API key value.
"""

import argparse
import asyncio
import os
import sys
from pathlib import Path

# Add services/api-gateway to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
API_GATEWAY_DIR = PROJECT_ROOT / "services" / "api-gateway"

# Set PYTHONPATH to include api-gateway for imports
sys.path.insert(0, str(API_GATEWAY_DIR))

# Change to project root so .env is found
os.chdir(PROJECT_ROOT)


def check_key_format(api_key: str) -> tuple[bool, str]:
    """
    Validate OpenAI API key format without revealing the key.

    Returns:
        (is_valid, message) tuple
    """
    if not api_key:
        return False, "OPENAI_API_KEY is empty or None"

    if not isinstance(api_key, str):
        return False, "OPENAI_API_KEY is not a string"

    # OpenAI keys start with 'sk-' (standard) or 'sk-proj-' (project keys)
    if not api_key.startswith("sk-"):
        return False, "OPENAI_API_KEY does not start with 'sk-' (invalid format)"

    # Keys are typically 48-56 characters
    if len(api_key) < 40:
        return False, f"OPENAI_API_KEY seems too short ({len(api_key)} chars)"

    return True, f"OPENAI_API_KEY format valid ({len(api_key)} chars, starts with '{api_key[:7]}...')"


async def test_api_connection(api_key: str, verbose: bool = False) -> tuple[bool, str]:
    """
    Test the OpenAI API connection using a cheap endpoint (list models).

    Returns:
        (success, message) tuple
    """
    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=api_key, timeout=15.0)

        if verbose:
            print("  Connecting to OpenAI API...")

        # List models is a very cheap API call
        models = await client.models.list()

        model_count = len(models.data) if models.data else 0

        # Check for specific models we use
        model_ids = {m.id for m in models.data} if models.data else set()

        required_models = ["gpt-4o", "gpt-4o-mini", "whisper-1", "tts-1"]
        available = [m for m in required_models if m in model_ids]

        if verbose:
            print(f"  Found {model_count} models total")
            print(f"  Required models available: {available}")

        return True, f"SUCCESS - API connection verified ({model_count} models accessible)"

    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)

        # Don't leak the full error message which might contain sensitive info
        if "invalid_api_key" in error_msg.lower() or "incorrect api key" in error_msg.lower():
            return False, f"API key rejected by OpenAI (invalid or expired)"
        elif "rate_limit" in error_msg.lower():
            return False, f"Rate limited by OpenAI (key valid but throttled)"
        elif "connection" in error_msg.lower() or "timeout" in error_msg.lower():
            return False, f"Network error connecting to OpenAI: {error_type}"
        else:
            return False, f"OpenAI API error: {error_type} - {error_msg[:100]}"


def main():
    parser = argparse.ArgumentParser(
        description="Verify OpenAI API key configuration and connectivity"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show detailed output"
    )
    parser.add_argument(
        "--skip-api-test",
        action="store_true",
        help="Only check configuration, skip live API test"
    )
    args = parser.parse_args()

    print("=" * 60)
    print("OpenAI API Key Verification")
    print("=" * 60)
    print()

    # Step 1: Try to load config
    print("[1/3] Loading configuration from .env...")
    try:
        from app.core.config import settings
        api_key = settings.OPENAI_API_KEY
        print("      Settings loaded successfully")
    except Exception as e:
        print(f"      ERROR: Failed to load settings: {e}")
        print()
        print("      Make sure you are running from the project root")
        print("      and .env file exists with OPENAI_API_KEY set.")
        sys.exit(1)

    # Step 2: Validate key format
    print()
    print("[2/3] Validating key format...")
    format_valid, format_msg = check_key_format(api_key)
    print(f"      {format_msg}")

    if not format_valid:
        print()
        print("FAILED: OpenAI API key is not configured correctly.")
        print()
        print("To fix:")
        print("  1. Edit .env in the project root")
        print("  2. Set OPENAI_API_KEY=sk-your-actual-key")
        print("  3. Re-run this script")
        sys.exit(1)

    # Step 3: Test API connection (optional)
    print()
    if args.skip_api_test:
        print("[3/3] Skipping live API test (--skip-api-test)")
        print()
        print("=" * 60)
        print("PARTIAL SUCCESS: Configuration looks valid")
        print("Run without --skip-api-test to verify API connectivity")
        print("=" * 60)
        sys.exit(0)

    print("[3/3] Testing live API connection...")
    success, api_msg = asyncio.run(test_api_connection(api_key, verbose=args.verbose))
    print(f"      {api_msg}")

    print()
    print("=" * 60)
    if success:
        print("SUCCESS: OpenAI API key is valid and working!")
        print()
        print("The following features should now work:")
        print("  - LLM Client (chat completions)")
        print("  - RAG Service (embeddings + completions)")
        print("  - Voice Transcription (Whisper)")
        print("  - Speech Synthesis (TTS)")
        print("  - Realtime Voice Mode (WebSocket)")
        print("=" * 60)
        sys.exit(0)
    else:
        print("FAILED: OpenAI API key check failed")
        print()
        print("Possible causes:")
        print("  - API key is invalid or expired")
        print("  - API key lacks required permissions")
        print("  - Network connectivity issues")
        print("  - OpenAI service is down")
        print()
        print("To troubleshoot:")
        print("  1. Verify key at https://platform.openai.com/api-keys")
        print("  2. Check your OpenAI account billing status")
        print("  3. Try the key in curl:")
        print("     curl https://api.openai.com/v1/models -H 'Authorization: Bearer <key>'")
        print("=" * 60)
        sys.exit(2)


if __name__ == "__main__":
    main()
