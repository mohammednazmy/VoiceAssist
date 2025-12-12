---
title: Medical Features
slug: medical-features
summary: >-
  VoiceAssist includes specialized medical capabilities designed for healthcare
  professionals, with a focus on evidence-based information retrieval, cli...
status: stable
stability: production
owner: docs
lastUpdated: "2025-12-12"
audience:
  - human
  - ai-agents
tags:
  - medical
  - features
category: reference
component: "backend/api-gateway"
relatedPaths:
  - "services/api-gateway/app/services/rag_service.py"
  - "services/api-gateway/app/services/medical_kb_service.py"
  - "services/api-gateway/app/services/kb_indexer.py"
  - "services/api-gateway/app/api/admin_kb.py"
ai_summary: >-
  VoiceAssist includes specialized medical capabilities designed for healthcare
  professionals, with a focus on evidence-based information retrieval, clinical
  decision support, and privacy-conscious handling of medical data. Pre-loaded
  medical textbooks are indexed and available for semantic search...
---

# Medical Features Documentation

## Overview

VoiceAssist includes specialized medical capabilities designed for healthcare professionals, with a focus on evidence-based information retrieval, clinical decision support, and privacy-conscious handling of medical data.

## Core Medical Features

### 1. Medical Textbook Knowledge Base

#### Concept

Pre-loaded medical textbooks are indexed and available for semantic search with precise citations.

#### Supported Textbooks (Planned)

- Harrison's Principles of Internal Medicine
- Robbins and Cotran Pathologic Basis of Disease
- Williams Obstetrics
- Nelson Textbook of Pediatrics
- Specialty-specific textbooks (customizable)
- UpToDate (if subscription available)

#### How It Works

1. PDF textbooks are uploaded to the admin panel
2. Text is extracted and OCR'd if needed
3. Content is chunked by section/paragraph with page tracking
4. Embeddings generated and stored in vector database
5. Metadata includes: book name, edition, chapter, page number, section title
6. (Enhanced pipeline) For selected admin KB PDFs:
   - Layout-aware extraction and per-page GPT-4o Vision analysis.
   - Structured content blocks (headings, tables, figures) and voice-optimized narrations.
   - Enhanced chunks and narrations fed into RAG and voice navigation.

#### Example Queries

- "What does Harrison's say about diabetic ketoacidosis management?"
- "According to Robbins, what are the pathological features of atherosclerosis?"
- "What's the recommended treatment for preeclampsia in Williams Obstetrics?"

#### Response Format

```
According to Harrison's Principles of Internal Medicine, 21st Edition,
Chapter 420 (Diabetes Mellitus), page 2987:

"Diabetic ketoacidosis (DKA) is characterized by hyperglycemia,
metabolic acidosis, and increased total body ketone concentration..."

[Full relevant excerpt]

Would you like me to read more from this section or explore related topics?
```

#### Features

- Exact page citations
- Multi-book cross-referencing
- "Read more" option to get additional context
- Voice narration of text sections
- Bookmark frequently referenced sections
- Optional **enhanced content editing** in the admin panel:
  - Page images with zoom.
  - Block-level editing of headings, tables, figures, and voice narrations.

### 2. Medical Journal Search & Retrieval

#### Databases Supported

- **PubMed/MEDLINE**: Primary source for biomedical literature
- **PubMed Central (PMC)**: Open-access full-text articles
- **OpenEvidence**: Evidence summaries and clinical questions
- Direct journal access (with institutional credentials if available)

#### Search Capabilities

**Natural Language Queries:**

- "Find recent papers on GLP-1 agonists for heart failure"
- "What's the latest evidence on early goal-directed therapy for sepsis?"
- "Show me systematic reviews about omega-3 fatty acids and cardiovascular outcomes"

**Advanced Filters:**

- Publication date range
- Article type (RCT, meta-analysis, review, case report)
- Journal impact factor
- Study population
- Sample size

**Automatic Ranking:**

- Relevance to query
- Study quality (based on type and journal)
- Recency
- Citation count

#### PDF Download & Processing

**Workflow:**

1. User requests journal article
2. System searches PubMed for matches
3. Displays results with abstracts
4. User selects article(s) to download
5. System attempts download:
   - PMC open access (direct)
   - Institutional access (via credentials)
   - Direct journal link
   - Alternative sources (as legally permitted)
6. PDF is downloaded, processed, and indexed
7. Full text becomes searchable

**Processing Steps:**

- OCR for image-based PDFs
- Extract text, figures, tables
- Parse sections (abstract, methods, results, discussion)
- Generate embeddings
- Store with metadata (DOI, authors, journal, year, type)

**Storage:**

- PDFs saved on Ubuntu server
- Optionally backed up to Nextcloud
- Organized by topic/specialty folders
- For admin-managed KB documents, enhanced processing can generate:
  - Per-page images and structured blocks.
  - Voice-optimized narrations with PHI detection on the narration text.

#### Example Use Cases

**Research Question:**
"What's the current evidence on dapagliflozin for heart failure?"

**System Response:**

1. Searches PubMed for relevant papers
2. Finds DAPA-HF trial, meta-analyses, recent reviews
3. Downloads key papers
4. Synthesizes findings:

```
Based on 15 recent publications including 3 large RCTs:

DAPA-HF Trial (McMurray et al., NEJM 2019):
- 4,744 patients with HFrEF
- Dapagliflozin reduced CV death or HF hospitalization by 26% (HR 0.74)
- NNT = 21 over 18 months

[Additional studies summarized]

Key Takeaway: Strong evidence supports dapagliflozin for HFrEF,
regardless of diabetes status. Class 1A recommendation in
2021 ESC guidelines.

Would you like me to download the full DAPA-HF paper or review the guideline?
```

### 3. Clinical Guidelines Access

#### Guideline Sources

- **CDC**: Disease prevention and control guidelines
- **WHO**: International health recommendations
- **Specialty Societies**:
  - American Heart Association (AHA)
  - American Diabetes Association (ADA)
  - American College of Cardiology (ACC)
  - Infectious Diseases Society of America (IDSA)
  - Many others
- National guidelines (NICE, SIGN, etc.)

#### Indexing Strategy

- Scrape official guideline PDFs/web pages
- Index by disease/condition
- Track guideline updates
- Flag when new versions are released
- Compare old vs new recommendations

#### Query Examples

- "What's the current AHA guideline for hypertension management?"
- "CDC recommendations for COVID-19 post-exposure prophylaxis"
- "IDSA guidelines for community-acquired pneumonia"

#### Response Features

- Guideline year and version
- Strength of recommendation (1A, 2B, etc.)
- Quality of evidence
- Key changes from previous version
- Link to full guideline

### 4. OpenEvidence Integration

#### What is OpenEvidence?

AI-powered clinical decision support system trained on medical evidence.

#### Integration Approach

- API calls to OpenEvidence for clinical questions
- Supplement with local knowledge base
- Compare OpenEvidence summary with direct literature review
- Provide both synthesized answer and source citations

#### Example Query

"Is anticoagulation indicated for atrial fibrillation with a CHA2DS2-VASc score of 1?"

**OpenEvidence Response:**

```
Evidence Summary (via OpenEvidence):
For males with CHA2DS2-VASc score of 1, anticoagulation may be considered
but is not mandated. Individualize based on bleeding risk and patient preference.

Direct Evidence (from local knowledge base):
2020 ESC AF Guidelines recommend:
- CHA2DS2-VASc ≥ 2 (males): Oral anticoagulation recommended (Class I)
- CHA2DS2-VASc = 1 (males): Consider anticoagulation (Class IIa)

Supporting Studies:
[List of relevant RCTs with outcomes]

Recommendation: Discuss risks/benefits with patient. Consider if
bleeding risk (HAS-BLED) is low.
```

### 5. Medical Calculators & Tools

#### Integrated Calculators (Planned)

- CHA2DS2-VASc (stroke risk in AF)
- HAS-BLED (bleeding risk)
- ASCVD Risk Calculator
- GFR/CKD-EPI
- APACHE II (ICU mortality)
- CURB-65 (pneumonia severity)
- Wells Score (DVT/PE probability)
- Many others via MDCalc integration

#### Usage

Voice command: "Calculate CHA2DS2-VASc for a 68-year-old male with hypertension and diabetes"

System prompts for missing variables, calculates score, provides interpretation and recommendations.

### 6. Drug Information & Interactions

#### Features (Planned)

- Drug dosing information
- Renal/hepatic adjustments
- Drug-drug interactions (via API or database)
- Pregnancy/lactation categories
- Common adverse effects

#### Sources

- FDA labels
- Lexicomp or Micromedex API
- Open drug databases

### 7. Differential Diagnosis Assistant

#### Concept

Present clinical scenario, get differential diagnosis list with reasoning.

#### Implementation

- Leverage GPT-4's medical reasoning
- Cross-reference with UpToDate/textbooks
- Present likelihood and key differentiating features
- Suggest diagnostic workup

**Example:**
"42-year-old male with acute chest pain radiating to left arm, diaphoresis, no trauma"

**Response:**

```
Differential Diagnosis (in order of urgency):

1. Acute Coronary Syndrome (MI/Unstable Angina) - HIGH PRIORITY
   - Classic presentation
   - Immediate: ECG, troponin, aspirin

2. Aortic Dissection
   - Less common but life-threatening
   - Check BP both arms, CXR, consider CT angio

3. Pulmonary Embolism
   - Consider if risk factors present
   - Wells score, D-dimer if low probability

[Additional differentials with reasoning]

Recommended Immediate Actions:
- 12-lead ECG
- IV access
- High-flow oxygen if hypoxic
- Aspirin 325mg if no contraindications
- Serial troponins
- Activate cath lab if STEMI

Would you like the full workup algorithm or medication dosing?
```

### 8. Case-Based Learning (Future)

#### Features

- Present clinical cases
- User works through diagnosis/management
- System provides feedback and teaching points
- Reference to guidelines and evidence

## Privacy & Compliance

### HIPAA Considerations

**Safe Practices:**

- Never include patient names, MRNs, or identifiable information in queries
- Use "de-identified" case presentations
- Local processing of any PHI
- Audit logs for compliance

**Example Safe Query:**
"Management of 55-year-old with new-onset atrial fibrillation and CKD stage 3"

**Example UNSAFE Query:**
"What should I do for John Smith, MRN 123456, who has AF?"

### Data Flow Rules

1. **General medical knowledge queries** → Cloud APIs OK
2. **Patient-specific with PHI** → Local processing ONLY
3. **De-identified cases** → Cloud OK with caution
4. **Personal medical info** → Local only

### User Training

- Clear documentation on privacy
- Warning prompts if PHI detected
- Option to force local processing

## Medical Knowledge Update Cadence

### Continuous Updates

- PubMed alerts for specified topics
- Weekly scan for new high-impact publications
- Automatic download and indexing of relevant papers

### Periodic Reviews

- Monthly guideline update checks
- Quarterly textbook supplement review
- Annual major textbook edition updates

### User-Triggered

- Manual search and add
- Topic deep-dives on demand
- Specialty focus area curation

## Quality Assurance

### Citation Verification

- Every medical claim must have source
- Page numbers for textbooks
- DOI/PMID for journals
- URL for guidelines
- No "hallucinated" references

### Accuracy Checks

- Cross-reference multiple sources
- Flag conflicting information
- Provide date of information
- Disclaimer: "Verify with primary sources for clinical decisions"

### Disclaimers

**System should include:**

```
This system provides information for educational and reference purposes.
It is not a substitute for professional medical judgment. Always verify
critical information with primary sources and current guidelines. Medical
knowledge evolves rapidly - confirm latest evidence before clinical application.
```

## Use Case Scenarios

### Scenario 1: Pre-Clinic Preparation

"I have a patient with resistant hypertension coming in. Remind me of the workup for secondary causes."

System provides:

- Checklist of secondary causes
- Recommended lab tests and imaging
- Algorithm from JNC-8/AHA guidelines
- Recent papers on approach

### Scenario 2: In-Clinic Quick Reference

"What's the dosing for apixaban in atrial fibrillation with CKD?"

System provides:

- Standard dosing (5mg BID)
- Renal adjustments (2.5mg BID if Cr >1.5 and age >80 or weight <60kg)
- Source citation
- Monitoring recommendations

### Scenario 3: Literature Review for Grand Rounds

"Find the top 10 papers on immunotherapy for melanoma from the past 2 years"

System:

- Searches PubMed with filters
- Ranks by impact and relevance
- Downloads PDFs
- Generates summary of key findings
- Creates bibliography

### Scenario 4: After-Hours Question

Voice: "Hey assistant, I have a patient with suspected NMS from haloperidol. What's the management?"

System (voice response):

- Confirms neuroleptic malignant syndrome features
- Management algorithm (stop drug, supportive care, dantrolene/bromocriptine)
- ICU admission criteria
- Prognosis information
- Offers to text detailed protocol

## Future Enhancements

### Clinical Decision Support

- Integration with EMR (FHIR API)
- Real-time alerts (drug interactions, contraindications)
- Order set suggestions

### Continuing Medical Education

- CME credit tracking
- Quiz generation from literature
- Spaced repetition for retention

### Research Assistant

- Literature review automation
- Data extraction from papers
- Meta-analysis support
- Bibliography generation

### Teaching Tool

- Medical student/resident education mode
- Socratic questioning
- Board exam preparation

## Technical Implementation Notes

### Embedding Models

- Use specialized medical embeddings if available (BioGPT, PubMedBERT)
- Or fine-tune OpenAI embeddings on medical corpus
- Benchmark retrieval accuracy

### Chunking Strategy

- Textbooks: By section/subsection (preserve context)
- Journal articles: By paragraph with section labels
- Guidelines: By recommendation statement
- Overlap chunks to avoid boundary issues

### Metadata Schema

```json
{
  "id": "uuid",
  "type": "textbook|journal|guideline",
  "source": "Harrison's 21st Ed",
  "title": "Diabetic Ketoacidosis",
  "chapter": "420",
  "page": "2987",
  "section": "Treatment",
  "date": "2022",
  "specialty": ["Endocrinology", "Internal Medicine"],
  "keywords": ["DKA", "diabetes", "ketoacidosis"],
  "embedding": [0.123, ...],
  "content": "Full text chunk"
}
```

### Performance Optimization

- Cache common queries
- Pre-compute embeddings for frequently accessed content
- Hybrid search (vector + keyword) for best results
- Pagination for large result sets

## Ethical Considerations

- Ensure equity in knowledge representation (not just Western medicine)
- Acknowledge limitations of AI in medical decision-making
- Maintain human physician as ultimate authority
- Transparent about sources and confidence levels
- Regular bias audits of recommendations

## Regulatory Compliance

- FDA consideration: Not a medical device (information only)
- HIPAA: No PHI in cloud
- malpractice insurance: Confirm coverage for AI-assisted decision-making
- Document limitations prominently

---

**Note**: Medical features should be developed and validated carefully with emphasis on accuracy and patient safety. Consider consulting with medical informaticists and legal advisors during implementation.
