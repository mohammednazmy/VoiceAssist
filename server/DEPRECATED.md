# Deprecated Backend Stub

The code in this `server/` folder was an early V2 stub (minimal FastAPI app, toy RAG/tooling). The production-ready backend is in `services/api-gateway/`, which carries the authoritative API surface, migrations, resilience, observability, and auth stack.

Actions:

- Do not extend or deploy `server/`.
- Migrate any missing ideas/tests into `services/api-gateway` as needed, then delete this folder.
- Point all tooling, CI, and docs at `services/api-gateway` only.
