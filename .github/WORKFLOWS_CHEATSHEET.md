# GitHub Actions Workflows - Quick Reference

## Workflow Triggers

| Workflow | Auto Trigger | Manual Trigger | Schedule |
|----------|--------------|----------------|----------|
| CI Pipeline | Push, PR | ❌ | ❌ |
| Security Scan | Push, PR | ✅ | Daily 2 AM |
| Build & Deploy | Push to main/develop | ✅ | ❌ |
| Terraform Plan | PR with infra changes | ❌ | ❌ |
| Terraform Apply | Push to main | ✅ | ❌ |

## Common Commands

### Run Manual Workflow
```bash
# Via GitHub CLI
gh workflow run build-deploy.yml -f environment=staging

# Via web interface
Actions > Select workflow > Run workflow
```

### Check Workflow Status
```bash
# List recent runs
gh run list --workflow=ci.yml --limit 5

# View specific run
gh run view RUN_ID

# Watch run in real-time
gh run watch RUN_ID
```

### Cancel Running Workflow
```bash
gh run cancel RUN_ID
```

### Download Artifacts
```bash
gh run download RUN_ID
```

## Environment Deployment Map

| Branch | Environment | Auto Deploy | Approval Required |
|--------|-------------|-------------|-------------------|
| develop | staging | ✅ | ❌ |
| main | production | ✅ | ✅ (2 approvers) |
| feature/* | - | ❌ | - |

## Deployment Process

### Deploy to Staging
```bash
1. Create PR to develop
2. Wait for CI to pass
3. Merge PR
4. Auto-deploys to staging
5. Run post-deployment tests
```

### Deploy to Production
```bash
1. Create PR from develop to main
2. Wait for CI to pass
3. Get 2 approvals
4. Merge PR
5. Approve deployment in Actions
6. Auto-deploys to production
7. Monitor deployment
```

## Infrastructure Changes

### Staging Changes
```bash
1. Modify infrastructure/terraform/**
2. Create PR
3. Review terraform plan in PR comments
4. Merge PR
5. Workflow applies to staging (no approval)
```

### Production Changes
```bash
1. Modify infrastructure/terraform/**
2. Create PR to main
3. Review terraform plan carefully
4. Merge PR
5. Manual workflow dispatch or wait for auto-trigger
6. Approve production-infrastructure deployment
7. Verify infrastructure
```

## Security Scan Results

### Check Latest Scan
```bash
# Via CLI
gh run list --workflow=security-scan.yml --limit 1

# View security alerts
gh api /repos/OWNER/REPO/code-scanning/alerts
```

### View Security Reports
```
Actions > Security Scan > Latest run > Artifacts
- bandit-security-report
- safety-dependency-report
- gitleaks-report
```

## Debugging Workflows

### View Logs
```bash
# List jobs in a run
gh run view RUN_ID

# View job logs
gh run view RUN_ID --log

# Download logs
gh run download RUN_ID
```

### Re-run Failed Jobs
```bash
# Re-run failed jobs only
gh run rerun RUN_ID --failed

# Re-run entire workflow
gh run rerun RUN_ID
```

## Common Failures & Fixes

### Lint Failures
```bash
# Fix locally
pre-commit run --all-files

# Auto-fix most issues
black services/
isort services/
```

### Test Failures
```bash
# Run tests locally
cd services/api-gateway
pytest tests/unit/ -v

# With coverage
pytest tests/unit/ --cov=app
```

### Build Failures
```bash
# Test Docker build locally
docker build -t test services/api-gateway

# Check Dockerfile
hadolint services/api-gateway/Dockerfile
```

### Deployment Failures
```bash
# Check deployment status
kubectl get deployments -n voiceassist-staging
kubectl describe deployment voiceassist-api -n voiceassist-staging

# View pod logs
kubectl logs -f deployment/voiceassist-api -n voiceassist-staging

# Rollback if needed
kubectl rollout undo deployment/voiceassist-api -n voiceassist-staging
```

## Workflow Files Location

```
.github/
├── workflows/
│   ├── ci.yml                    # Main CI pipeline
│   ├── security-scan.yml         # Security scanning
│   ├── build-deploy.yml          # Build and deployment
│   ├── terraform-plan.yml        # Terraform planning
│   ├── terraform-apply.yml       # Terraform apply
│   └── README.md                 # Detailed documentation
├── ISSUE_TEMPLATE/
│   ├── bug_report.md
│   ├── feature_request.md
│   └── security_issue.md
├── pull_request_template.md
├── dependabot.yml
├── SETUP_GUIDE.md
└── WORKFLOWS_CHEATSHEET.md       # This file
```

## Secrets Reference

### Required
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `GITHUB_TOKEN` (auto-provided)

### Optional
- `CODECOV_TOKEN` - Code coverage
- `SNYK_TOKEN` - Snyk scanning
- `INFRACOST_API_KEY` - Cost estimation
- `SLACK_WEBHOOK_URL` - Notifications
- `GITLEAKS_LICENSE` - Gitleaks Pro

## Useful GitHub CLI Commands

### Setup
```bash
# Install GitHub CLI
brew install gh  # macOS
apt install gh   # Ubuntu

# Authenticate
gh auth login
```

### Common Operations
```bash
# Create PR
gh pr create --title "Fix bug" --body "Description"

# List PRs
gh pr list

# Check PR status
gh pr checks

# Merge PR
gh pr merge --auto --squash

# View Actions
gh workflow list
gh workflow view ci.yml

# Enable workflow
gh workflow enable ci.yml

# Disable workflow
gh workflow disable ci.yml
```

## Monitoring & Metrics

### Key Metrics to Watch
- **Build Time**: Should be < 10 minutes
- **Test Success Rate**: Should be > 95%
- **Deployment Frequency**: Track via GitHub Insights
- **Lead Time**: PR creation to production deploy
- **MTTR**: Mean time to recovery from failures

### Where to Check
```bash
# Workflow insights
Actions > Workflows > Select workflow > View metrics

# Via API
gh api /repos/OWNER/REPO/actions/workflows/ci.yml/timing
```

## Quick Links

- [Actions Dashboard](https://github.com/YOUR_ORG/VoiceAssist/actions)
- [Security Alerts](https://github.com/YOUR_ORG/VoiceAssist/security)
- [Dependabot](https://github.com/YOUR_ORG/VoiceAssist/security/dependabot)
- [Code Scanning](https://github.com/YOUR_ORG/VoiceAssist/security/code-scanning)
- [Environments](https://github.com/YOUR_ORG/VoiceAssist/settings/environments)

## Emergency Procedures

### Rollback Deployment
```bash
# Staging
kubectl rollout undo deployment/voiceassist-api -n voiceassist-staging

# Production (use blue-green)
kubectl patch service voiceassist-api -n voiceassist-production \
  -p '{"spec":{"selector":{"version":"blue"}}}'
```

### Disable Auto-Deploy
```bash
# Temporarily disable workflow
gh workflow disable build-deploy.yml

# Re-enable when ready
gh workflow enable build-deploy.yml
```

### Force Terraform Unlock
```bash
# If state is locked
cd infrastructure/terraform
terraform force-unlock LOCK_ID
```

## Best Practices

✅ **DO:**
- Always run pre-commit hooks before pushing
- Review Terraform plans carefully
- Test in staging first
- Monitor deployments
- Keep secrets up to date
- Review security scans regularly

❌ **DON'T:**
- Skip CI checks
- Deploy directly to production
- Ignore security warnings
- Commit secrets to code
- Disable workflows without reason
- Force-push to protected branches

## Need Help?

1. Check workflow logs first
2. Review documentation in `.github/workflows/README.md`
3. Check setup guide: `.github/SETUP_GUIDE.md`
4. Search existing issues
5. Ask in #devops Slack channel
6. Create an issue with logs and context
