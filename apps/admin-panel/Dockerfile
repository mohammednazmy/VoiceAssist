# Multi-stage build for VoiceAssist admin panel
FROM node:20-alpine AS builder
WORKDIR /workspace
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile && pnpm --filter voiceassist-admin build

FROM nginx:stable-alpine
WORKDIR /usr/share/nginx/html
COPY --from=builder /workspace/apps/admin-panel/dist .
COPY <<'NGINX_CONF' /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000" always;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX_CONF
