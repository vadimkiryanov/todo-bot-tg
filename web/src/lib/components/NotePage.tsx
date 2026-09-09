// Полноэкранная «страница» заметки (как открытие чата в Telegram):
// въезжает слайдом поверх списка, назад — стрелка в шапке или свайп вправо.
//
// Текст заметки — большое редактируемое поле (как в нативных заметках):
// тапнул — сразу печатай, отдельной кнопки ✏️ нет. Пока поле не
// редактируется (не в фокусе и без правок) вместо markdown-разметки
// показывается отформатированный текст (заголовки # / ##, списки -,
// чеклист - [ ], жирный/курсив/код/ссылки из entities) — как заметка
// выглядит в чате; тап по тексту включает поле с курсором в месте тапа,
// тап по чекбоксу чеклиста переключает галочку без входа в поле.
// Кнопки «Сохранить»/«Отмена» появляются только когда текст изменён;
// панель форматирования — при фокусе поля или при изменённом тексте.
// Действия (✅/🔄/⏰/⋯) зависят от состояния заметки
// (active/done/archived). Закрытие с несохранённым текстом спрашивает:
// «Сохранить? / Не сохранять?».
//
// Мутации owner-aware: если заметка лежит в одном из списков стора
// (активный/архив/выполненные/таймеры), обновляется он; иначе (заметка
// открыта из уведомления, списки не загружены) — прямые API-вызовы с
// локальным состоянием. Каждая busy-кнопка показывает спиннер.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FocusEvent, MouseEvent, PointerEvent } from 'react';

import { ConfirmModal } from './ConfirmModal';
import { Modal } from './Modal';
import { MoveModal } from './MoveModal';
import { ReminderForm } from './ReminderForm';
import { Spinner } from './Spinner';
import {
  clearReminder as apiClearReminder,
  deleteNote as apiDeleteNote,
  setReminder as apiSetReminder,
  updateNote as apiUpdateNote,
} from '../api/notes';
import {
  archiveNote,
  clearReminder,
  hasLoadedNote,
  removeArchivedNote,
  removeDoneNote,
  removeNote,
  saveText,
  setPriority,
  setReminder,
  toggleDone,
  togglePin,
  unarchiveNote,
  undoneNote,
} from '../stores/notes';
import type { Note, ReminderRepeat } from '../types/api';
import {
  formatReminderAt,
  markdownDraftOffsets,
  markdownFromEntities,
  nextPriority,
  priorityEmoji,
  priorityLabel,
} from '../utils/format';
import { parseNoteLines, renderNoteBlocksHtml } from '../utils/blocks';

interface NotePageProps {
  note: Note;
  onClose: () => void;
}

/** Текст служебного узла структуры строки (буллет, чекбокс) — такого текста
    нет в контенте заметки, его нельзя считать в смещение тапа. */
function textInStructural(node: Node, block: HTMLElement): boolean {
  let el = node.parentElement;
  while (el !== null && el !== block) {
    const cls = el.classList;
    if (
      cls.contains('note-bullet') ||
      cls.contains('note-cb') ||
      cls.contains('note-cb-static')
    ) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

/** Символов контента до текстового узла в блоке строки (в порядке обхода). */
function textLengthBefore(block: HTMLElement, node: Node): number {
  const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let cur = walker.nextNode();
  while (cur !== null) {
    if (cur === node) return acc;
    if (!textInStructural(cur, block)) acc += (cur as Text).data.length;
    cur = walker.nextNode();
  }
  return acc;
}

/** Точка (clientX/Y) → смещение в контенте блока строки (или null, если
    попадание мимо текста — буллет, чекбокс, пустой блок). */
function contentCharAt(block: HTMLElement, x: number, y: number): number | null {
  const doc = block.ownerDocument;
  type DocWithCaret = Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
  };
  const d = doc as DocWithCaret;
  let node: Node | null = null;
  let offset = 0;
  const range = d.caretRangeFromPoint !== undefined ? d.caretRangeFromPoint(x, y) : null;
  if (range !== null) {
    node = range.startContainer;
    offset = range.startOffset;
  } else {
    const pos = d.caretPositionFromPoint !== undefined ? d.caretPositionFromPoint(x, y) : null;
    if (pos !== null) {
      node = pos.offsetNode;
      offset = pos.offset;
    }
  }
  if (node !== null) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (textInStructural(node, block)) return null;
      return textLengthBefore(block, node) + offset;
    }
    return null;
  }

  // Fallback (Safari): оценка по прямоугольникам текстовых узлов блока.
  // Перенос строки даёт несколько прямоугольников одного узла — делим длину
  // узла по ним примерно поровну.
  const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let cur = walker.nextNode();
  while (cur !== null) {
    const t = cur as Text;
    if (!textInStructural(t, block) && t.data.length > 0) {
      const r = doc.createRange();
      r.selectNodeContents(t);
      const rects = Array.from(r.getClientRects());
      r.detach();
      const n = Math.max(rects.length, 1);
      for (let j = 0; j < rects.length; j++) {
        const rect = rects[j];
        if (y < rect.top || y > rect.bottom) continue;
        if (x <= rect.left) return acc + Math.round((j * t.data.length) / n);
        if (x >= rect.right) return acc + Math.round(((j + 1) * t.data.length) / n);
        const ratio = Math.max(0, Math.min(1, (x - rect.left) / (rect.width || 1)));
        return (
          acc + Math.round((j * t.data.length) / n) + Math.round((ratio * t.data.length) / n)
        );
      }
      acc += t.data.length;
    }
    cur = walker.nextNode();
  }
  return null;
}

export function NotePage({ note, onClose }: NotePageProps) {
  // Живое состояние: при store-мутациях родитель передаёт обновлённый объект
  // из списка; для «чужой» заметки (из уведомления) обновляем локально.
  const [pageNote, setPageNote] = useState<Note>(note);
  useEffect(() => {
    if (note.id === pageNote.id && note !== pageNote) setPageNote(note);
  }, [note, pageNote]);

  // Заметка лежит в одном из списков стора? От этого зависит выбор
  // «store-мутация vs прямой API-вызов» в каждом действии.
  const owned = hasLoadedNote(pageNote.id);

  // ── Текст: поле с markdown-разметкой (правка) + просмотр с форматированием ─
  // В поле показываем markdown-разметку (**жирный** и т.п.), восстановленную
  // из entities сервера (markdownFromEntities) — как в старом редакторе.
  const saved = useMemo(
    () => markdownFromEntities(pageNote.text, pageNote.entities),
    [pageNote],
  );
  const [draft, setDraft] = useState<string>(() =>
    markdownFromEntities(note.text, note.entities),
  );
  /** Не-реактивная память: последнее значение, пришедшее снаружи. Пока draft
      не разошёлся с ним, внешние обновления (родитель передал обновлённую
      заметку) зеркалятся в draft; иначе локальные правки не затираются. */
  const lastSeenRef = useRef(draft);
  const dirty = draft !== saved;

  useEffect(() => {
    if (draft === lastSeenRef.current && draft !== saved) setDraft(saved);
    lastSeenRef.current = saved;
  }, [draft, saved]);

  /** Поле в фокусе: под ним показываем панель форматирования. */
  const [focused, setFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  /** Корневой узел панели форматирования (сниппет toolbar). */
  const toolbarElRef = useRef<HTMLDivElement | null>(null);
  /** Попытка закрыть страницу с несохранённым текстом: диалог «Сохранить?». */
  const [exitConfirm, setExitConfirm] = useState(false);

  // ── Просмотр с форматированием (когда поле не редактируется) ────────────
  // viewMode: поле не в фокусе и без правок. Слой прячем style:display (не
  // размонтированием), чтобы позиция скролла просмотра сохранялась при
  // переключениях «тапнул — редактирую — вышел из поля».
  const viewElRef = useRef<HTMLDivElement | null>(null);
  /** Курсор поля, запомненный тапом по просмотру (смещение в разметке). */
  const pendingCaretRef = useRef<number | null>(null);
  const viewMode = !focused && !dirty;

  // iOS не сжимает вьюпорт клавиатурой: поднимаем футер (тулбар и кнопки
  // «Сохранить/Отмена») над ней через visualViewport (как Modal).
  const [keyboardInset, setKeyboardInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = (): void => {
      setKeyboardInset(Math.max(0, window.innerHeight - vv.height));
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  // ── Анимация: слайд справа (въезд) / вправо (закрытие) ──────────────────
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // Двойной rAF: первый кадр — справа, второй — плавный въезд.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<number | undefined>(undefined);

  /** Закрыть страницу. С несохранённым текстом — сначала диалог. */
  function requestClose(): void {
    if (closing) return;
    if (dirty) {
      // Клавиатуру прячем: диалог должен быть виден целиком.
      textareaRef.current?.blur();
      setExitConfirm(true);
      return;
    }
    closeNow();
  }

  /** Непосредственное закрытие (после подтверждения/сохранения). */
  function closeNow(): void {
    if (closing) return;
    setClosing(true);
    if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => onClose(), 240);
  }

  // Таймер закрытия не должен сработать после размонтирования страницы.
  useEffect(
    () => () => {
      if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  /** Кнопка «Отмена»: вернуть текст к сохранённому (правки отменяются). */
  function discard(): void {
    if (saving) return;
    setDraft(saved);
    setError('');
  }

  /**
   * Фокус ушёл с поля. Панель форматирования прячем, только если фокус ушёл
   * за её пределы: тап по кнопке панели переводит фокус на кнопку, и без
   * этой проверки панель исчезала бы под пальцем ДО click («нажал на панель —
   * она пропала»), кнопки не срабатывали. Переход фокуса на кнопки тулбара
   * не даёт и onMouseDown preventDefault (см. toolbar); здесь страхуем
   * программные переходы — инпут ссылки (autofocus), Tab-навигацию.
   */
  function onEditorBlur(e: FocusEvent<HTMLTextAreaElement>): void {
    const next = e.relatedTarget;
    if (next instanceof Node && toolbarElRef.current?.contains(next)) return;
    setFocused(false);
  }

  /** Фокус вошёл в поле: если есть отложенный курсор от тапа по просмотру —
      применить в следующем кадре (после перерисовки вёрстки). */
  function onEditorFocus(): void {
    setFocused(true);
    const caret = pendingCaretRef.current;
    pendingCaretRef.current = null;
    if (caret === null) return;
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta === null) return;
      const at = Math.min(Math.max(0, caret), ta.value.length);
      ta.setSelectionRange(at, at);
    });
  }

  // ── Просмотр → поле: тап по тексту ставит курсор в то же место ──────────
  // Точка тапа → смещение в plain-тексте заметки (просмотр построен из него
  // по строкам), затем граница plain→разметка через markdownDraftOffsets.
  // В Chrome/Edge/Firefox offset даёт caretRangeFromPoint/caretPositionFromPoint
  // (отсюда положение в текстовом узле блока), в Safari его нет — оцениваем
  // по прямоугольникам текста блока. Служебные узлы структуры строки
  // (буллет «•», чекбокс) в контент не входят — их пропускаем.

  /** Тап по просмотру → смещение в plain-тексте заметки. */
  function tapTextOffset(e: MouseEvent<HTMLDivElement>): number {
    const view = viewElRef.current;
    const text = pageNote.text;
    if (view === null || text.length === 0) return text.length;
    const target = e.target as HTMLElement | null;
    if (target === null) return text.length;
    // Блок строки — прямой ребёнок контейнера просмотра: у renderNoteBlocksHtml
    // блоки идут в том же порядке, что и строки разметки (parseNoteLines).
    let block: HTMLElement = target;
    while (block.parentElement !== null && block.parentElement !== view) {
      block = block.parentElement;
    }
    if (block.parentElement !== view) return text.length; // пустое место контейнера
    const index = Array.prototype.indexOf.call(view.children, block);
    if (index < 0) return text.length;
    const lines = parseNoteLines(text);
    if (index >= lines.length) return text.length;
    const line = lines[index];
    const contentStart = line.start + line.markerLen;
    const within = contentCharAt(block, e.clientX, e.clientY);
    if (within === null) return contentStart; // тап по буллету/чекбоксу/пустому месту
    return Math.min(line.end, contentStart + within);
  }

  /** Тап по просмотру: включить поле и поставить курсор в место тапа. */
  function startEditAt(e: MouseEvent<HTMLDivElement>): void {
    const plain = tapTextOffset(e);
    pendingCaretRef.current =
      markdownDraftOffsets(pageNote.text, pageNote.entities)[plain] ?? null;
    textareaRef.current?.focus();
  }

  /** Клик по просмотру: чекбокс чеклиста — переключить «[ ]»↔«[x]» и
      сохранить, не входя в поле; ссылка — открывается браузером (поле не
      включаем); остальной тап — включить поле с курсором в месте тапа. */
  function onViewClick(e: MouseEvent<HTMLDivElement>): void {
    const target = e.target as Element | null;
    const cb = target?.closest('[data-cb]');
    if (cb instanceof HTMLElement) {
      const pos = Number(cb.dataset.cb);
      if (!Number.isNaN(pos)) {
        e.preventDefault();
        void toggleCheck(pos);
      }
      return;
    }
    if (target?.closest('a[href]')) return;
    e.preventDefault();
    startEditAt(e);
  }

  /** Переключить галочку чеклиста из просмотра («- [ ] » → «- [x] » и
      обратно): тап не входит в поле, правка сохраняется как обычная. Маркеры
      одинаковой длины — entities и их офсеты не сдвигаются. */
  async function toggleCheck(pos: number): Promise<void> {
    const text = pageNote.text;
    if (
      text.charAt(pos) !== '-' ||
      text.charAt(pos + 1) !== ' ' ||
      text.charAt(pos + 2) !== '['
    ) {
      return;
    }
    const box = text.charAt(pos + 3);
    if ((box !== ' ' && box !== 'x') || text.charAt(pos + 4) !== ']') return;
    const value = text.slice(0, pos + 3) + (box === 'x' ? ' ' : 'x') + text.slice(pos + 4);
    if (value === text) return;
    setSaving(true);
    setError('');
    try {
      if (owned) {
        await saveText(pageNote, value);
      } else {
        const updated = await apiUpdateNote(pageNote.id, { text: value });
        setPageNote(updated);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка');
    } finally {
      setSaving(false);
    }
  }

  /** Сохранить текст; closeAfter — закрыть страницу после успеха. */
  async function save(closeAfter: boolean): Promise<void> {
    const value = draft.trim();
    if (value === '') {
      setError('текст не может быть пустым');
      return;
    }
    if (value === pageNote.text) {
      // Правки «схлопнулись» в исходный текст (например, лишние пробелы в
      // конце) — сеть не дёргаем, просто возвращаем поле к сохранённому виду.
      setDraft(saved);
      if (closeAfter) closeNow();
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (owned) {
        await saveText(pageNote, value);
      } else {
        const updated = await apiUpdateNote(pageNote.id, { text: value });
        setPageNote(updated);
      }
      if (closeAfter) closeNow();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка');
    } finally {
      setSaving(false);
    }
  }

  // ── Свайп вправо — закрыть (страница едет за пальцем) ───────────────────
  const SWIPE_CLOSE_PX = 90;
  const FLING_PX_MS = 0.4;
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  // Параметры жеста — в ref: pointermove меняет drag (state) и вызывает
  // перерисовку, «память» жеста (стартовая точка, ось, скорость) должна
  // переживать рендеры между событиями.
  const swipe = useRef({
    pointer: false,
    axis: null as 'h' | 'v' | null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastT: 0,
    vx: 0,
  });

  function onPointerDown(e: PointerEvent<HTMLDivElement>): void {
    if (e.pointerType !== 'touch' || closing) return;
    // textarea намеренно НЕ в исключении: свайп вправо по тексту закрывает
    // страницу, как жест «назад» поверх контента. Вертикальный скролл поля
    // остаётся нативным (touch-action: pan-y на textarea).
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, [data-no-swipe]')) return;
    const s = swipe.current;
    s.pointer = true;
    s.startX = e.clientX;
    s.startY = e.clientY;
    s.axis = null;
    s.lastX = e.clientX;
    s.lastT = performance.now();
    s.vx = 0;
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>): void {
    const s = swipe.current;
    // Жест живёт только между принятым pointerdown и pointerup: без этого
    // движения мыши по открытой странице (кнопка не нажата) считались бы
    // свайпом от точки (0,0) — страница едет за курсором.
    if (!s.pointer || closing) return;
    if (s.axis === null) {
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        s.axis = 'h';
        setDragging(true);
      } else if (Math.abs(dy) > 8) {
        s.axis = 'v';
      }
    }
    if (s.axis !== 'h' || closing) return;
    const now = performance.now();
    const dt = now - s.lastT;
    const inst = (e.clientX - s.lastX) / Math.max(dt, 1);
    s.vx = dt > 48 ? inst : s.vx * 0.6 + inst * 0.4;
    s.lastX = e.clientX;
    s.lastT = now;
    // Вправо — уводим страницу; влево — «резинка» с сопротивлением.
    // Округление до целых px: субпиксельный transform дёргает эмодзи-глифы.
    const dx = e.clientX - s.startX;
    setDrag(Math.round(dx > 0 ? dx : dx * 0.3));
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>): void {
    const s = swipe.current;
    s.pointer = false;
    if (s.axis !== 'h' || closing) return;
    const dx = e.clientX - s.startX;
    const close = dx >= SWIPE_CLOSE_PX || s.vx >= FLING_PX_MS;
    if (close) requestClose();
    else setDrag(0);
    s.axis = null;
    setDragging(false);
  }

  function onPointerCancel(): void {
    const s = swipe.current;
    s.pointer = false;
    s.axis = null;
    setDragging(false);
    setDrag(0);
  }

  // ── Состояние и действия ────────────────────────────────────────────────
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [showReminderForm, setShowReminderForm] = useState(false);
  // Меню «⋯» (закрепить/переместить/архив/удалить): позиция у правого края
  // кнопки, раскрывается вверх над доком.
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ right: 12, bottom: 96 });
  type BusyKey = 'done' | 'priority' | 'pin' | 'reminder' | 'delete' | 'archive';
  const [busy, setBusy] = useState<BusyKey | null>(null);

  const isDone = pageNote.done;
  const isArchived = pageNote.archived;
  const isActive = !isDone && !isArchived;
  // «Переместить» — для любой активной заметки: MoveModal сама показывает
  // папки выбранного топика (условие «в топике есть папки» не нужно).
  const canMove = isActive;

  /**
   * Выполнить действие: store-мутация (заметка в списках) либо прямой API-вызов
   * (страница из уведомления). closeAfter — действие «уводит» заметку с экрана.
   */
  async function act(
    key: BusyKey,
    store: () => Promise<void>,
    api: () => Promise<Note | void>,
    closeAfter: boolean,
  ): Promise<void> {
    if (busy !== null) return;
    setBusy(key);
    setError('');
    try {
      if (owned) {
        await store();
      } else {
        const fromApi = await api();
        if (fromApi !== undefined && fromApi !== null) setPageNote(fromApi);
      }
      if (closeAfter) requestClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка');
    } finally {
      setBusy(null);
    }
  }

  function doToggleDone(): void {
    void act(
      'done',
      () => toggleDone(pageNote),
      () => apiUpdateNote(pageNote.id, { done: true }),
      true,
    );
  }

  function doUndone(): void {
    void act(
      'done',
      () => undoneNote(pageNote),
      () => apiUpdateNote(pageNote.id, { done: false }),
      true,
    );
  }

  function doUnarchive(): void {
    void act(
      'archive',
      () => unarchiveNote(pageNote),
      () => apiUpdateNote(pageNote.id, { archived: false }),
      true,
    );
  }

  function doArchive(): void {
    void act(
      'archive',
      () => archiveNote(pageNote),
      () => apiUpdateNote(pageNote.id, { archived: true }),
      true,
    );
  }

  function doCyclePriority(): void {
    const next = nextPriority(pageNote.priority);
    void act(
      'priority',
      () => setPriority(pageNote, next),
      () => apiUpdateNote(pageNote.id, { priority: next }),
      false,
    );
  }

  function doTogglePin(): void {
    void act(
      'pin',
      () => togglePin(pageNote),
      () => apiUpdateNote(pageNote.id, { pinned: !pageNote.pinned }),
      false,
    );
  }

  function doDelete(): void {
    void act(
      'delete',
      () =>
        isArchived
          ? removeArchivedNote(pageNote)
          : isDone
            ? removeDoneNote(pageNote)
            : removeNote(pageNote),
      () => apiDeleteNote(pageNote.id),
      true,
    );
  }

  /** Открыть ⋯-меню у кнопки: низ меню — над доком, правый край — у кнопки. */
  function openMenu(e: MouseEvent<HTMLButtonElement>): void {
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPos({
      right: Math.max(8, window.innerWidth - rect.right),
      bottom: Math.max(8, window.innerHeight - rect.top + 6),
    });
    setMenuOpen(true);
    setError('');
  }

  function closeMenu(): void {
    setMenuOpen(false);
  }

  /** Выбрать пункт меню: закрыть меню и выполнить действие. */
  function pickMenu(action: () => void): void {
    setMenuOpen(false);
    action();
  }

  /** Сохранить напоминание (из ReminderForm). */
  async function onReminderSubmit(iso: string, repeat: ReminderRepeat): Promise<void> {
    await act(
      'reminder',
      () => setReminder(pageNote, iso, repeat),
      () => apiSetReminder(pageNote.id, iso, repeat),
      false,
    );
  }

  function doClearReminder(): void {
    void act(
      'reminder',
      () => clearReminder(pageNote),
      () => apiClearReminder(pageNote.id),
      false,
    );
  }

  /** Отложить на N минут, сохраняя тип повторения. */
  async function snooze(minutes: number): Promise<void> {
    const at = new Date(Date.now() + minutes * 60_000).toISOString();
    await onReminderSubmit(at, pageNote.reminder_repeat);
  }

  function toggleReminderForm(): void {
    setShowReminderForm((v) => !v);
    setError('');
  }

  // ── Форматирование: обёртки выделения markdown-маркерами ────────────────
  // Работают с полем текста (draft). Кнопки: **жирный**, *курсив*, `код`,
  // [ссылка](url); строковые маркеры # / ## / - / - [ ] — по текущей строке.
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const linkInputRef = useRef<HTMLInputElement | null>(null);

  function selection(): { start: number; end: number } {
    const ta = textareaRef.current;
    if (!ta) return { start: 0, end: 0 };
    return { start: ta.selectionStart ?? 0, end: ta.selectionEnd ?? 0 };
  }

  /** Обернуть выделение маркерами; пустое выделение — вставить с плейсхолдером. */
  function wrap(open: string, close: string, placeholder = 'текст'): void {
    const { start, end } = selection();
    const sel = draft.slice(start, end);
    const inner = sel === '' ? placeholder : sel;
    setDraft(draft.slice(0, start) + open + inner + close + draft.slice(end));
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      const selStart = start + open.length;
      textareaRef.current?.setSelectionRange(selStart, selStart + inner.length);
    });
  }

  function toggleLink(): void {
    setLinkOpen((v) => {
      if (!v) {
        requestAnimationFrame(() => linkInputRef.current?.focus());
      }
      return !v;
    });
  }

  /** Ссылка: [выделение](url), без выделения — [ссылка](url). */
  function applyLink(): void {
    const url = linkUrl.trim();
    if (url === '') return;
    const { start, end } = selection();
    const sel = draft.slice(start, end);
    const label = sel === '' ? 'ссылка' : sel;
    setDraft(draft.slice(0, start) + `[${label}](${url})` + draft.slice(end));
    setLinkOpen(false);
    setLinkUrl('');
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      // Курсор — после ]( (перед url), чтобы дописать/поправить адрес.
      const caret = start + label.length + 2;
      textareaRef.current?.setSelectionRange(caret, caret);
    });
  }

  const LINE_MARKERS = {
    h1: '# ',
    h2: '## ',
    list: '- ',
    check: '- [ ] ',
  } as const;
  type LineMarkerKind = keyof typeof LINE_MARKERS;

  /** Границы строки под курсором (без учёта выделения в другие строки). */
  function currentLine(): { start: number; end: number } {
    const ta = textareaRef.current;
    if (!ta) return { start: 0, end: 0 };
    const caret = ta.selectionStart ?? 0;
    const start = draft.lastIndexOf('\n', caret - 1) + 1;
    const nl = draft.indexOf('\n', caret);
    return { start, end: nl === -1 ? draft.length : nl };
  }

  /** Структурный маркер в начале строки, если есть (любой из четырёх). */
  function existingMarker(
    raw: string,
  ): { kind: LineMarkerKind; marker: string } | null {
    const defs: [LineMarkerKind, string][] = [
      ['check', '- [x] '],
      ['check', '- [ ] '],
      ['list', '- '],
      ['h2', '## '],
      ['h1', '# '],
    ];
    for (const [kind, marker] of defs) {
      if (raw.startsWith(marker)) return { kind, marker };
    }
    return null;
  }

  /** Поставить/снять маркер строки: один клик — маркер, повторный — убрать. */
  function toggleLineMarker(kind: LineMarkerKind): void {
    const { start, end } = currentLine();
    const caret = textareaRef.current?.selectionStart ?? start;
    const raw = draft.slice(start, end);
    const cur = existingMarker(raw);
    const target = LINE_MARKERS[kind];

    let newLine: string;
    let delta: number;
    if (cur !== null && cur.marker === target) {
      // Тот же маркер уже стоит — снимаем.
      newLine = raw.slice(cur.marker.length);
      delta = -cur.marker.length;
    } else if (cur !== null) {
      // Другой структурный маркер — заменяем на нужный.
      newLine = target + raw.slice(cur.marker.length);
      delta = target.length - cur.marker.length;
    } else {
      newLine = target + raw;
      delta = target.length;
    }
    setDraft(draft.slice(0, start) + newLine + draft.slice(end));
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      const inLine = Math.min(Math.max(caret - start + delta, 0), newLine.length);
      textareaRef.current?.setSelectionRange(start + inLine, start + inLine);
    });
  }

  // Escape: диалог → меню → форму напоминания → закрыть страницу (при
  // изменённом тексте requestClose покажет диалог «Сохранить?»).
  // Слушатель вешается один раз; «свежая» версия обработчика (с текущими
  // значениями состояний) подставляется через ref на каждом рендере.
  const keydownStateRef = useRef({
    exitConfirm,
    menuOpen,
    showReminderForm,
    requestClose,
    closeMenu,
  });
  keydownStateRef.current = { exitConfirm, menuOpen, showReminderForm, requestClose, closeMenu };

  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const s = keydownStateRef.current;
      if (s.exitConfirm) {
        setExitConfirm(false);
        setError('');
        return;
      }
      if (s.menuOpen) {
        s.closeMenu();
        return;
      }
      if (s.showReminderForm) {
        setShowReminderForm(false);
        return;
      }
      s.requestClose();
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, []);

  // Слайд-трансформация: до появления и при закрытии страница справа за
  // экраном; в покое (после въезда) — на месте, сдвиг — за пальцем.
  const transform = !visible || closing ? 'translate3d(100%,0,0)' : `translate3d(${drag}px,0,0)`;

  // HTML просмотра (блоки строк). Считаем один раз на изменение текста/состояния:
  // renderNoteBlocksHtml каждый раз пересоздаёт строку — не хочется дергать её
  // на каждом кадре свайпа. Пустой текст — та же подсказка, что и в поле.
  const viewHtml = useMemo(() => {
    if (pageNote.text === '') return '<p class="text-muted-foreground">Начните печатать…</p>';
    return renderNoteBlocksHtml(pageNote.text, pageNote.entities, isActive);
  }, [pageNote.text, pageNote.entities, isActive]);

  const reminderAt = pageNote.reminder_at;

  // ── Панель форматирования (snippet toolbar) ─────────────────────────────
  // Рендерится в двух местах футера (правки / фокус поля), одновременно —
  // только в одном, поэтому один JSX-элемент можно подставлять дважды.
  // Корневой узел: onEditorBlur по нему отличает «фокус ушёл на панель» от
  // «ушёл совсем» (панель не исчезает под пальцем).
  const toolbar = (
    <div ref={toolbarElRef} className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          aria-label="Жирный (**текст**)"
          title="Жирный"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-[15px] transition-colors active:bg-border/60"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => wrap('**', '**')}
        >
          <span className="font-bold">B</span>
        </button>
        <button
          type="button"
          aria-label="Курсив (*текст*)"
          title="Курсив"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-[15px] transition-colors active:bg-border/60"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => wrap('*', '*')}
        >
          <span className="italic">I</span>
        </button>
        <button
          type="button"
          aria-label="Код (`текст`)"
          title="Код"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted font-mono text-[13px] transition-colors active:bg-border/60"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => wrap('`', '`', 'код')}
        >
          {'</>'}
        </button>
        <button
          type="button"
          aria-label="Ссылка ([текст](url))"
          title="Ссылка"
          className={`flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-[15px] transition-colors active:bg-border/60 ${
            linkOpen ? 'bg-border/60' : ''
          }`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleLink}
        >
          🔗
        </button>
        <span className="mx-0.5 h-6 w-px bg-border" aria-hidden="true"></span>
        <button
          type="button"
          aria-label="Заголовок (# в начале строки)"
          title="Заголовок"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-[15px] font-bold transition-colors active:bg-border/60"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => toggleLineMarker('h1')}
        >
          {'# '}
        </button>
        <button
          type="button"
          aria-label="Подзаголовок (## в начале строки)"
          title="Подзаголовок"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-[15px] font-semibold transition-colors active:bg-border/60"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => toggleLineMarker('h2')}
        >
          {'##'}
        </button>
        <button
          type="button"
          aria-label="Список (- в начале строки)"
          title="Список"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-[17px] transition-colors active:bg-border/60"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => toggleLineMarker('list')}
        >
          ••
        </button>
        <button
          type="button"
          aria-label="Чеклист (- [ ] в начале строки)"
          title="Чеклист"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-[15px] transition-colors active:bg-border/60"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => toggleLineMarker('check')}
        >
          ☑
        </button>
      </div>

      {linkOpen && (
        <div className="flex items-center gap-2">
          <input
            ref={linkInputRef}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            type="url"
            placeholder="https://…"
            autoFocus
            className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-muted px-3 text-sm outline-none focus:border-ring"
          />
          <button
            type="button"
            className="h-10 shrink-0 rounded-xl bg-primary px-4 text-sm font-medium text-white disabled:opacity-40"
            disabled={linkUrl.trim() === ''}
            onMouseDown={(e) => e.preventDefault()}
            onClick={applyLink}
          >
            Вставить
          </button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        # заголовок · ## подзаголовок · - список · - [ ] чеклист · **жирный**, *курсив*, `код`,
        [ссылка](https://…)
      </p>
    </div>
  );

  return (
    <>
    <div
      className={`notepage fixed inset-0 z-[70] flex touch-pan-y flex-col bg-background ${
        !dragging && !closing ? 'notepage-settle' : ''
      }`}
      style={{ transform }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Заметка"
    >
      {/* Шапка как у чата: назад + статус */}
      <header className="flex shrink-0 items-center justify-between border-b border-border px-3 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          aria-label="Назад"
          className="flex h-10 w-10 items-center justify-center rounded-full text-lg active:bg-border/50"
          onClick={requestClose}
        >
          ←
        </button>
        <span className="truncate px-2 text-sm text-muted-foreground">
          {isDone ? '✅ Выполнена' : isArchived ? '🗄 Архив' : '📝 Заметка'}
        </span>
        <span className="w-10"></span>
      </header>

      {/* Текст заметки: под полем (всегда в markdown-разметке, скролл свой)
          лежит «просмотр» — отформатированный текст, видимый, пока поле не
          редактируется (не в фокусе и без правок). Просмотр поверх поля,
          прячется display:none (не размонтируется) — своя позиция скролла
          сохраняется при переключениях. Тап по тексту включает поле с курсором
          в месте тапа; чекбоксы чеклиста и ссылки работают без входа в поле.
          touch-pan-y: вертикальный скролл нативный, горизонтальный свайп
          (закрытие страницы) достаётся корневому контейнеру. */}
      <main className="relative min-h-0 flex-1">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={onEditorFocus}
          onBlur={onEditorBlur}
          className="absolute inset-0 h-full w-full resize-none touch-pan-y overflow-y-auto whitespace-pre-wrap bg-background px-4 py-4 text-[16px] leading-6 text-foreground caret-primary outline-none placeholder:text-muted-foreground"
          placeholder="Начните печатать…"
        ></textarea>

        <div
          ref={viewElRef}
          className={`absolute inset-0 touch-pan-y overflow-y-auto whitespace-pre-wrap break-words bg-background px-4 py-4 text-[16px] leading-6 text-foreground [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-border/40 [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-border/40 [&_pre]:p-2 ${
            isDone ? 'note-done' : ''
          }`}
          style={{ display: viewMode ? 'block' : 'none' }}
          onClick={onViewClick}
          dangerouslySetInnerHTML={{ __html: viewHtml }}
        ></div>
      </main>

      <footer
        data-no-swipe
        className="shrink-0 border-t border-border bg-background px-3 pt-2"
        style={{ paddingBottom: `calc(${keyboardInset}px + env(safe-area-inset-bottom))` }}
      >
        {error !== '' && <p className="px-1 pb-2 text-xs text-destructive">{error}</p>}

        {dirty ? (
          // Текст изменён: вместо ряда действий — «Отмена» и «Сохранить»
          // (появляются, только когда есть несохранённые правки, как в
          // нативных заметках). Ряд действий скрыт: тап по ✅/⋯ не должен
          // «увести» несохранённый текст.
          <div className="flex flex-col gap-3 pb-1">
            {toolbar}
            <div className="flex gap-2">
              <button
                type="button"
                className="h-11 flex-1 rounded-xl border border-border text-sm"
                disabled={saving}
                onClick={discard}
              >
                Отмена
              </button>
              <button
                type="button"
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-white"
                disabled={saving}
                onClick={() => void save(false)}
              >
                {saving ? <Spinner size="16px" /> : 'Сохранить'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {focused && (
              // Поле в фокусе (клавиатура открыта): панель форматирования.
              <div className="flex flex-col gap-1.5 pb-1">{toolbar}</div>
            )}

            {isActive && showReminderForm ? (
              <ReminderForm
                initial={reminderAt ?? ''}
                initialRepeat={pageNote.reminder_repeat}
                busy={busy === 'reminder'}
                onSubmit={onReminderSubmit}
                onSaved={() => {
                  setShowReminderForm(false);
                }}
                onCancel={() => {
                  setShowReminderForm(false);
                }}
              />
            ) : (
              <>
                {isActive && reminderAt !== null && (
                  <div className="mb-2 flex flex-col gap-1.5 rounded-xl border border-border bg-muted px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm" title={reminderAt}>
                        ⏰ {formatReminderAt(reminderAt, pageNote.reminder_repeat)}
                      </span>
                      <button
                        type="button"
                        className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors active:bg-border/60"
                        disabled={busy !== null}
                        onClick={doClearReminder}
                      >
                        {busy === 'reminder' ? <Spinner size="14px" /> : 'Снять'}
                      </button>
                    </div>
                    <div className="flex gap-1.5">
                      {[15, 30, 60].map((minutes) => (
                        <button
                          key={minutes}
                          type="button"
                          className="h-8 flex-1 rounded-lg border border-border bg-muted text-xs transition-transform active:scale-95"
                          disabled={busy !== null}
                          onClick={() => void snooze(minutes)}
                        >
                          +{minutes === 60 ? '1ч' : `${minutes}м`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Док действий: закреплён под контентом, главные кнопки всегда
                    видны (✅/↩️ выполнить, 🔄 приоритет, ⏰ напомнить); остальное
                    (📌, 📂 Переместить, 🗄 В архив, 🗑 Удалить) — в меню ⋯.
                    data-no-swipe: свайп по кнопкам не закрывает страницу. */}
                <div className="flex items-center justify-between gap-1">
                  {isActive || isDone ? (
                    <button
                      type="button"
                      aria-label={isDone ? 'Вернуть в работу' : 'Выполнить'}
                      className={`flex h-12 w-12 items-center justify-center rounded-full text-xl transition-transform active:scale-90 ${
                        isDone ? 'bg-border/60' : 'bg-primary/15'
                      }`}
                      disabled={busy !== null}
                      onClick={isDone ? doUndone : doToggleDone}
                    >
                      {busy === 'done' ? <Spinner /> : isDone ? '↩️' : '✅'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label="Вернуть из архива"
                      className="flex h-12 items-center gap-2 rounded-full bg-primary/15 px-5 text-base disabled:opacity-50"
                      disabled={busy !== null}
                      onClick={doUnarchive}
                    >
                      {busy === 'archive' ? <Spinner /> : '↩️'} Вернуть из архива
                    </button>
                  )}

                  <div className="flex items-center gap-1">
                    {isActive && (
                      <>
                        <button
                          type="button"
                          aria-label={`Приоритет: ${priorityLabel(pageNote.priority)}`}
                          title={`Приоритет: ${priorityLabel(pageNote.priority)}`}
                          className="flex h-12 min-w-12 items-center justify-center gap-0.5 rounded-full bg-muted px-2 text-base transition-transform active:scale-90"
                          disabled={busy !== null}
                          onClick={doCyclePriority}
                        >
                          {busy === 'priority' ? (
                            <Spinner />
                          ) : (
                            <>🔄{priorityEmoji(pageNote.priority)}</>
                          )}
                        </button>
                        <button
                          type="button"
                          aria-label={
                            reminderAt !== null ? 'Изменить напоминание' : 'Напомнить'
                          }
                          title={reminderAt !== null ? 'Изменить напоминание' : 'Напомнить'}
                          className={`flex h-12 w-12 items-center justify-center rounded-full text-lg transition-transform active:scale-90 ${
                            reminderAt !== null ? 'bg-primary/15' : 'bg-muted'
                          }`}
                          disabled={busy !== null}
                          onClick={toggleReminderForm}
                        >
                          ⏰
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      aria-label="Ещё действия"
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-xl transition-transform active:scale-90"
                      disabled={busy !== null}
                      onClick={openMenu}
                    >
                      ⋯
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </footer>
    </div>

    {/* Меню ⋯: подложка + панель у кнопки (всегда над футером). */}
    {menuOpen && (
      <>
        <div
          className="backdrop-glass backdrop-anim fixed inset-0 z-[71] bg-black/40"
          onClick={closeMenu}
          aria-hidden="true"
        ></div>
        <div
          className="glass-menu menu-anim fixed z-[72] flex w-56 flex-col gap-1 rounded-2xl p-2 shadow-xl"
          style={{ right: `${menuPos.right}px`, bottom: `${menuPos.bottom}px` }}
          role="menu"
        >
          {isActive && (
            <>
              <button
                type="button"
                role="menuitem"
                className="flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[15px] transition-colors active:bg-border/50"
                onClick={() => pickMenu(doTogglePin)}
              >
                <span className="w-6 shrink-0 text-center text-base">📌</span>
                <span className="truncate">{pageNote.pinned ? 'Открепить' : 'Закрепить'}</span>
              </button>
              {canMove && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[15px] transition-colors active:bg-border/50"
                  onClick={() =>
                    pickMenu(() => {
                      setShowMove(true);
                      setError('');
                    })
                  }
                >
                  <span className="w-6 shrink-0 text-center text-base">📂</span>
                  <span className="truncate">Переместить</span>
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className="flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[15px] transition-colors active:bg-border/50"
                onClick={() => pickMenu(doArchive)}
              >
                <span className="w-6 shrink-0 text-center text-base">🗄</span>
                <span className="truncate">В архив</span>
              </button>
            </>
          )}
          <button
            type="button"
            role="menuitem"
            className="flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[15px] text-destructive transition-colors active:bg-destructive/10"
            onClick={() =>
              pickMenu(() => {
                setConfirmDelete(true);
                setError('');
              })
            }
          >
            <span className="w-6 shrink-0 text-center text-base">🗑</span>
            <span className="truncate">Удалить</span>
          </button>
        </div>
      </>
    )}

    {confirmDelete && (
      <ConfirmModal
        title="Удалить заметку?"
        text="Заметка будет удалена безвозвратно"
        z="z-[80]"
        busy={busy === 'delete'}
        error={error}
        onClose={() => {
          setConfirmDelete(false);
          setError('');
        }}
        onConfirm={doDelete}
      />
    )}

    {exitConfirm && (
      <Modal
        open
        z="z-[80]"
        onClose={() => {
          setExitConfirm(false);
          setError('');
        }}
      >
        <div className="flex flex-col gap-4 px-1 py-2">
          <div>
            <h2 className="text-lg font-semibold">Несохранённые изменения</h2>
            <p className="mt-1 text-sm text-muted-foreground">Сохранить текст заметки перед закрытием?</p>
          </div>
          {error !== '' && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="button"
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-white disabled:opacity-50"
            disabled={saving}
            onClick={() => void save(true)}
          >
            {saving ? <Spinner size="16px" /> : 'Сохранить'}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className="h-11 flex-1 rounded-xl border border-border text-sm disabled:opacity-50"
              disabled={saving}
              onClick={() => {
                setExitConfirm(false);
                setError('');
              }}
            >
              Отмена
            </button>
            <button
              type="button"
              className="h-11 flex-1 rounded-xl border border-border text-sm text-destructive disabled:opacity-50"
              disabled={saving}
              onClick={() => {
                setExitConfirm(false);
                setError('');
                closeNow();
              }}
            >
              Не сохранять
            </button>
          </div>
        </div>
      </Modal>
    )}

    {showMove && (
      <MoveModal
        note={pageNote}
        z="z-[80]"
        onClose={() => {
          setShowMove(false);
          requestClose();
        }}
      />
    )}
    </>
  );
}
