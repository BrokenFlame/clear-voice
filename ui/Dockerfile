# ── Stage 1: Build Angular ────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Trust corporate MITM CA used in enterprise networks (e.g. Zscaler)
COPY docker/certs/zscaler-root-ca.crt /usr/local/share/ca-certificates/zscaler-root-ca.crt
RUN apk add --no-cache ca-certificates && update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/zscaler-root-ca.crt

COPY audio-portal-ui/package*.json ./
RUN npm ci --ignore-scripts

COPY audio-portal-ui/ ./
RUN npm run build -- --configuration=production

# ── Stage 2: nginx ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache gettext
RUN addgroup -S clearvoice && adduser -S -G clearvoice clearvoice

# SPA-friendly nginx config
COPY ui/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/audio-portal-ui/browser /usr/share/nginx/html
COPY ui/env.template.js /usr/share/nginx/html/env.template.js
COPY ui/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Nginx needs to write to these dirs; chown so non-root can
RUN chown -R clearvoice:clearvoice /usr/share/nginx/html \
    /var/cache/nginx /var/log/nginx /etc/nginx/conf.d /tmp /run /var/run

USER clearvoice
EXPOSE 8080

CMD ["/docker-entrypoint.sh"]
