// Экран чата: «островок» топиков (сверху, стеклянный, фиксирован — список
// скроллится под ним), список заметок, поле ввода снизу.
// Переключение топиков — горизонтальная лента SwipeStrip на siema (слайд
// = топик): активный контент едет за пальцем (нативные жесты библиотеки,
// никакой самописной «сцены»). Вертикальный скролл — послайдовый:
// у каждого слайда свой scroll-контейнер (.chat-scroll); сама лента не
// скроллится (overflow скрыт). Активный слайд — «живой» список из стора;
// соседние слайды — статичные превью корней из кеша
// (peekCachedNotes/peekCachedFolders), без кеша — плейсхолдер ⏳, а хэндлеры
// заглушены (no-op), чтобы долгий тап не открывал меню чужого топика.
// Папки — уровни внутри слайда топика, поэтому у живого топика свой
// ВЛОЖЕННЫЙ свайпер уровней (слайд = уровень: корень + цепочка папок до
// активной). Внутри папки внешняя лента (топики) выключена целиком
// (draggable = false) — работает внутренняя: свайп ВПРАВО по списку
// поднимает на уровень выше (смена уровня — после фактической остановки
// слайда, onsettle) — самописного drag-follow нет. Глубокий (последний)
// слайд уровней — «живой» список активного уровня, слайды выше — статичные
// превью из кеша. Вход в папку (тап по строке/крошке) — анимированный
// переезд вглубь, как смена топиков.
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
//
// Порт ChatView.svelte (1177 строк) в React 19: локальные <style>/
// react-адаптации Svelte-механик описаны по месту.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as React from 'react';

import { CreateFolderModal } from '../components/CreateFolderModal';
import { CreateTopicModal } from '../components/CreateTopicModal';
import { EmptyState } from '../components/EmptyState';
import { FolderBar } from '../components/FolderBar';
import { FolderMenu } from '../components/FolderMenu';
import { FolderRow } from '../components/FolderRow';
import { FolderStrip } from '../components/FolderStrip';
import { InputBar } from '../components/InputBar';
import { Loader } from '../components/Loader';
import { Modal } from '../components/Modal';
import { MoveModal } from '../components/MoveModal';
import { NoteCard } from '../components/NoteCard';
import { NoteMenu } from '../components/NoteMenu';
import { NotePage } from '../components/NotePage';
import { QuickMenu } from '../components/QuickMenu';
import { SearchPanel } from '../components/SearchPanel';
import { SwipeStrip } from '../components/SwipeStrip';
import type { SwipeStripHandle } from '../components/SwipeStrip';
import { TopicIsland } from '../components/TopicIsland';
import { TopicMenu } from '../components/TopicMenu';
import { TopicTabs } from '../components/TopicTabs';
import { navigate } from '../router';
import {
  folderChain,
  levelFolders,
  loadFolders,
  peekCachedFolders,
  useFoldersStore,
} from '../stores/folders';
import { setActiveFolder, setActiveTopic, useNavigationStore } from '../stores/navigation';
import {
  clearNoteHighlight,
  loadNotes,
  peekCachedNotes,
  preloadTopicNeighbors,
  useNotesStore,
} from '../stores/notes';
import { useSessionStore } from '../stores/session';
import { useSettingsStore } from '../stores/settings';
import { loadTopics, useTopicsStore } from '../stores/topics';
import { useUiStore } from '../stores/ui';
import type { Folder, Note, Topic } from '../types/api';
import { suppressNextClick } from '../utils/click';

export function ChatView() {
  // ── Подписки на сторы (рендер-слайсы; в хэндлерах/эффектах — getState()) ──
  const notes = useNotesStore((s) => s.notes);
  const notesLoading = useNotesStore((s) => s.loading);
  const notesError = useNotesStore((s) => s.error);
  const highlightedId = useNotesStore((s) => s.highlightedId);
  const notesCacheTick = useNotesStore((s) => s.cacheTick);

  const folders = useFoldersStore((s) => s.all);
  const foldersTopicId = useFoldersStore((s) => s.topicId);
  const foldersLoading = useFoldersStore((s) => s.loading);
  const foldersError = useFoldersStore((s) => s.error);
  const foldersCacheTick = useFoldersStore((s) => s.cacheTick);

  const topics = useTopicsStore((s) => s.topics);
  const topicsLoading = useTopicsStore((s) => s.loading);
  const topicsError = useTopicsStore((s) => s.error);

  const activeTopicID = useNavigationStore((s) => s.activeTopicID);
  const activeFolderID = useNavigationStore((s) => s.activeFolderID);

  const sessionState = useSessionStore((s) => s.session.state);
  const foldersMode = useSettingsStore((s) => s.foldersMode);
  const pathMode = useSettingsStore((s) => s.pathMode);

  // Актуальная заметка для «страницы» (NotePage). Кэш последнего объекта:
  // заметка может исчезнуть из списка (done/архив) раньше, чем доиграет
  // анимация закрытия страницы — держим объект до явного onClose.
  const [selectedId, setSelectedIdState] = useState<number | null>(null);
  const [selectedCache, setSelectedCache] = useState<Note | null>(null);

  // ВАЖНО: $state в Svelte присваивается синхронно, setState в React — нет.
  // openNote/queryForState/applyUrlIntent читают свежее значение сразу после
  // записи — держим ref-зеркало, все записи идут через setSelected().
  const selectedIdRef = useRef<number | null>(null);
  function setSelected(id: number | null): void {
    selectedIdRef.current = id;
    setSelectedIdState(id);
  }

  // Дропдаун-меню (долгий тач по карточке): заметка + позиция карточки в момент
  // открытия. Храним сам объект заметки, а не id: карточка может не лежать в
  // списках активного контекста (слайд-интент свайп-выхода, результаты поиска),
  // и меню должно действовать по переданной заметке, не дожидаясь её в сторе.
  const [menuNote, setMenuNote] = useState<Note | null>(null);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);

  function openMenu(note: Note, rect: DOMRect): void {
    setMenuNote(note);
    setMenuRect(rect);
  }

  function closeMenu(): void {
    setMenuNote(null);
    setMenuRect(null);
  }

  // Перемещение заметки из контекстного меню карточки (пункт «📂
  // Переместить»): модалка с выбором топика и деревом его папок открывается
  // поверх списка. Папки грузит сама модалка — пункт виден всегда.
  const [moveTarget, setMoveTarget] = useState<Note | null>(null);

  function requestMove(note: Note): void {
    setMoveTarget(note);
  }

  function closeMove(): void {
    setMoveTarget(null);
  }

  // Контекстное меню строки папки в списке (режим «в списке»): папка +
  // позиция строки в момент открытия (долгий тач/правый клик — FolderRow).
  const [folderMenu, setFolderMenu] = useState<{ folder: Folder; rect: DOMRect } | null>(null);

  function openFolderMenu(folder: Folder, rect: DOMRect): void {
    setFolderMenu({ folder, rect });
  }

  function closeFolderMenu(): void {
    setFolderMenu(null);
  }

  // Полноэкранный поиск по заметкам (кнопка 🔍 над островком топиков).
  const [searchOpen, setSearchOpen] = useState(false);

  // ── URL-синхронизация (?topic=&folder=&note=) ───────────────────────────
  // Навигация зеркалится в адресную строку: смена топика/папки — replaceState
  // (записей истории не плодим), открытие заметки — pushState (кнопка «назад»
  // браузера закрывает страницу через popstate). Открытие по ссылке с query
  // восстанавливает топик/папку/заметку после загрузки данных (приоритет над
  // localStorage). URL-роутер записи без своего state (наши push/replace) не
  // навигирует — лишь обновляет адрес, поэтому popstate обрабатываем сами.
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
  const [urlIntent, setUrlIntent] = useState<UrlIntent | null>(null);
  const urlIntentRef = useRef<UrlIntent | null>(null);
  urlIntentRef.current = urlIntent;

  /** Стартовый URL обработан — синхронизация адреса включена. */
  const [urlStarted, setUrlStarted] = useState(false);
  /** Заметка открыта пользователем (pushState) — UI-закрытие делает history.back(). */
  const noteOpenedViaPushRef = useRef(false);

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
    const nav = useNavigationStore.getState();
    if (nav.activeTopicID !== null) params.set('topic', String(nav.activeTopicID));
    if (nav.activeFolderID !== null) params.set('folder', String(nav.activeFolderID));
    if (selectedIdRef.current !== null) params.set('note', String(selectedIdRef.current));
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
  function openNoteObject(note: Note): void {
    noteOpenedViaPushRef.current = true;
    // Кэш страницы заполняем сразу переданным объектом: заметка может ещё не
    // попасть в списки стора (слайд-интент свайп-выхода, результаты поиска).
    // Эффект [selectedId, notes] позже обновит кэш свежим объектом из списка.
    setSelectedCache(note);
    setSelected(note.id);
    window.history.pushState(null, '', window.location.pathname + queryForState());
  }

  /** Закрыть страницу заметки (UI: крестик/Escape/действие со страницы). */
  function closeNotePage(): void {
    const viaPush = noteOpenedViaPushRef.current;
    noteOpenedViaPushRef.current = false;
    setSelected(null);
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
    const all = useFoldersStore.getState().all;
    let current = all.find((f) => f.id === folderId);
    const seen = new Set<number>();
    while (current !== undefined && !seen.has(current.id)) {
      seen.add(current.id);
      const parentId = current.parent_folder_id;
      if (parentId === null) return true;
      current = all.find((f) => f.id === parentId);
    }
    return false;
  }

  /** Применить urlIntent к сторам: шаги, которые можно проверить, — сразу;
      остальные ждут данные (эффекты-будильники зовут повторно по готовности). */
  function applyUrlIntent(intentArg?: UrlIntent): void {
    const intent = intentArg ?? urlIntentRef.current;
    if (intent === null) return;
    let levelChanged = false;

    // Топик — по списку (ждём, пока топики загружены).
    if (!intent.topicDone) {
      const topicsState = useTopicsStore.getState();
      if (topicsState.loading) return;
      intent.topicDone = true;
      const t = intent.topic;
      if (t !== null) {
        if (topicsState.topics.some((x) => x.id === t)) {
          if (useNavigationStore.getState().activeTopicID !== t) {
            setActiveTopic(t);
            levelChanged = true;
          }
        } else {
          // Битый топик: папка и заметка той же ссылки тоже недействительны.
          intent.folderDone = true;
          intent.noteDone = true;
          const nav = useNavigationStore.getState();
          if (nav.activeFolderID !== null) setActiveFolder(null);
          if (selectedIdRef.current !== null) {
            noteOpenedViaPushRef.current = false;
            setSelected(null);
          }
        }
      }
    }

    // Папка — по дереву папок активного топика (ждём загрузку; ошибка сети —
    // папка не подтверждается и сбрасывается в корень).
    if (!intent.folderDone) {
      const want = intent.folder;
      const foldersState = useFoldersStore.getState();
      const nav = useNavigationStore.getState();
      if (want === null) {
        if (nav.activeFolderID !== null) {
          setActiveFolder(null);
          levelChanged = true;
        }
        intent.folderDone = true;
      } else {
        const ready = foldersState.topicId === nav.activeTopicID && !foldersState.loading;
        const failed = !ready && foldersState.error !== null && !foldersState.loading;
        if (!ready && !failed) return;
        const valid = ready && folderExistsInTree(want);
        if (valid) {
          if (nav.activeFolderID !== want) {
            setActiveFolder(want);
            levelChanged = true;
          }
        } else if (nav.activeFolderID !== null) {
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
        if (selectedIdRef.current !== null) {
          noteOpenedViaPushRef.current = false;
          setSelected(null);
        }
        intent.noteDone = true;
      } else if (!levelChanged) {
        if (!intent.folderDone) return;
        const notesState = useNotesStore.getState();
        if (notesState.loading) return;
        if (notesState.notes.some((x) => x.id === n)) {
          noteOpenedViaPushRef.current = false;
          setSelected(n);
        } else if (selectedIdRef.current !== null) {
          // Заметки нет в списке уровня (удалена/не на этом уровне) — закрыть.
          noteOpenedViaPushRef.current = false;
          setSelected(null);
        }
        intent.noteDone = true;
      }
    }

    // Всё применено/отклонено — дальше адрес ведёт эффект синхронизации.
    if (intent.topicDone && intent.folderDone && intent.noteDone) {
      setUrlIntent(null);
    }
  }

  // Шторки: топики (сетка) и папки (дерево активного топика) — раздельные,
  // открываются плавающими кнопками 📚/📁 (и строкой папки). Не закрываются
  // автоматически при выборе — только вручную (тап вне / Escape).
  const [topicSheetOpen, setTopicSheetOpen] = useState(false);
  const [folderSheetOpen, setFolderSheetOpen] = useState(false);

  // ── Инлайн-папки (режим «в списке», как в боте) ─────────────────────────
  // Включается в настройках (⚙️ → формат папок): папки текущего уровня
  // показываются строками в общем списке заметок — порядок как у бота:
  // закреплённые → папки → остальные заметки. Тап по строке — вход в папку;
  // долгий тач/правый клик — контекстное меню папки (FolderMenu).
  // В режиме «отдельная кнопка» папок в списке нет (только 📁/строка папки).
  // (levelFolders читает сторы напрямую — реактивность от подписок.)
  const inlineFolders = useMemo(
    () => (foldersMode === 'list' ? levelFolders() : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- порт $derived (см. ChatView.svelte)
    [foldersMode, folders, activeFolderID],
  );

  /** Текущий список, разбитый на закреплённые/остальные (обычный режим). */
  const normalSplit = useMemo(() => splitNotes(notes), [notes]);

  /** Папки активного топика ещё не показаны (идёт первая загрузка без кеша:
      topicId стора не совпал с активным топиком). Условие — как в FolderBar
      (показ дерева в шторке): папки «готовы» после успешной загрузки, в т.ч.
      когда их ноль; при ошибке загрузка останавливается и папки не блокируют
      список. */
  const foldersPending = foldersLoading && foldersTopicId !== activeTopicID;

  /** Глубокий уровень «занят»: грузятся заметки уровня ИЛИ папки активного
      топика. Совместная загрузка: список не показывается, пока не приехали
      обе части — строки папок (режим «в списке») и заметки появляются вместе,
      папки не «доезжают» после списка заметок. */
  const levelLoading = notesLoading || foldersPending;

  /** Разбить список заметок на закреплённые и остальные (порядок в списке). */
  function splitNotes(list: Note[]): { pinned: Note[]; rest: Note[] } {
    const pinned: Note[] = [];
    const rest: Note[] = [];
    for (const n of list) (n.pinned ? pinned : rest).push(n);
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

  const previews = useMemo(() => {
    const map = new Map<number, SlidePreview>();
    for (const topic of topics) {
      const cachedNotes = peekCachedNotes(topic.id, null);
      if (cachedNotes === undefined) {
        map.set(topic.id, { state: 'pending', pinned: [], rest: [], folders: [] });
        continue;
      }
      let folderRows: Folder[] = [];
      if (foldersMode === 'list') {
        const all = peekCachedFolders(topic.id);
        if (all === undefined) {
          map.set(topic.id, { state: 'pending', pinned: [], rest: [], folders: [] });
          continue;
        }
        folderRows = all.filter((f) => f.parent_folder_id === null);
      }
      const { pinned, rest } = splitNotes(cachedNotes);
      map.set(topic.id, { state: 'ready', pinned, rest, folders: folderRows });
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- порт $derived.by (см. ChatView.svelte)
  }, [topics, foldersMode, notesCacheTick, foldersCacheTick]);

  function previewData(topicId: number): SlidePreview | undefined {
    return previews.get(topicId);
  }

  /** Слайд в фокусе свайпера (видимый сейчас / цель драга / программного
      переезда). Может опережать стор-активный: при быстрых свайпах целевой
      слайд едет и виден ДО onchange ленты (тот приходит на отпускании, в
      начале доезда). Окрестность фокуса рендерится
      (nearTopicIds) и предзагружается — слайд подъезжает наполненным, а не
      пустой оболочкой до полной остановки анимации. */
  const [focusTopicIndex, setFocusTopicIndexState] = useState(-1);
  const focusTopicIndexRef = useRef(-1);

  /** Сменить фокус свайпера: окрестность нового слайда рендерится
      (nearTopicIds) и предзагружается preloadTopicAround (свежий кеш и
      идущие запросы делают повторные вызовы дешёвыми). */
  function setFocusTopicIndex(index: number): void {
    if (index === focusTopicIndexRef.current) return;
    focusTopicIndexRef.current = index;
    setFocusTopicIndexState(index);
    const topic = useTopicsStore.getState().topics[index];
    if (topic !== undefined) preloadTopicAround(topic.id);
  }

  /** Слайды для рендера: окрестность (сам + соседи ±1) стор-активного И
      фокуса свайпера. При быстрых свайпах фокус опережает стор (драг ещё
      идёт / слайд доезжает, а целевой слайд уже виден) — его превью
      рендерится сразу, слайд не выезжает пустым до полной остановки. Дальние
      слайды — пустые оболочки (ленивость): при многих топиках в DOM не висят
      сотни карточек. */
  const nearTopicIds = useMemo(() => {
    const set = new Set<number>();
    const list = topics;
    const n = list.length;
    if (n === 0) return set;
    const centers = new Set<number>();
    const id = activeTopicID;
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
  }, [topics, activeTopicID, focusTopicIndex]);

  /** Стартовый слайд свайпера: восстановленный активный топик. Проп
      initialIndex используется SwipeStrip планом пересборки (при обычных
      изменениях списка лента оказывается здесь) — после старта слайдом
      управляют onchange ленты и эффект alignToActive ниже. */
  const initialTopicIndex = useMemo(() => {
    const id = activeTopicID;
    if (id === null) return 0;
    const index = topics.findIndex((t) => t.id === id);
    return index > 0 ? index : 0;
  }, [topics, activeTopicID]);

  // ── Лента топиков (SwipeStrip на siema; слайд = топик) ──────────────────
  // Слайды рендерятся по topics (в том же порядке, что табы островка).
  // Навигация двусторонняя:
  //  • свайп/таб островка двигает ленту → событие onchange пишет
  //    navigation.activeTopicID (guard: если id совпадает — пропуск, иначе
  //    замкнутый цикл goTo ↔ onchange);
  //  • программная смена (TopicTabs/шторка, deleteTopic/restore, вход в чат)
  //    меняет стор → эффект делает goTo (с тем же guard).
  // Папки: вход (activeFolderID) — внешняя лента draggable=false, выход — true
  // (пропс, не ручное переключение: siema с draggable=false вообще не вешает
  // обработчиков касаний — «выключенная» лента не мешает вложенной).
  //
  // Императивный API ленты (ref) — узкий интерфейс под нужное ChatView:
  // SwipeStripHandle (goTo/getIndex/getCount). handle храним в STATE через
  // callback-ref: в Svelte bind:this обновлял реактивную переменную
  // topicStrip, и эффект alignToActive перезапускался по готовности ленты —
  // в React смена ref-а рендер не вызывает, поэтому ставим состояние.
  const [topicStrip, setTopicStrip] = useState<SwipeStripHandle | null>(null);
  const topicStripRef = useCallback((handle: SwipeStripHandle | null) => {
    setTopicStrip((prev) => (prev === handle ? prev : handle));
  }, []);
  /** Handle вложенной ленты уровней: только bind:this-цель (как в svelte). */
  const levelStrip = useRef<SwipeStripHandle | null>(null);

  /** Непрерывная позиция свайпа ленты топиков (дробный индекс из
      SwipeStrip.ondragmove): капсула островка следует за пальцем.
      null — жест завершён, островок живёт обычной логикой. */
  const [islandDragPos, setIslandDragPos] = useState<number | null>(null);

  function onTopicDragMove(position: number): void {
    setIslandDragPos(position);
  }

  function onTopicDragEnd(finalPos?: number): void {
    if (finalPos !== undefined) {
      // Быстрый флик: последний rAF-кадр ondragmove мог отстать от пальца —
      // SwipeStrip дослал точку отпускания. Сначала ставим капсулу ровно в
      // неё (островок видит dragPos === finalPos и встаёт туда), затем
      // отпускаем в покой отдельным микротаском: доезд к активному табу
      // стартует с точки отпускания, синхронно с доводкой siema. В одном
      // флаше Svelte схлопнул бы обе записи, и точка была бы потеряна —
      // в React автоматическое батчингование тоже схлопнуло бы их в одном
      // событии, поэтому null уходит отдельным микротаском.
      setIslandDragPos(finalPos);
      queueMicrotask(() => {
        setIslandDragPos(null);
      });
      return;
    }
    setIslandDragPos((prev) => (prev === null ? prev : null));
  }

  /** Внутри папки внешняя лента (топики) выключена — жесты у уровней. */
  const inFolder = activeFolderID !== null;

  /** Длительность доезда siema: 0 при prefers-reduced-motion (всё мгновенно:
      и отпускание драга, и программные переходы). */
  function stripSpeed(): number {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 360;
  }

  /** Привести активный слайд к navigation.activeTopicID. Защита от петель:
      если слайд уже показывает нужный топик — не трогаем ленту. */
  function alignToActive(animate: boolean): void {
    const strip = topicStrip;
    const nav = useNavigationStore.getState();
    const id = nav.activeTopicID;
    if (strip === null || strip.getIndex() < 0 || id === null) return;
    const list = useTopicsStore.getState().topics;
    const want = list.findIndex((t) => t.id === id);
    if (want < 0 || want >= list.length) return; // лента ещё не пересобралась
    if (strip.getIndex() === want) return;
    // Фокус на цель сразу: её окрестность рендерится, пока слайд едет.
    setFocusTopicIndex(want);
    strip.goTo(want, animate);
  }

  /** Слайднуть к топику (тап по табу островка). */
  function slideToTopic(id: number): void {
    const strip = topicStrip;
    const list = useTopicsStore.getState().topics;
    const want = list.findIndex((t) => t.id === id);
    if (strip !== null && strip.getIndex() >= 0 && want >= 0) {
      // Фокус на цель сразу: превью цели (и предзагрузка её данных)
      // стартуют, пока слайд ещё едет анимацией.
      setFocusTopicIndex(want);
      strip.goTo(want, true);
      return;
    }
    // Лента ещё не готова — переключение просто меняет стор (эффект догонит).
    setActiveTopic(id);
  }

  /** Переключить топик (выбор таба в островке): ведём слайд ленты. */
  function onIslandSelect(id: number): void {
    slideToTopic(id);
  }

  /** Смена слайда ленты (отпускание драга или программный goTo) — аналог
      slideChange у Swiper: слайд известен до конца доезда. Пишем стор
      (guard: тот же топик — пропуск, иначе петля goTo ↔ onchange) и
      выравниваем фокус — он мог уехать вперёд намерения/драга. */
  function onTopicChange(index: number): void {
    const list = useTopicsStore.getState().topics;
    const topic = list[index];
    if (topic !== undefined && topic.id !== useNavigationStore.getState().activeTopicID) {
      setActiveTopic(topic.id);
    }
    setFocusTopicIndex(index);
  }

  // Программная навигация (шторка «Топики», восстановление сессии, удаление
  // активного топика и т.п.): активный топик в сторе изменился — слайднуться.
  // Зависимость от длины списка: после удаления/создания топика SwipeStrip
  // пересобирает слайды (стартовый слайд плана = активный топик по
  // initialIndex) — сверяем соответствие заново (goTo с guard не сработает
  // зря: индекс уже правильный).
  useEffect(() => {
    const id = activeTopicID;
    if (id === null) return;
    alignToActive(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- порт $effect (см. ChatView.svelte)
  }, [activeTopicID, topics.length, topicStrip]);

  // ── Уровни папок — вложенная лента SwipeStrip (слайд = уровень) ────────
  // Папка — уровень ВНУТРИ слайда топика, поэтому у живого топика своя
  // вложенная лента: слайд на каждый уровень [корень(null), ...цепочка
  // папок до активной]. Глубокий (последний) слайд — «живой» список
  // активного уровня из стора; слайды выше — статичные превью уровней из
  // кеша (noop-хэндлеры, как у соседних топиков).
  // Вход в папку (тап по строке/крошке) — цепочка растёт: SwipeStrip
  // (animateGrowth) стартует со слайда родителя и анимированно доезжает
  // к глубокому (контент уезжает влево, как у топиков).
  // Выход свайпом-вправо — доезд до слайда родителя; когда слайд встал
  // (onsettle), меняется уровень стора — цепочка укорачивается, слайд
  // родителя становится глубоким («живым»). Скролл уровня живёт в его
  // слайде и сохраняется (SwipeStrip переносит scrollTop пережившим слайдам
  // при пересборке цепочки). При смене топика вложенная лента
  // размонтируется вместе со слайдом — скролл нового топика с нуля.

  /** Слайды уровней: корень (null) + цепочка папок от корня до активной.
      Пустая цепочка (в корне) — один слайд корня. */
  const folderLevels = useMemo(() => [null, ...folderChain()], [
    // eslint-disable-next-line react-hooks/exhaustive-deps -- порт $derived (см. ChatView.svelte)
    folders,
    activeFolderID,
  ]);

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
  const levelPreviews = useMemo(() => {
    const topicId = useNavigationStore.getState().activeTopicID;
    const map = new Map<number | null, LevelPreview>();
    if (topicId === null) return map;
    for (const level of folderLevels) {
      const folderId = levelIdOf(level);
      const cachedNotes = peekCachedNotes(topicId, folderId);
      if (cachedNotes === undefined) {
        map.set(folderId, { state: 'pending', pinned: [], rest: [], folders: [] });
        continue;
      }
      let folderRows: Folder[] = [];
      if (foldersMode === 'list') {
        folderRows = useFoldersStore.getState().all.filter((f) => f.parent_folder_id === folderId);
      }
      const { pinned, rest } = splitNotes(cachedNotes);
      map.set(folderId, { state: 'ready', pinned, rest, folders: folderRows });
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- порт $derived.by (см. ChatView.svelte)
  }, [folderLevels, foldersMode, notesCacheTick, foldersCacheTick, folders, activeTopicID]);

  function levelPreviewData(folderId: number | null): LevelPreview | undefined {
    return levelPreviews.get(folderId);
  }

  /** Глубокий слайд уровней — последний в цепочке: на нём лента оказывается
      после каждой пересборки (SwipeStrip initialIndex). Вход в папку — рост
      цепочки: SwipeStrip с animateGrowth стартует со слайда родителя
      (предыдущего глубокого) и анимированно доезжает сюда; выход/UI-переходы —
      цепочка укорачивается, этот же индекс ведёт сразу на глубокий слайд. */
  const levelInitialIndex = folderLevels.length - 1;

  // ── Интент активации уровня (свайп-выход) ──────────────────────────────
  // Уровень стора меняется только когда лента физически остановилась
  // (onsettle — см. onLevelSettled), а хвост доезда движка длится заметно
  // дольше видимой остановки слайда. В этом окне остановившийся слайд-
  // родитель рендерился бы статичным превью с noop-хэндлерами — тап по
  // нему «не срабатывает», подсветка пути запаздывает. Интент закрывает
  // окно: по select ленты (слайд-цель известна в момент отпускания) слайд
  // уровня выше рендерится «живым» (реальные хэндлеры, данные из кеша
  // уровня) и путь в табе/строке подсвечивается сразу. Значение индекса
  // «съедается» в onsettle, когда уровень стора становится глубоким слайдом.
  const [levelIntentIndex, setLevelIntentIndexState] = useState(-1);
  const levelIntentIndexRef = useRef(-1);
  /** Глубокий слайд цепочки на прошлом рендере (undefined — ещё не было). */
  const prevDeepIdRef = useRef<number | null | undefined>(undefined);
  function setLevelIntentIndex(index: number): void {
    levelIntentIndexRef.current = index;
    setLevelIntentIndexState(index);
  }

  // Пересборка цепочки уровней (вход в папку тапом/крошкой, UI-навигация)
  // уводит глубокий слайд на другую папку — интент свайп-выхода устарел:
  // он живёт только пока движение к предку не трогает стор (до settle).
  // Выход сам меняет глубокий слайд лишь в onsettle, где интент уже снят.
  useEffect(() => {
    const len = folderLevels.length;
    if (len === 0) return;
    const deepId = levelIdOf(folderLevels[len - 1]);
    const prev = prevDeepIdRef.current;
    prevDeepIdRef.current = deepId;
    if (prev === undefined || prev === deepId) return;
    if (levelIntentIndexRef.current >= 0) setLevelIntentIndex(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- порт $effect (см. ChatView.svelte)
  }, [folderLevels]);

  /** Смена слайда вложенной ленты (select — отпускание драга/программный
      goTo, до конца доезда). Слайд-цель — уровень выше глубокого — становится
      «живым» немедленно; уровень стора меняется по-прежнему в onsettle
      (укорачивание цепочки в select удалило бы уезжающий слайд посреди
      движения — видимый обрыв). Возврат на глубокий слайд интент снимает. */
  function onLevelChange(index: number): void {
    if (index >= folderLevels.length - 1) {
      if (levelIntentIndexRef.current >= 0) setLevelIntentIndex(-1);
      return;
    }
    setLevelIntentIndex(index);
  }

  /** Слайд-цель интента как folder_id (null — корень, undefined — интента нет):
      опережающая подсветка пути в островке/строке папок не ждёт остановки. */
  const intentFolderID = useMemo(() => {
    if (levelIntentIndex < 0) return undefined;
    const level = folderLevels[levelIntentIndex];
    return level === undefined ? undefined : levelIdOf(level);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- порт $derived (см. ChatView.svelte)
  }, [levelIntentIndex, folderLevels]);

  /** Свайп-выход доехал до уровня (onsettle — фактическая остановка слайда,
      аналог slideChangeTransitionEnd): слайд показывает уровень выше — меняем
      уровень стора, цепочка укорачивается, слайд становится глубоким.
      Момент важен: onchange у siema приходит в момент отпускания, ДО конца
      CSS-transition — укорачивание цепочки там удалило бы уезжающий слайд
      из DOM посреди движения (видимый обрыв). Смена уровня только после
      остановки слайда (он уже скрылся за краем) делает удаление невидимым.
      Программные входы (рост цепочки) заканчиваются на глубоком слайде —
      уровень совпадает со стором, ничего не меняем. */
  function onLevelSettled(index: number): void {
    // Лента остановилась — слайд уровня теперь настоящий (живой) или вернулся
    // глубокий: интент отработал, дальше уровень ведёт стор.
    if (levelIntentIndexRef.current >= 0) setLevelIntentIndex(-1);
    // folderLevels мог устареть в замыкании ленты — пересчитываем по стору.
    const levels = [null, ...folderChain()];
    const level = levels[index];
    if (level === undefined) return;
    const folderId = levelIdOf(level);
    const activeFolder = useNavigationStore.getState().activeFolderID;
    if (folderId !== activeFolder) setActiveFolder(folderId);
  }

  const topZoneRef = useRef<HTMLDivElement | null>(null);
  const [topPad, setTopPad] = useState(0);

  // Долгое нажатие на пустом месте (заметок нет) — дропдаун «Создать папку».
  const LONG_PRESS_MS = 500;
  const [emptyMenu, setEmptyMenu] = useState<{ x: number; y: number } | null>(null);
  const emptyPressTimer = useRef<number | undefined>(undefined);

  function handleEmptyPress(event: React.PointerEvent<HTMLDivElement>): void {
    emptyPressTimer.current = window.setTimeout(() => {
      suppressNextClick();
      setEmptyMenu({ x: event.clientX, y: event.clientY });
    }, LONG_PRESS_MS);
  }

  function cancelEmptyPress(): void {
    window.clearTimeout(emptyPressTimer.current);
  }

  // Таймер долгого нажатия на пустом месте гасим вместе с жизнью экрана.
  useEffect(
    () => () => {
      window.clearTimeout(emptyPressTimer.current);
    },
    [],
  );

  // ── Эффекты (порядок — как $effect'ы в ChatView.svelte) ─────────────────

  // Кэш открытой заметки: объект может исчезнуть из списка раньше, чем
  // доиграет закрытие страницы.
  useEffect(() => {
    if (selectedId === null) {
      setSelectedCache(null);
      return;
    }
    const found = notes.find((n) => n.id === selectedId);
    if (found) setSelectedCache(found);
  }, [selectedId, notes]);

  // Островок поверх списка: его высота задаёт отступ контента слайдов
  // (topPad). Следим за ресайзом (крошки в расширенном табе меняют высоту).
  useEffect(() => {
    const el = topZoneRef.current;
    if (el === null) return;
    const update = (): void => {
      setTopPad(el.offsetHeight + 6);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // При авторизации (старт или вход) — загружаем топики.
  useEffect(() => {
    if (sessionState === 'authed') {
      void loadTopics();
    }
  }, [sessionState]);

  // При выборе топика — загружаем его папки (полный список для дерева).
  useEffect(() => {
    if (activeTopicID === null) return;
    void loadFolders(activeTopicID);
  }, [activeTopicID]);

  // При смене топика или папки — заметки уровня (кеш показывается сразу,
  // свежесть догружается фоном).
  useEffect(() => {
    if (activeTopicID === null) return;
    void loadNotes(activeTopicID, activeFolderID);
  }, [activeTopicID, activeFolderID]);

  // Стартовый URL (глубокая ссылка/восстановление вкладки): после загрузки
  // топиков и авто-выбора активного (restoreActiveTopic) применяем параметры
  // query — они приоритетнее localStorage. Без параметров — просто включаем
  // синхронизацию адреса (URL получит ?topic= при первом же изменении).
  useEffect(() => {
    if (sessionState !== 'authed') return;
    if (topicsLoading || topics.length === 0) return;
    if (activeTopicID === null) return;
    if (urlStarted) return;
    setUrlStarted(true);
    const intent = readUrlIntent();
    if (intent.topic === null && intent.folder === null && intent.note === null) return;
    setUrlIntent(intent);
    applyUrlIntent(intent);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- порт $effect (см. ChatView.svelte)
  }, [sessionState, topicsLoading, topics, activeTopicID, urlStarted]);

  // Будильники: urlIntent применяется по шагам, когда данные для проверки
  // очередного шага готовы (топики → папки → заметки). В Svelte — по три
  // $effect на стор; здесь один эффект без deps бежит после каждого рендера
  // (прогресс дают подписки: изменение стора → ре-рендер → повторный вызов),
  // а early-return при urlIntent === null терминален — цикла не будет.
  useEffect(() => {
    applyUrlIntent();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- порт эффектов-будильников
  });

  // Зеркало навигации в адресной строке: ?topic=&folder=&note=. replaceState
  // не плодит историю; открытие/закрытие заметки управляет стеком отдельно
  // (pushState в openNote / history.back() в closeNotePage). Молчит, пока не
  // обработан стартовый URL и пока живой intent ведёт адрес сам.
  useEffect(() => {
    if (!urlStarted || urlIntent !== null) return;
    syncLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- порт $effect (см. ChatView.svelte)
  }, [activeTopicID, activeFolderID, selectedId, urlStarted, urlIntent]);

  // «Назад/вперёд»: popstate на наши записи (state=null) роутер пропускает
  // (лишь обновляет адрес) — доводим сторы сами: заметка в query — открыть,
  // без неё — закрыть; топик/папку — по равенству (как onchange ленты).
  useEffect(() => {
    const onPopState = (): void => {
      const intent = readUrlIntent();
      setUrlIntent(intent);
      applyUrlIntent(intent);
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- порт $effect (один раз)
  }, []);

  // Предзагрузка: подгружаем корень топика и корни его соседей слева и
  // справа — свайп на соседний слайд не ждёт сеть. В режиме «папки в списке»
  // превью слайда показывает и корневые папки соседа — их тоже кешируем
  // заранее (иначе слайд соседа показывал бы плейсхолдер до первого визита).
  // Вызывается в момент намерения (драг/отпускание: фокус уже знает цель —
  // таб подсвечен, слайд ещё едет) и после фактической смены активного
  // топика (эффект ниже). Повторные вызовы безопасны: свежий кеш
  // пропускается (isNotesCached), идущий запрос не дублируется (inFlight).
  function preloadTopicAround(topicId: number): void {
    const list = useTopicsStore.getState().topics;
    const index = list.findIndex((t) => t.id === topicId);
    if (index < 0) return;
    const neighbors: number[] = [];
    if (index > 0) neighbors.push(list[index - 1].id);
    if (index + 1 < list.length) neighbors.push(list[index + 1].id);
    void preloadTopicNeighbors(topicId, neighbors);
    if (useSettingsStore.getState().foldersMode === 'list') {
      for (const id of neighbors) {
        if (peekCachedFolders(id) === undefined) void loadFolders(id, true);
      }
    }
  }

  useEffect(() => {
    const topicId = activeTopicID;
    if (topicId === null || topicsLoading) return;
    preloadTopicAround(topicId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- порт $effect (см. ChatView.svelte)
  }, [activeTopicID, topicsLoading]);

  // Подсветка «только что добавленной» заметки: держим ~3 сек и снимаем.
  const HIGHLIGHT_MS = 3000;
  const highlightTimer = useRef<number | null>(null);
  useEffect(() => {
    const id = highlightedId;
    if (id === null) return;
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => {
      highlightTimer.current = null;
      clearNoteHighlight();
    }, HIGHLIGHT_MS);
    return () => {
      if (highlightTimer.current !== null) {
        window.clearTimeout(highlightTimer.current);
        highlightTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- порт $effect (см. ChatView.svelte)
  }, [highlightedId]);

  // Уход со экрана чата — подсветку не возобновляем при возврате.
  useEffect(
    () => () => {
      clearNoteHighlight();
    },
    [],
  );

  // ── Сниппеты: списки и панели слайдов ───────────────────────────────────
  // Колонка списка: закреплённые → строки папок (режим «в списке») →
  // остальные заметки. Без анимации появления: при перерисовке списка
  // (переключение топиков/папок, морфинг слайда live ⇄ превью) каскадный
  // въезд «мигал» бы карточками.
  // В Svelte это был сниппет ({@render}); вызываем КАК ФУНКЦИЮ, не
  // компонент — иначе слайды размонтировались бы при каждом вызове.
  function noteList(
    pinned: Note[],
    rest: Note[],
    folderRows: Folder[],
    onOpenNote: (note: Note) => void,
    onMenuNote: (note: Note, rect: DOMRect) => void,
    onOpenFolder: (folder: Folder) => void,
    onMenuFolder: (folder: Folder, rect: DOMRect) => void,
  ) {
    return (
      <div className="flex flex-col gap-2 px-3 py-3">
        {pinned.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            highlighted={highlightedId === note.id}
            onOpen={onOpenNote}
            onMenu={onMenuNote}
          />
        ))}
        {folderRows.length > 0 &&
          folderRows.map((folder) => (
            <FolderRow key={folder.id} folder={folder} onOpen={onOpenFolder} onMenu={onMenuFolder} />
          ))}
        {rest.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            highlighted={highlightedId === note.id}
            onOpen={onOpenNote}
            onMenu={onMenuNote}
          />
        ))}
      </div>
    );
  }

  // Панель слайда топика (как сниппет topicPane в svelte): живой топик —
  // вложенная лента уровней; соседние — статичное превью корня из кеша.
  function topicPane(topic: Topic) {
    if (topic.id === activeTopicID) {
      // Живой топик: вложенная лента уровней (SwipeStrip на siema). Слайд
      // на каждый уровень [корень, ...цепочка папок до активной] — глубокий
      // (последний) показывает «живой» список активного уровня из стора,
      // слайды выше — статичные превью уровней из кеша (noop-хэндлеры, как
      // у соседних топиков). Вертикальный скролл — у каждого слайда свой
      // (.chat-scroll): вход/выход из папки не сбрасывает скролл уровней
      // (SwipeStrip переносит scrollTop пережившим слайдам), контент
      // каждого уровня начинается под «островком» (topPad). Свайп-вправо —
      // «назад» на уровень выше (смена уровня — после фактической остановки
      // слайда, onsettle); тап по папке/крошке — вход: цепочка растёт,
      // SwipeStrip (animateGrowth) анимированно доезжает к глубокому.
      return (
        <SwipeStrip
          ref={levelStrip}
          items={folderLevels}
          keyOf={levelKey}
          initialIndex={levelInitialIndex}
          animateGrowth
          draggable={inFolder}
          duration={stripSpeed()}
          onchange={onLevelChange}
          onsettle={onLevelSettled}
        >
          {(level, i) => {
            const folderId = levelIdOf(level);
            const isDeep = i === folderLevels.length - 1;
            const isIntent = !isDeep && i === levelIntentIndex;
            if (isDeep) {
              return (
                <div
                  className="chat-scroll scroll-area h-full touch-pan-y overflow-y-auto"
                  style={{ paddingTop: `${topPad}px` }}
                >
                  {levelLoading ? (
                    <Loader />
                  ) : notesError !== null ? (
                    <div className="flex flex-col items-center gap-4 px-6 py-16">
                      <EmptyState emoji="⚠️" text={notesError} />
                      <button
                        type="button"
                        className="h-11 rounded-xl border border-border px-6 text-sm"
                        onClick={() => {
                          const nav = useNavigationStore.getState();
                          const topicId = nav.activeTopicID;
                          if (topicId !== null) void loadNotes(topicId, nav.activeFolderID);
                        }}
                      >
                        Повторить
                      </button>
                    </div>
                  ) : notes.length === 0 && inlineFolders.length === 0 ? (
                    // Пустое место: долгое нажатие — дропдаун «Создать папку»
                    <div
                      role="group"
                      aria-label="Пустое место"
                      className="flex min-h-full flex-col"
                      onPointerDown={handleEmptyPress}
                      onPointerUp={cancelEmptyPress}
                      onPointerCancel={cancelEmptyPress}
                      onPointerLeave={cancelEmptyPress}
                    >
                      <div className="flex flex-1 flex-col">
                        <EmptyState />
                      </div>
                    </div>
                  ) : (
                    noteList(
                      normalSplit.pinned,
                      normalSplit.rest,
                      inlineFolders,
                      (n) => openNoteObject(n),
                      openMenu,
                      (f) => setActiveFolder(f.id),
                      openFolderMenu,
                    )
                  )}
                </div>
              );
            }
            if (isIntent) {
              // Слайд-цель свайп-выхода (уровень выше): «живой» уже по select
              // ленты — реальные хэндлеры (тап открывает заметку/папку), данные
              // из кеша уровня, как у статичного превью. Когда лента встанет
              // (onsettle) и уровень стора сменится, слайд станет глубоким и
              // возьмёт данные из стора — интент снимается.
              const p = levelPreviewData(folderId);
              return (
                <div
                  className="chat-scroll scroll-area h-full touch-pan-y overflow-y-auto"
                  style={{ paddingTop: `${topPad}px` }}
                >
                  {p === undefined || p.state === 'pending' ? (
                    <Loader />
                  ) : (
                    noteList(
                      p.pinned,
                      p.rest,
                      p.folders,
                      (n) => openNoteObject(n),
                      openMenu,
                      (f) => setActiveFolder(f.id),
                      openFolderMenu,
                    )
                  )}
                </div>
              );
            }
            const p = levelPreviewData(folderId);
            return (
              <div
                className="chat-scroll scroll-area h-full touch-pan-y overflow-y-auto"
                style={{ paddingTop: `${topPad}px` }}
              >
                {p === undefined || p.state === 'pending' ? (
                  // Кеша уровня ещё нет — спиннер (фоновая предзагрузка
                  // наполнит превью, как только придут данные).
                  <Loader />
                ) : (
                  // Статичное превью уровня выше: без интерактива.
                  noteList(p.pinned, p.rest, p.folders, noopOpenNote, noopMenuNote, noopOpenFolder, noopMenuFolder)
                )}
              </div>
            );
          }}
        </SwipeStrip>
      );
    }
    // Слайд соседнего топика: статичное превью корня (из кеша) в своём
    // .chat-scroll. Вертикальный скролл — у самого слайда: лента выше
    // не скроллится, контент начинается под «островком» (topPad).
    const preview = previewData(topic.id);
    return (
      <div
        className="chat-scroll scroll-area h-full touch-pan-y overflow-y-auto"
        style={{ paddingTop: `${topPad}px` }}
      >
        {preview === undefined || preview.state === 'pending' ? (
          // Кеша соседа ещё нет — спиннер (фоновая предзагрузка
          // наполнит превью, как только придут данные).
          <Loader />
        ) : (
          // Статичное превью корня соседнего топика: без интерактива.
          noteList(preview.pinned, preview.rest, preview.folders, noopOpenNote, noopMenuNote, noopOpenFolder, noopMenuFolder)
        )}
      </div>
    );
  }

  // ── Разметка ────────────────────────────────────────────────────────────
  return (
    <>
      <div className="relative flex h-full flex-col">
        {topicsLoading ? (
          <div className="flex flex-1 flex-col justify-center">
            <Loader />
          </div>
        ) : topicsError !== null ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
            <EmptyState emoji="⚠️" text={topicsError} />
            <button
              type="button"
              className="h-11 rounded-xl border border-border px-6 text-sm"
              onClick={() => void loadTopics()}
            >
              Повторить
            </button>
          </div>
        ) : topics.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
            <EmptyState emoji="＋" text="Создайте топик" />
            <button
              type="button"
              className="flex h-11 items-center gap-2 rounded-xl border border-border px-6 text-sm"
              onClick={() => useUiStore.setState({ topicCreateOpen: true })}
            >
              <span>＋</span> Создать
            </button>
          </div>
        ) : (
          // Зона ленты: слайд на каждый топик. Сама лента не скроллится
          // (overflow скрыт) — вертикальный скролл живёт внутри слайдов
          // (.chat-scroll): у соседних топиков прямо в слайде, у живого — в
          // слайдах вложенной ленты уровней. Жесты делят две ленты (SwipeStrip
          // с draggable): в корне топиков (папка не выбрана) ведёт внешняя,
          // внутри папки — вложенная (уровни); «выключенная» (draggable=false)
          // не вешает обработчиков касаний и не мешает включённой.
          <div className="relative min-h-0 flex-1 overflow-hidden" role="region" aria-label="Список топиков">
            <SwipeStrip
              ref={topicStripRef}
              items={topics}
              keyOf={(t) => String(t.id)}
              initialIndex={initialTopicIndex}
              draggable={!inFolder}
              duration={stripSpeed()}
              onchange={onTopicChange}
              ondragmove={onTopicDragMove}
              ondragend={onTopicDragEnd}
            >
              {(topic) =>
                nearTopicIds.has(topic.id) ? (
                  topicPane(topic)
                ) : (
                  // Дальний слайд — пустая оболочка (ленивость): контент
                  // рендерится, когда слайд стал активным или соседним.
                  <div className="h-full"></div>
                )
              }
            </SwipeStrip>
          </div>
        )}

        {/* Островок топиков (+ по настройке — строка папки): фиксированы над
            списком (pointer-events только на самих панелях — между ними список
            можно листать). По умолчанию (pathMode 'tab') строка-крошка не
            рисуется: путь в папке показывает расширенный активный таб островка,
            тап по нему открывает шторку папок. В режиме 'strip' — прежняя строка. */}
        <div
          ref={topZoneRef}
          className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+8px)]"
        >
          <TopicIsland
            onSelect={onIslandSelect}
            pathInTab={pathMode === 'tab'}
            onOpenFolders={() => setFolderSheetOpen(true)}
            dragPos={islandDragPos}
            duration={stripSpeed()}
            displayFolderID={intentFolderID}
          />
          {pathMode === 'strip' && (
            <FolderStrip onOpen={() => setFolderSheetOpen(true)} displayFolderID={intentFolderID} />
          )}
          {/* 🔍 поиск по заметкам: справа от островка (absolute — не влияет на
              высоту topZone, которую меряют слайды для topPad). Показываем,
              только когда есть топики: поиск по пустому списку бессмыслен. */}
          {topics.length > 0 && (
            <button
              type="button"
              aria-label="Поиск по заметкам"
              className="glass-fab pointer-events-auto absolute right-3 top-[calc(env(safe-area-inset-top)+8px)] flex h-11 w-11 items-center justify-center rounded-full text-lg text-muted-foreground transition-[background-color,transform] active:scale-90"
              onClick={() => setSearchOpen(true)}
            >
              🔍
            </button>
          )}
        </div>

        <footer className="shrink-0 rounded-t-2xl border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
          <InputBar
            onOpenTopics={() => setTopicSheetOpen(true)}
            onOpenFolders={() => setFolderSheetOpen(true)}
            onNavigate={navigate}
          />
        </footer>
      </div>

      {searchOpen && (
        <SearchPanel
          onClose={() => setSearchOpen(false)}
          onOpenNote={(note) => {
            // Поиск НЕ закрываем: страница заметки (NotePage, z-[70]) открывается
            // поверх панели поиска (z-40), а его state (запрос/режим/результаты)
            // живёт в SearchPanel и не сбрасывается. Свайп-назад из заметки
            // (или «←») возвращает в поиск с теми же результатами.
            // Клавиатуру поискового инпута прячем, чтобы она не выскочила
            // поверх страницы заметки.
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
            openNoteObject(note);
          }}
          onMenu={openMenu}
        />
      )}

      {selectedCache !== null && <NotePage note={selectedCache} onClose={closeNotePage} />}

      {menuNote !== null && menuRect !== null && (
        <NoteMenu note={menuNote} rect={menuRect} onClose={closeMenu} onMove={requestMove} />
      )}

      {moveTarget !== null && <MoveModal note={moveTarget} onClose={closeMove} />}

      {folderMenu !== null && (
        <FolderMenu folder={folderMenu.folder} rect={folderMenu.rect} onClose={closeFolderMenu} />
      )}

      {emptyMenu !== null && (
        <QuickMenu
          x={emptyMenu.x}
          y={emptyMenu.y}
          items={[
            {
              emoji: '📁',
              label: 'Создать папку',
              action: () => useUiStore.setState({ folderCreateOpen: true }),
            },
          ]}
          onClose={() => setEmptyMenu(null)}
        />
      )}

      {/* Шторка топиков (сетка) и шторка папок (дерево) */}
      {topicSheetOpen && (
        <Modal open onClose={() => setTopicSheetOpen(false)}>
          <div className="flex flex-col gap-2">
            <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Топики</h2>
            <TopicTabs />
          </div>
        </Modal>
      )}

      {folderSheetOpen && (
        <Modal open onClose={() => setFolderSheetOpen(false)}>
          <div className="flex flex-col gap-2">
            <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Папки</h2>
            <FolderBar />
          </div>
        </Modal>
      )}

      <TopicMenu />
      <CreateTopicModal />
      <CreateFolderModal />
    </>
  );
}
