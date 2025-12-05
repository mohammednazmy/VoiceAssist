---
title: Model Version Pinning
slug: voice/model-versions
summary: >-
  Tracks all HuggingFace model revisions used in VoiceAssist for supply chain
  security compliance.
status: stable
stability: production
owner: backend
lastUpdated: "2025-12-04"
audience:
  - human
  - ai-agents
  - backend
tags:
  - voice
  - models
  - security
  - supply-chain
category: reference
ai_summary: >-
  Reference for HuggingFace model version pinning in VoiceAssist (Bandit B615
  compliance). Lists pinned revisions for speaker diarization (pyannote), PHI
  NER, ML classifier, and medical embeddings. See speaker-diarization-service.md
  for diarization usage.
---

# Model Version Pinning

This document tracks all HuggingFace model revisions used in the VoiceAssist platform.
Pinning model revisions is required for supply chain security (Bandit B615).

## Current Pinned Versions

| Model                   | Model ID                         | Revision Hash                            | Version | Last Updated |
| ----------------------- | -------------------------------- | ---------------------------------------- | ------- | ------------ |
| Speaker Diarization     | pyannote/speaker-diarization-3.1 | cb03e11cae0c1f3c75fd7be406b7f0bbf33cd28c | v3.1.0  | 2024-12-04   |
| Speaker Embedding       | pyannote/embedding               | a9b3e59b43ceb4a4b04fb82bc7a1c36da47fe18a | Latest  | 2024-12-04   |
| PHI NER Model           | roberta-base-phi-i2b2            | main                                     | Local   | 2024-12-04   |
| ML Classifier Tokenizer | distilbert-base-uncased          | Local path                               | N/A     | 2024-12-04   |
| Medical Embeddings      | See medical_embedding_service.py | Configured                               | v1.0    | 2024-12-04   |

## Files with Model Loading

| File                                                                        | Models Loaded              | Status             |
| --------------------------------------------------------------------------- | -------------------------- | ------------------ |
| `services/api-gateway/app/engines/clinical_engine/enhanced_phi_detector.py` | PHI NER                    | Pinned             |
| `services/api-gateway/app/services/speaker_diarization_service.py`          | Diarization, Embedding     | Pinned             |
| `services/api-gateway/app/engines/conversation_engine/ml_classifier.py`     | DistilBERT tokenizer       | Local path (nosec) |
| `services/api-gateway/app/services/medical_embedding_service.py`            | Various medical embeddings | Already pinned     |
| `services/api-gateway/app/services/medical_embeddings.py`                   | Various medical embeddings | Already pinned     |

## Updating Model Versions

When upgrading a model:

1. **Test the new version** in a non-production environment
2. **Verify model performance** meets quality thresholds
3. **Get the commit hash** from HuggingFace Hub
4. **Update the revision** in the corresponding configuration
5. **Update this document** with the new hash and date
6. **Run security scan**: `bandit -r services/ --severity-level medium`

## Getting Revision Hashes

To find the current commit hash for a HuggingFace model:

```bash
# Using huggingface_hub CLI
huggingface-cli repo info pyannote/speaker-diarization-3.1

# Or via Python
from huggingface_hub import HfApi
api = HfApi()
info = api.repo_info("pyannote/speaker-diarization-3.1")
print(info.sha)  # Latest commit hash
```

## Security Notes

- **B615**: HuggingFace `from_pretrained()` without pinned revision is flagged
- **Local paths**: Loading from local paths (nosec B615) is safe
- **Pinned revisions**: Prevent malicious updates to model weights
- **Review process**: All model updates require security review

---

**Updated:** 2024-12-04
**Related:** [Post-v4.1 Roadmap](./roadmap/voice-mode-post-v41-roadmap.md)
