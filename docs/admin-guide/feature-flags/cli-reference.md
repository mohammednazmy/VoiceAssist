---
title: Feature Flags CLI Reference
slug: admin-guide/feature-flags/cli-reference
status: stable
stability: production
lastUpdated: "2025-12-05"
audience:
  - admin
  - developers
  - devops
  - ai-agents
category: feature-flags
owner: backend
summary: Command-line interface reference for managing feature flags
component: "backend/api-gateway"
relatedPaths:
  - "services/api-gateway/scripts/init_feature_flags.py"
  - "services/api-gateway/app/api/admin_feature_flags.py"
ai_summary: >-
  CLI commands and Python scripts for feature flag management. Key script:
  init_feature_flags.py (--dry-run to preview, --force to recreate, --migrate for
  legacy names). Also covers curl-based API calls for listing, creating, updating,
  and toggling feature flags via the admin API.
---

# Feature Flags CLI Reference

This document covers command-line tools and API calls for managing feature flags.

## Python Scripts

### Initialize Feature Flags

The `init_feature_flags.py` script creates all flags from the shared definitions.

```bash
cd /path/to/VoiceAssist/services/api-gateway

# Preview what would be created (dry run)
python scripts/init_feature_flags.py --dry-run

# Initialize all flags (skips existing)
python scripts/init_feature_flags.py

# Force recreate all flags (WARNING: deletes existing!)
python scripts/init_feature_flags.py --force

# Initialize and migrate legacy flag names
python scripts/init_feature_flags.py --migrate
```

**Options:**

| Flag        | Description                                           |
| ----------- | ----------------------------------------------------- |
| `--dry-run` | Show what would be done without making changes        |
| `--force`   | Delete and recreate all flags (requires confirmation) |
| `--migrate` | Migrate legacy flag names to new dot-notation format  |

**Output Example:**

```
✅ Feature flag initialization complete!
==================================================
   Created: 15
   Skipped: 3
   Errors:  0
```

---

## REST API (curl)

All feature flag endpoints require admin authentication. Get a JWT token first:

```bash
# Get admin token
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "..."}' | jq -r '.access_token')
```

### List All Flags

```bash
curl -s http://localhost:8000/api/admin/feature-flags \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Filter by environment:**

```bash
curl -s "http://localhost:8000/api/admin/feature-flags?environment=production" \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Include archived flags:**

```bash
curl -s "http://localhost:8000/api/admin/feature-flags?include_archived=true" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Get Specific Flag

```bash
curl -s http://localhost:8000/api/admin/feature-flags/ui.voice_mode_enabled \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Create Flag

```bash
curl -s -X POST http://localhost:8000/api/admin/feature-flags \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "experiment.new_feature",
    "description": "Test new feature rollout",
    "flag_type": "boolean",
    "enabled": false,
    "default_value": false,
    "metadata": {
      "owner": "engineering",
      "criticality": "low"
    }
  }' | jq
```

### Update Flag

```bash
# Toggle enabled state
curl -s -X PATCH http://localhost:8000/api/admin/feature-flags/experiment.new_feature \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}' | jq

# Update description
curl -s -X PATCH http://localhost:8000/api/admin/feature-flags/experiment.new_feature \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description": "Updated description"}' | jq

# Set rollout percentage
curl -s -X PATCH http://localhost:8000/api/admin/feature-flags/experiment.new_feature \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rollout_percentage": 25}' | jq
```

### Toggle Flag (Quick)

```bash
curl -s -X POST http://localhost:8000/api/admin/feature-flags/ui.voice_mode_enabled/toggle \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Archive Flag (Soft Delete)

```bash
curl -s -X POST http://localhost:8000/api/admin/feature-flags/experiment.old_feature/archive \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Delete Flag (Permanent)

```bash
curl -s -X DELETE http://localhost:8000/api/admin/feature-flags/experiment.test_flag \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Update Variants (Multivariate Flags)

```bash
curl -s -X PUT http://localhost:8000/api/admin/feature-flags/experiment.pricing/variants \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "variants": [
      {"name": "control", "value": "standard", "weight": 50},
      {"name": "treatment_a", "value": "premium", "weight": 30},
      {"name": "treatment_b", "value": "freemium", "weight": 20}
    ]
  }' | jq
```

### Update Targeting Rules

```bash
curl -s -X PUT http://localhost:8000/api/admin/feature-flags/experiment.beta/targeting-rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "targeting_rules": {
      "rules": [
        {
          "id": "beta-users",
          "priority": 1,
          "conditions": [
            {
              "attribute": "userRole",
              "operator": "equals",
              "value": "beta_tester"
            }
          ],
          "resultEnabled": true
        }
      ],
      "defaultEnabled": false
    }
  }' | jq
```

---

## Automation Scripts

### Bulk Enable/Disable by Category

```bash
#!/bin/bash
# enable-category.sh - Enable all flags in a category

CATEGORY=$1
ENABLED=${2:-true}
TOKEN=$(cat ~/.voiceassist_token)
BASE_URL="http://localhost:8000/api/admin/feature-flags"

# Get all flags and filter by category
FLAGS=$(curl -s "$BASE_URL" -H "Authorization: Bearer $TOKEN" | \
  jq -r ".data.flags[] | select(.name | startswith(\"$CATEGORY.\")) | .name")

for flag in $FLAGS; do
  echo "Setting $flag enabled=$ENABLED"
  curl -s -X PATCH "$BASE_URL/$flag" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"enabled\": $ENABLED}" > /dev/null
done

echo "Done! Updated flags in category: $CATEGORY"
```

**Usage:**

```bash
./enable-category.sh experiment true   # Enable all experiment flags
./enable-category.sh experiment false  # Disable all experiment flags
```

### Export Flags to JSON

```bash
#!/bin/bash
# export-flags.sh - Export all flags to JSON backup

TOKEN=$(cat ~/.voiceassist_token)
OUTPUT="flags-backup-$(date +%Y%m%d).json"

curl -s http://localhost:8000/api/admin/feature-flags \
  -H "Authorization: Bearer $TOKEN" | jq '.data.flags' > "$OUTPUT"

echo "Exported flags to $OUTPUT"
```

### Import Flags from JSON

```bash
#!/bin/bash
# import-flags.sh - Import flags from JSON backup

INPUT=$1
TOKEN=$(cat ~/.voiceassist_token)
BASE_URL="http://localhost:8000/api/admin/feature-flags"

for flag in $(jq -c '.[]' "$INPUT"); do
  name=$(echo "$flag" | jq -r '.name')
  echo "Importing $name..."

  curl -s -X POST "$BASE_URL" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$flag" > /dev/null 2>&1 || \
  curl -s -X PATCH "$BASE_URL/$name" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$flag" > /dev/null
done

echo "Import complete!"
```

### Check Flag Status

```bash
#!/bin/bash
# check-flag.sh - Quick flag status check

FLAG=$1
TOKEN=$(cat ~/.voiceassist_token)

curl -s "http://localhost:8000/api/admin/feature-flags/$FLAG" \
  -H "Authorization: Bearer $TOKEN" | \
  jq '{name: .data.name, enabled: .data.enabled, type: .data.flag_type, value: .data.value}'
```

**Usage:**

```bash
./check-flag.sh ui.voice_mode_enabled
# Output: {"name": "ui.voice_mode_enabled", "enabled": true, "type": "boolean", "value": null}
```

---

## Testing Flag Definitions

### Run Sync Tests

Verify TypeScript and Python flag definitions are in sync:

```bash
cd /path/to/VoiceAssist/services/api-gateway

# Run all sync tests
pytest tests/test_flag_sync.py -v

# Run specific test
pytest tests/test_flag_sync.py::TestFlagSync::test_flag_names_match -v
```

**Test Output:**

```
tests/test_flag_sync.py::TestFlagSync::test_flag_names_match PASSED
tests/test_flag_sync.py::TestFlagSync::test_categories_match PASSED
tests/test_flag_sync.py::TestFlagSync::test_legacy_map_matches PASSED
...
======================== 14 passed in 0.42s ========================
```

### Validate Flag Definitions

```bash
# Check all flags follow naming convention
pytest tests/test_flag_sync.py::TestFlagSync::test_flag_naming_convention -v

# Verify all flags have descriptions
pytest tests/test_flag_sync.py::TestFlagSync::test_flag_descriptions_not_empty -v

# Check docs URLs are valid
pytest tests/test_flag_sync.py::TestFlagMetadata::test_docs_url_format -v
```

---

## Deprecation Warnings

### Python

When using deprecated flag names, warnings are logged:

```python
from app.core.flag_definitions import resolve_flag_name

# Using legacy name triggers deprecation warning
resolved = resolve_flag_name("rag_strategy")
# WARNING: Feature flag 'rag_strategy' is deprecated. Use 'backend.rag_strategy' instead.
```

### TypeScript

```typescript
import { resolveFlagName, isDeprecatedFlagName } from "@voiceassist/types";

// Check if name is deprecated
if (isDeprecatedFlagName("rag_strategy")) {
  console.warn("Please migrate to new flag name");
}

// Get new name with warning
const newName = resolveFlagName("rag_strategy", true);
// Console: [DEPRECATION] Feature flag 'rag_strategy' is deprecated...
```

---

## Environment Variables

| Variable                  | Default  | Description                        |
| ------------------------- | -------- | ---------------------------------- |
| `FEATURE_FLAGS_CACHE_TTL` | `300`    | Redis cache TTL in seconds         |
| `FEATURE_FLAGS_ENABLED`   | `true`   | Enable/disable feature flag system |
| `REDIS_URL`               | Required | Redis connection for flag caching  |

---

## Troubleshooting

### Flag Not Found

```bash
# Check if flag exists
curl -s http://localhost:8000/api/admin/feature-flags/backend.rag_strategy \
  -H "Authorization: Bearer $TOKEN" | jq '.success'

# If false, check available flags
curl -s http://localhost:8000/api/admin/feature-flags \
  -H "Authorization: Bearer $TOKEN" | jq '.data.flags[].name' | grep rag
```

### Cache Not Clearing

```bash
# Manually invalidate Redis cache
redis-cli -h redis DEL "feature_flag:ui.voice_mode_enabled"

# Or wait for TTL (default 5 minutes)
redis-cli -h redis TTL "feature_flag:ui.voice_mode_enabled"
```

### Auth Token Expired

```bash
# Refresh token
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\": \"$REFRESH_TOKEN\"}" | jq -r '.access_token')
```

---

## Related Documentation

- [Feature Flags Overview](./README.md)
- [Admin Panel Guide](./admin-panel-guide.md)
- [Backend Implementation](../../FEATURE_FLAGS.md)
- [Naming Conventions](./naming-conventions.md)
