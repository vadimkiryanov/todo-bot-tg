package dto

// UserResponse — публичное представление пользователя {id, username}.
type UserResponse struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
}

// UserEnvelope — тело ответа auth-эндпоинтов: {user: {...}} (контракт фронта).
type UserEnvelope struct {
	User UserResponse `json:"user"`
}
