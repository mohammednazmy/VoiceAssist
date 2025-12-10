---
title: Legacy V1 Documentation
slug: archive/legacy-v1
status: deprecated
lastUpdated: "2025-12-08"
audience:
  - human
tags:
  - archive
  - legacy
  - v1
---

# Legacy V1 Documentation

This directory contains documentation from the original V1 architecture that has been superseded by V2.

## Current Documentation

**Do not use these documents for current development.** Instead, see:

- **Architecture**: [UNIFIED_ARCHITECTURE.md](../../UNIFIED_ARCHITECTURE.md) - Canonical V2 architecture
- **Development Phases**: [DEVELOPMENT_PHASES_V2.md](../../DEVELOPMENT_PHASES_V2.md) - Current phase documentation
- **Start Here**: [START_HERE.md](../../START_HERE.md) - Project entry point

## Contents

| File                  | Superseded By                          |
| --------------------- | -------------------------------------- |
| ARCHITECTURE.md       | UNIFIED_ARCHITECTURE.md                |
| ARCHITECTURE_V2.md    | UNIFIED_ARCHITECTURE.md (consolidated) |
| DEVELOPMENT_PHASES.md | DEVELOPMENT_PHASES_V2.md               |

## Key Differences V1 → V2

- V1 had 20 phases; V2 has 16 phases (0-15)
- V1 used `server/` directory; V2 uses `services/api-gateway/`
- V1 architecture was monolithic; V2 is Docker Compose-first with clear service boundaries
