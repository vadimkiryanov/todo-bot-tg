<script lang="ts">
  // Экран чата: «островок» топиков (сверху, стеклянный, фиксирован — список
  // скроллится под ним), список заметок, поле ввода снизу.
  // Переключение топиков — SwiperJS (слайд = топик): горизонтальный свайп
  // работает в корне топиков, активный контент едет за пальцем (нативные
  // жесты библиотеки, никакой самописной «сцены»). Вертикальный скролл —
  // послайдовый: у каждого слайда свой scroll-контейнер (.chat-scroll);
  // сам свайпер не скроллится (overflow скрыт). Активный слайд — «живой»
  // список из стора; соседние слайды — статичные превью корней из кеша
  // (peekCachedNotes/peekCachedFolders), без кеша — плейсхолдер ⏳, а хэндлеры
  // заглушены (no-op), чтобы долгий тап не открывал меню чужого топика.
  // Внутри папки свайпы топиков отключены целиком (allowTouchMove = false),
  // но свайп ВПРАВО по списку — жест «назад»: поднимает на уровень выше
  // (до корня топика), контент едет за пальцем (drag-follow — внутри слайда
  // собирается сцена из превью родителя из кеша и текущего списка). Слайды
  // Swiper тут не подходят: слайд = топик, а папка — уровень внутри слайда,
  // слайда-«родителя» у свайпера нет — жест ведём сами (см. блок ниже).
  // Кроме жеста выход из папки — тапом по UI (в шторке
  // папок «📂 Корень»/уровень, таб-крошка островка в режиме пути 'tab',
  // строка-крошка FolderStrip в 'strip').
  // Путь в папках (настройка pathMode): по умолчанию расширяет активный таб
  // островка — «Топик › Папка › Подпапка», тап по табу открывает шторку
  // папок; в режиме 'strip' — прежняя строка-крошка под островком.
  // Папки/топики открываются отдельными шторками: 📁 и 📚 плавающие кнопки
  // над полем ввода (📁 — в режиме папок 'button').
  // Создание топика — долгий тап на табе островка/в меню топика; создание
  // папки — долгий тап на строке папки / заметке / пустом месте.
  // Swiper v14 (element) не регистрирует custom elements при импорте —
  // обязателен явный вызов register(), иначе swiper-container/swiper-slide
  // остаются неизвестными элементами и свайпер не инициализируется.
  import { register } from 'swiper/element/bundle';
  register();
  import type { SwiperContainer } from 'swiper/element';
  import type { Swiper } from 'swiper/types';
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
  import NotePage from '$lib/components/NotePage.svelte';
  import QuickMenu from '$lib/components/QuickMenu.svelte';
  import TopicIsland from '$lib/components/TopicIsland.svelte';
  import TopicMenu from '$lib/components/TopicMenu.svelte';
  import TopicTabs from '$lib/components/TopicTabs.svelte';
  import { foldersStore, levelFolders, loadFolders, peekCachedFolders, foldersCacheTick } from '$lib/stores/folders.svelte';
  import { navigation, setActiveFolder, setActiveTopic } from '$lib/stores/navigation.svelte';
  import {
    clearNoteHighlight,
    loadNotes,
    notesStore,
    notesCacheTick,
    peekCachedNotes,
    preloadTopicNeighbors,
  } from '$lib/stores/notes.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { loadTopics, topicsStore } from '$lib/stores/topics.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import type { Folder, Note, Topic } from '$lib/types/api';
  import { suppressNextClick } from '$lib/utils/click';

  // Актуальная заметка для «страницы» (NotePage). Кэш последнего объекта:
  // заметка может исчезнуть из списка (done/архив) раньше, чем доиграет
  // анимация закрытия страницы — держим объект до явного onClose.
  let selectedId: number | null = $state(null);
  let selectedCache: Note | null = $state(null);
  $effect(() => {
    if (selectedId === null) {
      selectedCache = null;
      return;
    }
    const found = notesStore.notes.find((n) => n.id === selectedId);
    if (found) selectedCache = found;
  });

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
  // открываем страницу заметки сразу в режиме редактирования.
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

  // Панели соседних топиков в слайдах не интерактивны (жест ведёт свайпер,
  // клик/долгий тап не должен открывать меню чужого топика) — заглушки.
  function noopOpenNote(_note: Note): void {}
  function noopMenuNote(_note: Note, _rect: DOMRect): void {}
  function noopOpenFolder(_folder: Folder): void {}
  function noopMenuFolder(_folder: Folder, _rect: DOMRect): void {}

  // ── Превью соседних топиков (неактивные слайды) ─────────────────────────
  // Статичный снимок корня топика из кеша (заметки + при режиме «папки
  // в списке» корневые папки). Кеш — обычный Map, поэтому превью пересобирается
  // по реактивным счётчикам изменений кеша (notesCacheTick/foldersCacheTick).
  interface SlidePreview {
    /** 'pending' — кеша ещё нет, слайд показывает плейсхолдер ⏳. */
    state: 'pending' | 'ready';
    pinned: Note[];
    rest: Note[];
    folders: Folder[];
  }

  const previews = $derived.by(() => {
    // Реактивность: счётчики кешей + режим папок + список топиков.
    notesCacheTick.n;
    foldersCacheTick.n;
    settings.foldersMode;
    const map = new Map<number, SlidePreview>();
    for (const topic of topicsStore.topics) {
      const notes = peekCachedNotes(topic.id, null);
      if (notes === undefined) {
        map.set(topic.id, { state: 'pending', pinned: [], rest: [], folders: [] });
        continue;
      }
      let folders: Folder[] = [];
      if (settings.foldersMode === 'list') {
        const all = peekCachedFolders(topic.id);
        if (all === undefined) {
          map.set(topic.id, { state: 'pending', pinned: [], rest: [], folders: [] });
          continue;
        }
        folders = all.filter((f) => f.parent_folder_id === null);
      }
      const { pinned, rest } = splitNotes(notes);
      map.set(topic.id, { state: 'ready', pinned, rest, folders });
    }
    return map;
  });

  function previewData(topicId: number): SlidePreview | undefined {
    return previews.get(topicId);
  }

  /** Слайды рядом с активным (сам + соседи ±1): у них рендерим контент или
      превью. Дальние слайды — пустые оболочки (ленивость): при многих
      топиках в DOM не висят сотни карточек, контент появляется, когда слайд
      приблизился к активному (переключение слайда = смена activeTopicID). */
  const nearTopicIds = $derived.by(() => {
    const set = new Set<number>();
    const list = topicsStore.topics;
    const id = navigation.activeTopicID;
    if (id === null) return set;
    const index = list.findIndex((t) => t.id === id);
    if (index < 0) return set;
    for (let i = Math.max(0, index - 1); i <= Math.min(list.length - 1, index + 1); i++) {
      set.add(list[i].id);
    }
    return set;
  });

  /** Стартовый слайд свайпера: восстановленный активный топик. Атрибут
      initial-slide читается элементом один раз при инициализации — после
      этого слайдом управляют события/эффекты ниже. */
  const initialTopicIndex = $derived.by(() => {
    const id = navigation.activeTopicID;
    if (id === null) return 0;
    const index = topicsStore.topics.findIndex((t) => t.id === id);
    return index > 0 ? index : 0;
  });

  // ── Свайпер (Swiper element, слайд = топик) ─────────────────────────────
  // Слайды рендерятся по topicsStore.topics (в том же порядке, что табы
  // островка). Навигация двусторонняя:
  //  • свайп/таб островка двигает свайпер → событие slideChange пишет
  //    navigation.activeTopicID (guard: если id совпадает — пропуск, иначе
  //    замкнутый цикл slideTo ↔ slideChange);
  //  • программная смена (TopicTabs/шторка, deleteTopic/restore, вход в чат)
  //    меняет стор → $effect делает swiper.slideTo (с тем же guard).
  // Папки: вход (activeFolderID) — allowTouchMove=false, выход — true.
  let swiperEl: SwiperContainer | undefined = $state();

  function currentSwiper(): Swiper | undefined {
    const el = swiperEl;
    if (el === undefined) return undefined;
    const sw = el.swiper;
    if (sw === undefined || sw.destroyed) return undefined;
    return sw;
  }

  /** Индекс топика в списке/свайпере (-1 — нет). */
  function topicIndexById(id: number): number {
    return topicsStore.topics.findIndex((t) => t.id === id);
  }

  /** id топика слайда свайпера по индексу (NaN — слайда нет). */
  function slideTopicId(sw: Swiper, index: number): number {
    const slide = sw.slides[index];
    if (slide === undefined) return NaN;
    const raw = (slide as HTMLElement).dataset.topicId;
    return raw === undefined ? NaN : Number(raw);
  }

  /** Скорость анимации: 0 при prefers-reduced-motion. */
  function slideSpeed(): number {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 360;
  }

  /** Привести активный слайд к navigation.activeTopicID. Защита от петель:
      если слайд уже показывает нужный топик — не трогаем свайпер. */
  function alignToActive(animate: boolean): void {
    const sw = currentSwiper();
    const id = navigation.activeTopicID;
    if (sw === undefined || id === null) return;
    const want = topicIndexById(id);
    if (want < 0 || want >= sw.slides.length) return; // свайпер ещё не пересобрался
    if (slideTopicId(sw, sw.activeIndex) === id) return;
    sw.slideTo(want, animate ? slideSpeed() : 0);
  }

  /** Слайднуть к топику (тап по табу островка). */
  function slideToTopic(id: number): void {
    const sw = currentSwiper();
    const want = topicIndexById(id);
    if (sw !== undefined && want >= 0) {
      sw.slideTo(want, slideSpeed());
      return;
    }
    // Свайпер ещё не готов — переключение просто меняет стор (эффект догонит).
    setActiveTopic(id);
  }

  /** Переключить топик (выбор таба в островке): ведём слайд свайпера. */
  function onIslandSelect(id: number): void {
    slideToTopic(id);
  }

  // События свайпера: свайп/таб → стор; реальный drag → гасим «клик
  // отпускания» (иначе после свайпа открылся бы оверлей заметки под пальцем);
  // пересборка слайдов (удаление/добавление топиков) → синхронизация.
  // Доводка после отпускания пальца — своя пружина (см. slideToWithSpring):
  // заводская CSS-transition стартует с нулевой/произвольной скорости —
  // «смена скорости» в момент отпускания, как было у свайпа из папки.
  $effect(() => {
    const el = swiperEl;
    const sw = el?.swiper;
    if (el === undefined || sw === undefined) return;

    let dragMoved = false;
    const onSlideChange = (): void => {
      const id = slideTopicId(sw, sw.activeIndex);
      if (!Number.isNaN(id) && id !== navigation.activeTopicID) {
        setActiveTopic(id);
      }
    };

    // Скорость горизонтального драга (px/ms, сглаженная по последним
    // движениям) — доводка-пружина стартует со скорости пальца.
    let lastMoveT = 0;
    let lastMoveX = 0;
    let swipeVx = 0;
    const onSliderMove = (): void => {
      dragMoved = true;
      const now = performance.now();
      const x = sw.touches.currentX;
      const dt = now - lastMoveT;
      if (lastMoveT > 0 && dt > 0) {
        const inst = (x - lastMoveX) / dt;
        swipeVx = dt > 48 ? inst : swipeVx * 0.6 + inst * 0.4;
      }
      lastMoveX = x;
      lastMoveT = now;
    };

    // ── Доводка после отпускания — критически демпфированная пружина ─────
    // После touchEnd Swiper зовёт slideTo(index) — тот ставит CSS-transition
    // с easing, стартующим с нулевой скорости: слайд ехал за пальцем и в
    // момент отпускания «тормозит-разгоняется» (рывок). Заменяем доводку на
    // пружину на requestAnimationFrame (та же, что у свайпа-«назад» из папки):
    // translate пишется напрямую (sw.setTranslate) без реактивного рендера на
    // каждый кадр; когда пружина пришла к цели — мгновенный slideTo(index, 0):
    // Swiper синхронно обновляет активный слайд и эмитит slideChange уже
    // ПОСЛЕ остановки — контент/стор переключаются на неподвижном экране.
    type SlideToFn = (
      index?: number,
      speed?: number,
      runCallbacks?: boolean,
      internal?: boolean,
      initial?: boolean,
    ) => boolean;
    const origSlideTo = sw.slideTo.bind(sw) as SlideToFn;
    const K = 400; // ω²
    const C = 40; // 2ω — критическое демпфирование
    let springRaf: number | undefined;
    let springIndex: number | null = null;
    /** Отпускание пальца: скорость для подхвата + момент (свежесть проверяет
        slideToWithSpring — программный slideTo не подхватит старый жест). */
    let springPending: { vx: number; at: number } | null = null;
    /** Пружина отменена новым касанием (слайд пойман на полпути). */
    let springHalted = false;

    const cancelSpring = (): void => {
      if (springRaf !== undefined) cancelAnimationFrame(springRaf);
      springRaf = undefined;
    };

    /** Довести wrapper пружиной до слайда index. v0 — px/с (скорость пальца). */
    const runSpring = (index: number, v0: number): void => {
      cancelSpring();
      const target = -sw.snapGrid[Math.min(index, sw.snapGrid.length - 1)];
      const finish = (): void => {
        springIndex = null;
        springRaf = undefined;
        // Мгновенный slideTo: translate уже у цели — Swiper обновит индекс,
        // классы и эмитит slideChange (runCallbacks=true, как в slideTo).
        origSlideTo(index, 0, true);
      };
      let x = sw.translate;
      let v = v0;
      sw.setTransition(0); // снять возможный CSS-transition от прошлого перехода
      if (Math.abs(target - x) < 0.5 && Math.abs(v) < 1) {
        sw.setTranslate(target);
        finish();
        return;
      }
      let prev = performance.now();
      const step = (now: number): void => {
        if (springRaf === undefined) return; // пружина отменена (новый жест)
        const dt = Math.min((now - prev) / 1000, 0.032);
        prev = now;
        const dx = target - x;
        if (Math.abs(dx) < 0.5 && Math.abs(v) < 1) {
          sw.setTranslate(target);
          finish();
          return;
        }
        v += (K * dx - C * v) * dt;
        x += v * dt;
        // Округление только на записи в DOM (субпиксельный transform
        // «дрожит»), x остаётся непрерывным — иначе пружина застревает
        // в пикселе от цели и не достигает условия остановки.
        sw.setTranslate(Math.round(x));
        springRaf = requestAnimationFrame(step);
      };
      springIndex = index;
      springRaf = requestAnimationFrame(step);
    };

    /** Обёртка slideTo: жестовый вызов (из touchEnd свайпера) — пружина;
        программный (тап по табу, эффекты) — оригинальный slideTo. */
    const slideToWithSpring = (
      index: number,
      speed?: number,
      runCallbacks = true,
      internal?: boolean,
      initial?: boolean,
    ): boolean => {
      const pending = springPending;
      springPending = null;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (
        reduced ||
        speed === 0 ||
        pending === null ||
        performance.now() - pending.at > 250
      ) {
        return origSlideTo(index, reduced && speed !== 0 ? 0 : speed, runCallbacks, internal, initial);
      }
      runSpring(index, pending.vx * 1000);
      return true;
    };
    sw.slideTo = slideToWithSpring as typeof sw.slideTo;

    const onTouchStart = (): void => {
      // Новое касание ловит слайд на полпути доводки: пружину гасим, свайпер
      // поведёт от текущей позиции; если касание окажется тапом (движения не
      // было) — доводку возобновим в touchEnd.
      if (springRaf !== undefined) {
        springHalted = true;
        cancelSpring();
      }
      lastMoveT = 0;
      springPending = null;
    };
    const onTouchEnd = (): void => {
      if (dragMoved) {
        dragMoved = false;
        suppressNextClick();
      }
      // Скорость отпускания для доводки (свежесть — в slideToWithSpring).
      springPending = { vx: swipeVx, at: performance.now() };
      if (springHalted && springIndex !== null && !sw.touchEventsData.isMoved) {
        // Тап (без движения) во время доводки — доезжаем к прежней цели.
        springHalted = false;
        runSpring(springIndex, 0);
      } else {
        springHalted = false;
      }
    };
    const onSlidesChanged = (): void => alignToActive(false);

    sw.on('slideChange', onSlideChange);
    sw.on('sliderMove', onSliderMove);
    sw.on('touchStart', onTouchStart);
    sw.on('touchEnd', onTouchEnd);
    sw.on('slidesLengthChange', onSlidesChanged);
    return () => {
      cancelSpring();
      sw.slideTo = origSlideTo;
      sw.off('slideChange', onSlideChange);
      sw.off('sliderMove', onSliderMove);
      sw.off('touchStart', onTouchStart);
      sw.off('touchEnd', onTouchEnd);
      sw.off('slidesLengthChange', onSlidesChanged);
    };
  });

  // Программная навигация (шторка «Топики», восстановление сессии, удаление
  // активного топика и т.п.): активный топик в сторе изменился — слайднуться.
  // Зависимость от длины списка: после удаления/создания топика слайды
  // пересобраны — проверяем соответствие заново.
  $effect(() => {
    const id = navigation.activeTopicID;
    if (id === null) return;
    void topicsStore.topics.length;
    alignToActive(true);
  });

  // Внутри папки свайпы топиков отключены целиком: жестом можно только
  // листать вертикальный список папки. Ставим и params, и свойство инстанса
  // (обработчики касаний смотрят именно в swiper.allowTouchMove).
  $effect(() => {
    const el = swiperEl;
    const sw = el?.swiper;
    if (el === undefined || sw === undefined) return;
    const touchAllowed = navigation.activeFolderID === null;
    sw.allowTouchMove = touchAllowed;
    sw.params.allowTouchMove = touchAllowed;
  });

  // ── Свайп-«назад» из папки (drag-follow, жест вправо) ──────────────────
  // Свайпер в папке выключен (allowTouchMove=false), и его слайды тут не
  // помогут: слайд = топик, а папка — уровень ВНУТРИ слайда, слайда-
  // «родителя» у свайпера нет (см. шапку файла). Поэтому жест «назад» ведём
  // сами, как в интерфейсе до Swiper: пока палец тянет вправо, контент едет
  // за ним — внутри слайда собирается сцена из двух слоёв: слева превью
  // уровня выше из кеша, по центру текущий список. Отпустили за порогом/
  // флинтом — доводка до родителя (выход на уровень выше), иначе — пружина
  // в центр. Если превью не закешировано (или уровень — экран-заглушка),
  // сцена не собирается: после отпускания за порогом — мгновенный выход.
  // Влево/вертикаль не трогаем: вертикаль уводит браузер в нативный скролл
  // (touch-action: pan-y шлёт pointercancel), влево ничего не делает (свайп-
  // влево в папке смену топиков не включает).
  // Захват указателя вешаем на исходный элемент (не на зону): отпускание
  // приходит ему же, и его обработчики (сброс долгого тапа на карточке/пустом
  // месте) срабатывают как обычно. В корне (папки нет) жест выключен —
  // свайпер рулит сам.
  const AXIS_LOCK_PX = 12;
  /** Доля ширины, после которой отпускание — «доводка до родителя». */
  const SETTLE_FRACTION = 0.3;
  /** Флинг: скорость отпускания, при которой выходим даже без порога. */
  const FLING_PX_MS = 0.5;
  /** Сцены нет (кеш родителя пуст/не закеширован, экран-заглушка): выход
      мгновенный, за порогом вправо — как раньше. */
  const FALLBACK_BACK_PX = 72;

  interface BackSwipe {
    startX: number;
    startY: number;
    axis: 'h' | 'v' | null;
    lastX: number;
    lastT: number;
    vx: number; // px/ms, сглаженная скорость по последним движениям
  }
  let backSwipe: BackSwipe | null = null;
  /** .chat-scroll слайда, на который вешаем .swiping (заморозка скролла и
      active-эффектов карточек на время горизонтального жеста). */
  let backScrollEl: HTMLElement | null = null;

  /** Превью уровня выше для сцены (данные из кеша). */
  interface FolderStagePane {
    /** Уровень, в который выходим (null — корень топика). */
    folderId: number | null;
    pinned: Note[];
    rest: Note[];
    folders: Folder[];
  }

  interface FolderStage {
    /** Ширина панели (ширина контента слайда), px. */
    W: number;
    /** Текущий сдвиг сцены: 0 — текущий уровень в центре, W — родитель. */
    eff: number;
    /** Уровень выше (панель слева); null — выйти некуда (в папке не бывает). */
    left: FolderStagePane | null;
    settling: boolean;
  }
  let folderStage: FolderStage | null = $state(null);
  /** Куда доводим: 'left' — родитель (выход), null — вернуться в центр. */
  let settleTarget: 'left' | null = null;
  let settleRaf: number | undefined;

  /** Обёртка списка в слайде: в спокойном состоянии — сам список (меряем
      его высоту), при сцене — контейнер абсолютных панелей этой высоты. */
  let stageBox = $state<HTMLDivElement | undefined>();
  let stageH = $state(0);
  // Панели сцены: покадровый сдвиг пишем напрямую в DOM (см. applyFolderStage),
  // минуя реактивность Svelte — иначе чтение eff в шаблоне пере-рендерил бы
  // весь список карточек каждый кадр drag/доводки.
  let stageLeftPanel = $state<HTMLDivElement | undefined>();
  let stageCenterPanel = $state<HTMLDivElement | undefined>();

  /** Родитель активной папки (null = корень топика). Папки берём из полного
      списка топика; при расхождении (папка удалена) — выход в корень. */
  function folderParentID(): number | null {
    const id = navigation.activeFolderID;
    if (id === null) return null;
    const folder = foldersStore.all.find((f) => f.id === id);
    return folder?.parent_folder_id ?? null;
  }

  /** Сдвиг панелей сцены — запись transform напрямую в DOM, без чтения eff в
      шаблоне (иначе Svelte пере-рендерил бы список на каждый кадр). База:
      0 — центр, -W — родитель слева; обе панели едут на eff. Округляем до
      целых пикселей только здесь: эмодзи-глифы при субпиксельном transform
      «дрожат». Сам eff остаётся непрерывным — иначе пружина (шаг меньше
      0.5px) застревала бы в пикселе от цели и не достигала условия остановки. */
  function applyFolderStage(): void {
    const s = folderStage;
    if (s === null) return;
    const x = Math.round(s.eff);
    if (stageLeftPanel !== undefined) {
      stageLeftPanel.style.transform = `translate3d(${-s.W + x}px,0,0)`;
    }
    if (stageCenterPanel !== undefined) {
      stageCenterPanel.style.transform = `translate3d(${x}px,0,0)`;
    }
  }

  /** Свободный ход сцены — до W вправо (родитель по центру); дальше (или
      влево) — «резинка» с сопротивлением, как в Telegram. Влево выхода не
      даёт — свайп-влево в папке просто возвращает список в центр. */
  function clampFolderEff(raw: number): number {
    const s = folderStage;
    if (s === null) return raw;
    if (raw > s.W) return s.W + (raw - s.W) * 0.35;
    if (raw < 0) return raw * 0.35;
    return raw;
  }

  /** Собрать сцену выхода из папки в момент блокировки оси. Нужен кеш
      уровня выше (иначе drag-follow нечего показать слева — после отпускания
      сработает мгновенный выход за порогом) и ненулевой список (экран-
      заглушку не тащим — тоже мгновенный выход). */
  function mountFolderStage(): void {
    const topicId = navigation.activeTopicID;
    const activeFolder = navigation.activeFolderID;
    const box = stageBox;
    if (topicId === null || activeFolder === null || box === undefined) return;
    const upFolderId = folderParentID();
    const upNotes = peekCachedNotes(topicId, upFolderId);
    if (upNotes === undefined) return;
    const notes = notesStore.notes;
    const curFolders = settings.foldersMode === 'list' ? levelFolders() : [];
    if (notes.length === 0 && curFolders.length === 0) return;
    const W = box.clientWidth;
    if (W <= 0) return;
    // Высота сцены — как у текущего списка (панели абсолютные, в потоке
    // сцена сама высоты не имеет). Свежий замер, не только ResizeObserver.
    const H = box.offsetHeight;
    if (H <= 0) return;
    stageH = H;
    const upSplit = splitNotes(upNotes);
    const upFolders =
      settings.foldersMode === 'list'
        ? foldersStore.all.filter((f) => f.parent_folder_id === upFolderId)
        : [];
    folderStage = {
      W,
      eff: 0,
      left: {
        folderId: upFolderId,
        pinned: upSplit.pinned,
        rest: upSplit.rest,
        folders: upFolders,
      },
      settling: false,
    };
  }

  // Высота сцены при drag-follow — по САМОЙ высокой панели (текущий список
  // и превью родителя): если держать высоту текущего уровня, превью с
  // длинным списком обрежется. Панели абсолютные — замер после сборки сцены.
  $effect(() => {
    if (folderStage === null) return;
    const box = stageBox;
    if (box === undefined) return;
    let max = box.offsetHeight;
    for (const panel of box.querySelectorAll<HTMLElement>('.swipe-panel')) {
      const h = panel.offsetHeight;
      if (h > max) max = h;
    }
    if (max > 0 && max !== stageH) stageH = max;
    // Панели смонтированы — выставляем стартовый сдвиг (eff уже мог уйти от 0
    // к моменту блокировки оси, когда сцена собралась).
    applyFolderStage();
  });

  /** Выход из папки на уровень выше (folderId null — корень топика): смена
      уровня + немедленный показ списка родителя из кеша (свежесть догружается
      фоном), скролл вверх делает эффект смены контекста. */
  function exitFolderTo(folderId: number | null): void {
    setActiveFolder(folderId);
    const topicId = navigation.activeTopicID;
    if (topicId !== null) void loadNotes(topicId, folderId);
  }

  /** Закрыть сцену (откат в центр или после доводки). */
  function closeFolderStage(): void {
    if (settleRaf !== undefined) cancelAnimationFrame(settleRaf);
    settleRaf = undefined;
    settleTarget = null;
    folderStage = null;
  }

  /** Плавная доводка: едем к родителю (его панель в центр) или назад.
      CSS-transition тут не годится: он стартует с нулевой скоростью, а в
      момент отпускания контент едет со скоростью пальца — была бы «смена
      скорости» (рывок, при пружине назад — резкий разворот). Ведём доводку
      критически демпфированной пружиной на requestAnimationFrame: стартуем
      со скоростью пальца (vx, px/ms) — скорость непрерывна, без перелёта и
      колебаний, финиш — мягкое «прилипание». */
  function beginFolderSettle(target: 'left' | null, vx: number): void {
    const s = folderStage;
    if (s === null) return;
    s.settling = true;
    settleTarget = target;
    const to = target === 'left' ? s.W : 0;
    // prefers-reduced-motion: без анимации — сразу к цели и финализация.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      s.eff = to;
      finalizeFolderSettle();
      return;
    }
    // Критическое демпфирование (ω = 20 рад/с): самое быстрое возвращение к
    // цели без перелёта; время докидывания ~0.4 с, как прежний переход.
    const K = 400; // ω²
    const C = 40; // 2ω
    let v = vx * 1000; // px/ms → px/с
    let prev = performance.now();
    const step = (now: number): void => {
      const st = folderStage;
      if (st === null || settleTarget !== target || !st.settling) return;
      const dt = Math.min((now - prev) / 1000, 0.032);
      prev = now;
      const dx = to - st.eff;
      if (Math.abs(dx) < 0.5 && Math.abs(v) < 1) {
        st.eff = to;
        finalizeFolderSettle();
        return;
      }
      v += (K * dx - C * v) * dt;
      // eff непрерывный: округление до целых пикселей — только при записи в
      // DOM (applyFolderStage), иначе шаг меньше 0.5px не двигал бы eff и
      // пружина застревала бы в пикселе от цели без достижения остановки.
      st.eff = st.eff + v * dt;
      applyFolderStage();
      settleRaf = requestAnimationFrame(step);
    };
    settleRaf = requestAnimationFrame(step);
  }

  function finalizeFolderSettle(): void {
    if (settleRaf !== undefined) cancelAnimationFrame(settleRaf);
    settleRaf = undefined;
    const s = folderStage;
    if (s === null) return;
    const target = settleTarget;
    settleTarget = null;
    const pane = target === 'left' ? s.left : null;
    closeFolderStage();
    if (pane !== null) exitFolderTo(pane.folderId);
  }

  function backSwipeDown(e: PointerEvent): void {
    if (navigation.activeFolderID === null || e.button !== 0) return;
    // Жест начался во время доводки/сцены — завершаем её мгновенно, чтобы
    // жесты не «склеивались».
    if (folderStage !== null) {
      if (folderStage.settling) finalizeFolderSettle();
      else closeFolderStage();
    }
    const target = e.target;
    if (target instanceof Element) target.setPointerCapture(e.pointerId);
    backScrollEl =
      target instanceof Element ? target.closest<HTMLElement>('.chat-scroll') : null;
    const t = performance.now();
    backSwipe = {
      startX: e.clientX,
      startY: e.clientY,
      axis: null,
      lastX: e.clientX,
      lastT: t,
      vx: 0,
    };
  }

  function backSwipeMove(e: PointerEvent): void {
    const s = backSwipe;
    if (s === null) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (s.axis === null) {
      if (Math.abs(dx) > AXIS_LOCK_PX && Math.abs(dx) > Math.abs(dy) * 1.3) {
        s.axis = 'h';
        // Пока жест горизонтальный, карточки под пальцем не «нажимаются»
        // (CSS .swiping гасит active), вертикальный скролл списка заморожен.
        backScrollEl?.classList.add('swiping');
        if (folderStage === null) mountFolderStage();
      } else if (Math.abs(dy) > AXIS_LOCK_PX) {
        s.axis = 'v'; // скролл отдан браузеру
      }
    }
    if (s.axis !== 'h') return;
    // Скорость флинта по последним движениям.
    const now = performance.now();
    const dt = now - s.lastT;
    const inst = (e.clientX - s.lastX) / Math.max(dt, 1);
    s.vx = dt > 48 ? inst : s.vx * 0.6 + inst * 0.4;
    s.lastX = e.clientX;
    s.lastT = now;
    if (folderStage !== null && !folderStage.settling) {
      // eff непрерывный (округление — только при записи в DOM, applyFolderStage);
      // реактивный рендер на каждый кадр стоил бы кадры на мобильных.
      folderStage.eff = clampFolderEff(dx);
      applyFolderStage();
    }
  }

  function backSwipeUp(e: PointerEvent): void {
    const s = backSwipe;
    backSwipe = null;
    backScrollEl?.classList.remove('swiping');
    backScrollEl = null;
    if (s === null) return;
    if (s.axis !== 'h') return;

    // Сцена собрана — решаем, куда доводим. Жест реально тащил список:
    // клик отпускания подавляем (иначе после отката/доводки открылся бы
    // оверлей заметки под пальцем). Скорость отпускания (s.vx) уходит в
    // доводку — она стартует со скоростью пальца, без «смены скорости».
    if (folderStage !== null && !folderStage.settling) {
      suppressNextClick();
      const W = folderStage.W;
      const dx = e.clientX - s.startX;
      let target: 'left' | null = null;
      if (dx >= W * SETTLE_FRACTION && folderStage.left !== null) target = 'left';
      if (target === null && s.vx >= FLING_PX_MS && folderStage.left !== null) target = 'left';
      beginFolderSettle(target, s.vx);
      return;
    }
    if (folderStage !== null) return; // идёт доводка — отпускание второго пальца

    // Сцены нет (превью родителя не закешировано, экран-заглушка) — выход
    // мгновенный, за порогом вправо (не по диагонали вниз).
    const dx = e.clientX - s.startX;
    const dy = Math.abs(e.clientY - s.startY);
    if (dx < FALLBACK_BACK_PX || dx < dy) return;
    suppressNextClick();
    exitFolderTo(folderParentID());
  }

  function backSwipeReset(): void {
    backSwipe = null;
    backScrollEl?.classList.remove('swiping');
    backScrollEl = null;
    if (folderStage !== null) {
      if (folderStage.settling) finalizeFolderSettle();
      else closeFolderStage();
    }
  }

  // Смена топика/папки меняет список слайда — показываем его с начала.
  // (topPad-оверлей вверху перекрывает первые строки, скролл-контейнер
  // активного слайда сбрасываем после того, как контент уже обновился.)
  $effect(() => {
    const id = navigation.activeTopicID;
    void navigation.activeFolderID; // вход/выход из папки тоже сбрасывает скролл
    const el = swiperEl;
    if (id === null || el === undefined) return;
    requestAnimationFrame(() => {
      const slide = el.querySelector<HTMLElement>(`swiper-slide[data-topic-id="${id}"]`);
      const scroll = slide?.querySelector<HTMLElement>('.chat-scroll');
      if (scroll !== undefined && scroll !== null) scroll.scrollTop = 0;
    });
  });

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
  // справа — свайп на соседний слайд не ждёт сеть. В режиме «папки в списке»
  // превью слайда показывает и корневые папки соседа — их тоже кешируем
  // заранее (иначе слайд соседа показывал бы плейсхолдер до первого визита).
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
         (переключение топиков/папок, морфинг слайда live ⇄ превью) каскадный
         въезд «мигал» бы карточками. -->
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

  {#snippet topicPane(topic: Topic)}
    <!-- Слайд топика: «живой» список активного топика или статичное превью
         корня соседнего (из кеша). Вертикальный скролл — у самого слайда
         (.chat-scroll): свайпер выше не скроллится, а контент начинается под
         «островком» (topPad перенесён со всего main на каждый слайд). -->
    {@const live = topic.id === navigation.activeTopicID}
    {@const preview = previewData(topic.id)}
    <div
      class="chat-scroll scroll-area h-full touch-pan-y overflow-y-auto"
      style:padding-top={`${topPad}px`}
    >
      {#if live}
        {#if notesStore.loading}
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
               остальные заметки. Во время жеста «назад» (свайп-вправо в папке)
               список раскладывается в сцену: по центру текущий уровень, слева
               — превью уровня выше из кеша; пока палец ведёт, панели едут за
               ним, доводка после отпускания — JS-пружина с подхватом скорости
               пальца. Сдвиг пишется напрямую в DOM (applyFolderStage) — чтение
               eff в шаблоне пере-рендерило бы список карточек на каждый кадр. -->
          <div
            bind:this={stageBox}
            class:swipe-stage={folderStage !== null}
            style:height={folderStage !== null ? `${stageH}px` : undefined}
          >
            {#if folderStage !== null}
              {#if folderStage.left !== null}
                <div class="swipe-panel" bind:this={stageLeftPanel}>
                  {@render noteList(
                    folderStage.left.pinned,
                    folderStage.left.rest,
                    folderStage.left.folders,
                    noopOpenNote,
                    noopMenuNote,
                    noopOpenFolder,
                    noopMenuFolder,
                  )}
                </div>
              {/if}
              <div class="swipe-panel" bind:this={stageCenterPanel}>
                {@render noteList(
                  normalSplit.pinned,
                  normalSplit.rest,
                  inlineFolders,
                  (n) => (selectedId = n.id),
                  openMenu,
                  (f) => setActiveFolder(f.id),
                  openFolderMenu,
                )}
              </div>
            {:else}
              {@render noteList(
                normalSplit.pinned,
                normalSplit.rest,
                inlineFolders,
                (n) => (selectedId = n.id),
                openMenu,
                (f) => setActiveFolder(f.id),
                openFolderMenu,
              )}
            {/if}
          </div>
        {/if}
      {:else if preview === undefined || preview.state === 'pending'}
        <!-- Кеша соседа ещё нет — плейсхолдер (фоновая предзагрузка
             наполнит превью, как только придут данные). -->
        <EmptyState emoji="⏳" />
      {:else}
        <!-- Статичное превью корня соседнего топика: без интерактива. -->
        {@render noteList(
          preview.pinned,
          preview.rest,
          preview.folders,
          noopOpenNote,
          noopMenuNote,
          noopOpenFolder,
          noopMenuFolder,
        )}
      {/if}
    </div>
  {/snippet}

  {#if topicsStore.loading}
    <div class="flex flex-1 flex-col justify-center">
      <EmptyState emoji="⏳" />
    </div>
  {:else if topicsStore.error}
    <div class="flex flex-1 flex-col items-center justify-center gap-4 px-6">
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
    <div class="flex flex-1 flex-col items-center justify-center gap-4 px-6">
      <EmptyState emoji="＋" text="Создайте топик" />
      <button
        type="button"
        class="flex h-11 items-center gap-2 rounded-xl border border-border px-6 text-sm"
        onclick={() => (ui.topicCreateOpen = true)}
      >
        <span>＋</span> Создать
      </button>
    </div>
  {:else}
    <!-- Зона свайпера: слайд на каждый топик. Сам контейнер не скроллится
         (overflow скрыт) — вертикальный скролл живёт внутри слайдов.
         Свайп-«назад» из папки (вправо, drag-follow) ловим на зоне: в папке
         свайпер выключен, жест наш; в корне — свайпер рулит сам (обработчики
         выходят по navigation.activeFolderID === null). -->
    <div
      class="relative min-h-0 flex-1 overflow-hidden"
      role="region"
      aria-label="Список топиков"
      onpointerdown={backSwipeDown}
      onpointermove={backSwipeMove}
      onpointerup={backSwipeUp}
      onpointercancel={backSwipeReset}
    >
      <swiper-container
        bind:this={swiperEl}
        class="chat-swiper block h-full w-full"
        speed="360"
        initial-slide={initialTopicIndex}
      >
        {#each topicsStore.topics as topic (topic.id)}
          <swiper-slide class="block" data-topic-id={String(topic.id)}>
            {#if nearTopicIds.has(topic.id)}
              {@render topicPane(topic)}
            {:else}
              <!-- Дальний слайд — пустая оболочка (ленивость): контент
                   рендерится, когда слайд стал активным или соседним. -->
              <div class="h-full"></div>
            {/if}
          </swiper-slide>
        {/each}
      </swiper-container>
    </div>
  {/if}

  <!-- Островок топиков (+ по настройке — строка папки): фиксированы над
       списком (pointer-events только на самих панелях — между ними список
       можно листать). По умолчанию (pathMode 'tab') строка-крошка не
       рисуется: путь в папке показывает расширенный активный таб островка,
       тап по нему открывает шторку папок. В режиме 'strip' — прежняя строка. -->
  <div
    bind:this={topZone}
    class="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+8px)]"
  >
    <TopicIsland
      onSelect={onIslandSelect}
      pathInTab={settings.pathMode === 'tab'}
      onOpenFolders={() => (folderSheetOpen = true)}
    />
    {#if settings.pathMode === 'strip'}
      <FolderStrip onOpen={() => (folderSheetOpen = true)} />
    {/if}
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

{#if selectedCache !== null}
  <NotePage
    note={selectedCache}
    startEditing={editRequestId === selectedCache.id}
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
