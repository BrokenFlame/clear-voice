# ── Stage 1: Build Angular ────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY audio-portal-ui/package*.json ./
RUN npm ci --ignore-scripts

COPY audio-portal-ui/ ./
RUN npm run build -- --configuration=production

# ── Stage 2: nginx ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

RUN addgroup -S clearvoice && adduser -S -G clearvoice clearvoice

# SPA-friendly nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/audio-portal-ui/browser /usr/share/nginx/html

# Nginx needs to write to these dirs; chown so non-root can
RUN chown -R clearvoice:clearvoice /usr/share/nginx/html \
    /var/cache/nginx /var/log/nginx /etc/nginx/conf.d

USER clearvoice
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
