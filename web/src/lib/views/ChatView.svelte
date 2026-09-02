<script lang="ts">
  // Экран чата: «островок» топиков + строка текущей папки (сверху, стеклянные,
  // фиксированы — список скроллится под ними), список заметок, поле ввода снизу.
  // Островок: клик по табу или горизонтальный свайп по списку переключает топик
  // (активный контент въезжает с соответствующей стороны). Заметки соседних
  // топиков подгружаются в кеш после активного — свайп не ждёт сеть.
  // Внутри папки свайпы топиков отключаются: свайп-вправо (влево-направо)
  // возвращает на уровень выше (папку-родителя или корень), свайп-влево
  // ничего не делает.
  // Папки/топики открываются отдельными шторками: 📁 и 📚 плавающие кнопки
  // над полем ввода; 📁 также — тап по строке текущей папки.
  // Создание топика — долгий тап на табе островка/в меню топика; создание
  // папки — долгий тап на строке папки / заметке / пустом месте.
  import { onDestroy } from 'svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import CreateFolderModal from '$lib/components/CreateFolderModal.svelte';
  import CreateTopicModal from '$lib/components/CreateTopicModal.svelte';
  import FolderBar from '$lib/components/FolderBar.svelte';
  import FolderMenu from '$lib/components/FolderMenu.svelte';
  import FolderRow from '$lib/components/FolderRow.svelte';
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
  import { foldersStore, levelFolders, loadFolders, peekCachedFolders } from '$lib/stores/folders.svelte';
  import { navigation, setActiveFolder, setActiveTopic } from '$lib/stores/navigation.svelte';
  import {
    clearNoteHighlight,
    loadNotes,
    notesStore,
    peekCachedNotes,
    preloadTopicNeighbors,
  } from '$lib/stores/notes.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { loadTopics, topicsStore } from '$lib/stores/topics.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import type { Folder, Note } from '$lib/types/api';
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

  // Контекстное меню строки папки в списке (режим «в списке»): папка +
  // позиция строки в момент открытия (долгий тач/правый клик — FolderRow).
  let folderMenu: { folder: Folder; rect: DOMRect } | null = $state(null);

  function openFolderMenu(folder: Folder, rect: DOMRect): void {
    folderMenu = { folder, rect };
  }

  function closeFolderMenu(): void {
    folderMenu = null;
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

  // ── Инлайн-папки (режим «в списке», как в боте) ─────────────────────────
  // Включается в настройках (⚙️ → формат папок): папки текущего уровня
  // показываются строками в общем списке заметок — порядок как у бота:
  // закреплённые → папки → остальные заметки. Тап по строке — вход в папку;
  // долгий тач/правый клик — контекстное меню папки (FolderMenu).
  // В режиме «отдельная кнопка» папок в списке нет (только 📁/строка папки).
  const inlineFolders = $derived(
    settings.foldersMode === 'list' ? levelFolders() : [],
  );

  /** Текущий список, разбитый на закреплённые/остальные (обычный режим). */
  const normalSplit = $derived(splitNotes(notesStore.notes));

  /** Разбить список заметок на закреплённые и остальные (порядок в списке). */
  function splitNotes(notes: Note[]): { pinned: Note[]; rest: Note[] } {
    const pinned: Note[] = [];
    const rest: Note[] = [];
    for (const n of notes) (n.pinned ? pinned : rest).push(n);
    return { pinned, rest };
  }

  /** Transform панели сцены: база (0 — центр, ±W — сосед) + текущий сдвиг. */
  function panelShift(side: 'left' | 'center' | 'right'): string {
    const s = stage;
    if (s === null) return 'translate3d(0,0,0)';
    const base = side === 'left' ? -s.W : side === 'right' ? s.W : 0;
    return `translate3d(${base + s.eff}px,0,0)`;
  }

  // Панели соседей в сцене не интерактивны (жест ведёт список, клик после
  // горизонтального движения подавляется) — заглушки, чтобы долгий тач не
  // открывал меню чужого топика.
  function noopOpenNote(_note: Note): void {}
  function noopMenuNote(_note: Note, _rect: DOMRect): void {}
  function noopOpenFolder(_folder: Folder): void {}
  function noopMenuFolder(_folder: Folder, _rect: DOMRect): void {}

  let mainEl: HTMLElement | undefined;

  /** Вход в папку по строке списка: переключение уровня + скролл вверх
      (список сменился — показываем его начало). */
  function openFolder(id: number): void {
    setActiveFolder(id);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => mainEl?.scrollTo({ top: 0 }));
    });
  }

  /** Выход из папки на уровень выше (folderId null — корень топика):
      свайп-вправо в папке. Переключение уровня + скролл вверх; контент
      показывается из кеша контекста (если он был), свежесть догружается. */
  function exitFolderTo(folderId: number | null): void {
    setActiveFolder(folderId);
    const topicId = navigation.activeTopicID;
    if (topicId !== null) void loadNotes(topicId, folderId);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => mainEl?.scrollTo({ top: 0 }));
    });
  }

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

  // ── Горизонтальный свайп по списку ──────────────────────────────────────
  // В корне — переключение топиков; внутри папки свайп-вправо выводит на
  // уровень выше (влево отключён). touch-action: pan-y на main — вертикальный
  // скролл нативный, горизонтальный жест достаётся нам. Пока палец ведёт,
  // контент едет за ним (как пролистывание папок в Telegram): список
  // раскладывается в «сцену» из трёх панелей — сосед слева / текущая /
  // сосед справа (превью соседей — из кеша корней, без сети; в папке
  // слева — превью уровня выше). За границей (соседа нет) — «резинка».
  // После отпускания — доводка: за порогом/при флинге доезжаем до соседа,
  // иначе — назад в центр. Если превью ещё не закешировано — сцена не
  // собирается, работает классический свайп (въезд списка после отпускания).
  interface Swipe {
    startX: number;
    startY: number;
    axis: 'h' | 'v' | null;
    lastX: number;
    lastT: number;
    vx: number; // px/ms, сглаженная скорость по последним движениям
  }
  let swipe: Swipe | null = null;
  const SWIPE_THRESHOLD = 48;
  /** Флинг: скорость отпускания, при которой листаем даже без порога. */
  const FLING_PX_MS = 0.5;
  /** Доля ширины экрана, после которой жест считается «доводкой до соседа». */
  const SETTLE_FRACTION = 0.3;
  const AXIS_LOCK_PX = 12;

  // ── Сцена: превью-панель (заметки корня топика из кеша + строки папок).
  // Панели хранят готовые разбивки (закреплённые/остальные) — при движении
  // пальца список не пересчитывается, меняется только transform панелей.
  // В папке сцена другая: превью слева — уровень выше (свайп-вправо выводит
  // из папки), соседа справа нет (свайп-влево смену топиков не включает).
  interface StagePane {
    topicId: number;
    /** Уровень папки, который показывает панель (null — корень топика).
        В сцене соседних топиков у панелей всегда null. */
    folderId: number | null;
    pinned: Note[];
    rest: Note[];
    folders: Folder[];
  }

  let stage = $state<{
    /** Ширина панели (ширина контента main), px. */
    W: number;
    /** Текущий сдвиг сцены: 0 — текущий топик в центре, ±W — сосед. */
    eff: number;
    /** 'topic' — соседние топики (смена топика в корне);
        'folderUp' — выход из папки на уровень выше (свайп-вправо). */
    mode: 'topic' | 'folderUp';
    left: StagePane | null;
    center: StagePane;
    right: StagePane | null;
    settling: boolean;
  } | null>(null);
  /** Куда доводим: 'left'/'right' — сосед, null — вернуться в центр. */
  let settleTarget: 'left' | 'right' | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  /** Список в стадии drag-follow: замеряем его высоту для сцены. */
  let listBox = $state<HTMLDivElement | undefined>(undefined);
  let stageH = $state(0);
  $effect(() => {
    const el = listBox;
    if (el === undefined) return;
    const update = (): void => {
      if (stage === null) stageH = el.offsetHeight;
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  });
  // Высота сцены при drag-follow — по САМОЙ высокой панели (текущая и превью
  // соседей). Если держать высоту текущего списка, превью соседа с длинным
  // списком обрежется по ней (показывалась бы «полоска» высотой с короткий
  // топик). Панели абсолютные — замер после сборки сцены.
  $effect(() => {
    if (stage === null) return;
    const box = listBox;
    if (box === undefined) return;
    let max = box.offsetHeight;
    for (const panel of box.querySelectorAll<HTMLElement>('.swipe-panel')) {
      const h = panel.offsetHeight;
      if (h > max) max = h;
    }
    if (max > 0 && max !== stageH) stageH = max;
  });

  /** Превью-панель соседнего топика: корень из кеша (undefined — кеша нет). */
  function neighborPane(topicId: number): StagePane | null {
    const notes = peekCachedNotes(topicId);
    if (notes === undefined) return null;
    let folders: Folder[] = [];
    if (settings.foldersMode === 'list') {
      const all = peekCachedFolders(topicId);
      if (all === undefined) return null;
      folders = all.filter((f) => f.parent_folder_id === null);
    }
    const { pinned, rest } = splitNotes(notes);
    return { topicId, folderId: null, pinned, rest, folders };
  }

  /** Свободный ход сцены — на ширину панели в сторону соседа; дальше (или в
      сторону без соседа) — «резинка»: ход с сопротивлением, как в Telegram. */
  function clampEff(raw: number): number {
    const s = stage;
    if (s === null) return raw;
    const maxRight = s.left !== null ? s.W : 0;
    const maxLeft = s.right !== null ? -s.W : 0;
    if (raw > maxRight) return maxRight + (raw - maxRight) * 0.35;
    if (raw < maxLeft) return maxLeft + (raw - maxLeft) * 0.35;
    return raw;
  }

  /** Превью-панель «уровень выше» для выхода из папки свайпом-вправо:
      заметки контекста родителя (или корня) из кеша — кеша ещё нет, сцену
      не собираем, после отпускания сработает классический свайп. */
  function mountFolderExitStage(topicId: number, activeFolder: number): void {
    // Уровень выше: родитель активной папки или корень топика (null).
    const folder = foldersStore.all.find((f) => f.id === activeFolder);
    const upFolderId = folder?.parent_folder_id ?? null;
    const upNotes = peekCachedNotes(topicId, upFolderId);
    if (upNotes === undefined) return;
    const notes = notesStore.notes;
    const curFolders = settings.foldersMode === 'list' ? levelFolders() : [];
    if (notes.length === 0 && curFolders.length === 0) return; // экран-заглушка
    const W = mainEl?.clientWidth ?? 0;
    if (W <= 0) return;
    // Высота сцены = высоте текущего списка (панели абсолютные, в потоке
    // сцена сама высоты не имеет). Свежий замер, а не только ResizeObserver.
    const H = listBox?.offsetHeight ?? 0;
    if (H <= 0) return;
    stageH = H;
    const { pinned, rest } = splitNotes(notes);
    const upSplit = splitNotes(upNotes);
    const upFolders =
      settings.foldersMode === 'list'
        ? foldersStore.all.filter((f) => f.parent_folder_id === upFolderId)
        : [];
    stage = {
      mode: 'folderUp',
      W,
      eff: 0,
      left: {
        topicId,
        folderId: upFolderId,
        pinned: upSplit.pinned,
        rest: upSplit.rest,
        folders: upFolders,
      },
      center: { topicId, folderId: activeFolder, pinned, rest, folders: [...curFolders] },
      right: null, // свайп-влево отключён — соседа справа нет
      settling: false,
    };
  }

  /** Собрать сцену в момент блокировки оси (сосед уже закеширован). */
  function mountStage(): void {
    const topicId = navigation.activeTopicID;
    if (topicId === null || mainEl === undefined) return;
    // В папке свайп-вправо выводит на уровень выше — своя сцена (слева
    // превью родителя); свайпы смены топиков внутри папки не работают.
    if (navigation.activeFolderID !== null) {
      mountFolderExitStage(topicId, navigation.activeFolderID);
      return;
    }
    const list = topicsStore.topics;
    const index = list.findIndex((t) => t.id === topicId);
    if (index < 0) return;
    const notes = notesStore.notes;
    const folders = settings.foldersMode === 'list' ? levelFolders() : [];
    if (notes.length === 0 && folders.length === 0) return; // экран-заглушка
    const left = index > 0 ? neighborPane(list[index - 1].id) : null;
    const right = index + 1 < list.length ? neighborPane(list[index + 1].id) : null;
    if (left === null && right === null) return;
    const W = mainEl.clientWidth;
    if (W <= 0) return;
    // Высота сцены = высоте текущего списка (панели абсолютные, в потоке
    // сцена сама высоты не имеет). Свежий замер, а не только ResizeObserver.
    const H = listBox?.offsetHeight ?? 0;
    if (H <= 0) return;
    stageH = H;
    const { pinned, rest } = splitNotes(notes);
    stage = {
      mode: 'topic',
      W,
      eff: 0,
      left,
      center: { topicId, folderId: null, pinned, rest, folders: [...folders] },
      right,
      settling: false,
    };
  }

  /** Закрыть сцену: commitTopicId — топик, в который доехали (null — откат). */
  function closeStage(commitTopicId: number | null): void {
    clearTimeout(settleTimer);
    settleTimer = undefined;
    settleTarget = null;
    if (stage === null) return;
    stage = null;
    mainEl?.classList.remove('swiping');
    if (commitTopicId !== null && commitTopicId !== navigation.activeTopicID) {
      setActiveTopic(commitTopicId);
      // Кеш соседа уже есть (сцена из него и собрана) — показываем сразу,
      // чтобы на кадр не мелькнул список предыдущего топика.
      void loadNotes(commitTopicId, null);
    }
  }

  /** Плавная доводка: едем к соседу (или назад в центр), затем финализируем. */
  function beginSettle(target: 'left' | 'right' | null): void {
    const s = stage;
    if (s === null) return;
    s.settling = true;
    settleTarget = target;
    s.eff = target === 'left' ? s.W : target === 'right' ? -s.W : 0;
    // prefers-reduced-motion: CSS гасит transition, transitionend не придёт —
    // финализируем сразу, не держа соседний список статичным.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finalizeSettle();
      return;
    }
    clearTimeout(settleTimer);
    // Страховка: transitionend может не прийти (прерванный жест) — доводка
    // завершается по таймеру (дольше CSS-перехода .swipe-settle 0.44s).
    settleTimer = setTimeout(finalizeSettle, 560);
  }

  function finalizeSettle(): void {
    clearTimeout(settleTimer);
    settleTimer = undefined;
    const s = stage;
    if (s === null) return;
    const target = settleTarget;
    settleTarget = null;
    if (s.mode === 'folderUp') {
      // Доводка вправо (к левой панели) — выход на уровень выше; откат
      // в центр (свайп-влево, недотяг) папку не меняет.
      const pane = target === 'left' ? s.left : null;
      closeStage(null);
      if (pane !== null) exitFolderTo(pane.folderId);
      return;
    }
    const commitId =
      target === 'left' ? s.left?.topicId : target === 'right' ? s.right?.topicId : null;
    closeStage(commitId ?? null);
  }

  function onMainPointerDown(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return;
    // Жест начался во время доводки/сцены — завершаем её мгновенно, чтобы
    // жесты не «склеивались».
    if (stage !== null) {
      if (stage.settling) finalizeSettle();
      else closeStage(null);
    }
    // В папке свайп-вправо выводит на уровень выше — жест нужен даже при
    // единственном топике; в корне — только когда есть соседи для смены.
    if (topicsStore.topics.length < 2 && navigation.activeFolderID === null) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('textarea, input, a, [data-no-swipe]')) return;
    const t = performance.now();
    swipe = {
      startX: e.clientX,
      startY: e.clientY,
      axis: null,
      lastX: e.clientX,
      lastT: t,
      vx: 0,
    };
  }

  function onMainPointerMove(e: PointerEvent): void {
    const s = swipe;
    if (s === null) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (s.axis === null) {
      if (Math.abs(dx) > AXIS_LOCK_PX && Math.abs(dx) > Math.abs(dy) * 1.3) {
        s.axis = 'h';
        // Пока жест горизонтальный, карточки под пальцем не «нажимаются»
        // (CSS .swiping гасит active-эффекты), список ведём за пальцем.
        mainEl?.classList.add('swiping');
        if (stage === null) mountStage();
      } else if (Math.abs(dy) > AXIS_LOCK_PX) {
        s.axis = 'v';
      }
    }
    if (s.axis !== 'h') return;
    // Скорость флинга по последним движениям.
    const now = performance.now();
    const dt = now - s.lastT;
    const inst = (e.clientX - s.lastX) / Math.max(dt, 1);
    s.vx = dt > 48 ? inst : s.vx * 0.6 + inst * 0.4;
    s.lastX = e.clientX;
    s.lastT = now;
    if (stage !== null && !stage.settling) {
      stage.eff = clampEff(dx);
    }
  }

  function onMainPointerUp(e: PointerEvent): void {
    const s = swipe;
    swipe = null;
    if (s === null) return;
    if (s.axis !== 'h') return;
    mainEl?.classList.remove('swiping');

    // Сцена собрана — решаем, куда доводим. Жест реально тащил список:
    // клик отпускания подавляем (иначе после отката/доводки открылся бы
    // оверлей заметки под пальцем).
    if (stage !== null && !stage.settling) {
      suppressNextClick();
      const W = stage.W;
      const dx = e.clientX - s.startX;
      let target: 'left' | 'right' | null = null;
      if (dx <= -W * SETTLE_FRACTION && stage.right !== null) target = 'right';
      else if (dx >= W * SETTLE_FRACTION && stage.left !== null) target = 'left';
      if (target === null) {
        if (s.vx <= -FLING_PX_MS && stage.right !== null) target = 'right';
        else if (s.vx >= FLING_PX_MS && stage.left !== null) target = 'left';
      }
      beginSettle(target);
      return;
    }
    if (stage !== null) return; // идёт доводка — отпускание второго пальца

    // Классический свайп (превью соседа не закешировано — сцены нет):
    // отпустили за порогом — въезд списка соседнего топика (в папке —
    // выход на уровень выше).
    const dx = e.clientX - s.startX;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;

    // В папке свайпы смены топиков отключены: вправо — на уровень выше
    // (родитель или корень), влево — ничего.
    if (navigation.activeFolderID !== null) {
      if (dx <= 0) return;
      suppressNextClick();
      const folder = foldersStore.all.find((f) => f.id === navigation.activeFolderID);
      const upFolderId = folder?.parent_folder_id ?? null;
      applySlide(false);
      exitFolderTo(upFolderId);
      return;
    }

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

  function onMainPointerCancel(): void {
    swipe = null;
    if (stage !== null) {
      if (stage.settling) finalizeSettle();
      else closeStage(null);
    }
    mainEl?.classList.remove('swiping');
  }

  // ── Ранний захват горизонтального жеста ────────────────────────────────
  // touch-action: pan-y на main отдаёт браузеру «вертикальные» жесты, а
  // границу браузер проводит сам — по первым пикселям движения. Начинаешь
  // свайп с лёгким уходом вверх/вниз — браузер решает, что жест вертикальный,
  // уводит его в нативный скролл (pointercancel, список едет или «резинит»
  // в вертикаль), хотя палец вёл вбок. Дублируем определение оси на
  // cancelable touchmove раньше браузерного pan-y: как только смещение с
  // самого начала горизонтальное (меньший порог, чем у pointermove), берём
  // жест себе и preventDefault'ом не даём нативному скроллу стартовать.
  // Пока ось захвачена горизонтально, каждый touchmove гасится — даже
  // вертикальные колебания пальца посреди свайпа не прокрутят список.
  const EARLY_AXIS_PX = 7;

  function onMainTouchMove(e: TouchEvent): void {
    if (e.touches.length !== 1) return;
    const s = swipe;
    if (s === null) return;
    if (s.axis === 'h') {
      e.preventDefault(); // держим вертикаль замороженной на время свайпа
      return;
    }
    if (s.axis === 'v') return; // скролл отдан браузеру
    const t = e.touches[0];
    const dx = t.clientX - s.startX;
    const dy = t.clientY - s.startY;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax > EARLY_AXIS_PX && ax > ay * 1.3) {
      s.axis = 'h';
      mainEl?.classList.add('swiping');
      if (stage === null) mountStage();
      e.preventDefault();
    }
  }

  $effect(() => {
    const el = mainEl;
    if (el === undefined) return;
    // passive: false — иначе preventDefault на touchmove не сработает.
    el.addEventListener('touchmove', onMainTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onMainTouchMove);
  });

  /** Доводка завершена (transitionend с панелей сцены). */
  function onStageTransitionEnd(e: TransitionEvent): void {
    if (e.propertyName !== 'transform') return;
    const t = e.target;
    if (!(t instanceof Element) || !t.classList.contains('swipe-panel')) return;
    if (stage !== null && stage.settling) finalizeSettle();
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
  // справа — свайп на соседний таб не ждёт сеть. В режиме «папки в списке»
  // превью-панель сцены показывает и корневые папки соседа — их тоже
  // кешируем заранее (иначе drag-follow не соберётся до первого визита).
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
    if (settings.foldersMode === 'list') {
      for (const id of neighbors) {
        if (peekCachedFolders(id) === undefined) void loadFolders(id, true);
      }
    }
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
  {#snippet noteList(
    pinned: Note[],
    rest: Note[],
    folderRows: Folder[],
    onOpenNote: (note: Note) => void,
    onMenuNote: (note: Note, rect: DOMRect) => void,
    onOpenFolder: (folder: Folder) => void,
    onMenuFolder: (folder: Folder, rect: DOMRect) => void,
  )}
    <!-- Колонка списка: закреплённые → строки папок (режим «в списке») →
         остальные заметки. Без анимации появления: при перерисовке списка
         (переключение топиков/папок, закрытие свайп-сцены) каскадный въезд
         «мигал» карточками. -->
    <div class="flex flex-col gap-2 px-3 py-3">
      {#each pinned as note (note.id)}
        <NoteCard
          {note}
          highlighted={notesStore.highlightedId === note.id}
          onOpen={onOpenNote}
          onMenu={onMenuNote}
        />
      {/each}
      {#if folderRows.length > 0}
        {#each folderRows as folder (folder.id)}
          <FolderRow {folder} onOpen={onOpenFolder} onMenu={onMenuFolder} />
        {/each}
      {/if}
      {#each rest as note (note.id)}
        <NoteCard
          {note}
          highlighted={notesStore.highlightedId === note.id}
          onOpen={onOpenNote}
          onMenu={onMenuNote}
        />
      {/each}
    </div>
  {/snippet}

  <main
    bind:this={mainEl}
    class="scroll-area touch-pan-y flex-1 overflow-y-auto"
    style:padding-top={`${topPad}px`}
    class:enter-from-left={slideCls === 'enter-from-left'}
    class:enter-from-right={slideCls === 'enter-from-right'}
    onpointerdown={onMainPointerDown}
    onpointermove={onMainPointerMove}
    onpointerup={onMainPointerUp}
    onpointercancel={onMainPointerCancel}
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
    {:else if notesStore.notes.length === 0 && inlineFolders.length === 0}
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
      <!-- Общий список: закреплённые → строки папок (режим «в списке») →
           остальные заметки. Во время drag-follow список раскладывается
           в сцену: по центру текущий контент, по бокам — превью соседей. -->
      <div
        bind:this={listBox}
        class:swipe-stage={stage !== null}
        class:swipe-settle={stage !== null && stage.settling}
        style:height={stage !== null ? `${stageH}px` : undefined}
        ontransitionend={onStageTransitionEnd}
      >
        {#if stage !== null}
          {#if stage.left !== null}
            <div class="swipe-panel" style:transform={panelShift('left')}>
              {@render noteList(
                stage.left.pinned,
                stage.left.rest,
                stage.left.folders,
                noopOpenNote,
                noopMenuNote,
                noopOpenFolder,
                noopMenuFolder,
              )}
            </div>
          {/if}
          <div class="swipe-panel" style:transform={panelShift('center')}>
            {@render noteList(
              stage.center.pinned,
              stage.center.rest,
              stage.center.folders,
              (n) => (selectedId = n.id),
              openMenu,
              (f) => openFolder(f.id),
              openFolderMenu,
            )}
          </div>
          {#if stage.right !== null}
            <div class="swipe-panel" style:transform={panelShift('right')}>
              {@render noteList(
                stage.right.pinned,
                stage.right.rest,
                stage.right.folders,
                noopOpenNote,
                noopMenuNote,
                noopOpenFolder,
                noopMenuFolder,
              )}
            </div>
          {/if}
        {:else}
          {@render noteList(
            normalSplit.pinned,
            normalSplit.rest,
            inlineFolders,
            (n) => (selectedId = n.id),
            openMenu,
            (f) => openFolder(f.id),
            openFolderMenu,
          )}
        {/if}
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

  <footer
    class="shrink-0 rounded-t-2xl border-t border-border bg-bar pb-[env(safe-area-inset-bottom)]"
  >
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

{#if folderMenu !== null}
  <FolderMenu folder={folderMenu.folder} rect={folderMenu.rect} onClose={closeFolderMenu} />
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
