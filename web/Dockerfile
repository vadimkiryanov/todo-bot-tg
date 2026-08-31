# Сборка статики Svelte (web/dist)
FROM node:22-alpine AS build

WORKDIR /web

# VITE_TG_LOGIN — username Telegram-бота для виджета входа (пусто — вход скрыт)
ARG VITE_TG_LOGIN
ENV VITE_TG_LOGIN=$VITE_TG_LOGIN

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ .
RUN npm run build

# Раздача статики + прокси /api → api:8080
FROM caddy:2-alpine

COPY --from=build /web/build /srv
COPY web/Caddyfile /etc/caddy/Caddyfile
