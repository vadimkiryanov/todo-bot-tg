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
  // Папки — уровни внутри слайда топика, поэтому у живого топика свой
  // ВЛОЖЕННЫЙ свайпер уровней (слайд = уровень: корень + цепочка папок до
  // активной). Внутри папки внешний свайпер (топики) выключен целиком
  // (allowTouchMove = false) — работает внутренний: свайп ВПРАВО по списку
  // поднимает на уровень выше, доводка та же, что у топиков (installSlideSpring,
  // utils/slide-spring.ts) — самописного drag-follow больше нет. Глубокий
  // (последний) слайд уровней — «живой» список активного уровня, слайды
  // выше — статичные превью из кеша. Вход в папку (тап по строке/крошке) —
  // анимированный переезд вглубь, как смена топиков.
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

  import { register, type SwiperContainer } from 'swiper/element';
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
  import { folderChain, foldersStore, levelFolders, loadFolders, peekCachedFolders, foldersCacheTick } from '$lib/stores/folders.svelte';
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
  import { onMount } from 'svelte';

 
  $effect(() => {
    if (selectedId === null) {
      selectedCache = null;
      return;
    }
    const found = notesStore.notes.find((n) => n.id === selectedId);
    if (found) selectedCache = found;
  });
 onMount(()=>{
      register();
  })

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
    openNote(note.id, true);
  }

  // ── URL-синхронизация (?topic=&folder=&note=) ───────────────────────────
  // Навигация зеркалится в адресную строку: смена топика/папки — replaceState
  // (записей истории не плодим), открытие заметки — pushState (кнопка «назад»
  // браузера закрывает страницу через popstate). Открытие по ссылке с query
  // восстанавливает топик/папку/заметку после загрузки данных (приоритет над
  // localStorage). SvelteKit-роутер записи без своего state (наши push/replace)
  // не навигирует — лишь обновляет page.url, поэтому popstate обрабатываем сами.
  interface UrlIntent {
    topic: number | null;
    folder: number | null;
    note: number | null;
    /** Шаг отработан: применён или отклонён (невалиден/нет данных). */
    topicDone: boolean;
    folderDone: boolean;
    noteDone: boolean;
  }

  /** Query из адреса, ждущий применения к сторам (старт/попstate). */
  let urlIntent: UrlIntent | null = $state(null);
  /** Стартовый URL обработан — синхронизация адреса включена. */
  let urlStarted = $state(false);
  /** Заметка открыта пользователем (pushState) — UI-закрытие делает history.back(). */
  let noteOpenedViaPush = false;

  function numParam(params: URLSearchParams, key: string): number | null {
    const raw = params.get(key);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  function readUrlIntent(): UrlIntent {
    const params = new URLSearchParams(window.location.search);
    return {
      topic: numParam(params, 'topic'),
      folder: numParam(params, 'folder'),
      note: numParam(params, 'note'),
      topicDone: false,
      folderDone: false,
      noteDone: false,
    };
  }

  /** Query для текущего состояния навигации ('' — без параметров). */
  function queryForState(): string {
    const params = new URLSearchParams();
    if (navigation.activeTopicID !== null) params.set('topic', String(navigation.activeTopicID));
    if (navigation.activeFolderID !== null) params.set('folder', String(navigation.activeFolderID));
    if (selectedId !== null) params.set('note', String(selectedId));
    const q = params.toString();
    return q === '' ? '' : `?${q}`;
  }

  /** Записать состояние навигации в адрес (replace — без новой записи истории). */
  function syncLocation(): void {
    const target = window.location.pathname + queryForState();
    if (target === window.location.pathname + window.location.search) return;
    window.history.replaceState(null, '', target);
  }

  /** Открыть заметку (страница). pushState: «назад» браузера вернёт к списку. */
  function openNote(id: number, startEdit = false): void {
    noteOpenedViaPush = true;
    editRequestId = startEdit ? id : null;
    selectedId = id;
    window.history.pushState(null, '', window.location.pathname + queryForState());
  }

  /** Закрыть страницу заметки (UI: крестик/Escape/действие со страницы). */
  function closeNotePage(): void {
    const viaPush = noteOpenedViaPush;
    noteOpenedViaPush = false;
    editRequestId = null;
    selectedId = null;
    if (viaPush) {
      // Открытие создало запись истории — возвращаемся к ней: popstate сам
      // приведёт сторы (заметка уже закрыта, адреса записей совпадают).
      window.history.back();
    }
    // Иначе заметка пришла из URL (ссылка/«вперёд») — эффект синхронизации
    // заменит адрес на состояние без note.
  }

  /** Папка есть в дереве загруженных папок (цепочка до корня не рвётся). */
  function folderExistsInTree(folderId: number): boolean {
    let current = foldersStore.all.find((f) => f.id === folderId);
    const seen = new Set<number>();
    while (current !== undefined && !seen.has(current.id)) {
      seen.add(current.id);
      const parentId = current.parent_folder_id;
      if (parentId === null) return true;
      current = foldersStore.all.find((f) => f.id === parentId);
    }
    return false;
  }

  /** Применить urlIntent к сторам: шаги, которые можно проверить, — сразу;
      остальные ждут данные (эффекты-будильники зовут повторно по готовности). */
  function applyUrlIntent(): void {
    const intent = urlIntent;
    if (intent === null) return;
    let levelChanged = false;

    // Топик — по списку (ждём, пока топики загружены).
    if (!intent.topicDone) {
      if (topicsStore.loading) return;
      intent.topicDone = true;
      const t = intent.topic;
      if (t !== null) {
        if (topicsStore.topics.some((x) => x.id === t)) {
          if (navigation.activeTopicID !== t) {
            setActiveTopic(t);
            levelChanged = true;
          }
        } else {
          // Битый топик: папка и заметка той же ссылки тоже недействительны.
          intent.folderDone = true;
          intent.noteDone = true;
          if (navigation.activeFolderID !== null) setActiveFolder(null);
          if (selectedId !== null) {
            noteOpenedViaPush = false;
            selectedId = null;
            editRequestId = null;
          }
        }
      }
    }

    // Папка — по дереву папок активного топика (ждём загрузку; ошибка сети —
    // папка не подтверждается и сбрасывается в корень).
    if (!intent.folderDone) {
      const want = intent.folder;
      if (want === null) {
        if (navigation.activeFolderID !== null) {
          setActiveFolder(null);
          levelChanged = true;
        }
        intent.folderDone = true;
      } else {
        const ready = foldersStore.topicId === navigation.activeTopicID && !foldersStore.loading;
        const failed = !ready && foldersStore.error !== null && !foldersStore.loading;
        if (!ready && !failed) return;
        const valid = ready && folderExistsInTree(want);
        if (valid) {
          if (navigation.activeFolderID !== want) {
            setActiveFolder(want);
            levelChanged = true;
          }
        } else if (navigation.activeFolderID !== null) {
          setActiveFolder(null);
          levelChanged = true;
        }
        intent.folderDone = true;
      }
    }

    // Заметка: закрытие безопасно сразу; открытие — только по загруженному
    // списку текущего уровня, когда уровень в этом проходе не менялся (после
    // смены уровня список ещё от старого — ждём перезапуск от загрузки).
    if (!intent.noteDone) {
      const n = intent.note;
      if (n === null) {
        if (selectedId !== null) {
          noteOpenedViaPush = false;
          selectedId = null;
          editRequestId = null;
        }
        intent.noteDone = true;
      } else if (!levelChanged) {
        if (!intent.folderDone || notesStore.loading) return;
        if (notesStore.notes.some((x) => x.id === n)) {
          noteOpenedViaPush = false;
          editRequestId = null;
          selectedId = n;
        } else if (selectedId !== null) {
          // Заметки нет в списке уровня (удалена/не на этом уровне) — закрыть.
          noteOpenedViaPush = false;
          selectedId = null;
          editRequestId = null;
        }
        intent.noteDone = true;
      }
    }

    // Всё применено/отклонено — дальше адрес ведёт эффект синхронизации.
    if (intent.topicDone && intent.folderDone && intent.noteDone) {
      urlIntent = null;
    }
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

  /** Слайд в фокусе свайпера (видимый сейчас / цель доводки / программного
      переезда). Может опережать стор-активный: при быстрых свайпах целевой
      слайд едет и виден ДО slideChange, который в пружинной механике
      наступает только в конце доводки. Окрестность фокуса рендерится
      (nearTopicIds) и предзагружается — слайд подъезжает наполненным, а не
      пустой оболочкой до полной остановки анимации. */
  let focusTopicIndex = $state(-1);

  /** Сменить фокус свайпера: окрестность нового слайда рендерится
      (nearTopicIds) и предзагружается preloadTopicAround (свежий кеш и
      идущие запросы делают повторные вызовы дешёвыми). */
  function setFocusTopicIndex(index: number): void {
    if (index === focusTopicIndex) return;
    focusTopicIndex = index;
    const topic = topicsStore.topics[index];
    if (topic !== undefined) preloadTopicAround(topic.id);
  }

  /** Слайды для рендера: окрестность (сам + соседи ±1) стор-активного И
      фокуса свайпера. При быстрых свайпах фокус опережает стор (доводка/
      драг ещё идут, а целевой слайд уже виден) — его превью рендерится
      сразу, слайд не выезжает пустым до полной остановки. Дальние слайды —
      пустые оболочки (ленивость): при многих топиках в DOM не висят сотни
      карточек. */
  const nearTopicIds = $derived.by(() => {
    const set = new Set<number>();
    const list = topicsStore.topics;
    const n = list.length;
    if (n === 0) return set;
    const centers = new Set<number>();
    const id = navigation.activeTopicID;
    if (id !== null) {
      const index = list.findIndex((t) => t.id === id);
      if (index >= 0) centers.add(index);
    }
    if (focusTopicIndex >= 0 && focusTopicIndex < n) centers.add(focusTopicIndex);
    for (const c of centers) {
      for (let i = Math.max(0, c - 1); i <= Math.min(n - 1, c + 1); i++) {
        set.add(list[i].id);
      }
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
    // Фокус на цель сразу: её окрестность рендерится, пока слайд едет.
    setFocusTopicIndex(want);
    sw.slideTo(want, animate ? slideSpeed() : 0);
  }

  /** Слайднуть к топику (тап по табу островка). */
  function slideToTopic(id: number): void {
    const sw = currentSwiper();
    const want = topicIndexById(id);
    if (sw !== undefined && want >= 0) {
      // Фокус на цель сразу: превью цели (и предзагрузка её данных)
      // стартуют, пока слайд ещё едет анимацией.
      setFocusTopicIndex(want);
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
  // Доводка после отпускания пальца — общий installSlideSpring (см.
  // utils/slide-spring.ts): заводская CSS-transition стартует с нулевой/
  // произвольной скорости — «смена скорости» в момент отпускания.
  $effect(() => {
    const el = swiperEl;
    const sw = el?.swiper;
    if (el === undefined || sw === undefined) return;

    // Без «пружины» resistance на крайних слайдах (первый/последний топик):
    // при возврате драга за точку старта слайд иначе едет за пальцем не 1:1 —
    // видимый «стык», слайд будто встаёт на место. Жёсткое следование,
    // при отпускании слайд вернёт штатная доводка.
    sw.params.resistance = false;

    const onSlideChange = (): void => {
      const id = slideTopicId(sw, sw.activeIndex);
      if (!Number.isNaN(id) && id !== navigation.activeTopicID) {
        setActiveTopic(id);
      }
      // Слайд встал — фокус совпадает со стор-активным (страховка для
      // случаев, когда фокус уехал вперёд намерения/драга).
      setFocusTopicIndex(sw.activeIndex);
    };
    const refreshVisibilityPreload = (): void => {
      visibilityObserver?.disconnect();
      visibilityObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const raw = (entry.target as HTMLElement).dataset.topicId;
            if (raw === undefined) continue;
            const id = Number(raw);
            if (!Number.isNaN(id)) preloadTopicAround(id);
          }
        },
        { root: el, threshold: 0 },
      );
      for (const slide of sw.slides) visibilityObserver.observe(slide);
    };
    const onSlidesChanged = (): void => {
      // Слайды пересобраны (создание/удаление топиков) — наблюдатели заново.
      refreshVisibilityPreload();
      alignToActive(false);
    };

    // Драг пальцем: фокус следует за фактически видимым слайдом — как только
    // соседний выехал больше чем на половину, его окрестность рендерится и
    // предзагружается ещё до отпускания. Отпускание скорректирует фокус по
    // реальной цели доводки (onIntent ниже), недотянутый драг — вернёт.
    const onDragFocus = (): void => {
      const max = sw.slides.length - 1;
      const index = Math.round(-sw.translate / sw.width);
      setFocusTopicIndex(Math.max(0, Math.min(max, index)));
    };


    // Предзагрузка по видимости: как только соседний топик начал заезжать
    // в область свайпера (хотя бы пикселем) — сразу тянем его корень и
    // соседей. Это самый ранний старт (раньше перехода фокуса на половине
    // слайда и отпускания). Повторные срабатывания (слайд виден долго)
    // дешёвые — свежий кеш и идущие запросы пропускаются.
    // ВАЖНО: внутри эффекта нельзя синхронно писать focusTopicIndex (и читать
    // его через setFocusTopicIndex) — эффект стал бы зависеть от фокуса и
    // пересоздавался бы на каждой его смене, а cleanup убивал бы пружину
    // доводки (releaseSpring → cancelSpring) в момент отпускания: слайд
    // замирал бы на полпути. Начальный фокус не нужен: окрестность
    // стартового слайда рендерится через центр activeTopicID, дальше фокус
    // выставляют драг (onDragFocus), отпускание (onIntent) и slideChange.
    let visibilityObserver: IntersectionObserver | undefined;
    refreshVisibilityPreload();

    sw.on('slideChange', onSlideChange);
    sw.on('slidesLengthChange', onSlidesChanged);
    sw.on('sliderMove', onDragFocus);
    return () => {
      visibilityObserver?.disconnect();
      visibilityObserver = undefined;
      sw.off('slideChange', onSlideChange);
      sw.off('slidesLengthChange', onSlidesChanged);
      sw.off('sliderMove', onDragFocus);
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

  // Свайперы делят жесты — «ровно один включён»: в корне топиков (папка не
  // выбрана) листаются топики внешним свайпером, внутренний выключен; внутри
  // папки — наоборот: топики не листаются (внешний выключен), уровни ведёт
  // внутренний. Ставим и params, и свойство инстанса (обработчики касаний
  // смотрят именно в swiper.allowTouchMove). Выключенный свайпер не мешает
  // включённому: при allowTouchMove=false onTouchMove выходит до
  // preventDefault/stopPropagation — жест достаётся родительскому элементу.
  $effect(() => {
    const inFolder = navigation.activeFolderID !== null;
    const outer = swiperEl?.swiper;
    if (outer !== undefined) {
      outer.allowTouchMove = !inFolder;
      outer.params.allowTouchMove = !inFolder;
    }
    const inner = levelSwiperEl?.swiper;
    if (inner !== undefined) {
      inner.allowTouchMove = inFolder;
      inner.params.allowTouchMove = inFolder;
    }
  });

  // ── Уровни папок — вложенный Swiper (слайд = уровень) ──────────────────
  // Папка — уровень ВНУТРИ слайда топика, поэтому у живого топика свой
  // вложенный свайпер: слайд на каждый уровень [корень(null), ...цепочка
  // папок до активной]. Глубокий (последний) слайд — «живой» список
  // активного уровня из стора; слайды выше — статичные превью уровней из
  // кеша (noop-хэндлеры, как у соседних топиков).
  // Вход в папку (тап по строке/крошке) — цепочка растёт: эффект глубины
  // анимированно ведёт свайпер вглубь (контент уезжает влево, как у топиков).
  // Выход свайпом-вправо — доводка-пружина installSlideSpring до слайда
  // родителя, slideChange меняет уровень стора — цепочка укорачивается,
  // слайд родителя становится глубоким («живым»). Скролл уровня живёт в его
  // слайде и сохраняется (keyed each по id уровня не пересоздаёт DOM
  // родительских слайдов при входе/выходе). При смене топика вложенный
  // свайпер размонтируется вместе со слайдом — скролл нового топика
  // естественно с нуля.
  let levelSwiperEl: SwiperContainer | undefined = $state();

  function levelSwiper(): Swiper | undefined {
    const el = levelSwiperEl;
    if (el === undefined) return undefined;
    const sw = el.swiper;
    if (sw === undefined || sw.destroyed) return undefined;
    return sw;
  }

  /** Слайды уровней: корень (null) + цепочка папок от корня до активной.
      Пустая цепочка (в корне) — один слайд корня. */
  const folderLevels = $derived([null, ...folderChain()]);

  /** id уровня слайда (null — корень топика). */
  function levelIdOf(level: Folder | null): number | null {
    return level === null ? null : level.id;
  }

  /** Ключ слайда уровня: keyed each сохраняет DOM и скролл уровней при
      изменении цепочки (вход добавляет слайд, выход снимает глубокий). */
  function levelKey(level: Folder | null): string {
    return level === null ? 'root' : `folder:${level.id}`;
  }

  /** Превью уровней выше глубокого: снимок заметок уровня из кеша + его
      папки (режим «в списке»). Как превью соседних топиков — пересобирается
      по реактивным счётчикам кеша. */
  interface LevelPreview {
    state: 'pending' | 'ready';
    pinned: Note[];
    rest: Note[];
    folders: Folder[];
  }
  const levelPreviews = $derived.by(() => {
    // Реактивность: счётчики кешей + режим папок + цепочка уровней.
    notesCacheTick.n;
    foldersCacheTick.n;
    settings.foldersMode;
    folderLevels.length;
    const topicId = navigation.activeTopicID;
    const map = new Map<number | null, LevelPreview>();
    if (topicId === null) return map;
    for (const level of folderLevels) {
      const folderId = levelIdOf(level);
      const notes = peekCachedNotes(topicId, folderId);
      if (notes === undefined) {
        map.set(folderId, { state: 'pending', pinned: [], rest: [], folders: [] });
        continue;
      }
      let folders: Folder[] = [];
      if (settings.foldersMode === 'list') {
        folders = foldersStore.all.filter((f) => f.parent_folder_id === folderId);
      }
      const { pinned, rest } = splitNotes(notes);
      map.set(folderId, { state: 'ready', pinned, rest, folders });
    }
    return map;
  });

  function levelPreviewData(folderId: number | null): LevelPreview | undefined {
    return levelPreviews.get(folderId);
  }

  /** Привести активный слайд уровней к глубокому (folderLevels.length - 1).
      Слайды свайпера могут отставать от Svelte-флаша (observer асинхронный) —
      sw.update() собирает их синхронно; не вышло — пропуск (глубина меняется
      только через folderLevels, следующий прогон эффекта доведёт). Уже на
      глубоком слайде — не трогаем (guard от петель). */
  function alignLevels(animate: boolean): void {
    const sw = levelSwiper();
    const want = folderLevels.length - 1;
    if (sw === undefined || want < 0) return;
    if (sw.slides.length <= want) sw.update();
    if (sw.slides.length <= want) return;
    if (sw.activeIndex === want) return;
    sw.slideTo(want, animate ? slideSpeed() : 0);
  }

  // Глубина уровней (вход/выход из папки) ведёт внутренний свайпер: цепочка
  // выросла (вошли глубже) — анимированный переезд к новому глубокому слайду;
  // укоротилась (выход) — мгновенно: свайп-выход уже доехал пружиной до
  // слайда родителя, UI-выход по крошке/шторке — резкий, как и раньше.
  let prevLevelsDepth = 0;
  $effect(() => {
    const depth = folderLevels.length;
    const growing = prevLevelsDepth > 0 && depth > prevLevelsDepth;
    prevLevelsDepth = depth;
    alignLevels(growing);
  });

  // События внутреннего свайпера: свайп-выход доехал (пружина закончилась,
  // slideChange) — слайд показывает уровень выше: меняем уровень стора,
  // цепочка укорачивается, слайд становится глубоким. Программные slideTo
  // (вход/выход через alignLevels) заканчиваются slideChange на глубоком
  // слайде — уровень совпадает со стором, ничего не меняем. Доводка и
  // подавление «клика отпускания» — тот же installSlideSpring, что у
  // внешнего свайпера (см. utils/slide-spring.ts).
  $effect(() => {
    const el = levelSwiperEl;
    const sw = el?.swiper;
    if (el === undefined || sw === undefined) return;

    // То же, что у внешнего свайпера: без «пружины» resistance на крайних
    // слайдах уровней (корень/глубина) при возврате драга за точку старта.
    sw.params.resistance = false;

    const onSlideChange = (): void => {
      const level = folderLevels[sw.activeIndex];
      if (level === undefined) return;
      const folderId = levelIdOf(level);
      if (folderId !== navigation.activeFolderID) setActiveFolder(folderId);
    };

    sw.on('slideChange', onSlideChange);
    return () => {
      sw.off('slideChange', onSlideChange);
    };
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

  // Стартовый URL (глубокая ссылка/восстановление вкладки): после загрузки
  // топиков и авто-выбора активного (restoreActiveTopic) применяем параметры
  // query — они приоритетнее localStorage. Без параметров — просто включаем
  // синхронизацию адреса (URL получит ?topic= при первом же изменении).
  $effect(() => {
    if (session.state !== 'authed') return;
    if (topicsStore.loading || topicsStore.topics.length === 0) return;
    if (navigation.activeTopicID === null) return;
    if (urlStarted) return;
    urlStarted = true;
    const intent = readUrlIntent();
    if (intent.topic === null && intent.folder === null && intent.note === null) return;
    urlIntent = intent;
    applyUrlIntent();
  });

  // Будильники: urlIntent применяется по шагам, когда данные для проверки
  // очередного шага готовы (топики → папки → заметки) — каждый эффект будит
  // applyUrlIntent при изменении своего стора.
  $effect(() => {
    void topicsStore.loading;
    void topicsStore.topics;
    applyUrlIntent();
  });

  $effect(() => {
    void foldersStore.topicId;
    void foldersStore.loading;
    void foldersStore.all;
    void foldersStore.error;
    applyUrlIntent();
  });

  $effect(() => {
    void notesStore.loading;
    void notesStore.notes;
    void notesStore.error;
    applyUrlIntent();
  });

  // Зеркало навигации в адресной строке: ?topic=&folder=&note=. replaceState
  // не плодит историю; открытие/закрытие заметки управляет стеком отдельно
  // (pushState в openNote / history.back() в closeNotePage). Молчит, пока не
  // обработан стартовый URL и пока живой intent ведёт адрес сам.
  $effect(() => {
    void navigation.activeTopicID;
    void navigation.activeFolderID;
    void selectedId;
    if (!urlStarted || urlIntent !== null) return;
    syncLocation();
  });

  // «Назад/вперёд»: popstate на наши записи (state=null) SvelteKit пропускает
  // (лишь обновляет page.url) — доводим сторы сами: заметка в query — открыть,
  // без неё — закрыть; топик/папку — по равенству (как slideChange).
  $effect(() => {
    const onPopState = (): void => {
      urlIntent = readUrlIntent();
      applyUrlIntent();
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  });

  // Предзагрузка: подгружаем корень топика и корни его соседей слева и
  // справа — свайп на соседний слайд не ждёт сеть. В режиме «папки в списке»
  // превью слайда показывает и корневые папки соседа — их тоже кешируем
  // заранее (иначе слайд соседа показывал бы плейсхолдер до первого визита).
  // Вызывается в момент намерения (отпускание пальца: runSpring уже знает
  // цель — таб подсвечен, слайд ещё едет доводкой) и после фактической смены
  // активного топика ($effect ниже). Повторные вызовы безопасны: свежий кеш
  // пропускается (isNotesCached), идущий запрос не дублируется (inFlight).
  function preloadTopicAround(topicId: number): void {
    const list = topicsStore.topics;
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
  }

  $effect(() => {
    const topicId = navigation.activeTopicID;
    if (topicId === null || topicsStore.loading) return;
    preloadTopicAround(topicId);
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
    {#if topic.id === navigation.activeTopicID}
      <!-- Живой топик: вложенный свайпер уровней. Слайд на каждый уровень
           [корень, ...цепочка папок до активной] — глубокий (последний)
           показывает «живой» список активного уровня из стора, слайды выше —
           статичные превью уровней из кеша (noop-хэндлеры, как у соседних
           топиков). Вертикальный скролл — у каждого слайда свой (.chat-scroll):
           вход/выход из папки не сбрасывает скролл уровней, контент каждого
           уровня начинается под «островком» (topPad). Свайп-вправо — «назад»
           на уровень выше (доводка-пружина, как у топиков); тап по папке/
           крошке — вход: эффект глубины ведёт свайпер к глубокому слайду. -->
      <swiper-container
        bind:this={levelSwiperEl}
        class="block h-full w-full"
      >
        {#each folderLevels as level, i (levelKey(level))}
          {@const folderId = levelIdOf(level)}
          {@const isDeep = i === folderLevels.length - 1}
          <swiper-slide class="block">
            {#if isDeep}
              <div
                class="chat-scroll scroll-area h-full touch-pan-y overflow-y-auto"
                style:padding-top={`${topPad}px`}
              >
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
                  {@render noteList(
                    normalSplit.pinned,
                    normalSplit.rest,
                    inlineFolders,
                    (n) => openNote(n.id),
                    openMenu,
                    (f) => setActiveFolder(f.id),
                    openFolderMenu,
                  )}
                {/if}
              </div>
            {:else}
              {@const p = levelPreviewData(folderId)}
              <div
                class="chat-scroll scroll-area h-full touch-pan-y overflow-y-auto"
                style:padding-top={`${topPad}px`}
              >
                {#if p === undefined || p.state === 'pending'}
                  <!-- Кеша уровня ещё нет — плейсхолдер (фоновая предзагрузка
                       наполнит превью, как только придут данные). -->
                  <EmptyState emoji="⏳" />
                {:else}
                  <!-- Статичное превью уровня выше: без интерактива. -->
                  {@render noteList(
                    p.pinned,
                    p.rest,
                    p.folders,
                    noopOpenNote,
                    noopMenuNote,
                    noopOpenFolder,
                    noopMenuFolder,
                  )}
                {/if}
              </div>
            {/if}
          </swiper-slide>
        {/each}
      </swiper-container>
    {:else}
      <!-- Слайд соседнего топика: статичное превью корня (из кеша) в своём
           .chat-scroll. Вертикальный скролл — у самого слайда: свайпер выше
           не скроллится, контент начинается под «островком» (topPad). -->
      {@const preview = previewData(topic.id)}
      <div
        class="chat-scroll scroll-area h-full touch-pan-y overflow-y-auto"
        style:padding-top={`${topPad}px`}
      >
        {#if preview === undefined || preview.state === 'pending'}
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
    {/if}
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
         (overflow скрыт) — вертикальный скролл живёт внутри слайдов
         (.chat-scroll): у соседних топиков прямо в слайде, у живого — в
         слайдах вложенного свайпера уровней. Жесты делят два свайпера:
         в корне топиков (папка не выбрана) ведёт внешний, внутри папки —
         вложенный (уровни); выключенный не мешает включённому. -->
    <div
      class="relative min-h-0 flex-1 overflow-hidden"
      role="region"
      aria-label="Список топиков"
    >
      <swiper-container
        bind:this={swiperEl}
        class="chat-swiper block h-full w-full"
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
    onClose={closeNotePage}
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
