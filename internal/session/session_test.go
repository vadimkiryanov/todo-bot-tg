package session

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	errs "todo-bot-tg/internal/errors"
)

func TestGenerateToken(t *testing.T) {
	token, hash, err := GenerateToken()
	require.NoError(t, err)
	require.NotEmpty(t, token)
	require.Equal(t, HashToken(token), hash)
	require.NotEqual(t, token, hash)

	// Уникальность и длина
	token2, _, err := GenerateToken()
	require.NoError(t, err)
	require.NotEqual(t, token, token2)
	require.Len(t, token, 43) // 32 байта base64url без padding
}

func TestHashToken_Deterministic(t *testing.T) {
	require.Equal(t, HashToken("abc"), HashToken("abc"))
	require.NotEqual(t, HashToken("abc"), HashToken("abd"))
}

func TestMemoryStore_CreateGetDelete(t *testing.T) {
	store := NewMemoryStore()
	_, hash, err := GenerateToken()
	require.NoError(t, err)

	sess := New(hash, 42, TTL)
	require.NoError(t, store.Create(sess))

	got, err := store.Get(hash)
	require.NoError(t, err)
	require.Equal(t, int64(42), got.UserID)
	require.Equal(t, hash, got.TokenHash)

	require.NoError(t, store.Delete(hash))
	_, err = store.Get(hash)
	require.ErrorIs(t, err, errs.ErrSessionNotFound)
}

func TestMemoryStore_GetUnknown(t *testing.T) {
	store := NewMemoryStore()
	_, err := store.Get("no-such-hash")
	require.ErrorIs(t, err, errs.ErrSessionNotFound)
}

func TestMemoryStore_Expired(t *testing.T) {
	store := NewMemoryStore()
	_, hash, err := GenerateToken()
	require.NoError(t, err)

	// Уже истёкшая сессия (отрицательный TTL)
	sess := New(hash, 42, -time.Hour)
	require.True(t, sess.Expired())
	require.NoError(t, store.Create(sess))

	_, err = store.Get(hash)
	require.ErrorIs(t, err, errs.ErrSessionExpired)
	// После первого чтения истёкшая сессия удалена
	_, err = store.Get(hash)
	require.ErrorIs(t, err, errs.ErrSessionNotFound)
}

func TestMemoryStore_DeleteIdempotent(t *testing.T) {
	store := NewMemoryStore()
	require.NoError(t, store.Delete("whatever"))
}
