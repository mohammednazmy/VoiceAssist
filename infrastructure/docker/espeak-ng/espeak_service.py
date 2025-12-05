"""
espeak-ng HTTP Service for G2P Pronunciation Generation

Provides REST API for grapheme-to-phoneme conversion using espeak-ng.
Designed to run as a sidecar container for VoiceAssist v4.2.0.

Endpoints:
- GET /health - Health check
- POST /g2p - Convert term to IPA phonemes
- POST /g2p/batch - Convert multiple terms
- GET /languages - List supported languages
"""

import asyncio
import subprocess
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(
    title="espeak-ng G2P Service",
    description="Grapheme-to-phoneme conversion service using espeak-ng",
    version="1.0.0",
)


# Voice mapping for supported languages
LANGUAGE_VOICES = {
    "en": "en-us",
    "en-gb": "en-gb",
    "en-au": "en-au",
    "es": "es",
    "es-mx": "es-mx",
    "fr": "fr-fr",
    "de": "de",
    "it": "it",
    "pt": "pt",
    "pt-br": "pt-br",
    "ru": "ru",
    "ar": "ar",
    "hi": "hi",
    "ur": "ur",
    "zh": "zh",
    "ja": "ja",
    "ko": "ko",
    "pl": "pl",
    "tr": "tr",
    "nl": "nl",
    "sv": "sv",
    "cs": "cs",
}


class G2PRequest(BaseModel):
    """Request model for G2P conversion."""

    term: str = Field(..., description="The word or phrase to convert")
    language: str = Field(default="en", description="ISO 639-1 language code")


class G2PResponse(BaseModel):
    """Response model for G2P conversion."""

    term: str
    phonemes: str
    language: str
    voice: str
    success: bool
    error: Optional[str] = None


class BatchG2PRequest(BaseModel):
    """Request model for batch G2P conversion."""

    terms: list[str] = Field(..., description="List of terms to convert")
    language: str = Field(default="en", description="ISO 639-1 language code")


class BatchG2PResponse(BaseModel):
    """Response model for batch G2P conversion."""

    results: list[G2PResponse]
    total: int
    successful: int
    failed: int


class LanguageInfo(BaseModel):
    """Language information model."""

    code: str
    voice: str
    name: str


def get_language_name(code: str) -> str:
    """Get human-readable language name."""
    names = {
        "en": "English (US)",
        "en-gb": "English (UK)",
        "en-au": "English (AU)",
        "es": "Spanish",
        "es-mx": "Spanish (Mexico)",
        "fr": "French",
        "de": "German",
        "it": "Italian",
        "pt": "Portuguese",
        "pt-br": "Portuguese (Brazil)",
        "ru": "Russian",
        "ar": "Arabic",
        "hi": "Hindi",
        "ur": "Urdu",
        "zh": "Chinese (Mandarin)",
        "ja": "Japanese",
        "ko": "Korean",
        "pl": "Polish",
        "tr": "Turkish",
        "nl": "Dutch",
        "sv": "Swedish",
        "cs": "Czech",
    }
    return names.get(code, code.upper())


async def run_espeak(term: str, voice: str) -> tuple[bool, str]:
    """Run espeak-ng and return IPA phonemes."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "espeak-ng",
            "-v",
            voice,
            "-q",  # Quiet (no audio output)
            "--ipa",  # Output IPA
            "-x",  # Explicit phoneme output
            term,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=5.0)

        if proc.returncode == 0:
            phonemes = stdout.decode("utf-8").strip()
            return True, phonemes
        else:
            error = stderr.decode("utf-8").strip()
            return False, error or "Unknown error"

    except asyncio.TimeoutError:
        return False, "Timeout: espeak-ng took too long"
    except FileNotFoundError:
        return False, "espeak-ng not installed"
    except Exception as e:
        return False, str(e)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    # Verify espeak-ng is available
    try:
        proc = subprocess.run(
            ["espeak-ng", "--version"],
            capture_output=True,
            timeout=5,
        )
        version = proc.stdout.decode("utf-8").strip().split("\n")[0]
        return {
            "status": "healthy",
            "service": "espeak-ng-g2p",
            "espeak_version": version,
            "languages_supported": len(LANGUAGE_VOICES),
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "service": "espeak-ng-g2p",
            "error": str(e),
        }


@app.post("/g2p", response_model=G2PResponse)
async def convert_to_phonemes(request: G2PRequest):
    """Convert a term to IPA phonemes."""
    voice = LANGUAGE_VOICES.get(request.language, LANGUAGE_VOICES["en"])

    success, result = await run_espeak(request.term, voice)

    return G2PResponse(
        term=request.term,
        phonemes=result if success else f"/{request.term}/",
        language=request.language,
        voice=voice,
        success=success,
        error=None if success else result,
    )


@app.post("/g2p/batch", response_model=BatchG2PResponse)
async def convert_batch(request: BatchG2PRequest):
    """Convert multiple terms to IPA phonemes."""
    voice = LANGUAGE_VOICES.get(request.language, LANGUAGE_VOICES["en"])

    # Process all terms concurrently
    tasks = [run_espeak(term, voice) for term in request.terms]
    results = await asyncio.gather(*tasks)

    responses = []
    successful = 0
    failed = 0

    for term, (success, result) in zip(request.terms, results):
        if success:
            successful += 1
        else:
            failed += 1

        responses.append(
            G2PResponse(
                term=term,
                phonemes=result if success else f"/{term}/",
                language=request.language,
                voice=voice,
                success=success,
                error=None if success else result,
            )
        )

    return BatchG2PResponse(
        results=responses,
        total=len(request.terms),
        successful=successful,
        failed=failed,
    )


@app.get("/languages", response_model=list[LanguageInfo])
async def list_languages():
    """List supported languages."""
    return [
        LanguageInfo(code=code, voice=voice, name=get_language_name(code))
        for code, voice in LANGUAGE_VOICES.items()
    ]


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8765)
