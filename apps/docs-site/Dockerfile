# Multi-stage build for VoiceAssist docs site (Next.js standalone)
FROM node:20-alpine AS builder
WORKDIR /workspace
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps ./apps
COPY packages ./packages
COPY docs ./docs
# Build static export (Next.js output: export)
RUN pnpm install --frozen-lockfile && pnpm --filter docs-site build

FROM nginx:stable-alpine
WORKDIR /usr/share/nginx/html
# Serve the static export produced in /out
COPY --from=builder /workspace/apps/docs-site/out ./
EXPOSE 80
