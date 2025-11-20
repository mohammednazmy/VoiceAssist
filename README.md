# VoiceAssist V2 - Enterprise Medical AI Assistant

**Status:** Phase 0 Complete - Ready for Development
**Architecture:** Microservices with Docker Compose (migrating to Kubernetes later)
**Compliance:** HIPAA-compliant with zero-trust security

## Quick Start

```bash
# 1. Ensure Docker Desktop is running
docker ps

# 2. Copy environment file and add your OpenAI API key
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# 3. Start services (after Phase 1)
docker compose up -d

# 4. Check status
docker compose ps

# 5. View logs
docker compose logs -f

# 6. Stop services
docker compose down
```

## Project Structure

```
VoiceAssist/
├── services/              # Microservices
│   ├── api-gateway/
│   ├── voice-proxy/
│   ├── medical-kb/
│   ├── admin-api/
│   ├── auth-service/
│   └── ...
├── web-apps/             # React frontends
│   ├── client/
│   ├── admin/
│   └── docs/
├── infrastructure/        # IaC and configs
│   ├── docker/
│   ├── kubernetes/
│   ├── terraform/
│   └── ansible/
├── docs/                 # Documentation
│   ├── phases/           # Phase documents
│   ├── ARCHITECTURE_V2.md
│   └── ...
├── docker-compose.yml    # Main compose file
├── .env                  # Environment variables (not in git)
└── CURRENT_PHASE.md      # Track development progress
```

## Development Workflow

### Check Current Phase

```bash
cat CURRENT_PHASE.md
```

### Start a Phase

```bash
# Read the phase document
cat docs/phases/PHASE_XX_NAME.md

# Implement the phase
# ... (follow phase instructions)

# Update progress
vim CURRENT_PHASE.md

# Commit when done
git add .
git commit -m "Phase X: Description"
```

### Access Services (once running)

- Nextcloud: https://nextcloud.local
- API Gateway: https://api.voiceassist.local
- Admin Panel: https://admin.voiceassist.local
- Grafana: https://grafana.voiceassist.local:3000
- Prometheus: https://prometheus.voiceassist.local:9090

## Documentation

- **Start Here:** `docs/START_HERE.md`
- **Architecture:** `docs/ARCHITECTURE_V2.md`
- **Development Phases:** `docs/DEVELOPMENT_PHASES_V2.md`
- **Security:** `docs/SECURITY_COMPLIANCE.md`
- **Current Phase:** `CURRENT_PHASE.md`
- **Enhancement Summary:** `docs/ENHANCEMENT_SUMMARY.md`

## Key Features

- 🎤 **Web-based voice assistant** with dynamic clarifications
- 🏥 **Advanced medical AI** (BioGPT, PubMedBERT, UpToDate, OpenEvidence)
- 🔐 **Zero-trust security** with HIPAA compliance
- 📚 **Medical knowledge base** with RAG
- 🔗 **Nextcloud integration** for SSO and file management
- 📊 **Full observability** (Prometheus, Grafana, Jaeger)
- 🐳 **Docker Compose** for development
- ☸️ **Kubernetes-ready** for production

## Development Status

**Current Phase:** Phase 0 (Complete)
**Next Phase:** Phase 1 - Core Infrastructure & Database Setup

See `CURRENT_PHASE.md` for detailed status.

## License

Personal/Internal Use
