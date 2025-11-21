#!/bin/bash
# PostgreSQL Replica Server Setup (Phase 12 - HA/DR)

set -e

echo "Setting up PostgreSQL replica server..."

# Wait for primary to be ready
until pg_isready -h postgres-primary -p 5432 -U voiceassist; do
    echo "Waiting for primary server to be ready..."
    sleep 2
done

echo "Primary server is ready. Starting replica setup..."

# Check if data directory is empty (first run)
if [ -z "$(ls -A /var/lib/postgresql/data)" ]; then
    echo "Data directory is empty. Performing base backup from primary..."

    # Perform base backup from primary using pg_basebackup
    pg_basebackup \
        -h postgres-primary \
        -p 5432 \
        -U replicator \
        -D /var/lib/postgresql/data \
        -Fp \
        -Xs \
        -P \
        -R \
        --slot=replica_slot

    echo "Base backup complete."

    # Create standby signal file to indicate this is a replica
    touch /var/lib/postgresql/data/standby.signal

    echo "Replica setup complete. Server will start in standby mode."
else
    echo "Data directory is not empty. Assuming replica is already configured."
fi
