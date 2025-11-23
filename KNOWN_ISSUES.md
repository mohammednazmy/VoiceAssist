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

**Test Assertion Failures (12 tests):**

- Various tests in `RegisterFlow.test.tsx` (6 failures)
- `LoginFlow.test.tsx` (1 failure)
- `MessageInput.test.tsx` (5 failures)

**Cause**: Real test logic issues (e.g., elements not found, assertions don't match implementation)
**Impact**: Tests fail but provide useful feedback
**Fix Needed**: Update test assertions or fix component behavior

#### Test Infrastructure Status

- ✅ ESLint configured and working
- ✅ Vitest installed and configured
- ✅ Testing Library dependencies installed
- ✅ Test files exist (`src/__tests__/**/*.test.tsx`)
- ✅ Test setup file configured (`src/test/setup.ts`)
- ✅ **Tests run successfully with jsdom 24.1.3**
- ✅ 106 tests passing, 12 failing (real failures, not infrastructure)

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
