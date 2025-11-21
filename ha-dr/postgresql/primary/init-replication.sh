#!/bin/bash
# PostgreSQL Primary Server Replication Initialization (Phase 12 - HA/DR)

set -e

echo "Initializing replication on primary server..."

# Create replication user (if not exists)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create replication user
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'replicator') THEN
            CREATE ROLE replicator WITH REPLICATION PASSWORD '${POSTGRES_PASSWORD}' LOGIN;
        END IF;
    END
    \$\$;

    -- Grant necessary permissions
    GRANT CONNECT ON DATABASE $POSTGRES_DB TO replicator;

    -- Create replication slot for replica
    SELECT pg_create_physical_replication_slot('replica_slot');
EOSQL

# Create WAL archive directory
mkdir -p /var/lib/postgresql/wal_archive
chown postgres:postgres /var/lib/postgresql/wal_archive

echo "Primary server replication initialization complete."
echo "Replication slot 'replica_slot' created."
echo "Replication user 'replicator' created."
