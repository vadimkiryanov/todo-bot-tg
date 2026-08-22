package dto

import "todo-bot-tg/internal/user"

// ToUserResponse конвертирует доменную модель в DTO.
// Telegram-пользователи не отдают пароль/telegram_id — только id и логин.
func ToUserResponse(u user.User) UserResponse {
	return UserResponse{
		ID:       u.ID,
		Username: u.Username,
	}
}
