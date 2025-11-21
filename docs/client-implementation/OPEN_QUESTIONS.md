# VoiceAssist Client Development - Open Questions & Decisions

**Version:** 1.0
**Date:** 2025-11-21
**Status:** Awaiting Decisions
**Branch:** `client-roadmap-reconciliation`

---

## Purpose

This document consolidates all open questions that require answers before proceeding with client development. Questions are organized by category and priority.

**Total Questions:** 23
- **Critical (answer before starting):** 8 questions
- **Medium Priority (answer by specific milestones):** 10 questions
- **Low Priority (can decide later):** 5 questions

---

## Summary Dashboard

| Category | Total | Critical | Medium | Low |
|----------|-------|----------|--------|-----|
| Design & UX | 5 | 2 | 2 | 1 |
| Infrastructure & Operations | 4 | 2 | 2 | 0 |
| External Dependencies | 5 | 1 | 3 | 1 |
| Compliance & Security | 3 | 1 | 2 | 0 |
| AI & Machine Learning | 6 | 2 | 1 | 3 |
| **Total** | **23** | **8** | **10** | **5** |

---

## Table of Contents

1. [Critical Decisions](#critical-decisions-needed-before-starting)
2. [Medium Priority Decisions](#medium-priority-decisions-by-milestone)
3. [Low Priority Decisions](#low-priority-decisions-can-defer)
4. [Decision Template](#decision-template)
5. [Approval Process](#approval-process)

---

## Critical Decisions (Needed Before Starting)

### Design & UX

#### Q1: Design System Availability ⚠️ CRITICAL
**Category:** Design & UX
**Priority:** P0 (Critical)
**Impact:** HIGH - Affects Week 1-2 timeline
**Decision Needed By:** Before Milestone 1 starts (Week 1)

**Question:**
Does a design system already exist (Figma/Sketch files, style guide, component library)?

**Options:**
- **A)** Existing design system available
  - Use as-is, create design tokens from it
  - Timeline: 1 week

- **B)** Partial design system exists
  - Complete missing pieces (colors, typography, components)
  - Timeline: 1.5 weeks

- **C)** No design system exists
  - Create from scratch using medical UI best practices
  - Timeline: 2 weeks

**Provisional Answer:**
**Assume Option C** (no existing design system).

**Recommended Approach:**
1. Research medical UI references:
   - Medscape, UpToDate, Epic MyChart
   - Healthcare.gov, Patient portals

2. Create professional medical design system:
   - **Color palette:** Medical blues, teals, grays (trust-building)
   - **Typography:** System fonts (San Francisco, Segoe UI, Roboto) for professionalism
   - **Spacing:** 4px/8px grid system
   - **Components:** Based on shadcn/ui + Radix UI

3. Document in Figma + Storybook
4. Review with medical professionals for feedback

**Timeline:** 2 weeks (Phase 0)
**Effort:** 1 designer + 1 developer

**What We Need:**
- [ ] Confirmation of existing design system availability
- [ ] Brand guidelines (if any)
- [ ] Logo files (SVG, PNG)
- [ ] Color preferences
- [ ] Typography preferences

**Impact of Delay:**
If this decision is delayed, Week 1-2 timeline extends to Week 1-3.

---

#### Q2: Storybook Setup ⚠️ CRITICAL
**Category:** Design & UX
**Priority:** P0 (Critical)
**Impact:** MEDIUM - Affects Week 1-2 tasks
**Decision Needed By:** Week 1

**Question:**
Should Storybook be part of the initial monorepo setup?

**Options:**
- **A)** Yes, set up Storybook in Week 1-2
  - Better component documentation from day 1
  - Visual testing during development
  - Accessibility testing integration (axe-core)
  - Easier collaboration with designers
  - Effort: +0.5 week

- **B)** Defer to Week 10+
  - Faster initial setup
  - Add documentation later
  - Effort: 1 week later

**Provisional Answer:**
**Recommend Option A** (set up Storybook in Week 1-2).

**Benefits:**
- Component documentation from day 1
- Visual regression testing
- Accessibility testing with axe-core
- Designer collaboration (share Storybook URL)
- Isolated component development
- Design system showcase

**Drawbacks:**
- Adds 0.5 week to Phase 0
- Requires Storybook maintenance

**Recommended Setup:**
- Storybook 7.0+ with Vite
- Accessibility addon (axe-core)
- Docs addon for MDX documentation
- Controls addon for interactive props
- Viewport addon for responsive testing

**What We Need:**
- [ ] Approval to extend Phase 0 by 0.5 week if needed
- [ ] Decision: Deploy Storybook or keep local only?

**Impact of Delay:**
If deferred to Week 10+, component documentation will be incomplete, making collaboration harder.

---

### Infrastructure & Operations

#### Q6: Deployment Strategy ⚠️ CRITICAL
**Category:** Infrastructure
**Priority:** P0 (Critical)
**Impact:** HIGH - Affects deployment architecture
**Decision Needed By:** Week 1-2

**Question:**
Should frontend apps deploy to the same Ubuntu server or separate infrastructure?

**Options:**
- **A)** Same Ubuntu server (asimo.io)
  - **Pros:** Simpler, single point of management, no extra cost
  - **Cons:** Single point of failure, no global CDN, manual deployments
  - **Cost:** $0 extra

- **B)** Separate infrastructure (Vercel/Netlify for frontend)
  - **Pros:**
    - Global CDN (faster load times worldwide)
    - Automatic SSL and preview deployments
    - Frontend updates independent of backend
    - Free tier sufficient for testing
    - Auto-scaling
  - **Cons:** Additional service to manage
  - **Cost:** $0-20/month (free tier likely sufficient)

- **C)** Kubernetes cluster for all
  - **Pros:** Most scalable, enterprise-grade
  - **Cons:** Most complex, highest cost
  - **Cost:** $100-300/month

**Provisional Answer:**
**Recommend Option B** (hybrid approach):

**Architecture:**
- **Backend:** Ubuntu server at asimo.io (existing, production-ready)
  - API Gateway, databases, services
  - Existing monitoring stack

- **Frontend:** Vercel or Netlify
  - voiceassist.asimo.io → Vercel/Netlify edge
  - admin.voiceassist.asimo.io → Vercel/Netlify edge
  - docs.voiceassist.asimo.io → Vercel/Netlify edge
  - Global CDN for fast load times
  - Automatic preview deployments for PRs

**Benefits:**
- Frontend updates don't require backend deployment
- Global CDN improves performance
- Free tier sufficient for development/testing
- Preview deployments for easy QA
- Automatic SSL certificates

**Configuration:**
- DNS: Point frontend subdomains to Vercel/Netlify
- CORS: Update backend to allow frontend origins
- Environment variables: API_URL, WebSocket URL

**Cost Estimate:**
- Vercel/Netlify: $0-20/month (free tier: 100GB bandwidth)
- Total: $0-20/month extra

**What We Need:**
- [ ] Approval for Vercel/Netlify usage
- [ ] DNS access to configure subdomains
- [ ] Approval for $0-20/month budget (if exceeding free tier)

**Alternative (if Option B rejected):**
Deploy to Ubuntu server with Nginx serving static files and reverse proxy to backend.

---

#### Q18: GPU Infrastructure Budget ⚠️ CRITICAL
**Category:** AI & Machine Learning
**Priority:** P0 (Critical)
**Impact:** HIGH - Affects Milestone 3 (Advanced AI)
**Decision Needed By:** Week 20 (before Milestone 3)

**Question:**
Do we have budget/resources for GPU infrastructure to run BioGPT/PubMedBERT?

**Background:**
Phase 5 (Medical AI) was completed with OpenAI embeddings (MVP). Specialized medical models (BioGPT, PubMedBERT) were deferred due to GPU infrastructure requirements.

**Options:**
- **A)** Yes, budget approved for GPU infrastructure
  - **Benefits:**
    - Medical-specific embeddings (higher accuracy)
    - Lower cost per query (vs OpenAI long-term)
    - Data sovereignty (no data sent to OpenAI)
    - Fine-tuning possible
  - **Cost:** $500-1500/month
  - **Options:**
    - AWS EC2 g4dn.xlarge: $500/month (dedicated)
    - AWS SageMaker inference: $300-800/month (pay per use)
    - Hugging Face Inference API: $200-600/month (managed)

- **B)** No budget for GPU infrastructure
  - **Impact:** Continue with OpenAI embeddings
  - **Cost:** $0 extra (included in OpenAI API costs)
  - **Accuracy:** Good but not medical-optimized

**Provisional Answer:**
**Recommend Option A if budget allows**, with cost-benefit analysis:

**Year 1 Projection:**
- OpenAI embeddings: ~$300-500/month (at 100k queries/month)
- BioGPT self-hosted: $500/month (GPU) + minimal API costs
- **Break-even:** ~6 months
- **Year 1 savings:** $1,200-2,400

**Accuracy Improvement (estimated):**
- RAG precision: +5-10%
- Medical entity recognition: +15-20%
- Domain-specific queries: +20-30%

**Recommended Approach:**
1. **Month 1-3:** Use OpenAI embeddings (current)
2. **Month 4:** Evaluate BioGPT/PubMedBERT on test dataset
3. **Month 5:** If accuracy improvement > 10%, migrate
4. **Month 6+:** Self-hosted medical models

**What We Need:**
- [ ] Budget approval for $500-1500/month GPU infrastructure
- [ ] Choice of cloud provider (AWS, GCP, Azure)
- [ ] IT approval for GPU instance provisioning

**Impact if No Budget:**
Continue with OpenAI embeddings. Accuracy will be good but not medical-optimized. No data sovereignty.

---

#### Q10: UpToDate Licensing Budget ⚠️ CRITICAL
**Category:** External Dependencies
**Priority:** P0 (Critical)
**Impact:** HIGH - Affects Milestone 5
**Decision Needed By:** Before Milestone 5 (Week 37)

**Question:**
What's the budget for UpToDate licensing (~$500-1000/month)?

**Background:**
UpToDate is the gold-standard clinical decision support tool used by healthcare professionals worldwide. Integration requires a commercial license.

**Options:**
- **A)** Budget approved for UpToDate
  - **Cost:** $500-1000/month (~$6,000-12,000/year)
  - **Benefits:**
    - 11,500+ clinical topics
    - Drug interaction database
    - Diagnostic algorithms
    - Evidence-based recommendations
    - Trusted by 2M+ clinicians worldwide

- **B)** No budget for UpToDate
  - **Cost:** $0
  - **Impact:** Focus on free sources
  - **Alternatives:**
    - PubMed (free, 35M+ citations)
    - OpenEvidence (free tier, evidence synthesis)
    - Clinical practice guidelines (free, CDC, WHO)
    - DynaMed (alternative, $400-800/month)

**Provisional Answer:**
**Budget approval needed.** UpToDate is highly valuable but expensive.

**Cost-Benefit Analysis:**
- **Value per User:** If 100 clinicians use VoiceAssist daily
  - Cost per user: $5-10/month
  - Time saved: ~30 min/day (faster lookups)
  - Value: $50-100/month per clinician
  - **ROI:** 5-10x

**Recommended Approach:**
1. **Start with free sources:** PubMed, OpenEvidence, guidelines
2. **Evaluate user feedback:** Do users need UpToDate?
3. **Month 6:** If high demand, pursue UpToDate license
4. **Year 1:** Re-evaluate based on usage metrics

**Alternatives (if no budget):**
- **DynaMed:** $400-800/month (alternative to UpToDate)
- **ClinicalKey:** $300-600/month (Elsevier)
- **PubMed + OpenEvidence:** Free

**What We Need:**
- [ ] Budget approval for $500-1000/month
- [ ] Legal approval for commercial API license
- [ ] Decision on alternatives if UpToDate not approved

**Impact if No Budget:**
No UpToDate integration. Use free sources (PubMed, OpenEvidence). Users may need to reference UpToDate separately.

---

### Compliance & Security

#### Q15: Offline Mode PHI Regulations ⚠️ CRITICAL
**Category:** Compliance & Security
**Priority:** P0 (Critical)
**Impact:** HIGH - Affects Milestone 6 (Offline/PWA)
**Decision Needed By:** Before Milestone 6 (Week 45)

**Question:**
What are the regulatory constraints on offline PHI storage under HIPAA?

**Background:**
Milestone 6 includes offline mode and PWA features. Storing PHI offline (on user's device) requires careful HIPAA compliance.

**Options:**
- **A)** PHI allowed offline with proper encryption
  - **Requirements:**
    - AES-256 encryption for offline data
    - Auto-expiration of offline data (7-30 days)
    - User consent for offline storage
    - Remote wipe capability
    - Audit trail for offline access
    - Business Associate Agreement (BAA) updates
  - **Benefits:** Full offline functionality
  - **Risks:** PHI exposure if device lost/stolen

- **B)** PHI not allowed offline (non-PHI only)
  - **Offline Storage Allowed:**
    - Medical knowledge base articles
    - De-identified conversation history
    - User preferences and settings
    - Cached UI assets
  - **Offline Storage Prohibited:**
    - Patient demographics
    - Clinical context (problems, medications, labs)
    - Identifiable data
  - **Benefits:** Simpler compliance, lower risk
  - **Limitations:** Reduced offline functionality

- **C)** Consult HIPAA compliance officer
  - Get official guidance before implementing

**Provisional Answer:**
**Strongly recommend Option C** (consult compliance officer), then implement **Option B** (non-PHI only) for safety.

**Recommended Approach:**
1. **Before Week 45:** Consult with HIPAA compliance officer
2. **Get written approval** for offline PHI storage (if allowed)
3. **Implement Option B** (non-PHI only) as default
4. **If Option A approved:** Add encrypted PHI storage as optional feature

**Non-PHI Offline Mode (Recommended Baseline):**
- Medical knowledge base articles (cached)
- De-identified conversation history:
  - Remove patient names, dates, identifiers
  - Cache conversation text and citations
  - Expire after 7 days
- User preferences (theme, language, voice settings)
- UI assets (JavaScript, CSS, images)

**PHI Offline Mode (If Approved):**
- Encrypted IndexedDB storage (AES-256)
- Auto-expiration after 24 hours
- Remote wipe via backend API
- User consent prompt on first use
- Audit log sent to backend on sync
- Device PIN/biometric required to access

**What We Need:**
- [ ] Meeting with HIPAA compliance officer
- [ ] Written approval for offline PHI storage (or denial)
- [ ] Updated Business Associate Agreement (if PHI offline allowed)
- [ ] Security review of offline encryption approach

**Impact if PHI Offline Not Allowed:**
Offline mode limited to non-PHI features. Users must be online for clinical features.

**Decision Deadline:** Week 40 (5 weeks before Milestone 6)

---

### AI & Machine Learning

#### Q22: Medical Image Datasets ⚠️ CRITICAL
**Category:** AI & Machine Learning
**Priority:** P0 (Critical)
**Impact:** HIGH - Affects Milestone 6 (Multi-Modal AI)
**Decision Needed By:** Before Milestone 6 (Week 45)

**Question:**
Do we have access to labeled medical image datasets for training/fine-tuning?

**Background:**
Milestone 6 includes multi-modal AI (medical image analysis). Custom models require labeled medical images.

**Options:**
- **A)** Yes, licensed datasets available
  - **Use Cases:**
    - Train custom medical image classifiers
    - Fine-tune existing models
    - Benchmark accuracy
  - **Datasets:**
    - Dermatology: HAM10000 (10,000 images, free)
    - Radiology: ChestX-ray14 (100,000 images, free)
    - Radiology: MIMIC-CXR (377,000 images, license required)
  - **Effort:** 4-6 weeks for custom model

- **B)** No, use pre-trained models only
  - **Use GPT-4 Vision:**
    - General medical image analysis
    - No custom training needed
    - Accuracy: good but not specialized
  - **Effort:** 2-3 weeks for integration
  - **Cost:** $0.01-0.02 per image analysis

**Provisional Answer:**
**Recommend Option B** (pre-trained models) initially.

**Recommended Approach:**
1. **Start with GPT-4 Vision:**
   - General medical image analysis
   - Supports dermatology, wounds, ECG, X-rays
   - No training data needed
   - Good accuracy out-of-the-box

2. **Evaluate accuracy:**
   - Benchmark on test dataset
   - Get feedback from medical professionals
   - Measure: precision, recall, F1 score

3. **If accuracy < 85%:**
   - Evaluate fine-tuning with labeled datasets
   - Consider domain-specific models (DermNet, CheXNet)

4. **Month 12+:** Custom models if needed

**Free Datasets Available:**
- **HAM10000** (dermatology, 10k images, free)
- **ChestX-ray14** (radiology, 100k images, free)
- **PAD-UFES-20** (skin lesions, 2k images, free)

**Licensed Datasets:**
- **MIMIC-CXR** (radiology, 377k images, requires PhysioNet license)
- **NIH Chest X-ray** (112k images, free but citation required)

**What We Need:**
- [ ] Decision: Pre-trained models only or custom training?
- [ ] If custom: Dataset license approvals
- [ ] If custom: GPU infrastructure (see Q18)
- [ ] Legal review of dataset terms

**Impact if No Datasets:**
Use GPT-4 Vision only. Accuracy will be good (80-90%) but not medical-optimized (90-95%).

---

#### Q23: AI Diagnosis Liability ⚠️ CRITICAL
**Category:** AI & Machine Learning
**Priority:** P0 (Critical)
**Impact:** CRITICAL - Legal/regulatory
**Decision Needed By:** Before any image analysis feature (Week 40)

**Question:**
What are the liability considerations for AI-assisted diagnosis? Should we pursue FDA approval?

**Background:**
Medical AI systems that provide diagnostic advice may be considered medical devices requiring FDA approval.

**Options:**
- **A)** Decision support only (no diagnosis claims)
  - **Positioning:**
    - "Educational and decision support tool"
    - "Not a substitute for professional medical judgment"
    - "Always verify with primary sources"
  - **Disclaimers:** Clear, prominent, require user acknowledgment
  - **FDA:** Not required for decision support
  - **Liability:** Lower risk
  - **Effort:** Legal review, disclaimers

- **B)** Diagnostic assistance with disclaimers
  - **Positioning:**
    - "AI-assisted diagnostic support"
    - Provides differential diagnosis suggestions
    - Confidence scores shown
  - **FDA:** May require 510(k) clearance (medical device)
  - **Liability:** Medium risk
  - **Effort:** 6-12 months FDA approval, $50k-200k

- **C)** Full diagnostic system (FDA-cleared)
  - **Positioning:**
    - "FDA-cleared diagnostic AI"
    - Direct diagnostic capabilities
  - **FDA:** Requires De Novo or PMA approval
  - **Liability:** Highest risk, highest value
  - **Effort:** 12-24 months, $200k-1M+

**Provisional Answer:**
**Strongly recommend Option A** (decision support only).

**Recommended Approach:**
1. **Position as decision support tool:**
   - "For educational purposes"
   - "Clinical decision support"
   - "Not for diagnostic use"

2. **Implement comprehensive disclaimers:**
   - On first use: User must accept terms
   - On every image analysis result
   - In footer of every page
   - In Terms of Service

3. **Clear user acknowledgment:**
   ```
   "VoiceAssist is a clinical decision support tool, not a diagnostic device.
   All AI-generated information should be verified with primary sources and
   should not replace professional medical judgment. By using this tool,
   you acknowledge that VoiceAssist is for educational and reference
   purposes only."
   ```

4. **Avoid diagnostic language:**
   - ❌ "Diagnosis: Melanoma"
   - ✅ "Possible findings: Pigmented lesion with asymmetry. Suggest dermatology referral."

5. **Always cite sources:**
   - Link to guidelines, literature
   - Encourage verification

**Legal Requirements:**
- [ ] Legal review of all AI features
- [ ] Terms of Service updated with disclaimers
- [ ] User acceptance flow implemented
- [ ] Professional liability insurance review
- [ ] Consult with FDA regulatory expert

**What We Need:**
- [ ] Legal review before Week 40
- [ ] Decision: Decision support only or pursue FDA approval?
- [ ] If FDA: Budget $50k-200k, timeline 6-12 months

**Impact:**
**If we pursue FDA approval:** 6-12 month delay, $50k-200k cost, but much higher value and trust.

**If we stay decision support:** Faster to market, lower cost, but cannot make diagnostic claims.

---

## Medium Priority Decisions (By Milestone)

### Design & UX

#### Q3: Component Library Strategy
**Priority:** P2 (Medium)
**Impact:** MEDIUM - Affects maintainability
**Decision Needed By:** Week 1

**Question:**
Should we use shadcn/ui as-is or fork and customize extensively?

**Options:**
- **A)** Use shadcn/ui as-is
  - Easier updates from upstream
  - Community support
  - Customize via design tokens only

- **B)** Fork and customize
  - More control over components
  - Harder to update
  - Full customization possible

**Provisional Answer:**
**Recommend Option A** (use shadcn/ui as-is with theme customization).

**Rationale:**
- shadcn/ui is highly customizable via Tailwind
- Design tokens provide sufficient control
- Forking creates maintenance burden
- Can always fork specific components later if needed

**Recommendation:**
- Start with shadcn/ui + design tokens
- Customize colors, typography, spacing via tokens
- Fork only if specific component needs major changes

---

#### Q4: Dark Mode Priority
**Priority:** P3 (Low)
**Impact:** LOW - Can be added later
**Decision Needed By:** Week 10

**Question:**
Should dark mode be in MVP or deferred?

**Options:**
- **A)** MVP (Week 2)
  - More work upfront
  - Both themes from day 1
  - Effort: +0.5 week

- **B)** Defer to Week 10+
  - Faster MVP
  - Focus on light mode first
  - Add dark mode in polish phase

**Provisional Answer:**
**Recommend Option B** (defer to Week 10).

**Rationale:**
- Light mode sufficient for MVP
- Medical professionals typically work in well-lit environments
- Dark mode can be added in polish phase (Week 10)
- Saves 0.5 week in Phase 0

**Recommendation:**
- Build light mode first
- Design tokens support dark mode (prepare colors)
- Implement dark mode in Week 10 (Phase 2, Advanced Features)

---

### Infrastructure & Operations

#### Q7: Staging Environments
**Priority:** P1 (High)
**Impact:** MEDIUM - Affects testing workflow
**Decision Needed By:** Week 2

**Question:**
Do we need separate staging/production environments for frontend?

**Options:**
- **A)** Yes, separate staging environments
  - **Staging:** staging.voiceassist.asimo.io
  - **Production:** voiceassist.asimo.io
  - **Benefits:** Safer, final QA before production
  - **Cost:** $0 (same Vercel/Netlify account)

- **B)** No, test locally + preview deployments
  - **Testing:** Local dev + PR preview deployments
  - **Benefits:** Faster, simpler
  - **Risks:** No final QA environment

**Provisional Answer:**
**Recommend Option A** (separate staging environments).

**Configuration:**
- **Local Dev:** http://localhost:3000 → API at http://localhost:8000
- **Staging:** https://staging.voiceassist.asimo.io → API at https://staging-api.asimo.io
- **Production:** https://voiceassist.asimo.io → API at https://api.asimo.io
- **PR Previews:** https://pr-123.voiceassist.vercel.app → API at staging

**Workflow:**
1. Develop locally
2. Open PR → preview deployment
3. Merge to `develop` → deploy to staging
4. Test on staging
5. Merge to `main` → deploy to production

**Cost:** $0 (same Vercel/Netlify account supports multiple environments)

---

#### Q9: Telemetry Provider
**Priority:** P1 (High)
**Impact:** MEDIUM - Affects cost and features
**Decision Needed By:** Week 19 (when implementing telemetry package)

**Question:**
Which telemetry provider for client-side errors and performance monitoring?

**Options:**
- **A)** Sentry (error tracking)
  - **Cost:** $26/month (50k errors/month), $79/month (250k errors/month)
  - **Features:** Error tracking, performance monitoring, session replay
  - **Pros:** Best error tracking, affordable, good React support

- **B)** DataDog (full observability)
  - **Cost:** $15/host/month + $5/million spans
  - **Features:** Logs, metrics, traces, RUM, profiling
  - **Pros:** Full observability suite
  - **Cons:** Expensive for full features

- **C)** New Relic (balanced)
  - **Cost:** $99/month (100GB data), $349/month (unlimited)
  - **Features:** APM, browser monitoring, dashboards
  - **Pros:** Good balance of features and cost

- **D)** Self-hosted (Grafana Loki + Tempo)
  - **Cost:** $0 (infrastructure cost only)
  - **Features:** Logs, traces (limited error tracking)
  - **Pros:** Free, data sovereignty
  - **Cons:** More setup, limited features

**Provisional Answer:**
**Recommend hybrid approach:**
- **Client-side errors:** Sentry ($26-79/month)
- **Backend observability:** Existing Grafana stack (Prometheus, Loki, Jaeger)

**Rationale:**
- Sentry excels at client-side error tracking
- Grafana stack already set up for backend
- Best of both worlds, reasonable cost

**Budget Estimate:**
- **Development:** Sentry free tier (5k errors/month)
- **Production:** Sentry $26-79/month (50k-250k errors/month)
- **Year 1:** ~$300-900/year

**What We Need:**
- [ ] Budget approval for $26-79/month ($300-900/year)
- [ ] Sentry account setup
- [ ] GDPR review (if applicable)

---

### External Dependencies

#### Q11: External API Priorities
**Priority:** P1 (High)
**Impact:** MEDIUM - Affects Milestone 5 sequencing
**Decision Needed By:** Week 35

**Question:**
What's the priority ranking for external medical integrations?

**Options to Rank:**
- UpToDate (clinical decision support)
- OpenEvidence (evidence-based medicine)
- PubMed (literature search)
- Clinical trial databases (ClinicalTrials.gov)
- Drug information systems (Micromedex, Lexicomp)

**Provisional Answer:**
**Recommended Prioritization:**

1. **PubMed** (P1 - Highest Priority)
   - **Cost:** Free
   - **Benefits:** 35M+ citations, essential for literature search
   - **Effort:** 2 weeks
   - **Timeline:** Week 40-42

2. **OpenEvidence** (P1 - High Priority)
   - **Cost:** Free tier available
   - **Benefits:** Evidence synthesis, clinical questions
   - **Effort:** 1 week
   - **Timeline:** Week 37-38

3. **UpToDate** (P0 if licensed, P3 if not)
   - **Cost:** $500-1000/month (requires license)
   - **Benefits:** Best clinical decision support, 11,500+ topics
   - **Effort:** 2 weeks
   - **Timeline:** Week 37-39 (if licensed)

4. **Drug Information** (P2 - Medium Priority)
   - **Cost:** Varies ($200-500/month)
   - **Benefits:** Drug interactions, dosing, safety
   - **Effort:** 1-2 weeks
   - **Timeline:** Milestone 7+ (future)

5. **Clinical Trials** (P3 - Low Priority)
   - **Cost:** Free (ClinicalTrials.gov API)
   - **Benefits:** Trial matching, enrollment
   - **Effort:** 1 week
   - **Timeline:** Milestone 8+ (future)

**Rationale:**
- PubMed is free and essential for citations
- OpenEvidence provides evidence synthesis for free
- UpToDate requires budget approval
- Drug info and trials can be deferred

**What We Need:**
- [ ] Confirmation of priority ranking
- [ ] Budget approval for UpToDate (if high priority)

---

#### Q12: EMR Integration Targets
**Priority:** P2 (Medium)
**Impact:** HIGH - Affects future EMR integration
**Decision Needed By:** Month 6

**Question:**
Are there specific hospital partners or EMR systems to target first?

**Options:**
- **A)** Specific hospital partnership in progress
  - Focus on their EMR system first
  - Customized integration

- **B)** Most popular EMRs (Epic, Cerner, Allscripts)
  - Epic: 31% market share
  - Cerner: 25% market share
  - Allscripts: 12% market share

- **C)** Generic FHIR R4 standard
  - Works with all FHIR-compliant EMRs
  - Start with read-only patient data
  - Expand to read-write later

**Provisional Answer:**
**Recommend Option C** (generic FHIR R4) initially.

**Rationale:**
- HL7 FHIR R4 is standard across major EMRs
- Avoid vendor lock-in
- Easier to add hospital-specific customizations later
- Start with read-only to reduce complexity

**Recommended Approach:**
1. **Implement FHIR R4 read-only:**
   - Patient demographics
   - Observations (labs, vitals)
   - Conditions (diagnoses)
   - Medications

2. **Test with Epic/Cerner sandboxes:**
   - Both provide free developer sandboxes
   - Validate FHIR compliance

3. **Expand based on partnerships:**
   - Add hospital-specific features as needed

4. **Timeline:** Milestone 7+ (Month 13+)

**What We Need:**
- [ ] Hospital partnership status
- [ ] Preferred EMR systems
- [ ] Read-only vs read-write requirements

---

#### Q14: FHIR Certification
**Priority:** P2 (Medium)
**Impact:** MEDIUM - Affects EMR credibility
**Decision Needed By:** Month 12

**Question:**
Should we pursue HL7 FHIR compliance certification?

**Options:**
- **A)** Yes, pursue certification
  - **Cost:** $5,000-10,000
  - **Benefits:** Official certification, trust, partnerships
  - **Timeline:** 3-6 months

- **B)** No, self-certification
  - **Cost:** $0
  - **Benefits:** Faster, no cost
  - **Limitations:** Less credibility

**Provisional Answer:**
**Defer to Month 12+**, then decide based on:
- Hospital partnership requirements
- Market demand for certification
- Budget availability

**Recommended Approach:**
1. **Build FHIR R4 support** (self-certified)
2. **Test with major EMRs** (Epic, Cerner sandboxes)
3. **Month 12:** Evaluate need for certification
4. **If needed for partnerships:** Pursue certification

---

### Compliance & Security

#### Q16: GDPR Priority
**Priority:** P2 (Medium)
**Impact:** MEDIUM - Affects Milestone 5
**Decision Needed By:** Week 40

**Question:**
Is European deployment a near-term goal? Should we prioritize GDPR compliance?

**Options:**
- **A)** Yes, European deployment planned
  - Implement GDPR features in Milestone 5
  - Right to be forgotten
  - Data portability
  - Consent management
  - Effort: 2-3 weeks

- **B)** No, US-only for now
  - Defer GDPR to later (if needed)
  - Focus on HIPAA only
  - Effort: 0

**Provisional Answer:**
**Recommend Option B** (defer GDPR) unless European deployment confirmed.

**Rationale:**
- HIPAA compliance already achieved
- GDPR can be added later if needed
- Focus resources on core features first

**If GDPR Needed Later:**
- Right to be forgotten: User data deletion API
- Data portability: Export user data (JSON, CSV)
- Consent management: Cookie consent, data processing consent
- Data residency: EU region deployment (optional)
- Effort: 2-3 weeks

**What We Need:**
- [ ] Confirmation of European deployment plans
- [ ] Timeline for European launch (if planned)

---

#### Q17: Data Residency Options
**Priority:** P3 (Low)
**Impact:** MEDIUM - Affects architecture
**Decision Needed By:** Month 9

**Question:**
Should we implement data residency options (US, EU, other regions)?

**Options:**
- **A)** Yes, multi-region deployment
  - US region (primary)
  - EU region (GDPR compliance)
  - Other regions as needed
  - Effort: 3-4 weeks per region

- **B)** No, US-only
  - Simpler architecture
  - Lower cost
  - Use global CDN for frontend only

**Provisional Answer:**
**Recommend Option B** (US-only) initially.

**Rationale:**
- US-only sufficient for initial launch
- Global CDN (Vercel/Netlify) provides fast frontend worldwide
- Backend API can be added to additional regions later if demand

**If Multi-Region Needed:**
- Deploy backend to AWS regions (us-east-1, eu-west-1)
- Use Route 53 for geo-routing
- Database replication across regions
- Effort: 3-4 weeks

---

### AI & Machine Learning

#### Q19: Model Training Strategy
**Priority:** P2 (Medium)
**Impact:** MEDIUM - Affects accuracy and cost
**Decision Needed By:** Week 20

**Question:**
Should we fine-tune models or rely on prompt engineering only?

**Options:**
- **A)** Fine-tune models
  - **Benefits:** Higher accuracy, specialized to medical domain
  - **Drawbacks:** More work, requires training data, GPU infrastructure
  - **Effort:** 4-6 weeks

- **B)** Prompt engineering only
  - **Benefits:** Faster, no training needed, no GPU required
  - **Drawbacks:** Less control, lower accuracy
  - **Effort:** 1-2 weeks

- **C)** Hybrid (fine-tune embeddings, prompt engineer LLM)
  - **Benefits:** Best of both worlds
  - **Effort:** 3-4 weeks

**Provisional Answer:**
**Recommend Option C** (hybrid approach).

**Recommended Approach:**
1. **Fine-tune embeddings:**
   - Use BioGPT or PubMedBERT for medical embeddings
   - Improves retrieval quality
   - GPU required (see Q18)

2. **Prompt engineer LLM:**
   - Use GPT-4 with optimized prompts
   - No fine-tuning needed
   - Faster, simpler

3. **Benefits:**
   - Better retrieval (fine-tuned embeddings)
   - Flexible generation (prompt engineering)
   - Balanced cost and accuracy

---

## Low Priority Decisions (Can Defer)

### Design & UX

#### Q5: Mobile App Strategy
**Priority:** P3 (Low)
**Impact:** HIGH - Future roadmap
**Decision Needed By:** After Milestone 2 (Month 6)

**Question:**
Should we plan for native mobile apps (iOS/Android) or stick to responsive web/PWA?

**Options:**
- **A)** Responsive web + PWA only
  - **Benefits:** Single codebase, faster development, lower cost
  - **Limitations:** Limited native features, slower performance

- **B)** Native mobile apps later (React Native or Flutter)
  - **Benefits:** Better UX, full native features, faster performance
  - **Drawbacks:** More work, 3 codebases (web, iOS, Android)

**Provisional Answer:**
**Recommend Option A** (responsive web + PWA) for Year 1.

**Rationale:**
- Build excellent responsive web experience first
- PWA provides app-like experience (install to home screen)
- Evaluate native apps after Milestone 2 based on:
  - User feedback
  - Mobile usage metrics
  - Feature requests (push notifications, offline mode, etc.)

**Decision Point:** Month 6 (after Milestone 2)
- If mobile usage > 40%: Consider native apps
- If mobile usage < 40%: Continue with PWA

---

### Infrastructure & Operations

#### Q8: CI/CD Platform
**Priority:** P3 (Low)
**Impact:** LOW - Most platforms similar
**Decision Needed By:** Week 1

**Question:**
CI/CD platform preference: GitHub Actions, GitLab CI, or CircleCI?

**Options:**
- **A)** GitHub Actions
  - Already using for backend
  - Tight GitHub integration
  - Free for public repos

- **B)** GitLab CI
  - If moving to GitLab

- **C)** CircleCI
  - Additional cost

**Provisional Answer:**
**Recommend Option A** (GitHub Actions).

**Rationale:**
- Already configured for backend
- Tight integration with GitHub
- Free for public repos, generous limits for private
- Good monorepo support with Turborepo

---

### External Dependencies

#### Q13: Hospital Partnership Timeline
**Priority:** P3 (Low)
**Impact:** MEDIUM - Affects EMR integration planning
**Decision Needed By:** Month 6

**Question:**
What's the timeline for hospital partnership discussions?

**Provisional Answer:**
Defer EMR integration to Milestone 7+ (Month 13+).

**Recommended Approach:**
1. **Focus on core features first** (Milestones 1-6)
2. **Month 6:** Evaluate market demand for EMR integration
3. **Month 9:** Begin hospital partnership discussions
4. **Month 13+:** Implement EMR integration if partnerships secured

---

### AI & Machine Learning

#### Q20: Model Evaluation Framework
**Priority:** P3 (Low)
**Impact:** MEDIUM - Affects quality assurance
**Decision Needed By:** Week 25

**Question:**
What's the strategy for model evaluation and benchmarking?

**Options:**
- **A)** Manual evaluation by medical experts
- **B)** Automated benchmarks (MedQA, PubMedQA, USMLE)
- **C)** Hybrid (automated + manual)

**Provisional Answer:**
**Recommend Option C** (hybrid).

**Recommended Approach:**
1. **Automated benchmarks:**
   - MedQA dataset (US Medical Licensing Exam questions)
   - PubMedQA dataset (biomedical literature questions)
   - Custom test set (100 clinical scenarios)

2. **Manual evaluation:**
   - 5-10 medical experts review 100 sample queries
   - Rate accuracy, relevance, completeness
   - Provide feedback on improvements

3. **Continuous evaluation:**
   - A/B testing in production
   - User feedback (thumbs up/down)
   - Analytics on query success rate

---

#### Q21: Multi-Modal AI Use Cases Priority
**Priority:** P3 (Low)
**Impact:** MEDIUM - Affects Milestone 6
**Decision Needed By:** Week 45

**Question:**
Which medical image analysis use cases are highest priority?

**Options to Rank:**
- Radiology (X-ray, CT, MRI)
- Dermatology (skin lesions)
- Pathology (microscopy)
- Wound assessment
- ECG interpretation

**Provisional Answer:**
**Recommended Prioritization:**

1. **Dermatology** (P1)
   - Simpler, well-defined problem
   - Large training datasets available (HAM10000)
   - High accuracy achievable (> 90%)
   - Useful for telehealth

2. **Wound assessment** (P1)
   - Useful for telehealth and home care
   - Easier than radiology
   - Good datasets available

3. **ECG interpretation** (P2)
   - Requires specialized models
   - Medical liability concerns
   - High value if accurate

4. **Radiology** (P3)
   - Most complex, requires specialized training
   - High liability concerns
   - Consider FDA approval path

5. **Pathology** (P3)
   - Requires specialized hardware (microscopy)
   - Niche use case

**Rationale:**
- Start with simpler use cases (dermatology, wounds)
- Validate accuracy and user feedback
- Expand to complex use cases (radiology) later

---

## Decision Template

For each decision, use this template:

```markdown
### [Question Number]: [Question Title]
**Category:** [Design & UX | Infrastructure | External Dependencies | Compliance | AI/ML]
**Priority:** [P0 Critical | P1 High | P2 Medium | P3 Low]
**Impact:** [HIGH | MEDIUM | LOW]
**Decision Needed By:** [Week number or milestone]

**Question:**
[Clear statement of the question]

**Options:**
- **A)** [Option description]
  - Pros: [List]
  - Cons: [List]
  - Cost: [Estimate]
  - Effort: [Time estimate]

- **B)** [Option description]
  - Pros: [List]
  - Cons: [List]
  - Cost: [Estimate]
  - Effort: [Time estimate]

**Provisional Answer:**
[Recommended option with rationale]

**What We Need:**
- [ ] [Required information or approval]
- [ ] [Additional requirements]

**Impact if Not Decided:**
[Description of consequences]
```

---

## Approval Process

### Decision Authority

| Priority | Decision Authority | Approval Process |
|----------|-------------------|------------------|
| **P0 (Critical)** | Product Owner + CTO | Written approval required |
| **P1 (High)** | Product Owner | Email approval |
| **P2 (Medium)** | Technical Lead | Team consensus |
| **P3 (Low)** | Development Team | Team discussion |

### Approval Workflow

1. **Review Questions:** Team reviews all questions
2. **Gather Information:** Collect required information
3. **Evaluate Options:** Discuss pros/cons of each option
4. **Make Decision:** Follow approval process based on priority
5. **Document Decision:** Update this document with final decision
6. **Communicate:** Notify team of decision and rationale

---

## Progress Tracking

| Question | Status | Decision | Decided By | Date |
|----------|--------|----------|-----------|------|
| Q1: Design System | ⏳ Pending | - | - | - |
| Q2: Storybook | ⏳ Pending | - | - | - |
| Q3: Component Library | ⏳ Pending | - | - | - |
| Q4: Dark Mode | ⏳ Pending | - | - | - |
| Q5: Mobile Apps | ⏳ Pending | - | - | - |
| Q6: Deployment | ⏳ Pending | - | - | - |
| Q7: Staging Env | ⏳ Pending | - | - | - |
| Q8: CI/CD Platform | ⏳ Pending | - | - | - |
| Q9: Telemetry | ⏳ Pending | - | - | - |
| Q10: UpToDate | ⏳ Pending | - | - | - |
| Q11: API Priorities | ⏳ Pending | - | - | - |
| Q12: EMR Targets | ⏳ Pending | - | - | - |
| Q13: Hospital Partnership | ⏳ Pending | - | - | - |
| Q14: FHIR Cert | ⏳ Pending | - | - | - |
| Q15: Offline PHI | ⏳ Pending | - | - | - |
| Q16: GDPR | ⏳ Pending | - | - | - |
| Q17: Data Residency | ⏳ Pending | - | - | - |
| Q18: GPU Budget | ⏳ Pending | - | - | - |
| Q19: Model Training | ⏳ Pending | - | - | - |
| Q20: Model Evaluation | ⏳ Pending | - | - | - |
| Q21: Multi-Modal Priority | ⏳ Pending | - | - | - |
| Q22: Image Datasets | ⏳ Pending | - | - | - |
| Q23: AI Liability | ⏳ Pending | - | - | - |

---

## Next Steps

1. **Schedule Review Meeting:**
   - Team reviews all 23 questions
   - Prioritize critical decisions (8 questions)
   - Assign research tasks for information gathering

2. **Critical Decisions First:**
   - Q1: Design system availability
   - Q2: Storybook setup
   - Q6: Deployment strategy
   - Q10: UpToDate licensing
   - Q15: Offline PHI regulations
   - Q18: GPU infrastructure
   - Q22: Medical image datasets
   - Q23: AI diagnosis liability

3. **Gather Required Information:**
   - Design assets (logos, colors, fonts)
   - Budget approvals (UpToDate, GPU, telemetry)
   - Legal/compliance reviews (HIPAA, FDA)
   - IT approvals (infrastructure, DNS)

4. **Make Decisions:**
   - Follow approval process
   - Document decisions in this file
   - Update roadmap with final decisions

5. **Begin Development:**
   - Start Milestone 1, Week 1
   - Revisit open questions at each milestone

---

**Document Version:** 1.0
**Last Updated:** 2025-11-21
**Next Review:** After critical decisions made (before Week 1)
**Owner:** VoiceAssist Product Team
