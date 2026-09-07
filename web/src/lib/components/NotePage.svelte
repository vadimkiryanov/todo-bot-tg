<script lang="ts">
  // Полноэкранная «страница» заметки (как открытие чата в Telegram):
  // въезжает слайдом поверх списка, назад — стрелка в шапке или свайп вправо.
  //
  // Текст заметки — всегда большое редактируемое поле (как в нативных
  // заметках): тапнул — сразу печатай, отдельной кнопки ✏️ и режима
  // «редактирование» нет. Кнопки «Сохранить»/«Отмена» появляются только
  // когда текст изменён; панель форматирования — при фокусе поля или при
  // изменённом тексте. Действия (✅/🔄/⏰/⋯) зависят от состояния заметки
  // (active/done/archived). Закрытие с несохранённым текстом спрашивает:
  // «Сохранить? / Не сохранять?».
  //
  // Мутации owner-aware: если заметка лежит в одном из списков стора
  // (активный/архив/выполненные/таймеры), обновляется он; иначе (заметка
  // открыта из уведомления, списки не загружены) — прямые API-вызовы с
  // локальным состоянием. Каждая busy-кнопка показывает спиннер.
  import { onMount } from 'svelte';
  import ConfirmModal from './ConfirmModal.svelte';
  import Modal from './Modal.svelte';
  import MoveModal from './MoveModal.svelte';
  import ReminderForm from './ReminderForm.svelte';
  import Spinner from './Spinner.svelte';
  import { clearReminder as apiClearReminder, deleteNote as apiDeleteNote, setReminder as apiSetReminder, updateNote as apiUpdateNote } from '../api/notes';
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
  } from '../stores/notes.svelte';
  import type { Note, ReminderRepeat } from '../types/api';
  import {
    formatReminderAt,
    markdownFromEntities,
    nextPriority,
    priorityEmoji,
    priorityLabel,
  } from '../utils/format';

  let {
    note,
    onClose,
  }: {
    note: Note;
    onClose: () => void;
  } = $props();

  // Живое состояние: при store-мутациях родитель передаёт обновлённый объект
  // из списка; для «чужой» заметки (из уведомления) обновляем локально.
  let pageNote = $state<Note>(note);
  $effect(() => {
    if (note.id === pageNote.id && note !== pageNote) pageNote = note;
  });

  const owned = $derived(hasLoadedNote(pageNote.id));

  // ── Текст заметки: редактируется сразу, отдельного «просмотра» нет ─────
  // В поле показываем markdown-разметку (**жирный** и т.п.), восстановленную
  // из entities сервера (markdownFromEntities) — как в старом редакторе.
  const saved = $derived(markdownFromEntities(pageNote.text, pageNote.entities));
  let draft = $state(markdownFromEntities(pageNote.text, pageNote.entities));
  /** Не-реактивная память: последнее значение, пришедшее снаружи. Пока draft
      не разошёлся с ним, внешние обновления (родитель передал обновлённую
      заметку) зеркалятся в draft; иначе локальные правки не затираются. */
  let lastSeen = draft;
  const dirty = $derived(draft !== saved);

  $effect(() => {
    if (draft === lastSeen && draft !== saved) draft = saved;
    lastSeen = saved;
  });

  /** Поле в фокусе: под ним показываем панель форматирования. */
  let focused = $state(false);
  let saving = $state(false);
  let textarea: HTMLTextAreaElement | undefined;
  /** Корневой узел панели форматирования (сниппет toolbar). */
  let toolbarEl: HTMLDivElement | undefined;
  /** Попытка закрыть страницу с несохранённым текстом: диалог «Сохранить?». */
  let exitConfirm = $state(false);

  // iOS не сжимает вьюпорт клавиатурой: поднимаем футер (тулбар и кнопки
  // «Сохранить/Отмена») над ней через visualViewport (как Modal).
  let keyboardInset = $state(0);
  $effect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = (): void => {
      keyboardInset = Math.max(0, window.innerHeight - vv.height);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  });

  // ── Анимация: слайд справа (въезд) / вправо (закрытие) ──────────────────
  let visible = $state(false);
  onMount(() => {
    // Двойной rAF: первый кадр — справа, второй — плавный въезд.
    requestAnimationFrame(() => requestAnimationFrame(() => (visible = true)));
  });
  let closing = $state(false);
  let closeTimer: ReturnType<typeof setTimeout> | undefined;

  /** Закрыть страницу. С несохранённым текстом — сначала диалог. */
  function requestClose(): void {
    if (closing) return;
    if (dirty) {
      // Клавиатуру прячем: диалог должен быть виден целиком.
      textarea?.blur();
      exitConfirm = true;
      return;
    }
    closeNow();
  }

  /** Непосредственное закрытие (после подтверждения/сохранения). */
  function closeNow(): void {
    if (closing) return;
    closing = true;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => onClose(), 240);
  }

  /** Кнопка «Отмена»: вернуть текст к сохранённому (правки отменяются). */
  function discard(): void {
    if (saving) return;
    draft = saved;
    error = '';
  }

  /**
   * Фокус ушёл с поля. Панель форматирования прячем, только если фокус ушёл
   * за её пределы: тап по кнопке панели переводит фокус на кнопку, и без
   * этой проверки панель исчезала бы под пальцем ДО click («нажал на панель —
   * она пропала»), кнопки не срабатывали. Переход фокуса на кнопки тулбара
   * не даёт и onmousedown preventDefault (см. toolbar); здесь страхуем
   * программные переходы — инпут ссылки (autofocus), Tab-навигацию.
   */
  function onEditorBlur(e: FocusEvent): void {
    const next = e.relatedTarget;
    if (next instanceof Node && toolbarEl?.contains(next)) return;
    focused = false;
  }

  /** Сохранить текст; closeAfter — закрыть страницу после успеха. */
  async function save(closeAfter: boolean): Promise<void> {
    const value = draft.trim();
    if (value === '') {
      error = 'текст не может быть пустым';
      return;
    }
    if (value === pageNote.text) {
      // Правки «схлопнулись» в исходный текст (например, лишние пробелы в
      // конце) — сеть не дёргаем, просто возвращаем поле к сохранённому виду.
      draft = saved;
      if (closeAfter) closeNow();
      return;
    }
    saving = true;
    error = '';
    try {
      if (owned) {
        await saveText(pageNote, value);
      } else {
        pageNote = await apiUpdateNote(pageNote.id, { text: value });
      }
      if (closeAfter) closeNow();
    } catch (e) {
      error = e instanceof Error ? e.message : 'ошибка';
    } finally {
      saving = false;
    }
  }

  // ── Свайп вправо — закрыть (страница едет за пальцем) ───────────────────
  const SWIPE_CLOSE_PX = 90;
  const FLING_PX_MS = 0.4;
  let drag = $state(0);
  let dragging = $state(false);
  let swipeAxis: 'h' | 'v' | null = null;
  /** Жест начат принятым pointerdown (touch). Мышь сюда не допускается:
      иначе hover-pointermove при swipeStartX/Y = 0 «активирует» свайп от
      (0,0) и страница едет за курсором без нажатия. */
  let swipePointer = false;
  let swipeStartX = 0;
  let swipeStartY = 0;
  let swipeLastX = 0;
  let swipeLastT = 0;
  let swipeVx = 0;

  function pageTransform(): string {
    if (!visible || closing) return 'translate3d(100%,0,0)';
    return `translate3d(${drag}px,0,0)`;
  }

  function onPointerDown(e: PointerEvent): void {
    if (e.pointerType !== 'touch' || closing) return;
    // textarea намеренно НЕ в исключении: свайп вправо по тексту закрывает
    // страницу, как жест «назад» поверх контента. Вертикальный скролл поля
    // остаётся нативным (touch-action: pan-y на textarea).
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, [data-no-swipe]')) return;
    swipePointer = true;
    swipeStartX = e.clientX;
    swipeStartY = e.clientY;
    swipeAxis = null;
    swipeLastX = e.clientX;
    swipeLastT = performance.now();
    swipeVx = 0;
  }

  function onPointerMove(e: PointerEvent): void {
    // Жест живёт только между принятым pointerdown и pointerup: без этого
    // движения мыши по открытой странице (кнопка не нажата) считались бы
    // свайпом от точки (0,0) — страница едет за курсором.
    if (!swipePointer || closing) return;
    if (swipeAxis === null) {
      const dx = e.clientX - swipeStartX;
      const dy = e.clientY - swipeStartY;
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        swipeAxis = 'h';
        dragging = true;
      } else if (Math.abs(dy) > 8) {
        swipeAxis = 'v';
      }
    }
    if (swipeAxis !== 'h' || closing) return;
    const now = performance.now();
    const dt = now - swipeLastT;
    const inst = (e.clientX - swipeLastX) / Math.max(dt, 1);
    swipeVx = dt > 48 ? inst : swipeVx * 0.6 + inst * 0.4;
    swipeLastX = e.clientX;
    swipeLastT = now;
    // Вправо — уводим страницу; влево — «резинка» с сопротивлением.
    // Округление до целых px: субпиксельный transform дёргает эмодзи-глифы.
    const dx = e.clientX - swipeStartX;
    drag = Math.round(dx > 0 ? dx : dx * 0.3);
  }

  function onPointerUp(e: PointerEvent): void {
    swipePointer = false;
    if (swipeAxis !== 'h' || closing) return;
    const dx = e.clientX - swipeStartX;
    const close = dx >= SWIPE_CLOSE_PX || swipeVx >= FLING_PX_MS;
    if (close) requestClose();
    else drag = 0;
    swipeAxis = null;
    dragging = false;
  }

  function onPointerCancel(): void {
    swipePointer = false;
    swipeAxis = null;
    dragging = false;
    drag = 0;
  }

  // ── Состояние и действия ────────────────────────────────────────────────
  let error = $state('');
  let confirmDelete = $state(false);
  let showMove = $state(false);
  let showReminderForm = $state(false);
  // Меню «⋯» (закрепить/переместить/архив/удалить): позиция у правого края
  // кнопки, раскрывается вверх над доком.
  let menuOpen = $state(false);
  let menuPos = $state({ right: 12, bottom: 96 });
  type BusyKey = 'done' | 'priority' | 'pin' | 'reminder' | 'delete' | 'archive';
  let busy: BusyKey | null = $state(null);

  const isDone = $derived(pageNote.done);
  const isArchived = $derived(pageNote.archived);
  const isActive = $derived(!isDone && !isArchived);
  // «Переместить» — для любой активной заметки: MoveModal сама показывает
  // папки выбранного топика (условие «в топике есть папки» не нужно).
  const canMove = $derived(isActive);

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
    busy = key;
    error = '';
    try {
      if (owned) {
        await store();
      } else {
        const fromApi = await api();
        if (fromApi !== undefined && fromApi !== null) pageNote = fromApi;
      }
      if (closeAfter) requestClose();
    } catch (e) {
      error = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = null;
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
  function openMenu(e: MouseEvent): void {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    menuPos = {
      right: Math.max(8, window.innerWidth - rect.right),
      bottom: Math.max(8, window.innerHeight - rect.top + 6),
    };
    menuOpen = true;
    error = '';
  }

  function closeMenu(): void {
    menuOpen = false;
  }

  /** Выбрать пункт меню: закрыть меню и выполнить действие. */
  function pickMenu(action: () => void): void {
    menuOpen = false;
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
    showReminderForm = !showReminderForm;
    error = '';
  }

  // ── Форматирование: обёртки выделения markdown-маркерами ────────────────
  // Работают с полем текста (draft). Кнопки: **жирный**, *курсив*, `код`,
  // [ссылка](url); строковые маркеры # / ## / - / - [ ] — по текущей строке.
  let linkOpen = $state(false);
  let linkUrl = $state('');
  let linkInput = $state<HTMLInputElement | undefined>();

  function selection(): { start: number; end: number } {
    const ta = textarea;
    if (!ta) return { start: 0, end: 0 };
    return { start: ta.selectionStart ?? 0, end: ta.selectionEnd ?? 0 };
  }

  /** Обернуть выделение маркерами; пустое выделение — вставить с плейсхолдером. */
  function wrap(open: string, close: string, placeholder = 'текст'): void {
    const { start, end } = selection();
    const sel = draft.slice(start, end);
    const inner = sel === '' ? placeholder : sel;
    draft = draft.slice(0, start) + open + inner + close + draft.slice(end);
    requestAnimationFrame(() => {
      textarea?.focus();
      const selStart = start + open.length;
      textarea?.setSelectionRange(selStart, selStart + inner.length);
    });
  }

  function toggleLink(): void {
    linkOpen = !linkOpen;
    if (linkOpen) {
      requestAnimationFrame(() => linkInput?.focus());
    }
  }

  /** Ссылка: [выделение](url), без выделения — [ссылка](url). */
  function applyLink(): void {
    const url = linkUrl.trim();
    if (url === '') return;
    const { start, end } = selection();
    const sel = draft.slice(start, end);
    const label = sel === '' ? 'ссылка' : sel;
    draft = draft.slice(0, start) + `[${label}](${url})` + draft.slice(end);
    linkOpen = false;
    linkUrl = '';
    requestAnimationFrame(() => {
      textarea?.focus();
      // Курсор — после ]( (перед url), чтобы дописать/поправить адрес.
      const caret = start + label.length + 2;
      textarea?.setSelectionRange(caret, caret);
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
    const ta = textarea;
    if (!ta) return { start: 0, end: 0 };
    const caret = ta.selectionStart ?? 0;
    const start = draft.lastIndexOf('\n', caret - 1) + 1;
    const nl = draft.indexOf('\n', caret);
    return { start, end: nl === -1 ? draft.length : nl };
  }

  /** Структурный маркер в начале строки, если есть (любой из четырёх). */
  function existingMarker(raw: string): { kind: LineMarkerKind; marker: string } | null {
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
    const caret = textarea?.selectionStart ?? start;
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
    draft = draft.slice(0, start) + newLine + draft.slice(end);
    requestAnimationFrame(() => {
      textarea?.focus();
      const inLine = Math.min(Math.max(caret - start + delta, 0), newLine.length);
      textarea?.setSelectionRange(start + inLine, start + inLine);
    });
  }

  // Escape: диалог → меню → форму напоминания → закрыть страницу (при
  // изменённом тексте requestClose покажет диалог «Сохранить?»).
  $effect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (exitConfirm) {
        exitConfirm = false;
        error = '';
        return;
      }
      if (menuOpen) {
        closeMenu();
        return;
      }
      if (showReminderForm) {
        showReminderForm = false;
        return;
      }
      requestClose();
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  });
</script>

{#snippet toolbar()}
  <!-- Корневой узел панели: onEditorBlur по нему отличает «фокус ушёл на
       панель» от «ушёл совсем» (панель не исчезает под пальцем). -->
  <div bind:this={toolbarEl} class="flex flex-col gap-1.5">
    <div class="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        aria-label="Жирный (**текст**)"
        title="Жирный"
        class="flex h-9 w-9 items-center justify-center rounded-lg bg-background text-[15px] transition-colors active:bg-border/60"
        onmousedown={(e) => e.preventDefault()}
        onclick={() => wrap('**', '**')}
      >
        <span class="font-bold">B</span>
      </button>
      <button
        type="button"
        aria-label="Курсив (*текст*)"
        title="Курсив"
        class="flex h-9 w-9 items-center justify-center rounded-lg bg-background text-[15px] transition-colors active:bg-border/60"
        onmousedown={(e) => e.preventDefault()}
        onclick={() => wrap('*', '*')}
      >
        <span class="italic">I</span>
      </button>
      <button
        type="button"
        aria-label="Код (`текст`)"
        title="Код"
        class="flex h-9 w-9 items-center justify-center rounded-lg bg-background font-mono text-[13px] transition-colors active:bg-border/60"
        onmousedown={(e) => e.preventDefault()}
        onclick={() => wrap('`', '`', 'код')}
      >
        &lt;/&gt;
      </button>
      <button
        type="button"
        aria-label="Ссылка ([текст](url))"
        title="Ссылка"
        class="flex h-9 w-9 items-center justify-center rounded-lg bg-background text-[15px] transition-colors active:bg-border/60 {linkOpen
          ? 'bg-border/60'
          : ''}"
        onmousedown={(e) => e.preventDefault()}
        onclick={toggleLink}
      >
        🔗
      </button>
      <span class="mx-0.5 h-6 w-px bg-border" aria-hidden="true"></span>
      <button
        type="button"
        aria-label="Заголовок (# в начале строки)"
        title="Заголовок"
        class="flex h-9 w-9 items-center justify-center rounded-lg bg-background text-[15px] font-bold transition-colors active:bg-border/60"
        onmousedown={(e) => e.preventDefault()}
        onclick={() => toggleLineMarker('h1')}
      >
        #
      </button>
      <button
        type="button"
        aria-label="Подзаголовок (## в начале строки)"
        title="Подзаголовок"
        class="flex h-9 w-9 items-center justify-center rounded-lg bg-background text-[15px] font-semibold transition-colors active:bg-border/60"
        onmousedown={(e) => e.preventDefault()}
        onclick={() => toggleLineMarker('h2')}
      >
        ##
      </button>
      <button
        type="button"
        aria-label="Список (- в начале строки)"
        title="Список"
        class="flex h-9 w-9 items-center justify-center rounded-lg bg-background text-[17px] transition-colors active:bg-border/60"
        onmousedown={(e) => e.preventDefault()}
        onclick={() => toggleLineMarker('list')}
      >
        ••
      </button>
      <button
        type="button"
        aria-label="Чеклист (- [ ] в начале строки)"
        title="Чеклист"
        class="flex h-9 w-9 items-center justify-center rounded-lg bg-background text-[15px] transition-colors active:bg-border/60"
        onmousedown={(e) => e.preventDefault()}
        onclick={() => toggleLineMarker('check')}
      >
        ☑
      </button>
    </div>

    {#if linkOpen}
      <div class="flex items-center gap-2">
        <!-- svelte-ignore a11y_autofocus -->
        <input
          bind:this={linkInput}
          bind:value={linkUrl}
          type="url"
          placeholder="https://…"
          autofocus
          class="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-accent"
        />
        <button
          type="button"
          class="h-10 shrink-0 rounded-xl bg-accent-strong px-4 text-sm font-medium text-white disabled:opacity-40"
          disabled={linkUrl.trim() === ''}
          onmousedown={(e) => e.preventDefault()}
          onclick={applyLink}
        >
          Вставить
        </button>
      </div>
    {/if}

    <p class="text-xs text-muted">
      # заголовок · ## подзаголовок · - список · - [ ] чеклист · **жирный**, *курсив*, `код`,
      [ссылка](https://…)
    </p>
  </div>
{/snippet}

<div
  class="notepage fixed inset-0 z-[70] flex touch-pan-y flex-col bg-surface"
  class:notepage-settle={!dragging && !closing}
  style:transform={pageTransform()}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerCancel}
  role="dialog"
  aria-modal="true"
  aria-label="Заметка"
>
  <!-- Шапка как у чата: назад + статус -->
  <header
    class="flex shrink-0 items-center justify-between border-b border-border px-3 pt-[env(safe-area-inset-top)]"
  >
    <button
      type="button"
      aria-label="Назад"
      class="flex h-10 w-10 items-center justify-center rounded-full text-lg active:bg-border/50"
      onclick={requestClose}
    >
      ←
    </button>
    <span class="truncate px-2 text-sm text-muted">
      {isDone ? '✅ Выполнена' : isArchived ? '🗄 Архив' : '📝 Заметка'}
    </span>
    <span class="w-10"></span>
  </header>

  <!-- Текст заметки — большое редактируемое поле на всю высоту страницы
       (тапнул и пиши, отдельного режима нет). Скролл — внутри поля;
       touch-pan-y оставляет вертикальный скролл нативным, а горизонтальный
       свайп (закрытие) достаётся странице. -->
  <main class="flex min-h-0 flex-1 flex-col">
    <textarea
      bind:this={textarea}
      bind:value={draft}
      onfocus={() => (focused = true)}
      onblur={onEditorBlur}
      class="min-h-0 w-full flex-1 resize-none touch-pan-y whitespace-pre-wrap bg-transparent px-4 py-4 text-[16px] leading-6 text-content caret-accent outline-none placeholder:text-muted"
      placeholder="Начните печатать…"
    ></textarea>
  </main>

  <footer
    data-no-swipe
    class="shrink-0 border-t border-border bg-bar px-3 pt-2"
    style:padding-bottom={`calc(${keyboardInset}px + env(safe-area-inset-bottom))`}
  >
    {#if error}
      <p class="px-1 pb-2 text-xs text-danger">{error}</p>
    {/if}

    {#if dirty}
      <!-- Текст изменён: вместо ряда действий — «Отмена» и «Сохранить»
           (появляются, только когда есть несохранённые правки, как в
           нативных заметках). Ряд действий скрыт: тап по ✅/⋯ не должен
           «увести» несохранённый текст. -->
      <div class="flex flex-col gap-3 pb-1">
        {@render toolbar()}
        <div class="flex gap-2">
          <button
            type="button"
            class="h-11 flex-1 rounded-xl border border-border text-sm"
            disabled={saving}
            onclick={discard}
          >
            Отмена
          </button>
          <button
            type="button"
            class="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent-strong text-sm font-medium text-white"
            disabled={saving}
            onclick={() => void save(false)}
          >
            {#if saving}
              <Spinner size="16px" />
            {:else}
              Сохранить
            {/if}
          </button>
        </div>
      </div>
    {:else}
      {#if focused}
        <!-- Поле в фокусе (клавиатура открыта): панель форматирования. -->
        <div class="flex flex-col gap-1.5 pb-1">
          {@render toolbar()}
        </div>
      {/if}

      {#if isActive && showReminderForm}
        <ReminderForm
          initial={pageNote.reminder_at ?? ''}
          initialRepeat={pageNote.reminder_repeat}
          busy={busy === 'reminder'}
          onSubmit={onReminderSubmit}
          onSaved={() => {
            showReminderForm = false;
          }}
          onCancel={() => {
            showReminderForm = false;
          }}
        />
      {:else}
        {#if isActive && pageNote.reminder_at !== null}
          <div class="mb-2 flex flex-col gap-1.5 rounded-xl border border-border bg-background px-3 py-2.5">
            <div class="flex items-center justify-between gap-2">
              <span class="min-w-0 truncate text-sm" title={pageNote.reminder_at}>
                ⏰ {formatReminderAt(pageNote.reminder_at, pageNote.reminder_repeat)}
              </span>
              <button
                type="button"
                class="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted transition-colors active:bg-border/60"
                disabled={busy !== null}
                onclick={doClearReminder}
              >
                {#if busy === 'reminder'}
                  <Spinner size="14px" />
                {:else}
                  Снять
                {/if}
              </button>
            </div>
            <div class="flex gap-1.5">
              {#each [15, 30, 60] as minutes (minutes)}
                <button
                  type="button"
                  class="h-8 flex-1 rounded-lg border border-border bg-background text-xs transition-transform active:scale-95"
                  disabled={busy !== null}
                  onclick={() => void snooze(minutes)}
                >
                  +{minutes === 60 ? '1ч' : `${minutes}м`}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Док действий: закреплён под контентом, главные кнопки всегда
             видны (✅/↩️ выполнить, 🔄 приоритет, ⏰ напомнить); остальное
             (📌, 📂 Переместить, 🗄 В архив, 🗑 Удалить) — в меню ⋯.
             data-no-swipe: свайп по кнопкам не закрывает страницу. -->
        <div class="flex items-center justify-between gap-1">
          {#if isActive || isDone}
            <button
              type="button"
              aria-label={isDone ? 'Вернуть в работу' : 'Выполнить'}
              class="flex h-12 w-12 items-center justify-center rounded-full text-xl transition-transform active:scale-90 {isDone
                ? 'bg-border/60'
                : 'bg-accent/15'}"
              disabled={busy !== null}
              onclick={isDone ? doUndone : doToggleDone}
            >
              {#if busy === 'done'}
                <Spinner />
              {:else}
                {isDone ? '↩️' : '✅'}
              {/if}
            </button>
          {:else}
            <button
              type="button"
              aria-label="Вернуть из архива"
              class="flex h-12 items-center gap-2 rounded-full bg-accent/15 px-5 text-base disabled:opacity-50"
              disabled={busy !== null}
              onclick={doUnarchive}
            >
              {#if busy === 'archive'}
                <Spinner />
              {:else}
                ↩️
              {/if}
              Вернуть из архива
            </button>
          {/if}

          <div class="flex items-center gap-1">
            {#if isActive}
              <button
                type="button"
                aria-label={`Приоритет: ${priorityLabel(pageNote.priority)}`}
                title={`Приоритет: ${priorityLabel(pageNote.priority)}`}
                class="flex h-12 min-w-12 items-center justify-center gap-0.5 rounded-full bg-background px-2 text-base transition-transform active:scale-90"
                disabled={busy !== null}
                onclick={doCyclePriority}
              >
                {#if busy === 'priority'}
                  <Spinner />
                {:else}
                  🔄{priorityEmoji(pageNote.priority)}
                {/if}
              </button>
              <button
                type="button"
                aria-label={pageNote.reminder_at !== null ? 'Изменить напоминание' : 'Напомнить'}
                title={pageNote.reminder_at !== null ? 'Изменить напоминание' : 'Напомнить'}
                class="flex h-12 w-12 items-center justify-center rounded-full text-lg transition-transform active:scale-90 {pageNote.reminder_at !==
                  null
                  ? 'bg-accent/15'
                  : 'bg-background'}"
                disabled={busy !== null}
                onclick={toggleReminderForm}
              >
                ⏰
              </button>
            {/if}
            <button
              type="button"
              aria-label="Ещё действия"
              class="flex h-12 w-12 items-center justify-center rounded-full bg-background text-xl transition-transform active:scale-90"
              disabled={busy !== null}
              onclick={openMenu}
            >
              ⋯
            </button>
          </div>
        </div>
      {/if}
    {/if}
  </footer>
</div>

{#if menuOpen}
  <div
    class="backdrop-glass backdrop-anim fixed inset-0 z-[71] bg-black/40"
    onclick={closeMenu}
    aria-hidden="true"
  ></div>
  <div
    class="glass-menu menu-anim fixed z-[72] flex w-56 flex-col gap-1 rounded-2xl p-2 shadow-xl"
    style:right={`${menuPos.right}px`}
    style:bottom={`${menuPos.bottom}px`}
    role="menu"
  >
    {#if isActive}
      <button
        type="button"
        role="menuitem"
        class="flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[15px] transition-colors active:bg-border/50"
        onclick={() => pickMenu(doTogglePin)}
      >
        <span class="w-6 shrink-0 text-center text-base">📌</span>
        <span class="truncate">{pageNote.pinned ? 'Открепить' : 'Закрепить'}</span>
      </button>
      {#if canMove}
        <button
          type="button"
          role="menuitem"
          class="flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[15px] transition-colors active:bg-border/50"
          onclick={() =>
            pickMenu(() => {
              showMove = true;
              error = '';
            })}
        >
          <span class="w-6 shrink-0 text-center text-base">📂</span>
          <span class="truncate">Переместить</span>
        </button>
      {/if}
      <button
        type="button"
        role="menuitem"
        class="flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[15px] transition-colors active:bg-border/50"
        onclick={() => pickMenu(doArchive)}
      >
        <span class="w-6 shrink-0 text-center text-base">🗄</span>
        <span class="truncate">В архив</span>
      </button>
    {/if}
    <button
      type="button"
      role="menuitem"
      class="flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[15px] text-danger transition-colors active:bg-danger/10"
      onclick={() =>
        pickMenu(() => {
          confirmDelete = true;
          error = '';
        })}
    >
      <span class="w-6 shrink-0 text-center text-base">🗑</span>
      <span class="truncate">Удалить</span>
    </button>
  </div>
{/if}

{#if confirmDelete}
  <ConfirmModal
    title="Удалить заметку?"
    text="Заметка будет удалена безвозвратно"
    z="z-[80]"
    busy={busy === 'delete'}
    {error}
    onClose={() => {
      confirmDelete = false;
      error = '';
    }}
    onConfirm={doDelete}
  />
{/if}

{#if exitConfirm}
  <Modal
    open
    z="z-[80]"
    onClose={() => {
      exitConfirm = false;
      error = '';
    }}
  >
    <div class="flex flex-col gap-4 px-1 py-2">
      <div>
        <h2 class="text-lg font-semibold">Несохранённые изменения</h2>
        <p class="mt-1 text-sm text-muted">Сохранить текст заметки перед закрытием?</p>
      </div>
      {#if error}
        <p class="text-sm text-danger">{error}</p>
      {/if}
      <button
        type="button"
        class="flex h-11 items-center justify-center gap-2 rounded-xl bg-accent-strong text-sm font-medium text-white disabled:opacity-50"
        disabled={saving}
        onclick={() => void save(true)}
      >
        {#if saving}
          <Spinner size="16px" />
        {:else}
          Сохранить
        {/if}
      </button>
      <div class="flex gap-2">
        <button
          type="button"
          class="h-11 flex-1 rounded-xl border border-border text-sm disabled:opacity-50"
          disabled={saving}
          onclick={() => {
            exitConfirm = false;
            error = '';
          }}
        >
          Отмена
        </button>
        <button
          type="button"
          class="h-11 flex-1 rounded-xl border border-border text-sm text-danger disabled:opacity-50"
          disabled={saving}
          onclick={() => {
            exitConfirm = false;
            error = '';
            closeNow();
          }}
        >
          Не сохранять
        </button>
      </div>
    </div>
  </Modal>
{/if}

{#if showMove}
  <MoveModal
    note={pageNote}
    z="z-[80]"
    onClose={() => {
      showMove = false;
      requestClose();
    }}
  />
{/if}

<style>
  /* Плавный слайд «как открытие чата»; при drag-жесте transition отключается,
     чтобы страница ехала за пальцем без задержки. Без will-change: transform —
     он вызывал временную перерисовку эмодзи запасным шрифтом (см. app.css). */
  .notepage-settle {
    transition: transform 0.26s cubic-bezier(0.32, 0.72, 0, 1);
  }
</style>
