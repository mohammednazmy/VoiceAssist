---
title: Enhanced KB Editing & PHI Controls
slug: admin/enhanced-kb-phi-controls
summary: >-
  Guide for admins on enhanced knowledge base editing, PHI risk indicators,
  PHI-conscious RAG testing, and maintenance tooling for phi_risk payloads.
ai_summary: >-
  Explains how admins can use the enhanced knowledge base tools: page images,
  block-level editors, processing progress indicators, PHI risk badges and
  filters, the PHI-conscious RAG test panel, and the update_phi_risk_payloads
  maintenance script for Qdrant. Intended for safe, PHI-aware KB operations.
status: stable
owner: backend
lastUpdated: "2025-12-12"
audience:
  - admin
  - backend
  - ai-agents
category: admin
tags:
  - knowledge-base
  - phi
  - admin
  - rag
component: "frontend/admin-panel"
relatedPaths:
  - "apps/admin-panel/src/components/knowledge/DocumentTable.tsx"
  - "apps/admin-panel/src/components/knowledge/DocumentPreviewDrawer.tsx"
  - "apps/admin-panel/src/pages/KnowledgeBasePage.tsx"
  - "services/api-gateway/app/api/admin_kb.py"
  - "services/api-gateway/app/services/kb_indexer.py"
  - "services/api-gateway/tools/update_phi_risk_payloads.py"
  - "services/api-gateway/app/api/admin_voice.py"
  - "services/api-gateway/app/services/session_analytics_service.py"
---

# Enhanced KB Editing & PHI Controls

This guide explains how administrators can:

- Review and edit **enhanced knowledge base content**.
- Interpret **processing progress** and enhanced-content indicators.
- Monitor and filter by **PHI risk** in the KB.
- Use the **PHI-conscious RAG test panel** in the admin panel.
- Safely run the `update_phi_risk_payloads.py` maintenance script in staging and production.

> **Scope**
>
> - Admin panel: `apps/admin-panel`
> - Backend KB APIs: `services/api-gateway/app/api/admin_kb.py`
> - Indexer: `services/api-gateway/app/services/kb_indexer.py`

---

## 1. Enhanced KB Editing Experience

Enhanced KB processing is currently available for admin-managed PDF documents (e.g., textbooks, guidelines).

### 1.1 Document Table Indicators

In the **Knowledge Base → Documents** view (`DocumentTable`):

- **Structure badges**:
  - `TOC` – document has a table of contents.
  - `Figures` – document has detected figures.
  - `Enhanced` – document has enhanced structure (GPT-4o Vision analysis, voice narrations, page images).
    - Tooltip shows current processing stage or a simple “Enhanced content available”.
- **Processing state text** under the “Structure” column:
  - `Extracting…`, `Analyzing…`, `Indexing…` with optional `NN%` progress.
  - `Enhanced complete` when processing finishes.
  - `Enhanced failed` if the enhanced pipeline encountered an error (e.g., storage issues, Qdrant).

These indicators are driven by `processing_stage`, `processing_progress`, and `has_enhanced_structure` from `/api/admin/kb/documents`.

### 1.2 Document Preview Drawer

Click **Preview** on a document to open the **Document Preview Drawer**:

- Header includes:
  - The document name.
  - A one-line **Enhanced processing** status:
    - `Enhanced processing: Extracting… 30%`
    - `Enhanced processing complete`
    - `Enhanced processing failed – you can retry.`
- Primary actions:
  - **Edit Content** – visible when enhanced content exists.
  - **Process with AI / Retry processing** – when enhanced content is not yet available or failed.

If enhanced processing fails, admins can click **Retry processing**; the backend (`process-enhanced`) will:

- Re-fetch the original PDF from storage.
- Re-run the enhanced pipeline (pdfplumber + GPT-4o Vision).
- Re-index enhanced chunks in Qdrant.

### 1.3 Enhanced Content Editor

When **Edit Content** is clicked, the **Document Content Editor** opens:

- **Page image viewer**:
  - Displays rendered page images (200 DPI JPEG).
  - Zoom/pan controls for precise visual inspection of extraction quality.
- **Content block editor**:
  - Block-level editing of:
    - Headings and text blocks.
    - Tables (spreadsheet-like editing).
    - Figures (captions and descriptions).
  - All edits are persisted back to `Document.enhanced_structure` via `PUT /api/admin/kb/documents/{id}/page/{page}/content`.
- **Voice narration editor**:
  - Editable voice narration per page.
  - Designed to be voice-optimized summaries (short, clear explanations).

Edits are kept within the KB and reused by RAG and voice navigation; they do **not** change the original PDF file.

---

## 2. PHI Risk Indicators & Filters

PHI detection is applied during document processing and enhanced voice narration analysis. Results are stored in `Document.doc_metadata` as:

- `phi_detected`: boolean.
- `phi_types`: list of detected PHI categories.
- `phi_risk`: `"none" | "low" | "medium" | "high"`.

### 2.1 PHI Risk Badges in the Document Table

`DocumentTable` surfaces PHI risk via a **badge** in the “Visibility” column:

- `PHI: High` (red).
- `PHI: Medium` (amber).
- `PHI: Low` (green).
- No badge for `phi_risk === "none"` or missing.

These badges are for internal hygiene and review workflows; they do not expose any raw PHI.

### 2.2 PHI Risk Filters

In the document filter bar:

- **PHI Risk filter**:
  - `All` – no filtering.
  - `Any PHI` – any document with `phiRisk` not `"none"`.
  - `High only` – documents with `phiRisk === "high"`.

Typical uses:

- **Audit review**: filter to `Any PHI` or `High only` to review PHI-heavy KB documents.
- **Quality checks**: ensure that high-risk content is appropriately limited, masked, or documented.

---

## 3. PHI-Conscious RAG Test Panel (Developer-Only)

Under the main **Knowledge Base** section in the admin panel, there is a **developer-only** RAG test panel (visible only in dev builds via `import.meta.env.DEV`).

### 3.1 PHI-Conscious Mode Toggle

At the top of the **Knowledge Base** component:

- `PHI-conscious mode (exclude high-risk PHI in test queries)` checkbox.
  - When checked:
    - Test queries run with `exclude_phi: true`.
    - Backend filters out chunks with `phi_risk === "high"` from Qdrant.
  - When unchecked:
    - Test queries run without PHI-based filtering (all KB content eligible).

### 3.2 RAG Test Panel Behavior

The **Developer RAG Test** panel:

- Sends `POST /api/search/advanced` with:
  - `query`, `top_k`, `mode: "precise"`.
  - `exclude_phi` set from the PHI-conscious toggle.
  - `include_metrics: true`.
- Displays:
  - A PHI-conscious mode badge: `ON (exclude high-risk)` or `OFF`.
  - Result list with:
    - Title / `document_id`.
    - Score.
    - Short content preview.
    - PHI risk badge per result (from `metadata.phi_risk` when present).
  - `applied_filters.phi_risk` when the backend applied PHI filters.

This is ideal for:

- Verifying that PHI-conscious mode actually changes retrieved documents.
- Demonstrating safe vs unrestricted RAG behavior to stakeholders.
- Debugging PHI-related KB issues in isolation, without using the main clinician-facing app.

---

## 4. Maintenance Script: `update_phi_risk_payloads.py`

The script `services/api-gateway/tools/update_phi_risk_payloads.py` ensures that Qdrant payloads are consistent with document-level `phi_risk` values.

### 4.1 What It Does

- Connects to the API Gateway’s Postgres database.
- Iterates over `Document` records with non-null `doc_metadata`.
- For each document with a `phi_risk` value:
  - Calls `KBIndexer.update_document_phi_risk(document_id, phi_risk)`:
    - Sets `phi_risk` and `chunk_phi_risk` in the Qdrant payload for all chunks of that document.
- Skips documents without `phi_risk`.
- Logs counts: processed, updated, skipped.

This is especially important for:

- Documents indexed **before** PHI-aware payloads were added.
- Ensuring PHI-conscious filters (e.g., `exclude_phi` in RAG) work uniformly across old and new content.

### 4.2 Usage in Staging

From repo root:

```bash
cd services/api-gateway
python tools/update_phi_risk_payloads.py --limit 50
```

Recommended staging workflow:

1. **Limit-first run**:
   - Run with `--limit` (e.g., `--limit 50`) to verify behavior on a small subset.
   - Monitor logs and confirm that only documents with `phi_risk` are updated.
   - Use the admin PHI filters and RAG test panel to confirm that:
     - PHI-conscious mode excludes high-risk docs.
     - Low/medium-risk docs still appear as expected.
2. **Full run**:
   - Run **without** `--limit` to update all documents:
     - `python tools/update_phi_risk_payloads.py`
   - Re-run a sample of PHI-conscious queries to validate results.

### 4.3 Usage in Production

Similar to staging, but with stricter controls:

1. Schedule a **maintenance window** with read-only expectations for KB updates.
2. Take a snapshot or backup of:
   - Qdrant collection `medical_kb` (if supported in your environment).
   - Postgres database (regular backups should already be in place).
3. Run:
   - `cd services/api-gateway`
   - `python tools/update_phi_risk_payloads.py`
4. Verify:
   - No errors or unexpected log entries.
   - PHI filters and PHI-conscious RAG behave as expected in admin tooling and, if applicable, in voice/text flows configured to use `exclude_phi`.

> **Safety Note**
>
> The script only updates metadata payloads in Qdrant; it does not:
> - Re-embed or re-chunk content.
> - Modify PDF files.
> - Touch raw PHI beyond existing document-level metadata.

---

## 5. Summary & Best Practices

- Use **Enhanced KB Editing** for:
  - High-value reference PDFs (textbooks, guidelines).
  - Cleaning up extraction errors (broken tables, split headings).
  - Improving voice narrations for voice navigation.
- Use **PHI risk badges and filters** to:
  - Prioritize review of PHI-heavy documents.
  - Separate demo-safe content from PHI-heavy KB materials.
- Use the **PHI-conscious RAG test panel** to:
  - Validate backend PHI filters in isolation.
  - Compare answers with and without high-risk KB content.
- Periodically run the **`update_phi_risk_payloads.py` script**:
  - After large reprocessing batches.
  - After importing legacy documents or migrating data.

Following these practices keeps the knowledge base high-quality, PHI-aware, and predictable for both clinicians and demos.
