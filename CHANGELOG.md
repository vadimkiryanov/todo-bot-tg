# Карта обновлений

> История версий проекта `todo-bot-tg` — от первого коммита до актуального состояния.

---

## Этап 1: Фундамент (2026-07-26)

| # | Коммит | Что сделано |
|---|--------|-------------|
| 1–2 | `bd83ae5` `e23ca58` | Инициализация проекта: Go-модуль, базовая структура, подключение к Telegram API |
| — | `eb88e0c` | **fix**: Dockerfile без vendor (multi-stage `FROM scratch`), deploy.sh с автоустановкой git |
| 4–6 | `7653025` `a32e751` `ce069e6` | Ядро бота: создание/удаление/редактирование заметок, `/start` с приветствием |
| 7 | `db0b9bd` | `/backup` — дамп базы прямо в чат (без внешнего `backup.sh`) |
| 8–9 | `217a837` `bf838fe` | Доработка: пагинация (по 10), интерактивные кнопки для действий с заметками |
| 10–12 | `f6325c6` `4fc041b` `622f50f` `25696d3` | **UX**: reply-клавиатура («📝 Список», «📂 Топики»), навигация ←/→, `/help` с кнопками, удаление командных сообщений |
| — | `ee4c5f7` | Документация: `docs/ARCHITECTURE_GUIDE.md` — руководство по чистой архитектуре |

---

## Этап 2: Топики и приоритеты (2026-07-27 – 2026-08-03)

| # | Коммит | Что сделано |
|---|--------|-------------|
| 13–15 | `0ca6f03` `7af231f` `1bbb416` | Топики: создание, удаление, переключение активного топика |
| 16–17 | `260fa95` `2b137ad` | Приоритеты: 4 уровня (🔴 высокий / 🟡 средний / 🔵 низкий / без), выбор через inline-кнопки |
| 18–19 | `a2075c8` `4bb0aeb` | Папки: модель Folder, создание папок внутри топика, тесты |
| 20 | `4ae08f0` | **Рефакторинг**: удалено 1343 строки (убраны избыточные комментарии и `AGENTS.md`), код упрощён |
| 21 | `5efc351` | **Тесты**: +1831 строка — покрытие всех слоёв (renderer, state, model, entity, memstore, service) |
| 22 | `ef08ac8` | Мелкие правки handler/renderer |

---

## Этап 3: Папки и навигация (2026-08-03 – 2026-08-07)

| # | Коммит | Что сделано |
|---|--------|-------------|
| 23 | `8c2c2dd` | **Перемещение папок**: навигация по дереву папок, `MoveNote` в другой топик/папку, `FolderChain` |
| 24 | `93e95e6` | **Контекстные меню**: хлебные крошки с кнопками (топик → папка → подпапка), счётчики заметок/папок, виртуальная папка «Выполненные» |
| 25 | `44964a8` | **Сортировка**: High > Medium > None > Low, выполненные — в конец. Приоритет через `prioritySortKey` |
| 26 | `a8ab955` | **Смайлы в хлебных крошках**: эмодзи в breadcrumb-кнопках для визуальной навигации |

---

## Этап 4: Выполненные и напоминания (2026-08-10 – 2026-08-11)

| # | Коммит | Что сделано |
|---|--------|-------------|
| 27 | `3c2f9e0` | **Выполненные заметки**: поле `Done`, методы `MarkDone`/`MarkUndone`, зачёркивание текста (Unicode U+0336) |
| 28 | `90f500a` | **Таймер напоминаний**: интерактивный календарь (месяц → день → час → минуты), кнопки «Сегодня»/«Завтра», `ReminderAt` + `ReminderRepeat` (once/daily), фоновый воркер (каждые 30 сек), `ProcessPendingReminders` |
| 29 | `cc5338a` | **Папка выполненных**: виртуальная папка «✅ Выполненные» с отдельным просмотром, `CountDoneNotes`, `DoneFolderActive` в сессии |
| 30 | `eedb55a` | **Расхлоп кнопок взаимодействия**: кнопки действий с заметкой (✏️ редактировать, ✅ выполнить, 🗑 удалить, …) раскрываются из одной компактной кнопки «⚙️» |
| 31 | `e5732d7` | Документация: обновлены README и CHANGELOG |
| 32 | `cc8d991` | **Часовой пояс**: настройка `TimezoneOffset` (смещение от МСК, кнопки +/− в настройках), сравнение напоминаний в UTC |
| 33 | `01510d7` | **Фикс кнопок**: `ExpandedNoteID` в сессии — состояние раскрытых доп. кнопок заметки |
| 34 | `d2f91f5` | **Крошки внизу**: настройка `BreadcrumbBottom` — хлебные крошки под списком (при `BreadcrumbInline`) |
| 35 | `1fa442e` | **Крошки**: доработка текста кнопок крошек (эмодзи, вложенность) + тесты |

---

## Этап 5: Схлопывание папок и список таймеров (2026-08-14)

| # | Коммит | Что сделано |
|---|--------|-------------|
| 36 | — | **Схлопывание папок 📂**: настройка `FoldersCollapsed` в `/settings`. При включении: если на уровне больше одной папки — они сворачиваются в одну кнопку `[имя1, имя2, …] [🔽]` (callback `expfolders:<key>`), клик разворачивает (каждая папка — `📁 Имя`); работает на каждом уровне вложенности; развёрнутые уровни сохраняются при навигации внутри топика, сброс — только при смене топика |
| 37 | — | **Список таймеров `/timers`**: все заметки пользователя с напоминанием (независимо от топика/папки, сортировка по времени), `Service.ListTimers`, кнопки с датой/временем и режимом (🔂 разовый / 🔁 ежедневный) с учётом часового пояса |

---

## Этап 6: Вложения (2026-08-14)

| # | Коммит | Что сделано |
|---|--------|-------------|
| 38 | — | **Вложения 📎**: к заметкам можно прикреплять файлы (фото, документы, аудио, видео, голосовые, видео-сообщения, анимации, стикеры). Режим прикрепления: 📎 → «Добавить» → отправить медиа. Файлы хранятся на диске (`FILES_DIR`, по умолчанию `data/files`), метаданные — в БД (таблица `attachments`). Скачивание через Bot API с лимитом 20 МБ. Список вложений кнопками, просмотр, удаление с подтверждением; файлы удаляются вместе с заметкой/топиком |
| 39 | — | **Вложения — простое прикрепление**: файл, отправленный вне режима 📎, прикрепляется к последней просмотренной заметке (`LastViewedNoteID`) — подтверждение «✅ Файл прикреплён к заметке #N», экран просмотра при этом не перетирается; если заметка ещё не открывалась — подсказка открыть заметку. Вложения показываются только через кнопку 📎 (список кнопками), без автоматической отправки при открытии заметки |
| 40 | — | **Вложения — чистота**: сообщения-подтверждения «✅ Файл прикреплён…» автоудаляются через 5 секунд |
| 41 | — | **fix: 📎 не срабатывал с заметками, у которых есть вложения** — имена файлов (и превью подтверждения удаления) со спецсимволами (`_`, `*`, `` ` ``, `[`) ломали Markdown-разметку edit-сообщения, ошибка молча игнорировалась, список вложений не открывался. Теперь имена экранируются (`EscapeText`), а callback'и вложений при неудачном edit отправляют новое сообщение (fallback) вместо молчаливого сбоя |
| 42 | — | **Вложения — единое окно просмотра**: просмотр вложения открывается в одном сообщении (при том же типе медиа — `editMessageMedia`, иначе переотправка в то же окно), под медиа — кнопка «❌ Закрыть». При выходе из заметки (◀️ Назад, 📝 Список, 📂 Топики, /timers, /settings, /start, удаление заметки, переход к другой заметке) окно просмотра автоудаляется. После прикрепления файла через 📎 пользователь остаётся в списке вложений заметки, а не уходит в список заметок |
| 43 | — | **fix: 🗑 удаления вложения не срабатывала для файлов (PDF и др.)** — подтверждение удаления оборачивало имя файла в курсив `_..._`, а legacy Markdown Telegram игнорирует экранирование `\_` внутри курсива: подчёркивания из имени (например, `23_08_2026_…pdf`) разбивали entity, Telegram отвечал «can't parse entities», edit молча падал. Имя больше не оборачивается в курсив (экранирование сохранено). Тот же паттерн убран из подтверждения удаления заметки и выбора приоритета — там текст тоже экранируется |

---

## Этап 7: Рефакторинг (2026-08-15)

| # | Коммит | Что сделано |
|---|--------|-------------|
| 44 | `cd7c7cc` | **Итерация 1 — декомпозиция handler'а**: reminder-воркер вынесен в `internal/worker/reminder` (зависит только от порта `NotificationSender`), handler разбит на тематические файлы (`callbacks`, `commands`, `navigation`, `attachments`, `reminders`), огромный switch заменён типизированным диспетчером `CallbackAction → handler` |
| 45 | `4f98ea0` | **Итерация 2 — Value Objects**: `Priority` — валидируемый тип с `SortKey()`/`Emoji()`, `ReminderRepeat` — с конструктором-валидацией, мутаторы `Note.SetPriority/SetReminder/ClearReminder` |
| 46 | — | **Итерация 3 — атомарность и ошибки**: глобальный `sync.Mutex` в Service заменён keyed per-user lock (`userLocks`); `ProcessPendingReminders` повторно читает заметку под локом и логирует/возвращает ошибки (нет зацикленных напоминаний); `SeedDefaults` больше не глотает ошибки `CreateNote`; `deleteNoteFiles` возвращает ошибку (пробрасывается из `DeleteTopic`/`DeleteNote`/`DeleteAttachment`); закрыт небезопасный `GetNoteByID` (чтение без проверки владельца); воркер логирует ошибки через `slog` |
| 47 | — | **Предпросмотр вложений — только edit**: окно просмотра больше не пересоздаётся при смене типа медиа (photo → document и т.п.) — `showAttachmentView` всегда пробует `editMessageMedia` (Telegram умеет менять тип между photo/document/audio/video/animation), переотправка осталась только для стикеров/голосовых/видео-сообщений (ограничение API) и при неудачном edit; повторное открытие того же вложения больше не переотправляет сообщение (обработка `isNotModified`); мёртвое поле сессии `AttachmentViewType` удалено |
| 49 | — | **fix: предпросмотр файла не удалялся при выходе из просмотра** — кнопка «◀️ Назад» в списке вложений (`view:<id>` на ту же заметку) оставляла окно предпросмотра открытым: `callbackViewNote` закрывал его только при переходе на *другую* заметку (`LastViewedNoteID != note.ID`). Теперь `clearAttachmentView` вызывается при любом возврате в просмотр заметки — окно предпросмотра файла автоудаляется при выходе из просмотра |
| 50 | — | **Итерация 4 — pgx v5**: драйвер `lib/pq` заменён на `github.com/jackc/pgx/v5` — `pgxpool` (пул соединений), именованные параметры (`NamedArgs`) вместо позиционных `$1..$11`, маппинг структур через `CollectRows`/`CollectOneRow` + `RowToStructByName` вместо ручного `Scan`, транзакции через `pgx.Tx`; `sqlx` отклонён (pgx нативно покрывает маппинг и именованные параметры); `entity` Records получили `db`-теги; версия `pgx v5.7.5` — последняя совместимая с Go 1.23 (образ `golang:1.23-alpine` в Dockerfile) |
| 51 | — | **Закрепление заметок 📌**: поле `Pinned` в модели (мутаторы `Pin`/`Unpin`), колонка `pinned` в PostgreSQL (миграция `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` + `CREATE TABLE`), кнопка `📌` в просмотре заметки (callback'и `pin:<id>`/`unpin:<id>`), маркер `📌` перед текстом закреплённой заметки в списке; закреплённые всегда вверху — даже выше папок: сортировка `pinned → папки → остальные заметки` (по приоритету), выполненные — в конец |

---

## Этап 8: Персистентные настройки (2026-08-18)

| # | Коммит | Что сделано |
|---|--------|-------------|
| 52 | — | **Настройки в БД ⚙️**: настройки пользователя (`ShowCounts`, `BreadcrumbInline`, `BreadcrumbBottom`, `ShowKeyboard`, `TimezoneOffset`, `FoldersCollapsed`) больше не живут только в памяти процесса — таблица `user_settings` (UPSERT по `user_id`), модель `model.UserSettings`, `SettingsRepository` (PG + MemStore), методы `Service.GetSettings`/`SaveSettings`. Handler загружает настройки из БД в сессию однократно при первом обращении пользователя (`ensureSettings`, флаг `SettingsLoaded`) и сохраняет при каждом переключении в `/settings` (`persistSettings`) — настройки переживают перезапуск и передеплой бота; у пользователей без записи — значения по умолчанию |
| 53 | — | **Топики по 3 в ряд**: список топиков больше не растягивается по одной кнопке на ряд — теперь по 3 топика в строке (первый ряд остаётся за «📂 Все»), перенос на следующую строку при переполнении |
| 54 | — | **fix: создание топика не обновляло список** — после `doNewTopic` (команда `/newtopic` или ввод названия) не было ни обновления экрана, ни подтверждения: сообщения удалялись, результат невидим, пользователь повторял ввод того же имени и получал ложное «❌ топик с таким названием уже существует» (второй `CreateTopic` возвращал `ErrTopicAlreadyExists`), а новый топик появлялся только после принудительного обновления. Теперь после успешного создания сразу показывается обновлённый список топиков (`showTopics` на `LastListMsgID`), как в `doNewFolder` |

---

## Этап 9: Быстрые топики (2026-08-18)

| # | Коммит | Что сделано |
|---|--------|-------------|
| 55 | — | **Быстрые топики 🚀**: строка inline-кнопок с самыми посещаемыми топиками в самом верху списка заметок (в режиме «все заметки» тоже). Отбор — по счётчику посещений: колонка `visits` в таблице `topics` (инкремент при каждом открытии топика через `settopic:<id>` или команду), `Service.ListTopTopics`/`IncrementTopicVisits` (Postgres: `visits DESC, id ASC LIMIT`; MemStore: `sort.SliceStable`). Текущий топик помечен «✅ ». Настройка `QuickTopicsCount` в `/settings` (строка «🚀 Быстрые топики: N» с кнопками −/+): количество кнопок 0–10, по умолчанию 4, 0 = функция выключена; значение персистентное (таблица `user_settings`) |
| 56 | — | **fix: клик по быстрой кнопке не перезаписывал список** — кнопки быстрых топиков живут в отдельном сообщении ПЕРЕД списком, но `callbackSetTopic` всегда перерисовывал список в том сообщении, откуда пришёл callback. При нажатии на кнопку быстрых топиков это перетирало список заметок содержимым списка и дублировало его. Теперь при клике из сообщения быстрых топиков перерисовывается сам список (`LastListMsgID`), а сообщение быстрых топиков обновляется (пометка текущего топика); вдобавок сообщение быстрых топиков скрывается при уходе со списка (`/timers`, `/settings`) — его не видно на других экранах |
| 57 | — | **Быстрые топики: ручной выбор 🎯** — вместо автотопа по посещениям (счётчик `visits`) топики для строки быстрых кнопок пользователь выбирает сам. В `/settings` при включённых быстрых топиках появилась кнопка «🎯 Выбрать топики» — экран со списком всех топиков (галочка «✅ » у выбранных, клик переключает), внизу «◀️ Назад» в настройки. Выбранные ID хранятся в новой таблице `user_quick_topics` (`QuickTopicIDs` в `UserSettings`/сессии), персистентно переживают рестарт; в строке показывается до `QuickTopicsCount` топиков в порядке выбора, удалённые топики отбрасываются. Механизм посещений (`visits`, `ListTopTopics`, `IncrementTopicVisits`) удалён из кода |
| 58 | — | **Табы не исчезают при просмотре заметки** — раньше при переходе в заметку сообщение с быстрыми топиками удалялось (появлялось только после возврата к списку). Теперь `callbackViewNote` больше не скрывает табы: строка быстрых топиков остаётся на месте и при просмотре заметки, и после возврата в список |
| 59 | — | **Табы остаются и на экране топиков** — `showTopics` больше не скрывает сообщение быстрых топиков: строка табов видна и над списком заметок, и над списком топиков |

---

## Этап 10: Форматирование заметок (2026-08-20)

| # | Коммит | Что сделано |
|---|--------|-------------|
| 60 | — | **Форматирование заметок ✨**: при создании и редактировании сохраняются Telegram entities — жирный, курсив, подчёркнутый, зачёркнутый, спойлер, код, блок кода с языком и ссылки (`text_link`). Доменная модель: `model.NoteEntity` + поле `Note.Entities` (offset/length в UTF-16, как у Telegram); хранение — JSON-строка в новой колонке `notes.entities` (миграция `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, паттерн встроен в `schema`); конвертеры `NoteToRecord`/`NoteFromRecord` (битый JSON игнорируется). Автоматические сущности (mention, hashtag, url, bot_command) не сохраняются — Telegram воспроизводит их из текста сам. Рендер просмотра: заметки с форматированием отправляются с `ParseMode=HTML` (теги расставляются по границам сущностей, спецсимволы текста экранируются, корректная вложенность), старые заметки без форматирования — как раньше, legacy Markdown с экранированием. Форматирование работает во всех путях создания/редактирования: сообщение/инлайн-замена (`SwitchInlineQueryCurrentChat`), `/add` и `/edit` с аргументами, интерактивный ввод; также передаётся в напоминания (`SendReminder`). Превью в списках и кнопках — без форматирования (plain text), как и раньше |
| 61 | — | **fix: форматирование не теряется при редактировании через ✏️** — кнопка ✏️ (`switch_inline_query_current_chat`) подставляет в поле ввода plain-текст: Bot API не позволяет передать entities в подставляемой строке (это ограничение платформы). Теперь форматирование восстанавливается при отправке: если текст не изменился — сущности сохраняются как были (fallback в `Service.EditNote`); если менялся по краям (общий префикс/суффикс) — `reviveNoteEntities` переносит сущности на неизменённые фрагменты со сдвигом, при правках в середине отбрасывает только пересекающие правку сущности; вручную применённое в поле ввода форматирование (msg entities) имеет приоритет |

---

## Этап 11: Закрепление на время (2026-08-22)

| # | Коммит | Что сделано |
|---|--------|-------------|
| 62 | — | **Закрепление на время 📌⏱**: 📌 в просмотре заметки открывает меню — «📌 Постоянно» / «⏱ На время» / (для закреплённых) «❌ Открепить». «На время» → 1 час / 12 часов / «📅 Своё время» (переиспользованы календарь и пикеры напоминаний с префиксом callback'ов `pin*` — `buildCalendar`/`buildHourPicker`/`buildMinuteRangePicker`/`buildMinuteExactPicker` получили параметр `prefix`). Новое поле `Note.PinnedUntil` (колонка `pinned_until TIMESTAMPTZ` в PostgreSQL, миграция `ADD COLUMN IF NOT EXISTS`), мутаторы `Pin`/`PinUntil`/`Unpin`, предикат `IsPinned()` — истёкшее закрепление считается откреплённым даже до обработки воркером. Просмотр заметки и меню показывают «📌 Закреплена до ДД.ММ.ГГГГ ЧЧ:ММ» (локальное время пользователя). Фоновый воркер `internal/worker/pin` (по образцу reminder, каждые 30 сек) вызывает `Service.ProcessExpiredPins` — каждая просроченная заметка повторно читается под локом пользователя (не затирает продление срока). Сортировка списка и маркер 📌 используют `IsPinned()` |

---

## Этап 12: Планы веб-приложения (2026-08-21)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | — | **Планы веб-приложения 📱**: переработаны планы фронтенда и бэкенда под самостоятельное веб-приложение (не зависящее от Telegram-бота): `docs/WEB_PLAN.md` — фронтенд (Vite + Svelte 5 + Tailwind v4 + PWA, аутентификация по логину/паролю, независимые от бота аккаунты, MVP — топики и заметки, дизайн как в Telegram-чате: табы топиков сверху, список заметок, поле ввода снизу); `docs/BACKEND_API_PLAN.md` — изменения бэкенда (таблица `users` + одноразовая миграция данных бота с бэкапом, REST API `/api/v1`: auth по логину/паролю с bcrypt и cookie-сессиями, CRUD топиков и заметок, в перспективе отдельный сервис `cmd/api`); `web/AGENTS.md` — правила для ИИ-агента фронтенда. Реализация не начата |

---

## Этап 13: Веб-приложение, скелет (2026-08-21)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | — | **Web, Этап 0 — скелет** (по `docs/WEB_PLAN.md`): пересоздан `web/` с нуля (старый скелет под Telegram Login удалён). Vite 8 + Svelte 5 (runes) + TypeScript strict (5.9) + Tailwind v4 (`@tailwindcss/vite`) + `vite-plugin-pwa` (manifest, SW `generateSW`, stale-while-revalidate для GET `/api/*`, autoUpdate). Файлы: `package.json` (скрипты dev/build/preview/check/test/gen:icons), `vite.config.ts` (прокси `/api` → :8080 для dev, vitest `passWithNoTests`), `tsconfig.json`/`tsconfig.node.json` (strict, `verbatimModuleSyntax`), `svelte.config.js` (vitePreprocess), `index.html` (viewport-fit=cover, theme-color, apple-touch-icon). `src/app.css` — дизайн-токены `@theme` в стиле Telegram (background `#e7ebee`, surface белый, accent `#3390ec`); `src/App.svelte` — каркас экрана чата (верхняя панель / список / нижнее поле ввода, safe-area-inset); компоненты-каркасы `Modal.svelte` (оверлей, $bindable open, Escape) и `EmptyState.svelte` (эмодзи + текст). PWA-иконки генерируются `scripts/gen-icons.mjs` (sharp: SVG-галочка → `public/icons/icon-{180,192,512}.png`). `.gitignore`: добавлены `web/dist`, `web/.env.local`. Проверки: `svelte-check` 0 ошибок / 0 warnings, `vite build` зелёный (SW + manifest в dist), `vitest` запускается, dev-сервер отдаёт HTTP 200 |

---

## Этап 14: Web, этапы 1–3 — аутентификация, топики, заметки (2026-08-21)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | — | **Web, Этапы 1–3** (по `docs/WEB_PLAN.md`): **Этап 1 — аутентификация**: `api/client.ts` (единый fetch, `credentials: 'same-origin'`, `ApiError` со статусом, текст из `{"error": ...}`, обработчик 401 → сброс сессии), `api/auth.ts` (register/login/logout/me), `types/api.ts` (User/Topic/Note/Priority — зеркало DTO бэкенда), `LoginView` (переключатель «Вход / Регистрация», валидация username 3–32 `[a-z0-9_]`, password ≥8, ошибки сервера), `stores/session.svelte.ts` (loading/guest/authed, восстановление через `GET /me`). **Этап 2 — топики**: `api/topics.ts`, `stores/topics.svelte.ts` (загрузка, авто-выбор активного из localStorage), `TopicTabs` (горизонтальный скролл, активный подсвечен, «＋» — модалка создания, долгий тап — переименовать/удалить с подтверждением). **Этап 3 — заметки**: `api/notes.ts` + полный CRUD в `mock.ts` (in-memory, localStorage, серверная сортировка pinned → priority → done в конце), `stores/notes.svelte.ts` (оптимистичные мутации ✅/приоритет с откатом при ошибке, после мутации — тихая перезагрузка серверной сортировки), `NoteCard` (превью первой строки, слева 📌/🔴/🟡/🔵, done — зачёркнуто), `InputBar` (Enter = отправить, Shift+Enter = перевод строки, авто-рост, очистка после отправки), `NoteOverlay` (полный текст + ✅ 🔴🟡🔵 ✏️ 🗑; тап по активному приоритету снимает его; удаление с подтверждением), интеграция в `ChatView` (список + EmptyState «📝» + поле ввода, загрузка заметок при смене топика). Исправлены импорты `.svelte.ts`-модулей с явным расширением `.svelte` (как в `App.svelte`) — иначе не резолвятся svelte-check/Vite. Тесты: `notes.test.ts` (5 кейсов: создание, серверная сортировка после ✅/🔴, откаты мутаций и удаления). Проверки: `svelte-check` 0 ошибок / 0 warnings, `vitest` 5/5, `vite build` зелёный (PWA + SW), dev-сервер HTTP 200 |

---

## Этап 15: Web, этап 4 — UX-полировка и PWA (2026-08-22)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | — | **Web, Этап 4** (по `docs/WEB_PLAN.md`): **Офлайн-индикатор** — store `network.svelte.ts` (`navigator.onLine` + события online/offline, cleanup на unmount), фиксированный баннер «📡 Нет сети» (bg-danger, z-50, safe-area-inset-top). **Состояния ошибок** — в `ChatView` при ошибке загрузки топиков/заметок показывается EmptyState «⚠️» с кнопкой «Повторить» (`loadTopics()` / `loadNotes(activeTopicID)`). **Тёмная тема** — `@media (prefers-color-scheme: dark)` переопределяет CSS-переменные (background `#0f1115`, surface `#1b1e24`, content `#e8e8e8`, muted `#8d9199`, border `#2a2e35`, accent `#5ea6f0`, danger `#ef5350`), в `index.html` — два `theme-color` с media (light `#3390ec` / dark `#0f1115`). **Фикс футера** — `#app { height: 100% }` в app.css: без него `h-full` в ChatView/LoginView обрывается и нижняя панель не прижимается к низу (проверено в headless Chrome mobile 375×667). **Accessibility (Lighthouse 73 → 100)**: кнопки с белым текстом переведены на новый токен `--color-accent-strong` (светлая `#1f6fc2` / тёмная `#236cce`, контраст 5.11:1 вместо 3.3:1 — LoginView submit, InputBar, активный таб TopicTabs, кнопки модалок), табы «Вход/Регистрация» получили `role="tab"` + `aria-selected`, из viewport убран `user-scalable=no` (запрет зума — провал accessibility), корневой элемент `#app` заменён на `<main>` (landmark). Итоговый Lighthouse (mobile): **performance 100, accessibility 100, best-practices 96** (502 на `/api` без бэкенда — ожидаемо). Проверки: `svelte-check` 0 ошибок / 0 warnings, `vitest` 5/5, `vite build` зелёный (PWA, precache 12 entries) |

---

## Этап 16: Web API, этап 0 — HTTP-инфраструктура (2026-08-22)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | — | **REST API, Этап 0** (по `docs/BACKEND_API_PLAN.md`): **`internal/httperr`** — единый формат ошибок `{"error": "..."}` и маппинг sentinel-ошибок на HTTP-статусы (404 — not found, 409 — already exists, 400 — валидация, 500 — прочее; `ErrInternal` без раскрытия деталей). **`internal/middleware`** — `Logging` (slog: метод, путь, статус, длительность через `statusRecorder`) и `Recover` (паника → 500 в едином формате). **`internal/handler/http`** — `NewRouter()` (Go 1.22+ паттерны `METHOD /path`, цепочка `Logging(Recover(mux))`), `GET /healthz` → `{"status":"ok"}`. **config** — `HTTP_ADDR` (по умолчанию `:8080`, пусто — HTTP не запускается). **`cmd/bot/main.go`** — `http.Server` в том же процессе (ReadTimeout 10s / WriteTimeout 10s / IdleTimeout 60s), graceful shutdown при сигнале (5s timeout), ошибка слушателя → в общий `errCh`. Тесты: `httperr` (13 кейсов маппинга + формат ответа), `middleware` (паника → 500, проход без паники), `handler/http` (healthz, неизвестный маршрут → 404). Проверки: `gofmt` чистый, `go build ./...`, `go vet ./...`, `go test ./...` зелёные |

---

## Этап 16 (продолжение): Web API, этап 1 — пользователи, авторизация, сессии (2026-08-22)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | — | **REST API, Этап 1** (по `docs/BACKEND_API_PLAN.md` §3, §6): **`internal/user`** — `User{ID, Username, PasswordHash, TelegramID *int64}`, `ValidateUsername` (3–32 `[a-z0-9_]`, нормализация lowercase), `ValidatePassword` (≥8), bcrypt cost 12 (`HashPassword`/`CheckPassword`; битый хеш → `ErrInvalidPasswordHash` (500), чтобы не раскрывать причину через `errors.Is`), `NewUserWithHash`. **`internal/session`** — `Session{TokenHash, UserID, CreatedAt, ExpiresAt}`, TTL 30 дней, `GenerateToken` (32 байта base64url) + SHA-256 хеш в хранилище, `Store` (Create/Get/Delete), `MemoryStore` + `PostgresStore` (таблица `web_sessions`). **`internal/middleware/auth.go`** — `RequireAuth` (cookie `session` → `Get(HashToken)`, userID в контексте, 401 в едином формате), `UserID(ctx)`. **`internal/handler/http`** — DTO (`RegisterRequest`/`LoginRequest`/`UserEnvelope`/`ToUserResponse`), `auth.go` (register → 201 + Set-Cookie, login → 200, logout → 204 идемпотентный, me → 200; 409 `ErrUsernameTaken`, 401 одинаково для неверного логина и пароля), роуты `/api/v1/auth/*` + `GET /api/v1/me` (за RequireAuth). **repository** — `users.go` (CreateUser/FindByUsername/GetByID/FindOrCreateByTelegramID, mem+pg), `UserRecord` + конвертеры, таблицы `users` + `web_sessions` (+ индекс) в schema; бот перепривязан на `users.id` (§3.4): `UserResolver`, userID параметром в handler'е telegram. **Миграция** — `data/migrate_users.sql` + `make db-migrate-users` (обязательный `make db-backup` перед запуском). Тесты: `user` (валидация, bcrypt), `session` (токен, MemoryStore), `handler/http` (E2E-цикл register→login→me→logout, 409/401/400, идемпотентный logout, case-insensitive login). Проверки: `gofmt` чистый, `go build ./...`, `go vet ./...`, `go test ./...` зелёные; живая проверка in-memory curl: register 201 → me 200 → logout 204 → me 401, dup-register 409, bad-password 401, healthz 200 |

---

## Этап 16 (продолжение): Web API, этап 2 — топики и заметки CRUD (2026-08-22)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | — | **REST API, Этап 2** (по `docs/BACKEND_API_PLAN.md` §6; цель «Done: фронт работает с полным CRUD»): **`internal/handler/http/service.go`** — интерфейс `TodoService` (ListTopics/CreateTopic/RenameTopic/DeleteTopic; ListNotes/AddNote/GetNote/EditNote/MarkDone/MarkUndone/SetPriority/DeleteNote; CountNotes) + `todoHandler`. **topics.go** — `GET /api/v1/topics` (с `note_count` через CountNotes на каждый топик), `POST /api/v1/topics` `{name}` → 201 (пустое имя → 400), `PATCH /api/v1/topics/{id}` `{name}` → 200, `DELETE /api/v1/topics/{id}` → 204; хелпер `pathID` (невалидный/≤0 id → 404). **notes.go** — `GET /api/v1/notes?topic_id=N` (фильтр опционален; кривой `topic_id` → 400), `POST /api/v1/notes` `{topic_id, text}` → 201 (пустой текст → 400), `PATCH /api/v1/notes/{id}` — применяет **только переданные** поля text → done → priority (`EditNote`/`MarkDone`/`MarkUndone`/`SetPriority`), пустой `{}` → 400, ответ — актуальный объект через GetNote (оптимистичные обновления фронта), `DELETE /api/v1/notes/{id}` → 204. **DTO** (`dto/`) — `TopicRequest`/`TopicResponse` (+`NoteCount`), `NoteCreateRequest`, `NotePatchRequest` (указатели `*string`/`*bool` отличают «не передано» от нуля), `NoteResponse` (`priority` строка `none|low|medium|high`, `pinned` = `IsPinned()`, `created_at` RFC3339), конвертеры `PriorityString`/`ParsePriority`. **Сервис** — интерфейс `TopicRepository` дополнен `UpdateTopic`, метод `RenameTopic` (пустое имя → `ErrEmptyName`; блокировка userLocks). **Репозиторий** — memstore `UpdateTopic` (поиск по id + UserID → 404; дубль имени среди **других** топиков → 409); postgres `UpdateTopic` (`UPDATE ... ON CONFLICT (user_id,name) DO NOTHING RETURNING`; `pgx.ErrNoRows` → повторный GetTopic: есть топик → 409, нет → 404). **router.go** — новая сигнатура `NewRouter(users, sessions, svc)`, хелпер `withAuth := RequireAuth(sessions)`, 8 маршрутов топиков/заметок; `cmd/bot/main.go` — `NewRouter(usersRepo, sessionStore, svc)`. **CORS не добавлялся** (фронт — same-origin). Тесты: `dto/converter_test` (round-trip priority), `topics_test` (E2E create→list→rename→delete, ошибки 401/400/409/404, изоляция между пользователями), `notes_test` (E2E create→list→patch text/done/priority→delete→note_count, юнит PATCH «применяются только переданные поля» со стабом `stubTodoService`). Проверки: `gofmt` чистый, `go build ./...`, `go vet ./...`, `go test ./...` зелёные; живая проверка in-memory curl (127.0.0.1:18080): полный CRUD-цикл топиков и заметок (201/200/204), ошибки: пустое имя 400, дубль 409, пустой текст 400, кривой priority 400, чужие id 404 |

---

## Этап 16 (продолжение): Web API, этап 3 — отдельный сервис cmd/api и деплой (2026-08-22)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | — | **REST API, Этап 3** (по `docs/BACKEND_API_PLAN.md` §10): **отдельный сервис `cmd/api`** — новый бинарник `todoapi` (Docker target `api`), работает независимо от Telegram-бота: `config.LoadAPI()` (токен не нужен, но `SESSION_TTL` → `SessionTTL`, по умолчанию 720h, и `APP_BASE_URL`), ручной DI (PostgresStore или MemStore по `DATABASE_URL`, `todo.NewService`, `fs.NewStore`), `http.Server` (таймауты 10/10/60) + graceful shutdown 5s через errCh. `NewRouter` получил 4-й параметр `sessionTTL` (`authHandler.sessionTTL`, `createSession` использует TTL и в `session.New`, и в Max-Age cookie). **Docker**: переписан корневой `Dockerfile` — multi-stage на `golang:1.25-alpine` собирает оба бинарника, две целевые стадии `bot`/`api` (`alpine:3.20` + ca-certificates + postgresql-client + tzdata); `web/Dockerfile` — `node:22-alpine` (npm ci → vite build) → `caddy:2-alpine`; `web/Caddyfile` — статика `/srv`, `handle /api/*` → `reverse_proxy api:8080`, SPA fallback (`try_files` → `/index.html`), `encode zstd gzip`, сайт `{$APP_BASE_URL}` (по умолчанию `:80`, домен → авто-HTTPS Let's Encrypt). **docker-compose.yml** — 4 сервиса: `db` (postgres:16-alpine, healthcheck `pg_isready`), `api` (healthcheck `/healthz`, volume `files`, depends_on db healthy), `bot` (volume `files`, depends_on db healthy), `web` (порты 80/443, `APP_BASE_URL`, depends_on api healthy). **Makefile** — `build` собирает `bin/todobot` + `bin/todoapi`, цель `api` (`go run ./cmd/api/`). **.env.example** — `DATABASE_URL`, `SESSION_TTL=720h`, `APP_BASE_URL` (комментарий про авто-HTTPS). **README** — обновлены шапка, Стек, Docker Compose (4 сервиса), раздел «Веб-приложение и REST API», Переменные окружения, Makefile, Структура проекта (cmd/api, web/Dockerfile, web/Caddyfile), Деплой (APP_BASE_URL/HTTPS). Проверки: `gofmt` чистый, `go build ./...`, `go vet ./...`, `go test ./...` зелёные; `docker compose config` OK; Caddyfile валиден (`caddy validate` для `:80` и для домена); web-образ собран (npm ci + vite build + caddy); живой тест cmd/api in-memory (127.0.0.1:18081): healthz → `{"status":"ok"}`, register → 201 + cookie `Max-Age=3600` (SessionTTL применился), me → 200, POST /topics → 201, POST /notes → 201, GET /notes?topic_id=1 → 200 |

---

## Этап 17: Telegram Login Widget (2026-08-23)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | `0cfaaf3` | **fix**: `FindOrCreateByTelegramID` — полные колонки + `COALESCE(username,'')/COALESCE(password_hash,'')` в RETURNING/SELECT (иначе `RowToStructByName` падал «cannot find field username» / «cannot scan NULL») |
| — | `2440c29` | **feat**: вход через Telegram Login Widget — `GET /api/v1/auth/tg` (валидация HMAC-SHA256 по токену бота: data_check_string = отсортированные key=value кроме hash через `\n`, `hmac.Equal`, auth_date ≤ 24 ч; `FindOrCreateByTelegramID` → сессия + cookie → редирект `/`; ошибки → `/login?error=telegram_*`; пустой токен — вход отключён). Кнопка «Вход через Telegram» на LoginView (виджет, разделитель «или», `VITE_TG_LOGIN` + HTTPS). compose: `TELEGRAM_BOT_TOKEN` у api, build-arg `VITE_TG_LOGIN`; тесты `auth_tg_test.go` |
| — | `bbb92ed` | **fix**: вход через Telegram — виджет переводит **основное окно** на `GET /api/v1/auth/tg` (`data-auth-url`, топ-фрейм; `data-onauth` оказался ненадёжным — вход замыкался на iframe виджета); добавлен маршрут `POST /api/v1/auth/tg` (form-urlencoded) + чтение `r.Form` (query + тело); POST-успех → `200 {user}`, ошибки → 400 `ErrInvalidTelegramAuth`. Проверено на проде: сервер отвечает `302 → /` + `Set-Cookie` на реальную подпись Telegram |

---

## Этап 18: Веб — закрепление 📌 и архив 🗄 (2026-08-23)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | *(см. ниже)* | **feat**: веб, закрепление и архив — **REST**: `PATCH /api/v1/notes/{id}` принимает `{pinned?, archived?}` (интерфейс `TodoService` расширен: `PinNote`/`UnpinNote`/`ArchiveNote`/`UnarchiveNote`/`ListArchived`), `GET /api/v1/notes?archived=true` — архивные заметки всех топиков; `NoteResponse` + `archived`. **Фронт**: кнопки 📌 (закрепить/открепить) и 🗄 (в архив) в оверлее заметки (два ряда), экран архива `ArchivedView` (вход через кнопку 🗄 в шапке, возврат ↩️, удаление), стор `archivedStore` + мутации с оптимистичным откатом. **Тесты**: Go — E2E pin/archive + юнит PATCH (порядок полей text→done→priority→pin→archive); web — 3 новых теста стора (pin-сортировка, archive/loadArchived, unarchive). Плюс: `vite.config.ts` — vitest всегда использует in-memory мок (`test.env VITE_USE_MOCK=true`), иначе `.env` с `VITE_USE_MOCK=false` ломал тесты. Проверки: `gofmt` чистый (кроме pre-existing `settings.go`), `go build/vet/test` зелёные, `npm run build` + `svelte-check` 0 ошибок, `vitest` 8/8 |

---

## Этап 19: Веб — форматирование заметок (2026-08-23)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | *(см. ниже)* | **feat**: форматирование в вебе — **REST**: `NoteResponse` + `entities` (формат Telegram MessageEntity, offset/length в UTF-16); `POST/PATCH /notes` конвертируют markdown-подобную разметку `**жирный**`/`*курсив*`/`` `код` ``/`[ссылка](url)` в entities (парсер `internal/handler/http/markdown.go`, маркеры удаляются из текста). **Фронт**: утилиты `web/src/lib/utils/format.ts` — безопасный HTML-рендер (экранирование, только http/https-ссылки), превью первой строки с форматированием в карточке, полный HTML в оверлее и архиве; редактор восстанавливает разметку из entities (`markdownFromEntities`) + подсказка формата. Заметки, созданные в вебе с разметкой, бот рендерит с форматированием (entities совместимы с Telegram). **Тесты**: Go — `markdown_test.go` (bold/italic/code/link, mixed, незакрытые маркеры, UTF-16); web — `format.test.ts` (парсер, рендер, XSS-экранирование, опасные URL, первая строка, восстановление разметки). Проверки: `gofmt` (кроме pre-existing `settings.go`), `go build/vet/test`, `npm run build`, `svelte-check` 0 ошибок, `vitest` 17/17 |

---

## Этап 20: Починка напоминаний (2026-08-22)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | *(см. ниже)* | **fix**: напоминания не доставлялись в Telegram — после введения таблицы `users` заметки хранят внутренний `users.id`, а воркер отправлял сообщение в чат `note.UserID` (для бота — несуществующий чат «1», Telegram отвечал ошибкой, напоминание молча терялось). `SendReminder` теперь резолвит `users.id → telegram_id` через новый `UserResolver.GetTelegramID` (`MemStore` + `PostgresStore`, интерфейс в `handler/telegram`, расширен DI в `cmd/bot/main.go`); для легаси-заметок (user_id == telegram_id) — fallback на `note.UserID`. Проверки: `go build/vet/test` зелёные; сквозная проверка на живой БД — просроченное напоминание реально доставлено в Telegram |

---

## Этап 21: Кнопки напоминания (2026-08-31)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | *(см. ниже)* | **feat**: сообщение-напоминание получило клавиатуру действий: ряд 1 — отложка «15 мин / 30 мин / 1 час» (новый `snoozerem:<id>:<минуты>`, сервисный `SnoozeReminder` сохраняет тип повторения), ряд 2 — «✅ Выполнено» (`donerem:<id>`: `MarkDone` + удаление сообщения) и «✖️ Закрыть» (удаление сообщения, как раньше), ряд 3 — «Открыть» (`view:<id>`). **Правило**: `MarkDone` теперь сбрасывает напоминание (в т.ч. ежедневное) — выполненная задача не напоминает. **Тесты**: model (MarkDone сбрасывает ReminderAt/Repeat), service (SnoozeReminder: сдвиг ~15 мин, сохранение daily, no-op без напоминания; MarkDone сбрасывает таймер), renderer (3 ряда, callback_data). Проверки: `go build/vet/test` зелёные, `gofmt` чистый |

---

## Этап 22: Веб — выход из аккаунта (2026-08-31)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | *(см. ниже)* | **feat**: видимый выход из аккаунта в вебе — кнопка «🚪» в шапке экрана чата (слева, симметрично архиву) и экрана архива (справа) вместо скрытого меню долгого тапа по шапке. При выходе (`POST /api/v1/auth/logout` уже существовал) сбрасывается всё клиентское состояние: экран → вход, активный топик и localStorage-ключ очищены (`resetNavigation`), топики/заметки/архив выгружены (`resetTopics`/`resetNotes`) — данные не протекают между аккаунтами; сброс также срабатывает по 401. **Тесты**: web — `resetNotes` очищает активные и архивные заметки. Проверки: `npm run check` 0 ошибок, `npm run build` успешен, `vitest` 18/18 |

---

## Этап 23: Веб — URL-роутинг на SvelteKit (2026-08-31)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | *(см. ниже)* | **feat**: веб переведён с state-based навигации на **SvelteKit** (SPA, `adapter-static` + fallback `index.html`, Caddy/Docker почти не тронуты — только `dist`→`build`). Экраны привязаны к чистым URL: `/login` — вход/регистрация, `/` — чат, `/archive` — архив; работают кнопки «назад/вперёд» и прямые ссылки. **Guard'ы**: в `load`-функциях маршрутов — `/` и `/archive` доступны только авторизованным (`ensureSession` → `redirect('/login')`), `/login` — только гостям (`redirect('/')`); 401 на любом запросе API → `clearSession()` + `goto('/login')`. **Фикс бага «Вход»**: LoginView больше не вызывает `apiLogin` напрямую — вход/регистрация идут через session store (`login`/`register` применяют сессию), после чего `goto('/')`. **Рефакторинг**: `navigation` store сокращён до активного топика (`resetNavigation` → `resetActiveTopic`, навигацию при logout/401 делает роутер); logout в шапках → `goto('/login')`. PWA: `registerSW` переехал в корневой `+layout`. Проверки: `npm run check` 0 ошибок, `npm run build` успешен, `vitest` 18/18 |

---

## Этап 24: Веб — папки (2026-09-01)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | *(в коммите)* | **feat: папки в вебе** — полный набор: навигация через хлебные крошки под табами топиков, создание/переименование/удаление папок (каскад подпапок и заметок) и перемещение заметок между папками. **REST**: `GET/POST /api/v1/folders` (`topic_id`, `parent_id?`, `all=true` — все уровни для дерева), `PATCH/DELETE /api/v1/folders/{id}`, `POST /api/v1/notes/{id}/move` (`{topic_id, folder_id?}`; folder_id null/отсутствует — в корень топика). **Бэкенд**: `FolderRepository` расширен (`ListAllFolders`, `RenameFolder`, `DeleteFolder`), Postgres `DeleteFolder` — `WITH RECURSIVE tree` в транзакции (attachments → notes → folders) с проверкой владельца в корне; `RenameFolder` — NULL-safe проверка уникальности имени среди соседей; `MoveNote` проверяет принадлежность папки пользователю и совпадение топика; `DeleteTopic` каскадно удаляет папки в обоих хранилищах. **Фронтенд**: типы `Folder`, API-клиент `api/folders.ts`, мок (CRUD, каскады, валидация), stores `navigation.activeFolderID` (сброс при смене топика/logout) + `folders.svelte.ts` (цепочка крошек, папки уровня, CRUD, каскад по стору), `notes.svelte.ts` — `loadNotes(topicId, folderId)`, создание в активную папку, `moveNote`. UI: `FolderBar` (крошки «📂 Корень › …», чипы папок уровня, «＋» создание, долгий тап → меню переименовать/удалить), `MoveModal` (дерево папок с отступами, «В корень», текущая помечена), кнопка «📂 Переместить» в оверлее заметки. Проверки: `go test ./...` ok, `npm run check` 0 ошибок, `npm run build` успешен, `vitest` 28/28 (в т.ч. новые folders.test.ts и тесты moveNote) |

---

## Этап 25: Веб — подтверждение удаления (2026-09-01)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | *(в коммите)* | **feat**: модалка согласия перед необратимыми удалениями в вебе — единый компонент `ConfirmModal` (на базе `Modal`): заголовок, описание, кнопки «Отмена»/действие, busy/error. Подключён к удалению папки («Вместе с папкой удалятся все вложенные папки и заметки»), топика («Вместе с топиком удалятся все заметки и папки») — раньше удаляли мгновенно по пункту меню — и к удалению заметки в оверлее и в архиве (вместо дублированного inline-блока). Проверки: `npm run check` 0 ошибок, `npm run build` успешен |

---

## Этап 26: Веб — напоминания ⏰ (2026-09-01)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | *(в коммите)* | **feat: веб — напоминания** — управление напоминаниями в REST и веб-UI; доставка — через Telegram-бота (воркер `internal/worker/reminder` уже работает в `cmd/bot`, новая инфраструктура не нужна). **REST**: `PUT/DELETE /api/v1/notes/{id}/reminder` (`{at, repeat}`; `at` — RFC3339 UTC; `once` в прошлом → 400, как в боте; `DELETE` возвращает актуальную заметку). `NoteResponse` расширен: `reminder_at` (null — нет) и `reminder_repeat` (`once|daily`); `done: true` сбрасывает напоминание (существующий `MarkDone → ClearReminder`). **Фронтенд**: типы `ReminderRepeat`, `api/notes.ts` (`setReminder`/`clearReminder`), мок (PUT/DELETE reminder с валидацией прошлого времени), стор — оптимистичные мутации с откатом (`mutateReminder`, без перезагрузки — сортировку не меняет); UI в `NoteOverlay`: кнопка «⏰ Напомнить» → форма `datetime-local` (клик по полю сразу открывает нативный календарь через `showPicker()`, значение по умолчанию — ближайшие полчаса) + сегмент «Один раз/Ежедневно»; при активном напоминании — строка «⏰ в 14:05» + «Снять» и snooze «+15м/+30м/+1ч» (сдвиг с сохранением repeat); индикатор ⏰ на карточке (`NoteCard`) с подсказкой времени; утилита `formatReminderAt` (сегодня/завтра/дата, ежедневно). Проверки: `go test ./...` ok, `npm run check` 0 ошибок, `npm run build` успешен, `vitest` 35/35 (новые тесты reminder в notes.test.ts, formatReminderAt; Go — `reminders_test.go`) |

---

## Этап 27: Веб — контекстное меню заметки (2026-09-01)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | *(в коммите)* | **feat: веб — долгий тач по заметке** — на мобильных долгий тач (300 мс, без движения >10px) по карточке открывает дропдаун-меню действий (✅ выполнить/вернуть, «Приоритет: …» циклическим переключением как в боте (None→Low→Medium→High, кнопка 🔄, меню при этом не закрывается), 📌 закрепить, 🗄 в архив, 🗑 удалить с подтверждением; в архиве — ↩️ вернуть, 🗑 удалить); обычный клик по-прежнему открывает оверлей. На десктопе то же меню открывает правый клик. Подавление системного контекстного меню (`-webkit-touch-callout`, `contextmenu`), `touch-action: manipulation` (нет задержки клика), клик после долгого тача не открывает оверлей (захват currentTarget до setTimeout + одноразовый перехват click). Новый компонент `NoteMenu` (fixed-дропдаун у карточки, разворот вверх при нехватке места снизу, закрытие по тапу вне/скроллу/Escape, затемнённый фон, анимация `menu-anim`). Проверки: `npm run check` 0 ошибок/0 warning, `npm run build` успешен, `vitest` 37/37 |

---

## Этап 28: Веб — бургер-меню вместо шапки (2026-09-01)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | *(в коммите)* | **feat: веб — убрана верхняя шапка** — кнопки «🚪 Выход» и «🗄 Архив» перенесены из шапки в бургер-меню (☰) в нижней панели слева от инпута. Дропдаун открывается вверх над инпутом: «🗄 Архив» (предзагрузка архива, переход на `/archive`) и «🚪 Выход» (logout → `/login`); закрывается по тапу вне (прозрачная подложка) и Escape, анимация `menu-anim`. Safe-area отступ сверху перенесён из шапки в табы топиков. Проверки: `npm run check` 0 ошибок, `npm run build` успешен |

---

## Этап 29: Веб — строка контекста вместо шапок топиков/папок (2026-09-01)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | *(в коммите)* | **feat: веб — топики и папки припрятаны** — вместо двух панелей (табы топиков + крошки/папки) одна компактная строка контекста `ContextStrip`: «📚 Топик › 📁 Папка › Подпапка» + `▾` (иконка топика 📚 — чтобы не путать с папками). Тап — шторка снизу (Modal) с полными `TopicTabs` + `FolderBar` (всё то же: переключение, ＋ создание, долгий тап — переименовать/удалить); шторка **не закрывается автоматически** при выборе топика/папки — закрывается только вручную (тап вне / Escape), можно навигировать по дереву сколько нужно. **Авто-скрытие при скролле**: листаешь заметки вниз — строка сворачивается (max-height 0, safe-area отступ тоже), вверх — возвращается; в нулевой позиции всегда видна. На пустом экране (нет топиков) — кнопка «＋ Создать», открывающая шторку. Панели прижаты к краям экрана с лёгкими скруглениями: у нижней панели скруглены верхние грани (`rounded-t-2xl`), у строки контекста — нижние (`rounded-b-2xl`). Проверки: `npm run check` 0 ошибок, `npm run build` успешен, `vitest` 37/37 |

---

## Этап 30: Веб — фикс переноса длинного текста в карточке заметки (2026-09-01)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | *(в коммите)* | **fix**: длинные непрерывные строки (URL без пробелов и т.п.) вылезали за контейнер карточки в списке заметок — появлялся горизонтальный скролл. В превью `NoteCard` добавлен `break-words` (overflow-wrap) — перенос по любым длинным словам; оверлеи уже имели `break-words`. Проверки: `npm run check` 0 ошибок, `npm run build` успешен, `vitest` 37/37 |
| — | *(в коммите)* | **UX**: при клике «＋ Создать» топика/папки — автофокус в инпут (принудительный `focus()` через `$effect`, т.к. `autofocus` в Safari/повторном открытии не срабатывает); подложка бургер-меню (архив/выход) теперь затемняется (`bg-black/40` + `backdrop-anim`, как в NoteMenu/Modal) |

---

## Этап 31: Веб — 8 UX-правок (2026-09-01)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | *(в коммите)* | **UX-правки веб-фронта**: (1) строка контекста **всегда видна** — убрано авто-скрытие при скролле, скроллится только `<main class="scroll-area">` с `overscroll-behavior-y: contain` (нет «дёргания» на краю списка); (2) при создании топика/папки — автофокус в инпут + `scrollIntoView` после focus через 350 мс; шторка топиков/папок — **топики сеткой в 2 колонки, папки — деревом всех уровней с ветками** (вложенность отступом слева + символы веток `│ ├ └ ─` в моноширинном шрифте, клик — переход, активная подсвечена); кнопки «＋» создания — **фиксированные сверху во всю ширину** (не скроллятся вместе со списком, создают на текущем уровне); обе секции с ограничением по высоте (до 4 рядов) и вертикальным скроллом внутри (вместо горизонтальных лент); (3) долгий тап по карточке не выделяет текст (сброс выделения и фокуса на `pointerdown`, повторный сброс на `pointerup` после лонг-пресса); (4) кеш папок `foldersByTopic` + `topicId` — шторка топиков/папок больше не мерцает при переоткрытии; (5) **панель действий над инпутом** при создании заметки (видна при непустом тексте): кнопка приоритета 🔴🟡🔵 (цикл как в боте: none→low→medium→high), ⏰ напоминание — **отдельная модалка** с `ReminderForm` (datetime-local + once/daily, once не в прошлом), 📌 закрепить; сервер: `POST /api/v1/notes` теперь принимает `done`/`pinned`/`priority`/`reminder_at`/`reminder_repeat` (`AddNoteOptions`, порядок pin → reminder → done, done сбрасывает reminder как в боте), mock обновлён; (6) кнопка 📚 шторки топиков/папок — **парит абсолютом над нижней панелью слева** (над ☰), вне белой заливки: панель как была (☰ в контейнере инпута), 📚 не занимает ширину панели — справа от неё видны заметки чата; (7) свайп заметки влево — **убрана по решению владельца** (возврат к клику/долгому тапу). Проверки: `go build`/`go vet`/`go test ./...` — успешно, `npm run check` 0 ошибок (3 warnings в ReminderForm — осознанная инициализация), `npm run build` успешен, `vitest` 38/38 |
| — | *(в коммите)* | **fix: выделение текста отключено глобально** — долгий тап по карточке заметки больше не выделяет соседние элементы (футер, панели): `user-select: none` + `-webkit-touch-callout: none` на `body`; поля ввода (`input`/`textarea`) — исключение, в них выделение включено (`user-select: text`) |

---

## Этап 32: Веб — подсветка новой заметки + сортировка свежих сверху (2026-09-01)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | *(в коммите)* | **UX: подсветка только что добавленной заметки** — после отправки заметки её карточка «вспыхивает» акцентной заливкой, плавно уходящей в цвет поверхности (~3 сек): `notesStore.highlightedId` (устанавливается в `createNote`, сбрасывается таймером в `ChatView` + при размонтировании экрана), проп `highlighted` в `NoteCard`, анимация `note-flash` в `app.css` (для `prefers-reduced-motion` — статичная заливка на время подсветки) |
| — | *(в коммите)* | **Сортировка: внутри групп самые свежие сверху** — общий сервис `ListNotes` (бот и веб-API): структура прежняя (закреплённые → приоритет High>Med>None>Low → выполненные в конец), но при равном приоритете новые заметки идут первыми (тай-брейк по `ID` убыванию); веб-мок `sortNotes` — `b.id - a.id`. Новая заметка встаёт в начало своей группы + подсвечивается. Тесты: Go — `TestService_ListNotes_NewestFirstWithinGroup`, веб — обновлены порядки в `notes.test.ts` |

---

## Этап 33: Веб — создание топика/папки через долгое нажатие (2026-09-01)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | *(в коммите)* | **Создание топика/папки переехало на долгое нажатие** (кнопки «＋» в шторке топиков/папок убраны): **топик** — долгое нажатие на строке контекста «📚 Топик › Папка» → дропдаун «Создать топик» (позиционируется у точки нажатия, паттерн `QuickMenu` как у меню заметки: backdrop, закрытие по тапу вне/скроллу/Escape) и пункт «Создать топик» в начале меню топика (шторка); кнопка «＋ Создать» на пустом экране без топиков осталась и теперь открывает форму создания напрямую; **папка** — долгое нажатие на заметке (пункт «Создать папку» в начале дропдауна `NoteMenu`, не в архиве) или на пустом месте при отсутствии заметок (дропдаун по точке нажатия); создаётся на текущем уровне (в активной папке или корне) |
| — | *(в коммите)* | **Рефакторинг форм создания**: единые модалки `CreateTopicModal`/`CreateFolderModal` (флаги в новом сторе `stores/ui.svelte.ts`, рендерятся в `ChatView`, сброс при выходе из аккаунта), универсальный дропдаун `QuickMenu.svelte`. Проверки: `npm run check` 0 ошибок (3 известных warnings в ReminderForm), `vitest` 39/39, `npm run build` успешен |

---

## Этап 34: Веб — складирование выполненных ✅ (2026-09-01)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | *(в коммите)* | **REST: выполненные как отдельный склад** — `GET /api/v1/notes?done=true` возвращает выполненные заметки всех топиков (`ListDone` в memstore/postgres + `Service.ListDone`); основной список топика (`GET /api/v1/notes?topic_id=N`) **больше не содержит выполненных** — они уходят на склад, как в боте (виртуальная папка «✅ Выполненные»). Сортировка вынесена в общий хелпер `sortNotes` (используется `ListNotes` и `ListDone`). Тесты: `TestNotes_DoneFolder` (done=true уходит из списка, возвращается складом, с архивом не пересекается, done=false возвращает в список) |
| — | *(в коммите)* | **Веб: экран «✅ Выполненные» (URL /done)** — копия экрана архива: шапка ← / ✅ / 🚪, список `NoteCard`, оверлей с кнопками ↩️ (вернуть в работу) и 🗑 (удалить через `ConfirmModal`), `NoteMenu` в done-режиме (только ↩️ и 🗑), EmptyState «Выполненных нет»; guard в `+page.ts` как у `/archive`. Стор: `doneStore`, `loadDone()`, `undoneNote()` (оптимистично: убрать со склада + `PATCH {done:false}`, откат при ошибке), `removeDoneNote()` (удаление с откатом), `resetNotes` очищает и doneStore |
| — | *(в коммите)* | **Веб: бургер-меню** — пункт «✅ Выполненные» (над «Архив»): `loadDone()` + `goto('/done')`. Мок: `done=true` → `mockListDone` (done && !archived, `sortNotes`), `mockListNotes` фильтрует `!n.done`. Тесты vitest: 43/43 (обновлён «выполненная исчезает из списка и попадает на склад», добавлены `loadDone`, `undoneNote` возврат в активный список, `removeDoneNote` + откат, `resetNotes` с doneStore). Проверки: `gofmt`/`go build`/`go vet`/`go test ./...` — успешно, `npm run check` 0 ошибок (3 известных warnings в ReminderForm), `npm run build` успешен, `vitest` 43/43 |

---

## Этап 35: Веб — топики-островок, свайпы, редактор и UX-правки (2026-09-02)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | *(в коммите)* | **Топики — стеклянный «островок»** (как в Telegram): вместо верхней строки ContextStrip — плавающая glass-панель табов топиков (fixed, полупрозрачная с backdrop-blur), список заметок получает верхний паддинг по реальной высоте островка (ResizeObserver) и скроллится под ним; под островком — стеклянная строка текущей папки «📁 Корень/Папка › Подпапка ▾» (тап — шторка папок, долгий тап — дропдаун «Создать папку»/«Создать топик»). ContextStrip удалён. Лента автоскроллится к активному табу (без smooth-анимации, чтобы не «перехватывать» ручной скролл на мобилке; скроллится только когда таб вне видимой области). Неактивные табы без какой-либо подсветки — акцент только у активного |
| — | *(в коммите)* | **Переключение топиков**: клик по табу островка или горизонтальный свайп по списку (touch-action: pan-y, порог 48px) — контент въезжает с соответствующей стороны (enter-from-left/right). **Предзагрузка соседей**: заметки каждого (топик, папка) кешируются (`notesCache`, stale-while-revalidate — кеш показывается сразу, свежесть догружается фоном); после активного топика по очереди подгружаются корни соседей слева/справа — свайп не ждёт сеть. При удалении топика его кеш чистится |
| — | *(в коммите)* | **Раздельные кнопки топиков и папок** (задача 1): над полем ввода слева столбик плавающих кнопок — 📁 «Папки» (выше) и 📚 «Топики» (ниже, как раньше). Каждая открывает свою шторку: только сетка топиков или только дерево папок активного топика; шторки, как раньше, не закрываются при выборе. Меню топика (переименовать/удалить/создать) вынесено в общий `TopicMenu` (store `topic-menu`), используется островком и сеткой |
| — | *(в коммите)* | **Контекстное меню**: пока открыт дропдаун (NoteMenu/QuickMenu), скролл списка заморожен (body.scroll-locked → `.scroll-area` overflow hidden) — уход пальца/скролл-жест больше не прячет меню и не «утаскивает» список; закрытие — тап вне / Escape / выбор пункта. Подавление клика отпускания после долгого нажатия — общий `utils/click.ts` (NoteCard, островок, сетка, строка папки, пустое место) |
| — | *(в коммите)* | **fix**: подавление клика отпускания больше не снимается на pointerup через `setTimeout(0)` — на мобильных браузерах click синтезируется отдельной задачей ПОСЛЕ pointerup, таймер успевал снять слушатель раньше, и меню закрывалось в момент отжатия пальца сразу после открытия. Теперь подавление держится до прихода самого клика отпускания, до нового pointerdown (осознанный тап) или короткой паузы 400 мс после pointerup |
| — | *(в коммите)* | **Фокус ввода**: тап по кнопкам панели действий над инпутом (приоритет/⏰/📌), плавающим кнопкам и после отправки не уводит фокус из textarea (focus возвращается) |
| — | *(в коммите)* | **Карточка заметки** — превью ограничено двумя строками (line-clamp-2, длинные заметки обрываются многоточием) |
| — | *(в коммите)* | **Редактирование**: крупный редактор `NoteEditForm` с тулбаром стилей (B жирный, I курсив, `</>` код, 🔗 ссылка — оборачивают выделение markdown-маркерами, ссылка через инлайн-поле URL) + модалка `NoteEditModal`; в контекстное меню заметки добавлен пункт «✏️ Редактировать» (работает на экранах чата, архива и выполненных — `saveText` ищет список, где лежит заметка); оверлей заметки тоже переведён на общий редактор |
| — | *(в коммите)* | **Шторки растут до 85dvh**: убраны внутренние жёсткие лимиты высоты (сетка топиков `max-h-44`, дерево папок `max-h-44`, текст заметки в оверлеях `max-h-64`) — длинный контент раскрывает модалку до её предела (85dvh), скроллится сама шторка; короткие шторки остаются компактными. Фикс клика в контекстном меню: подавление «клика отпускания» после долгого нажатия теперь снимается на следующем pointerdown/pointerup и не съедает первый тап по пункту меню (например, «✏️ Редактировать») |
| — | *(в коммите)* | Тесты vitest: 47/47 (кеш контекстов без спиннера при повторном открытии, предзагрузка соседей, saveText в архиве/выполненных; beforeEach — resetNotes для изоляции кеша). Проверки: `npm run check` 0 ошибок (5 известных warnings), `vitest` 47/47, `npm run build` успешен |

---

## Этап 36: Веб — настройки: формат показа папок (2026-09-02)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | *(в коммите)* | **Пункт «⚙️ Настройки» в бургер-меню** — новая шторка `SettingsSheet.svelte` (открывается из ☰ в нижней панели, закрытие как у остальных шторок — тап вне/Escape). Первая настройка — **формат показа папок** на уровне списка заметок: «В списке заметок» (папки текущего уровня — строки-карточки с 📁 в общем списке, тап — вход в папку) или «Отдельная кнопка» (папок в списке нет — только плавающая 📁 кнопка и строка текущей папки). Выбор применяется сразу и хранится в localStorage (`stores/settings.svelte.ts`, ключ `todo.foldersMode`), по умолчанию — «В списке заметок»; в этом режиме плавающая кнопка 📁 скрывается (папки и так видны строками в списке; строка текущей папки над списком остаётся в обоих режимах) |
| — | *(в коммите)* | **Инлайн-папки в списке `ChatView`**: при режиме «в списке» над заметками уровня рендерятся строки папок (`levelFolders()`); порядок как у бота — закреплённые 📌 → папки → остальные заметки; тап по строке — `setActiveFolder` + скролл списка к началу (двойной rAF после смены уровня). Пустое место (нет ни заметок, ни папок уровня) — без изменений: дропдаун «Создать папку» долгим нажатием |
| — | *(в коммите)* | Тесты vitest: +3 (settings store: дефолт `list`, переключение + localStorage, восстановление сохранённого режима при старте модуля; localStorage в тестах — `vi.stubGlobal` с мини-хранилищем). Проверки: `npm run check` 0 ошибок, `vitest` 50/50, `npm run build` успешен |

---

## Этап 37: Веб — glass-стиль для отдельных элементов (2026-09-02)

| # | Коммит | Что сделано |
|---|--------|-------------|
| — | *(в коммите)* | **Glass-стиль на отдельных элементах** — тот же рецепт, что у «островка» топиков и строки папки (`island-glass`/`strip-glass`): полупрозрачный фон токена surface через `color-mix` + `backdrop-filter`. Новые классы в `app.css`: `glass-fab` (плавающие круглые кнопки 📁/📚 над панелью ввода — поверх списка, blur 18, фон surface 62%), `glass-menu` (дропдауны — бургер ☰, меню заметки `NoteMenu`, `QuickMenu`: blur 24, фон 82%), `glass-sheet` (панель `Modal.svelte` — все шторки/модалки автоматически: топики, папки, настройки, оверлей заметки, подтверждения: blur 28, фон 88%), `glass-card` (карточки заметок и строки папок в списке — только полупрозрачность 74%, **без** backdrop-filter: под карточками плоский фон чата, размывать нечего, а слой на каждой карточке тормозил бы скролл). Нажатия (active) заданы в самих классах — утилиты `active:bg-*` не сработали бы (unlayered-правила app.css перебивают утилиты Tailwind). Шторка папок `FolderBar` стала прозрачной внутри glass-модалки (лишний сплошной слой убран). Подсветка новой заметки (`note-flash`) «гаснет» в тон стеклянной карточки (surface 74% над фоном), а не в сплошной surface — иначе в конце вспышки мелькал бы непрозрачный прямоугольник. Плотности подобраны: прозрачнее всего — кнопки с одним символом, плотнее — шторки с текстом и формами. Нижней панели ввода добавлена верхняя граница (`border-t`) — сплошная белая панель отделяется от полупрозрачных карточек списка. Проверки: `npm run check` 0 ошибок, `vitest` 50/50, `npm run build` успешен |

---

## Сводка по слоям

| Слой | Файлы | Ключевые возможности |
|------|-------|---------------------|
| **Модель** | `model/note.go`, `model/folder.go`, `model/topic.go`, `model/attachment.go`, `model/settings.go` | Note (Entities — форматирование, Done, Pinned/PinnedUntil, Priority, ReminderAt, ReminderRepeat, PriorityEmoji), Folder (вложенность), Topic, Attachment (8 типов медиа, валидация), UserSettings (персистентные настройки, QuickTopicsCount, QuickTopicIDs) |
| **Сервис** | `service/todo/service.go` | CRUD (с entities), приоритеты, архивация, выполненные, закрепление (Pin/PinUntil/Unpin, `ProcessExpiredPins`), напоминания, сортировка, перемещение, `SeedDefaults`, `ProcessPendingReminders`, `ListTimers`, `AddAttachment`/`ListAttachments`/`GetAttachment`/`DeleteAttachment`, `GetSettings`/`SaveSettings` |
| **Репозиторий** | `repository/todo/{memstore,postgres}.go` + `entity/` | In-memory + PostgreSQL, Entity Records с конвертерами (entities — JSON), `GetPendingReminders`, `GetExpiredPins`, `MoveNote`, `CountDoneNotes`, CRUD вложений с каскадным удалением, UPSERT `user_settings`, быстрые топики (`user_quick_topics`) |
| **Хранилище файлов** | `storage/fs/store.go` | `Save`/`Delete`/`AbsPath` (защита от path traversal), структура `files/<userID>/<noteID>/` |
| **Handler** | `handler/telegram/{handler,callbacks,commands,navigation,attachments,reminders,renderer,state,entities}.go` | Inline-кнопки, SwitchInlineQuery, reply-клавиатура, хлебные крошки, FSM-состояния, календарь напоминаний, схлопывание папок, `/timers`, режим прикрепления, скачивание/отправка вложений, закрепление 📌, форматирование (entities → HTML); userID = `users.id` через `UserResolver` |
| **Воркер** | `worker/reminder/reminder.go`, `worker/pin/pin.go` | Фоновый опрос просроченных напоминаний (порт `NotificationSender`) и просроченных закреплений (`ProcessExpiredPins`), оба не зависят от Telegram API |
| **Веб-аккаунты** | `internal/user/`, `internal/session/` | Пользователи (username + bcrypt cost 12 / telegram_id), веб-сессии: токен 32 байта base64url, SHA-256 хеш в БД (`web_sessions`), TTL 30 дней; `MemoryStore` + `PostgresStore` |
| **Веб-API (REST)** | `internal/handler/http/{service,topics,notes,folders}.go` + `dto/` | CRUD топиков и заметок для веб-фронта: `GET/POST /api/v1/topics`, `PATCH/DELETE /api/v1/topics/{id}` (с `note_count`), `GET/POST /api/v1/notes` (`?archived=true` — архив, `?done=true` — выполненные, основной список без выполненных), `PATCH/DELETE /api/v1/notes/{id}` (`priority` none/low/medium/high, PATCH — только переданные поля, ответ — актуальный объект), `POST /api/v1/notes/{id}/move`, `PUT/DELETE /api/v1/notes/{id}/reminder` (`reminder_at`/`reminder_repeat`, once в прошлом → 400); папки: `GET/POST /api/v1/folders`, `PATCH/DELETE /api/v1/folders/{id}` (`all=true` — все уровни, каскад при удалении); интерфейс `TodoService`, конвертеры Domain ↔ DTO |
| **REST-сервис (cmd/api)** | `cmd/api/main.go`, `config/config.go` (`LoadAPI`), `Dockerfile` (target `api`) | Отдельный бинарник `todoapi` без Telegram: ручной DI (PostgresStore/MemStore), `http.Server` + graceful shutdown; `SessionTTL` (cookie + сессия), `AppBaseURL` |
| **Деплой** | `docker-compose.yml`, `web/Dockerfile`, `web/Caddyfile`, `.env.example`, `deploy.sh` | 4 сервиса (db/api/bot/web), healthchecks, volume `files`; Caddy: статика + прокси `/api` + авто-HTTPS Let's Encrypt по `APP_BASE_URL` |
| **Тесты** | `*_test.go` (во всех слоях) | `renderer_test`, `service_test`, `memstore_test`, `converter_test`, `state_test`, `store_test` (fs), `user_test`, `session_test`, `auth_test` (E2E), `router_test`, `topics_test`, `notes_test`, `dto/converter_test` |

---

## Актуальная архитектура

```
cmd/bot/main.go          — Telegram-бот: точка входа, ручной DI
cmd/api/main.go          — REST API: отдельный сервис (todoapi), без Telegram
config/config.go         — загрузка .env (Load — бот, LoadAPI — REST: SessionTTL, AppBaseURL)
internal/
  errors/errors.go       — sentinel-ошибки
  model/                 — Note, Folder, Topic, Attachment, UserSettings (агрегаты с бизнес-логикой)
  service/todo/          — сервис-оркестратор (интерфейсы репозиториев здесь)
  repository/todo/       — MemStore + PostgresStore + Entity Records (+ users: CreateUser/FindOrCreateByTelegramID)
  storage/fs/            — файловое хранилище вложений
  handler/telegram/      — Telegram Bot API handler + renderer + FSM-состояния (userID = users.id)
  handler/http/          — REST API (router, healthz, auth: register/login/logout/me; topics/notes CRUD: service.go + topics.go + notes.go + dto)
  httperr/               — единый формат ошибок {"error": "..."} и маппинг статусов
  middleware/            — Logging (slog) + Recover (panic → 500) + RequireAuth (cookie-сессии)
  user/                  — пользователи: валидация username/пароля, bcrypt cost 12
  session/               — веб-сессии: токен 32 байта base64url, SHA-256 хеш в хранилище, TTL (SessionTTL)
web/                     — веб-фронтенд: SvelteKit (SPA, adapter-static, ssr=false) + Svelte 5 + Tailwind v4 (PWA); маршруты /login, /, /archive, /done с guard'ами в load; Dockerfile (node → Caddy), Caddyfile (прокси /api + авто-HTTPS)
Dockerfile               — multi-stage: bot + api (golang:1.25-alpine → alpine:3.20)
docker-compose.yml       — 4 сервиса: db + api + bot + web
deploy.sh                — установка Docker/git, docker compose up -d --build
```

Проект следует принципам **чистой архитектуры**: Rich Domain Model, интерфейсы на стороне потребителя, ручной DI, никаких фреймворков.
