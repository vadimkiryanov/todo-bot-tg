package user

import (
	"errors"

	"golang.org/x/crypto/bcrypt"

	errs "todo-bot-tg/internal/errors"
)

// bcryptCost — стоимость хеширования пароля (план: cost 12).
const bcryptCost = 12

// HashPassword хеширует пароль bcrypt-ом (cost 12).
func HashPassword(password string) (string, error) {
	if err := ValidatePassword(password); err != nil {
		return "", err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// CheckPassword сравнивает пароль с bcrypt-хешем.
// Несовпадение пароля — ErrInvalidCredentials (401).
// Битый/невалидный хеш — ErrInvalidPasswordHash (500): это внутренняя
// проблема данных, и через errors.Is клиент не должен отличать её от
// неверного пароля.
func CheckPassword(password, hash string) error {
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)); err != nil {
		if !errors.Is(err, bcrypt.ErrMismatchedHashAndPassword) {
			return errs.ErrInvalidPasswordHash
		}
		return errs.ErrInvalidCredentials
	}
	return nil
}

// NewUserWithHash создаёт веб-пользователя, хешируя пароль.
func NewUserWithHash(username, password string) (User, error) {
	hash, err := HashPassword(password)
	if err != nil {
		return User{}, err
	}
	return NewUser(username, hash)
}
