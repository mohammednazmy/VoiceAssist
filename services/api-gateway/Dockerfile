# Use specific Python version with security patches (Bookworm/Debian 12)
FROM python:3.11.10-slim-bookworm

# Set working directory
WORKDIR /app

# Install system dependencies with security updates
# hadolint ignore=DL3008
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    gcc \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ app/

# Copy Alembic configuration
COPY alembic.ini .
COPY alembic/ alembic/

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh

# Create non-root user and set permissions
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app && \
    chmod +x /docker-entrypoint.sh

USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the application using entrypoint script
# Supports WS_COMPRESSION_ENABLED env var for WebSocket compression
ENTRYPOINT ["/docker-entrypoint.sh"]
