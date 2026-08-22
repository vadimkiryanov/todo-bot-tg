FROM golang:1.25-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /todobot ./cmd/bot/
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /todoapi ./cmd/api/

# --- Telegram-бот (cmd/bot) ---
FROM alpine:3.20 AS bot

ENV TZ=Europe/Moscow
RUN apk --no-cache add ca-certificates postgresql-client tzdata

COPY --from=builder /todobot /todobot

ENTRYPOINT ["/todobot"]

# --- REST API (cmd/api) ---
FROM alpine:3.20 AS api

ENV TZ=Europe/Moscow
RUN apk --no-cache add ca-certificates postgresql-client tzdata

COPY --from=builder /todoapi /todoapi

ENTRYPOINT ["/todoapi"]
