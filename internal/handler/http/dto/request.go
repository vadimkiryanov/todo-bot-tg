// Package dto — Request/Response модели REST API (внешний контракт, §6).
package dto

// RegisterRequest — тело POST /api/v1/auth/register.
type RegisterRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// LoginRequest — тело POST /api/v1/auth/login.
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}
