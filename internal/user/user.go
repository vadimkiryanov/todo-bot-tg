// Package user — доменная модель веб-пользователя и правила валидации.
//
// Пользователь создаётся либо веб-формой регистрации (Username + PasswordHash),
// либо автоматически при первом обращении из Telegram (TelegramID).
package user

import (
	"regexp"
	"strings"

	errs "todo-bot-tg/internal/errors"
)

// User — веб-пользователь. Для Telegram-пользователей Username/PasswordHash пусты,
// для веб-пользователей TelegramID == nil.
type User struct {
	ID           int64
	Username     string // логин (только для веб-пользователей)
	PasswordHash string // bcrypt-хеш пароля (только для веб-пользователей)
	TelegramID   *int64 // telegram_id (только для бот-пользователей)
}

// NewUser создаёт веб-пользователя: валидирует логин и пароль.
// Хеширование пароля выполняет NewUserWithHash (см. password.go).
func NewUser(username, passwordHash string) (User, error) {
	if err := ValidateUsername(username); err != nil {
		return User{}, err
	}
	if passwordHash == "" {
		return User{}, errs.ErrInvalidPassword
	}
	return User{
		Username:     strings.ToLower(username),
		PasswordHash: passwordHash,
	}, nil
}

// usernameRe — допустимые символы логина: латиница, цифры, подчёркивание.
var usernameRe = regexp.MustCompile(`^[a-z0-9_]{3,32}$`)

// ValidateUsername проверяет логин: 3–32 символа [a-z0-9_].
func ValidateUsername(username string) error {
	if !usernameRe.MatchString(strings.ToLower(username)) {
		return errs.ErrInvalidUsername
	}
	return nil
}

// ValidatePassword проверяет пароль: не короче 8 символов.
func ValidatePassword(password string) error {
	if len(password) < 8 {
		return errs.ErrInvalidPassword
	}
	return nil
}

// TelegramUser создаёт пользователя из Telegram-аккаунта (без пароля).
func TelegramUser(telegramID int64) User {
	return User{TelegramID: &telegramID}
}

// IsTelegram возвращает true, если пользователь привязан к Telegram.
func (u User) IsTelegram() bool {
	return u.TelegramID != nil
}
