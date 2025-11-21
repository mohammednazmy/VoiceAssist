#!/bin/bash
# mTLS Certificate Generation Script for VoiceAssist (Phase 11)
# Generates self-signed certificates for development and testing.
# For production, use cert-manager or AWS Certificate Manager.

set -euo pipefail

CERT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDITY_DAYS=365

echo "╔══════════════════════════════════════════════╗"
echo "║  VoiceAssist mTLS Certificate Generator     ║"
echo "║  Phase 11 - Security Hardening              ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Create directories
mkdir -p "$CERT_DIR"/{ca,api-gateway,redis,postgres,qdrant}

echo "[1/6] Generating CA (Certificate Authority)..."

# Generate CA private key
openssl genrsa -out "$CERT_DIR/ca/ca.key" 4096

# Generate CA certificate
openssl req -x509 -new -nodes \
  -key "$CERT_DIR/ca/ca.key" \
  -sha256 \
  -days $VALIDITY_DAYS \
  -out "$CERT_DIR/ca/ca.crt" \
  -subj "/C=US/ST=State/L=City/O=VoiceAssist/OU=Security/CN=VoiceAssist-CA"

echo "✓ CA certificate generated"

# Function to generate service certificate
generate_cert() {
    local service=$1
    local cn=$2
    local san=$3

    echo "[${4}/6] Generating certificate for ${service}..."

    # Generate private key
    openssl genrsa -out "$CERT_DIR/$service/$service.key" 2048

    # Create certificate signing request
    cat > "$CERT_DIR/$service/$service.cnf" <<EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
req_extensions = req_ext
distinguished_name = dn

[dn]
C=US
ST=State
L=City
O=VoiceAssist
OU=Services
CN=$cn

[req_ext]
subjectAltName = $san
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth, clientAuth
EOF

    # Generate CSR
    openssl req -new \
      -key "$CERT_DIR/$service/$service.key" \
      -out "$CERT_DIR/$service/$service.csr" \
      -config "$CERT_DIR/$service/$service.cnf"

    # Sign certificate with CA
    openssl x509 -req \
      -in "$CERT_DIR/$service/$service.csr" \
      -CA "$CERT_DIR/ca/ca.crt" \
      -CAkey "$CERT_DIR/ca/ca.key" \
      -CAcreateserial \
      -out "$CERT_DIR/$service/$service.crt" \
      -days $VALIDITY_DAYS \
      -sha256 \
      -extensions req_ext \
      -extfile "$CERT_DIR/$service/$service.cnf"

    # Create combined certificate chain
    cat "$CERT_DIR/$service/$service.crt" "$CERT_DIR/ca/ca.crt" \
      > "$CERT_DIR/$service/$service-chain.crt"

    echo "✓ Certificate for $service generated"
}

# Generate certificates for each service
generate_cert "api-gateway" "voiceassist-api" \
  "DNS:voiceassist-server,DNS:localhost,IP:127.0.0.1" 2

generate_cert "redis" "voiceassist-redis" \
  "DNS:redis,DNS:localhost,IP:127.0.0.1" 3

generate_cert "postgres" "voiceassist-postgres" \
  "DNS:postgres,DNS:localhost,IP:127.0.0.1" 4

generate_cert "qdrant" "voiceassist-qdrant" \
  "DNS:qdrant,DNS:localhost,IP:127.0.0.1" 5

echo ""
echo "[6/6] Setting permissions..."
chmod 600 "$CERT_DIR"/**/*.key
chmod 644 "$CERT_DIR"/**/*.crt
echo "✓ Permissions set"

echo ""
echo "═══════════════════════════════════════════════"
echo "  Certificates Generated Successfully!"
echo "═══════════════════════════════════════════════"
echo ""
echo "Certificate locations:"
echo "  CA Certificate:      $CERT_DIR/ca/ca.crt"
echo "  API Gateway:         $CERT_DIR/api-gateway/"
echo "  Redis:               $CERT_DIR/redis/"
echo "  PostgreSQL:          $CERT_DIR/postgres/"
echo "  Qdrant:              $CERT_DIR/qdrant/"
echo ""
echo "Next steps:"
echo "  1. Review certificates: openssl x509 -in $CERT_DIR/api-gateway/api-gateway.crt -text"
echo "  2. Update docker-compose.yml to use certificates"
echo "  3. Configure services to use mTLS"
echo "  4. For production: Use cert-manager or ACM"
echo ""
echo "⚠️  These are self-signed certificates for development only!"
echo "   Use proper CA-signed certificates in production."
echo ""
