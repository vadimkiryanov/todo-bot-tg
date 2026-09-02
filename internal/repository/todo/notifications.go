package todo

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"todo-bot-tg/internal/model"
	"todo-bot-tg/internal/repository/todo/entity"
)

// notificationLimit — сколько последних уведомлений отдаёт ListNotifications.
const notificationLimit = 100

// --- PostgreSQL ---

// AddNotification добавляет запись в журнал уведомлений.
func (s *PostgresStore) AddNotification(n model.Notification) (model.Notification, error) {
	fired := n.FiredAt
	if fired.IsZero() {
		fired = time.Now().UTC()
	}
	err := s.pool.QueryRow(context.Background(),
		`INSERT INTO notifications (user_id, note_id, text, fired_at)
		 VALUES (@user, @note, @text, @fired)
		 RETURNING id`,
		pgx.NamedArgs{
			"user":  n.UserID,
			"note":  n.NoteID,
			"text":  n.Text,
			"fired": fired,
		},
	).Scan(&n.ID)
	if err != nil {
		return model.Notification{}, fmt.Errorf("запись уведомления: %w", err)
	}
	n.FiredAt = fired
	n.Read = false
	return n, nil
}

// ListNotifications возвращает последние уведомления пользователя (свежие сверху).
func (s *PostgresStore) ListNotifications(userID int64) ([]model.Notification, error) {
	rows, err := s.pool.Query(context.Background(),
		`SELECT id, user_id, note_id, text, fired_at, read FROM notifications
		 WHERE user_id = @user
		 ORDER BY id DESC
		 LIMIT @limit`,
		pgx.NamedArgs{"user": userID, "limit": notificationLimit},
	)
	if err != nil {
		return nil, fmt.Errorf("чтение уведомлений: %w", err)
	}
	recs, err := pgx.CollectRows(rows, pgx.RowToStructByName[entity.NotificationRecord])
	if err != nil {
		return nil, fmt.Errorf("чтение уведомлений: %w", err)
	}
	result := make([]model.Notification, 0, len(recs))
	for _, r := range recs {
		result = append(result, entity.NotificationFromRecord(r))
	}
	return result, nil
}

// MarkNotificationsRead помечает уведомления прочитанными. ids пустой — все.
func (s *PostgresStore) MarkNotificationsRead(userID int64, ids []int64) error {
	if len(ids) == 0 {
		_, err := s.pool.Exec(context.Background(),
			`UPDATE notifications SET read = TRUE WHERE user_id = @user AND read = FALSE`,
			pgx.NamedArgs{"user": userID},
		)
		if err != nil {
			return fmt.Errorf("пометка уведомлений прочитанными: %w", err)
		}
		return nil
	}
	_, err := s.pool.Exec(context.Background(),
		`UPDATE notifications SET read = TRUE
		 WHERE user_id = @user AND id = ANY(@ids)`,
		pgx.NamedArgs{"user": userID, "ids": ids},
	)
	if err != nil {
		return fmt.Errorf("пометка уведомлений прочитанными: %w", err)
	}
	return nil
}

// --- MemStore ---

// AddNotification добавляет запись в журнал уведомлений.
func (s *MemStore) AddNotification(n model.Notification) (model.Notification, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if n.FiredAt.IsZero() {
		n.FiredAt = time.Now().UTC()
	}
	n.ID = s.nextNotifID
	s.notifications[n.ID] = entity.NotificationToRecord(n)
	s.userNotifs[n.UserID] = append(s.userNotifs[n.UserID], n.ID)
	s.nextNotifID++
	return n, nil
}

// ListNotifications возвращает последние уведомления пользователя (свежие сверху).
func (s *MemStore) ListNotifications(userID int64) ([]model.Notification, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ids := s.userNotifs[userID]
	from := 0
	if len(ids) > notificationLimit {
		from = len(ids) - notificationLimit
	}
	result := make([]model.Notification, 0, len(ids)-from)
	for i := len(ids) - 1; i >= from; i-- {
		if r, ok := s.notifications[ids[i]]; ok {
			result = append(result, entity.NotificationFromRecord(r))
		}
	}
	return result, nil
}

// MarkNotificationsRead помечает уведомления прочитанными. ids пустой — все.
func (s *MemStore) MarkNotificationsRead(userID int64, ids []int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(ids) == 0 {
		for id := range s.notifications {
			if r, ok := s.notifications[id]; ok && r.UserID == userID {
				r.Read = true
				s.notifications[id] = r
			}
		}
		return nil
	}
	want := make(map[int64]bool, len(ids))
	for _, id := range ids {
		want[id] = true
	}
	for id := range want {
		r, ok := s.notifications[id]
		if ok && r.UserID == userID {
			r.Read = true
			s.notifications[id] = r
		}
	}
	return nil
}
