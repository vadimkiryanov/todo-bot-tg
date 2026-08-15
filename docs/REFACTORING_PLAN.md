# План улучшения архитектуры todo-bot-tg

> Документ описывает инкрементальный план приведения кода к лучшим практикам
> из `docs/ARCHITECTURE_GUIDE.md`. Каждая итерация — самостоятельный, проверяемый шаг.
> Порядок выбран так, чтобы каждая итерация оставляла проект в рабочем состоянии.

---

## Что уже хорошо (не трогаем)

- Слоистая структура: `handler → service → repository → model`; `model` — лист, без внешних зависимостей
- Интерфейсы на стороне потребителя (сервис определяет репозитории, handler определяет сервис)
- Приватные структуры + публичные конструкторы, ручной DI в `cmd/bot/main.go`
- Entity Records отделены от доменных моделей, конвертеры в `entity/converter.go`
- Sentinel-errors в одном месте (`internal/errors/errors.go`)
- Бизнес-методы на агрегатах (`Note.Archive`, `MarkDone`, `EditText`)
- Тесты на уровнях домена, сервиса и рендера

---

## Итерация 1. Декомпозиция handler'а (god object)

**Проблема:** `handler.go` — 2561 строка: маршрутизация callback'ов (switch по строкам),
команды, навигация, вложения, реминдер-воркер. `renderer.go` — 1122 строки.

### Задачи

- [ ] Вынести reminder-воркер из handler'а в отдельный пакет `internal/worker/reminder/`
  - Воркер зависит от сервиса (или его интерфейса) и от порта `Sender`:
    ```go
    // worker/reminder/reminder.go
    type NoteService interface {
        ProcessPendingReminders() ([]model.Note, error)
    }
    type Sender interface {
        SendMessage(userID int64, text string, markup ...tgbotapi.InlineKeyboardMarkup) error
    }
    ```
  - В `handler.go` остаётся только отправка сообщений, цикл опроса уходит в воркер
  - `StartReminderWorker`/`Stop` переезжают в воркер; `main.go` собирает и запускает его
- [ ] Разбить `handler.go` на тематические файлы (один пакет `telegram`):
  - `callbacks.go` — диспетчер и обработчики callback'ов
  - `commands.go` — обработчики `/команд`
  - `navigation.go` — навигация по топикам/папкам, пагинация
  - `attachments.go` — просмотр/прикрепление/удаление вложений
  - `reminders.go` — UI календаря напоминаний
- [ ] Заменить огромный switch в `handleCallback` на типизированный диспетчер:
  ```go
  // callbacks.go
  type CallbackAction string

  const (
      ActionViewNote   CallbackAction = "view"
      ActionSetTopic   CallbackAction = "settopic"
      ActionPage       CallbackAction = "page"
      // ...
  )

  type callbackFunc func(chatID int64, msgID int, userID int64, arg string)

  var callbackHandlers = map[CallbackAction]callbackFunc{ /* ... */ }
  ```
  - Распарсить `data` один раз: `action:arg` → `CallbackAction` + аргумент
  - Неизвестный action — дефолтный ответ, не тихий `return`
- [ ] Вынести renderer в отдельный пакет `internal/view/` (или `render`):
  - Функции вида `buildTopicsMessage`, `buildListMessage`, `buildTimersMessage`
  - Принимают read-модели (`TopicSummary`, `ListPage`), а не `model.Note` напрямую
  - `handler` вызывает `view.Build*`, отправляет результат через `api`
- [ ] Убрать `GetNoteByID` из публичного интерфейса `NoteService` (см. Итерация 3)
  - После выноса воркера он не нужен handler'у; воркер работает через `ProcessPendingReminders`

### Критерии готовности

- `handler.go` < 600 строк; пакет `telegram` разбит на файлы по ответственности
- Все `callback_data` разбираются через типизированный парсер
- Воркер напоминаний не зависит от `tgbotapi` напрямую (только через порт `Sender`)
- `go test ./...` и `go vet ./...` проходят

---

## Итерация 2. Доменная модель: Value Objects

**Проблема:** `Priority` — «голый» `int` с магическими константами (можно записать любой
номер), `ReminderRepeat` — строка без валидации при чтении из БД.

### Задачи

- [ ] Создать Value Object `Priority` в `internal/model/`:
  ```go
  // model/priority.go
  type Priority int

  const (
      PriorityNone   Priority = 0
      PriorityLow    Priority = 1
      PriorityMedium Priority = 2
      PriorityHigh   Priority = 3
  )

  func NewPriority(v int) (Priority, error) { /* валидация */ }
  func (p Priority) SortKey() int           { /* порядок для сортировки */ }
  func (p Priority) Emoji() string          { /* текущий PriorityEmoji */ }
  ```
  - Поле `Note.Priority Priority`, конвертеры `entity` — через `int(p)` / `Priority(v)`
  - `SetPriority` в сервисе вызывает `NewPriority` вместо слепого присваивания
  - `prioritySortKey` из сервиса переезжает в метод `Priority.SortKey()`
- [ ] Валидация `ReminderRepeat`:
  - Конструктор `NewReminderRepeat(s string) (ReminderRepeat, error)`
  - Применять в `entity.NoteFromRecord` (невалидное значение — ошибка/дефолт, не тихое продолжение)
- [ ] Методы-мутаторы на `Note` вместо прямого присваивания в сервисе:
  ```go
  func (n *Note) SetPriority(p Priority) error
  func (n *Note) SetReminder(at time.Time, repeat ReminderRepeat) error
  func (n *Note) ClearReminder()
  ```
  - Сервисы `SetPriority`/`SetReminder`/`ClearReminder` делегируют агрегату

### Критерии готовности

- Нельзя создать `Priority` вне допустимого диапазона
- `go test ./internal/model/...` покрывает новые VO (валидация, SortKey, Emoji)
- Все вхождения `PriorityHigh`/`prioritySortKey` переведены на новый тип

---

## Итерация 3. Сервис: атомарность, ошибки, безопасность

**Проблема:** глобальный `sync.Mutex` сериализует все операции; паттерн
`GetNote → мутация → UpdateNote` неатомарный; ошибки молча проглатываются;
`GetNoteByID` позволяет читать чужие заметки.

### Задачи

- [x] Убрать глобальный `sync.Mutex` из `Service`:
  - Для БД-репозитория атомарность обеспечивает СУБД
  - Для in-memory — `RWMutex` внутри `MemStore`
  - Если нужна сериализация операций одного пользователя — keyed mutex
    (`map[int64]*sync.Mutex` в отдельной маленькой структуре), а не глобальный
- [x] Сделать мутации атомарными:
  - `UpdateNote` уже проверяет `affected == 0` → сохранить этот паттерн
  - Где нужно «прочитать и изменить за один шаг» — транзакция или
    `UPDATE ... WHERE id = $1 AND user_id = $2` с проверкой affected rows
  - `ProcessPendingReminders` повторно читает заметку под локом пользователя,
    чтобы не затереть правки между выборкой и записью
- [x] Перестать проглатывать ошибки:
  - `ProcessPendingReminders`: ошибки `UpdateNote` логировать и возвращать
    (сейчас потеря = зацикленное напоминание)
  - `SeedDefaults`: ошибки `CreateNote` возвращать, а не `_, _ =`
  - `deleteNoteFiles`: возвращать ошибку, вызывающий решает (`DeleteTopic`/`DeleteNote`/`DeleteAttachment`)
  - Воркер: ошибки не `continue` молча, а логировать через `slog`
- [x] Закрыть `GetNoteByID` (чтение без проверки владельца):
  - Убрать из интерфейса `NoteService` в handler'е
  - Если воркеру нужен обход — приватный путь внутри сервиса или метод с ACL
  - Метод и реализация удалены полностью (воркер работает через `ProcessPendingReminders`)

### Критерии готовности

- `Service` не содержит `sync.Mutex` (или только per-user lock)
- Нет ни одного `_ = repo.…` / `_, _ = repo.…` в `service.go`
- Ошибки напоминаний доходят до лога/ответа

---

## Итерация 4. Репозиторий: переход с lib/pq на pgx + sqlx

**Проблема:** драйвер `lib/pq` устарел: нет пула соединений, позиционные параметры
(`$1, $2 …`) тяжело читаются при 11 колонках, бойлерплейт ручного `Scan`.
Решение — `pgx` (современный драйвер Postgres, не ORM — не нарушает ARCHITECTURE_GUIDE)
+ `sqlx` (лёгкий маппинг структур).

### Задачи

- [ ] Заменить драйвер в `go.mod`: `github.com/lib/pq` → `github.com/jackc/pgx/v5` + `github.com/jmoiron/sqlx`
- [ ] Перевести `PostgresStore` на `pgxpool`:
  ```go
  // repository/todo/postgres.go
  type PostgresStore struct {
      pool *pgxpool.Pool
  }

  func NewPostgresStore(ctx context.Context, dsn string) (*PostgresStore, error) {
      pool, err := pgxpool.New(ctx, dsn)
      // ...
  }
  ```
  - Конструктор принимает `ctx`; `Close()` закрывает пул
  - `main.go` передаёт `ctx` (уже есть из `signal.NotifyContext`)
- [ ] Именованные параметры вместо позиционных:
  ```go
  rows, err := s.pool.Query(ctx, `
      SELECT id, user_id, topic_id, folder_id, text, priority,
             reminder_at, reminder_repeat, created_at, archived, done
      FROM notes WHERE id = $id AND user_id = $user`,
      pgx.NamedArgs{"id": noteID, "user": userID})
  ```
- [ ] Убрать бойлерплейт `Scan` через `pgx.CollectRows` + `pgx.RowToStructByName`:
  - Типизированный список колонок вместо 11 аргументов `Scan`
  - Транзакции (`DeleteTopic`, `DeleteNote`) — через `pgx.Tx` с `Begin(ctx)`
- [ ] Упростить запросы через `sqlx`:
  - `sqlx.In` для динамических фильтров (`folder_id IS NULL` vs `= $x`),
    сейчас ветвление `switch` по 3 вариантам в `ListNotes`/`CountNotes`
  - Маппинг в структуру через `StructScan`/`Get`
- [ ] `entity` Records: добавить тег `db` для `sqlx`-маппинга:
  ```go
  type NoteRecord struct {
      ID    int64  `db:"id"`
      // ...
  }
  ```

### Критерии готовности

- В `go.mod` нет `lib/pq`; `PostgresStore` работает через `pgxpool`
- Ни одного ручного `rows.Scan(...)` с 10+ аргументами
- `go test ./...` зелёные; поведение БД-репозитория не изменилось

---

## Итерация 5. Репозиторий: производительность и миграции

**Проблема:** N+1 запросы со счётчиками в циклах рендера; схема БД создаётся в рантайме;
две реализации интерфейса без общих контрактных тестов.

### Задачи

- [ ] Read-модели со счётчиками (CQRS-lite из ARCHITECTURE_GUIDE.md):
  ```go
  // model/query/topic.go
  type TopicSummary struct {
      Topic        model.Topic
      NoteCount    int
      FolderCount  int
  }
  ```
  - В репозиториях: `ListTopicSummaries(userID) ([]TopicSummary, error)` — один запрос
    с `LEFT JOIN`/`GROUP BY` (Postgres) и эквивалентная логика в MemStore
  - Handler (`showTopics`) перестаёт вызывать `CountNotes`+`CountFolders` в цикле
  - Аналогично для папок уровня: `ListFolderSummaries(userID, topicID, parentID)`
- [ ] Контрактные тесты репозиториев:
  - Общий набор табличных тестов (создание, списки, фильтры, подсчёты, удаление)
  - Прогон против `MemStore` всегда; против `PostgresStore` — под флагом/тегом
    (`//go:build integration` или env `TEST_DATABASE_URL`), т.к. нужна живая БД
- [ ] Версионированные миграции:
  - Вынести `const schema` из `postgres.go` в файлы миграций (например,
    `migrations/0001_init.up.sql`, `0002_priority.up.sql` …) с `golang-migrate`/`goose`
  - `NewPostgresStore` больше не выполняет DDL; миграции — отдельный шаг
    (`make migrate` / шаг в `deploy.sh` перед запуском бота)
  - Старые `ALTER TABLE ... IF NOT EXISTS` переносятся в соответствующие миграции
- [ ] `GetFolderChain` — рекурсивный CTE вместо цикла с `QueryRow` (Postgres)

### Критерии готовности

- Рендер списка топиков = 1–2 запроса на БД, а не 2×N
- `go test ./...` (MemStore) и `go test -tags integration ./...` (Postgres) проходят
- Приложение стартует без прав на DDL; миграции применяются явно

---

## Итерация 6. Инфраструктура

**Проблема:** только `log.Println`; нет e2e-тестов полного цикла.

### Задачи

- [ ] `log/slog` (стандартная библиотека, Go 1.23):
  - В `main.go` — `slog.NewJSONHandler(os.Stdout, ...)` для контейнера
  - Ключевые точки: старт/стоп, ошибки репозиториев, воркер напоминаний, ошибки `api.Send`
  - Убрать `log.Printf`/`log.Println` в пользу структурированных записей
- [ ] E2E-тесты (`internal/tests/e2e_test.go` по ARCHITECTURE_GUIDE.md):
  - Заглушка Telegram API (`httptest.Server`) вместо реального `api`
  - Полный цикл: команда → сервис → репозиторий → ответ
  - Запуск: `go test ./internal/tests/...`

### Критерии готовности

- В коде нет `log.Println`/`log.Printf`
- E2E покрывает: создание топика, добавление/редактирование/удаление заметки, напоминание

---

## Порядок выполнения и зависимости

| Итерация | Зависит от | Риск |
|----------|------------|------|
| 1. Декомпозиция handler'а | — | Высокий (большой объём, регрессии UI) — делать с опорой на `renderer_test.go` |
| 2. Value Objects | — | Низкий (затрагивает модель + конвертеры) |
| 3. Сервис | 2 | Средний (атомарность меняет поведение) |
| 4. Переход на pgx + sqlx | — | Средний (SQL, но поведение не меняется) |
| 5. Репозиторий (N+1, миграции) | 4 | Средний (SQL) |
| 6. Инфраструктура | 1, 3 | Низкий |

> Итерации 1–2 и 4 независимы и могут выполняться параллельно. Итерации 3 и 6
> лучше после 1 (воркер переезжает до того, как трогаем его ошибки). Итерация 5
> после 4 — чтобы read-модели сразу писались на pgx.

---

## Правила выполнения

- Каждая итерация завершается зелёными `go test ./...` и `go vet ./...`
- После каждой итерации — коммит; сообщения по образцу истории (`37 хранение файлов`, …)
- Не менять публичное поведение бота: UI-тексты, `callback_data` (совместимость со
  старыми нажатиями), команды — остаются прежними
- Не расширять скоуп: задача из списка — вне списка — сначала обсудить
