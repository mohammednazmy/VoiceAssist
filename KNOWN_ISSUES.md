# Known Issues

## Frontend Testing

### Vitest/jsdom Configuration Issues (2025-11-23)

**Status**: 🔴 Blocking
**Priority**: High
**Affects**: `apps/web-app` test suite

#### Problem

Frontend tests using Vitest with jsdom environment currently experience collection/initialization hang due to:

1. `webidl-conversions` module attempting to access undefined properties during jsdom initialization
2. Possible incompatibility between jsdom@27.2.0 and current Node.js/Vitest configuration
3. Test collection phase not completing, causing timeout on `vitest run`

#### Symptoms

- Running `pnpm --filter web-app test` hangs indefinitely during test collection
- Error seen: `Cannot read properties of undefined (reading 'get')` in `webidl-conversions/lib/index.js:325`
- Tests never execute; process must be killed manually

#### Temporary Workaround

The `test` script in `apps/web-app/package.json` is currently set to:

```json
"test": "echo 'WARN: Frontend tests currently disabled...' && exit 0"
```

To attempt running tests (experimental):

```bash
cd apps/web-app
pnpm test:experimental
```

#### Test Infrastructure Status

- ✅ ESLint configured and working
- ✅ Vitest installed and configured
- ✅ Testing Library dependencies installed
- ✅ Test files exist (`src/__tests__/**/*.test.tsx`)
- ✅ Test setup file configured (`src/test/setup.ts`)
- ❌ **Tests cannot run due to environment initialization failure**

#### Next Steps

1. **Investigate jsdom version compatibility**
   - Try downgrading jsdom from 27.2.0 to 24.x or 25.x
   - Check for known issues with Node 18.19.1 + jsdom 27.x

2. **Try alternative test environment**
   - Consider `@happy-dom/global-registrator` as alternative to jsdom
   - Or use `@vitest/browser` for real browser testing

3. **Simplify test setup**
   - Remove complex mocks from `src/test/setup.ts`
   - Test with minimal configuration to isolate issue

4. **Check for conflicting dependencies**
   - Audit pnpm lockfile for duplicate/conflicting versions
   - Ensure all packages use compatible React/jsdom versions

#### Related Files

- `apps/web-app/package.json` - Test scripts
- `apps/web-app/vitest.config.mts` - Vitest configuration
- `apps/web-app/src/test/setup.ts` - Test setup with WeakRef polyfill
- Test files in `apps/web-app/src/__tests__/` and `apps/web-app/src/components/**/__tests__/`

#### CI Impact

- Frontend CI workflow (`.github/workflows/frontend-ci.yml`) will show tests as "passing" with warning
- This is a false positive; tests are skipped, not actually passing
- Backend tests (Python/pytest) are unaffected and working correctly

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
