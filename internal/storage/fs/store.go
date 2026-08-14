// Package fs — файловое хранилище для вложений заметок.
//
// Файлы хранятся на диске в каталоге root/files/<userID>/<noteID>/,
// в базе данных хранится только относительный путь.
package fs

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Store — файловое хранилище на диске.
type Store struct {
	root string
}

// NewStore создаёт хранилище с корнем root (создаёт каталог, если нет).
func NewStore(root string) (*Store, error) {
	if root == "" {
		return nil, fmt.Errorf("путь к файловому хранилищу пуст")
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, fmt.Errorf("создание каталога хранилища: %w", err)
	}
	return &Store{root: root}, nil
}

// Save сохраняет данные и возвращает относительный путь (внутри root).
func (s *Store) Save(userID, noteID int64, ext string, data []byte) (string, error) {
	dir := filepath.Join(s.root, "files", strconv.FormatInt(userID, 10), strconv.FormatInt(noteID, 10))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("создание каталога файла: %w", err)
	}

	name := fmt.Sprintf("%d_%s%s", time.Now().UnixNano(), randomHex(8), sanitizeExt(ext))
	abs := filepath.Join(dir, name)

	if err := os.WriteFile(abs, data, 0o644); err != nil {
		return "", fmt.Errorf("запись файла: %w", err)
	}

	rel, err := filepath.Rel(s.root, abs)
	if err != nil {
		return "", fmt.Errorf("вычисление относительного пути: %w", err)
	}
	return filepath.ToSlash(rel), nil
}

// Delete удаляет файл по относительному пути. Путь вне root игнорируется.
func (s *Store) Delete(relPath string) error {
	abs, ok := s.absWithinRoot(relPath)
	if !ok {
		return fmt.Errorf("недопустимый путь файла: %s", relPath)
	}
	if err := os.Remove(abs); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("удаление файла: %w", err)
	}
	return nil
}

// AbsPath возвращает абсолютный путь для отправки файла в Telegram.
func (s *Store) AbsPath(relPath string) string {
	abs, ok := s.absWithinRoot(relPath)
	if !ok {
		return ""
	}
	return abs
}

// absWithinRoot проверяет, что путь находится внутри root (защита от path traversal).
func (s *Store) absWithinRoot(relPath string) (string, bool) {
	clean := filepath.Clean(filepath.FromSlash(relPath))
	if strings.HasPrefix(clean, "..") || filepath.IsAbs(clean) {
		return "", false
	}
	abs := filepath.Join(s.root, clean)
	if !strings.HasPrefix(abs, s.root+string(filepath.Separator)) && abs != s.root {
		return "", false
	}
	return abs, true
}

// sanitizeExt очищает расширение файла: только латиница и цифры,
// остальные символы пропускаются (расширение нужно лишь для корректного
// открытия файла Telegram-клиентом).
func sanitizeExt(ext string) string {
	ext = strings.ToLower(strings.TrimSpace(ext))
	ext = strings.TrimPrefix(ext, ".")
	if ext == "" {
		return ""
	}
	var b strings.Builder
	for _, r := range ext {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return "." + b.String()
}

// randomHex возвращает случайную hex-строку длиной n символов.
func randomHex(n int) string {
	b := make([]byte, (n+1)/2)
	if _, err := rand.Read(b); err != nil {
		// fallback на время — crypto/rand практически никогда не падает
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)[:n]
}
