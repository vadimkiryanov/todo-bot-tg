package user

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/require"

	errs "todo-bot-tg/internal/errors"
)

func TestValidateUsername(t *testing.T) {
	cases := []struct {
		name     string
		username string
		wantErr  bool
	}{
		{"валидный минимальный", "abc", false},
		{"валидный с цифрами и подчёркиванием", "user_123", false},
		{"валидный ровно 32 символа", "abcdefghijklmnopqrstuvwxyz012345", false},
		{"валидный с верхним регистром", "UserName", false},
		{"слишком короткий", "ab", true},
		{"слишком длинный", "abcdefghijklmnopqrstuvwxyz0123456", true},
		{"пробелы", "user name", true},
		{"кириллица", "пользователь", true},
		{"дефис", "user-name", true},
		{"пустой", "", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateUsername(tc.username)
			if tc.wantErr {
				require.ErrorIs(t, err, errs.ErrInvalidUsername)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func TestValidatePassword(t *testing.T) {
	require.NoError(t, ValidatePassword("12345678"))
	require.ErrorIs(t, ValidatePassword("1234567"), errs.ErrInvalidPassword)
	require.ErrorIs(t, ValidatePassword(""), errs.ErrInvalidPassword)
}

func TestHashAndCheckPassword(t *testing.T) {
	hash, err := HashPassword("super-secret-123")
	require.NoError(t, err)
	require.NotEqual(t, "super-secret-123", hash)

	require.NoError(t, CheckPassword("super-secret-123", hash))
	require.ErrorIs(t, CheckPassword("wrong-password", hash), errs.ErrInvalidCredentials)
}

func TestHashPassword_ShortPassword(t *testing.T) {
	_, err := HashPassword("short")
	require.ErrorIs(t, err, errs.ErrInvalidPassword)
}

func TestNewUser(t *testing.T) {
	u, err := NewUser("Alice", "$2a$12$hash")
	require.NoError(t, err)
	require.Equal(t, "alice", u.Username) // нормализация в нижний регистр
	require.Equal(t, "$2a$12$hash", u.PasswordHash)
	require.Nil(t, u.TelegramID)
}

func TestNewUser_InvalidUsername(t *testing.T) {
	_, err := NewUser("a b", "hash")
	require.ErrorIs(t, err, errs.ErrInvalidUsername)
}

func TestNewUser_EmptyHash(t *testing.T) {
	_, err := NewUser("alice", "")
	require.ErrorIs(t, err, errs.ErrInvalidPassword)
}

func TestTelegramUser(t *testing.T) {
	u := TelegramUser(12345)
	require.NotNil(t, u.TelegramID)
	require.Equal(t, int64(12345), *u.TelegramID)
	require.True(t, u.IsTelegram())
	require.Equal(t, "", u.Username)
}

func TestUser_IsTelegram(t *testing.T) {
	u, _ := NewUser("alice", "hash")
	require.False(t, u.IsTelegram())
}

// Компиляционная проверка: bcrypt-ошибка не должна быть sentinel-ошибкой домена.
func TestCheckPassword_UnknownHash(t *testing.T) {
	err := CheckPassword("password", "not-a-bcrypt-hash")
	require.Error(t, err)
	require.False(t, errors.Is(err, errs.ErrInvalidCredentials))
}
