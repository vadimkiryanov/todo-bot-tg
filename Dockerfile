FROM golang:1.23-alpine AS builder

WORKDIR /app

COPY . .
RUN CGO_ENABLED=0 go build -mod=vendor -ldflags="-s -w" -o /todobot .

FROM scratch

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /todobot /todobot

ENTRYPOINT ["/todobot"]
