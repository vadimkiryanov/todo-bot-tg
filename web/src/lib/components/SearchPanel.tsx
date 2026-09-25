// Полноэкранный поиск по заметкам (как в Telegram): результаты появляются по
// мере ввода (дебаунс 300 мс), пустой запрос — подсказка вместо списка.
// Открывается из кнопки «Поиск» внизу справа: панель раскрывается круговой
// «развёрткой» (clip-path circle) от центра кнопки — см. prop origin.
// Режим-тогл: «В топике» — по активному топику островка (topic_id в запросе);
// «Везде» — глобально по всем топикам, результаты группируются сплиттерами
// с именем топика. Поиск не включает выполненные и архивные (сервер).
// Результаты — строки-Cell в карточке-секции (как остальные списки
// приложения); в режиме «Везде» каждый топик — своя секция с заголовком.
// Меню/страница работают по объекту заметки (NoteCell/NoteMenu) — заметки
// из результатов не обязаны лежать в списках активного контекста.
// Строка набора — на компонентах библиотеки: поле Input (заливка по умолчанию
// совпадает с фоном поиска, поэтому возвращаем фону наших полей bg-muted!),
// «назад» и «очистить» — IconButton с библиотечными стрелкой/крестиком.
// Тогл области («В топике/Везде») остаётся своим: у Button нет состояния
// «выбран», а у Chip нет вида сегмент-тогла (как у табов входа).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { IconButton, Input, List, Section } from '@telegram-apps/telegram-ui';
import { Icon16Cancel } from '@telegram-apps/telegram-ui/dist/icons/16/cancel';
import { Icon20QuestionMark } from '@telegram-apps/telegram-ui/dist/icons/20/question_mark';
import { Icon24ChevronLeft } from '@telegram-apps/telegram-ui/dist/icons/24/chevron_left';
import { Icon24Close } from '@telegram-apps/telegram-ui/dist/icons/24/close';

import { searchNotes } from '../api/notes';
import { useNavigationStore } from '../stores/navigation';
import { useTopicsStore } from '../stores/topics';
import type { Note } from '../types/api';
import { useCloseAnim } from '../utils/closeAnim';
import { groupNotesByTopic } from '../utils/search';
import { EmptyState } from './EmptyState';
import { Loader } from './Loader';
import { NoteCell } from './NoteCell';

const DEBOUNCE_MS = 300;
/** Обратная «развёртка» при закрытии — быстрее раскрытия (380 мс): уход
    должен быть заметно короче прихода. */
const CLOSE_MS = 260;

/** Значение, «устоявшееся» через delayMs после последнего изменения. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

type SearchMode = 'topic' | 'global';

interface SearchPanelProps {
  /** Центр кнопки «Поиск» (координаты вьюпорта), из которой раскрывается
      панель. undefined — открыть без «развёртки» (прямая ссылка/восстановление). */
  origin?: { x: number; y: number } | null;
  onClose: () => void;
  onOpenNote: (note: Note) => void;
  onMenu: (note: Note, rect: DOMRect) => void;
}

export function SearchPanel({ origin, onClose, onOpenNote, onMenu }: SearchPanelProps) {
  const activeTopicID = useNavigationStore((s) => s.activeTopicID);
  const topics = useTopicsStore((s) => s.topics);

  // Без активного топика (нет островка/выбора) локальный режим невозможен.
  const canScopeTopic = activeTopicID !== null;
  const [mode, setMode] = useState<SearchMode>(() => (canScopeTopic ? 'topic' : 'global'));
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Note[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  // Откуда панель «развернулась» — в тот же кружок она сворачивается при
  // закрытии. null = открыли без origin (прямая ссылка): закрываем сразу.
  const originBox = useRef<{ ox: number; oy: number; radius: number } | null>(null);

  // Закрытие — обратной «развёрткой», а не рывком: панель сворачивается в
  // кружок у кнопки «Поиск». Ждём ровно столько, сколько длится анимация,
  // «меньше движения» и открытие без origin закрываются мгновенно.
  const { closing, requestClose } = useCloseAnim(onClose, CLOSE_MS);

  useEffect(() => {
    if (!closing) return;
    const el = rootRef.current;
    const box = originBox.current;
    if (el === null || box === null) return;
    el.animate(
      [
        { clipPath: `circle(${box.radius}px at ${box.ox}px ${box.oy}px)` },
        { clipPath: `circle(0px at ${box.ox}px ${box.oy}px)` },
      ],
      // Уход ускоряется к концу (раскрытие — наоборот, замедлялось).
      { duration: CLOSE_MS, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
    );
  }, [closing]);

  // Раскрытие «из кнопки»: панель проявляется круговой развёрткой (clip-path
  // circle) от центра кнопки «Поиск» к краям экрана — визуально кнопка
  // становится панелью поиска с уже сфокусированным инпутом. Одноразово
  // при открытии; prefers-reduced-motion — без анимации.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (el === null || origin === null || origin === undefined) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = el.getBoundingClientRect();
    const ox = origin.x - rect.left;
    const oy = origin.y - rect.top;
    const radius = Math.hypot(Math.max(ox, rect.width - ox), Math.max(oy, rect.height - oy));
    originBox.current = { ox, oy, radius };
    const anim = el.animate(
      [
        { clipPath: `circle(0px at ${ox}px ${oy}px)` },
        { clipPath: `circle(${radius}px at ${ox}px ${oy}px)` },
      ],
      { duration: 380, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    );
    return () => anim.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- развёртка только в момент открытия
  }, []);

  // Клавиатура сразу готова к вводу, как в Telegram.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const debouncedQuery = useDebouncedValue(query.trim(), DEBOUNCE_MS);

  useEffect(() => {
    if (debouncedQuery === '') {
      setResults(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    const topicId = mode === 'topic' ? activeTopicID : null;
    setLoading(true);
    setError(null);
    searchNotes(debouncedQuery, topicId)
      .then((notes) => {
        if (cancelled) return;
        setResults(notes);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setResults([]);
        setLoading(false);
        setError(err instanceof Error ? err.message : 'Ошибка поиска');
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, mode, activeTopicID]);

  const scopeLabel =
    activeTopicID !== null
      ? topics.find((t) => t.id === activeTopicID)?.name
      : undefined;

  let body: React.ReactNode;
  if (debouncedQuery === '') {
    body = (
      <EmptyState icon={<Icon20QuestionMark />} text="Начните вводить — заметки появятся здесь" />
    );
  } else if (error !== null) {
    body = <EmptyState icon={<Icon16Cancel />} text={error} />;
  } else if (results === null) {
    body = <Loader />;
  } else if (results.length === 0) {
    body = <EmptyState text="Ничего не найдено" />;
  } else if (mode === 'topic') {
    body = (
      // px-0!/py-0! — отступы задаёт контейнер результатов (px-3).
      <List className="px-0! py-0!">
        <Section>
          {results.map((note) => (
            <NoteCell key={note.id} note={note} onOpen={onOpenNote} onMenu={onMenu} />
          ))}
        </Section>
      </List>
    );
  } else {
    const groups = groupNotesByTopic(results, topics);
    body = (
      // px-0!/py-0! — отступы задаёт контейнер результатов (px-3).
      <List className="px-0! py-0!">
        {groups.map((group) => (
          // Заголовок секции — имя топика (как сплиттер прежней версии).
          <Section key={group.topicId} header={group.name}>
            {group.notes.map((note) => (
              <NoteCell key={note.id} note={note} onOpen={onOpenNote} onMenu={onMenu} />
            ))}
          </Section>
        ))}
      </List>
    );
  }

  // Показывать нечего (пустой ввод / нет данных под запрос): по пустому месту
  // в области результатов можно закрыть поиск.
  const noResults = !loading && (results === null || results.length === 0);

  // ── Смена режима свайпом по результатам ────────────────────────────────
  // Горизонтальный свайп переключает область поиска: влево — «Везде»,
  // вправо — «В топике» (порядок тогла). Вертикальный жест (скролл
  // результатов) не трогаем — ось определяется по первому движению.
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const swipe = useRef({ x: 0, y: 0, axis: null as null | 'x' | 'y', active: false });
  // После горизонтального свайпа гасим «догоняющий» click (иначе пустое
  // место закрыло бы поиск, хотя пользователь менял режим).
  const suppressClick = useRef(false);
  const SWIPE_THRESHOLD = 48;
  const AXIS_THRESHOLD = 10;

  function shiftMode(dir: 1 | -1): void {
    // Локальный режим возможен только при активном топике — иначе один «Везде».
    if (!canScopeTopic) return;
    const next: SearchMode = dir === 1 ? 'global' : 'topic';
    if (next === mode) return;
    const el = resultsRef.current;
    setMode(next);
    if (el === null) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Новый список влетает со стороны, откуда «пришёл» жест.
    el.animate(
      [
        { transform: `translateX(${dir * 24}px)`, opacity: 0.4 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    );
  }

  function onSwipeDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    swipe.current = { x: e.clientX, y: e.clientY, axis: null, active: true };
  }

  function onSwipeMove(e: React.PointerEvent<HTMLDivElement>): void {
    const s = swipe.current;
    if (!s.active || s.axis !== null) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > AXIS_THRESHOLD || Math.abs(dy) > AXIS_THRESHOLD) {
      s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
  }

  function onSwipeUp(e: React.PointerEvent<HTMLDivElement>): void {
    const s = swipe.current;
    if (!s.active) return;
    s.active = false;
    if (s.axis !== 'x') return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) >= SWIPE_THRESHOLD) {
      suppressClick.current = true;
      shiftMode(dx < 0 ? 1 : -1);
    }
  }

  function onSwipeCancel(): void {
    swipe.current.active = false;
  }

  return (
    <div ref={rootRef} className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* Строка поиска сверху (как в Telegram): назад (закрыть), поле,
          крестик очистки внутри. */}
      <div className="shrink-0 px-3 pt-[calc(env(safe-area-inset-top)+8px)]">
        <div className="flex items-center gap-2">
          <IconButton
            type="button"
            size="m"
            mode="gray"
            aria-label="Закрыть поиск"
            className="glass-fab h-11 w-11 shrink-0 items-center justify-center rounded-full! p-0! text-muted-foreground! btn-press"
            onClick={requestClose}
          >
            <Icon24ChevronLeft />
          </IconButton>
          {/* Обёртка нужна, чтобы поле тянулось в строке: className Input
              попадает на внутренний label, а не на корневой div. */}
          <div className="min-w-0 flex-1">
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') requestClose();
              }}
              onBlur={(e) => {
                // Фокус ушёл на элемент самой панели (тогл области, кнопка
                // очистки) — это не уход из поиска, панель не закрываем: без
                // этой проверки клик по тоглу закрывал поиск, потому что тап
                // по кнопке снимает фокус с пустого поля.
                if (e.relatedTarget !== null && rootRef.current?.contains(e.relatedTarget) === true) {
                  return;
                }
                // Фокус ушёл из панели, а запроса нет — закрываем поиск: режим
                // поиска живёт, пока в нём набирают текст (или он уже набран).
                if (query.trim() === '') requestClose();
              }}
              placeholder={mode === 'topic' && scopeLabel !== undefined ? `В топике «${scopeLabel}»` : 'Поиск заметок'}
              autoCapitalize="sentences"
              autoCorrect="off"
              className="bg-muted! input-press"
            />
          </div>
          {query !== '' && (
            <IconButton
              type="button"
              size="m"
              mode="plain"
              aria-label="Очистить"
              className="h-11 w-11 shrink-0 items-center justify-center rounded-full! p-0! text-muted-foreground! btn-press"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
            >
              <Icon24Close />
            </IconButton>
          )}
        </div>
      </div>

      {/* Тогл области поиска под инпутом: «В топике» (активный топик
          островка) / «Везде». onMouseDown preventDefault — нажатие по тоглу не
          должно снимать фокус с поля: иначе поле теряет blur, а с ним (при
          пустом запросе) закрывался и сам поиск. */}
      <div className="flex justify-center px-3 pt-2">
        <div className="flex items-center gap-1 rounded-full border border-border bg-muted p-1">
          {canScopeTopic && (
            <button
              type="button"
              aria-pressed={mode === 'topic'}
              className={`btn-press-wide flex h-8 items-center rounded-full px-3 text-sm transition-colors ${
                mode === 'topic' ? 'bg-primary text-white' : 'text-muted-foreground'
              }`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setMode('topic')}
            >
              В топике
            </button>
          )}
          <button
            type="button"
            aria-pressed={mode === 'global'}
            className={`btn-press-wide flex h-8 items-center rounded-full px-3 text-sm transition-colors ${
              mode === 'global' ? 'bg-primary text-white' : 'text-muted-foreground'
            }`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setMode('global')}
          >
            Везде
          </button>
        </div>
      </div>

      {/* Результаты — под строкой набора. Горизонтальный свайп по списку меняет
          область поиска («Везде» ← / → «В топике»); touch-pan-y оставляет
          вертикальный скролл браузеру, а горизонталь отдаёт нам. Клик по
          пустому месту закрывает поиск, только когда показывать нечего (нет
          данных под запрос): тап по карточкам обрабатывают сами карточки, а
          свайп смены режима поиск не сбрасывает. */}
      <div
        ref={resultsRef}
        className="scroll-area mt-2 flex-1 touch-pan-y overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)+16px)]"
        onPointerDown={onSwipeDown}
        onPointerMove={onSwipeMove}
        onPointerUp={onSwipeUp}
        onPointerCancel={onSwipeCancel}
        onClick={
          noResults
            ? () => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                requestClose();
              }
            : undefined
        }
      >
        {body}
      </div>
    </div>
  );
}
