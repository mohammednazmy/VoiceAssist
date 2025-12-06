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
RUN pnpm install --frozen-lockfile && pnpm --filter docs-site build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /workspace/apps/docs-site/.next/standalone ./
COPY --from=builder /workspace/apps/docs-site/.next/static ./apps/docs-site/.next/static
COPY --from=builder /workspace/apps/docs-site/public ./apps/docs-site/public
ENV PORT=3001
EXPOSE 3001
CMD ["node", "apps/docs-site/server.js"]
