package model

// UserSettings — настройки пользователя, персистятся в БД.
type UserSettings struct {
	UserID           int64
	ShowCounts       bool // показывать количество заметок и папок рядом с названиями
	BreadcrumbInline bool // хлебные крошки inline-кнопками вместо текста
	BreadcrumbBottom bool // крошки внизу (только при BreadcrumbInline=true)
	ShowKeyboard     bool // показывать быструю клавиатуру
	TimezoneOffset   int  // смещение часового пояса от Москвы (0 = МСК, UTC+3)
	FoldersCollapsed bool // схлопывать папки уровня в одну кнопку
}

// NewUserSettings создаёт настройки пользователя со значениями по умолчанию.
func NewUserSettings(userID int64) UserSettings {
	return UserSettings{UserID: userID}
}
