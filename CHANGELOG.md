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
| **Веб-API (REST)** | `internal/handler/http/{service,topics,notes}.go` + `dto/` | CRUD топиков и заметок для веб-фронта: `GET/POST /api/v1/topics`, `PATCH/DELETE /api/v1/topics/{id}` (с `note_count`), `GET/POST /api/v1/notes`, `PATCH/DELETE /api/v1/notes/{id}` (`priority` none/low/medium/high, PATCH — только переданные поля, ответ — актуальный объект); интерфейс `TodoService`, конвертеры Domain ↔ DTO |
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
web/                     — веб-фронтенд: Vite + Svelte 5 + Tailwind v4 (PWA); Dockerfile (node → Caddy), Caddyfile (прокси /api + авто-HTTPS)
Dockerfile               — multi-stage: bot + api (golang:1.25-alpine → alpine:3.20)
docker-compose.yml       — 4 сервиса: db + api + bot + web
deploy.sh                — установка Docker/git, docker compose up -d --build
```

Проект следует принципам **чистой архитектуры**: Rich Domain Model, интерфейсы на стороне потребителя, ручной DI, никаких фреймворков.
