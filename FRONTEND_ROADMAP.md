# VoiceAssist Frontend Development Roadmap

## Current State Summary (Post-Phase 7)

### Completed Features

**Phase 1-3: Core Chat Functionality**

- WebSocket-based real-time chat streaming
- Message editing, regeneration, deletion
- Conversation branching with visualization
- Citation display and sidebar
- Clinical context management

**Phase 4-5: Auth & Infrastructure**

- Google and Microsoft OAuth login
- Protected routes with token management
- Documentation site with Next.js 14
- File attachments and uploads

**Phase 6: Stability & UX**

- Logger utility for environment-aware logging
- Mic permission error UX with step-by-step guidance
- Connection status improvements (failed state + retry)
- Docs site search and edit links

**Phase 7: Integration Hardening**

- ConversationSessionContext (unified state management)
- Message pagination with scroll-to-load (92 new tests)
- Idempotent message sending
- Offline voice capture scaffolding
- Admin panel API integration
- E2E tests for conversations, export, profile, accessibility

---

## Phase 8: Polish & Production Readiness

### Priority 1: Fix Test Failures & CI Issues

**Issue:** Some pre-existing test failures and CI security scan issues

**Tasks:**

1. [ ] Fix 5 failing unit tests in:
   - `useChatSession-editing.test.ts` (3 failures)
   - `useRealtimeVoiceSession.test.ts` (1 failure)
   - `VoiceModePanel-permissions.test.tsx` (1 failure)
2. [ ] Address Bandit security scan findings
3. [ ] Fix Trivy container scan issues
4. [ ] Ensure all 13 previously skipped WebSocket tests pass

**Estimated effort:** 4-6 hours

### Priority 2: Complete Offline Voice Capture

**Current state:** `useOfflineVoiceCapture` hook scaffolded but not integrated

**Tasks:**

1. [ ] Integrate offline voice capture with VoiceModePanel
2. [ ] Add IndexedDB storage for recorded audio
3. [ ] Implement auto-sync when connectivity restored
4. [ ] Add UI indicator showing pending recordings count
5. [ ] Write tests for offline functionality

**Estimated effort:** 8-12 hours

### Priority 3: Admin Dashboard Enhancements

**Current state:** Basic health monitoring, KB management

**Tasks:**

1. [ ] Add real-time WebSocket status monitoring
2. [ ] Implement user management CRUD
3. [ ] Add system metrics visualization (charts)
4. [ ] Create audit log viewer
5. [ ] Add KB document preview and editing

**Estimated effort:** 12-16 hours

---

## Phase 9: Advanced Features

### Priority 1: Multi-Language Support (i18n)

**Tasks:**

1. [ ] Install and configure react-i18next
2. [ ] Extract all user-facing strings to locale files
3. [ ] Add language switcher in settings
4. [ ] Support RTL layouts for Arabic
5. [ ] Add automatic language detection

**Estimated effort:** 16-20 hours

### Priority 2: Mobile Responsiveness & PWA

**Tasks:**

1. [ ] Audit and fix responsive breakpoints
2. [ ] Optimize touch interactions for voice mode
3. [ ] Add service worker for offline caching
4. [ ] Configure manifest.json for installable PWA
5. [ ] Implement push notifications (optional)

**Estimated effort:** 12-16 hours

### Priority 3: Enhanced Voice Features

**Tasks:**

1. [ ] Add voice activity visualization (waveform)
2. [ ] Implement voice command shortcuts ("Hey Assistant")
3. [ ] Add speaker diarization support (multiple speakers)
4. [ ] Create voice memo/note-taking mode
5. [ ] Add voice-to-text editing (speak corrections)

**Estimated effort:** 20-30 hours

---

## Phase 10: Performance & Scalability

### Priority 1: Bundle Optimization

**Tasks:**

1. [ ] Analyze bundle size with webpack-bundle-analyzer
2. [ ] Implement code splitting for routes
3. [ ] Lazy load heavy components (BranchTree, Charts)
4. [ ] Optimize third-party library imports
5. [ ] Add dynamic imports for rarely-used features

**Estimated effort:** 8-12 hours

### Priority 2: State Management Optimization

**Tasks:**

1. [ ] Profile React renders with React DevTools
2. [ ] Add React.memo to expensive components
3. [ ] Implement virtualization for long lists
4. [ ] Add useDeferredValue for search inputs
5. [ ] Consider migrating to Jotai for atomic updates

**Estimated effort:** 8-12 hours

### Priority 3: Caching & Data Fetching

**Tasks:**

1. [ ] Implement React Query for API caching
2. [ ] Add optimistic updates for mutations
3. [ ] Implement background data refresh
4. [ ] Add stale-while-revalidate patterns
5. [ ] Cache WebSocket state for reconnection

**Estimated effort:** 12-16 hours

---

## Phase 11: Analytics & Observability

### Priority 1: User Analytics

**Tasks:**

1. [ ] Integrate privacy-respecting analytics (Plausible/Fathom)
2. [ ] Track key user journeys (chat, voice, export)
3. [ ] Measure feature adoption rates
4. [ ] Track error rates and user friction points
5. [ ] Create analytics dashboard

**Estimated effort:** 8-12 hours

### Priority 2: Error Monitoring

**Tasks:**

1. [ ] Configure Sentry error boundaries
2. [ ] Add custom error context (user, conversation)
3. [ ] Set up performance monitoring
4. [ ] Create alerting rules for critical errors
5. [ ] Implement user feedback collection

**Estimated effort:** 6-8 hours

### Priority 3: Voice Mode Metrics

**Tasks:**

1. [ ] Track STT latency end-to-end
2. [ ] Measure voice session duration
3. [ ] Track reconnection frequency
4. [ ] Monitor audio quality metrics
5. [ ] Create voice mode health dashboard

**Estimated effort:** 8-12 hours

---

## Phase 12: Accessibility & Compliance

### Priority 1: WCAG 2.1 AA Compliance

**Tasks:**

1. [ ] Run automated accessibility audit (axe-core)
2. [ ] Fix all critical/serious accessibility issues
3. [ ] Ensure proper focus management
4. [ ] Add skip links and landmarks
5. [ ] Test with screen readers (VoiceOver, NVDA)

**Estimated effort:** 12-16 hours

### Priority 2: Keyboard Navigation

**Tasks:**

1. [ ] Complete keyboard shortcut coverage
2. [ ] Add focus trapping for modals
3. [ ] Implement roving tabindex for lists
4. [ ] Add keyboard hints/overlays
5. [ ] Create accessibility preferences panel

**Estimated effort:** 8-12 hours

---

## Recommended Implementation Order

### Near-term (Next 2-4 weeks)

1. **Phase 8.1**: Fix test failures and CI issues
2. **Phase 8.3**: Admin dashboard enhancements
3. **Phase 10.1**: Bundle optimization

### Medium-term (1-2 months)

1. **Phase 9.2**: Mobile responsiveness & PWA
2. **Phase 8.2**: Complete offline voice capture
3. **Phase 11.2**: Error monitoring setup

### Long-term (3+ months)

1. **Phase 9.1**: Multi-language support
2. **Phase 9.3**: Enhanced voice features
3. **Phase 12.1**: WCAG compliance audit

---

## Technical Debt to Address

1. **Type safety**: Many `any` types in test files and utils
2. **Console warnings**: React Router future flags, deprecated APIs
3. **Test coverage**: Some components lack tests
4. **Documentation**: JSDoc comments incomplete
5. **Dependency updates**: Some packages outdated

---

## Key Metrics to Track

- **Performance**: Time to Interactive (TTI) < 3s
- **Test Coverage**: > 80% for hooks, > 60% for components
- **Accessibility**: 0 critical WCAG violations
- **Bundle Size**: < 500KB gzipped
- **Error Rate**: < 0.1% of sessions with errors

---

## Resources Needed

- **Developer time**: ~200-300 hours for all phases
- **Design support**: For i18n, mobile, accessibility
- **Infrastructure**: Analytics service, error monitoring
- **Testing**: Real device testing for PWA/mobile

---

_Last updated: November 26, 2025_
_Based on VoiceAssist main branch at commit f189a73_
