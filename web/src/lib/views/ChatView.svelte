<script lang="ts">
  // Экран чата: «островок» топиков + строка текущей папки (сверху, стеклянные,
  // фиксированы — список скроллится под ними), список заметок, поле ввода снизу.
  // Островок: клик по табу или горизонтальный свайп по списку переключает топик
  // (активный контент въезжает с соответствующей стороны). Заметки соседних
  // топиков подгружаются в кеш после активного — свайп не ждёт сеть.
  // Папки/топики открываются отдельными шторками: 📁 и 📚 плавающие кнопки
  // над полем ввода; 📁 также — тап по строке текущей папки.
  // Создание топика — долгий тап на табе островка/в меню топика; создание
  // папки — долгий тап на строке папки / заметке / пустом месте.
  import { onDestroy } from 'svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import CreateFolderModal from '$lib/components/CreateFolderModal.svelte';
  import CreateTopicModal from '$lib/components/CreateTopicModal.svelte';
  import FolderBar from '$lib/components/FolderBar.svelte';
  import FolderStrip from '$lib/components/FolderStrip.svelte';
  import InputBar from '$lib/components/InputBar.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import NoteCard from '$lib/components/NoteCard.svelte';
  import NoteMenu from '$lib/components/NoteMenu.svelte';
  import NoteOverlay from '$lib/components/NoteOverlay.svelte';
  import QuickMenu from '$lib/components/QuickMenu.svelte';
  import TopicIsland from '$lib/components/TopicIsland.svelte';
  import TopicMenu from '$lib/components/TopicMenu.svelte';
  import TopicTabs from '$lib/components/TopicTabs.svelte';
  import { loadFolders } from '$lib/stores/folders.svelte';
  import { navigation, setActiveTopic } from '$lib/stores/navigation.svelte';
  import {
    clearNoteHighlight,
    loadNotes,
    notesStore,
    preloadTopicNeighbors,
  } from '$lib/stores/notes.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { loadTopics, topicsStore } from '$lib/stores/topics.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import type { Note } from '$lib/types/api';
  import { suppressNextClick } from '$lib/utils/click';

  // Актуальная заметка для оверлея — из store по id (после мутаций объект обновляется).
  let selectedId: number | null = $state(null);
  const selectedNote = $derived(
    selectedId === null
      ? null
      : notesStore.notes.find((n) => n.id === selectedId) ?? null,
  );

  // Дропдаун-меню (долгий тач по карточке): заметка + позиция карточки в момент открытия.
  let menuNoteId: number | null = $state(null);
  let menuRect: DOMRect | null = $state(null);
  const menuNote = $derived(
    menuNoteId === null ? null : notesStore.notes.find((n) => n.id === menuNoteId) ?? null,
  );

  function openMenu(note: Note, rect: DOMRect): void {
    menuNoteId = note.id;
    menuRect = rect;
  }

  function closeMenu(): void {
    menuNoteId = null;
    menuRect = null;
  }

  // Редактирование из контекстного меню заметки (пункт «✏️ Редактировать»):
  // открываем оверлей заметки сразу в режиме редактирования.
  let editRequestId: number | null = $state(null);

  function requestEdit(note: Note): void {
    editRequestId = note.id;
    selectedId = note.id;
  }

  // Шторки: топики (сетка) и папки (дерево активного топика) — раздельные,
  // открываются плавающими кнопками 📚/📁 (и строкой папки). Не закрываются
  // автоматически при выборе — только вручную (тап вне / Escape).
  let topicSheetOpen = $state(false);
  let folderSheetOpen = $state(false);

  // ── Верхний «островок» + строка папки (overlay над списком) ─────────────
  // Островок и строка фиксированы: main получает верхний паддинг, равный
  // реальной высоте оверлея (+6px), — список не прячется под ними при старте.
  let topZone: HTMLDivElement | undefined;
  let topPad = $state(0);

  $effect(() => {
    const el = topZone;
    if (!el) return;
    const update = (): void => {
      topPad = el.offsetHeight + 6;
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  });

  // Анимация въезда списка при переключении топика (классы enter-from-left/right).
  let slideCls = $state('');
  function applySlide(fromLeft: boolean): void {
    slideCls = '';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        slideCls = fromLeft ? 'enter-from-left' : 'enter-from-right';
      });
    });
  }

  /** Переключить топик с анимацией въезда (выбор таба в островке). */
  function onIslandSelect(id: number): void {
    const current = navigation.activeTopicID;
    const list = topicsStore.topics;
    if (current === null) return;
    const iCurrent = list.findIndex((t) => t.id === current);
    const iNext = list.findIndex((t) => t.id === id);
    if (iCurrent < 0 || iNext < 0) return;
    applySlide(iNext < iCurrent);
    setActiveTopic(id);
  }

  // ── Горизонтальный свайп по списку: переключение топиков ────────────────
  // touch-action: pan-y на main — вертикальный скролл нативный, горизонтальный
  // жест достаётся нам (как пролистывание папок в Telegram).
  interface Swipe {
    startX: number;
    startY: number;
    axis: 'h' | 'v' | null;
  }
  let swipe: Swipe | null = null;
  const SWIPE_THRESHOLD = 48;

  function onMainPointerDown(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return;
    if (topicsStore.topics.length < 2) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('textarea, input, a, [data-no-swipe]')) return;
    swipe = { startX: e.clientX, startY: e.clientY, axis: null };
  }

  function onMainPointerMove(e: PointerEvent): void {
    if (!swipe) return;
    const dx = e.clientX - swipe.startX;
    const dy = e.clientY - swipe.startY;
    if (swipe.axis === null) {
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        swipe.axis = 'h';
      } else if (Math.abs(dy) > 12) {
        swipe.axis = 'v';
      }
    }
  }

  function onMainPointerUp(e: PointerEvent): void {
    const s = swipe;
    swipe = null;
    if (!s || s.axis !== 'h') return;
    const dx = e.clientX - s.startX;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;

    const current = navigation.activeTopicID;
    const list = topicsStore.topics;
    if (current === null) return;
    const index = list.findIndex((t) => t.id === current);
    if (index < 0) return;
    const offset = dx < 0 ? 1 : -1; // влево — следующий топик, вправо — предыдущий
    const target = list[index + offset];
    if (target === undefined) return;

    suppressNextClick();
    applySlide(offset > 0);
    setActiveTopic(target.id);
  }

  // Долгое нажатие на пустом месте (заметок нет) — дропдаун «Создать папку».
  const LONG_PRESS_MS = 500;
  let emptyMenu: { x: number; y: number } | null = $state(null);
  let emptyPressTimer: number | undefined;

  function handleEmptyPress(event: PointerEvent): void {
    emptyPressTimer = window.setTimeout(() => {
      suppressNextClick();
      emptyMenu = { x: event.clientX, y: event.clientY };
    }, LONG_PRESS_MS);
  }

  function cancelEmptyPress(): void {
    window.clearTimeout(emptyPressTimer);
  }

  // При авторизации (старт или вход) — загружаем топики.
  $effect(() => {
    if (session.state === 'authed') {
      void loadTopics();
    }
  });

  // При выборе топика — загружаем его папки (полный список для дерева).
  $effect(() => {
    const topicId = navigation.activeTopicID;
    if (topicId === null) return;
    void loadFolders(topicId);
  });

  // При смене топика или папки — заметки уровня (кеш показывается сразу,
  // свежесть догружается фоном).
  $effect(() => {
    const topicId = navigation.activeTopicID;
    if (topicId === null) return;
    void loadNotes(topicId, navigation.activeFolderID);
  });

  // Предзагрузка: после активного топика подгружаем корни соседей слева и
  // справа — свайп на соседний таб не ждёт сеть.
  $effect(() => {
    const list = topicsStore.topics;
    const topicId = navigation.activeTopicID;
    if (topicId === null || topicsStore.loading) return;
    const index = list.findIndex((t) => t.id === topicId);
    if (index < 0) return;
    const neighbors: number[] = [];
    if (index > 0) neighbors.push(list[index - 1].id);
    if (index + 1 < list.length) neighbors.push(list[index + 1].id);
    void preloadTopicNeighbors(topicId, neighbors);
  });

  // Подсветка «только что добавленной» заметки: держим ~3 сек и снимаем.
  const HIGHLIGHT_MS = 3000;
  let highlightTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const id = notesStore.highlightedId;
    if (id === null) return;
    if (highlightTimer !== null) clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => {
      highlightTimer = null;
      clearNoteHighlight();
    }, HIGHLIGHT_MS);
    return () => {
      if (highlightTimer !== null) {
        clearTimeout(highlightTimer);
        highlightTimer = null;
      }
    };
  });
  // Уход со экрана чата — подсветку не возобновляем при возврате.
  onDestroy(() => clearNoteHighlight());
</script>

<div class="relative flex h-full flex-col">
  <main
    class="scroll-area touch-pan-y flex-1 overflow-y-auto"
    style:padding-top={`${topPad}px`}
    class:enter-from-left={slideCls === 'enter-from-left'}
    class:enter-from-right={slideCls === 'enter-from-right'}
    onpointerdown={onMainPointerDown}
    onpointermove={onMainPointerMove}
    onpointerup={onMainPointerUp}
    onpointercancel={() => (swipe = null)}
  >
    {#if topicsStore.loading}
      <EmptyState emoji="⏳" />
    {:else if topicsStore.error}
      <div class="flex flex-col items-center gap-4 px-6 py-16">
        <EmptyState emoji="⚠️" text={topicsStore.error} />
        <button
          type="button"
          class="h-11 rounded-xl border border-border px-6 text-sm"
          onclick={() => void loadTopics()}
        >
          Повторить
        </button>
      </div>
    {:else if topicsStore.topics.length === 0}
      <div class="flex flex-col items-center gap-4 px-6 py-16">
        <EmptyState emoji="＋" text="Создайте топик" />
        <button
          type="button"
          class="flex h-11 items-center gap-2 rounded-xl border border-border px-6 text-sm"
          onclick={() => (ui.topicCreateOpen = true)}
        >
          <span>＋</span> Создать
        </button>
      </div>
    {:else if notesStore.loading}
      <EmptyState emoji="⏳" />
    {:else if notesStore.error}
      <div class="flex flex-col items-center gap-4 px-6 py-16">
        <EmptyState emoji="⚠️" text={notesStore.error} />
        <button
          type="button"
          class="h-11 rounded-xl border border-border px-6 text-sm"
          onclick={() => {
            const topicId = navigation.activeTopicID;
            if (topicId !== null) void loadNotes(topicId, navigation.activeFolderID);
          }}
        >
          Повторить
        </button>
      </div>
    {:else if notesStore.notes.length === 0}
      <!-- Пустое место: долгое нажатие — дропдаун «Создать папку» -->
      <div
        role="group"
        aria-label="Пустое место"
        class="flex min-h-full flex-col"
        onpointerdown={handleEmptyPress}
        onpointerup={cancelEmptyPress}
        onpointercancel={cancelEmptyPress}
        onpointerleave={cancelEmptyPress}
      >
        <div class="flex flex-1 flex-col">
          <EmptyState />
        </div>
      </div>
    {:else}
      <div class="flex flex-col gap-2 px-3 py-3">
        {#each notesStore.notes as note, i (note.id)}
          <div class="note-enter" style="animation-delay: {Math.min(i * 24, 300)}ms">
            <NoteCard
              {note}
              highlighted={notesStore.highlightedId === note.id}
              onOpen={(n) => (selectedId = n.id)}
              onMenu={openMenu}
            />
          </div>
        {/each}
      </div>
    {/if}
  </main>

  <!-- Островок топиков + строка папки: фиксированы над списком (pointer-events
       только на самих панелях — между ними список можно листать) -->
  <div
    bind:this={topZone}
    class="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+8px)]"
  >
    <TopicIsland onSelect={onIslandSelect} />
    <FolderStrip onOpen={() => (folderSheetOpen = true)} />
  </div>

  <footer class="shrink-0 rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)]">
    <InputBar
      onOpenTopics={() => (topicSheetOpen = true)}
      onOpenFolders={() => (folderSheetOpen = true)}
    />
  </footer>
</div>

{#if selectedNote !== null}
  <NoteOverlay
    note={selectedNote}
    startEditing={editRequestId === selectedNote.id}
    onClose={() => {
      selectedId = null;
      editRequestId = null;
    }}
  />
{/if}

{#if menuNote !== null && menuRect !== null}
  <NoteMenu
    note={menuNote}
    rect={menuRect}
    onClose={closeMenu}
    onEdit={requestEdit}
  />
{/if}

{#if emptyMenu !== null}
  <QuickMenu
    x={emptyMenu.x}
    y={emptyMenu.y}
    items={[
      {
        emoji: '📁',
        label: 'Создать папку',
        action: () => (ui.folderCreateOpen = true),
      },
    ]}
    onClose={() => (emptyMenu = null)}
  />
{/if}

<!-- Шторка топиков (сетка) и шторка папок (дерево) -->
{#if topicSheetOpen}
  <Modal open onClose={() => (topicSheetOpen = false)}>
    <div class="flex flex-col gap-2">
      <h2 class="px-1 text-sm font-semibold uppercase tracking-wide text-muted">Топики</h2>
      <TopicTabs />
    </div>
  </Modal>
{/if}

{#if folderSheetOpen}
  <Modal open onClose={() => (folderSheetOpen = false)}>
    <div class="flex flex-col gap-2">
      <h2 class="px-1 text-sm font-semibold uppercase tracking-wide text-muted">Папки</h2>
      <FolderBar />
    </div>
  </Modal>
{/if}

<TopicMenu />
<CreateTopicModal />
<CreateFolderModal />
