package fs

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNewStore_CreatesRoot(t *testing.T) {
	root := filepath.Join(t.TempDir(), "nested", "files")
	s, err := NewStore(root)
	if err != nil {
		t.Fatalf("NewStore() unexpected error: %v", err)
	}
	if s == nil {
		t.Fatal("NewStore() = nil store")
	}

	info, err := os.Stat(root)
	if err != nil {
		t.Fatalf("root not created: %v", err)
	}
	if !info.IsDir() {
		t.Fatal("root is not a directory")
	}
}

func TestNewStore_EmptyRoot(t *testing.T) {
	if _, err := NewStore(""); err == nil {
		t.Fatal("NewStore(\"\") expected error, got nil")
	}
}

func TestStore_SaveAndAbsPath(t *testing.T) {
	root := t.TempDir()
	s, err := NewStore(root)
	if err != nil {
		t.Fatalf("NewStore() error: %v", err)
	}

	rel, err := s.Save(42, 7, "jpg", []byte("data"))
	if err != nil {
		t.Fatalf("Save() error: %v", err)
	}
	if !strings.HasPrefix(rel, "files/42/7/") {
		t.Errorf("rel path = %q, want prefix files/42/7/", rel)
	}
	if !strings.HasSuffix(rel, ".jpg") {
		t.Errorf("rel path = %q, want suffix .jpg", rel)
	}

	abs := s.AbsPath(rel)
	if !strings.HasPrefix(abs, root) {
		t.Errorf("AbsPath() = %q, want prefix %q", abs, root)
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		t.Fatalf("ReadFile() error: %v", err)
	}
	if string(data) != "data" {
		t.Errorf("file content = %q, want %q", data, "data")
	}
}

func TestStore_Save_EmptyExt(t *testing.T) {
	root := t.TempDir()
	s, _ := NewStore(root)

	rel, err := s.Save(1, 1, "", []byte("x"))
	if err != nil {
		t.Fatalf("Save() error: %v", err)
	}
	if strings.HasSuffix(rel, ".") {
		t.Errorf("rel path = %q, must not end with dot", rel)
	}
}

func TestStore_Save_WeirdExt(t *testing.T) {
	root := t.TempDir()
	s, _ := NewStore(root)

	rel, err := s.Save(1, 1, ".TXT/../x", []byte("x"))
	if err != nil {
		t.Fatalf("Save() error: %v", err)
	}
	if !strings.HasSuffix(rel, ".txtx") {
		t.Errorf("rel path = %q, want suffix .txtx", rel)
	}
}

func TestStore_Delete(t *testing.T) {
	root := t.TempDir()
	s, _ := NewStore(root)

	rel, err := s.Save(42, 7, "pdf", []byte("data"))
	if err != nil {
		t.Fatalf("Save() error: %v", err)
	}

	if err := s.Delete(rel); err != nil {
		t.Fatalf("Delete() error: %v", err)
	}
	if _, err := os.Stat(s.AbsPath(rel)); !os.IsNotExist(err) {
		t.Errorf("file still exists after Delete(): %v", err)
	}

	// Повторное удаление — не ошибка
	if err := s.Delete(rel); err != nil {
		t.Errorf("second Delete() error: %v", err)
	}
}

func TestStore_Delete_PathTraversal(t *testing.T) {
	root := t.TempDir()
	s, _ := NewStore(root)

	outside := filepath.Join(t.TempDir(), "secret.txt")
	if err := os.WriteFile(outside, []byte("s"), 0o644); err != nil {
		t.Fatalf("WriteFile() error: %v", err)
	}

	// Относительные пути с выходом за root
	if err := s.Delete("../secret.txt"); err == nil {
		t.Error("Delete(\"../secret.txt\") expected error, got nil")
	}
	if err := s.Delete("../../secret.txt"); err == nil {
		t.Error("Delete(\"../../secret.txt\") expected error, got nil")
	}

	// Внешний файл не должен быть удалён
	if _, err := os.Stat(outside); err != nil {
		t.Errorf("outside file removed: %v", err)
	}

	// Абсолютный путь — тоже отклоняется
	if err := s.Delete(outside); err == nil {
		t.Error("Delete(abs) expected error, got nil")
	}
}

func TestStore_AbsPath_PathTraversal(t *testing.T) {
	root := t.TempDir()
	s, _ := NewStore(root)

	if got := s.AbsPath("../etc/passwd"); got != "" {
		t.Errorf("AbsPath(\"../etc/passwd\") = %q, want empty", got)
	}
	if got := s.AbsPath("/etc/passwd"); got != "" {
		t.Errorf("AbsPath(\"/etc/passwd\") = %q, want empty", got)
	}
	if got := s.AbsPath("files/1/1/x.jpg"); got == "" {
		t.Error("AbsPath(valid) = empty, want path")
	}
}

func TestSanitizeExt(t *testing.T) {
	cases := map[string]string{
		"":       "",
		"jpg":    ".jpg",
		".JPG":   ".jpg",
		"tar.gz": ".targz",
		"тxt":    ".xt", // кириллица пропускается
	}
	for in, want := range cases {
		if got := sanitizeExt(in); got != want {
			t.Errorf("sanitizeExt(%q) = %q, want %q", in, got, want)
		}
	}
}
