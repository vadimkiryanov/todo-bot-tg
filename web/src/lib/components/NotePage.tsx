// Полноэкранная «страница» заметки (как открытие чата в Telegram):
// въезжает слайдом поверх списка, назад — стрелка в шапке или свайп вправо.
//
// Текст заметки — редактируемое поле с markdown-разметкой. Как оно
// включается, выбирается в настройках (stores/settings.editorMode):
//   'tap'    — тапнул по тексту и сразу печатай; пока поле не в фокусе и
//              без правок, вместо разметки показывается отформатированный
//              текст (заголовки # / ##, списки -, чеклист - [ ], жирный/
//              курсив/код/ссылки из entities); тап по чекбоксу чеклиста
//              переключает галочку без входа в поле; курсор встаёт в место тапа;
//   'toggle' — превью и правка переключаются кнопкой ✏️/👁 в шапке, тап по
//              тексту ничего не меняет (защита от случайной правки).
// Как выглядит сама правка, тоже настройка (stores/settings.editorView):
//   'formatted' — текст правится прямо в вёрстке просмотра (contenteditable):
//                 те же блоки и те же классы, символы разметки заменены
//                 оформлением, поэтому при входе в правку текст не меняет ни
//                 размеров, ни положения — по умолчанию;
//   'plain'     — текст с markdown-разметкой, как раньше.
// Кнопки «Сохранить»/«Отмена» появляются только когда текст изменён; после
// сохранения страница возвращается в просмотр (правка закрывается).
// Панель форматирования (кнопки оформления и подсказка) показывается только
// когда включена настройкой (stores/settings.formatPanel) и есть повод: поле
// в фокусе либо включён режим правки кнопкой ✏️.
// Кроме футера, в правке без разметки оформление доступно и у самого
// выделения: выделил текст — над ним появляется своя панель (как в Telegram),
// теми же кнопками. В узком экране кнопки не влезают — панель листается вбок
// пальцем. Системное меню «скопировать/вырезать» она не заменяет — на телефоне
// оно показывается рядом, отключить его нельзя.
// Enter переносит формат строки на новую строку (# / ## / 1. / - / - [ ]),
// Shift+Enter — обычный перенос. В просмотре текст можно выделять (десктоп):
// выделение не включает правку, иначе фокус поля сбрасывал бы его.
// Действия (✅/🔄/⏰/⋯) зависят от состояния заметки
// (active/done/archived). Закрытие с несохранённым текстом спрашивает:
// «Сохранить? / Не сохранять?».
//
// Мутации owner-aware: если заметка лежит в одном из списков стора
// (активный/архив/выполненные/таймеры), обновляется он; иначе (заметка
// открыта из уведомления, списки не загружены) — прямые API-вызовы с
// локальным состоянием. Каждая busy-кнопка показывает спиннер.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { toggleNoteExpanded, useNoteViewStore } from '../stores/noteView';
import { useSettingsStore } from '../stores/settings';
import type { Note, ReminderRepeat } from '../types/api';
import {
  formatReminderAt,
  markdownDraftOffsets,
  nextPriority,
  parseMarkdown,
  priorityEmoji,
  priorityLabel,
} from '../utils/format';
import { parseNoteLines, lineContinuation, renderNoteBlocksHtml } from '../utils/blocks';
import {
  applyInlineFormat,
  applyTypedMarkerRule,
  backspaceAtBlockStart,
  currentRange,
  deleteAtBlockEnd,
  editorBlockAt,
  focusEditorEnd,
  insertPlainText,
  noteToRich,
  placeCaretAtPlainOffset,
  restoreRange,
  richBlockOf,
  richDraftOf,
  richEditorHtml,
  richMarkdown,
  splitBlockOnEnter,
  toggleBlockChecked,
  toggleBlockKind,
} from '../utils/richtext';
import { revealRect, textareaCaretRect } from '../utils/scroll';

interface NotePageProps {
  note: Note;
  /** Открыть страницу сразу в режиме редактирования (кнопка ✏️ панели ввода
      и «полный редактор»): поле в фокусе, панель форматирования на месте. */
  startEditing?: boolean;
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

/** Классы текста заметки: одни и те же у слоя просмотра и у слоя правки
    ('formatted'). Поэтому вход в правку не меняет ни размер шрифта, ни
    отступов, ни положения текста — открывается тот же текст, но живой. */
const NOTE_TEXT_CLASS =
  'absolute inset-0 touch-pan-y overflow-y-auto whitespace-pre-wrap break-words bg-background px-4 py-4 text-[16px] leading-6 text-foreground [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-border/40 [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-border/40 [&_pre]:p-2';

/** Структурный маркер строки для панели форматирования: в разметке ('plain')
    это «# »-маркер в начале строки, в живой вёрстке — вид блока. */
type MarkerKind = 'h1' | 'h2' | 'ol' | 'list' | 'check';

export function NotePage({ note, startEditing = false, onClose }: NotePageProps) {
  // Живое состояние: при store-мутациях родитель передаёт обновлённый объект
  // из списка; для «чужой» заметки (из уведомления) обновляем локально.
  const [pageNote, setPageNote] = useState<Note>(note);
  useEffect(() => {
    if (note.id === pageNote.id && note !== pageNote) setPageNote(note);
  }, [note, pageNote]);

  // Заметка лежит в одном из списков стора? От этого зависит выбор
  // «store-мутация vs прямой API-вызов» в каждом действии.
  const owned = hasLoadedNote(pageNote.id);

  // ── Текст: правка (живая вёрстка либо markdown) + просмотр ──────────────
  // Заметка живёт в двух видах: block-модель (text + entities) и markdown-строка.
  // Правка ведётся в markdown — в нём текст уходит на сервер и он же
  // показывается, когда правка идёт «как есть» ('plain'). saved — та же
  // строка, что построена из заметки: сравнение с ней и есть «есть правки?».
  const saved = useMemo(() => richMarkdown(pageNote.text, pageNote.entities), [pageNote]);
  const [draft, setDraft] = useState<string>(() => richMarkdown(note.text, note.entities));
  /** Не-реактивная память: последнее значение, пришедшее снаружи. Пока draft
      не разошёлся с ним, внешние обновления (родитель передал обновлённую
      заметку) зеркалятся в draft; иначе локальные правки не затираются. */
  const lastSeenRef = useRef(draft);
  const dirty = draft !== saved;

  useEffect(() => {
    if (draft === lastSeenRef.current && draft !== saved) setDraft(saved);
    lastSeenRef.current = saved;
  }, [draft, saved]);

  // ── Режим редактирования (локальная настройка устройства) ────────────────
  // 'tap'    — тап по тексту сразу включает поле (как раньше);
  // 'toggle' — превью и правка переключаются кнопкой ✏️/👁 в шапке, тап по
  //            тексту ничего не меняет.
  const editorMode = useSettingsStore((s) => s.editorMode);
  const toggleMode = editorMode === 'toggle';

  // Вид правки — тоже настройка устройства (stores/settings.editorView):
  // 'formatted' — текст правится прямо в вёрстке просмотра (contenteditable):
  //               те же блоки и классы, маркеры строк — оформлением
  //               (utils/richtext); 'plain' — сырой markdown-текст, как раньше.
  const editorView = useSettingsStore((s) => s.editorView);
  const rich = editorView === 'formatted';

  // Панель форматирования — тоже настройка устройства (stores/settings.
  // formatPanel): кому-то ряд кнопок и подсказка под полем только мешают.
  const formatPanel = useSettingsStore((s) => s.formatPanel);
  const showFormatPanel = formatPanel === 'show';

  /** Поле в фокусе: в режиме «тапом» по нему показываем панель форматирования. */
  const [focused, setFocused] = useState(startEditing);
  /** Режим «кнопкой»: правка включена явно (кнопка ✏️), фокус не важен. */
  const [manualEdit, setManualEdit] = useState(startEditing);
  const [saving, setSaving] = useState(false);
  /** Поле правки в виде 'plain' — текст с markdown-разметкой. */
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  /** Слой правки в виде 'formatted' — живая вёрстка просмотра. */
  const richElRef = useRef<HTMLDivElement | null>(null);
  /** Зона прокрутки живой вёрстки: сама вёрстка (contenteditable) растёт по
      тексту, а прокручивает её контейнер вокруг — поле правки, которое само
      себе зона прокрутки, на телефоне не листается пальцем
      (iOS не отдаёт касание в contenteditable-скроллер). */
  const richScrollRef = useRef<HTMLDivElement | null>(null);
  /** Markdown, который сейчас отрисован в живой вёрстке: пока он совпадает с
      draft, DOM не пересобираем. Вёрстка правки «своя» у пользователя —
      каретка, выделение, состав узлов; пересборка их теряет. */
  const richShownRef = useRef<string | null>(null);
  /** Идёт набор IME: на время композиции правила ввода и Enter не применяем. */
  const composingRef = useRef(false);
  /** Корневой узел панели форматирования (сниппет toolbar). */
  const toolbarElRef = useRef<HTMLDivElement | null>(null);

  // ── Всплывающая панель у выделения (живая вёрстка) ──────────────────────
  // Как в Telegram: выделил текст — над ним появился ряд оформления. Панель
  // стоит вне слоя страницы (тот сдвигается transform'ом при свайпе), поэтому
  // её координаты — прямо во вьюпорте. В тексте с разметкой ('plain') своей
  // панели нет: там выделение обслуживает футер (панель форматирования).
  /** Место панели: центр по X и край по Y (above — панель над выделением). */
  const [floatPos, setFloatPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const floatPanelRef = useRef<HTMLDivElement | null>(null);
  /** Последнее показанное место: движение каретки не должно перерисовывать
      страницу, пока место не сдвинулось. */
  const floatPosRef = useRef<{ left: number; top: number; above: boolean } | null>(null);
  /** Выделение, под которое нажали кнопку панели: тап вне текста снимает
      выделение — возвращаем его перед действием. */
  const floatRangeRef = useRef<Range | null>(null);
  /** Палец/мышь нажали на панель: фокус правки сейчас уйдёт (тап вне текста),
      но это не «ушёл совсем» — панель не должна исчезнуть до click. Окно
      короткое и само себя снимает: без него на тач-устройствах флаг мог бы
      остаться выставленным и заглушить настоящий уход фокуса. */
  const floatPressRef = useRef(false);
  /** Попытка закрыть страницу с несохранённым текстом: диалог «Сохранить?». */
  const [exitConfirm, setExitConfirm] = useState(false);

  // ── Просмотр с форматированием (когда поле не редактируется) ────────────
  // viewMode: поле не в фокусе и без правок. Слой прячем style:display (не
  // размонтированием), чтобы позиция скролла просмотра сохранялась при
  // переключениях «тапнул — редактирую — вышел из поля».
  const viewElRef = useRef<HTMLDivElement | null>(null);
  /** Курсор правки, запомненный тапом по просмотру (смещение в тексте
      заметки: из него каретка ставится и в вёрстку, и в разметку). */
  const pendingCaretRef = useRef<number | null>(null);
  /** Точка нажатия мыши в просмотре: по смещению до отпускания отличаем
      протяжку (выделение текста) от одиночного клика (включить правку). */
  const viewDownRef = useRef<{ x: number; y: number } | null>(null);
  /** Идёт редактирование: поле показано, просмотр скрыт. */
  const editing = toggleMode ? manualEdit || dirty : focused || dirty;
  const viewMode = !editing;
  /** Панель форматирования при отсутствии правок: пока поле в фокусе (режим
      «тапом») либо пока включён режим правки кнопкой (✏️). */
  const showToolbar = toggleMode ? editing : focused;

  /** Узел правки: живая вёрстка ('formatted') или поле с разметкой ('plain'). */
  function editorEl(): HTMLElement | null {
    return rich ? richElRef.current : textareaRef.current;
  }

  /** Зона прокрутки слоя правки: у живой вёрстки — контейнер вокруг неё
      (сама вёрстка растёт по тексту), у поля с разметкой — само поле. */
  function editorScrollEl(): HTMLElement | null {
    return rich ? richScrollRef.current : textareaRef.current;
  }

  /** Подтянуть каретку правки в видимую часть текста. Клавиатура и панель
      форматирования растут внизу и забирают высоту у main — без этого строка
      с кареткой остаётся под панелью. Каретка живой вёрстки — прямоугольник
      выделения; у схлопнутого выделения он бывает пустым (каретка на стыке
      блоков), тогда ориентир — блок, в котором каретка стоит. Каретку поля с
      разметкой браузер не измеряет — её даёт зеркальный замер. */
  function revealCaret(): void {
    if (rich) {
      const el = richElRef.current;
      const scroller = richScrollRef.current;
      if (el === null || scroller === null || !el.contains(document.activeElement)) return;
      const range = currentRange(el);
      let rect: { top: number; bottom: number } | null =
        range === null ? null : range.getBoundingClientRect();
      if (rect === null || (rect.top === 0 && rect.bottom === 0)) {
        const block = editorBlockAt(el);
        rect = block === null ? null : block.getBoundingClientRect();
      }
      if (rect !== null) revealRect(scroller, rect);
      return;
    }
    const ta = textareaRef.current;
    if (ta === null || document.activeElement !== ta) return;
    revealRect(ta, textareaCaretRect(ta));
  }

  /** Собрать живую вёрстку из markdown: заметка пришла извне (сохранение,
      обновление из списка), «Отмена» правок, переключение вида правки. */
  function rebuildRich(md: string): void {
    const el = richElRef.current;
    if (el === null) return;
    const note = parseMarkdown(md);
    el.innerHTML = richEditorHtml(noteToRich(note.text, note.entities), isActive);
    richShownRef.current = md;
  }

  /** Прочитать вёрстку правки в draft — после любой правки в DOM. */
  function syncDraftFromRich(): void {
    const el = richElRef.current;
    if (el === null) return;
    const next = richDraftOf(el);
    richShownRef.current = next;
    setDraft(next);
  }

  /** Дать фокус правке. В живой вёрстке каретку при необходимости ставим в
      конец: панель форматирования берёт место правки из каретки. */
  function focusEditor(placeCaret = true): void {
    if (!rich) {
      textareaRef.current?.focus();
      return;
    }
    const el = richElRef.current;
    if (el === null) return;
    el.focus();
    if (placeCaret && currentRange(el) === null) focusEditorEnd(el);
  }

  // Вёрстка должна отражать draft: разошлись (заметка обновилась, «Отмена»,
  // смена вида правки) — пересобираем. Свой ввод сюда не попадает: он идёт
  // из DOM в draft, и richShownRef сразу получает то же значение.
  useEffect(() => {
    if (!rich || richShownRef.current === draft) return;
    rebuildRich(draft);
  }, [rich, draft]);

  /** Переключить превью ↔ правку (режим «кнопкой»): кнопка ✏️/👁 в шапке. */
  function toggleEditing(): void {
    if (editing) {
      editorEl()?.blur();
      setManualEdit(false);
      return;
    }
    setManualEdit(true);
    requestAnimationFrame(() => focusEditor());
  }

  /** Закрыть правку: страница снова показывает отформатированный текст (после
      сохранения — и в режиме «тапом», и в режиме «кнопкой»). Скролл текста
      переносим в просмотр: он остаётся на том же месте, где его оставили. */
  function exitEditing(): void {
    const scroller = editorScrollEl();
    if (scroller !== null && viewElRef.current !== null) {
      viewElRef.current.scrollTop = scroller.scrollTop;
    }
    editorEl()?.blur();
    setFocused(false);
    setManualEdit(false);
  }

  // Страница открыта сразу в режиме правки (кнопка ✏️ панели ввода): правку
  // получаем в фокус, чтобы можно было продолжать набор с клавиатуры.
  useEffect(() => {
    if (!startEditing) return;
    const frame = requestAnimationFrame(() => focusEditor());
    return () => cancelAnimationFrame(frame);
  }, [startEditing]);

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

  // Зона правки изменилась в высоту (клавиатура, панель, ряд действий):
  // строка с кареткой не должна остаться за краем — подтягиваем её в видимую
  // часть. Следим за размером, а не за состояниями: менять высоту может и
  // клавиатура (via keyboardInset выше), и состав футера.
  useEffect(() => {
    const scroller = rich ? richScrollRef.current : textareaRef.current;
    if (scroller === null) return;
    const observer = new ResizeObserver(() => revealCaret());
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [rich]);

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
      editorEl()?.blur();
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

  /** Кнопка «Отмена»: вернуть текст к сохранённому (правки отменяются).
      В живую вёрстку сохранённый вид вернёт пересборка по draft. */
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
   * программные переходы — инпут ссылки (autofocus), Tab-навигацию. У
   * всплывающей панели у выделения кнопки без фокуса, а тап вне текста уводит
   * фокус «в никуда» (relatedTarget пуст) — её прикрывает floatPressRef.
   */
  function onEditorBlur(e: FocusEvent<HTMLElement>): void {
    const next = e.relatedTarget;
    if (next instanceof Node && toolbarElRef.current?.contains(next)) return;
    if (floatPressRef.current) return;
    setFocused(false);
  }

  /** Фокус вошёл в правку: если есть отложенная каретка от тапа по просмотру —
      применить в следующем кадре (после перерисовки слоя правки). Скролл тут
      не трогаем: страница под пальцем не «прыгает», а каретку из-под панели
      подтягивает следящий за высотой поля наблюдатель (см. ResizeObserver). */
  function onEditorFocus(): void {
    setFocused(true);
    const plain = pendingCaretRef.current;
    pendingCaretRef.current = null;
    if (plain === null) return;
    requestAnimationFrame(() => {
      if (rich) {
        // Вёрстка построена из тех же строк, что просмотр: номер блока и
        // место в нём совпадают, достаточно смещения в тексте заметки.
        const el = richElRef.current;
        if (el !== null) placeCaretAtPlainOffset(el, pageNote.text, plain);
        return;
      }
      const ta = textareaRef.current;
      if (ta === null) return;
      const at = markdownDraftOffsets(pageNote.text, pageNote.entities)[plain] ?? ta.value.length;
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

  /** Тап по просмотру: включить правку и поставить каретку в место тапа.
      Запоминаем смещение в тексте заметки; сам слой правки в этом же рендере
      занимает место просмотра, поэтому скролл переносим сразу — текст остаётся
      там же, где был. */
  function startEditAt(e: MouseEvent<HTMLDivElement>): void {
    pendingCaretRef.current = tapTextOffset(e);
    const top = viewElRef.current?.scrollTop ?? 0;
    focusEditor(false);
    const scroller = editorScrollEl();
    if (scroller === null) return;
    scroller.scrollTop = top;
    // Каретку (и возможный сдвиг скролла от неё) применяем кадром позже.
    requestAnimationFrame(() => {
      scroller.scrollTop = top;
    });
  }

  /** Есть непустое выделение внутри просмотра: мышью протяжкой (десктоп) или
      длинным тапом. Выделять текст в просмотре можно — правку тогда не
      включаем: focus() поля сбрасывает выделение и текст не скопировать. */
  function hasViewSelection(): boolean {
    const view = viewElRef.current;
    const sel = window.getSelection();
    if (view === null || sel === null || sel.rangeCount === 0 || sel.isCollapsed) return false;
    return view.contains(sel.getRangeAt(0).commonAncestorContainer);
  }

  /** Нажатие в просмотре: запоминаем точку — отпускание сравнит смещение. */
  function onViewMouseDown(e: MouseEvent<HTMLDivElement>): void {
    viewDownRef.current = { x: e.clientX, y: e.clientY };
  }

  /** Клик по просмотру: чекбокс чеклиста — переключить «[ ]»↔«[x]» и
      сохранить, не входя в поле; ссылка — открывается браузером (поле не
      включаем); протяжка мышью — выделение текста (не мешаем копировать);
      остальной тап — включить поле с курсором в месте тапа. */
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
    // Режим «кнопкой»: тап по тексту ничего не делает — правка включается
    // только кнопкой ✏️ в шапке (чекбоксы и ссылки выше работают всегда).
    if (toggleMode) return;
    // Протяжка отличаем по смещению курсора между down и up, а не только по
    // window.getSelection(): браузер схлопывает выделение уже после обработчика
    // click, и одиночный клик по выделенному тексту считался бы выделением —
    // правка не включалась бы. Протяжку без выделения (буллет, пустое место)
    // по-прежнему считаем тапом.
    const down = viewDownRef.current;
    viewDownRef.current = null;
    const dragged = down !== null && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 3;
    if (dragged && hasViewSelection()) return;
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
    if (value === saved) {
      // Правки «схлопнулись» в сохранённый вид (например, лишние пробелы в
      // конце) — сеть не дёргаем, просто возвращаем правку к сохранённому.
      discard();
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
      if (closeAfter) {
        closeNow();
        return;
      }
      // Сохранили — закрываем правку и показываем отформатированный текст.
      // draft приводим к сохранённому: при обрезке пробелов по краям поле
      // иначе осталось бы «изменённым» (draft !== saved) и не вышло из правки.
      if (value !== draft) setDraft(value);
      exitEditing();
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
  // Полное отображение этой заметки на карточке (локальная настройка).
  const noteExpanded = useNoteViewStore((s) => s.expanded.has(pageNote.id));

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

  // ── Форматирование (панель) ─────────────────────────────────────────────
  // Живая вёрстка: оформление — тегами на выделении, маркер строки — видом
  // блока. Разметка: те же действия маркерами (**жирный**, *курсив*, `код`,
  // [ссылка](url), # / ## / - / - [ ] в начале строки).
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const linkInputRef = useRef<HTMLInputElement | null>(null);
  /** Выделение, под которое открыли форму ссылки: фокус уходит в поле адреса
      и уносит выделение с собой — возвращаем его при вставке. */
  const linkRangeRef = useRef<Range | null>(null);

  function selection(): { start: number; end: number } {
    const ta = textareaRef.current;
    if (!ta) return { start: 0, end: 0 };
    return { start: ta.selectionStart ?? 0, end: ta.selectionEnd ?? 0 };
  }

  /** Действие панели в живой вёрстке. Каретки в ней может не быть (режим
      «кнопкой», фокус не в тексте) — тогда сначала входим в текст, иначе
      форматировать нечего. После правки DOM читаем вёрстку в draft. */
  function inRich(action: (el: HTMLElement) => void): void {
    const el = richElRef.current;
    if (el === null) return;
    if (currentRange(el) === null) focusEditor();
    action(el);
    syncDraftFromRich();
  }

  /** Инлайн-оформление выделения: вёрстке — теги, разметке — маркеры. */
  function formatInline(type: string, open: string, close: string, placeholder = 'текст'): void {
    if (rich) {
      inRich((el) => applyInlineFormat(el, type));
      return;
    }
    wrap(open, close, placeholder);
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
        // Выделение запоминаем до ухода фокуса в поле адреса.
        const el = richElRef.current;
        linkRangeRef.current = el === null ? null : currentRange(el);
        requestAnimationFrame(() => linkInputRef.current?.focus());
      }
      return !v;
    });
  }

  /** Ссылка: [выделение](url), без выделения — [ссылка](url). */
  function applyLink(): void {
    const url = linkUrl.trim();
    if (url === '') return;
    if (rich) {
      const el = richElRef.current;
      if (el === null) return;
      restoreRange(linkRangeRef.current);
      linkRangeRef.current = null;
      applyInlineFormat(el, 'text_link', url);
      syncDraftFromRich();
      setLinkOpen(false);
      setLinkUrl('');
      focusEditor(false);
      return;
    }
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
    ol: '1. ',
    list: '- ',
    check: '- [ ] ',
  } as const;
  type LineMarkerKind = keyof typeof LINE_MARKERS;

  /** Структурный маркер строки: в живой вёрстке — вид блока, в разметке —
      маркер в начале строки (включается/снимается одним и тем же кликом). */
  function formatLine(kind: MarkerKind): void {
    if (rich) {
      inRich((el) => toggleBlockKind(el, kind));
      return;
    }
    toggleLineMarker(kind);
  }

  /** Границы строки под курсором (без учёта выделения в другие строки). */
  function currentLine(): { start: number; end: number } {
    const ta = textareaRef.current;
    if (!ta) return { start: 0, end: 0 };
    const caret = ta.selectionStart ?? 0;
    const start = draft.lastIndexOf('\n', caret - 1) + 1;
    const nl = draft.indexOf('\n', caret);
    return { start, end: nl === -1 ? draft.length : nl };
  }

  /** Структурный маркер в начале строки, если есть (любой из пяти). */
  function existingMarker(
    raw: string,
  ): { kind: LineMarkerKind; marker: string } | null {
    // У нумерованного пункта маркер свой — «7. », поэтому ищем его первым и
    // возвращаем как есть (снятие нумерации сравнивает вид, а не строку).
    const ol = /^\d+\. /.exec(raw);
    if (ol !== null) return { kind: 'ol', marker: ol[0] };
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
    // Нумерованный пункт — «тот же маркер», даже если номер другой: повторный
    // клик по «1.» снимает нумерацию с «7. пункт», а не заменяет её на «1. ».
    const same = cur !== null && (cur.kind === 'ol' ? kind === 'ol' : cur.marker === target);

    let newLine: string;
    let delta: number;
    if (cur !== null && same) {
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

  /**
   * Enter в поле: формат строки переносится на новую строку — «# », «## »,
   * «- », «- [ ] » как есть (чеклист всегда снятый), «1. » со следующим
   * номером; пустой пункт закрывает формат. Выделение и Shift+Enter —
   * обычный перенос.
   */
  function onTextKeydown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const ta = e.currentTarget;
    if (ta.selectionStart !== ta.selectionEnd) return;
    const { start, end } = currentLine();
    const cont = lineContinuation(draft.slice(start, end));
    if (cont === null) return;
    e.preventDefault();
    const caret = ta.selectionStart ?? start;
    const next =
      cont.action === 'clear'
        ? // В пункте ничего нет: маркер снимаем — из списка/формата выходим.
          { text: draft.slice(0, start) + draft.slice(end), caret: start }
        : {
            text: draft.slice(0, caret) + '\n' + cont.marker + draft.slice(caret),
            caret: caret + cont.marker.length + 1,
          };
    setDraft(next.text);
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (node === null) return;
      node.focus();
      node.setSelectionRange(next.caret, next.caret);
    });
  }

  // ── Живая вёрстка: ввод, перенос строки, буфер обмена, чекбокс ─────────
  // Правки читаем из DOM в draft (richDraftOf): он и уходит на сервер, и он
  // же — то, из чего вёрстка собирается заново при внешних изменениях.

  /** Ввод символа: набранный маркер («# », «- », «1. », «- [ ] ») превращает
      строку в блок, сам маркер пропадает — в заметке он появится из вида. */
  function onRichInput(): void {
    const el = richElRef.current;
    if (el === null) return;
    if (!composingRef.current) applyTypedMarkerRule(el);
    syncDraftFromRich();
  }

  function onRichKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    const el = richElRef.current;
    if (el === null || e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      // Свой Enter вместо браузерного: браузер создал бы безымянный <div>,
      // который выпал бы из вёрстки строк вместе со своим текстом.
      e.preventDefault();
      const sel = window.getSelection();
      if (sel !== null && !sel.isCollapsed) sel.deleteFromDocument();
      splitBlockOnEnter(el);
      syncDraftFromRich();
      return;
    }
    if (e.key === 'Backspace' && backspaceAtBlockStart(el)) {
      e.preventDefault();
      syncDraftFromRich();
      return;
    }
    if (e.key === 'Delete' && deleteAtBlockEnd(el)) {
      e.preventDefault();
      syncDraftFromRich();
    }
  }

  /** Вставка из буфера: только простой текст — чужие теги и стили в заметке
      не нужны (оформление в ней своё, из entities). */
  function onRichPaste(e: React.ClipboardEvent<HTMLDivElement>): void {
    const el = richElRef.current;
    if (el === null) return;
    e.preventDefault();
    insertPlainText(el, e.clipboardData.getData('text/plain'));
    if (!composingRef.current) applyTypedMarkerRule(el);
    syncDraftFromRich();
  }

  /** Клик в правке: чекбокс чеклиста — переключить (не уходя с места правки),
      остальное — обычное поведение (ссылка по клику не открывается: кликом по
      тексту ставят каретку, в просмотре ссылка работает как обычно). */
  function onRichClick(e: MouseEvent<HTMLDivElement>): void {
    const el = richElRef.current;
    if (el === null) return;
    const target = e.target as Element | null;
    const cb = target?.closest('.note-cb');
    if (cb instanceof HTMLButtonElement) {
      e.preventDefault();
      const block = richBlockOf(cb);
      if (block !== null && el.contains(block)) {
        toggleBlockChecked(block);
        syncDraftFromRich();
      }
      return;
    }
    if (target?.closest('a[href]')) e.preventDefault();
  }

  function onRichCompositionStart(): void {
    composingRef.current = true;
  }

  function onRichCompositionEnd(): void {
    composingRef.current = false;
    onRichInput();
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

  // ── Всплывающая панель у выделения (живая вёрстка) ──────────────────────
  // Действия те же, что у футера, — те же функции: они работают с выделением
  // вёрстки, а не с панелью, поэтому панель может вызывать их откуда угодно.

  /** Кнопки панели: подписи короче футеровских — панель висит над текстом. */
  const floatButtons: { label: string; title: string; run: () => void }[] = [
    { label: 'B', title: 'Жирный', run: () => formatInline('bold', '**', '**') },
    { label: 'I', title: 'Курсив', run: () => formatInline('italic', '*', '*') },
    { label: '</>', title: 'Код', run: () => formatInline('code', '`', '`', 'код') },
    { label: '🔗', title: 'Ссылка', run: toggleLink },
    { label: '#', title: 'Заголовок', run: () => formatLine('h1') },
    { label: '##', title: 'Подзаголовок', run: () => formatLine('h2') },
    { label: '1.', title: 'Нумерованный список', run: () => formatLine('ol') },
    { label: '••', title: 'Список', run: () => formatLine('list') },
    { label: '☑', title: 'Чеклист', run: () => formatLine('check') },
  ];

  /** Центр панели по X, подтянутый внутрь экрана: у выделения у самого края
      панель иначе свисала бы за границу. До первой отрисовки ширина панели
      ещё неизвестна — уточняет эффект после показа. Когда кнопки не влезли в
      экран, панель ограничена его шириной (max-w) и листается вбок сама —
      тогда подтягивание ставит её ровно по краям экрана. */
  function clampFloatLeft(center: number): number {
    const half = (floatPanelRef.current?.offsetWidth ?? 0) / 2;
    const edge = Math.min(half + 8, window.innerWidth / 2);
    return Math.min(Math.max(center, edge), Math.max(window.innerWidth - edge, edge));
  }

  /** Держать панель у выделения; выделения нет — панель убрать. Место — над
      первой строкой выделения, а если сверху для неё нет места (выделяют у
      шапки) — под последней. */
  function placeFloatPanel(): void {
    const root = rich ? richElRef.current : null;
    const range = root === null ? null : currentRange(root);
    const rect = range === null || range.collapsed ? null : range.getBoundingClientRect();
    if (rect === null || (rect.width === 0 && rect.height === 0)) {
      if (floatPosRef.current === null) return;
      floatPosRef.current = null;
      setFloatPos(null);
      return;
    }
    const PANEL_H = 56; // высота панели с отступом от строки
    const above = rect.top > PANEL_H + 8;
    const next = {
      left: clampFloatLeft(rect.left + rect.width / 2),
      top: above ? rect.top - 8 : rect.bottom + 8,
      above,
    };
    const prev = floatPosRef.current;
    if (
      prev !== null &&
      prev.above === next.above &&
      Math.abs(prev.left - next.left) < 0.5 &&
      Math.abs(prev.top - next.top) < 0.5
    ) {
      return;
    }
    floatPosRef.current = next;
    setFloatPos(next);
  }

  /** Нажали на кнопку панели: выделение под неё запоминаем сразу — тап вне
      текста снимает его раньше, чем случится click. */
  function onFloatPress(): void {
    floatPressRef.current = true;
    window.setTimeout(() => {
      floatPressRef.current = false;
    }, 400);
    const root = richElRef.current;
    floatRangeRef.current = root === null ? null : currentRange(root);
  }

  /** Действие панели: вернуть выделение (тап его мог снять), применить
      оформление, пересчитать место — оформление могло выделение снять, и
      тогда панель уходит вместе с ним. */
  function floatAction(run: () => void): void {
    restoreRange(floatRangeRef.current);
    floatRangeRef.current = null;
    run();
    requestAnimationFrame(() => placeFloatPanel());
  }

  // Панель у выделения: пересчитываем место на движение выделения и на
  // прокрутку текста. selectionchange приходит и на каждое перемещение
  // каретки — лишние перерисовки отсекает сравнение места (placeFloatPanel).
  useEffect(() => {
    if (!rich) return;
    const onChange = (): void => placeFloatPanel();
    document.addEventListener('selectionchange', onChange);
    const scroller = richScrollRef.current;
    scroller?.addEventListener('scroll', onChange);
    return () => {
      document.removeEventListener('selectionchange', onChange);
      scroller?.removeEventListener('scroll', onChange);
    };
  }, [rich, editing]);

  // Панель живёт только в правке живой вёрстки: ушли в просмотр, открыли
  // диалог закрытия, потянули страницу вбок — убираем.
  useEffect(() => {
    if (rich && editing && !dragging && !closing && !exitConfirm) return;
    floatPosRef.current = null;
    floatRangeRef.current = null;
    setFloatPos(null);
  }, [rich, editing, dragging, closing, exitConfirm]);

  // Панель у края экрана: после отрисовки её ширина известна — подтягиваем
  // внутрь. Одного прохода достаточно: он же правит место в ref, поэтому
  // следующий пересчёт уже не находит расхождения.
  useLayoutEffect(() => {
    const node = floatPanelRef.current;
    if (node === null || floatPos === null) return;
    const left = clampFloatLeft(floatPos.left);
    if (Math.abs(left - floatPos.left) < 0.5) return;
    const next = { ...floatPos, left };
    floatPosRef.current = next;
    setFloatPos(next);
  }, [floatPos]);

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
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-[15px] btn-press active:bg-border/60"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => formatInline('bold', '**', '**')}
        >
          <span className="font-bold">B</span>
        </button>
        <button
          type="button"
          aria-label="Курсив (*текст*)"
          title="Курсив"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-[15px] btn-press active:bg-border/60"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => formatInline('italic', '*', '*')}
        >
          <span className="italic">I</span>
        </button>
        <button
          type="button"
          aria-label="Код (`текст`)"
          title="Код"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted font-mono text-[13px] btn-press active:bg-border/60"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => formatInline('code', '`', '`', 'код')}
        >
          {'</>'}
        </button>
        <button
          type="button"
          aria-label="Ссылка ([текст](url))"
          title="Ссылка"
          className={`flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-[15px] btn-press active:bg-border/60 ${
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
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-[15px] font-bold btn-press active:bg-border/60"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => formatLine('h1')}
        >
          {'# '}
        </button>
        <button
          type="button"
          aria-label="Подзаголовок (## в начале строки)"
          title="Подзаголовок"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-[15px] font-semibold btn-press active:bg-border/60"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => formatLine('h2')}
        >
          {'##'}
        </button>
        <button
          type="button"
          aria-label="Нумерованный список (1. в начале строки)"
          title="Нумерованный список"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-[15px] btn-press active:bg-border/60"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => formatLine('ol')}
        >
          {'1.'}
        </button>
        <button
          type="button"
          aria-label="Список (- в начале строки)"
          title="Список"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-[17px] btn-press active:bg-border/60"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => formatLine('list')}
        >
          ••
        </button>
        <button
          type="button"
          aria-label="Чеклист (- [ ] в начале строки)"
          title="Чеклист"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-[15px] btn-press active:bg-border/60"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => formatLine('check')}
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
            className="input-press h-10 min-w-0 flex-1 rounded-xl border border-border bg-muted px-3 text-sm outline-none focus:border-ring"
          />
          <button
            type="button"
            className="btn-press h-10 shrink-0 rounded-xl bg-primary px-4 text-sm font-medium text-white disabled:opacity-40"
            disabled={linkUrl.trim() === ''}
            onMouseDown={(e) => e.preventDefault()}
            onClick={applyLink}
          >
            Вставить
          </button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {rich
          ? 'Оформление — кнопками панели: применяется к выделению или к строке с курсором. Enter переносит формат строки дальше.'
          : '# заголовок · ## подзаголовок · 1. нумерованный список · - список · - [ ] чеклист · **жирный**, *курсив*, `код`, [ссылка](https://…)'}
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
          className="flex h-10 w-10 items-center justify-center rounded-full text-lg btn-press active:bg-border/50"
          onClick={requestClose}
        >
          ←
        </button>
        <span className="truncate px-2 text-sm text-muted-foreground">
          {isDone ? '✅ Выполнена' : isArchived ? '🗄 Архив' : '📝 Заметка'}
        </span>
        {/* Режим «кнопкой»: явный переключатель превью ↔ правка. Пока есть
            несохранённые правки, кнопку не показываем — сначала «Сохранить»/
            «Отмена» в футере. */}
        {toggleMode && !dirty ? (
          <button
            type="button"
            aria-label={editing ? 'Просмотр' : 'Редактировать'}
            title={editing ? 'Просмотр' : 'Редактировать'}
            className="flex h-10 w-10 items-center justify-center rounded-full text-lg btn-press active:bg-border/50"
            onClick={toggleEditing}
          >
            {editing ? '👁' : '✏️'}
          </button>
        ) : (
          <span className="w-10"></span>
        )}
      </header>

      {/* Текст заметки. Слой просмотра — отформатированный текст, видимый,
          пока заметка не редактируется (не в фокусе и без правок); он лежит
          поверх слоя правки и прячется display:none (не размонтируется) — своя
          позиция скролла сохраняется при переключениях. Тап по тексту включает
          правку с курсором в месте тапа; чекбоксы чеклиста и ссылки работают
          без входа в правку.

          При настройке «правка без разметки» (editorView: formatted) правится
          прямо вёрстка просмотра: тот же HTML, те же блоки и классы
          (contenteditable), символы разметки в тексте не показываются — их
          место занимает оформление. Слой правки виден всегда (его закрывает
          непрозрачный слой просмотра, а не display:none) — иначе .focus() из
          тапа по тексту не сработал бы. Классы текста (отступы, шрифт,
          прокрутка) стоят на том же контейнере, что и у слоя просмотра,
          поэтому вход в правку текст не двигает.

          Прокрутка живой вёрстки — на контейнере вокруг неё, а не на ней
          самой: поле, которое само себе зона прокрутки, на телефоне не
          листается пальцем (iOS не отдаёт касание внутрь contenteditable-
          скроллера), а вокруг него — обычный блок с прокруткой. Сама вёрстка
          растёт по тексту, как в ProseMirror-редакторах.

          touch-pan-y: вертикальный скролл нативный, горизонтальный свайп
          (закрытие страницы) достаётся корневому контейнеру. Отклика нажатия
          (сжатия) у слоя правки нет: сдвиг поверхности сбивает системное окно
          выделения — долгий тап с «вырезать/скопировать» выглядел так, будто
          текст не выделялся. */}
      <main className="relative min-h-0 flex-1">
        {rich && (
          <div
            ref={richScrollRef}
            className={`${NOTE_TEXT_CLASS} ${isDone ? 'note-done' : ''}`}
          >
            <div
              ref={richElRef}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label="Текст заметки"
              onInput={onRichInput}
              onKeyDown={onRichKeyDown}
              onPaste={onRichPaste}
              onClick={onRichClick}
              onFocus={onEditorFocus}
              onBlur={onEditorBlur}
              onCompositionStart={onRichCompositionStart}
              onCompositionEnd={onRichCompositionEnd}
              className="note-editor min-h-full caret-primary outline-none"
            ></div>
          </div>
        )}

        {!rich && (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onTextKeydown}
            onFocus={onEditorFocus}
            onBlur={onEditorBlur}
            className="absolute inset-0 h-full w-full resize-none touch-pan-y overflow-y-auto whitespace-pre-wrap bg-background px-4 py-4 text-[16px] leading-6 text-foreground caret-primary outline-none placeholder:text-muted-foreground"
            placeholder="Начните печатать…"
          ></textarea>
        )}

        {/* Пустая заметка: у вёрстки правки нет нативного placeholder —
            рисуем его сами, пока в заметке нет ни одного символа. */}
        {rich && !viewMode && draft === '' && (
          <p className="pointer-events-none absolute left-4 top-4 text-[16px] leading-6 text-muted-foreground">
            Начните печатать…
          </p>
        )}

        <div
          ref={viewElRef}
          className={`note-view ${NOTE_TEXT_CLASS} ${isDone ? 'note-done' : ''}`}
          style={{ display: viewMode ? 'block' : 'none' }}
          onClick={onViewClick}
          onMouseDown={onViewMouseDown}
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
            {(showFormatPanel || linkOpen) && toolbar}
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-press h-11 flex-1 rounded-xl border border-border text-sm"
                disabled={saving}
                onClick={discard}
              >
                Отмена
              </button>
              <button
                type="button"
                className="btn-press flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-white"
                disabled={saving}
                onClick={() => void save(false)}
              >
                {saving ? <Spinner size="16px" /> : 'Сохранить'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {showToolbar && (showFormatPanel || linkOpen) && (
              // Панель форматирования: поле в фокусе (режим «тапом») либо
              // включён режим правки кнопкой ✏️. Форма ссылки показывается и
              // при скрытой панели: её открывают кнопкой 🔗 всплывающей панели
              // у выделения, а вводить адрес больше негде.
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
                        className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground btn-press active:bg-border/60"
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
                          className="h-8 flex-1 rounded-lg border border-border bg-muted text-xs btn-press"
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
                      className={`flex h-12 w-12 items-center justify-center rounded-full text-xl btn-press ${
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
                      className="btn-press flex h-12 items-center gap-2 rounded-full bg-primary/15 px-5 text-base disabled:opacity-50"
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
                          className="flex h-12 min-w-12 items-center justify-center gap-0.5 rounded-full bg-muted px-2 text-base btn-press"
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
                          className={`flex h-12 w-12 items-center justify-center rounded-full text-lg btn-press ${
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
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-xl btn-press"
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
                className="flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[15px] btn-press-soft transition-colors active:bg-border/50"
                onClick={() => pickMenu(doTogglePin)}
              >
                <span className="w-6 shrink-0 text-center text-base">📌</span>
                <span className="truncate">{pageNote.pinned ? 'Открепить' : 'Закрепить'}</span>
              </button>
              {canMove && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[15px] btn-press-soft transition-colors active:bg-border/50"
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
                className="flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[15px] btn-press-soft transition-colors active:bg-border/50"
                onClick={() => pickMenu(doArchive)}
              >
                <span className="w-6 shrink-0 text-center text-base">🗄</span>
                <span className="truncate">В архив</span>
              </button>
            </>
          )}
          {/* Полное отображение заметки на карточке — доступно в любом
              состоянии, независимо от того, активна заметка или нет. */}
          <button
            type="button"
            role="menuitem"
            className="flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[15px] btn-press-soft transition-colors active:bg-border/50"
            onClick={() => pickMenu(() => toggleNoteExpanded(pageNote.id))}
          >
            <span className="w-6 shrink-0 text-center text-base">{noteExpanded ? '⤡' : '⤢'}</span>
            <span className="truncate">{noteExpanded ? 'Свернуть' : 'Развернуть'}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="btn-press-soft flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[15px] text-destructive transition-colors active:bg-destructive/10"
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

    {/* Всплывающая панель оформления у выделения (живая вёрстка). Стоит рядом
        со слоем страницы, а не внутри: тот сдвигается transform'ом (свайп,
        въезд), и панель внутри него уезжала бы вместе с ним. onMouseDown
        preventDefault — нажатие по кнопке не должно снимать выделение;
        data-no-swipe — жест по панели не закрывает страницу: он остаётся
        панели, а если кнопки не влезли в экран — листает их вбок. */}
    {floatPos !== null && (
      <div
        ref={floatPanelRef}
        data-no-swipe
        role="toolbar"
        aria-label="Оформление выделения"
        className="fixed z-[75] max-w-[calc(100vw-16px)] overflow-x-auto rounded-xl border border-border bg-background p-1 shadow-xl"
        style={{
          left: `${floatPos.left}px`,
          top: `${floatPos.top}px`,
          transform: `translate(-50%, ${floatPos.above ? '-100%' : '0'})`,
        }}
        onMouseDown={(e) => e.preventDefault()}
        onPointerDown={onFloatPress}
      >
        <div className="flex w-max items-center gap-0.5">
          {floatButtons.map((b) => (
            <button
              key={b.title}
              type="button"
              aria-label={b.title}
              title={b.title}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-[15px] btn-press active:bg-border/60"
              onClick={() => floatAction(b.run)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
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
            className="btn-press flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-white disabled:opacity-50"
            disabled={saving}
            onClick={() => void save(true)}
          >
            {saving ? <Spinner size="16px" /> : 'Сохранить'}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-press h-11 flex-1 rounded-xl border border-border text-sm disabled:opacity-50"
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
              className="btn-press h-11 flex-1 rounded-xl border border-border text-sm text-destructive disabled:opacity-50"
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
