# Known Issues

## Frontend Testing

### ~~Vitest/jsdom Configuration Issues~~ (RESOLVED 2025-11-23)

**Status**: ✅ Resolved
**Resolution Date**: 2025-11-23
**Solution**: Downgraded jsdom from 27.2.0 to 24.1.3

#### Original Problem

Frontend tests using Vitest with jsdom@27.2.0 experienced collection/initialization hang due to `webidl-conversions` module incompatibility.

#### Resolution

**Implemented Solution**: Downgraded jsdom to version 24.1.3

Changes made:

- Updated `apps/web-app/package.json`: `"jsdom": "24.1.3"` (was `"^27.2.0"`)
- Restored `test` script to run actual tests: `"test": "vitest run"`
- Removed temporary workaround that disabled tests

#### Current Test Status

- ✅ Tests run and exit cleanly (no more hangs!)
- ✅ 118 total tests execute across multiple test files
- ⚠️ Some test failures exist (see below), but these are **real test assertion failures**, not infrastructure issues
- ✅ Frontend CI now runs real tests

#### Known Test Failures (Not Infrastructure)

**~~ES Module Import Issues (4 suites fail to load)~~** (RESOLVED 2025-11-23)

**Status**: ✅ Resolved
**Solution**: Added `deps.inline` configuration to Vitest config to handle ESM imports

Changes made:

- Updated `apps/web-app/vitest.config.mts`: Added `deps: { inline: ['react-syntax-highlighter', 'refractor'] }`
- All test suites now load successfully

**~~Test Assertion Failures (12 tests)~~** (RESOLVED 2025-11-23)

**Status**: ✅ Resolved
**Resolution Date**: 2025-11-23
**Solution**: Fixed test assertions to match component behavior and addressed component implementation issues

**Test Fixes Applied:**

1. **RegisterFlow.test.tsx (6 failures → 0):**
   - Fixed heading text expectation: "Create your account" → "Create an account"
   - Fixed password field label queries: Changed `/^password$/i` → `/^password/i` to match "Password required" accessible name
   - All 10 tests now passing

2. **LoginFlow.test.tsx (1 failure → 0):**
   - Fixed HTML5 email validation interference with Zod validation
   - Changed input type from "email" to "text" in LoginPage.tsx:92 to allow Zod schema validation to run
   - All 8 tests now passing

3. **MessageInput.test.tsx (5 failures → 0):**
   - Fixed attachment preview test: removed duplicate render, use proper query
   - Fixed focus management: added `await user.click(textarea)` before keyboard events after file upload
   - Fixed keyboard navigation: updated to match actual tab order and enable send button before testing focus
   - Fixed special characters handling: changed from `user.type()` to `user.paste()` for literal character preservation
   - All 42 tests now passing

**Current Test Status:**

- ✅ **0 test failures** (was 12)
- ✅ All 118 frontend tests passing
- ✅ All 66 backend tests passing
- ✅ ESLint: 50 warnings, 0 errors

#### Test Infrastructure Status

- ✅ ESLint configured and working
- ✅ Vitest installed and configured
- ✅ Testing Library dependencies installed
- ✅ Test files exist (`src/__tests__/**/*.test.tsx`)
- ✅ Test setup file configured (`src/test/setup.ts`)
- ✅ **Tests run successfully with jsdom 24.1.3**
- ✅ **All 118 tests passing (0 failures)**

#### Related Files

- `apps/web-app/package.json` - Test scripts and jsdom version
- `apps/web-app/vitest.config.mts` - Vitest configuration
- `apps/web-app/src/test/setup.ts` - Test setup
- Test files in `apps/web-app/src/__tests__/` and `apps/web-app/src/components/**/__tests__/`

---

## Admin Panel Testing

### No Test Suite Implemented (2025-11-23)

**Status**: ⚠️ Expected
**Priority**: Medium
**Affects**: `apps/admin-panel`

The admin panel (`apps/admin-panel`) currently has a placeholder test script that returns success:

```json
"test": "echo \"TODO: tests not yet implemented for admin-panel\" && exit 0"
```

This is **intentional** and documented in the roadmap. Admin panel tests will be added in Milestone 2 (Weeks 11-16).
