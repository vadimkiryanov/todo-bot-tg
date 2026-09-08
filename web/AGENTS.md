# Руководство для ИИ-агента: фронтенд todo (web/)

> Фронтенд веб-приложения «todo» — мобильный PWA, отдельный сервис, не зависящий от
> Telegram-бота. Аутентификация — логин + пароль; аккаунты независимы от бота.
> Этот файл — свод правил и паттернов для работы с кодом в `web/`.
> Контракт API — в [`docs/BACKEND_API_PLAN.md`](../docs/BACKEND_API_PLAN.md).

## 1. Философия

| Принцип | Суть |
|---|---|
| **Минимализм** | Один эмодзи вместо заголовков, минимум текста и кнопок. Каждый элемент должен пройти проверку «можно ли без него?». Убрать лишнее — нормально, это приветствуется. |
| **Mobile-first** | Приложение живёт на телефоне. Проектируй под тач, не под курсор. Целевой viewport — 375px. |
| **Скорость** | Мгновенный отклик интерфейса, оптимистичные обновления, лёгкий бандл. |
| **Один источник данных** | Бэкенд — единственный источник правды (REST `/api/v1`). Фронт — тонкий клиент: рендер, кэш, UX. |
| **Дизайн как в Telegram-чате** | Верх — островок табов топиков, середина — список заметок, низ — поле ввода. Знакомый паттерн, никакой «сайтовости». |
| **Никакой магии** | Минимум зависимостей, никаких «магических» библиотек. Обычный fetch + Zustand. |

## 2. Стек (зафиксирован)

- **Vite** — сборка, dev-сервер; вход `index.html` → `src/main.tsx` → `src/App.tsx`
- **React 19** — функциональные компоненты, хуки; никаких классовых компонентов
- **Zustand 5** — глобальное состояние (единственная state-библиотека)
- **TypeScript** — `strict: true`, без `any` (кроме границ, где бэкенд отдаёт произвольные данные)
- **Tailwind CSS v4** — утилитарные классы в разметке, дизайн-токены в `app.css`
- **vite-plugin-pwa** — манифест, service worker (autoUpdate, `navigateFallbackDenylist /^\/api\//`), установка на телефон
- **Vitest** — unit-тесты (stores, api-клиент)
- **npm** — пакетный менеджер

Не добавлять: UI-киты, CSS-фреймворки, роутеры (react-router), другие state-библиотеки.

## 3. Структура директорий

```
web/
├── public/
│   └── icons/                 # PWA-иконки 192, 512, 180
└── src/
    ├── main.tsx               # bootstrap + registerSW
    ├── App.tsx                # корень: guard-роутер, переключатель экранов
    ├── app.css                # Tailwind-вход, токены, кастомные классы
    └── lib/
        ├── api/               # ВСЕ сетевые вызовы (клиент + по сущностям)
        ├── stores/            # Zustand-сторы (по одному на сущность)
        ├── types/             # типы API (зеркало DTO бэкенда)
        ├── utils/             # чистые функции (форматирование, блоки, click)
        ├── router.ts          # микро-роутер (useRouteStore, navigate, replacePath)
        ├── views/             # экраны: LoginView, ChatView, ArchivedView, DoneView,
        │                      #   TimersView, NotificationsView
        └── components/        # UI-компоненты (PascalCase.tsx)
```

**Категорически запрещено:**
- `helpers/`, `common/` — у каждого кода есть своё место в `lib/`
- Сетевые вызовы (raw fetch) вне `lib/api/`
- Циклические импорты между stores
- Импорт компонентов с расширением (`.tsx` опускается): `from '../components/NoteCard'`

## 4. Соглашения по коду

### 4.1 React-компоненты

```tsx
interface NoteCardProps {
  note: Note;
  onOpen: (note: Note) => void;
  highlighted?: boolean;
}

export function NoteCard({ note, onOpen, highlighted = false }: NoteCardProps) {
  // ...
}
```

- Каждый компонент — **именованный экспорт** функции; интерфейс `XxxProps` — рядом
- Маппинг рун из Svelte 5: `$props` → props-интерфейс, `$state` → `useState`, `$derived` →
  вычисление/`useMemo`, `$effect` → `useEffect` (+cleanup), `onMount` → `useEffect([], ...)`,
  `bind:this` → `useRef`, `on:event` → `onEvent`, `{#if}`/`{#each}` → условный рендер / `list.map`
  с `key`, `{#snippet}`/`{@render}` → локальные функции, возвращающие JSX (вызывать как
  функции, не как `<Comp/>` — иначе remount), `goto` → `navigate`, `{@const x}` → переменная
  в map-колбэке
- Ссылки на DOM — `useRef`; таймеры `window.setTimeout` типизировать явно как
  `useRef<number | undefined>` (тип `number`, не `ReturnType<typeof setTimeout>` — иначе
  @types/node резолвит `NodeJS.Timeout`)
- Локальные scoped-стили из портированных `.svelte` переносятся в конец `src/app.css` блоком
  с маркером `/* <Name>: scoped-стили из <Name>.svelte (портированы в React) */`; `:global()`
  разворачивается

### 4.2 Zustand

```ts
// lib/stores/topics.ts
interface TopicsState {
  topics: Topic[];
  loading: boolean;
  error: string | null;
}

export const useTopicsStore = create<TopicsState>()(() => ({
  topics: [],
  loading: false,
  error: null,
}));

export function loadTopics(): void { /* useTopicsStore.setState(...) */ }
```

- Стор: `create<State>()(() => ({...}))`; **действия — export-функции** (не методы стора),
  мутируют через `useXStore.setState(...)`; `getState()` — только в обработчиках событий,
  siema-колбэках и runtime-функциях (защита от stale closures), не в рендере
- В компонентах — **только селекторы** `useXStore((s) => s.field)`; ui-флаги — через
  `useUiStore.setState({...})`
- `setState` асинхронен (батчинг) — синхронное чтение сразу после записи идёт через
  ref-зеркало или `getState()`
- Мутации списков — через store-функции с оптимистичным обновлением:
  применить → запросить API → при ошибке откатить и показать ошибку
- Тесты стора — `*.test.ts` рядом, с `resetXStore()`/свежим стором в `beforeEach`

### 4.3 Роутинг

- Микро-роутер `lib/router.ts`: `useRouteStore` (поле `path`), `navigate(path)` (pushState),
  `replacePath(path)` (replaceState), `initRouter()` (popstate, cleanup), `currentPath()`
- Query (`?topic=&folder=&note=`) роутер не трогает — им управляет `ChatView` через history
- Guard'ы в `App.tsx`: гость на защищённом пути → `replacePath('/login')`, авторизованный
  на `/login` → `replacePath('/')` (паритет с бывшими SvelteKit `load`-redirect'ами)

### 4.4 TypeScript

- `strict: true`; типы API в `lib/types/api.ts` — зеркалят DTO бэкенда (обновлять при изменении контракта)
- Опциональные поля бэкенда (nil) — `foo: number | null`, не `foo?` без причины
- `verbatimModuleSyntax`: типы импортируются через `import type { ... }`

### 4.5 Стили

- Утилиты Tailwind в разметке; кастомные стили — только в `app.css`
  (дизайн-токены `@theme` из Tailwind v4 + классы `island-glass`, `glass-card`, `glass-menu`,
  `glass-sheet`, `sheet-*`, `backdrop-*`, `note-priority-*`, `loader`, `empty-bob`, `text-muted`,
  `scroll-area` и др. — использовать их, не дублировать)
- Цвета приоритетов — токены `--color-priority-*` (кольцо `note-priority-*`); различимы и в тёмной теме
- Нижняя панель ввода всегда учитывает `env(safe-area-inset-bottom)`

### 4.6 API-клиент

```ts
// lib/api/client.ts — единственная точка fetch
export class ApiError extends Error { ... }
```

- Каждый эндпоинт — функция в `lib/api/<entity>.ts` (`listTopics()`, `createNote(dto)`, …)
- `credentials: 'same-origin'` (cookie-сессия)
- Ошибка: `ApiError` со статусом; `401` — сигнал для session store (возврат на логин)
- Формат ответа/ошибки — строго по `BACKEND_API_PLAN.md`

### 4.7 Обработка ошибок

- Ошибки API — `ApiError`; текст из `{"error": ...}` показывать пользователю как есть (он уже на русском)
- Сеть недоступна: `navigator.onLine` + единый компонент «нет сети» (не падать, не терять состояние)
- Никаких `console.log` в проде; `console.error` — только для неожиданных ошибок

## 5. UX-принципы (обязательны)

1. **Один эмодзи вместо заголовков** — «📝» в пустом топике, без текста «для красоты».
2. **Карточки-кнопки** — заметка/топик = отдельная карточка с превью. Никакой нумерации.
3. **Расположение как в чате**: верх — островок табов топиков, середина — список заметок
   (свайп между топиками, внутри папок свайп «назад»), низ — поле ввода
   (`Enter` = отправить, `Shift+Enter` = новая строка).
4. **Тач-цели ≥ 44px**, нижняя панель действий, `env(safe-area-inset-bottom)`.
5. **Быстрые действия без лишних шагов**: ✅ / приоритет — одним тапом, с оптимистичным откликом.
6. **Не перегружать** — если элемент не несёт информации, его нет. Это требование владельца проекта.
7. Сортировка приходит с бэкенда (закреплённые → приоритет → выполненные в конце) — фронт не дублирует.

## 6. PWA-требования

- Манифест и SW — в `vite.config.ts` (`VitePWA`, `registerType: 'autoUpdate'`)
- Иконки 192/512 + apple-touch 180 генерируются `npm run gen:icons` (sharp) в `public/icons/`
- `index.html`: `viewport-fit=cover`, theme-color для светлой/тёмной темы
- SW не должен перехватывать `/api/*` (вход через Telegram-виджет) — `navigateFallbackDenylist`

## 7. Тестирование

- Vitest: stores (мутации, оптимистичные откаты), api-клиент (мок fetch); среда `node`,
  `VITE_USE_MOCK=true` принудительно (в `vite.config.ts`)
- Прогон перед сдачей: `npm run check` (tsc --noEmit), `npm run test`, `npm run build`
- После крупных изменений — Lighthouse (mobile): производительность ≥ 90, PWA installable

## 8. Антипаттерны

| Антипаттерн | Как надо |
|---|---|
| Raw fetch в компоненте | Только через `lib/api/` |
| `any` в коде | Типы в `lib/types/api.ts`, сужение через guards |
| `useXStore.getState()` в рендере | Селекторы `useXStore((s) => s.field)`; `getState()` — в обработчиках |
| Логика бизнес-правил на фронте | Правила (сортировка, валидация) — на бэкенде; фронт рендерит как есть |
| Дублирование состояний | Один стор на сущность; производные — через селекторы/`useMemo` |
| «Красивый» текст-заголовки | Эмодзи, минимум слов |
| Тяжёлые библиотеки ради одной фичи | Написать 20 строк самим |
| Игнор безопасных зон экрана | `safe-area-inset` для нижней панели |
| Расхождение типов с API | Обновить `types/api.ts` сразу при изменении контракта |

## 9. Рабочий процесс

1. Изменения — только внутри `web/`, кроме согласованных правок корня (docker-compose, README, CHANGELOG)
2. После завершения задачи — обновить `CHANGELOG.md` (раздел Web) в корне репозитория
3. Перед сдачей: `npm run check && npm run test && npm run build` — всё зелёное
4. При неоднозначности UX — вернуться к §5 и выбрать минимальный вариант
