# espeak-ng Service Container
# Provides IPA phoneme generation for G2P fallback
#
# Part of VoiceAssist v4.2.0 Voice Mode Enhancement
# Reference: docs/voice/design/g2p-alternatives-evaluation.md

FROM ubuntu:24.04

# Avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install espeak-ng and required dependencies
RUN apt-get update && apt-get install -y \
    espeak-ng \
    espeak-ng-data \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install additional language data packs
RUN apt-get update && apt-get install -y \
    espeak-ng-data-en \
    espeak-ng-data-es \
    espeak-ng-data-fr \
    espeak-ng-data-de \
    espeak-ng-data-it \
    espeak-ng-data-pt \
    espeak-ng-data-ru \
    espeak-ng-data-ar \
    espeak-ng-data-hi \
    espeak-ng-data-ur \
    espeak-ng-data-zh \
    espeak-ng-data-ja \
    espeak-ng-data-ko \
    espeak-ng-data-pl \
    espeak-ng-data-tr \
    2>/dev/null || apt-get install -y espeak-ng \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Create a simple HTTP server for G2P requests
RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

# Install FastAPI for the HTTP service
RUN pip install --no-cache-dir fastapi uvicorn

# Copy the service script
COPY espeak_service.py /app/espeak_service.py

# Expose the service port
EXPOSE 8765

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8765/health || exit 1

# Run the service
CMD ["uvicorn", "espeak_service:app", "--host", "0.0.0.0", "--port", "8765"]
