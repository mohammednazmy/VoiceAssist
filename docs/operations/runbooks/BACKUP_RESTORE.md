# Backup & Restore Runbook

**Last Updated**: 2025-11-21 (Phase 7 - P3.2)
**Purpose**: Comprehensive guide for backup and restore operations in VoiceAssist V2

---

## Backup Strategy Overview

### Backup Schedule

| Component | Frequency | Retention | Method |
|-----------|-----------|-----------|--------|
| **PostgreSQL Database** | Every 6 hours | 30 days | pg_dump + automated snapshots |
| **Redis Cache** | Daily | 7 days | RDB snapshots |
| **Qdrant Vectors** | Daily | 14 days | Collection snapshots |
| **Configuration Files** | On change | 90 days | Git + encrypted backups |
| **Application Logs** | Hourly | 30 days | Log aggregation |
| **Docker Volumes** | Weekly | 30 days | Volume snapshots |

### Backup Storage Locations

```bash
# Default backup directory structure
/backups/
├── postgres/
│   ├── daily/
│   ├── weekly/
│   └── monthly/
├── redis/
├── qdrant/
├── config/
├── volumes/
└── logs/
```

---

## PostgreSQL Database Backup

### Full Database Backup

```bash
# Create timestamped backup
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/postgres/daily"

# Ensure backup directory exists
mkdir -p $BACKUP_DIR

# Full database dump
docker compose exec -T postgres pg_dump \
  -U voiceassist \
  -d voiceassist \
  -F c \
  -b \
  -v \
  -f /tmp/voiceassist_${BACKUP_DATE}.dump

# Copy from container to host
docker compose cp postgres:/tmp/voiceassist_${BACKUP_DATE}.dump \
  ${BACKUP_DIR}/voiceassist_${BACKUP_DATE}.dump

# Verify backup
ls -lh ${BACKUP_DIR}/voiceassist_${BACKUP_DATE}.dump

# Expected output: File size should be > 0 bytes
```

### Compressed SQL Backup

```bash
# SQL format with compression
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/postgres/daily"

mkdir -p $BACKUP_DIR

# Create compressed SQL dump
docker compose exec -T postgres pg_dump \
  -U voiceassist \
  -d voiceassist \
  --clean \
  --if-exists \
  --verbose \
  | gzip > ${BACKUP_DIR}/voiceassist_${BACKUP_DATE}.sql.gz

# Verify backup
ls -lh ${BACKUP_DIR}/voiceassist_${BACKUP_DATE}.sql.gz
gunzip -t ${BACKUP_DIR}/voiceassist_${BACKUP_DATE}.sql.gz && echo "✓ Backup file is valid"
```

### Schema-Only Backup

```bash
# Backup schema structure only (useful for development)
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)

docker compose exec -T postgres pg_dump \
  -U voiceassist \
  -d voiceassist \
  --schema-only \
  --no-owner \
  --no-acl \
  > /backups/postgres/schema_${BACKUP_DATE}.sql

echo "Schema backup completed: schema_${BACKUP_DATE}.sql"
```

### Table-Specific Backup

```bash
# Backup specific tables
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
TABLES="users conversations messages"

for TABLE in $TABLES; do
  echo "Backing up table: $TABLE"
  docker compose exec -T postgres pg_dump \
    -U voiceassist \
    -d voiceassist \
    -t $TABLE \
    --data-only \
    | gzip > /backups/postgres/table_${TABLE}_${BACKUP_DATE}.sql.gz
done

echo "Table backups completed"
```

### Automated Backup Script

```bash
#!/bin/bash
# Save as: /usr/local/bin/va-backup-postgres

set -e

BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/postgres"
DAILY_DIR="${BACKUP_DIR}/daily"
WEEKLY_DIR="${BACKUP_DIR}/weekly"
MONTHLY_DIR="${BACKUP_DIR}/monthly"
LOG_FILE="${BACKUP_DIR}/backup.log"

# Ensure directories exist
mkdir -p $DAILY_DIR $WEEKLY_DIR $MONTHLY_DIR

# Function to log messages
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a $LOG_FILE
}

log "Starting PostgreSQL backup"

# Daily backup
log "Creating daily backup"
docker compose exec -T postgres pg_dump \
  -U voiceassist \
  -d voiceassist \
  -F c \
  -b \
  | gzip > ${DAILY_DIR}/voiceassist_${BACKUP_DATE}.dump.gz

if [ $? -eq 0 ]; then
    log "Daily backup completed: ${BACKUP_DATE}.dump.gz"
    BACKUP_SIZE=$(du -h ${DAILY_DIR}/voiceassist_${BACKUP_DATE}.dump.gz | cut -f1)
    log "Backup size: ${BACKUP_SIZE}"
else
    log "ERROR: Daily backup failed"
    exit 1
fi

# Weekly backup (every Sunday)
if [ $(date +%u) -eq 7 ]; then
    log "Creating weekly backup"
    cp ${DAILY_DIR}/voiceassist_${BACKUP_DATE}.dump.gz \
       ${WEEKLY_DIR}/voiceassist_week_$(date +%Y%U).dump.gz
    log "Weekly backup created"
fi

# Monthly backup (first day of month)
if [ $(date +%d) -eq 01 ]; then
    log "Creating monthly backup"
    cp ${DAILY_DIR}/voiceassist_${BACKUP_DATE}.dump.gz \
       ${MONTHLY_DIR}/voiceassist_$(date +%Y%m).dump.gz
    log "Monthly backup created"
fi

# Cleanup old daily backups (keep 30 days)
log "Cleaning up old daily backups"
find ${DAILY_DIR} -name "voiceassist_*.dump.gz" -mtime +30 -delete

# Cleanup old weekly backups (keep 12 weeks)
find ${WEEKLY_DIR} -name "voiceassist_week_*.dump.gz" -mtime +84 -delete

# Cleanup old monthly backups (keep 12 months)
find ${MONTHLY_DIR} -name "voiceassist_*.dump.gz" -mtime +365 -delete

log "Backup process completed successfully"
```

### Backup Verification

```bash
# Verify backup integrity
BACKUP_FILE="/backups/postgres/daily/voiceassist_20251121_120000.dump.gz"

# Check file exists and size
if [ -f "$BACKUP_FILE" ]; then
    echo "✓ Backup file exists"
    ls -lh $BACKUP_FILE
else
    echo "✗ Backup file not found"
    exit 1
fi

# Test extraction
gunzip -t $BACKUP_FILE
if [ $? -eq 0 ]; then
    echo "✓ Backup file is not corrupted"
else
    echo "✗ Backup file is corrupted"
    exit 1
fi

# Test restore to temporary database (recommended)
echo "Testing restore to temporary database..."
docker compose exec -T postgres psql -U voiceassist -c "CREATE DATABASE test_restore;"
gunzip -c $BACKUP_FILE | docker compose exec -T postgres pg_restore \
  -U voiceassist \
  -d test_restore \
  --verbose

if [ $? -eq 0 ]; then
    echo "✓ Backup restore test successful"
    docker compose exec -T postgres psql -U voiceassist -c "DROP DATABASE test_restore;"
else
    echo "✗ Backup restore test failed"
    docker compose exec -T postgres psql -U voiceassist -c "DROP DATABASE IF EXISTS test_restore;"
    exit 1
fi
```

---

## PostgreSQL Database Restore

### Pre-Restore Checklist

- [ ] Verify backup file integrity
- [ ] Ensure sufficient disk space
- [ ] Notify all users of maintenance
- [ ] Stop application services
- [ ] Create a backup of current database (before restore)
- [ ] Document current state

### Full Database Restore

```bash
# Stop application to prevent connections
docker compose stop voiceassist-server

# Verify no active connections
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "SELECT count(*) FROM pg_stat_activity WHERE datname = 'voiceassist' AND pid != pg_backend_pid();"

# Terminate active connections if any
docker compose exec postgres psql -U voiceassist -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
   WHERE datname = 'voiceassist' AND pid != pg_backend_pid();"

# Drop and recreate database
docker compose exec postgres psql -U voiceassist -d postgres <<EOF
DROP DATABASE IF EXISTS voiceassist;
CREATE DATABASE voiceassist OWNER voiceassist;
EOF

# Restore from custom format dump
BACKUP_FILE="/backups/postgres/daily/voiceassist_20251121_120000.dump.gz"

gunzip -c $BACKUP_FILE | docker compose exec -T postgres pg_restore \
  -U voiceassist \
  -d voiceassist \
  --verbose \
  --no-owner \
  --no-acl

# Verify restore
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public';"

# Restart application
docker compose start voiceassist-server

echo "Database restore completed"
```

### Restore from SQL Dump

```bash
# For plain SQL dumps
BACKUP_FILE="/backups/postgres/daily/voiceassist_20251121_120000.sql.gz"

# Stop application
docker compose stop voiceassist-server

# Restore SQL
gunzip -c $BACKUP_FILE | docker compose exec -T postgres psql \
  -U voiceassist \
  -d voiceassist

# Restart application
docker compose start voiceassist-server
```

### Point-in-Time Recovery (PITR)

```bash
# Requires WAL archiving to be enabled in PostgreSQL configuration

# 1. Stop database
docker compose stop postgres

# 2. Replace data directory with base backup
BACKUP_DIR="/backups/postgres/base"
DATA_DIR="/var/lib/docker/volumes/voiceassist_postgres_data/_data"

# Backup current data
mv $DATA_DIR ${DATA_DIR}.backup_$(date +%Y%m%d_%H%M%S)

# Restore base backup
cp -r $BACKUP_DIR $DATA_DIR

# 3. Create recovery configuration
cat > ${DATA_DIR}/recovery.conf <<EOF
restore_command = 'cp /backups/postgres/wal_archive/%f %p'
recovery_target_time = '2025-11-21 12:00:00'
EOF

# 4. Start PostgreSQL (will perform recovery)
docker compose start postgres

# 5. Monitor recovery
docker compose logs -f postgres | grep -i recovery
```

### Partial Restore (Single Table)

```bash
# Restore specific table from backup
TABLE_NAME="users"
BACKUP_FILE="/backups/postgres/table_users_20251121_120000.sql.gz"

# Drop existing table data
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "TRUNCATE TABLE ${TABLE_NAME} CASCADE;"

# Restore table
gunzip -c $BACKUP_FILE | docker compose exec -T postgres psql \
  -U voiceassist \
  -d voiceassist

# Verify
docker compose exec postgres psql -U voiceassist -d voiceassist -c \
  "SELECT COUNT(*) FROM ${TABLE_NAME};"
```

---

## Redis Backup

### Manual Redis Backup

```bash
# Trigger Redis save
docker compose exec redis redis-cli BGSAVE

# Wait for save to complete
docker compose exec redis redis-cli LASTSAVE

# Copy RDB file
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p /backups/redis

docker compose cp redis:/data/dump.rdb \
  /backups/redis/dump_${BACKUP_DATE}.rdb

# Verify backup
ls -lh /backups/redis/dump_${BACKUP_DATE}.rdb
```

### Automated Redis Backup Script

```bash
#!/bin/bash
# Save as: /usr/local/bin/va-backup-redis

set -e

BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/redis"
LOG_FILE="${BACKUP_DIR}/backup.log"

mkdir -p $BACKUP_DIR

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a $LOG_FILE
}

log "Starting Redis backup"

# Trigger background save
docker compose exec -T redis redis-cli BGSAVE > /dev/null

# Wait for save to complete (check every 2 seconds)
TIMEOUT=60
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
    STATUS=$(docker compose exec -T redis redis-cli LASTSAVE 2>/dev/null || echo "0")
    if [ ! -z "$STATUS" ]; then
        break
    fi
    sleep 2
    ELAPSED=$((ELAPSED + 2))
done

# Copy RDB file
docker compose cp redis:/data/dump.rdb \
  ${BACKUP_DIR}/dump_${BACKUP_DATE}.rdb

if [ $? -eq 0 ]; then
    log "Redis backup completed: dump_${BACKUP_DATE}.rdb"
    BACKUP_SIZE=$(du -h ${BACKUP_DIR}/dump_${BACKUP_DATE}.rdb | cut -f1)
    log "Backup size: ${BACKUP_SIZE}"
else
    log "ERROR: Redis backup failed"
    exit 1
fi

# Cleanup old backups (keep 7 days)
find ${BACKUP_DIR} -name "dump_*.rdb" -mtime +7 -delete
log "Cleanup completed"

log "Redis backup process completed successfully"
```

### Redis Restore

```bash
# Stop Redis
docker compose stop redis

# Replace RDB file
BACKUP_FILE="/backups/redis/dump_20251121_120000.rdb"

docker compose cp $BACKUP_FILE redis:/data/dump.rdb

# Start Redis (will load from dump.rdb)
docker compose start redis

# Verify data loaded
docker compose exec redis redis-cli DBSIZE

echo "Redis restore completed"
```

---

## Qdrant Vector Database Backup

### Create Qdrant Snapshot

```bash
# Create snapshot for specific collection
COLLECTION_NAME="voice_embeddings"
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/qdrant"

mkdir -p $BACKUP_DIR

# Create snapshot via API
SNAPSHOT_NAME=$(curl -X POST \
  "http://localhost:6333/collections/${COLLECTION_NAME}/snapshots" \
  | jq -r '.result.name')

echo "Snapshot created: $SNAPSHOT_NAME"

# Download snapshot
curl -X GET \
  "http://localhost:6333/collections/${COLLECTION_NAME}/snapshots/${SNAPSHOT_NAME}" \
  -o ${BACKUP_DIR}/${COLLECTION_NAME}_${BACKUP_DATE}.snapshot

# Verify backup
ls -lh ${BACKUP_DIR}/${COLLECTION_NAME}_${BACKUP_DATE}.snapshot
```

### Backup All Qdrant Collections

```bash
#!/bin/bash
# Save as: /usr/local/bin/va-backup-qdrant

set -e

BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/qdrant"
LOG_FILE="${BACKUP_DIR}/backup.log"

mkdir -p $BACKUP_DIR

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a $LOG_FILE
}

log "Starting Qdrant backup"

# Get all collections
COLLECTIONS=$(curl -s http://localhost:6333/collections | jq -r '.result.collections[].name')

if [ -z "$COLLECTIONS" ]; then
    log "No collections found"
    exit 0
fi

# Backup each collection
for COLLECTION in $COLLECTIONS; do
    log "Backing up collection: $COLLECTION"

    # Create snapshot
    SNAPSHOT_NAME=$(curl -s -X POST \
      "http://localhost:6333/collections/${COLLECTION}/snapshots" \
      | jq -r '.result.name')

    if [ ! -z "$SNAPSHOT_NAME" ] && [ "$SNAPSHOT_NAME" != "null" ]; then
        # Download snapshot
        curl -s -X GET \
          "http://localhost:6333/collections/${COLLECTION}/snapshots/${SNAPSHOT_NAME}" \
          -o ${BACKUP_DIR}/${COLLECTION}_${BACKUP_DATE}.snapshot

        log "Backup completed: ${COLLECTION}_${BACKUP_DATE}.snapshot"
        BACKUP_SIZE=$(du -h ${BACKUP_DIR}/${COLLECTION}_${BACKUP_DATE}.snapshot | cut -f1)
        log "Backup size: ${BACKUP_SIZE}"

        # Delete remote snapshot to save space
        curl -s -X DELETE \
          "http://localhost:6333/collections/${COLLECTION}/snapshots/${SNAPSHOT_NAME}" \
          > /dev/null
    else
        log "ERROR: Failed to create snapshot for $COLLECTION"
    fi
done

# Cleanup old backups (keep 14 days)
find ${BACKUP_DIR} -name "*.snapshot" -mtime +14 -delete
log "Cleanup completed"

log "Qdrant backup process completed successfully"
```

### Qdrant Restore

```bash
# Stop Qdrant
docker compose stop qdrant

# Clear existing data (optional, for full restore)
docker compose exec qdrant rm -rf /qdrant/storage/*

# Start Qdrant
docker compose start qdrant

# Wait for Qdrant to be ready
sleep 5

# Restore each collection
COLLECTION_NAME="voice_embeddings"
BACKUP_FILE="/backups/qdrant/voice_embeddings_20251121_120000.snapshot"

# Upload snapshot
curl -X POST \
  "http://localhost:6333/collections/${COLLECTION_NAME}/snapshots/upload" \
  -H "Content-Type: multipart/form-data" \
  -F "snapshot=@${BACKUP_FILE}"

# Verify collection restored
curl -s http://localhost:6333/collections/${COLLECTION_NAME} | jq '.result'

echo "Qdrant restore completed"
```

---

## Configuration Files Backup

### Backup Configuration

```bash
#!/bin/bash
# Save as: /usr/local/bin/va-backup-config

set -e

BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/config"
PROJECT_DIR="/Users/mohammednazmy/VoiceAssist"

mkdir -p $BACKUP_DIR

echo "Starting configuration backup"

# Create tarball of configuration files
tar -czf ${BACKUP_DIR}/config_${BACKUP_DATE}.tar.gz \
  -C $PROJECT_DIR \
  .env \
  docker-compose.yml \
  docker-compose.override.yml \
  alembic.ini \
  pyproject.toml \
  --exclude='.git' \
  --exclude='__pycache__'

# Encrypt backup (recommended for sensitive configs)
if command -v gpg &> /dev/null; then
    gpg --symmetric --cipher-algo AES256 \
      -o ${BACKUP_DIR}/config_${BACKUP_DATE}.tar.gz.gpg \
      ${BACKUP_DIR}/config_${BACKUP_DATE}.tar.gz

    # Remove unencrypted version
    rm ${BACKUP_DIR}/config_${BACKUP_DATE}.tar.gz
    echo "Configuration backup encrypted: config_${BACKUP_DATE}.tar.gz.gpg"
else
    echo "Configuration backup created: config_${BACKUP_DATE}.tar.gz"
    echo "WARNING: Backup is not encrypted. Consider installing gpg."
fi

# Cleanup old backups (keep 90 days)
find ${BACKUP_DIR} -name "config_*.tar.gz*" -mtime +90 -delete

echo "Configuration backup completed"
```

### Restore Configuration

```bash
# For encrypted backups
BACKUP_FILE="/backups/config/config_20251121_120000.tar.gz.gpg"
PROJECT_DIR="/Users/mohammednazmy/VoiceAssist"

# Decrypt and extract
gpg --decrypt $BACKUP_FILE | tar -xzf - -C $PROJECT_DIR

# For unencrypted backups
BACKUP_FILE="/backups/config/config_20251121_120000.tar.gz"
tar -xzf $BACKUP_FILE -C $PROJECT_DIR

echo "Configuration restored"
```

---

## Docker Volumes Backup

### Backup Docker Volumes

```bash
#!/bin/bash
# Save as: /usr/local/bin/va-backup-volumes

set -e

BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/volumes"

mkdir -p $BACKUP_DIR

echo "Starting Docker volumes backup"

# List of volumes to backup
VOLUMES=(
  "voiceassist_postgres_data"
  "voiceassist_redis_data"
  "voiceassist_qdrant_storage"
)

for VOLUME in "${VOLUMES[@]}"; do
    echo "Backing up volume: $VOLUME"

    # Create tarball of volume
    docker run --rm \
      -v ${VOLUME}:/source:ro \
      -v ${BACKUP_DIR}:/backup \
      alpine \
      tar -czf /backup/${VOLUME}_${BACKUP_DATE}.tar.gz -C /source .

    if [ $? -eq 0 ]; then
        echo "Backup completed: ${VOLUME}_${BACKUP_DATE}.tar.gz"
        BACKUP_SIZE=$(du -h ${BACKUP_DIR}/${VOLUME}_${BACKUP_DATE}.tar.gz | cut -f1)
        echo "Backup size: ${BACKUP_SIZE}"
    else
        echo "ERROR: Backup failed for $VOLUME"
    fi
done

# Cleanup old backups (keep 30 days)
find ${BACKUP_DIR} -name "*.tar.gz" -mtime +30 -delete

echo "Docker volumes backup completed"
```

### Restore Docker Volumes

```bash
# Stop services
docker compose down

# Restore specific volume
VOLUME_NAME="voiceassist_postgres_data"
BACKUP_FILE="/backups/volumes/voiceassist_postgres_data_20251121_120000.tar.gz"

# Remove existing volume (WARNING: destructive)
docker volume rm $VOLUME_NAME

# Create new volume
docker volume create $VOLUME_NAME

# Restore data
docker run --rm \
  -v ${VOLUME_NAME}:/target \
  -v $(dirname $BACKUP_FILE):/backup \
  alpine \
  tar -xzf /backup/$(basename $BACKUP_FILE) -C /target

echo "Volume $VOLUME_NAME restored"

# Start services
docker compose up -d
```

---

## Disaster Recovery

### Complete System Backup

```bash
#!/bin/bash
# Save as: /usr/local/bin/va-backup-full

set -e

BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_ROOT="/backups"
DR_DIR="${BACKUP_ROOT}/disaster_recovery"

mkdir -p $DR_DIR

echo "============================================"
echo "Starting Full System Backup for DR"
echo "Date: $(date)"
echo "============================================"

# Stop application (keep databases running)
docker compose stop voiceassist-server

# 1. Backup PostgreSQL
echo "[1/5] Backing up PostgreSQL..."
/usr/local/bin/va-backup-postgres

# 2. Backup Redis
echo "[2/5] Backing up Redis..."
/usr/local/bin/va-backup-redis

# 3. Backup Qdrant
echo "[3/5] Backing up Qdrant..."
/usr/local/bin/va-backup-qdrant

# 4. Backup Configuration
echo "[4/5] Backing up Configuration..."
/usr/local/bin/va-backup-config

# 5. Backup Docker Volumes
echo "[5/5] Backing up Docker Volumes..."
/usr/local/bin/va-backup-volumes

# Create DR manifest
cat > ${DR_DIR}/manifest_${BACKUP_DATE}.txt <<EOF
VoiceAssist V2 Disaster Recovery Backup
========================================
Date: $(date)
Backup ID: ${BACKUP_DATE}

Components Backed Up:
- PostgreSQL Database
- Redis Cache
- Qdrant Vector Database
- Configuration Files
- Docker Volumes

Backup Locations:
- PostgreSQL: ${BACKUP_ROOT}/postgres/daily/
- Redis: ${BACKUP_ROOT}/redis/
- Qdrant: ${BACKUP_ROOT}/qdrant/
- Config: ${BACKUP_ROOT}/config/
- Volumes: ${BACKUP_ROOT}/volumes/

Backup Sizes:
$(du -sh ${BACKUP_ROOT}/postgres/daily/voiceassist_${BACKUP_DATE}* 2>/dev/null || echo "PostgreSQL: N/A")
$(du -sh ${BACKUP_ROOT}/redis/dump_${BACKUP_DATE}.rdb 2>/dev/null || echo "Redis: N/A")
$(du -sh ${BACKUP_ROOT}/qdrant/*_${BACKUP_DATE}.snapshot 2>/dev/null || echo "Qdrant: N/A")
$(du -sh ${BACKUP_ROOT}/config/config_${BACKUP_DATE}.tar.gz* 2>/dev/null || echo "Config: N/A")

Total Backup Size:
$(du -sh ${BACKUP_ROOT} | cut -f1)

Verification Status:
- PostgreSQL: $(test -f ${BACKUP_ROOT}/postgres/daily/voiceassist_${BACKUP_DATE}* && echo "✓" || echo "✗")
- Redis: $(test -f ${BACKUP_ROOT}/redis/dump_${BACKUP_DATE}.rdb && echo "✓" || echo "✗")
- Config: $(test -f ${BACKUP_ROOT}/config/config_${BACKUP_DATE}.tar.gz* && echo "✓" || echo "✗")

Restore Command:
/usr/local/bin/va-restore-full ${BACKUP_DATE}
EOF

# Create compressed archive of entire backup
echo "Creating DR archive..."
tar -czf ${DR_DIR}/voiceassist_dr_${BACKUP_DATE}.tar.gz \
  -C ${BACKUP_ROOT} \
  postgres/daily \
  redis \
  qdrant \
  config \
  volumes

# Restart application
docker compose start voiceassist-server

echo "============================================"
echo "Full System Backup Completed"
echo "Manifest: ${DR_DIR}/manifest_${BACKUP_DATE}.txt"
echo "Archive: ${DR_DIR}/voiceassist_dr_${BACKUP_DATE}.tar.gz"
echo "============================================"

cat ${DR_DIR}/manifest_${BACKUP_DATE}.txt
```

### Complete System Restore

```bash
#!/bin/bash
# Save as: /usr/local/bin/va-restore-full

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <backup_date>"
    echo "Example: $0 20251121_120000"
    exit 1
fi

BACKUP_DATE=$1
BACKUP_ROOT="/backups"

echo "============================================"
echo "Starting Full System Restore"
echo "Backup Date: ${BACKUP_DATE}"
echo "============================================"

# Verify manifest exists
MANIFEST="${BACKUP_ROOT}/disaster_recovery/manifest_${BACKUP_DATE}.txt"
if [ ! -f "$MANIFEST" ]; then
    echo "ERROR: Manifest not found: $MANIFEST"
    exit 1
fi

echo "Manifest found. Displaying backup details:"
cat $MANIFEST
echo ""

read -p "Do you want to proceed with restore? This will OVERWRITE all data (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled"
    exit 0
fi

# Stop all services
echo "Stopping services..."
docker compose down

# 1. Restore PostgreSQL
echo "[1/5] Restoring PostgreSQL..."
POSTGRES_BACKUP="${BACKUP_ROOT}/postgres/daily/voiceassist_${BACKUP_DATE}.dump.gz"
if [ -f "$POSTGRES_BACKUP" ]; then
    docker compose up -d postgres
    sleep 10

    docker compose exec postgres psql -U voiceassist -d postgres -c \
      "DROP DATABASE IF EXISTS voiceassist;"
    docker compose exec postgres psql -U voiceassist -d postgres -c \
      "CREATE DATABASE voiceassist OWNER voiceassist;"

    gunzip -c $POSTGRES_BACKUP | docker compose exec -T postgres pg_restore \
      -U voiceassist \
      -d voiceassist \
      --verbose \
      --no-owner \
      --no-acl

    echo "✓ PostgreSQL restored"
else
    echo "✗ PostgreSQL backup not found"
fi

# 2. Restore Redis
echo "[2/5] Restoring Redis..."
REDIS_BACKUP="${BACKUP_ROOT}/redis/dump_${BACKUP_DATE}.rdb"
if [ -f "$REDIS_BACKUP" ]; then
    docker compose stop redis
    docker compose cp $REDIS_BACKUP redis:/data/dump.rdb
    docker compose start redis
    sleep 5
    echo "✓ Redis restored"
else
    echo "✗ Redis backup not found"
fi

# 3. Restore Qdrant
echo "[3/5] Restoring Qdrant..."
docker compose up -d qdrant
sleep 10

for SNAPSHOT in ${BACKUP_ROOT}/qdrant/*_${BACKUP_DATE}.snapshot; do
    if [ -f "$SNAPSHOT" ]; then
        COLLECTION=$(basename $SNAPSHOT | sed "s/_${BACKUP_DATE}.snapshot//")
        echo "Restoring collection: $COLLECTION"

        curl -X POST \
          "http://localhost:6333/collections/${COLLECTION}/snapshots/upload" \
          -H "Content-Type: multipart/form-data" \
          -F "snapshot=@${SNAPSHOT}"

        echo "✓ Collection $COLLECTION restored"
    fi
done

# 4. Restore Configuration
echo "[4/5] Restoring Configuration..."
CONFIG_BACKUP="${BACKUP_ROOT}/config/config_${BACKUP_DATE}.tar.gz"
CONFIG_BACKUP_ENC="${CONFIG_BACKUP}.gpg"

if [ -f "$CONFIG_BACKUP_ENC" ]; then
    gpg --decrypt $CONFIG_BACKUP_ENC | tar -xzf - -C /Users/mohammednazmy/VoiceAssist
    echo "✓ Configuration restored (encrypted)"
elif [ -f "$CONFIG_BACKUP" ]; then
    tar -xzf $CONFIG_BACKUP -C /Users/mohammednazmy/VoiceAssist
    echo "✓ Configuration restored"
else
    echo "✗ Configuration backup not found"
fi

# 5. Start all services
echo "[5/5] Starting all services..."
docker compose up -d

# Wait for services to be ready
echo "Waiting for services to be ready..."
sleep 30

# Verify system health
echo ""
echo "============================================"
echo "Restore Completed - Verifying System Health"
echo "============================================"

curl -s http://localhost:8000/health | jq '.'
docker compose ps

echo ""
echo "Full system restore completed"
echo "Please verify all functionality before resuming operations"
```

### Disaster Recovery Scenarios

#### Scenario 1: Complete Hardware Failure

```bash
# On NEW hardware:

# 1. Install Docker and Docker Compose
# 2. Clone repository
git clone <repository_url> /Users/mohammednazmy/VoiceAssist
cd /Users/mohammednazmy/VoiceAssist

# 3. Copy DR archive from backup location
scp backup-server:/backups/disaster_recovery/voiceassist_dr_YYYYMMDD_HHMMSS.tar.gz /tmp/

# 4. Extract DR archive
mkdir -p /backups
tar -xzf /tmp/voiceassist_dr_YYYYMMDD_HHMMSS.tar.gz -C /backups

# 5. Run full restore
/usr/local/bin/va-restore-full YYYYMMDD_HHMMSS

# 6. Verify and resume operations
```

#### Scenario 2: Data Corruption

```bash
# 1. Stop application
docker compose stop voiceassist-server

# 2. Create backup of corrupted data (for analysis)
/usr/local/bin/va-backup-full

# 3. Identify last known good backup
ls -lh /backups/disaster_recovery/manifest_*.txt

# 4. Restore from last good backup
/usr/local/bin/va-restore-full YYYYMMDD_HHMMSS

# 5. Verify data integrity
# Run data validation scripts

# 6. Resume operations
docker compose start voiceassist-server
```

#### Scenario 3: Accidental Data Deletion

```bash
# Restore specific component only (faster than full restore)

# For deleted PostgreSQL table/data:
BACKUP_FILE="/backups/postgres/daily/voiceassist_20251121_120000.dump.gz"
# Use table-specific restore procedure

# For deleted Redis data:
# Use Redis restore procedure

# For deleted Qdrant collection:
# Use Qdrant restore procedure
```

---

## Backup Monitoring

### Backup Health Check

```bash
#!/bin/bash
# Save as: /usr/local/bin/va-backup-health

BACKUP_ROOT="/backups"
ALERT_EMAIL="ops-team@voiceassist.local"

echo "Backup Health Check - $(date)"
echo "========================================"

# Check PostgreSQL backups
LATEST_PG=$(find ${BACKUP_ROOT}/postgres/daily -name "*.dump.gz" -mtime -1 | wc -l)
if [ $LATEST_PG -eq 0 ]; then
    echo "⚠️  WARNING: No PostgreSQL backup in last 24 hours"
else
    echo "✓ PostgreSQL backups are current"
fi

# Check Redis backups
LATEST_REDIS=$(find ${BACKUP_ROOT}/redis -name "*.rdb" -mtime -1 | wc -l)
if [ $LATEST_REDIS -eq 0 ]; then
    echo "⚠️  WARNING: No Redis backup in last 24 hours"
else
    echo "✓ Redis backups are current"
fi

# Check Qdrant backups
LATEST_QDRANT=$(find ${BACKUP_ROOT}/qdrant -name "*.snapshot" -mtime -1 | wc -l)
if [ $LATEST_QDRANT -eq 0 ]; then
    echo "⚠️  WARNING: No Qdrant backup in last 24 hours"
else
    echo "✓ Qdrant backups are current"
fi

# Check disk space
DISK_USAGE=$(df -h ${BACKUP_ROOT} | tail -1 | awk '{print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
    echo "⚠️  WARNING: Backup disk usage at ${DISK_USAGE}%"
else
    echo "✓ Backup disk space is adequate (${DISK_USAGE}%)"
fi

# Check backup sizes
echo ""
echo "Backup Sizes:"
echo "PostgreSQL: $(du -sh ${BACKUP_ROOT}/postgres | cut -f1)"
echo "Redis: $(du -sh ${BACKUP_ROOT}/redis | cut -f1)"
echo "Qdrant: $(du -sh ${BACKUP_ROOT}/qdrant | cut -f1)"
echo "Config: $(du -sh ${BACKUP_ROOT}/config | cut -f1)"
echo "Total: $(du -sh ${BACKUP_ROOT} | cut -f1)"
```

---

## Related Documentation

- [Deployment Runbook](./DEPLOYMENT.md)
- [Incident Response Runbook](./INCIDENT_RESPONSE.md)
- [Troubleshooting Runbook](./TROUBLESHOOTING.md)
- [Monitoring Runbook](./MONITORING.md)
- [UNIFIED_ARCHITECTURE.md](../../UNIFIED_ARCHITECTURE.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-21
**Maintained By**: VoiceAssist DevOps Team
**Review Cycle**: Quarterly or after each disaster recovery event
**Next Review**: 2026-02-21
