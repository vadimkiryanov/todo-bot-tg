// Package session — веб-сессии: токен (32 байта base64url), SHA-256 хеш в хранилище.
//
// Клиенту выдаётся сырой токен (cookie), в БД хранится только его хеш,
// поэтому утечка БД не раскрывает действующие сессии.
package session

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"time"
)

// TTL — срок жизни сессии (план: 30 дней).
const TTL = 30 * 24 * time.Hour

// Store — хранилище сессий. Реализации: MemoryStore, PostgresStore.
// Потребители (middleware, HTTP-handler) сужают его до нужных методов
// собственными интерфейсами.
type Store interface {
	Create(sess Session) error
	Get(tokenHash string) (Session, error)
	Delete(tokenHash string) error
}

// Session — веб-сессия пользователя.
type Session struct {
	TokenHash string    `db:"token_hash"`
	UserID    int64     `db:"user_id"`
	CreatedAt time.Time `db:"created_at"`
	ExpiresAt time.Time `db:"expires_at"`
}

// New создаёт сессию пользователя со сроком жизни ttl (tokenHash уже вычислен).
func New(tokenHash string, userID int64, ttl time.Duration) Session {
	now := time.Now()
	return Session{
		TokenHash: tokenHash,
		UserID:    userID,
		CreatedAt: now,
		ExpiresAt: now.Add(ttl),
	}
}

// Expired возвращает true, если срок сессии истёк.
func (s Session) Expired() bool {
	return time.Now().After(s.ExpiresAt)
}

// GenerateToken генерирует сырой токен (32 байта base64url без padding)
// и возвращает его вместе с SHA-256 хешем для хранения.
func GenerateToken() (token, tokenHash string, err error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", "", err
	}
	token = base64.RawURLEncoding.EncodeToString(buf)
	return token, HashToken(token), nil
}

// HashToken вычисляет SHA-256 хеш токена (hex).
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
