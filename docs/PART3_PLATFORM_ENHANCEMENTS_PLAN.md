---
title: "Part3 Platform Enhancements Plan"
slug: "part3-platform-enhancements-plan"
summary: "**Date:** 2025-11-26"
status: stable
stability: beta
owner: docs
lastUpdated: "2025-11-27"
audience: ["human"]
tags: ["part3", "platform", "enhancements", "plan"]
---

# Part 3: Platform Enhancements - Implementation Plan

**Version:** 1.0
**Date:** 2025-11-26
**Status:** Planning
**Priority:** MEDIUM
**Estimated Duration:** 11-14 weeks

---

## Executive Summary

This document provides a comprehensive implementation plan for platform enhancements that improve the VoiceAssist foundation. These enhancements focus on design consistency, security hardening, search quality, and continuous improvement systems.

**Scope:**

1. **Design System Improvements** (2-3 weeks) - Complete design token system and documentation
2. **Client-Side Security** (2 weeks) - PHI protection and audit enhancements
3. **Advanced RAG Techniques** (4-5 weeks) - Hybrid search, re-ranking, contextual retrieval
4. **Continuous Learning System** (3-4 weeks) - Feedback collection and model improvement

**Total Estimated Effort:** 11-14 weeks with 2 developers

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Design System Improvements](#1-design-system-improvements)
3. [Client-Side Security](#2-client-side-security)
4. [Advanced RAG Techniques](#3-advanced-rag-techniques)
5. [Continuous Learning System](#4-continuous-learning-system)
6. [Implementation Phases](#implementation-phases)
7. [Technical Architecture](#technical-architecture)
8. [Risk Assessment](#risk-assessment)
9. [Success Metrics](#success-metrics)
10. [Appendices](#appendices)

---

## Current State Analysis

### What's Already Implemented

| Component                   | Status      | Location                                                 | Notes                      |
| --------------------------- | ----------- | -------------------------------------------------------- | -------------------------- |
| **Design Tokens (Colors)**  | ✅ Complete | `packages/design-tokens/src/colors.ts`                   | Light/dark themes, WCAG AA |
| **Design Tokens (Spacing)** | ✅ Complete | `packages/design-tokens/src/spacing.ts`                  | 4px base scale             |
| **Design Tokens (Typo)**    | ✅ Complete | `packages/design-tokens/src/typography.ts`               | Font scales defined        |
| **Storybook Setup**         | ✅ Complete | `packages/ui/.storybook/`                                | 12 component stories       |
| **Theme Provider**          | ✅ Complete | `packages/ui/src/providers/ThemeProvider.tsx`            | Context-based theming      |
| **PHI Detector (Backend)**  | ✅ Complete | `services/api-gateway/app/services/phi_detector.py`      | Pattern-based detection    |
| **PHI Redaction MW**        | ✅ Complete | `services/api-gateway/app/middleware/phi_redaction.py`   | Request/response filtering |
| **Audit Service**           | ✅ Complete | `services/api-gateway/app/services/audit_service.py`     | HIPAA-compliant logging    |
| **Vector Search**           | ✅ Complete | `services/api-gateway/app/services/search_aggregator.py` | Qdrant + OpenAI embeddings |
| **RAG Service**             | ✅ Complete | `services/api-gateway/app/services/rag_service.py`       | Basic RAG pipeline         |
| **Sentry Integration**      | ✅ Complete | `services/api-gateway/app/core/sentry.py`                | Error tracking configured  |

### What's Missing (This Plan)

| Component                  | Priority | Complexity | Dependencies              |
| -------------------------- | -------- | ---------- | ------------------------- |
| Animation Tokens           | MEDIUM   | Low        | Design tokens             |
| Medical UI Components      | MEDIUM   | Medium     | Design tokens, Storybook  |
| Component Docs (Storybook) | MEDIUM   | Low        | Existing components       |
| Client-Side PHI Detection  | HIGH     | Medium     | PHI patterns              |
| Encrypted Local Storage    | HIGH     | Medium     | Web Crypto API            |
| Session Audit Trail (FE)   | MEDIUM   | Low        | Audit service API         |
| Hybrid Search (BM25)       | HIGH     | High       | Elasticsearch/Meilisearch |
| Cross-Encoder Re-ranking   | HIGH     | High       | sentence-transformers     |
| Medical Synonym Expansion  | MEDIUM   | Medium     | UMLS/SNOMED CT            |
| Contextual Retrieval       | MEDIUM   | Medium     | Chunk metadata            |
| Feedback Collection        | HIGH     | Medium     | Frontend UI, Backend API  |
| A/B Testing Framework      | MEDIUM   | High       | Feature flags, Analytics  |
| KB Curation Dashboard      | MEDIUM   | Medium     | Admin panel               |

---

## 1. Design System Improvements

### 1.1 Overview

**Objective:** Establish a comprehensive, documented design system that ensures UI consistency across all VoiceAssist applications.

**Current State:** Basic design tokens exist (colors, spacing, typography) with Storybook configured and 12 component stories.

**Target State:** Complete design system with animations, medical-themed components, interactive documentation, and WCAG AAA compliance.

### 1.2 Technical Architecture

```
packages/
├── design-tokens/
│   └── src/
│       ├── colors.ts        ✅ Complete
│       ├── spacing.ts       ✅ Complete
│       ├── typography.ts    ✅ Complete
│       ├── animations.ts    🔲 NEW - Motion tokens
│       ├── shadows.ts       🔲 NEW - Elevation system
│       ├── breakpoints.ts   🔲 NEW - Responsive breakpoints
│       └── index.ts
├── ui/
│   ├── .storybook/          ✅ Configured
│   └── src/
│       ├── components/
│       │   ├── primitives/  ✅ Button, Input, etc.
│       │   └── medical/     🔲 NEW - VitalSignCard, MedicationList, etc.
│       ├── stories/
│       │   ├── *.stories.tsx ✅ 12 stories exist
│       │   └── medical/     🔲 NEW - Medical component stories
│       └── providers/
│           └── ThemeProvider.tsx ✅ Complete
└── tailwind-config/
    └── tailwind.preset.js   ✅ Shared config
```

### 1.3 Component Specifications

#### 1.3.1 Animation Tokens

**File:** `packages/design-tokens/src/animations.ts`

```typescript
/**
 * Animation tokens following medical UI best practices:
 * - Reduced motion support
 * - Subtle, non-distracting transitions
 * - Clear feedback for interactions
 */

export const durations = {
  instant: "0ms",
  fast: "100ms",
  normal: "200ms",
  slow: "300ms",
  slower: "500ms",
} as const;

export const easings = {
  linear: "linear",
  easeIn: "cubic-bezier(0.4, 0, 1, 1)",
  easeOut: "cubic-bezier(0, 0, 0.2, 1)",
  easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
  spring: "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
} as const;

export const animations = {
  fadeIn: {
    keyframes: { from: { opacity: 0 }, to: { opacity: 1 } },
    duration: durations.normal,
    easing: easings.easeOut,
  },
  slideUp: {
    keyframes: {
      from: { transform: "translateY(8px)", opacity: 0 },
      to: { transform: "translateY(0)", opacity: 1 },
    },
    duration: durations.normal,
    easing: easings.easeOut,
  },
  pulse: {
    keyframes: {
      "0%, 100%": { opacity: 1 },
      "50%": { opacity: 0.5 },
    },
    duration: durations.slower,
    easing: easings.easeInOut,
    iterationCount: "infinite",
  },
  // Medical-specific: Alert pulse for critical values
  criticalPulse: {
    keyframes: {
      "0%, 100%": {
        boxShadow: "0 0 0 0 rgba(239, 68, 68, 0.4)",
        borderColor: "var(--color-error-500)",
      },
      "50%": {
        boxShadow: "0 0 0 8px rgba(239, 68, 68, 0)",
        borderColor: "var(--color-error-600)",
      },
    },
    duration: "1.5s",
    easing: easings.easeInOut,
    iterationCount: "infinite",
  },
} as const;

// Reduced motion variants
export const reducedMotionAnimations = {
  fadeIn: { ...animations.fadeIn, duration: durations.instant },
  slideUp: { ...animations.fadeIn, duration: durations.instant }, // Fallback to fade
  pulse: null, // Disable pulsing animations
  criticalPulse: null,
} as const;
```

#### 1.3.2 Shadow/Elevation Tokens

**File:** `packages/design-tokens/src/shadows.ts`

```typescript
/**
 * Elevation system for depth and hierarchy
 * Based on Material Design principles, adapted for medical UI
 */

export const shadows = {
  none: "none",
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  // Medical-specific: Focus ring for accessibility
  focus: "0 0 0 3px var(--color-primary-500 / 0.3)",
  focusError: "0 0 0 3px var(--color-error-500 / 0.3)",
} as const;

export const elevation = {
  surface: shadows.none, // Base level (cards, panels)
  raised: shadows.sm, // Slightly elevated (buttons)
  overlay: shadows.md, // Dropdowns, tooltips
  modal: shadows.lg, // Modals, dialogs
  floating: shadows.xl, // FABs, floating elements
} as const;
```

#### 1.3.3 Medical UI Components

**File:** `packages/ui/src/components/medical/VitalSignCard.tsx`

```tsx
/**
 * VitalSignCard - Displays a single vital sign with status indication
 *
 * Features:
 * - Color-coded status (normal, warning, critical)
 * - Trend indicator (up, down, stable)
 * - Accessibility: High contrast, screen reader friendly
 * - Animation: Critical pulse for out-of-range values
 */

import React from "react";
import { cn } from "../../utils/cn";

export interface VitalSignCardProps {
  label: string;
  value: number | string;
  unit: string;
  status: "normal" | "warning" | "critical";
  trend?: "up" | "down" | "stable";
  normalRange?: { min: number; max: number };
  timestamp?: Date;
  className?: string;
}

const statusStyles = {
  normal: "bg-success-50 border-success-200 text-success-800",
  warning: "bg-warning-50 border-warning-200 text-warning-800",
  critical: "bg-error-50 border-error-200 text-error-800 animate-critical-pulse",
};

const trendIcons = {
  up: "↑",
  down: "↓",
  stable: "→",
};

export const VitalSignCard: React.FC<VitalSignCardProps> = ({
  label,
  value,
  unit,
  status,
  trend,
  normalRange,
  timestamp,
  className,
}) => {
  return (
    <div
      className={cn("rounded-lg border-2 p-4 transition-colors", statusStyles[status], className)}
      role="region"
      aria-label={`${label}: ${value} ${unit}, status: ${status}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium uppercase tracking-wide opacity-75">{label}</span>
        {trend && (
          <span className="text-lg" aria-label={`Trend: ${trend}`}>
            {trendIcons[trend]}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-3xl font-bold tabular-nums">{value}</span>
        <span className="text-sm opacity-75">{unit}</span>
      </div>

      {normalRange && (
        <div className="mt-2 text-xs opacity-60">
          Normal: {normalRange.min}-{normalRange.max} {unit}
        </div>
      )}

      {timestamp && <div className="mt-1 text-xs opacity-50">{timestamp.toLocaleTimeString()}</div>}
    </div>
  );
};
```

**File:** `packages/ui/src/components/medical/MedicationList.tsx`

```tsx
/**
 * MedicationList - Displays patient medications with interaction warnings
 */

import React from "react";

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  route: string;
  startDate: Date;
  endDate?: Date;
  prescriber?: string;
  interactions?: string[];
  contraindications?: string[];
}

export interface MedicationListProps {
  medications: Medication[];
  showInteractions?: boolean;
  onMedicationClick?: (med: Medication) => void;
  className?: string;
}

export const MedicationList: React.FC<MedicationListProps> = ({
  medications,
  showInteractions = true,
  onMedicationClick,
  className,
}) => {
  const hasInteractions = medications.some((m) => m.interactions?.length);

  return (
    <div className={className}>
      {hasInteractions && showInteractions && (
        <div className="mb-4 rounded-lg border-2 border-warning-300 bg-warning-50 p-3" role="alert">
          <strong className="text-warning-800">Drug Interactions Detected</strong>
          <p className="text-sm text-warning-700">Review potential interactions below</p>
        </div>
      )}

      <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
        {medications.map((med) => (
          <li
            key={med.id}
            className="py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer rounded px-2"
            onClick={() => onMedicationClick?.(med)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onMedicationClick?.(med)}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-neutral-900 dark:text-neutral-100">{med.name}</span>
                <span className="ml-2 text-sm text-neutral-600 dark:text-neutral-400">{med.dosage}</span>
              </div>
              {med.interactions?.length ? (
                <span className="rounded-full bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-800">
                  {med.interactions.length} interaction{med.interactions.length > 1 ? "s" : ""}
                </span>
              ) : null}
            </div>
            <div className="mt-1 text-sm text-neutral-500">
              {med.frequency} · {med.route}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
```

### 1.4 Implementation Tasks

| Task                                     | Priority | Effort  | Dependencies |
| ---------------------------------------- | -------- | ------- | ------------ |
| Create animation tokens                  | HIGH     | 4h      | None         |
| Create shadow/elevation tokens           | HIGH     | 2h      | None         |
| Create breakpoint tokens                 | MEDIUM   | 2h      | None         |
| Build VitalSignCard component            | HIGH     | 4h      | Tokens       |
| Build MedicationList component           | HIGH     | 4h      | Tokens       |
| Build AlertBanner component              | MEDIUM   | 3h      | Tokens       |
| Build TimelineEvent component            | MEDIUM   | 4h      | Tokens       |
| Build ClinicalNote component             | MEDIUM   | 4h      | Tokens       |
| Add Storybook stories for new components | HIGH     | 6h      | Components   |
| Write Storybook MDX documentation        | MEDIUM   | 8h      | Stories      |
| Add WCAG AAA contrast validation         | HIGH     | 4h      | Colors       |
| Create theme toggle demo page            | LOW      | 2h      | Theme system |
| **Total**                                |          | **47h** |              |

### 1.5 Deliverables

1. `packages/design-tokens/src/animations.ts` - Animation token definitions
2. `packages/design-tokens/src/shadows.ts` - Elevation system
3. `packages/design-tokens/src/breakpoints.ts` - Responsive breakpoints
4. `packages/ui/src/components/medical/*` - 5+ medical UI components
5. `packages/ui/src/stories/medical/*` - Storybook stories with docs
6. Updated `packages/ui/README.md` with usage guidelines
7. Storybook deployment at `storybook.voiceassist.dev` (optional)

---

## 2. Client-Side Security

### 2.1 Overview

**Objective:** Extend HIPAA-compliant security to the frontend with PHI detection, encrypted storage, and comprehensive audit trails.

**Current State:** Backend has PHI detection (`phi_detector.py`), redaction middleware, and audit logging. Frontend has no client-side PHI protection.

**Target State:** Client-side PHI detection with warnings, encrypted IndexedDB storage, and session audit trails synced to backend.

### 2.2 Technical Architecture

```
apps/web-app/src/
├── services/
│   ├── phi/
│   │   ├── PhiDetector.ts           🔲 NEW - Client-side PHI detection
│   │   ├── PhiWarningDialog.tsx     🔲 NEW - Warning UI component
│   │   └── patterns.ts              🔲 NEW - PHI regex patterns
│   ├── storage/
│   │   ├── EncryptedStorage.ts      🔲 NEW - Encrypted IndexedDB wrapper
│   │   ├── CryptoUtils.ts           🔲 NEW - Web Crypto API utilities
│   │   └── StorageSchema.ts         🔲 NEW - Schema definitions
│   └── audit/
│       ├── AuditTrail.ts            🔲 NEW - Client-side audit logger
│       ├── SessionRecorder.ts       🔲 NEW - Session activity recorder
│       └── AuditSync.ts             🔲 NEW - Background sync to backend
├── hooks/
│   ├── usePhiDetection.ts           🔲 NEW - PHI detection hook
│   ├── useEncryptedStorage.ts       🔲 NEW - Encrypted storage hook
│   └── useAuditTrail.ts             🔲 NEW - Audit trail hook
└── components/
    └── security/
        ├── PhiWarningBanner.tsx     🔲 NEW - Warning banner component
        └── SessionActivityLog.tsx   🔲 NEW - Activity log viewer
```

### 2.3 Component Specifications

#### 2.3.1 Client-Side PHI Detector

**File:** `apps/web-app/src/services/phi/PhiDetector.ts`

```typescript
/**
 * Client-Side PHI Detection Service
 *
 * Mirrors backend PHI detection for real-time warnings before submission.
 * Uses pattern matching similar to services/api-gateway/app/services/phi_detector.py
 *
 * IMPORTANT: This is a defensive layer. Backend validation is still authoritative.
 */

export interface PhiDetectionResult {
  containsPhi: boolean;
  phiTypes: PhiType[];
  confidence: number;
  matches: PhiMatch[];
}

export interface PhiMatch {
  type: PhiType;
  value: string;
  startIndex: number;
  endIndex: number;
  redacted: string;
}

export type PhiType = "ssn" | "phone" | "email" | "mrn" | "account" | "ip_address" | "dob" | "name";

// Pattern definitions matching backend
const PHI_PATTERNS: Record<PhiType, RegExp> = {
  ssn: /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g,
  phone: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  mrn: /\b(?:MRN|mrn|medical record|record number)[\s:-]?\d{6,}\b/gi,
  account: /\b(?:ACCT|acct|account)[\s:-]?\d{6,}\b/gi,
  ip_address: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  dob: /\b(?:born|dob|date of birth|birthday)[\s:]?(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12][0-9]|3[01])[/-](?:19|20)\d{2}\b/gi,
  name: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g,
};

// Medical terms to exclude from name detection
const MEDICAL_TERMS = new Set([
  "heart disease",
  "blood pressure",
  "diabetes mellitus",
  "atrial fibrillation",
  "chronic kidney",
  "coronary artery",
  "pulmonary embolism",
  "myocardial infarction",
  // ... extend as needed
]);

export class PhiDetector {
  /**
   * Detect PHI in text
   */
  detect(text: string): PhiDetectionResult {
    if (!text) {
      return { containsPhi: false, phiTypes: [], confidence: 1, matches: [] };
    }

    const matches: PhiMatch[] = [];
    const phiTypes = new Set<PhiType>();

    for (const [type, pattern] of Object.entries(PHI_PATTERNS) as [PhiType, RegExp][]) {
      // Reset regex state
      pattern.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        // Filter out medical terms for name detection
        if (type === "name" && MEDICAL_TERMS.has(match[0].toLowerCase())) {
          continue;
        }

        matches.push({
          type,
          value: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          redacted: this.redactValue(type, match[0]),
        });
        phiTypes.add(type);
      }
    }

    return {
      containsPhi: matches.length > 0,
      phiTypes: Array.from(phiTypes),
      confidence: 0.8, // Pattern matching confidence
      matches,
    };
  }

  /**
   * Sanitize text by redacting detected PHI
   */
  sanitize(text: string): string {
    const result = this.detect(text);
    let sanitized = text;

    // Process matches in reverse order to preserve indices
    const sortedMatches = [...result.matches].sort((a, b) => b.startIndex - a.startIndex);

    for (const match of sortedMatches) {
      sanitized = sanitized.slice(0, match.startIndex) + match.redacted + sanitized.slice(match.endIndex);
    }

    return sanitized;
  }

  private redactValue(type: PhiType, value: string): string {
    return `[${type.toUpperCase()}_REDACTED]`;
  }
}

// Singleton instance
export const phiDetector = new PhiDetector();
```

#### 2.3.2 PHI Detection Hook

**File:** `apps/web-app/src/hooks/usePhiDetection.ts`

```typescript
import { useState, useCallback, useMemo } from "react";
import { phiDetector, PhiDetectionResult } from "../services/phi/PhiDetector";
import { useDebounce } from "./useDebounce";

interface UsePhiDetectionOptions {
  debounceMs?: number;
  onPhiDetected?: (result: PhiDetectionResult) => void;
}

export function usePhiDetection(options: UsePhiDetectionOptions = {}) {
  const { debounceMs = 300, onPhiDetected } = options;

  const [text, setText] = useState("");
  const [result, setResult] = useState<PhiDetectionResult | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  const debouncedText = useDebounce(text, debounceMs);

  // Run detection when debounced text changes
  useMemo(() => {
    if (debouncedText) {
      const detection = phiDetector.detect(debouncedText);
      setResult(detection);

      if (detection.containsPhi) {
        setShowWarning(true);
        onPhiDetected?.(detection);
      }
    } else {
      setResult(null);
      setShowWarning(false);
    }
  }, [debouncedText, onPhiDetected]);

  const checkText = useCallback((newText: string) => {
    setText(newText);
  }, []);

  const sanitizeText = useCallback(() => {
    return phiDetector.sanitize(text);
  }, [text]);

  const dismissWarning = useCallback(() => {
    setShowWarning(false);
  }, []);

  const acknowledgeAndProceed = useCallback(() => {
    // Log acknowledgment for audit
    console.info("[PHI] User acknowledged PHI warning and proceeded");
    setShowWarning(false);
    return text; // Return original text if user chooses to proceed
  }, [text]);

  return {
    checkText,
    result,
    showWarning,
    dismissWarning,
    sanitizeText,
    acknowledgeAndProceed,
  };
}
```

#### 2.3.3 Encrypted Storage Service

**File:** `apps/web-app/src/services/storage/EncryptedStorage.ts`

```typescript
/**
 * Encrypted IndexedDB Storage
 *
 * Uses Web Crypto API for AES-GCM encryption of sensitive data.
 * Keys are derived from user authentication tokens.
 *
 * Use cases:
 * - Offline voice recordings awaiting sync
 * - Cached clinical context
 * - Session state
 */

import { openDB, DBSchema, IDBPDatabase } from "idb";

interface EncryptedStorageSchema extends DBSchema {
  "encrypted-data": {
    key: string;
    value: {
      id: string;
      encrypted: ArrayBuffer;
      iv: Uint8Array;
      timestamp: number;
      metadata?: Record<string, unknown>;
    };
  };
  "session-audit": {
    key: number;
    value: {
      id: number;
      action: string;
      timestamp: number;
      details: Record<string, unknown>;
      synced: boolean;
    };
    indexes: { "by-synced": boolean };
  };
}

export class EncryptedStorage {
  private db: IDBPDatabase<EncryptedStorageSchema> | null = null;
  private encryptionKey: CryptoKey | null = null;

  async init(userToken: string): Promise<void> {
    // Derive encryption key from user token
    this.encryptionKey = await this.deriveKey(userToken);

    // Open IndexedDB
    this.db = await openDB<EncryptedStorageSchema>("voiceassist-secure", 1, {
      upgrade(db) {
        db.createObjectStore("encrypted-data", { keyPath: "id" });

        const auditStore = db.createObjectStore("session-audit", {
          keyPath: "id",
          autoIncrement: true,
        });
        auditStore.createIndex("by-synced", "synced");
      },
    });
  }

  private async deriveKey(token: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(token), "PBKDF2", false, ["deriveKey"]);

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: encoder.encode("voiceassist-salt-v1"), // Static salt is OK for this use case
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  async store(id: string, data: unknown, metadata?: Record<string, unknown>): Promise<void> {
    if (!this.db || !this.encryptionKey) {
      throw new Error("EncryptedStorage not initialized");
    }

    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      this.encryptionKey,
      encoder.encode(JSON.stringify(data)),
    );

    await this.db.put("encrypted-data", {
      id,
      encrypted,
      iv,
      timestamp: Date.now(),
      metadata,
    });
  }

  async retrieve<T>(id: string): Promise<T | null> {
    if (!this.db || !this.encryptionKey) {
      throw new Error("EncryptedStorage not initialized");
    }

    const record = await this.db.get("encrypted-data", id);
    if (!record) return null;

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: record.iv },
      this.encryptionKey,
      record.encrypted,
    );

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decrypted)) as T;
  }

  async delete(id: string): Promise<void> {
    if (!this.db) throw new Error("EncryptedStorage not initialized");
    await this.db.delete("encrypted-data", id);
  }

  async logAuditEvent(action: string, details: Record<string, unknown>): Promise<void> {
    if (!this.db) throw new Error("EncryptedStorage not initialized");

    await this.db.add("session-audit", {
      id: Date.now(), // Will be overwritten by autoIncrement
      action,
      timestamp: Date.now(),
      details,
      synced: false,
    });
  }

  async getUnsyncedAuditEvents(): Promise<
    Array<{
      id: number;
      action: string;
      timestamp: number;
      details: Record<string, unknown>;
    }>
  > {
    if (!this.db) throw new Error("EncryptedStorage not initialized");
    return this.db.getAllFromIndex("session-audit", "by-synced", false);
  }

  async markAuditEventsSynced(ids: number[]): Promise<void> {
    if (!this.db) throw new Error("EncryptedStorage not initialized");

    const tx = this.db.transaction("session-audit", "readwrite");
    for (const id of ids) {
      const event = await tx.store.get(id);
      if (event) {
        await tx.store.put({ ...event, synced: true });
      }
    }
    await tx.done;
  }

  async clear(): Promise<void> {
    if (!this.db) throw new Error("EncryptedStorage not initialized");
    await this.db.clear("encrypted-data");
    await this.db.clear("session-audit");
  }
}

export const encryptedStorage = new EncryptedStorage();
```

#### 2.3.4 Session Audit Trail

**File:** `apps/web-app/src/services/audit/AuditTrail.ts`

```typescript
/**
 * Session Audit Trail
 *
 * Tracks user actions for HIPAA compliance and security monitoring.
 * Stores locally and syncs to backend audit service.
 */

import { encryptedStorage } from "../storage/EncryptedStorage";

export type AuditAction =
  | "session_start"
  | "session_end"
  | "message_sent"
  | "message_received"
  | "phi_warning_shown"
  | "phi_warning_acknowledged"
  | "phi_warning_dismissed"
  | "clinical_context_set"
  | "clinical_context_cleared"
  | "voice_mode_started"
  | "voice_mode_ended"
  | "file_uploaded"
  | "export_requested"
  | "navigation"
  | "error";

export interface AuditEvent {
  action: AuditAction;
  timestamp: number;
  sessionId: string;
  userId?: string;
  details: Record<string, unknown>;
}

class AuditTrail {
  private sessionId: string;
  private userId: string | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.sessionId = this.generateSessionId();
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  init(userId?: string): void {
    this.userId = userId ?? null;
    this.log("session_start", { userAgent: navigator.userAgent });

    // Sync every 30 seconds
    this.syncInterval = setInterval(() => this.sync(), 30000);

    // Sync on page unload
    window.addEventListener("beforeunload", () => {
      this.log("session_end", {});
      this.sync(); // Best effort sync
    });
  }

  log(action: AuditAction, details: Record<string, unknown>): void {
    const event: AuditEvent = {
      action,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userId: this.userId ?? undefined,
      details,
    };

    // Store locally
    encryptedStorage
      .logAuditEvent(action, {
        ...details,
        sessionId: this.sessionId,
        userId: this.userId,
      })
      .catch(console.error);

    // Also log to console in development
    if (process.env.NODE_ENV === "development") {
      console.debug("[Audit]", action, details);
    }
  }

  async sync(): Promise<void> {
    try {
      const unsyncedEvents = await encryptedStorage.getUnsyncedAuditEvents();
      if (unsyncedEvents.length === 0) return;

      // POST to backend audit endpoint
      const response = await fetch("/api/audit/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: unsyncedEvents }),
        credentials: "include",
      });

      if (response.ok) {
        await encryptedStorage.markAuditEventsSynced(unsyncedEvents.map((e) => e.id));
      }
    } catch (error) {
      console.error("[Audit] Sync failed:", error);
    }
  }

  destroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }
}

export const auditTrail = new AuditTrail();
```

### 2.4 Implementation Tasks

| Task                                  | Priority | Effort  | Dependencies     |
| ------------------------------------- | -------- | ------- | ---------------- |
| Create PhiDetector service            | HIGH     | 6h      | None             |
| Create usePhiDetection hook           | HIGH     | 3h      | PhiDetector      |
| Build PhiWarningBanner component      | HIGH     | 4h      | Hook             |
| Integrate PHI warnings in ChatInput   | HIGH     | 4h      | Banner           |
| Create EncryptedStorage service       | HIGH     | 8h      | idb library      |
| Create useEncryptedStorage hook       | MEDIUM   | 3h      | EncryptedStorage |
| Create AuditTrail service             | HIGH     | 6h      | EncryptedStorage |
| Create useAuditTrail hook             | MEDIUM   | 2h      | AuditTrail       |
| Build SessionActivityLog component    | LOW      | 4h      | AuditTrail       |
| Add backend /api/audit/batch endpoint | HIGH     | 4h      | None             |
| Write unit tests                      | HIGH     | 8h      | All components   |
| Write E2E tests for PHI flow          | MEDIUM   | 4h      | Integration      |
| **Total**                             |          | **56h** |                  |

### 2.5 Deliverables

1. `apps/web-app/src/services/phi/*` - PHI detection service and patterns
2. `apps/web-app/src/services/storage/*` - Encrypted IndexedDB storage
3. `apps/web-app/src/services/audit/*` - Audit trail service with sync
4. `apps/web-app/src/hooks/usePhi*.ts` - React hooks for security features
5. `apps/web-app/src/components/security/*` - Warning banners and activity log
6. Backend `/api/audit/batch` endpoint for audit sync
7. Unit and E2E tests with >80% coverage

---

## 3. Advanced RAG Techniques

### 3.1 Overview

**Objective:** Significantly improve search quality through hybrid search, re-ranking, and medical-domain optimizations.

**Current State:** Vector-only search using Qdrant with OpenAI embeddings (`search_aggregator.py`). No lexical search, no re-ranking.

**Target State:** Hybrid search (semantic + BM25), cross-encoder re-ranking, medical synonym expansion, and metadata filtering.

### 3.2 Technical Architecture

```
services/api-gateway/app/services/
├── search/
│   ├── search_aggregator.py       ✅ Exists - Vector search only
│   ├── hybrid_search.py           🔲 NEW - Combines vector + lexical
│   ├── bm25_index.py              🔲 NEW - BM25 lexical search
│   ├── cross_encoder.py           🔲 NEW - Re-ranking service
│   ├── query_expansion.py         🔲 NEW - Medical synonym expansion
│   └── contextual_retrieval.py    🔲 NEW - Chunk context enhancement
├── medical/
│   ├── synonym_database.py        🔲 NEW - UMLS/SNOMED synonyms
│   └── abbreviation_expander.py   🔲 NEW - Medical abbreviations
└── rag_service.py                 ✅ Exists - Main RAG orchestration

External Dependencies:
├── Meilisearch (or Elasticsearch) - Lexical search engine
├── sentence-transformers          - Cross-encoder models
└── UMLS API (optional)            - Medical synonyms
```

### 3.3 Hybrid Search Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            User Query                                    │
│                   "What are the contraindications for ASA?"             │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Query Preprocessor                                │
│  ┌───────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ Query         │  │ Abbreviation    │  │ Synonym Expansion       │  │
│  │ Cleaning      │──▶│ Expansion       │──▶│ (UMLS/SNOMED)           │  │
│  │               │  │ "ASA"→"aspirin" │  │ "aspirin, acetylsalicylic" │
│  └───────────────┘  └─────────────────┘  └─────────────────────────┘  │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
┌─────────────────────────────┐   ┌─────────────────────────────┐
│     Semantic Search         │   │      Lexical Search         │
│  ┌───────────────────────┐ │   │  ┌───────────────────────┐ │
│  │ OpenAI Embeddings     │ │   │  │ BM25 via Meilisearch  │ │
│  │ text-embedding-3-small│ │   │  │ (exact keyword match) │ │
│  └───────────┬───────────┘ │   │  └───────────┬───────────┘ │
│              ▼             │   │              ▼             │
│  ┌───────────────────────┐ │   │  ┌───────────────────────┐ │
│  │   Qdrant Vector DB    │ │   │  │ Meilisearch Index     │ │
│  │   cosine similarity   │ │   │  │ BM25 scoring          │ │
│  └───────────┬───────────┘ │   │  └───────────┬───────────┘ │
│              ▼             │   │              ▼             │
│  Top K=50 semantic results │   │  Top K=50 lexical results  │
└──────────────┬──────────────┘   └──────────────┬──────────────┘
               │                                  │
               └─────────────┬────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Reciprocal Rank Fusion (RRF)                       │
│         Combines results with formula: 1 / (k + rank)                    │
│         k=60 constant, deduplicates, normalizes scores                   │
└────────────────────────────────┬────────────────────────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Cross-Encoder Re-ranking                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Model: cross-encoder/ms-marco-MiniLM-L-6-v2                        │ │
│  │ Input: (query, passage) pairs                                       │ │
│  │ Output: Relevance scores 0-1                                        │ │
│  │ Top 20 candidates → Re-ranked top 10                               │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────┬────────────────────────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Contextual Enrichment                             │
│  - Add surrounding paragraph context                                     │
│  - Include document metadata (chapter, section)                          │
│  - Apply metadata filters (date, source type, specialty)                │
└────────────────────────────────┬────────────────────────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Final Results (Top 10)                            │
│  [{ content, score, metadata, context, source }]                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Component Specifications

#### 3.4.1 Hybrid Search Service

**File:** `services/api-gateway/app/services/search/hybrid_search.py`

```python
"""
Hybrid Search Service

Combines semantic (vector) and lexical (BM25) search using
Reciprocal Rank Fusion (RRF) for optimal retrieval.

Research basis:
- "Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods"
  (Cormack et al., 2009)
- Anthropic's "Contextual Retrieval" blog post (2024)
"""

from typing import List, Dict, Optional, Any
from dataclasses import dataclass
import asyncio
import logging

from .search_aggregator import SearchAggregator  # Existing semantic search
from .bm25_index import BM25Index
from .cross_encoder import CrossEncoderReranker

logger = logging.getLogger(__name__)


@dataclass
class HybridSearchResult:
    """Result from hybrid search"""
    doc_id: str
    content: str
    score: float
    semantic_rank: Optional[int]
    lexical_rank: Optional[int]
    rerank_score: Optional[float]
    metadata: Dict[str, Any]


class HybridSearchService:
    """
    Hybrid search combining semantic and lexical retrieval.

    Architecture:
    1. Query preprocessing (synonym expansion, abbreviations)
    2. Parallel semantic + lexical search
    3. Reciprocal Rank Fusion
    4. Cross-encoder re-ranking
    5. Contextual enrichment
    """

    def __init__(
        self,
        semantic_search: SearchAggregator,
        lexical_search: BM25Index,
        reranker: CrossEncoderReranker,
        semantic_weight: float = 0.5,
        rrf_k: int = 60,
    ):
        self.semantic_search = semantic_search
        self.lexical_search = lexical_search
        self.reranker = reranker
        self.semantic_weight = semantic_weight
        self.rrf_k = rrf_k

    async def search(
        self,
        query: str,
        top_k: int = 10,
        expand_synonyms: bool = True,
        rerank: bool = True,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[HybridSearchResult]:
        """
        Execute hybrid search.

        Args:
            query: Search query
            top_k: Number of results to return
            expand_synonyms: Whether to expand medical synonyms
            rerank: Whether to apply cross-encoder re-ranking
            filters: Metadata filters (e.g., {"source_type": "guideline"})

        Returns:
            List of hybrid search results
        """
        # Step 1: Preprocess query
        expanded_query = query
        if expand_synonyms:
            expanded_query = await self._expand_query(query)
            logger.debug(f"Expanded query: {query} -> {expanded_query}")

        # Step 2: Parallel search
        retrieval_k = max(top_k * 5, 50)  # Retrieve more for fusion

        semantic_task = self.semantic_search.search(
            expanded_query,
            top_k=retrieval_k,
            filter_conditions=filters,
        )
        lexical_task = self.lexical_search.search(
            expanded_query,
            top_k=retrieval_k,
            filters=filters,
        )

        semantic_results, lexical_results = await asyncio.gather(
            semantic_task, lexical_task
        )

        # Step 3: Reciprocal Rank Fusion
        fused_results = self._reciprocal_rank_fusion(
            semantic_results,
            lexical_results,
            k=self.rrf_k,
        )

        # Step 4: Re-ranking (optional)
        if rerank and len(fused_results) > 0:
            rerank_candidates = fused_results[:min(20, len(fused_results))]
            reranked = await self.reranker.rerank(
                query,
                [r.content for r in rerank_candidates]
            )

            # Apply rerank scores
            for i, score in enumerate(reranked):
                if i < len(fused_results):
                    fused_results[i].rerank_score = score

            # Sort by rerank score
            fused_results.sort(key=lambda x: x.rerank_score or 0, reverse=True)

        # Step 5: Return top K
        return fused_results[:top_k]

    def _reciprocal_rank_fusion(
        self,
        semantic_results: List[Any],
        lexical_results: List[Any],
        k: int = 60,
    ) -> List[HybridSearchResult]:
        """
        Combine results using Reciprocal Rank Fusion.

        RRF score = Σ 1 / (k + rank)
        """
        doc_scores: Dict[str, Dict] = {}

        # Process semantic results
        for rank, result in enumerate(semantic_results, 1):
            doc_id = result.doc_id
            rrf_score = 1 / (k + rank)

            if doc_id not in doc_scores:
                doc_scores[doc_id] = {
                    "content": result.content,
                    "metadata": result.metadata,
                    "rrf_score": 0,
                    "semantic_rank": None,
                    "lexical_rank": None,
                }

            doc_scores[doc_id]["rrf_score"] += rrf_score * self.semantic_weight
            doc_scores[doc_id]["semantic_rank"] = rank

        # Process lexical results
        for rank, result in enumerate(lexical_results, 1):
            doc_id = result.doc_id
            rrf_score = 1 / (k + rank)

            if doc_id not in doc_scores:
                doc_scores[doc_id] = {
                    "content": result.content,
                    "metadata": result.metadata,
                    "rrf_score": 0,
                    "semantic_rank": None,
                    "lexical_rank": None,
                }

            doc_scores[doc_id]["rrf_score"] += rrf_score * (1 - self.semantic_weight)
            doc_scores[doc_id]["lexical_rank"] = rank

        # Sort by RRF score and create results
        sorted_docs = sorted(
            doc_scores.items(),
            key=lambda x: x[1]["rrf_score"],
            reverse=True
        )

        return [
            HybridSearchResult(
                doc_id=doc_id,
                content=data["content"],
                score=data["rrf_score"],
                semantic_rank=data["semantic_rank"],
                lexical_rank=data["lexical_rank"],
                rerank_score=None,
                metadata=data["metadata"],
            )
            for doc_id, data in sorted_docs
        ]

    async def _expand_query(self, query: str) -> str:
        """Expand query with medical synonyms and abbreviations."""
        # Placeholder - implement with synonym_database.py
        return query
```

#### 3.4.2 BM25 Lexical Search

**File:** `services/api-gateway/app/services/search/bm25_index.py`

```python
"""
BM25 Lexical Search using Meilisearch

Meilisearch provides:
- Fast BM25-based full-text search
- Typo tolerance
- Faceted filtering
- Easy deployment (single binary)
"""

from typing import List, Dict, Optional, Any
from dataclasses import dataclass
import httpx
import logging

from ..core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class LexicalSearchResult:
    doc_id: str
    content: str
    score: float
    metadata: Dict[str, Any]


class BM25Index:
    """
    BM25 lexical search via Meilisearch.

    Index structure:
    - id: Document ID
    - content: Searchable text
    - title: Document title
    - source_type: "guideline" | "textbook" | "research"
    - specialty: Medical specialty
    - created_at: Timestamp
    """

    def __init__(
        self,
        host: str = None,
        api_key: str = None,
        index_name: str = "kb_documents",
    ):
        self.host = host or settings.MEILISEARCH_HOST
        self.api_key = api_key or settings.MEILISEARCH_API_KEY
        self.index_name = index_name
        self.client = httpx.AsyncClient(
            base_url=self.host,
            headers={"Authorization": f"Bearer {self.api_key}"},
            timeout=30.0,
        )

    async def search(
        self,
        query: str,
        top_k: int = 50,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[LexicalSearchResult]:
        """
        Execute BM25 search.

        Args:
            query: Search query
            top_k: Number of results
            filters: Metadata filters

        Returns:
            List of lexical search results
        """
        # Build Meilisearch filter string
        filter_str = self._build_filter(filters) if filters else None

        payload = {
            "q": query,
            "limit": top_k,
            "attributesToRetrieve": ["id", "content", "title", "metadata"],
            "showRankingScore": True,
        }

        if filter_str:
            payload["filter"] = filter_str

        try:
            response = await self.client.post(
                f"/indexes/{self.index_name}/search",
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

            return [
                LexicalSearchResult(
                    doc_id=hit["id"],
                    content=hit["content"],
                    score=hit.get("_rankingScore", 0),
                    metadata=hit.get("metadata", {}),
                )
                for hit in data.get("hits", [])
            ]

        except Exception as e:
            logger.error(f"Meilisearch search failed: {e}")
            return []

    async def index_document(
        self,
        doc_id: str,
        content: str,
        title: str,
        metadata: Dict[str, Any],
    ) -> bool:
        """Index a document for lexical search."""
        try:
            await self.client.post(
                f"/indexes/{self.index_name}/documents",
                json=[{
                    "id": doc_id,
                    "content": content,
                    "title": title,
                    **metadata,
                }],
            )
            return True
        except Exception as e:
            logger.error(f"Failed to index document {doc_id}: {e}")
            return False

    async def delete_document(self, doc_id: str) -> bool:
        """Delete a document from the index."""
        try:
            await self.client.delete(
                f"/indexes/{self.index_name}/documents/{doc_id}"
            )
            return True
        except Exception as e:
            logger.error(f"Failed to delete document {doc_id}: {e}")
            return False

    def _build_filter(self, filters: Dict[str, Any]) -> str:
        """Build Meilisearch filter string from dict."""
        conditions = []
        for key, value in filters.items():
            if isinstance(value, list):
                # OR condition for list values
                or_conditions = " OR ".join(f'{key} = "{v}"' for v in value)
                conditions.append(f"({or_conditions})")
            else:
                conditions.append(f'{key} = "{value}"')
        return " AND ".join(conditions)

    async def close(self):
        await self.client.aclose()
```

#### 3.4.3 Cross-Encoder Re-ranker

**File:** `services/api-gateway/app/services/search/cross_encoder.py`

```python
"""
Cross-Encoder Re-ranking Service

Uses sentence-transformers cross-encoder models for high-quality
passage re-ranking. Cross-encoders process query-passage pairs
together, enabling better relevance scoring than bi-encoders.

Model choices:
- cross-encoder/ms-marco-MiniLM-L-6-v2 (fast, good quality)
- cross-encoder/ms-marco-MiniLM-L-12-v2 (slower, better quality)
- BAAI/bge-reranker-base (good for general domain)
"""

from typing import List, Tuple
import logging
import torch
from sentence_transformers import CrossEncoder

logger = logging.getLogger(__name__)


class CrossEncoderReranker:
    """
    Re-ranks search results using a cross-encoder model.

    Architecture:
    - Query and each passage are concatenated and encoded together
    - Model outputs a relevance score for each pair
    - Results are sorted by relevance score
    """

    def __init__(
        self,
        model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2",
        device: str = None,
        max_length: int = 512,
    ):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model = CrossEncoder(model_name, device=self.device, max_length=max_length)
        logger.info(f"Loaded cross-encoder model {model_name} on {self.device}")

    async def rerank(
        self,
        query: str,
        passages: List[str],
        batch_size: int = 16,
    ) -> List[float]:
        """
        Re-rank passages for a query.

        Args:
            query: Search query
            passages: List of passage texts
            batch_size: Batch size for inference

        Returns:
            List of relevance scores (same order as passages)
        """
        if not passages:
            return []

        # Create query-passage pairs
        pairs = [[query, passage] for passage in passages]

        try:
            # Get scores (returns numpy array)
            scores = self.model.predict(
                pairs,
                batch_size=batch_size,
                show_progress_bar=False,
            )

            # Convert to Python floats
            return [float(s) for s in scores]

        except Exception as e:
            logger.error(f"Cross-encoder re-ranking failed: {e}")
            # Return neutral scores on failure
            return [0.5] * len(passages)

    async def rerank_with_indices(
        self,
        query: str,
        passages: List[str],
        top_k: int = 10,
    ) -> List[Tuple[int, float]]:
        """
        Re-rank and return top-k indices with scores.

        Returns:
            List of (original_index, score) tuples, sorted by score
        """
        scores = await self.rerank(query, passages)

        # Pair indices with scores and sort
        indexed_scores = list(enumerate(scores))
        indexed_scores.sort(key=lambda x: x[1], reverse=True)

        return indexed_scores[:top_k]
```

#### 3.4.4 Medical Synonym Expansion

**File:** `services/api-gateway/app/services/medical/synonym_database.py`

```python
"""
Medical Synonym Database

Provides medical term expansion using:
1. Static synonym dictionary (common terms)
2. Abbreviation expansion
3. Optional UMLS API integration

This improves search recall by matching different representations
of the same medical concept.
"""

from typing import List, Set, Dict, Optional
import logging
import re

logger = logging.getLogger(__name__)


class MedicalSynonymDatabase:
    """
    Medical synonym and abbreviation expansion.
    """

    def __init__(self, umls_api_key: Optional[str] = None):
        self.umls_api_key = umls_api_key

        # Static synonym dictionary (extensible)
        self.synonyms: Dict[str, Set[str]] = {
            # Cardiovascular
            "heart attack": {"myocardial infarction", "MI", "STEMI", "NSTEMI"},
            "myocardial infarction": {"heart attack", "MI", "STEMI", "NSTEMI"},
            "high blood pressure": {"hypertension", "HTN", "elevated BP"},
            "hypertension": {"high blood pressure", "HTN", "elevated BP"},
            "afib": {"atrial fibrillation", "AF", "a-fib"},
            "atrial fibrillation": {"afib", "AF", "a-fib"},

            # Medications
            "aspirin": {"ASA", "acetylsalicylic acid", "Bayer"},
            "asa": {"aspirin", "acetylsalicylic acid"},
            "metformin": {"glucophage", "metformin hydrochloride"},
            "lisinopril": {"zestril", "prinivil", "ACE inhibitor"},

            # Conditions
            "diabetes": {"diabetes mellitus", "DM", "type 2 diabetes", "T2DM"},
            "ckd": {"chronic kidney disease", "renal insufficiency"},
            "copd": {"chronic obstructive pulmonary disease", "emphysema"},
            "dvt": {"deep vein thrombosis", "deep venous thrombosis"},
            "pe": {"pulmonary embolism", "pulmonary embolus"},

            # Symptoms
            "shortness of breath": {"dyspnea", "SOB", "breathlessness"},
            "chest pain": {"angina", "chest discomfort"},

            # Labs
            "cbc": {"complete blood count", "blood count"},
            "bmp": {"basic metabolic panel", "chem 7"},
            "cmp": {"comprehensive metabolic panel", "chem 14"},
            "hba1c": {"hemoglobin a1c", "glycated hemoglobin", "a1c"},
        }

        # Common medical abbreviations
        self.abbreviations: Dict[str, str] = {
            "MI": "myocardial infarction",
            "HTN": "hypertension",
            "DM": "diabetes mellitus",
            "CHF": "congestive heart failure",
            "CABG": "coronary artery bypass graft",
            "PCI": "percutaneous coronary intervention",
            "CVA": "cerebrovascular accident",
            "TIA": "transient ischemic attack",
            "DVT": "deep vein thrombosis",
            "PE": "pulmonary embolism",
            "COPD": "chronic obstructive pulmonary disease",
            "CKD": "chronic kidney disease",
            "UTI": "urinary tract infection",
            "BID": "twice daily",
            "TID": "three times daily",
            "QID": "four times daily",
            "PRN": "as needed",
            "PO": "by mouth",
            "IV": "intravenous",
            "IM": "intramuscular",
            "SC": "subcutaneous",
            "ASA": "aspirin",
            "NSAID": "nonsteroidal anti-inflammatory drug",
            "ACE": "angiotensin converting enzyme",
            "ARB": "angiotensin receptor blocker",
            "CBC": "complete blood count",
            "BMP": "basic metabolic panel",
            "CMP": "comprehensive metabolic panel",
            "LFT": "liver function test",
            "TSH": "thyroid stimulating hormone",
            "ECG": "electrocardiogram",
            "EKG": "electrocardiogram",
        }

    def expand_query(self, query: str) -> str:
        """
        Expand query with medical synonyms.

        Returns expanded query with OR-joined synonyms.
        Example: "ASA contraindications" -> "(aspirin OR ASA OR acetylsalicylic acid) contraindications"
        """
        words = query.lower().split()
        expanded_parts = []

        i = 0
        while i < len(words):
            # Try multi-word matches (up to 3 words)
            matched = False
            for n in range(min(3, len(words) - i), 0, -1):
                phrase = " ".join(words[i:i+n])

                if phrase in self.synonyms:
                    synonyms = self.synonyms[phrase]
                    all_terms = {phrase} | synonyms
                    expanded_parts.append(f"({' OR '.join(all_terms)})")
                    i += n
                    matched = True
                    break

                # Check abbreviations (single word)
                if n == 1 and phrase.upper() in self.abbreviations:
                    expanded = self.abbreviations[phrase.upper()]
                    expanded_parts.append(f"({phrase} OR {expanded})")
                    i += 1
                    matched = True
                    break

            if not matched:
                expanded_parts.append(words[i])
                i += 1

        return " ".join(expanded_parts)

    def get_synonyms(self, term: str) -> Set[str]:
        """Get synonyms for a specific term."""
        term_lower = term.lower()

        # Check direct synonyms
        if term_lower in self.synonyms:
            return self.synonyms[term_lower]

        # Check abbreviations
        if term.upper() in self.abbreviations:
            expanded = self.abbreviations[term.upper()]
            return {expanded}

        return set()

    def add_synonym_group(self, terms: List[str]) -> None:
        """Add a group of synonymous terms."""
        term_set = set(t.lower() for t in terms)
        for term in term_set:
            existing = self.synonyms.get(term, set())
            self.synonyms[term] = existing | (term_set - {term})
```

### 3.5 Implementation Tasks

| Task                                 | Priority | Effort  | Dependencies          |
| ------------------------------------ | -------- | ------- | --------------------- |
| Set up Meilisearch server            | HIGH     | 4h      | Infrastructure        |
| Create BM25Index service             | HIGH     | 8h      | Meilisearch           |
| Create HybridSearchService           | HIGH     | 12h     | BM25Index             |
| Implement RRF fusion algorithm       | HIGH     | 4h      | HybridSearch          |
| Install sentence-transformers        | MEDIUM   | 2h      | Python env            |
| Create CrossEncoderReranker          | HIGH     | 8h      | sentence-transformers |
| Create MedicalSynonymDatabase        | MEDIUM   | 6h      | None                  |
| Integrate query expansion            | MEDIUM   | 4h      | SynonymDB             |
| Add contextual chunk metadata        | MEDIUM   | 6h      | DB schema             |
| Create metadata filtering API        | MEDIUM   | 4h      | HybridSearch          |
| Index existing KB in Meilisearch     | HIGH     | 4h      | Meilisearch           |
| Benchmark search quality (MRR, NDCG) | HIGH     | 8h      | All components        |
| Write unit tests                     | HIGH     | 12h     | All components        |
| Write integration tests              | HIGH     | 8h      | All components        |
| Performance tuning (latency < 200ms) | HIGH     | 8h      | All components        |
| **Total**                            |          | **98h** |                       |

### 3.6 Deliverables

1. `services/api-gateway/app/services/search/hybrid_search.py` - Main hybrid search
2. `services/api-gateway/app/services/search/bm25_index.py` - Meilisearch integration
3. `services/api-gateway/app/services/search/cross_encoder.py` - Re-ranking service
4. `services/api-gateway/app/services/medical/synonym_database.py` - Medical synonyms
5. Meilisearch deployment configuration (Docker Compose)
6. KB indexing scripts for Meilisearch
7. Updated RAG service using hybrid search
8. Search quality benchmarks (MRR@10, NDCG@10)
9. API documentation for new search endpoints

---

## 4. Continuous Learning System

### 4.1 Overview

**Objective:** Create infrastructure for collecting user feedback, improving model performance, and enabling data-driven KB curation.

**Current State:** Sentry for error tracking. No feedback collection or A/B testing.

**Target State:** Comprehensive feedback system with thumbs up/down, KB curation dashboard, A/B testing framework, and analytics.

### 4.2 Technical Architecture

```
services/api-gateway/app/
├── services/
│   ├── feedback/
│   │   ├── feedback_service.py      🔲 NEW - Feedback collection
│   │   ├── feedback_analyzer.py     🔲 NEW - Sentiment analysis
│   │   └── feedback_export.py       🔲 NEW - Export for fine-tuning
│   ├── ab_testing/
│   │   ├── experiment_manager.py    🔲 NEW - A/B test management
│   │   ├── variant_selector.py      🔲 NEW - User variant assignment
│   │   └── metrics_collector.py     🔲 NEW - Experiment metrics
│   └── analytics/
│       ├── search_analytics.py      🔲 NEW - Search quality metrics
│       ├── usage_analytics.py       🔲 NEW - Usage patterns
│       └── dashboard_service.py     🔲 NEW - Analytics API

apps/admin-panel/src/
├── pages/
│   ├── KBCurationDashboard.tsx      🔲 NEW - KB curation UI
│   ├── FeedbackReview.tsx           🔲 NEW - Feedback review UI
│   └── ABTestingDashboard.tsx       🔲 NEW - A/B test management

Database:
├── feedback table                    🔲 NEW
├── experiments table                 🔲 NEW
├── experiment_assignments table      🔲 NEW
├── search_metrics table              🔲 NEW
└── usage_events table                🔲 NEW
```

### 4.3 Database Schema

```sql
-- Feedback collection
CREATE TABLE feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    message_id UUID REFERENCES messages(id),
    conversation_id UUID REFERENCES conversations(id),

    -- Feedback data
    rating feedback_type NOT NULL,  -- 'positive', 'negative', 'neutral'
    category VARCHAR(50),           -- 'accuracy', 'relevance', 'clarity', 'other'
    comment TEXT,

    -- Context
    query TEXT,
    response_snippet TEXT,
    search_results JSONB,           -- What was retrieved
    model_used VARCHAR(100),

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ
);

CREATE TYPE feedback_type AS ENUM ('positive', 'negative', 'neutral');

CREATE INDEX idx_feedback_rating ON feedback(rating);
CREATE INDEX idx_feedback_unprocessed ON feedback(processed) WHERE processed = FALSE;

-- A/B Testing experiments
CREATE TABLE experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,

    -- Variants
    variants JSONB NOT NULL,        -- [{"id": "control", "weight": 50}, {"id": "treatment", "weight": 50}]

    -- Configuration
    target_metric VARCHAR(100),     -- 'search_mrr', 'feedback_positive_rate'
    min_sample_size INTEGER DEFAULT 1000,

    -- Status
    status experiment_status NOT NULL DEFAULT 'draft',
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,

    -- Results
    results JSONB,
    winner_variant VARCHAR(100),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE experiment_status AS ENUM ('draft', 'running', 'paused', 'completed', 'archived');

-- User variant assignments
CREATE TABLE experiment_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID REFERENCES experiments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,          -- Can be anonymous user ID
    variant_id VARCHAR(100) NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(experiment_id, user_id)
);

-- Search quality metrics
CREATE TABLE search_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL,
    query_hash VARCHAR(64) NOT NULL, -- For aggregation

    -- Retrieval metrics
    results_count INTEGER,
    top_result_score FLOAT,
    mrr FLOAT,                      -- Mean Reciprocal Rank
    ndcg FLOAT,                     -- Normalized Discounted Cumulative Gain

    -- User interaction
    clicked_result_position INTEGER,
    time_to_click_ms INTEGER,

    -- Context
    user_id UUID,
    experiment_id UUID REFERENCES experiments(id),
    variant_id VARCHAR(100),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_search_metrics_query_hash ON search_metrics(query_hash);
CREATE INDEX idx_search_metrics_experiment ON search_metrics(experiment_id, variant_id);
```

### 4.4 Component Specifications

#### 4.4.1 Feedback Service

**File:** `services/api-gateway/app/services/feedback/feedback_service.py`

```python
"""
Feedback Collection Service

Collects user feedback on AI responses for:
1. Quality monitoring
2. Fine-tuning data preparation
3. KB content curation
"""

from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime
import logging

from sqlalchemy.orm import Session
from sqlalchemy import func

from ...models.feedback import Feedback, FeedbackType
from ...core.database import get_db

logger = logging.getLogger(__name__)


class FeedbackService:
    """
    Manages user feedback collection and analysis.
    """

    async def submit_feedback(
        self,
        db: Session,
        user_id: Optional[UUID],
        message_id: UUID,
        conversation_id: UUID,
        rating: FeedbackType,
        category: Optional[str] = None,
        comment: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> Feedback:
        """
        Submit user feedback for a message.

        Args:
            user_id: User who submitted feedback (optional for anonymous)
            message_id: Message being rated
            conversation_id: Parent conversation
            rating: positive, negative, or neutral
            category: Feedback category (accuracy, relevance, clarity, other)
            comment: Optional text comment
            context: Additional context (query, search results, etc.)

        Returns:
            Created Feedback object
        """
        feedback = Feedback(
            user_id=user_id,
            message_id=message_id,
            conversation_id=conversation_id,
            rating=rating,
            category=category,
            comment=comment,
            query=context.get("query") if context else None,
            response_snippet=context.get("response_snippet") if context else None,
            search_results=context.get("search_results") if context else None,
            model_used=context.get("model_used") if context else None,
        )

        db.add(feedback)
        db.commit()
        db.refresh(feedback)

        logger.info(
            f"Feedback submitted: {rating.value} for message {message_id}"
        )

        return feedback

    async def get_feedback_stats(
        self,
        db: Session,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """Get aggregated feedback statistics."""
        query = db.query(Feedback)

        if start_date:
            query = query.filter(Feedback.created_at >= start_date)
        if end_date:
            query = query.filter(Feedback.created_at <= end_date)

        total = query.count()

        # Count by rating
        rating_counts = (
            query
            .with_entities(Feedback.rating, func.count(Feedback.id))
            .group_by(Feedback.rating)
            .all()
        )

        # Count by category
        category_counts = (
            query
            .filter(Feedback.category.isnot(None))
            .with_entities(Feedback.category, func.count(Feedback.id))
            .group_by(Feedback.category)
            .all()
        )

        return {
            "total": total,
            "by_rating": {r.value: c for r, c in rating_counts},
            "by_category": dict(category_counts),
            "positive_rate": (
                next((c for r, c in rating_counts if r == FeedbackType.POSITIVE), 0) / total
                if total > 0 else 0
            ),
        }

    async def get_negative_feedback(
        self,
        db: Session,
        limit: int = 100,
        unprocessed_only: bool = True,
    ) -> List[Feedback]:
        """
        Get negative feedback for review.

        Used by KB curation dashboard to identify content issues.
        """
        query = (
            db.query(Feedback)
            .filter(Feedback.rating == FeedbackType.NEGATIVE)
            .order_by(Feedback.created_at.desc())
        )

        if unprocessed_only:
            query = query.filter(Feedback.processed == False)

        return query.limit(limit).all()

    async def mark_processed(
        self,
        db: Session,
        feedback_ids: List[UUID],
    ) -> int:
        """Mark feedback as processed after review."""
        updated = (
            db.query(Feedback)
            .filter(Feedback.id.in_(feedback_ids))
            .update(
                {"processed": True, "processed_at": datetime.utcnow()},
                synchronize_session=False,
            )
        )
        db.commit()
        return updated

    async def export_for_fine_tuning(
        self,
        db: Session,
        min_rating: FeedbackType = FeedbackType.POSITIVE,
        limit: int = 10000,
    ) -> List[Dict[str, Any]]:
        """
        Export feedback data formatted for fine-tuning.

        Returns data in OpenAI fine-tuning format:
        {"messages": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
        """
        feedbacks = (
            db.query(Feedback)
            .filter(Feedback.rating == min_rating)
            .filter(Feedback.query.isnot(None))
            .filter(Feedback.response_snippet.isnot(None))
            .limit(limit)
            .all()
        )

        return [
            {
                "messages": [
                    {"role": "user", "content": f.query},
                    {"role": "assistant", "content": f.response_snippet},
                ]
            }
            for f in feedbacks
        ]
```

#### 4.4.2 A/B Testing Manager

**File:** `services/api-gateway/app/services/ab_testing/experiment_manager.py`

```python
"""
A/B Testing Experiment Manager

Enables controlled experiments for:
- Search algorithm variants
- Model versions
- Prompt variations
- UI changes
"""

from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime
import hashlib
import logging

from sqlalchemy.orm import Session

from ...models.experiment import Experiment, ExperimentAssignment, ExperimentStatus
from ...core.database import get_db

logger = logging.getLogger(__name__)


class ExperimentManager:
    """
    Manages A/B testing experiments.

    Features:
    - Consistent user-to-variant assignment (sticky)
    - Weighted variant distribution
    - Statistical significance tracking
    """

    async def create_experiment(
        self,
        db: Session,
        name: str,
        description: str,
        variants: List[Dict[str, Any]],
        target_metric: str,
        min_sample_size: int = 1000,
    ) -> Experiment:
        """
        Create a new experiment.

        Args:
            name: Unique experiment name
            description: Experiment description
            variants: List of variants with weights
                [{"id": "control", "weight": 50, "config": {...}}]
            target_metric: Primary metric to track
            min_sample_size: Minimum samples before significance

        Returns:
            Created Experiment object
        """
        experiment = Experiment(
            name=name,
            description=description,
            variants=variants,
            target_metric=target_metric,
            min_sample_size=min_sample_size,
            status=ExperimentStatus.DRAFT,
        )

        db.add(experiment)
        db.commit()
        db.refresh(experiment)

        logger.info(f"Created experiment: {name}")
        return experiment

    async def start_experiment(
        self,
        db: Session,
        experiment_id: UUID,
    ) -> Experiment:
        """Start an experiment."""
        experiment = db.query(Experiment).get(experiment_id)
        if not experiment:
            raise ValueError(f"Experiment {experiment_id} not found")

        experiment.status = ExperimentStatus.RUNNING
        experiment.started_at = datetime.utcnow()
        db.commit()

        logger.info(f"Started experiment: {experiment.name}")
        return experiment

    async def get_variant_for_user(
        self,
        db: Session,
        experiment_id: UUID,
        user_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get or assign variant for a user.

        Uses consistent hashing for sticky assignment.

        Args:
            experiment_id: Experiment ID
            user_id: User identifier (can be anonymous)

        Returns:
            Variant configuration or None if experiment not running
        """
        experiment = db.query(Experiment).get(experiment_id)
        if not experiment or experiment.status != ExperimentStatus.RUNNING:
            return None

        # Check existing assignment
        assignment = (
            db.query(ExperimentAssignment)
            .filter(
                ExperimentAssignment.experiment_id == experiment_id,
                ExperimentAssignment.user_id == user_id,
            )
            .first()
        )

        if assignment:
            # Return existing variant
            return self._get_variant_config(experiment, assignment.variant_id)

        # Assign new variant using consistent hashing
        variant_id = self._select_variant(experiment, user_id)

        new_assignment = ExperimentAssignment(
            experiment_id=experiment_id,
            user_id=user_id,
            variant_id=variant_id,
        )
        db.add(new_assignment)
        db.commit()

        return self._get_variant_config(experiment, variant_id)

    def _select_variant(self, experiment: Experiment, user_id: str) -> str:
        """
        Select variant using consistent hashing.

        Ensures same user always gets same variant.
        """
        # Hash user_id + experiment_id for consistent assignment
        hash_input = f"{experiment.id}:{user_id}"
        hash_value = int(hashlib.sha256(hash_input.encode()).hexdigest(), 16)

        # Calculate bucket (0-99)
        bucket = hash_value % 100

        # Assign based on cumulative weights
        cumulative = 0
        for variant in experiment.variants:
            cumulative += variant["weight"]
            if bucket < cumulative:
                return variant["id"]

        # Fallback to last variant
        return experiment.variants[-1]["id"]

    def _get_variant_config(
        self,
        experiment: Experiment,
        variant_id: str
    ) -> Dict[str, Any]:
        """Get variant configuration by ID."""
        for variant in experiment.variants:
            if variant["id"] == variant_id:
                return variant
        return {"id": variant_id}

    async def record_metric(
        self,
        db: Session,
        experiment_id: UUID,
        user_id: str,
        metric_name: str,
        metric_value: float,
    ) -> None:
        """Record a metric for an experiment."""
        # Get user's variant
        assignment = (
            db.query(ExperimentAssignment)
            .filter(
                ExperimentAssignment.experiment_id == experiment_id,
                ExperimentAssignment.user_id == user_id,
            )
            .first()
        )

        if not assignment:
            logger.warning(
                f"No assignment found for user {user_id} in experiment {experiment_id}"
            )
            return

        # Record metric (implementation depends on metrics storage)
        logger.debug(
            f"Recorded metric {metric_name}={metric_value} "
            f"for variant {assignment.variant_id}"
        )

    async def get_experiment_results(
        self,
        db: Session,
        experiment_id: UUID,
    ) -> Dict[str, Any]:
        """
        Get experiment results with statistical analysis.

        Returns:
            {
                "variants": [
                    {"id": "control", "sample_size": 500, "metric_mean": 0.65, ...},
                    {"id": "treatment", "sample_size": 520, "metric_mean": 0.72, ...},
                ],
                "p_value": 0.023,
                "significant": True,
                "winner": "treatment",
            }
        """
        # Implementation would include statistical significance calculation
        # using scipy.stats for t-test or chi-squared test
        pass
```

#### 4.4.3 KB Curation Dashboard (Frontend)

**File:** `apps/admin-panel/src/pages/KBCurationDashboard.tsx`

```tsx
/**
 * KB Curation Dashboard
 *
 * Allows admins to:
 * - Review negative feedback
 * - Identify problematic content
 * - Update/remove KB entries
 * - Track content quality metrics
 */

import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, Table, Badge, Button, Tabs } from "@voiceassist/ui";

interface FeedbackItem {
  id: string;
  rating: "positive" | "negative" | "neutral";
  category: string;
  comment: string;
  query: string;
  responseSnippet: string;
  searchResults: Array<{ docId: string; content: string; score: number }>;
  createdAt: string;
  processed: boolean;
}

export function KBCurationDashboard() {
  const [activeTab, setActiveTab] = useState<"feedback" | "metrics" | "content">("feedback");

  const { data: feedback, isLoading } = useQuery({
    queryKey: ["feedback", "negative"],
    queryFn: () => fetch("/api/admin/feedback?rating=negative&unprocessed=true").then((r) => r.json()),
  });

  const { data: stats } = useQuery({
    queryKey: ["feedback", "stats"],
    queryFn: () => fetch("/api/admin/feedback/stats").then((r) => r.json()),
  });

  const markProcessed = useMutation({
    mutationFn: (ids: string[]) =>
      fetch("/api/admin/feedback/mark-processed", {
        method: "POST",
        body: JSON.stringify({ ids }),
        headers: { "Content-Type": "application/json" },
      }),
  });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">KB Curation Dashboard</h1>

      {/* Stats Overview */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <div className="text-sm text-neutral-500">Total Feedback</div>
          <div className="text-3xl font-bold">{stats?.total || 0}</div>
        </Card>
        <Card>
          <div className="text-sm text-neutral-500">Positive Rate</div>
          <div className="text-3xl font-bold text-success-600">{((stats?.positive_rate || 0) * 100).toFixed(1)}%</div>
        </Card>
        <Card>
          <div className="text-sm text-neutral-500">Unprocessed</div>
          <div className="text-3xl font-bold text-warning-600">{stats?.unprocessed || 0}</div>
        </Card>
        <Card>
          <div className="text-sm text-neutral-500">This Week</div>
          <div className="text-3xl font-bold">{stats?.this_week || 0}</div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab as any}>
        <Tabs.List>
          <Tabs.Trigger value="feedback">Negative Feedback</Tabs.Trigger>
          <Tabs.Trigger value="metrics">Search Metrics</Tabs.Trigger>
          <Tabs.Trigger value="content">Content Issues</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="feedback">
          <Card className="mt-4">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Query</Table.Head>
                  <Table.Head>Category</Table.Head>
                  <Table.Head>Comment</Table.Head>
                  <Table.Head>Date</Table.Head>
                  <Table.Head>Actions</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {feedback?.items?.map((item: FeedbackItem) => (
                  <Table.Row key={item.id}>
                    <Table.Cell className="max-w-xs truncate">{item.query}</Table.Cell>
                    <Table.Cell>
                      <Badge
                        variant={
                          item.category === "accuracy" ? "error" : item.category === "relevance" ? "warning" : "default"
                        }
                      >
                        {item.category}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell className="max-w-md">{item.comment || "-"}</Table.Cell>
                    <Table.Cell>{new Date(item.createdAt).toLocaleDateString()}</Table.Cell>
                    <Table.Cell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            /* Open detail modal */
                          }}
                        >
                          Review
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => markProcessed.mutate([item.id])}>
                          Mark Done
                        </Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </Card>
        </Tabs.Content>

        <Tabs.Content value="metrics">
          {/* Search quality metrics charts */}
          <Card className="mt-4 p-4">
            <h3 className="font-semibold mb-4">Search Quality Metrics</h3>
            {/* Charts for MRR, NDCG, click-through rates */}
            <div className="text-neutral-500">Charts coming soon - integrate with your preferred charting library</div>
          </Card>
        </Tabs.Content>

        <Tabs.Content value="content">
          {/* Content issues detected from feedback patterns */}
          <Card className="mt-4 p-4">
            <h3 className="font-semibold mb-4">Detected Content Issues</h3>
            <p className="text-neutral-500">
              AI-detected patterns in negative feedback pointing to specific KB content
            </p>
          </Card>
        </Tabs.Content>
      </Tabs>
    </div>
  );
}
```

### 4.5 Implementation Tasks

| Task                               | Priority | Effort  | Dependencies      |
| ---------------------------------- | -------- | ------- | ----------------- |
| Create feedback database schema    | HIGH     | 2h      | None              |
| Create FeedbackService             | HIGH     | 6h      | Schema            |
| Create feedback API endpoints      | HIGH     | 4h      | Service           |
| Build feedback UI component        | HIGH     | 6h      | API               |
| Create experiment database schema  | MEDIUM   | 2h      | None              |
| Create ExperimentManager           | MEDIUM   | 8h      | Schema            |
| Create variant selection logic     | MEDIUM   | 4h      | ExperimentManager |
| Build A/B testing dashboard        | MEDIUM   | 8h      | ExperimentManager |
| Create search metrics collection   | HIGH     | 6h      | Search service    |
| Build KBCurationDashboard          | HIGH     | 12h     | Feedback API      |
| Create fine-tuning export endpoint | LOW      | 4h      | FeedbackService   |
| Integrate feedback into chat UI    | HIGH     | 4h      | Feedback UI       |
| Write unit tests                   | HIGH     | 8h      | All services      |
| Write integration tests            | MEDIUM   | 6h      | All services      |
| **Total**                          |          | **80h** |                   |

### 4.6 Deliverables

1. Database migrations for feedback, experiments, metrics tables
2. `services/api-gateway/app/services/feedback/*` - Feedback service
3. `services/api-gateway/app/services/ab_testing/*` - A/B testing framework
4. `services/api-gateway/app/services/analytics/*` - Search/usage analytics
5. `apps/admin-panel/src/pages/KBCurationDashboard.tsx` - Curation UI
6. `apps/admin-panel/src/pages/ABTestingDashboard.tsx` - A/B test management
7. `apps/web-app/src/components/FeedbackButton.tsx` - In-chat feedback
8. API documentation for feedback and experiments
9. Unit and integration tests

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-3)

**Focus:** Design system and security foundations

| Week | Tasks                                                    |
| ---- | -------------------------------------------------------- |
| 1    | Animation/shadow tokens, encryption storage setup        |
| 2    | Medical UI components, PHI detector, audit trail         |
| 3    | Storybook docs, PHI warnings integration, security tests |

**Deliverables:**

- Complete design token system
- Client-side PHI detection with warnings
- Encrypted IndexedDB storage
- Session audit trail

### Phase 2: Advanced Search (Weeks 4-7)

**Focus:** Hybrid search and re-ranking

| Week | Tasks                                         |
| ---- | --------------------------------------------- |
| 4    | Meilisearch setup, BM25 index service         |
| 5    | Hybrid search service, RRF fusion             |
| 6    | Cross-encoder re-ranker, medical synonyms     |
| 7    | Integration, benchmarking, performance tuning |

**Deliverables:**

- Hybrid search (semantic + BM25)
- Cross-encoder re-ranking
- Medical synonym expansion
- Search quality benchmarks

### Phase 3: Continuous Learning (Weeks 8-11)

**Focus:** Feedback and analytics

| Week | Tasks                                     |
| ---- | ----------------------------------------- |
| 8    | Feedback schema, service, API             |
| 9    | Feedback UI, chat integration             |
| 10   | A/B testing framework, experiment manager |
| 11   | KB curation dashboard, analytics          |

**Deliverables:**

- Feedback collection system
- A/B testing framework
- KB curation dashboard
- Search analytics

### Phase 4: Polish & Documentation (Weeks 12-14)

**Focus:** Testing, optimization, documentation

| Week | Tasks                                  |
| ---- | -------------------------------------- |
| 12   | End-to-end testing, bug fixes          |
| 13   | Performance optimization, load testing |
| 14   | Documentation, deployment guides       |

**Deliverables:**

- Comprehensive test coverage (>80%)
- Performance targets met (<200ms search)
- Complete documentation

---

## Technical Architecture

### System Integration Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Frontend                                    │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐  │
│  │ Design      │  │ PHI          │  │ Encrypted   │  │ Feedback     │  │
│  │ System      │  │ Detection    │  │ Storage     │  │ Collection   │  │
│  │ (tokens)    │  │ (warnings)   │  │ (IndexedDB) │  │ (thumbs)     │  │
│  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘  └──────┬───────┘  │
└─────────│────────────────│─────────────────│─────────────────│──────────┘
          │                │                 │                 │
          │                │                 │                 ▼
          │                │                 │    ┌─────────────────────┐
          │                │                 │    │  Feedback API       │
          │                │                 │    │  /api/feedback      │
          │                │                 │    └──────────┬──────────┘
          │                │                 │               │
          │                │                 ▼               │
          │                │    ┌─────────────────────┐      │
          │                │    │  Audit API          │      │
          │                │    │  /api/audit/batch   │      │
          │                │    └──────────┬──────────┘      │
          │                │               │                 │
          │                ▼               ▼                 ▼
          │    ┌───────────────────────────────────────────────────────┐
          │    │                    API Gateway                        │
          │    │  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐ │
          │    │  │ Audit       │  │ A/B Testing  │  │ Feedback     │ │
          │    │  │ Service     │  │ Manager      │  │ Service      │ │
          │    │  └─────────────┘  └──────────────┘  └──────────────┘ │
          │    │                                                       │
          │    │  ┌────────────────────────────────────────────────┐  │
          │    │  │              Hybrid Search Service              │  │
          │    │  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │  │
          │    │  │  │ Semantic │  │ Lexical  │  │ Cross-Encoder│  │  │
          │    │  │  │ (Qdrant) │  │ (Meili)  │  │ Re-ranker    │  │  │
          │    │  │  └────┬─────┘  └────┬─────┘  └──────────────┘  │  │
          │    │  │       │             │                          │  │
          │    │  │       └──────┬──────┘                          │  │
          │    │  │              ▼                                 │  │
          │    │  │    ┌─────────────────┐                        │  │
          │    │  │    │ RRF Fusion      │                        │  │
          │    │  │    └─────────────────┘                        │  │
          │    │  └────────────────────────────────────────────────┘  │
          │    └───────────────────────────────────────────────────────┘
          │                            │
          │                            ▼
          │    ┌───────────────────────────────────────────────────────┐
          │    │                    Data Layer                         │
          │    │  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐ │
          │    │  │ PostgreSQL  │  │ Qdrant       │  │ Meilisearch  │ │
          │    │  │ (feedback,  │  │ (vectors)    │  │ (BM25)       │ │
          │    │  │  audit, etc)│  │              │  │              │ │
          │    │  └─────────────┘  └──────────────┘  └──────────────┘ │
          │    └───────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Admin Panel                                    │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────────┐    │
│  │ KB Curation     │  │ A/B Testing      │  │ Analytics           │    │
│  │ Dashboard       │  │ Dashboard        │  │ Dashboard           │    │
│  └─────────────────┘  └──────────────────┘  └─────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Risk Assessment

| Risk                            | Likelihood | Impact | Mitigation                               |
| ------------------------------- | ---------- | ------ | ---------------------------------------- |
| Meilisearch performance issues  | Medium     | High   | Load testing, fallback to vector-only    |
| Cross-encoder latency too high  | Medium     | Medium | GPU inference, model distillation        |
| PHI false positives annoy users | High       | Medium | Tunable sensitivity, user acknowledgment |
| A/B test statistical errors     | Low        | High   | Proper sample sizes, multiple metrics    |
| IndexedDB encryption key loss   | Low        | Medium | Key derivation from auth, recovery flow  |
| Search quality regression       | Medium     | High   | Continuous benchmarking, rollback plan   |

---

## Success Metrics

### Design System

- **Component coverage:** 100% of UI components use design tokens
- **Storybook docs:** All components documented with examples
- **Theme consistency:** Zero visual inconsistencies between light/dark

### Security

- **PHI detection rate:** >95% of PHI patterns caught
- **Audit coverage:** 100% of sensitive actions logged
- **Storage encryption:** All offline data encrypted

### Search Quality

- **MRR@10:** >0.65 (baseline: ~0.50 with vector-only)
- **NDCG@10:** >0.70 (baseline: ~0.55)
- **Latency P95:** <200ms (including re-ranking)

### Continuous Learning

- **Feedback collection rate:** >10% of conversations get feedback
- **A/B test velocity:** Ability to run 2+ experiments simultaneously
- **KB improvement cycle:** <1 week from feedback to content update

---

## Appendices

### A. Meilisearch Deployment

```yaml
# docker-compose.meilisearch.yml
version: "3.8"
services:
  meilisearch:
    image: getmeili/meilisearch:v1.6
    ports:
      - "7700:7700"
    volumes:
      - meilisearch_data:/meili_data
    environment:
      - MEILI_ENV=production
      - MEILI_MASTER_KEY=${MEILISEARCH_MASTER_KEY}
      - MEILI_NO_ANALYTICS=true
    restart: unless-stopped

volumes:
  meilisearch_data:
```

### B. Cross-Encoder Model Comparison

| Model                                 | Latency (20 passages) | Quality (MS MARCO) |
| ------------------------------------- | --------------------- | ------------------ |
| cross-encoder/ms-marco-MiniLM-L-6-v2  | ~50ms (CPU)           | 0.373 MRR          |
| cross-encoder/ms-marco-MiniLM-L-12-v2 | ~100ms (CPU)          | 0.388 MRR          |
| BAAI/bge-reranker-base                | ~80ms (CPU)           | 0.385 MRR          |
| BAAI/bge-reranker-large               | ~150ms (CPU)          | 0.392 MRR          |

**Recommendation:** Start with MiniLM-L-6-v2 for latency, upgrade if quality insufficient.

### C. Feedback Categories

| Category     | Description                          | Action                         |
| ------------ | ------------------------------------ | ------------------------------ |
| accuracy     | Factually incorrect information      | Review source KB, flag content |
| relevance    | Answer not relevant to question      | Improve search, prompt tuning  |
| clarity      | Answer unclear or confusing          | Prompt engineering             |
| completeness | Answer missing important information | Expand KB content              |
| other        | General feedback                     | Manual review                  |

---

_Last updated: November 26, 2025_
_Based on VoiceAssist main branch post-Phase 12_
