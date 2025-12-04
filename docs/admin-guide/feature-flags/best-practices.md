---
title: Feature Flag Best Practices
status: stable
lastUpdated: 2025-12-04
audience: [developers, admin, ai-agents]
category: feature-flags
owner: backend
summary: Guidelines for effective feature flag usage
---

# Feature Flag Best Practices

## When to Use Feature Flags

### Good Use Cases

| Scenario | Example |
|----------|---------|
| Gradual rollout | `ui.new_chat_interface` at 10% -> 50% -> 100% |
| A/B testing | `experiment.onboarding_v2` for conversion testing |
| Kill switches | `ops.disable_heavy_rag` during incidents |
| Beta features | `ui.beta_voice_mode` for early adopters |
| Infrastructure migration | `backend.use_new_db_cluster` |

### Avoid Feature Flags For

- **Configuration** - Use environment variables or config files
- **Permanent toggles** - If it won't be removed, it's not a flag
- **Authorization** - Use proper RBAC, not flags
- **A/B tests without metrics** - Flags without tracking waste effort

## Design Principles

### 1. Keep Flags Short-Lived

```
Target: Remove flag within 2-4 sprints after 100% rollout
```

Long-lived flags accumulate tech debt. Set `removeBy` dates.

### 2. Minimize Flag Dependencies

```typescript
// Bad - nested flags create complexity
if (flags['ui.new_layout'] && flags['ui.dark_mode'] && flags['backend.v2']) {
  // Hard to test all combinations
}

// Good - independent flags
if (flags['ui.new_layout']) {
  renderNewLayout();
}
```

### 3. Default to Off

```typescript
// Good - safe default (ui.experimental_feature)
experimental_feature: { default: false }

// Bad - risky default
experimental_feature: { default: true }
```

### 4. Document Thoroughly

Every flag needs:
- Clear description
- Owner team/person
- JIRA ticket reference
- Expected removal date

### 5. Test Both States

```typescript
describe('VoicePanel', () => {
  it('renders old UI when flag is off', () => {
    mockFlag('ui.new_voice_panel', false);
    // assertions
  });

  it('renders new UI when flag is on', () => {
    mockFlag('ui.new_voice_panel', true);
    // assertions
  });
});
```

## Cleanup Strategies

### Regular Audits

Run monthly:
```bash
npm run flags:audit
```

Reports:
- Flags at 100% > 14 days (candidates for removal)
- Flags deprecated > 30 days (overdue removal)
- Orphan flags (no code references)

### Removal Checklist

- [ ] All code paths using flag removed
- [ ] Tests updated to not mock the flag
- [ ] Flag definition removed from `featureFlags.ts`
- [ ] Redis state cleaned up
- [ ] Documentation updated
- [ ] Admin panel verified (no stale entries)

## Operational Guidelines

### Emergency Disabling

If a flagged feature causes issues:

1. Navigate to Admin Panel > Feature Flags
2. Set flag to `false` (production)
3. Verify rollback
4. Create incident ticket

Or via API:
```bash
curl -X POST https://assist.asimo.io/api/flags/ui.problem_feature \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"enabled": false}'
```

### Percentage Rollouts

Recommended progression:
```
1% -> 5% -> 10% -> 25% -> 50% -> 100%
```

Wait 24-48 hours between increases. Monitor:
- Error rates
- Performance metrics
- User feedback

### Monitoring Integration

All flag changes emit metrics:
```
voiceassist_flag_evaluation{flag="ui.new_layout",result="true"} 1234
voiceassist_flag_evaluation{flag="ui.new_layout",result="false"} 5678
```

View in Grafana: Dashboard > Feature Flags

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Flag soup (too many) | Regular cleanup, flag budget per sprint |
| Stale flags | Automated cleanup alerts |
| Untested flag states | CI requires both-state tests |
| Missing documentation | Pre-commit hooks validate docs |
| Flag dependencies | Architectural review for cross-flag logic |
