---
title: Web App Specs
slug: web-app-specs
summary: >-
  The VoiceAssist web application provides browser-based access to the medical
  AI assistant for clinicians, supporting both text and voice interactions ...
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience:
  - frontend
  - ai-agents
tags:
  - web
  - app
  - specs
category: reference
component: "frontend/web-app"
relatedPaths:
  - "apps/web-app/src/App.tsx"
  - "apps/web-app/src/components"
ai_summary: >-
  The VoiceAssist web application provides browser-based access to the medical
  AI assistant for clinicians, supporting both text and voice interactions with
  deep integration into clinical workflows. Accessible at
  voiceassist.yourdomain.com. --- 1. Clinician UX & Workflows 2. Core Types &
  Interfaces...
---

# Web Application Specifications

## Overview

The VoiceAssist web application provides browser-based access to the medical AI assistant for clinicians, supporting both text and voice interactions with deep integration into clinical workflows. Accessible at `voiceassist.yourdomain.com`.

---

## Table of Contents

1. [Clinician UX & Workflows](#clinician-ux--workflows)
2. [Core Types & Interfaces](#core-types--interfaces)
3. [WebSocket & Realtime Events](#websocket--realtime-events)
4. [Component Architecture](#component-architecture)
5. [Technology Stack](#technology-stack)
6. [User Interface Design](#user-interface-design)
7. [Security & Compliance](#security--compliance)
8. [Testing Strategy](#testing-strategy)

---

## Clinician UX & Workflows

### Primary Doctor-Facing Flows

#### 1. Quick Consult Workflow

**Scenario:** A clinician on rounds needs a fast answer to a focused clinical question.

**Entry Point:** Home screen → Type question or tap microphone

**Screen Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│ VoiceAssist                       🔔  Dr. Smith ▼  Settings │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Quick Consult Mode                        [Context Panel ▶] │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 👤 Dr. Smith                                         │   │
│  │ "Management of NSTEMI in patient with CKD stage 3?" │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🤖 VoiceAssist  [streaming...] ⏹                    │   │
│  │                                                       │   │
│  │ For NSTEMI management in patients with CKD Stage 3:  │   │
│  │                                                       │   │
│  │ **Antiplatelet Therapy:**                            │   │
│  │ • Dual antiplatelet therapy (DAPT) recommended       │   │
│  │ • Aspirin 81-325mg + P2Y12 inhibitor                │   │
│  │ • Consider ticagrelor or prasugrel over clopidogrel  │   │
│  │ • Adjust for bleeding risk (see HAS-BLED score)     │   │
│  │                                                       │   │
│  │ **Anticoagulation:**                                 │   │
│  │ • Dose-adjust based on CrCl:                        │   │
│  │   - CrCl 30-50: Reduce enoxaparin to 1mg/kg daily   │   │
│  │   - Consider fondaparinux 5-7.5mg daily             │   │
│  │ • Monitor for bleeding complications                 │   │
│  │                                                       │   │
│  │ **Renal Considerations:**                            │   │
│  │ • Avoid/adjust contrast load during catheterization  │   │
│  │ • IV hydration protocol for renal protection        │   │
│  │ • Hold metformin if contrast given                   │   │
│  │                                                       │   │
│  │ ─────────────────────────────────────────────────   │   │
│  │ 📚 **Sources:**                                      │   │
│  │ [1] 2020 ACC/AHA Guideline for NSTEMI (Class I)     │   │
│  │ [2] KDIGO 2023 Guidelines for CKD Management        │   │
│  │ [3] UpToDate: NSTEMI in patients with CKD          │   │
│  │                                                       │   │
│  │ ⚠️  Clinical judgment required. Not a replacement   │   │
│  │     for individualized patient assessment.           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────┐      │
│  │ Follow-up question or new consult...      🎤  ⮕  │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

**Context Sent to Backend:**

```json
{
  "sessionId": "sess_abc123",
  "mode": "quick_consult",
  "query": "Management of NSTEMI in patient with CKD stage 3?",
  "clinicalContext": null,
  "preferences": {
    "prioritizeSources": ["guidelines", "uptodate"],
    "citationStyle": "inline"
  }
}
```

**Citation Display:** Inline numbered citations with expandable source panel showing:

- Full citation (AMA format)
- Quick link to full text (if available)
- Recommendation class (for guidelines)
- One-click "Add to Library"

**Safety Elements:**

- Prominent warning banner: "⚠️ Clinical judgment required. Not a replacement for individualized patient assessment."
- Each recommendation shows evidence level/class if from guideline
- "Report Issue" button for incorrect information

---

#### 2. Case Workspace Workflow

**Scenario:** Doctor opens a case workspace to manage a complex patient with ongoing conversation anchored to patient context.

**Entry Point:** Home → "New Case" or "Open Case: [Patient Name]"

**Screen Layout:**

```
┌──────────────────────────────────────────────────────────────────┐
│ VoiceAssist                          🔔  Dr. Smith ▼  Settings  │
├──────────────┬───────────────────────────────────────────────────┤
│              │ Case: 65M with Decompensated HF        [Save]     │
│ Case List    ├───────────────────────────────────────────────────┤
│              │                                                     │
│ 🔍 Search    │ ┌─────────────────────────────────────────────┐  │
│              │ │ 📋 Patient Context         [Collapse] [Edit] │  │
│ Active Cases │ ├─────────────────────────────────────────────┤  │
│ ────────────│ │ Age: 65   Sex: M   Weight: 92kg             │  │
│ ● 65M HFrEF  │ │                                              │  │
│ ● 72F COPD   │ │ **Problems:**                               │  │
│              │ │ • HFrEF (EF 25%)                            │  │
│ Recent Cases │ │ • CKD Stage 3b (eGFR 38)                    │  │
│ ────────────│ │ • Hypertension                              │  │
│ · 58M CAD    │ │ • Type 2 Diabetes                           │  │
│ · 81F CVA    │ │                                              │  │
│              │ │ **Medications:**                            │  │
│ [+ New Case] │ │ • Carvedilol 25mg BID                       │  │
│              │ │ • Lisinopril 40mg daily                     │  │
│              │ │ • Furosemide 80mg BID                       │  │
│              │ │ • Spironolactone 25mg daily                 │  │
│              │ │                                              │  │
│              │ │ **Labs (yesterday):**                       │  │
│              │ │ Cr 1.8, BUN 42, K+ 4.2, BNP 1200           │  │
│              │ └─────────────────────────────────────────────┘  │
│              │                                                     │
│              │ Conversation History ──────────────────────────   │
│              │                                                     │
│              │ 👤  What are options for further diuresis?         │
│              │                                                     │
│              │ 🤖  Given this patient's context (HFrEF, CKD 3b):  │
│              │                                                     │
│              │     1. **Increase loop diuretic:**                 │
│              │        • Furosemide 120mg BID (from 80mg)          │
│              │        • Monitor K+, Cr closely [📚 Ref 1]         │
│              │                                                     │
│              │     2. **Add thiazide (synergy):**                 │
│              │        • Metolazone 2.5-5mg daily                  │
│              │        • Give 30min before loop [📚 Ref 2]         │
│              │                                                     │
│              │     3. **Consider torsemide switch:**              │
│              │        • Better bioavailability in gut edema       │
│              │        • Torsemide 100mg daily ≈ furosemide 80 BID│
│              │                                                     │
│              │     ⚠️  Monitor renal function q2-3 days initially │
│              │                                                     │
│              │ ─────────────────────────────────────────────────   │
│              │                                                     │
│              │ 👤  What about IV diuresis if oral not working?    │
│              │                                                     │
│              │ 🤖  [Response with IV protocols...]                │
│              │                                                     │
│              │ ┌──────────────────────────────────────────────┐  │
│              │ │ Ask about this case...           🎤   ⮕      │  │
│              │ └──────────────────────────────────────────────┘  │
└──────────────┴───────────────────────────────────────────────────┘
```

**Context Sent with Each Query:**

```json
{
  "sessionId": "case_xyz789",
  "mode": "case_workspace",
  "query": "What are options for further diuresis?",
  "clinicalContext": {
    "caseId": "case_xyz789",
    "title": "65M with Decompensated HF",
    "patient": {
      "age": 65,
      "sex": "M",
      "weight": 92
    },
    "problems": ["HFrEF (EF 25%)", "CKD Stage 3b (eGFR 38)", "Hypertension", "Type 2 Diabetes"],
    "medications": ["Carvedilol 25mg BID", "Lisinopril 40mg daily", "Furosemide 80mg BID", "Spironolactone 25mg daily"],
    "labs": "Cr 1.8, BUN 42, K+ 4.2, BNP 1200",
    "conversationHistory": [
      /* previous messages */
    ]
  }
}
```

**Key Features:**

- Persistent patient context panel (collapsible)
- Conversation anchored to this case
- All AI responses consider the clinical context
- Can save/export case workspace with full conversation
- Multiple cases can be open in tabs

---

#### 3. Guideline Comparison Workflow

**Scenario:** Doctor wants to compare two clinical guidelines or trials.

**Entry Point:** Quick Consult → "Compare guidelines/trials" OR Library → Select 2+ sources → "Compare"

**Screen Layout:**

```
┌──────────────────────────────────────────────────────────────────┐
│ VoiceAssist - Guideline Comparison            🔔  Dr. Smith ▼   │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Comparing Guidelines for: **Atrial Fibrillation Anticoagulation**│
│                                                                    │
│  ┌──────────────────────────┬──────────────────────────────────┐│
│  │ 2023 ACC/AHA AFib Guide  │ 2020 ESC AFib Guidelines         ││
│  ├──────────────────────────┼──────────────────────────────────┤│
│  │ **Anticoagulation:**     │ **Anticoagulation:**             ││
│  │                          │                                  ││
│  │ CHA₂DS₂-VASc ≥ 2 (men)  │ CHA₂DS₂-VASc ≥ 2 (men)          ││
│  │ CHA₂DS₂-VASc ≥ 3 (women)│ CHA₂DS₂-VASc ≥ 3 (women)        ││
│  │                          │                                  ││
│  │ **Preferred Agents:**    │ **Preferred Agents:**            ││
│  │ • DOACs over warfarin    │ • DOACs over VKA                 ││
│  │   (Class I, Level A)     │   (Class I, Level A)             ││
│  │                          │                                  ││
│  │ **DOAC Options:**        │ **DOAC Options:**                ││
│  │ • Apixaban 5mg BID       │ • Apixaban 5mg BID               ││
│  │ • Rivaroxaban 20mg daily │ • Dabigatran 150mg BID           ││
│  │ • Edoxaban 60mg daily    │ • Edoxaban 60mg daily            ││
│  │ • Dabigatran 150mg BID   │ • Rivaroxaban 20mg daily         ││
│  │                          │                                  ││
│  │ **Key Difference:**      │ **Key Difference:**              ││
│  │ Lists apixaban first     │ No preference order stated       ││
│  │ (based on bleeding data) │                                  ││
│  ├──────────────────────────┼──────────────────────────────────┤│
│  │ **Renal Dosing:**        │ **Renal Dosing:**                ││
│  │ Detailed table for each  │ Similar guidance                 ││
│  │ DOAC by CrCl             │                                  ││
│  │                          │                                  ││
│  │ CrCl 15-30: Apixaban OK  │ CrCl <15: Avoid all DOACs        ││
│  │ CrCl <15: Warfarin only  │ Use VKA instead                  ││
│  └──────────────────────────┴──────────────────────────────────┘│
│                                                                    │
│  🤖 **AI Summary of Key Differences:**                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 1. ACC/AHA gives preference order (apixaban first), ESC    │ │
│  │    does not differentiate among DOACs                       │ │
│  │                                                              │ │
│  │ 2. Both strongly recommend DOACs over warfarin/VKA          │ │
│  │                                                              │ │
│  │ 3. Renal dosing guidance is nearly identical                │ │
│  │                                                              │ │
│  │ 4. ACC/AHA more explicit on apixaban in CrCl 15-30          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  [Export Comparison] [Ask Follow-up Question]                     │
└──────────────────────────────────────────────────────────────────┘
```

**Implementation:**

- Side-by-side view with synchronized scrolling
- Highlight differences in yellow
- AI-generated summary of key differences
- Export to PDF with proper citations

---

#### 4. Note Drafting Workflow

**Scenario:** Doctor wants help drafting an assessment and plan based on structured clinical data.

**Entry Point:** Case Workspace → "Draft Note" button

**Screen Layout:**

```
┌──────────────────────────────────────────────────────────────────┐
│ VoiceAssist - Note Drafting               🔔  Dr. Smith ▼       │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Case: 65M with Decompensated HF                                  │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 📝 **Generated Assessment & Plan** (Review/Edit)           │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │                                                              │ │
│  │ **Assessment:**                                             │ │
│  │                                                              │ │
│  │ 65-year-old male with history of HFrEF (EF 25%), CKD       │ │
│  │ stage 3b, presenting with decompensated heart failure.      │ │
│  │ Volume overload evident by elevated BNP (1200), clinical    │ │
│  │ exam findings. Current diuretic regimen appears inadequate. │ │
│  │                                                              │ │
│  │ **Plan:**                                                    │ │
│  │                                                              │ │
│  │ 1. **Diuresis:**                                            │ │
│  │    - Increase furosemide to 120mg BID from 80mg BID        │ │
│  │    - Consider adding metolazone 2.5mg daily if inadequate  │ │
│  │    - Strict I/O monitoring, daily weights                   │ │
│  │    - Goal: net negative 1-1.5L daily                        │ │
│  │                                                              │ │
│  │ 2. **Renal Monitoring:**                                    │ │
│  │    - Check BMP q2-3 days during aggressive diuresis        │ │
│  │    - Hold ACE-I if Cr rises >30% from baseline             │ │
│  │                                                              │ │
│  │ 3. **HF Medications:**                                      │ │
│  │    - Continue carvedilol 25mg BID                           │ │
│  │    - Continue spironolactone 25mg daily                     │ │
│  │    - Monitor K+ closely                                     │ │
│  │                                                              │ │
│  │ 4. **Cardiology Consultation:**                             │ │
│  │    - For consideration of device therapy evaluation         │ │
│  │    - Discuss advanced HF options if refractory              │ │
│  │                                                              │ │
│  │ 5. **Disposition:**                                         │ │
│  │    - Admit for IV diuresis if oral regimen ineffective      │ │
│  │    - Daily follow-up as outpatient if responding            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ⚠️  **Review carefully. Modify as needed for your clinical       │
│      judgment and institutional protocols.**                      │
│                                                                    │
│  [Copy to Clipboard] [Regenerate] [Export as Note] [Cancel]      │
└──────────────────────────────────────────────────────────────────┘
```

**How It Works:**

1. User provides structured problem list (from case workspace)
2. AI generates assessment/plan based on:
   - Clinical context
   - Latest guidelines
   - Standard of care
3. Doctor reviews and edits
4. Can regenerate with modifications
5. Export to clipboard or EMR (if integrated)

**Safety:**

- Prominent disclaimer: "Review carefully. Modify as needed..."
- Always requires physician review before use
- Clear watermark: "AI-assisted draft"
- Logs that this was AI-generated for audit purposes

---

### ASCII Wireframes for Main Views

#### Clinical Home / Dashboard

```
┌────────────────────────────────────────────────────────────────────┐
│ VoiceAssist                🔍 Search        🔔  Dr. Smith ▼  ⚙️    │
├────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Good morning, Dr. Smith                                            │
│                                                                      │
│  ┌──────────────────────┬──────────────────────┬─────────────────┐│
│  │ 🎤 Quick Consult     │ 📋 Open Case         │ 📚 Library      ││
│  │                      │                      │                 ││
│  │ Ask a clinical       │ Continue working on  │ Browse medical  ││
│  │ question             │ an existing case     │ knowledge base  ││
│  └──────────────────────┴──────────────────────┴─────────────────┘│
│                                                                      │
│  Recent Activity ───────────────────────────────────────────────   │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │ 📋 65M with Decompensated HF                   2 hours ago  │   │
│  │    "Options for further diuresis?"                          │   │
│  │    [Resume]                                                 │   │
│  ├────────────────────────────────────────────────────────────┤   │
│  │ 💬 Quick Consult                              Yesterday     │   │
│  │    "NSTEMI management in CKD stage 3"                       │   │
│  │    [View]                                                   │   │
│  ├────────────────────────────────────────────────────────────┤   │
│  │ 📋 72F COPD Exacerbation                      Yesterday     │   │
│  │    "Steroid dosing and duration"                            │   │
│  │    [Resume]                                                 │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Knowledge Base Updates ────────────────────────────────────────   │
│                                                                      │
│  • Updated: 2024 AHA Heart Failure Guidelines                       │
│  • New: NEJM - TRANSFORM-HF Trial Results                           │
│  • Updated: CDC COVID-19 Treatment Guidelines                       │
│                                                                      │
└────────────────────────────────────────────────────────────────────┘
```

#### Chat + Context + Citations Layout

```
┌────────────────────────────────────────────────────────────────────┐
│ VoiceAssist                                 🔔  Dr. Smith ▼  ⚙️    │
├───────────┬────────────────────────────────────────┬───────────────┤
│           │                                         │               │
│ Sessions  │ Conversation                            │ Context Panel │
│           │                                         │               │
│ Today     │ 👤 What's the latest on SGLT2i in HF?  │ 📋 Quick Note │
│ ────────  │                                         │               │
│ ● Current │ 🤖  Recent evidence strongly supports   │ Add clinical  │
│   Quick   │     SGLT2 inhibitors in HFrEF...        │ context here  │
│   Consult │                                         │ to improve    │
│           │     [Full response...]                  │ responses.    │
│ Yesterday │                                         │               │
│ ────────  │     📚 **Sources:**                     │ [+ Add]       │
│ · Case A  │     [1] DAPA-HF Trial (NEJM 2019)      │               │
│ · Case B  │     [2] EMPEROR-Reduced (NEJM 2020)    │ ─────────────│
│           │     [3] 2022 AHA/ACC HF Guidelines     │               │
│ Last Week │                                         │ 🔖 Saved     │
│ ────────  │ 👤 Which one should I use?             │    Items      │
│ · Case C  │                                         │               │
│           │ 🤖  Both dapagliflozin and empagliflozin│ • DAPA-HF    │
│           │     have robust evidence...             │   Trial      │
│ [+ New]   │                                         │ • CKD Guide  │
│           │ ┌────────────────────────────────────┐ │               │
│           │ │ Type message...        🎤 📎  ⮕   │ │               │
│           │ └────────────────────────────────────┘ │               │
└───────────┴────────────────────────────────────────┴───────────────┘
```

#### Library View

```
┌────────────────────────────────────────────────────────────────────┐
│ VoiceAssist - Medical Library                   🔔  Dr. Smith ▼    │
├────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  🔍 Search library...                           [Filter ▼] [Sort ▼]│
│                                                                      │
│  Categories: [All] [Textbooks] [Guidelines] [Journals] [My Notes]   │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐│
│  │ 📘 Harrison's Principles of Internal Medicine, 21st Edition    ││
│  │    McGraw-Hill | 4,896 pages | Last indexed: 2 weeks ago       ││
│  │    [Open] [Search within] [★ Favorite]                         ││
│  ├────────────────────────────────────────────────────────────────┤│
│  │ 📄 2023 ACC/AHA Heart Failure Guidelines                       ││
│  │    ACC/AHA | 156 pages | Added: 1 month ago                    ││
│  │    [Open] [Compare] [★ Favorite]                               ││
│  ├────────────────────────────────────────────────────────────────┤│
│  │ 📄 2020 ESC Atrial Fibrillation Guidelines                     ││
│  │    ESC | 124 pages | Added: 3 months ago                       ││
│  │    [Open] [Compare] [★ Favorite]                               ││
│  ├────────────────────────────────────────────────────────────────┤│
│  │ 📗 UpToDate: NSTEMI Management                                 ││
│  │    UpToDate | Updated: Last week                               ││
│  │    [Open] [★ Favorite]                                         ││
│  ├────────────────────────────────────────────────────────────────┤│
│  │ 📝 My Notes: Common Dosing Adjustments in CKD                  ││
│  │    Personal | 3 pages | Last edited: Yesterday                 ││
│  │    [Open] [Edit] [Delete]                                      ││
│  └────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  [← Prev]  Page 1 of 24  [Next →]                [+ Upload New]    │
└────────────────────────────────────────────────────────────────────┘
```

#### History View

```
┌────────────────────────────────────────────────────────────────────┐
│ VoiceAssist - Conversation History                 🔔  Dr. Smith ▼ │
├────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  🔍 Search conversations...                      [Filter ▼] [⚙️]    │
│                                                                      │
│  Filter: [All] [Quick Consults] [Cases] [Last 7 days ▼]            │
│                                                                      │
│  Today ────────────────────────────────────────────────────────────│
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐│
│  │ 💬 Quick Consult                                     2:45 PM   ││
│  │    "NSTEMI management in CKD stage 3"                          ││
│  │    5 messages • 3 citations                                    ││
│  │    [Open] [Export] [Delete]                                    ││
│  ├────────────────────────────────────────────────────────────────┤│
│  │ 📋 Case: 65M with Decompensated HF                  10:30 AM  ││
│  │    "Options for further diuresis?"                             ││
│  │    12 messages • 7 citations • Context saved                   ││
│  │    [Resume] [Export] [Delete]                                  ││
│  └────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Yesterday ────────────────────────────────────────────────────────│
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐│
│  │ 📋 Case: 72F COPD Exacerbation                       4:15 PM  ││
│  │    "Steroid dosing and duration"                               ││
│  │    8 messages • 4 citations                                    ││
│  │    [Resume] [Export] [Delete]                                  ││
│  ├────────────────────────────────────────────────────────────────┤│
│  │ 💬 Quick Consult                                     1:30 PM  ││
│  │    "DVT prophylaxis in hospitalized patients"                  ││
│  │    3 messages • 2 citations                                    ││
│  │    [Open] [Export] [Delete]                                    ││
│  └────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  [← Prev]  Page 1 of 15  [Next →]                                  │
└────────────────────────────────────────────────────────────────────┘
```

#### Settings View

```
┌────────────────────────────────────────────────────────────────────┐
│ VoiceAssist - Settings                          🔔  Dr. Smith ▼    │
├──────────────┬─────────────────────────────────────────────────────┤
│              │                                                       │
│ ⚙️ General   │ General Settings ─────────────────────────────────  │
│              │                                                       │
│ 🎤 Voice     │ Language: [English (US) ▼]                           │
│              │                                                       │
│ 🔒 Privacy   │ Theme: ○ Light  ● Dark  ○ Auto                      │
│              │                                                       │
│ 📚 Citations │ Startup: ● Quick Consult  ○ Dashboard  ○ Last View  │
│              │                                                       │
│ 🔔 Alerts    │ ─────────────────────────────────────────────────   │
│              │                                                       │
│ 👤 Profile   │ Voice Settings ───────────────────────────────────  │
│              │                                                       │
│              │ Microphone: [Default - MacBook Pro ▼]                │
│              │                                                       │
│              │ Voice Activity Detection:                             │
│              │ ○ Push-to-talk  ● Automatic  ○ Always listening      │
│              │                                                       │
│              │ TTS Voice: [Ava (Female, US) ▼]                     │
│              │                                                       │
│              │ Speech Rate: [●─────────] Normal                     │
│              │                                                       │
│              │ ─────────────────────────────────────────────────   │
│              │                                                       │
│              │ Privacy & Safety ─────────────────────────────────  │
│              │                                                       │
│              │ ☑ Show safety warnings for all clinical advice       │
│              │ ☑ Redact PHI from conversation history               │
│              │ ☐ Opt out of anonymized usage analytics              │
│              │                                                       │
│              │ Session timeout: [30 minutes ▼]                      │
│              │                                                       │
│              │ ─────────────────────────────────────────────────   │
│              │                                                       │
│              │ Citation Preferences ─────────────────────────────  │
│              │                                                       │
│              │ Citation style: [AMA ▼]                              │
│              │                                                       │
│              │ Prioritize sources:                                   │
│              │ 1. ☑ Clinical guidelines                             │
│              │ 2. ☑ UpToDate                                        │
│              │ 3. ☐ Primary literature (trials)                     │
│              │ 4. ☑ Textbooks                                       │
│              │                                                       │
│              │ [Save Changes] [Cancel]                               │
└──────────────┴─────────────────────────────────────────────────────┘
```

---

## Core Types & Interfaces

**Note**: For canonical entity definitions (JSON Schema, Pydantic, TypeScript), see [DATA_MODEL.md](DATA_MODEL.md). This section provides usage examples specific to the web app.

### Clinical Context Types

```typescript
// Patient/Case Context
export interface ClinicalContext {
  id: string;
  caseId?: string;
  title: string;
  createdAt: string;
  updatedAt: string;

  patient?: {
    age?: number;
    sex?: "M" | "F" | "Other" | "Unknown";
    weight?: number;
    height?: number;
  };

  problems?: string[];
  medications?: string[];
  allergies?: string[];
  labs?: string; // Free text for now
  vitals?: string; // Free text for now
  notes?: string; // Additional context

  specialty?: string; // e.g., "cardiology", "pulmonology"
  urgency?: "routine" | "urgent" | "emergent";
}

// Citation with rich metadata
export interface Citation {
  id: string;
  sourceType: "textbook" | "journal" | "guideline" | "uptodate" | "note" | "trial";
  title: string;
  subtitle?: string;
  authors?: string[];

  // Source identification
  source?: string; // e.g., "Harrison's Internal Medicine, 21e"
  publisher?: string;
  publicationYear?: number;

  // Location within source
  chapter?: string;
  section?: string;
  page?: string | number;

  // Digital identifiers
  doi?: string;
  pmid?: string;
  url?: string;

  // Guideline-specific
  recommendationClass?: "I" | "IIa" | "IIb" | "III"; // ACC/AHA classes
  evidenceLevel?: "A" | "B" | "C";

  // Excerpt
  excerpt?: string; // Relevant excerpt from source

  // Metadata
  specialty?: string[];
  tags?: string[];
  relevanceScore?: number; // 0-1, how relevant to query
}

// Message in conversation
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;

  // Optional fields
  citations?: Citation[];
  clinicalContextId?: string;
  attachments?: Attachment[];

  // Streaming state
  streaming?: boolean;
  error?: {
    code: string;
    message: string;
  };

  // User actions
  pinned?: boolean;
  edited?: boolean;
  regenerated?: boolean;
}

// File attachment
export interface Attachment {
  id: string;
  name: string;
  type: string; // MIME type
  size: number; // bytes
  url: string;
  uploadedAt: string;
  status: "uploading" | "processing" | "ready" | "failed";
  errorMessage?: string;
}

// Conversation/Session
export interface ConversationSession {
  id: string;
  userId: string;
  mode: "quick_consult" | "case_workspace" | "guideline_comparison";
  title: string;
  createdAt: string;
  updatedAt: string;

  clinicalContext?: ClinicalContext;
  messages: ChatMessage[];

  metadata?: {
    messageCount: number;
    citationCount: number;
    duration?: number; // seconds
    lastActivity: string;
  };

  archived?: boolean;
  starred?: boolean;
  tags?: string[];
}

// User settings
export interface UserSettings {
  userId: string;

  general: {
    language: string;
    theme: "light" | "dark" | "auto";
    startupView: "quick_consult" | "dashboard" | "last_view";
  };

  voice: {
    microphone?: string;
    mode: "push_to_talk" | "automatic" | "always_listening";
    ttsVoice: string;
    speechRate: number; // 0.5 - 2.0
  };

  privacy: {
    showSafetyWarnings: boolean;
    redactPHI: boolean;
    optOutAnalytics: boolean;
    sessionTimeout: number; // minutes
  };

  citations: {
    style: "AMA" | "APA" | "Vancouver" | "NLM";
    prioritizeSources: Array<"guidelines" | "uptodate" | "trials" | "textbooks">;
  };

  notifications: {
    enabled: boolean;
    sound: boolean;
    kbUpdates: boolean;
  };
}

// Knowledge base document
export interface KBDocument {
  id: string;
  name: string;
  type: "textbook" | "journal" | "guideline" | "note" | "uptodate";

  // Metadata
  authors?: string[];
  publisher?: string;
  publicationYear?: number;
  edition?: string;
  isbn?: string;
  doi?: string;

  // Indexing info
  pages?: number;
  indexed: boolean;
  lastIndexedAt?: string;
  indexingStatus?: "pending" | "running" | "completed" | "failed";
  indexingError?: string;

  // Storage
  sourcePath?: string;
  fileSize?: number;

  // Content stats
  chunkCount?: number;
  vectorCount?: number;

  // Organization
  specialty?: string[];
  tags?: string[];
  favorite?: boolean;

  // Access
  uploadedBy: string;
  uploadedAt: string;
  accessCount?: number;
  lastAccessedAt?: string;
}
```

---

## Chat Data Flow

This section describes the complete message flow from user input to rendered response, including WebSocket streaming and fallback patterns.

### Chat Message Flow Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                     Chat Message Flow                           │
└────────────────────────────────────────────────────────────────┘

User Input (text/voice)
    ↓
[1. Client-side validation]
    ↓
[2. REST POST /api/chat/message]
    └─→ APIEnvelope<ChatResponse>
    ↓
[3. Initial response with message ID]
    ↓
[4. WebSocket streaming /ws/chat/{session_id}]
    └─→ Stream deltas: { type: "delta", content: "..." }
    └─→ Stream citations: { type: "citation", citation: {...} }
    └─→ Stream complete: { type: "done" }
    ↓
[5. Render incremental deltas]
    └─→ Append to message content
    └─→ Show typing indicator
    ↓
[6. Message complete]
    └─→ Hide typing indicator
    └─→ Show final citations
    └─→ Enable follow-up input

Alternative Flow (No Streaming):
    REST POST → Complete response → Render full message
```

**Key Points:**

- Initial POST returns message ID and session ID
- WebSocket provides streaming deltas for better UX
- Citations sent separately as they're assembled
- Fallback to non-streaming if WebSocket fails

### Complete Chat Hook Example

```typescript
// app/hooks/useChatSession.ts

import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAPI } from "@/lib/api";
import { ChatMessage, ChatRequest, ChatResponse, Session } from "@/types"; // From DATA_MODEL.md

interface WebSocketDelta {
  type: "delta" | "citation" | "done" | "error";
  content?: string;
  citation?: Citation;
  error?: APIError;
}

export function useChatSession(sessionId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();

  // Load existing messages for session
  useEffect(() => {
    async function loadMessages() {
      const session = await fetchAPI<Session>(`/api/sessions/${sessionId}`);
      setMessages(session.messages || []);
    }
    loadMessages();
  }, [sessionId]);

  // WebSocket connection for streaming
  useEffect(() => {
    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL}/ws/chat/${sessionId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("WebSocket connected", { sessionId });
    };

    ws.onmessage = (event) => {
      const delta: WebSocketDelta = JSON.parse(event.data);

      switch (delta.type) {
        case "delta":
          // Append content delta to streaming message
          setMessages((prev) => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage?.id === streamingMessageId) {
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMessage,
                  content: lastMessage.content + (delta.content || ""),
                },
              ];
            }
            return prev;
          });
          break;

        case "citation":
          // Add citation to streaming message
          if (delta.citation) {
            setMessages((prev) => {
              const lastMessage = prev[prev.length - 1];
              if (lastMessage?.id === streamingMessageId) {
                return [
                  ...prev.slice(0, -1),
                  {
                    ...lastMessage,
                    citations: [...(lastMessage.citations || []), delta.citation!],
                  },
                ];
              }
              return prev;
            });
          }
          break;

        case "done":
          // Streaming complete
          setIsStreaming(false);
          setStreamingMessageId(null);
          queryClient.invalidateQueries(["session", sessionId]);
          break;

        case "error":
          // Streaming error
          console.error("WebSocket error:", delta.error);
          setIsStreaming(false);
          setStreamingMessageId(null);
          toast.error(delta.error?.message || "Streaming failed");
          break;
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      toast.error("Connection lost. Messages will be delivered without streaming.");
    };

    ws.onclose = () => {
      console.log("WebSocket closed");
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, [sessionId, streamingMessageId, queryClient]);

  // Send message mutation
  const sendMessage = useMutation({
    mutationFn: async (request: ChatRequest) => {
      // Add user message immediately (optimistic update)
      const userMessage: ChatMessage = {
        id: `temp_${Date.now()}`,
        session_id: sessionId,
        role: "user",
        content: request.message,
        created_at: new Date().toISOString(),
        citations: [],
      };

      setMessages((prev) => [...prev, userMessage]);

      // Send to backend
      const response = await fetchAPI<ChatResponse>("/api/chat/message", {
        method: "POST",
        body: JSON.stringify({
          ...request,
          session_id: sessionId,
        }),
      });

      return response;
    },

    onSuccess: (response) => {
      // Replace temp user message with real one
      setMessages((prev) => prev.map((msg) => (msg.id.startsWith("temp_") ? response.user_message : msg)));

      // Add assistant message (will be updated via WebSocket)
      const assistantMessage: ChatMessage = {
        ...response.message,
        content: "", // Will be filled by streaming deltas
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setIsStreaming(true);
      setStreamingMessageId(response.message.id);
    },

    onError: (error: APIError) => {
      // Remove optimistic user message on error
      setMessages((prev) => prev.filter((msg) => !msg.id.startsWith("temp_")));

      // Show error message
      if (error.code === "PHI_DETECTED") {
        toast.info("Your query contains sensitive information. Using secure local processing.");
      } else {
        toast.error(error.message);
      }
    },
  });

  const clearSession = useCallback(() => {
    setMessages([]);
    queryClient.invalidateQueries(["session", sessionId]);
  }, [sessionId, queryClient]);

  return {
    messages,
    isStreaming,
    sendMessage: sendMessage.mutate,
    isSending: sendMessage.isPending,
    clearSession,
  };
}
```

**Usage in Component:**

```typescript
// app/components/ChatInterface.tsx

export function ChatInterface({ sessionId }: { sessionId: string }) {
  const { messages, isStreaming, sendMessage, isSending } = useChatSession(sessionId);
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSending) return;

    sendMessage({
      message: input,
      session_id: sessionId,
      clinical_context_id: null, // Or get from context
    });

    setInput('');
  };

  return (
    <div className="chat-interface">
      <div className="messages">
        {messages.map(message => (
          <MessageBubble
            key={message.id}
            message={message}
            isStreaming={isStreaming && message.role === 'assistant'}
          />
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={isSending || isStreaming}
          placeholder="Ask a clinical question..."
        />
        <button type="submit" disabled={isSending || isStreaming}>
          {isSending ? 'Sending...' : isStreaming ? 'Generating...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
```

---

## Advanced Clinician Features (Design)

These features are designed but not yet implemented. They represent Phase 6-10 enhancements.

### Rounds Mode

**Purpose**: Pin a clinical context while the clinician walks through multiple questions about the same patient during hospital rounds.

**User Flow**:

1. Doctor opens "Rounds Mode" from chat interface
2. Enters basic patient context:
   - Age, sex, chief complaint
   - Active diagnoses
   - Current medications
   - Relevant labs (optional)
3. Clinical context is "pinned" for the session
4. Doctor asks multiple questions, all auto-tagged with this context
5. AI responses reference the pinned context
6. Doctor can edit or clear context at any time
7. Context auto-expires after 4 hours for HIPAA compliance

**Data Model** (references ClinicalContext from DATA_MODEL.md):

```typescript
interface RoundsSession {
  id: string;
  clinician_id: string;
  clinical_context_id: string; // Pinned context
  questions_asked: number;
  started_at: string;
  expires_at: string; // Auto-expire after 4 hours
  status: "active" | "expired" | "closed";
}
```

**UI Components**:

- `<RoundsModePanel>` - Sidebar showing pinned context
- `<ClinicalContextForm>` - Form to enter/edit context
- `<RoundsTimer>` - Shows time remaining before auto-expire
- Badge on chat input showing "Rounds Mode Active"

**API Endpoints**:

- `POST /api/rounds` - Create rounds session
- `PATCH /api/rounds/{id}` - Update pinned context
- `DELETE /api/rounds/{id}` - End rounds session
- `GET /api/rounds/{id}` - Get current session

**Privacy Considerations**:

- All rounds sessions use local LLM (PHI assumed)
- Auto-expire after 4 hours
- Context not saved to database permanently
- Audit log entry for each rounds session

---

### Note Draft Export

**Purpose**: Export AI-generated content in structured Assessment & Plan (A/P) format for inclusion in clinical notes.

**User Flow**:

1. After receiving AI response, doctor clicks "Export as Note"
2. System formats response into structured sections:
   - **Assessment**: Summary of condition/diagnosis
   - **Plan**: Treatment recommendations with citations
   - **References**: Linked sources
3. Doctor can edit sections before exporting
4. Export options:
   - Copy to clipboard
   - Download as plain text
   - Send to EHR via integration (future)

**Output Format**:

```
ASSESSMENT:
Acute decompensated heart failure, likely precipitated by dietary indiscretion and medication non-compliance.

PLAN:
1. Admit for IV diuresis
   - Furosemide 40mg IV bolus, then 20mg/hr infusion
   - Monitor urine output, daily weights
   - Target: Net negative 1-2L/day

2. Cardiology consult for optimization of GDMT

3. Consider ACE-I/ARB dose adjustment once euvolemic

4. Patient education on fluid restriction (1.5-2L/day)

REFERENCES:
- 2023 AHA/ACC/HFSA Guideline for the Management of Heart Failure
- Harrison's Principles of Internal Medicine, 21e - Chapter 252
```

**Data Model**:

```typescript
interface NoteDraft {
  id: string;
  session_id: string;
  message_id: string; // Source AI response
  assessment: string;
  plan: string[]; // Array of plan items
  references: Citation[];
  format: "ap" | "soap" | "free_text";
  created_at: string;
  exported_at?: string;
}
```

**UI Components**:

- `<NoteDraftButton>` - Export button on message
- `<NoteDraftEditor>` - Modal with editable sections
- `<ExportOptions>` - Dropdown with export formats
- `<CitationFormatter>` - Format citations by style (AMA, APA, Vancouver)

**API Endpoints**:

- `POST /api/notes/draft` - Generate draft from message
- `PATCH /api/notes/draft/{id}` - Edit draft
- `POST /api/notes/draft/{id}/export` - Export draft (logs export event)

**Privacy Considerations**:

- Drafts stored temporarily (24 hours)
- Export events logged for audit
- PHI must be manually redacted by clinician before export
- Warning shown: "Review carefully and remove all PHI before copying"

---

## WebSocket & Realtime Events

### Event Schema

```typescript
// ============================================================================
// CLIENT → SERVER EVENTS
// ============================================================================

type ClientEvent =
  | SessionStartEvent
  | MessageSendEvent
  | AudioStartEvent
  | AudioChunkEvent
  | AudioStopEvent
  | GenerationStopEvent
  | ContextUpdateEvent;

// Start a new session or resume existing
interface SessionStartEvent {
  type: "session.start";
  sessionId?: string; // Resume if provided
  mode: "quick_consult" | "case_workspace" | "guideline_comparison";
  clinicalContext?: ClinicalContext;
  preferences?: {
    prioritizeSources?: string[];
    citationStyle?: string;
    maxTokens?: number;
  };
}

// Send text message
interface MessageSendEvent {
  type: "message.send";
  sessionId: string;
  content: string;
  attachments?: string[]; // Attachment IDs
  clinicalContextId?: string;
}

// Start audio streaming
interface AudioStartEvent {
  type: "audio.start";
  sessionId: string;
  audioConfig: {
    sampleRate: number; // e.g., 16000
    channels: number; // 1 for mono
    encoding: "pcm" | "opus";
  };
}

// Stream audio chunk
interface AudioChunkEvent {
  type: "audio.chunk";
  sessionId: string;
  data: ArrayBuffer; // Raw audio data
  sequenceNumber?: number; // For ordering
}

// Stop audio streaming
interface AudioStopEvent {
  type: "audio.stop";
  sessionId: string;
}

// Request to stop AI generation mid-stream
interface GenerationStopEvent {
  type: "generation.stop";
  sessionId: string;
  messageId: string;
}

// Update clinical context during conversation
interface ContextUpdateEvent {
  type: "context.update";
  sessionId: string;
  clinicalContext: Partial<ClinicalContext>;
}

// ============================================================================
// SERVER → CLIENT EVENTS
// ============================================================================

type ServerEvent =
  | SessionStartedEvent
  | MessageDeltaEvent
  | MessageCompleteEvent
  | CitationListEvent
  | AudioResponseChunkEvent
  | TranscriptionDeltaEvent
  | ErrorEvent
  | ToolUseEvent
  | StatusEvent;

// Session successfully started
interface SessionStartedEvent {
  type: "session.started";
  sessionId: string;
  mode: string;
  clinicalContext?: ClinicalContext;
}

// Streaming message content (delta)
interface MessageDeltaEvent {
  type: "message.delta";
  sessionId: string;
  messageId: string;
  role: "assistant" | "system";
  contentDelta: string; // Incremental text
  index?: number; // Token index
}

// Message generation complete
interface MessageCompleteEvent {
  type: "message.complete";
  sessionId: string;
  messageId: string;
  content: string; // Full message
  finishReason: "stop" | "length" | "error";
}

// List of citations for a message
interface CitationListEvent {
  type: "citation.list";
  sessionId: string;
  messageId: string;
  citations: Citation[];
}

// Audio response chunk
interface AudioResponseChunkEvent {
  type: "audio.chunk";
  sessionId: string;
  data: ArrayBuffer;
  sequenceNumber?: number;
}

// Real-time transcription of user's speech
interface TranscriptionDeltaEvent {
  type: "transcription.delta";
  sessionId: string;
  text: string;
  isFinal: boolean;
}

// Error occurred
interface ErrorEvent {
  type: "error";
  sessionId?: string;
  code: string;
  message: string;
  fatal?: boolean; // Requires reconnection?
}

// AI is using a tool (file access, calculator, etc.)
interface ToolUseEvent {
  type: "tool.use";
  sessionId: string;
  messageId: string;
  tool: string;
  description: string;
  status: "started" | "completed" | "failed";
  result?: any;
}

// Status updates (connection, processing, etc.)
interface StatusEvent {
  type: "status";
  sessionId?: string;
  status: "connected" | "reconnecting" | "processing" | "idle";
  message?: string;
}
```

### WebSocket Client Hook Example

```typescript
// hooks/useWebSocket.ts
import { useEffect, useRef, useState, useCallback } from "react";
import type { ClientEvent, ServerEvent } from "@/types/websocket";

interface UseWebSocketOptions {
  url: string;
  onMessage?: (event: ServerEvent) => void;
  onError?: (error: Event) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export function useWebSocket(options: UseWebSocketOptions) {
  const { url, onMessage, onError, onConnect, onDisconnect, reconnectAttempts = 5, reconnectDelay = 2000 } = options;

  const ws = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const reconnectCount = useRef(0);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    setConnectionStatus("connecting");
    ws.current = new WebSocket(url);

    ws.current.onopen = () => {
      setIsConnected(true);
      setConnectionStatus("connected");
      reconnectCount.current = 0;
      onConnect?.();
    };

    ws.current.onmessage = (event) => {
      try {
        const data: ServerEvent = JSON.parse(event.data);
        onMessage?.(data);
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    ws.current.onerror = (error) => {
      console.error("WebSocket error:", error);
      onError?.(error);
    };

    ws.current.onclose = () => {
      setIsConnected(false);
      setConnectionStatus("disconnected");
      onDisconnect?.();

      // Attempt reconnection
      if (reconnectCount.current < reconnectAttempts) {
        reconnectCount.current++;
        setTimeout(() => {
          console.log(`Reconnecting... (attempt ${reconnectCount.current})`);
          connect();
        }, reconnectDelay);
      }
    };
  }, [url, onMessage, onError, onConnect, onDisconnect, reconnectAttempts, reconnectDelay]);

  const disconnect = useCallback(() => {
    ws.current?.close();
    ws.current = null;
  }, []);

  const send = useCallback((event: ClientEvent) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(event));
    } else {
      console.warn("WebSocket not connected, cannot send event:", event);
    }
  }, []);

  const sendAudioChunk = useCallback((data: ArrayBuffer) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(data);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    connectionStatus,
    send,
    sendAudioChunk,
    disconnect,
    reconnect: connect,
  };
}
```

---

## Component Architecture

### Chat Component Example

```typescript
// components/Chat.tsx
import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { ChatMessage, Citation, ClinicalContext } from '@/types';

interface ChatProps {
  sessionId?: string;
  clinicalContext?: ClinicalContext;
  mode: 'quick_consult' | 'case_workspace';
}

export function Chat({ sessionId: initialSessionId, clinicalContext, mode }: ChatProps) {
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const currentMessageRef = useRef<ChatMessage | null>(null);

  // WebSocket connection
  const { isConnected, send } = useWebSocket({
    url: `${import.meta.env.VITE_WS_URL}/chat`,
    onMessage: handleServerEvent,
    onConnect: () => {
      // Start or resume session
      send({
        type: 'session.start',
        sessionId,
        mode,
        clinicalContext
      });
    }
  });

  function handleServerEvent(event: ServerEvent) {
    switch (event.type) {
      case 'session.started':
        setSessionId(event.sessionId);
        break;

      case 'message.delta':
        setIsStreaming(true);
        if (!currentMessageRef.current || currentMessageRef.current.id !== event.messageId) {
          // New message
          const newMessage: ChatMessage = {
            id: event.messageId,
            sessionId: event.sessionId,
            role: event.role,
            content: event.contentDelta,
            createdAt: new Date().toISOString(),
            streaming: true
          };
          currentMessageRef.current = newMessage;
          setMessages(prev => [...prev, newMessage]);
        } else {
          // Update existing message
          setMessages(prev => prev.map(msg =>
            msg.id === event.messageId
              ? { ...msg, content: msg.content + event.contentDelta }
              : msg
          ));
        }
        break;

      case 'message.complete':
        setIsStreaming(false);
        setMessages(prev => prev.map(msg =>
          msg.id === event.messageId
            ? { ...msg, streaming: false, content: event.content }
            : msg
        ));
        currentMessageRef.current = null;
        break;

      case 'citation.list':
        setMessages(prev => prev.map(msg =>
          msg.id === event.messageId
            ? { ...msg, citations: event.citations }
            : msg
        ));
        break;

      case 'error':
        console.error('Chat error:', event.message);
        setIsStreaming(false);
        // Show error message in UI
        break;
    }
  }

  function handleSendMessage() {
    if (!inputValue.trim() || !sessionId) return;

    // Add user message to UI
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId,
      role: 'user',
      content: inputValue,
      createdAt: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);

    // Send to server
    send({
      type: 'message.send',
      sessionId,
      content: inputValue,
      clinicalContextId: clinicalContext?.id
    });

    setInputValue('');
  }

  return (
    <div className="flex flex-col h-full">
      {/* Connection status */}
      {!isConnected && (
        <div className="bg-yellow-100 border-b border-yellow-200 p-2 text-sm">
          ⚠️ Reconnecting...
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(message => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {isStreaming && <LoadingIndicator />}
      </div>

      {/* Input area */}
      <div className="border-t p-4">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Type your question..."
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2"
            disabled={isStreaming || !isConnected}
          />
          <button
            onClick={handleSendMessage}
            disabled={isStreaming || !isConnected || !inputValue.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-2xl px-4 py-2 rounded-lg ${
        message.role === 'user'
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 text-gray-900'
      }`}>
        <div className="prose prose-sm">
          {message.content}
        </div>

        {message.citations && message.citations.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-300">
            <div className="text-xs font-semibold mb-2">Sources:</div>
            {message.citations.map((citation, i) => (
              <CitationCard key={citation.id} citation={citation} index={i + 1} />
            ))}
          </div>
        )}

        {message.streaming && <span className="animate-pulse">▊</span>}
      </div>
    </div>
  );
}

function CitationCard({ citation, index }: { citation: Citation; index: number }) {
  return (
    <div className="text-xs mb-2 p-2 bg-white rounded border">
      <div className="font-medium">[{index}] {citation.title}</div>
      {citation.source && <div className="text-gray-600">{citation.source}</div>}
      {citation.page && <div className="text-gray-600">p. {citation.page}</div>}
      {citation.doi && (
        <a href={`https://doi.org/${citation.doi}`} className="text-blue-600 hover:underline" target="_blank">
          DOI: {citation.doi}
        </a>
      )}
    </div>
  );
}

function LoadingIndicator() {
  return (
    <div className="flex items-center gap-2 text-gray-500">
      <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-gray-600 rounded-full"></div>
      <span>Thinking...</span>
    </div>
  );
}
```

### Tool Integration Components

The web app integrates with the OpenAI Realtime API tools system (see [TOOLS_AND_INTEGRATIONS.md](TOOLS_AND_INTEGRATIONS.md)) to provide tool confirmation UI and activity indicators.

#### useToolConfirmation Hook

```typescript
// hooks/useToolConfirmation.ts
import { useState, useCallback } from "react";
import type { ToolCall } from "@/types";

interface ToolConfirmationState {
  isOpen: boolean;
  toolCall: ToolCall | null;
  onConfirm: (() => void) | null;
  onCancel: (() => void) | null;
}

export function useToolConfirmation() {
  const [state, setState] = useState<ToolConfirmationState>({
    isOpen: false,
    toolCall: null,
    onConfirm: null,
    onCancel: null,
  });

  const requestConfirmation = useCallback((toolCall: ToolCall): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        toolCall,
        onConfirm: () => {
          setState({
            isOpen: false,
            toolCall: null,
            onConfirm: null,
            onCancel: null,
          });
          resolve(true);
        },
        onCancel: () => {
          setState({
            isOpen: false,
            toolCall: null,
            onConfirm: null,
            onCancel: null,
          });
          resolve(false);
        },
      });
    });
  }, []);

  return {
    ...state,
    requestConfirmation,
  };
}
```

#### ToolConfirmationDialog Component

```typescript
// components/ToolConfirmationDialog.tsx
import { Dialog } from '@/components/ui/dialog';
import type { ToolCall } from '@/types';

interface ToolConfirmationDialogProps {
  isOpen: boolean;
  toolCall: ToolCall | null;
  onConfirm: (() => void) | null;
  onCancel: (() => void) | null;
}

export function ToolConfirmationDialog({
  isOpen,
  toolCall,
  onConfirm,
  onCancel,
}: ToolConfirmationDialogProps) {
  if (!toolCall) return null;

  return (
    <Dialog open={isOpen} onClose={() => onCancel?.()}>
      <div className="p-6 max-w-md">
        <h3 className="text-lg font-semibold mb-4">
          Confirm Tool Use
        </h3>

        <div className="mb-4">
          <div className="text-sm font-medium mb-2">Tool:</div>
          <div className="p-3 bg-gray-100 rounded-lg font-mono text-sm">
            {toolCall.tool_name}
          </div>
        </div>

        <div className="mb-6">
          <div className="text-sm font-medium mb-2">Arguments:</div>
          <pre className="p-3 bg-gray-100 rounded-lg text-xs overflow-x-auto">
            {JSON.stringify(toolCall.arguments, null, 2)}
          </pre>
        </div>

        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={() => onCancel?.()}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm?.()}
            className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Confirm
          </button>
        </div>
      </div>
    </Dialog>
  );
}
```

#### ToolActivityIndicator Component

```typescript
// components/ToolActivityIndicator.tsx
import { Loader2 } from 'lucide-react';
import type { ToolCall } from '@/types';

interface ToolActivityIndicatorProps {
  activeTool: ToolCall | null;
}

export function ToolActivityIndicator({ activeTool }: ToolActivityIndicatorProps) {
  if (!activeTool) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
      <span className="text-blue-900">
        Using tool: <span className="font-mono font-semibold">{activeTool.tool_name}</span>
      </span>
    </div>
  );
}
```

#### Integration with Chat Component

```typescript
// components/Chat.tsx (with tool integration)
import { useToolConfirmation } from '@/hooks/useToolConfirmation';
import { ToolConfirmationDialog } from '@/components/ToolConfirmationDialog';
import { ToolActivityIndicator } from '@/components/ToolActivityIndicator';

export function Chat({ sessionId, clinicalContext, mode }: ChatProps) {
  // ... existing state ...
  const [activeTool, setActiveTool] = useState<ToolCall | null>(null);

  // Tool confirmation hook
  const toolConfirmation = useToolConfirmation();

  // WebSocket connection
  const { isConnected, send } = useWebSocket({
    url: `${import.meta.env.VITE_WS_URL}/chat`,
    onMessage: handleServerEvent,
  });

  function handleServerEvent(event: ServerEvent) {
    switch (event.type) {
      // ... existing cases ...

      case 'tool.use':
        if (event.status === 'started') {
          setActiveTool({
            id: crypto.randomUUID(),
            session_id: event.sessionId,
            tool_name: event.tool,
            arguments: {},
            created_at: new Date().toISOString(),
            call_id: event.messageId,
            status: 'pending',
            trace_id: '',
            user_id: '',
            phi_detected: false,
          });
        } else if (event.status === 'completed' || event.status === 'failed') {
          setActiveTool(null);
        }
        break;

      case 'tool.confirmation_required':
        // Request user confirmation
        toolConfirmation.requestConfirmation(event.toolCall).then((confirmed) => {
          send({
            type: 'tool.confirmation_response',
            sessionId: event.sessionId,
            call_id: event.toolCall.call_id,
            confirmed,
          });
        });
        break;
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* ... existing UI ... */}

      {/* Tool activity indicator */}
      {activeTool && (
        <div className="px-4 py-2 border-b">
          <ToolActivityIndicator activeTool={activeTool} />
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(message => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>

      {/* Tool confirmation dialog */}
      <ToolConfirmationDialog {...toolConfirmation} />

      {/* ... existing input area ... */}
    </div>
  );
}
```

**Key Features:**

- **User Confirmation Flow**: High-risk tools (e.g., `create_calendar_event`) require explicit user approval before execution
- **Activity Indicators**: Shows which tool is currently running with visual feedback
- **WebSocket Integration**: Tool events received via WebSocket, confirmation responses sent back
- **Type-Safe**: Full TypeScript support with `ToolCall` type from DATA_MODEL.md
- **PHI-Aware**: Tool calls are logged and audited per HIPAA requirements

**Related Documentation:**

- [TOOLS_AND_INTEGRATIONS.md](TOOLS_AND_INTEGRATIONS.md) - Complete tools layer specification
- [ORCHESTRATION_DESIGN.md](ORCHESTRATION_DESIGN.md) - Backend tool execution flow
- [DATA_MODEL.md](DATA_MODEL.md) - ToolCall and ToolResult entities

---

## Technology Stack

### Frontend

- **Framework**: React 18+ with TypeScript 5+
- **Build Tool**: Vite 5+
- **Styling**: Tailwind CSS 3+
- **Component Library**: shadcn/ui (Radix UI primitives)
- **State Management**: Zustand or Jotai
- **WebSocket**: Native WebSocket API with custom hooks
- **Audio**: Web Audio API + MediaRecorder API
- **Markdown**: react-markdown with remark-gfm
- **Code Highlighting**: Prism.js or Shiki
- **Forms**: React Hook Form + Zod validation
- **Routing**: React Router v6

### Backend Integration

- **API Client**: Fetch API with custom wrapper
- **Authentication**: JWT in httpOnly cookies
- **Session Management**: Redis-backed sessions
- **File Upload**: Multi-part form data with progress tracking

### Standard API Envelope

All API calls return a standard envelope for consistent error handling. See [services/api-gateway/README.md](../services/api-gateway/README.md#standard-api-response-envelope) for complete specification.

#### TypeScript Types

```typescript
// app/types/api.ts

export interface APIError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface APIEnvelope<T = any> {
  success: boolean;
  data: T | null;
  error: APIError | null;
  trace_id: string;
  timestamp: string;
}

// Specific error codes from backend
export type ErrorCode =
  | "AUTH_FAILED"
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "PHI_DETECTED"
  | "PHI_REDACTED"
  | "KB_TIMEOUT"
  | "TOOL_ERROR"
  | "LLM_ERROR"
  | "INTERNAL_ERROR"
  | "NOT_FOUND"
  | "CONFLICT";
```

#### Fetch Helper

```typescript
// app/lib/api.ts

export class APIError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, any>,
    public traceId?: string,
  ) {
    super(message);
    this.name = "APIError";
  }
}

export async function fetchAPI<T>(url: string, options?: RequestInit): Promise<T> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    const envelope: APIEnvelope<T> = await response.json();

    if (!envelope.success || envelope.error) {
      console.error("API error:", {
        code: envelope.error?.code,
        message: envelope.error?.message,
        trace_id: envelope.trace_id,
      });

      throw new APIError(
        envelope.error?.code || "UNKNOWN_ERROR",
        envelope.error?.message || "An unknown error occurred",
        envelope.error?.details,
        envelope.trace_id,
      );
    }

    return envelope.data as T;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }

    // Network error or invalid JSON
    throw new APIError("NETWORK_ERROR", "Failed to connect to server", {
      originalError: String(error),
    });
  }
}
```

#### Usage Example - Chat API

```typescript
// app/hooks/useChat.ts

import { useMutation } from "@tanstack/react-query";
import { fetchAPI, APIError } from "@/lib/api";
import { ChatRequest, ChatResponse } from "@/types"; // From DATA_MODEL.md
import { toast } from "@/lib/toast";

export function useSendMessage() {
  return useMutation({
    mutationFn: async (request: ChatRequest) => {
      return fetchAPI<ChatResponse>("/api/chat/message", {
        method: "POST",
        body: JSON.stringify(request),
      });
    },
    onError: (error: APIError) => {
      // Handle specific error codes
      switch (error.code) {
        case "PHI_DETECTED":
          // Show info toast: "Query contains PHI, using secure local model"
          toast.info("Using secure processing for sensitive data");
          break;
        case "KB_TIMEOUT":
          toast.error("Search took too long, please try again");
          break;
        case "RATE_LIMITED":
          toast.error("Too many requests, please wait a moment");
          break;
        default:
          toast.error(error.message);
      }

      // Log to monitoring with trace_id
      console.error("Chat error:", {
        code: error.code,
        trace_id: error.traceId,
      });
    },
  });
}
```

#### Usage Example - Error Boundary

```typescript
// app/components/ErrorBoundary.tsx

import { APIError } from '@/lib/api';

export function ErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  const apiError = error instanceof APIError ? error : null;

  return (
    <div className="error-container">
      <h2>Something went wrong</h2>
      <p>{apiError?.message || 'An unexpected error occurred'}</p>

      {apiError?.traceId && (
        <p className="text-sm text-muted">
          Error ID: <code>{apiError.traceId}</code>
        </p>
      )}

      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

### API Integration Examples

**REST API Client with React Query:**

```typescript
// services/api/chat.ts
import { useMutation, useQuery } from '@tanstack/react-query';

export interface ChatRequest {
  sessionId: string;
  content: string;
  clinicalContext?: ClinicalContext;
  attachments?: string[];
}

export interface ChatResponse {
  messageId: string;
  content: string;
  citations: Citation[];
  createdAt: string;
}

// Hook for sending chat messages
export function useChatMessage() {
  return useMutation({
    mutationFn: async (request: ChatRequest): Promise<ChatResponse> => {
      const response = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        credentials: 'include', // Send JWT cookies
      });

      if (!response.ok) {
        throw new Error(`Chat failed: ${response.statusText}`);
      }

      return response.json();
    },
    onError: (error) => {
      console.error('Chat message error:', error);
    },
  });
}

// Hook for fetching conversation history
export function useConversations(skip = 0, limit = 50) {
  return useQuery({
    queryKey: ['conversations', skip, limit],
    queryFn: async () => {
      const response = await fetch(
        `/api/chat/conversations?skip=${skip}&limit=${limit}`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch conversations');
      }

      return response.json() as Promise<ConversationResponse[]>;
    },
  });
}

// Usage in component
function ChatInterface() {
  const { mutate: sendMessage, isPending } = useChatMessage();
  const { data: conversations } = useConversations();

  const handleSendMessage = (userInput: string, sessionId: string) => {
    sendMessage(
      {
        sessionId,
        content: userInput,
        clinicalContext: currentCase, // Optional patient context
      },
      {
        onSuccess: (response) => {
          console.log('Message sent:', response.messageId);
          // Update UI with response
        },
      }
    );
  };

  return <div>{/* Chat UI */}</div>;
}
```

**Medical Search API Integration:**

```typescript
// services/api/medical.ts
import { useQuery } from '@tanstack/react-query';

export interface MedicalSearchRequest {
  query: string;
  filters?: {
    specialty?: string[];
    sourceType?: string[];
    dateFrom?: string;
    dateTo?: string;
  };
  limit?: number;
  includeExcerpts?: boolean;
}

export interface MedicalSearchResult {
  id: string;
  title: string;
  sourceType: string;
  excerpt?: string;
  score: float;
  metadata: Record<string, any>;
}

export interface MedicalSearchResponse {
  query: string;
  results: MedicalSearchResult[];
  totalResults: number;
}

export function useMedicalSearch(request: MedicalSearchRequest) {
  return useQuery({
    queryKey: ['medical-search', request],
    queryFn: async (): Promise<MedicalSearchResponse> => {
      const response = await fetch('/api/medical/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Medical search failed');
      }

      return response.json();
    },
    enabled: !!request.query, // Only run if query is provided
    staleTime: 5 * 60 * 1000, // Cache results for 5 minutes
  });
}

// Usage in component
function MedicalSearchPanel() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<MedicalSearchRequest['filters']>({});

  const { data, isLoading, error } = useMedicalSearch({
    query,
    filters,
    limit: 20,
    includeExcerpts: true,
  });

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search medical knowledge..."
      />
      {isLoading && <p>Searching...</p>}
      {error && <p>Error: {error.message}</p>}
      {data && (
        <ul>
          {data.results.map((result) => (
            <li key={result.id}>
              <h3>{result.title}</h3>
              <p>{result.excerpt}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

**File Upload with Progress:**

```typescript
// services/api/files.ts
export async function uploadDocument(
  file: File,
  sourceType: string,
  specialty: string,
  onProgress?: (progress: number) => void
): Promise<{ documentId: string; status: string; message: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('sourceType', sourceType);
  formData.append('specialty', specialty);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        const progress = (event.loaded / event.total) * 100;
        onProgress(progress);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Upload failed: ${xhr.statusText}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed'));
    });

    xhr.open('POST', '/api/admin/knowledge/upload');
    xhr.withCredentials = true; // Send cookies
    xhr.send(formData);
  });
}

// Usage in component
function DocumentUploader() {
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setProgress(0);

    try {
      const result = await uploadDocument(
        file,
        'textbook',
        'cardiology',
        setProgress
      );
      console.log('Upload complete:', result.documentId);
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept=".pdf,.docx"
        onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
        disabled={uploading}
      />
      {uploading && (
        <div>
          <progress value={progress} max={100} />
          <span>{progress.toFixed(0)}%</span>
        </div>
      )}
    </div>
  );
}
```

### Development Tools

- **Type Checking**: TypeScript strict mode
- **Linting**: ESLint with React/TypeScript rules
- **Formatting**: Prettier
- **Testing**: Vitest + React Testing Library
- **E2E Testing**: Playwright
- **Bundle Analysis**: vite-bundle-visualizer

---

## User Interface Design

[Previous content on layout, pages, core features continues...]

## Security & Compliance

### PHI Handling

- All patient data treated as PHI
- Automatic redaction in logs and analytics
- Clear warning banner on all clinical advice
- Audit logging of all access to clinical context
- Session timeout after 30 minutes idle

### HIPAA Compliance

- Encrypted data transmission (TLS 1.3)
- Encrypted data at rest
- Access controls (RBAC)
- Audit trails
- Business Associate Agreement with OpenAI, UpToDate

### Content Security

- Content Security Policy headers
- XSS prevention (sanitize user input)
- CSRF protection
- Rate limiting
- Input validation on all forms

---

## Testing Strategy

### Unit Tests (Vitest + React Testing Library)

```typescript
// __tests__/Chat.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Chat } from '@/components/Chat';
import { vi } from 'vitest';

// Mock WebSocket
global.WebSocket = vi.fn(() => ({
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));

describe('Chat Component', () => {
  it('renders input and send button', () => {
    render(<Chat mode="quick_consult" />);
    expect(screen.getByPlaceholderText('Type your question...')).toBeInTheDocument();
    expect(screen.getByText('Send')).toBeInTheDocument();
  });

  it('sends message on Enter key', async () => {
    render(<Chat mode="quick_consult" />);
    const input = screen.getByPlaceholderText('Type your question...');

    fireEvent.change(input, { target: { value: 'Test question' } });
    fireEvent.keyPress(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('Test question')).toBeInTheDocument();
    });
  });

  it('displays citations when provided', async () => {
    // Test citation rendering
  });
});
```

### Integration Tests

- WebSocket connection and reconnection
- Message streaming
- File upload flow
- Authentication flow

### E2E Tests (Playwright)

```typescript
// e2e/quick-consult.spec.ts
import { test, expect } from "@playwright/test";

test("quick consult workflow", async ({ page }) => {
  await page.goto("/");

  // Type a question
  await page.fill('input[placeholder="Type your question..."]', "NSTEMI management");
  await page.click('button:has-text("Send")');

  // Wait for AI response
  await expect(page.locator("text=For NSTEMI")).toBeVisible({ timeout: 10000 });

  // Verify citations appear
  await expect(page.locator("text=Sources:")).toBeVisible();
  await expect(page.locator('[data-testid="citation"]')).toHaveCount(3, {
    timeout: 5000,
  });
});
```

---

## Performance Optimization

### Code Splitting

```typescript
// Lazy load routes
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Library = lazy(() => import('./pages/Library'));
const Settings = lazy(() => import('./pages/Settings'));

function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/library" element={<Library />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Suspense>
  );
}
```

### Virtualization for Long Conversations

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

function MessageList({ messages }: { messages: ChatMessage[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5
  });

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map(virtualItem => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`
            }}
          >
            <MessageBubble message={messages[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Debouncing & Throttling

```typescript
import { useDebouncedCallback } from 'use-debounce';

function SearchInput() {
  const debouncedSearch = useDebouncedCallback(
    (value: string) => {
      // Perform search
      performSearch(value);
    },
    500 // 500ms debounce
  );

  return (
    <input
      type="text"
      onChange={(e) => debouncedSearch(e.target.value)}
      placeholder="Search..."
    />
  );
}
```

---

## User Settings & Preferences

### Settings Architecture

**Storage:** Per-user settings stored in PostgreSQL `user_settings` table, cached in Redis for performance.

**Scope:**

- **Per-User**: Each clinician has their own preferences
- **Synced**: Settings sync across devices via backend
- **Versioned**: Settings changes are tracked for audit purposes

### Settings Interface

Complete TypeScript interface for user settings:

```typescript
// src/types/settings.ts
export interface UserSettings {
  // General Preferences
  general: {
    language: "en" | "es" | "fr"; // Interface language
    timezone: string; // IANA timezone (e.g., 'America/New_York')
    theme: "light" | "dark" | "auto";
    dateFormat: "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
    timeFormat: "12h" | "24h";
  };

  // Voice Settings
  voice: {
    enabled: boolean; // Enable voice input
    inputDevice: string | "default"; // Microphone device ID
    voiceActivation: "push-to-talk" | "voice-activated";
    silenceThreshold: number; // 0-100, sensitivity for VAD

    // Text-to-Speech
    ttsEnabled: boolean;
    ttsVoice: string; // Voice ID from TTS provider
    ttsSpeed: number; // 0.5-2.0
    ttsPitch: number; // 0.5-2.0
    autoPlayResponses: boolean; // Auto-play audio responses
  };

  // Citation Preferences
  citations: {
    displayStyle: "inline" | "sidebar" | "footnotes";
    autoExpand: boolean; // Auto-expand citation details
    showExcerpts: boolean; // Show text excerpts
    prioritizeSources: string[]; // Preferred source types
    citationFormat: "AMA" | "APA" | "Vancouver";
    showRecommendationClasses: boolean; // Show ACC/AHA classes
    showEvidenceLevels: boolean; // Show evidence levels
  };

  // Display Settings
  display: {
    fontSize: "small" | "medium" | "large" | "x-large";
    fontFamily: "system" | "serif" | "sans-serif";
    lineSpacing: "compact" | "normal" | "relaxed";
    codeHighlighting: boolean;
    showTimestamps: boolean;
    compactMode: boolean; // Reduce spacing for more info on screen
    animationsEnabled: boolean;
  };

  // Clinical Context
  clinicalContext: {
    defaultMode: "quick_consult" | "case_workspace" | "guideline_comparison";
    autoSaveContext: boolean;
    rememberRecentCases: number; // Number of recent cases to remember (0-20)
    defaultSpecialty: string; // User's primary specialty
    favoriteTopics: string[]; // Frequently accessed topics
  };

  // Privacy & Safety
  privacy: {
    logConversations: boolean; // Log conversations for review
    retentionPeriod: number; // Days to keep conversations (7-365)
    allowAnalytics: boolean; // Anonymous usage analytics
    phiWarnings: boolean; // Warn when PHI detected
    requireConfirmation: boolean; // Confirm before sending sensitive data
    redactPHI: boolean; // Auto-redact PHI from logs
  };

  // Notifications
  notifications: {
    enabled: boolean;
    knowledgeBaseUpdates: boolean; // Notify on new documents indexed
    systemAlerts: boolean; // Service outages, maintenance
    desktop: boolean; // Desktop notifications (if supported)
    sound: boolean; // Notification sounds
  };

  // Keyboard Shortcuts
  shortcuts: {
    enabled: boolean;
    customShortcuts: Record<string, string>; // Action -> key combo mapping
  };

  // Advanced
  advanced: {
    developerMode: boolean; // Show debug info
    betaFeatures: boolean; // Opt into beta features
    modelPreference: "auto" | "fast" | "quality"; // Model routing preference
    maxTokens: number; // Max response length (512-4096)
    temperature: number; // LLM temperature (0.0-1.0)
    streamingEnabled: boolean; // Stream responses token-by-token
  };
}

// Default settings
export const DEFAULT_USER_SETTINGS: UserSettings = {
  general: {
    language: "en",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    theme: "auto",
    dateFormat: "MM/DD/YYYY",
    timeFormat: "12h",
  },
  voice: {
    enabled: true,
    inputDevice: "default",
    voiceActivation: "push-to-talk",
    silenceThreshold: 50,
    ttsEnabled: false,
    ttsVoice: "default",
    ttsSpeed: 1.0,
    ttsPitch: 1.0,
    autoPlayResponses: false,
  },
  citations: {
    displayStyle: "inline",
    autoExpand: false,
    showExcerpts: true,
    prioritizeSources: ["guideline", "textbook", "journal"],
    citationFormat: "AMA",
    showRecommendationClasses: true,
    showEvidenceLevels: true,
  },
  display: {
    fontSize: "medium",
    fontFamily: "system",
    lineSpacing: "normal",
    codeHighlighting: true,
    showTimestamps: true,
    compactMode: false,
    animationsEnabled: true,
  },
  clinicalContext: {
    defaultMode: "quick_consult",
    autoSaveContext: true,
    rememberRecentCases: 10,
    defaultSpecialty: "general",
    favoriteTopics: [],
  },
  privacy: {
    logConversations: true,
    retentionPeriod: 30,
    allowAnalytics: true,
    phiWarnings: true,
    requireConfirmation: false,
    redactPHI: true,
  },
  notifications: {
    enabled: true,
    knowledgeBaseUpdates: true,
    systemAlerts: true,
    desktop: false,
    sound: true,
  },
  shortcuts: {
    enabled: true,
    customShortcuts: {
      new_conversation: "Cmd+N",
      search: "Cmd+K",
      focus_input: "Cmd+/",
      send_message: "Cmd+Enter",
      voice_toggle: "Cmd+Shift+V",
    },
  },
  advanced: {
    developerMode: false,
    betaFeatures: false,
    modelPreference: "auto",
    maxTokens: 2048,
    temperature: 0.7,
    streamingEnabled: true,
  },
};
```

### Settings UI Component

**Settings Page Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│ Settings                                          [✕ Close]  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌─────────────────────────────────────┐ │
│  │ Sidebar      │  │ Content Area                         │ │
│  │              │  │                                       │ │
│  │ ▶ General    │  │  General Preferences                 │ │
│  │ ○ Voice      │  │                                       │ │
│  │ ○ Citations  │  │  Language:  [English ▼]             │ │
│  │ ○ Display    │  │  Timezone:  [America/New_York ▼]    │ │
│  │ ○ Context    │  │  Theme:     [● Auto ○ Light ○ Dark] │ │
│  │ ○ Privacy    │  │  Date Format: [MM/DD/YYYY ▼]        │ │
│  │ ○ Notify     │  │  Time Format: [● 12h ○ 24h]         │ │
│  │ ○ Shortcuts  │  │                                       │ │
│  │ ○ Advanced   │  │  [Save Changes]  [Reset to Defaults]│ │
│  │              │  │                                       │ │
│  └──────────────┘  └─────────────────────────────────────┘ │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Implementation Example:**

```typescript
// src/pages/Settings.tsx
import { useState, useEffect } from 'react';
import { useSettings } from '../hooks/useSettings';
import type { UserSettings } from '../types/settings';

export function SettingsPage() {
  const { settings, loading, updateSettings } = useSettings();
  const [activeTab, setActiveTab] = useState<keyof UserSettings>('general');
  const [modified, setModified] = useState(false);

  if (loading || !settings) {
    return <LoadingSpinner />;
  }

  const handleSave = async () => {
    await updateSettings(settings);
    setModified(false);
  };

  return (
    <div className="settings-page">
      <div className="settings-sidebar">
        <SettingsTabs active={activeTab} onChange={setActiveTab} />
      </div>

      <div className="settings-content">
        {activeTab === 'general' && (
          <GeneralSettings
            settings={settings.general}
            onChange={(general) => {
              setSettings({ ...settings, general });
              setModified(true);
            }}
          />
        )}

        {activeTab === 'voice' && (
          <VoiceSettings
            settings={settings.voice}
            onChange={(voice) => {
              setSettings({ ...settings, voice });
              setModified(true);
            }}
          />
        )}

        {/* ... other tabs ... */}

        <div className="settings-actions">
          <button onClick={handleSave} disabled={!modified}>
            Save Changes
          </button>
          <button onClick={() => setSettings(DEFAULT_USER_SETTINGS)}>
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Settings Persistence

**Backend API:**

```python
# app/api/endpoints/settings.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.api.schemas.settings import UserSettingsSchema

router = APIRouter()

@router.get("/settings", response_model=UserSettingsSchema)
async def get_user_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get user settings. Returns default settings if none exist.
    """
    if current_user.settings:
        return current_user.settings
    else:
        # Return defaults
        return UserSettingsSchema.get_defaults()

@router.patch("/settings", response_model=UserSettingsSchema)
async def update_user_settings(
    settings: UserSettingsSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update user settings. Validates and merges with existing settings.
    """
    # Merge with existing settings
    if current_user.settings:
        current_settings = current_user.settings
        # Deep merge settings
        for key, value in settings.dict(exclude_unset=True).items():
            if isinstance(value, dict):
                current_settings[key].update(value)
            else:
                current_settings[key] = value
    else:
        current_settings = settings.dict()

    current_user.settings = current_settings
    db.commit()
    db.refresh(current_user)

    return current_user.settings
```

**Frontend Hook:**

```typescript
// src/hooks/useSettings.ts
import { useState, useEffect } from "react";
import { adminApi } from "../services/api";
import type { UserSettings } from "../types/settings";
import { DEFAULT_USER_SETTINGS } from "../types/settings";

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const data = await adminApi.getSettings();
        setSettings(data);
      } catch (err) {
        console.error("Failed to load settings:", err);
        setError(err as Error);
        // Fall back to defaults
        setSettings(DEFAULT_USER_SETTINGS);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const updateSettings = async (newSettings: Partial<UserSettings>) => {
    try {
      const updated = await adminApi.updateSettings(newSettings);
      setSettings(updated);
      return updated;
    } catch (err) {
      console.error("Failed to save settings:", err);
      throw err;
    }
  };

  return {
    settings,
    loading,
    error,
    updateSettings,
    setSettings,
  };
}
```

### Settings Synchronization

Settings are:

1. **Loaded on login** from backend
2. **Cached in localStorage** for offline access
3. **Synced on change** to backend (with debouncing)
4. **Applied immediately** to UI without page reload

---

## Deployment

### Environment Variables

```bash
# .env.production
VITE_API_URL=https://voiceassist.yourdomain.com/api
VITE_WS_URL=wss://voiceassist.yourdomain.com/ws
VITE_ENV=production
VITE_SENTRY_DSN=<sentry-dsn>
```

### Build Process

```bash
# Install dependencies
npm install

# Type check
npm run type-check

# Lint
npm run lint

# Test
npm run test

# Build
npm run build

# Preview production build locally
npm run preview
```

### Docker Container

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

---

## Future Enhancements

### Progressive Web App (PWA)

- Service worker for offline support
- App manifest for "Add to Home Screen"
- Background sync for queued messages
- Push notifications for knowledge base updates

### Advanced Features

- Multi-language support (i18n)
- Collaborative conversations (multiple clinicians)
- Screen sharing for telemedicine consultations
- Direct EMR integration (HL7 FHIR)
- Voice cloning for personalized TTS
- Custom medical calculators integration

### AI Enhancements

- Specialty-specific knowledge routing
- Learning user preferences and style
- Proactive information retrieval based on context
- Differential diagnosis assistance
- Clinical decision support alerts

---

**End of Web Application Specifications**

For wireframes and additional UX details, see: [WEB_APP_WIREFRAMES.md](./WEB_APP_WIREFRAMES.md)
For backend API contracts, see: [../services/api-gateway/README.md](../services/api-gateway/README.md)
For admin panel specs, see: [ADMIN_PANEL_SPECS.md](./ADMIN_PANEL_SPECS.md)
