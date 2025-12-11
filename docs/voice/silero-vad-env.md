---
title: Silero VAD Asset Hosting (Frontend)
slug: silero-vad-env
status: stable
stability: production
owner: frontend
audience:
  - human
  - ai-agents
tags: [voice, vad, silero, assets, deployment]
summary: Configure self-hosted Silero VAD and ONNX Runtime assets for the web app.
lastUpdated: "2025-12-11"
category: voice
component: "frontend/web-app"
relatedPaths:
  - "apps/web-app/src/hooks/useSileroVAD.ts"
  - "apps/web-app/src/hooks/useThinkerTalkerVoiceMode.ts"
  - "docs/VOICE_MODE_PIPELINE.md"
ai_summary: >-
  Describes how to self-host Silero VAD and ONNX Runtime Web assets for the
  VoiceAssist web app. Explains the Vite environment variables
  VITE_SILERO_ONNX_WASM_BASE_URL and VITE_SILERO_VAD_ASSET_BASE_URL, shows
  example paths under /vendor, and notes that the frontend gracefully falls
  back to jsDelivr CDNs when these variables are not set.
---

## Silero VAD Asset Hosting (Frontend)

Silero VAD runs entirely in the browser using ONNX Runtime Web. By default,
the web app loads the model and runtime from public CDNs. For production and
locked-down environments (e.g., hospital networks), you should self-host these
assets and point the frontend at your own origin.

### Environment Variables

Set the following Vite env vars for the web app:

- `VITE_SILERO_ONNX_WASM_BASE_URL`  
  Base URL for the ONNX Runtime Web WASM assets.  
  Example (Docker / nginx static path):
  - `VITE_SILERO_ONNX_WASM_BASE_URL=/vendor/onnxruntime-web/dist/`

- `VITE_SILERO_VAD_ASSET_BASE_URL`  
  Base URL for the Silero VAD model and support files.  
  Example (Docker / nginx static path):
  - `VITE_SILERO_VAD_ASSET_BASE_URL=/vendor/silero-vad/`

Both values must resolve to locations that contain the same files that are
available from the default CDNs:

- `onnxruntime-web@1.22.0/dist/`
- `@ricky0123/vad-web@0.0.30/dist/`

The frontend hook `useSileroVAD` reads these env vars at runtime and falls back
to the CDN URLs when they are not set, so you can roll out self-hosting
incrementally without code changes.

### Example `.env.local` Snippet

```bash
# Frontend: self-hosted Silero VAD assets
VITE_SILERO_ONNX_WASM_BASE_URL=/vendor/onnxruntime-web/dist/
VITE_SILERO_VAD_ASSET_BASE_URL=/vendor/silero-vad/
```

In containerized deployments, these paths are typically served by the
frontend gateway (nginx) from the web app's `public/` directory or a shared
static volume. See `docs/VOICE_MODE_PIPELINE.md` for how this ties into the
Thinker/Talker voice pipeline.
