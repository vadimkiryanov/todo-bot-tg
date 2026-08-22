# Сборка статики Svelte (web/dist)
FROM node:22-alpine AS build

WORKDIR /web

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ .
RUN npm run build

# Раздача статики + прокси /api → api:8080
FROM caddy:2-alpine

COPY --from=build /web/dist /srv
COPY web/Caddyfile /etc/caddy/Caddyfile
