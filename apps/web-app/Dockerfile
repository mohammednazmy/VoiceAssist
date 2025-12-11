# Multi-stage build for VoiceAssist web app
FROM node:20-alpine AS builder
WORKDIR /workspace
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Disable PWA service worker generation inside the Docker builder image to
# avoid workbox-related build issues. PWA/offline support is considered
# nice-to-have and remains enabled for local builds.
ENV DISABLE_PWA_SW=true
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps ./apps
COPY packages ./packages
# Remove production API URLs so app uses relative paths (window.location.origin)
RUN sed -i '/VITE_API_URL/d' apps/web-app/.env.production && \
    sed -i '/VITE_WS_URL/d' apps/web-app/.env.production
RUN pnpm install --frozen-lockfile && \
    # Copy Silero/ONNX assets into the web app public directory so they are
    # served statically from the final nginx image. These paths are referenced
    # via VITE_SILERO_ONNX_WASM_BASE_URL and VITE_SILERO_VAD_ASSET_BASE_URL.
    mkdir -p apps/web-app/public/vendor/onnxruntime-web/dist && \
    cp -R apps/web-app/node_modules/onnxruntime-web/dist/* apps/web-app/public/vendor/onnxruntime-web/dist/ && \
    mkdir -p apps/web-app/public/vendor/silero-vad && \
    cp -R apps/web-app/node_modules/@ricky0123/vad-web/dist/* apps/web-app/public/vendor/silero-vad/ && \
    pnpm --filter voiceassist-web build

FROM nginx:stable-alpine
WORKDIR /usr/share/nginx/html
COPY --from=builder /workspace/apps/web-app/dist .
COPY <<'NGINX_CONF' /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    include /etc/nginx/mime.types;

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
