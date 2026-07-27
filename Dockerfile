FROM golang:1.23-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /todobot ./cmd/bot/

FROM alpine:3.20

ENV TZ=Europe/Moscow
RUN apk --no-cache add ca-certificates postgresql-client tzdata

COPY --from=builder /todobot /todobot

ENTRYPOINT ["/todobot"]
