---
title: Feature Flag Best Practices
status: stable
lastUpdated: 2025-12-04
audience: [developers, ai-agents]
category: feature-flags
owner: backend
summary: Guidelines for effective feature flag usage
ai_summary: Keep flags temporary (remove after stable rollout). Use descriptive names. Start with 10% rollouts. Always have rollback plan. Review flags quarterly. Document in code and commit messages.
component: "backend/api-gateway"
relatedPaths:
  - "services/api-gateway/app/services/feature_flag_service.py"
  - "packages/types/src/featureFlags.ts"
---

# Feature Flag Best Practices

## 1. Keep Flags Temporary

Feature flags should be **temporary**, not permanent configuration:

```typescript
// GOOD: Temporary rollout flag
experiment.new_checkout_flow; // Remove after 100% rollout

// BAD: Permanent config disguised as flag
backend.database_url; // Should be env var
```

**Rule**: If a flag will never be removed, it's configuration, not a feature flag.

## 2. Use Descriptive Names

Names should clearly indicate what the flag controls:

```typescript
// GOOD: Clear purpose
ui.compact_message_list;
backend.streaming_responses_v2;
ops.circuit_breaker_openai;

// BAD: Vague or abbreviated
ui.new_thing;
backend.v2;
ops.cb;
```

## 3. Start Small with Rollouts

Never go from 0% to 100% in one step:

```
Day 1:  10% - Monitor errors and performance
Day 2:  25% - Check user feedback
Day 3:  50% - Validate at scale
Day 4:  75% - Final verification
Day 5: 100% - Full rollout
```

## 4. Always Have a Rollback Plan

Before enabling any flag:

1. Document the disable procedure
2. Test that disabling works
3. Know who can disable in emergency
4. Set up monitoring alerts

## 5. Review Flags Quarterly

Schedule quarterly reviews:

- [ ] Remove flags at 100% for 30+ days
- [ ] Archive deprecated flags
- [ ] Update documentation
- [ ] Clean up unused code paths

## 6. Document in Code

```typescript
/**
 * Feature flag: experiment.voice_streaming
 *
 * Purpose: Enable real-time voice streaming
 * Created: 2025-12-01
 * Owner: @voice-team
 * Rollout: 25% as of 2025-12-04
 * Remove after: Stable at 100% for 2 sprints
 */
if (await featureGate("experiment.voice_streaming")) {
  // New streaming implementation
}
```

## 7. Use Feature Flags for Risk, Not Laziness

**Good uses:**

- Risky changes that need gradual rollout
- Features that might need quick rollback
- A/B testing with clear metrics
- Operational controls (maintenance, rate limiting)

**Bad uses:**

- Avoiding proper code review
- Keeping dead code "just in case"
- Configuration that never changes
- Avoiding proper deployment processes

## 8. Monitor Flag Performance

Track for each flag:

- Error rate (enabled vs disabled)
- Latency impact
- User engagement metrics
- Memory/CPU impact
