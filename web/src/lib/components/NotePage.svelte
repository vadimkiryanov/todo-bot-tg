<script lang="ts">
  // Полноэкранная «страница» заметки (как открытие чата в Telegram):
  // въезжает слайдом поверх списка, назад — стрелка в шапке или свайп вправо.
  // Действия зависят от состояния заметки (active/done/archived): у «склада»
  // и архива только уместные кнопки. Мутации owner-aware: если заметка лежит
  // в одном из списков стора (активный/архив/выполненные/таймеры), обновляется
  // он; иначе (заметка открыта из уведомления, списки не загружены) — прямые
  // API-вызовы с локальным состоянием. Каждая busy-кнопка показывает спиннер.
  import { onMount } from 'svelte';
  import ConfirmModal from './ConfirmModal.svelte';
  import MoveModal from './MoveModal.svelte';
  import NoteEditForm from './NoteEditForm.svelte';
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
  import { navigation } from '../stores/navigation.svelte';
  import { foldersStore } from '../stores/folders.svelte';
  import type { Note, ReminderRepeat } from '../types/api';
  import {
    formatReminderAt,
    nextPriority,
    priorityEmoji,
    priorityLabel,
  } from '../utils/format';
  import { renderNoteBlocksHtml } from '../utils/blocks';

  let {
    note,
    startEditing = false,
    onClose,
  }: {
    note: Note;
    /** Открыть сразу в режиме редактирования (пункт меню «✏️ Редактировать»). */
    startEditing?: boolean;
    onClose: () => void;
  } = $props();

  // Живое состояние: при store-мутациях родитель передаёт обновлённый объект
  // из списка; для «чужой» заметки (из уведомления) обновляем локально.
  let pageNote = $state<Note>(note);
  $effect(() => {
    if (note.id === pageNote.id && note !== pageNote) pageNote = note;
  });

  const owned = $derived(hasLoadedNote(pageNote.id));

  // ── Анимация: слайд справа (въезд) / вправо (закрытие) ──────────────────
  let visible = $state(false);
  onMount(() => {
    // Двойной rAF: первый кадр — справа, второй — плавный въезд.
    requestAnimationFrame(() => requestAnimationFrame(() => (visible = true)));
  });
  let closing = $state(false);
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  function requestClose(): void {
    if (closing) return;
    closing = true;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => onClose(), 240);
  }

  // ── Свайп вправо — закрыть (страница едет за пальцем) ───────────────────
  const SWIPE_CLOSE_PX = 90;
  const FLING_PX_MS = 0.4;
  let drag = $state(0);
  let dragging = $state(false);
  let swipeAxis: 'h' | 'v' | null = null;
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
    const target = e.target as HTMLElement | null;
    if (target?.closest('textarea, input, [data-no-swipe]')) return;
    swipeStartX = e.clientX;
    swipeStartY = e.clientY;
    swipeAxis = null;
    swipeLastX = e.clientX;
    swipeLastT = performance.now();
    swipeVx = 0;
  }

  function onPointerMove(e: PointerEvent): void {
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
    if (swipeAxis !== 'h' || closing) return;
    const dx = e.clientX - swipeStartX;
    const close = dx >= SWIPE_CLOSE_PX || swipeVx >= FLING_PX_MS;
    if (close) requestClose();
    else drag = 0;
    swipeAxis = null;
    dragging = false;
  }

  function onPointerCancel(): void {
    swipeAxis = null;
    dragging = false;
    drag = 0;
  }

  // ── Состояние и действия ────────────────────────────────────────────────
  let editing = $state(startEditing);
  const openedFromMenu = startEditing;
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
  const canMove = $derived(
    isActive && pageNote.topic_id === navigation.activeTopicID && foldersStore.all.length > 0,
  );

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

  function startEdit(): void {
    editing = true;
    error = '';
  }

  function cancelEdit(): void {
    if (openedFromMenu) {
      // Пришли из контекстного меню сразу в редактор — закрываем страницу.
      requestClose();
      return;
    }
    editing = false;
    error = '';
  }

  /** Сохранение текста для заметки не из списков (редактор в standalone). */
  async function saveTextOverride(text: string): Promise<void> {
    pageNote = await apiUpdateNote(pageNote.id, { text });
  }

  /**
   * Клик по чекбоксу чеклиста: переключает «[ ]» ↔ «[x]» в тексте и сохраняет
   * как обычную правку. Маркеры обоих состояний одной длины, поэтому смещения
   * entities не сдвигаются — меняется один символ на позиции маркера (start+3).
   */
  async function toggleCheck(pos: number): Promise<void> {
    const text = pageNote.text;
    if (text.slice(pos, pos + 3) !== '- [') return;
    const mark = text[pos + 3];
    if (mark !== ' ' && mark !== 'x') return;
    const nextText = text.slice(0, pos + 3) + (mark === ' ' ? 'x' : ' ') + text.slice(pos + 4);
    error = '';
    try {
      if (owned) {
        await saveText(pageNote, nextText);
      } else {
        pageNote = await apiUpdateNote(pageNote.id, { text: nextText });
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'ошибка';
    }
  }

  /** Делегированный клик по контейнеру текста: тап по чекбоксу чеклиста. */
  function onBodyClick(e: MouseEvent): void {
    const target = e.target as HTMLElement | null;
    if (target === null) return;
    const cb = target.closest<HTMLElement>('[data-cb]');
    if (cb === null) return;
    e.preventDefault();
    void toggleCheck(Number(cb.dataset.cb));
  }

  // Escape: закрыть меню → форму напоминания → редактор → страницу.
  $effect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editing) {
        cancelEdit();
      } else if (menuOpen) {
        closeMenu();
      } else if (showReminderForm) {
        showReminderForm = false;
      } else {
        requestClose();
      }
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  });
</script>

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

  <!-- touch-pan-y: вертикальный скролл остаётся нативным, а горизонтальный
       свайп (закрытие) достаётся странице по всей площади, а не только шапке -->
  <main class="scroll-area touch-pan-y flex-1 overflow-y-auto px-4 py-4">
    {#if editing}
      <NoteEditForm
        note={pageNote}
        saveOverride={owned ? undefined : saveTextOverride}
        onCancel={cancelEdit}
        onSaved={cancelEdit}
      />
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
      <div
        class="whitespace-pre-wrap break-words text-[16px] leading-6 text-content [&_a]:text-accent [&_a]:underline [&_code]:rounded [&_code]:bg-border/40 [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-border/40 [&_pre]:p-2"
        class:note-done={isDone}
        onclick={onBodyClick}
      >
        {@html renderNoteBlocksHtml(pageNote.text, pageNote.entities, isActive)}
      </div>
    {/if}
  </main>

  {#if !editing}
    <!-- Док действий: закреплён под контентом, главные кнопки всегда видны
         (✅/↩️ выполнить, 🔄 приоритет, ⏰ напомнить, ✏️ править); остальное
         (📌, 📂 Переместить, 🗄 В архив, 🗑 Удалить) — в меню ⋯. Чип
         напоминания появляется только когда оно установлено; форма по ⏰
         занимает док целиком. data-no-swipe: свайп по кнопкам не закрывает
         страницу. -->
    <footer
      data-no-swipe
      class="shrink-0 border-t border-border bg-bar px-3 pb-[env(safe-area-inset-bottom)] pt-2"
    >
      {#if error}
        <p class="px-1 pb-2 text-xs text-danger">{error}</p>
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
              aria-label="Редактировать"
              class="flex h-12 w-12 items-center justify-center rounded-full bg-background text-lg"
              disabled={busy !== null}
              onclick={startEdit}
            >
              ✏️
            </button>
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
    </footer>
  {/if}
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
    busy={busy === 'delete'}
    {error}
    onClose={() => {
      confirmDelete = false;
      error = '';
    }}
    onConfirm={doDelete}
  />
{/if}

{#if showMove}
  <MoveModal
    note={pageNote}
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
