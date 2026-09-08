// «Островок» табов топиков: стеклянная плавающая панель (glass style, как
// островок в Telegram) над списком заметок, фиксирована при скролле.
// Тап — выбрать топик (свайпом по списку тоже переключается), долгий тап
// по табу — меню топика (TopicMenu: создать/переименовать/удалить).
// Счётчик заметок — как в боте.
//
// Подсветка — единая акцентная капсула (позади табов), а не фон кнопки:
// при свайпе контента она непрерывно едет за пальцем между табами
// (dragPos от SwipeStrip), а при переключении — плавно переезжает на
// новый таб синхронно с доводкой ленты контента (та же длительность
// duration). Переезжает сама ПОЗИЦИЯ капсулы (rAF-доезд), и текст табов
// перекрашивается в каждом кадре следом за ней (белый ⇄ цвет контента) —
// как в Telegram: даже если свайп отпущен на полпути, перекраска не
// «обрывается» (не скачет раньше капсулы — обе едут к цели от точки
// отпускания, как и лента контента).
//
// Лента островка подкручивается так, чтобы активный таб и его сосед по
// направлению перехода были видны целиком: следующий свайп не «перескакивает»
// через край контейнера. Подкрутка анимируется своей rAF-прокруткой
// (длительность duration) и отменяется, если пользователь сам начал
// скроллить ленту пальцем — ручной скролл не перехватывается.
//
// Режим «путь в табе» (pathInTab, настройка): активный таб при входе
// в папку расширяется в хлебные крошки по ширине своего текста, оставаясь
// обычной акцентной таблеткой, и показывает путь из корня («Работа ›
// Проект › Задачи»); длинный путь ужимается до влезающего — корень и
// активная папка видны всегда, середина маскируется «…».
// Тап по нему открывает шторку папок. Отдельная строка-крошка
// (FolderStrip) в этом режиме не рисуется.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as React from 'react';

import { CrumbPath } from './CrumbPath';
import { folderChain, useFoldersStore } from '../stores/folders';
import { useNavigationStore } from '../stores/navigation';
import { useTopicsStore } from '../stores/topics';
import { openTopicMenu } from '../stores/topic-menu';
import { suppressNextClick } from '../utils/click';

interface TopicIslandProps {
  /** Выбор топика (родитель добавляет анимацию въезда списка). */
  onSelect: (id: number) => void;
  /** Режим «путь в табе»: путь в папке показывается в активном табе. */
  pathInTab?: boolean;
  /** Открыть шторку папок (тап по расширенному табу в папке). */
  onOpenFolders?: () => void;
  /** Непрерывная позиция свайпа контента (дробный индекс таба, из
      SwipeStrip.ondragmove): капсула следует за пальцем. null — покой. */
  dragPos?: number | null;
  /** Длительность переезда капсулы и подкрутки ленты, мс (0 — мгновенно:
      prefers-reduced-motion). Синхронизирована с доездом ленты контента. */
  duration?: number;
}

/** Позиции табов в контентных координатах ленты. */
interface TabGeo {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Состояние капсулы: левый таб пары (i), доля перехода (f), координаты. */
interface PillGeo {
  i: number;
  f: number;
  left: number;
  width: number;
  top: number;
  height: number;
}

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 10;
/** Запас до краёв ленты при подкрутке (как отступ px-1.5 панели). */
const SCROLL_PAD = 8;
/** Порог движения пальца по ленте, после которого reveal-подкрутка
    отменяется (жест считается ручным скроллом). */
const CANCEL_MOVE_PX = 8;

/** Цвет текста таба по «белизне»: 1 — белый (под капсулой), 0 — цвет
    контента; промежуточные — во время езды капсулы. */
function textMix(w: number): string {
  const pct = Math.round(w * 100);
  return `color-mix(in srgb, #fff ${pct}%, var(--color-content))`;
}

export function TopicIsland({
  onSelect,
  pathInTab = false,
  onOpenFolders,
  dragPos = null,
  duration = 360,
}: TopicIslandProps) {
  const topics = useTopicsStore((s) => s.topics);
  const pendingTopicID = useNavigationStore((s) => s.pendingTopicID);
  const activeTopicID = useNavigationStore((s) => s.activeTopicID);
  const activeFolderID = useNavigationStore((s) => s.activeFolderID);
  const folders = useFoldersStore((s) => s.all);

  /** Имена папок от корня активного топика до активной папки включительно. */
  const chainNames = useMemo(() => folderChain().map((f) => f.name), [folders, activeFolderID]);

  /** Контейнер ленты табов. */
  const [islandEl, setIslandEl] = useState<HTMLDivElement | null>(null);
  const islandRef = useCallback((node: HTMLDivElement | null) => setIslandEl(node), []);

  /** Позиции табов в контентных координатах ленты (offsetLeft/offsetTop
      от островка — он relative). Пересобирается при изменении списка,
      расширении активного таба (крошки) и ресайзе. */
  const [tabsGeo, setTabsGeo] = useState<TabGeo[]>([]);

  /** Непрерывная позиция капсулы — дробный индекс таба. -1 — не определена. */
  const [pillPos, setPillPos] = useState(-1);

  const pillAnimRAF = useRef(0);
  const scrollAnimRAF = useRef(0);
  /** Направление последней смены активного таба (+1 — следующий в списке). */
  const lastDir = useRef<1 | -1>(1);
  const lastActiveIdx = useRef(-2);

  /** Индекс фактически активного таба (-1 — не выбран). */
  const activeIdx = useMemo(() => {
    const id = pendingTopicID ?? activeTopicID;
    if (id === null) return -1;
    return topics.findIndex((t) => t.id === id);
  }, [topics, pendingTopicID, activeTopicID]);

  function measureTabs(): void {
    const el = islandEl;
    if (el === null) return;
    const buttons = el.querySelectorAll<HTMLElement>('button[data-topic-id]');
    // DOM может быть не синхронизирован со списком (пересборка) — ждём
    // следующего эффекта, иначе капсула встанет под чужие табы.
    if (buttons.length !== topics.length) return;
    const geo: TabGeo[] = [];
    for (const b of buttons) {
      geo.push({
        left: b.offsetLeft,
        top: b.offsetTop,
        width: b.offsetWidth,
        height: b.offsetHeight,
      });
    }
    setTabsGeo(geo);
  }

  // Измерение после отрисовки: список/крошки меняют ширину табов. CrumbPath
  // ужимает длинный путь за несколько кадров (drops по rAF) — догоняем
  // ResizeObserver'ом на кнопках (срабатывает на каждое изменение ширины).
  useEffect(() => {
    const el = islandEl;
    if (el === null) return;
    const ro = new ResizeObserver(() => measureTabs());
    ro.observe(el);
    for (const b of el.querySelectorAll<HTMLElement>('button[data-topic-id]')) {
      ro.observe(b);
    }
    measureTabs();
    // Первый кадр ужатия крошек — до него RO на кнопке ещё не сработал.
    const raf = requestAnimationFrame(() => measureTabs());
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- порт $effect (см. TopicIsland.svelte)
  }, [topics, chainNames, activeFolderID, pathInTab, islandEl]);

  function stopPillAnim(): void {
    if (pillAnimRAF.current !== 0) {
      cancelAnimationFrame(pillAnimRAF.current);
      pillAnimRAF.current = 0;
    }
  }

  /** Доезд капсулы к позиции target от текущей (точки отпускания после
      драга / старого таба при переключении). Мгновенно при duration <= 0
      (prefers-reduced-motion) и при первом появлении (позиции ещё нет). */
  function animatePillTo(target: number): void {
    stopPillAnim();
    const from = pillPos;
    if (from < 0 || duration <= 0 || Math.abs(from - target) < 0.005) {
      setPillPos(target);
      return;
    }
    const dur = duration;
    const t0 = performance.now();
    const step = (now: number): void => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3); // ease-out — как доводка контента
      setPillPos(from + (target - from) * e);
      pillAnimRAF.current = k < 1 ? requestAnimationFrame(step) : 0;
    };
    pillAnimRAF.current = requestAnimationFrame(step);
  }

  /** Состояние капсулы: левый таб пары (i), доля перехода (f), координаты.
      null — капсулу не рисовать (табов нет / позиция не определена). */
  const pillState = useMemo<PillGeo | null>(() => {
    const n = tabsGeo.length;
    if (n === 0) return null;
    const raw = pillPos;
    if (raw < 0 || Number.isNaN(raw)) return null;
    const p = Math.min(Math.max(raw, 0), n - 1);
    const i = Math.floor(p);
    const f = p - i;
    const g0 = tabsGeo[i];
    const g1 = tabsGeo[Math.min(i + 1, n - 1)];
    const k = f > 0 && i + 1 < n ? f : 0;
    return {
      i,
      f: k > 0 ? f : 0,
      left: g0.left + (g1.left - g0.left) * k,
      width: g0.width + (g1.width - g0.width) * k,
      top: g0.top,
      height: g0.height,
    };
  }, [tabsGeo, pillPos]);

  // Капсула за пальцем: dragPos приходит каждый кадр жеста — позиция пишется
  // напрямую (без анимации), идущий доезд отменяется (не бороться с рукой).
  useEffect(() => {
    const p = dragPos;
    if (p === null) return;
    stopPillAnim();
    const n = tabsGeo.length;
    setPillPos(n > 0 ? Math.min(Math.max(p, 0), n - 1) : -1);
  }, [dragPos, tabsGeo]);

  // Доезд к активному табу: смена активного топика (свайп/тап/шторка),
  // выход из драга (dragPos → null — стартуем от точки отпускания) и первое
  // появление геометрии. Пока dragPos не null позицией рулит драг-эффект.
  // Cleanup гасит идущий доезд при перезапуске (новая цель) и размонтировании.
  useEffect(() => {
    const n = tabsGeo.length;
    if (n > 0) {
      const target = activeIdx;
      if (target >= 0) {
        if (dragPos === null) animatePillTo(target);
      } else if (pillPos !== -1) {
        // Активного топика нет — капсулу не рисовать.
        setPillPos(-1);
      }
    }
    return stopPillAnim;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- порт $effect (см. TopicIsland.svelte)
  }, [duration, tabsGeo, activeIdx, dragPos]);

  /** Белизна текста каждого таба: 1 — белый (под капсулой), 0 — цвет
      контента; промежуточные — во время езды капсулы (перекраска пары). */
  const whites = useMemo<number[]>(() => {
    const n = tabsGeo.length;
    if (n === 0) return [];
    const ps = pillState;
    if (ps === null) return Array<number>(n).fill(0);
    const out = Array<number>(n).fill(0);
    if (ps.f === 0) {
      out[ps.i] = 1;
    } else {
      out[ps.i] = 1 - ps.f;
      if (ps.i + 1 < n) out[ps.i + 1] = ps.f;
    }
    return out;
  }, [tabsGeo, pillState]);

  function cancelScrollAnim(): void {
    if (scrollAnimRAF.current !== 0) {
      cancelAnimationFrame(scrollAnimRAF.current);
      scrollAnimRAF.current = 0;
    }
  }

  function scrollToTarget(target: number): void {
    const el = islandEl;
    if (el === null) return;
    cancelScrollAnim();
    if (duration <= 0) {
      el.scrollLeft = target;
      return;
    }
    const from = el.scrollLeft;
    const dist = target - from;
    if (Math.abs(dist) < 0.5) return;
    const t0 = performance.now();
    const step = (now: number): void => {
      const k = Math.min(1, (now - t0) / duration);
      const e = 1 - Math.pow(1 - k, 3); // ease-out
      el.scrollLeft = from + dist * e;
      scrollAnimRAF.current = k < 1 ? requestAnimationFrame(step) : 0;
    };
    scrollAnimRAF.current = requestAnimationFrame(step);
  }

  /** Куда доскроллить ленту, чтобы активный таб и его сосед по dir были
      видны целиком (с запасом SCROLL_PAD). null — уже всё видно.
      Координаты табов — контентные: getBoundingClientRect даёт экранные
      (уже сдвинутые на scrollLeft), поэтому к ним добавляется s — иначе
      при ненулевом скролле проверки видимости и цели уезжают на s. */
  function revealTarget(chip: HTMLElement, dir: 1 | -1, inFolder: boolean): number | null {
    const el = islandEl;
    if (el === null) return null;
    const pad = SCROLL_PAD;
    const s = el.scrollLeft;
    const view = el.clientWidth;
    const max = Math.max(0, el.scrollWidth - view);
    const cr = el.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    const cL = c.left - cr.left + s;
    const cR = c.right - cr.left + s;
    const cVisible = cL >= s + pad && cR <= s + view - pad;

    if (inFolder) {
      // Расширенный таб-крошки: показываем начало пути (имя топика);
      // соседний таб не нужен — в папке внешняя лента контента выключена.
      if (cVisible) return null;
      return Math.max(0, Math.min(cL - pad, max));
    }

    const clamp = (t: number): number => Math.max(0, Math.min(t, max));
    const neighbor =
      dir === 1 ? chip.nextElementSibling : chip.previousElementSibling;
    if (neighbor === null || !(neighbor instanceof HTMLElement)) {
      if (cVisible) return null;
      // Соседа нет (край списка): показать активный таб целиком — если он
      // ушёл вправо, подъезжаем слева, если влево — справа.
      return cR > s + view - pad ? clamp(cL - pad) : clamp(cR - view + pad);
    }
    const n = neighbor.getBoundingClientRect();
    const nL = n.left - cr.left + s;
    const nR = n.right - cr.left + s;
    const nVisible = dir === 1 ? nR <= s + view - pad : nL >= s + pad;
    if (cVisible && nVisible) return null;

    // Окно «активный + сосед» [L, R]: сосед по направлению перехода.
    const L = dir === 1 ? cL - pad : nL - pad;
    const R = dir === 1 ? nR + pad : cR + pad;
    if (R - L <= view) {
      // Влезают вместе: подъезжаем минимально, чтобы окно целиком
      // поместилось (текущая позиция уже внутри — ничего не делаем).
      if (s < R - view) return clamp(R - view);
      if (s > L) return clamp(L);
      return null;
    }
    // Не влезают: активный к краю по направлению — сосед «впереди» виден
    // настолько, насколько помещается (максимум обзора по ходу движения).
    return dir === 1 ? clamp(cL - pad) : clamp(cR - view + pad);
  }

  // Подкрутка при смене активного топика (свайп/клик по табу/шторка/
  // восстановление). Направление — по знаку последней смены: показываем
  // соседа, к которому пойдёт следующий свайп. Отложено на кадр: ширина
  // таба-крошек финальна после отрисовки пути.
  useEffect(() => {
    const id = pendingTopicID ?? activeTopicID;
    const el = islandEl;
    if (id === null || el === null) return;
    // Вход/выход из папки меняет ширину активного таба (обычный ⇄ крошки) —
    // лента перестраивается, поэтому следим и за папкой.
    const inFolder = activeFolderID !== null && chainNames.length > 0;
    const idx = topics.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const dir: 1 | -1 =
      lastActiveIdx.current === -2
        ? 1
        : idx > lastActiveIdx.current
          ? 1
          : idx < lastActiveIdx.current
            ? -1
            : lastDir.current;
    lastActiveIdx.current = idx;
    lastDir.current = dir;

    const raf = requestAnimationFrame(() => {
      const chip = el.querySelector<HTMLElement>(`[data-topic-id="${id}"]`);
      if (chip === null) return;
      const target = revealTarget(chip, dir, inFolder);
      if (target !== null) scrollToTarget(target);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- порт $effect (см. TopicIsland.svelte)
  }, [pendingTopicID, activeTopicID, activeFolderID, chainNames, topics, islandEl]);

  // Отмена reveal-подкрутки ручным скроллом ленты: анимацию гасим только
  // когда палец/курсор реально повёл ленту (по X) — простой тап по табу
  // (pointerdown без движения) подкрутку не прерывает.
  useEffect(() => {
    const el = islandEl;
    if (el === null) return;
    let tracking = false;
    let downX = 0;
    const onDown = (e: PointerEvent): void => {
      tracking = true;
      downX = e.clientX;
    };
    const onMove = (e: PointerEvent): void => {
      if (!tracking) return;
      if (Math.abs(e.clientX - downX) > CANCEL_MOVE_PX) {
        tracking = false;
        cancelScrollAnim();
      }
    };
    const onUp = (): void => {
      tracking = false;
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      cancelScrollAnim();
    };
  }, [islandEl]);

  // ── Долгий тап: меню топика ────────────────────────────────────────────
  const longPressTimer = useRef<number | undefined>(undefined);
  const longPressFired = useRef(false);
  const pressStart = useRef({ x: 0, y: 0 });

  // Таймер долгого нажатия гасим вместе с жизнью компонента.
  useEffect(
    () => () => {
      window.clearTimeout(longPressTimer.current);
    },
    [],
  );

  function clearTimer(): void {
    window.clearTimeout(longPressTimer.current);
  }

  function handlePointerDown(id: number, e: React.PointerEvent<HTMLButtonElement>): void {
    if (e.button !== 0) return;
    longPressFired.current = false;
    pressStart.current = { x: e.clientX, y: e.clientY };
    clearTimer();
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      suppressNextClick();
      const topic = topics.find((t) => t.id === id);
      if (topic !== undefined) {
        openTopicMenu(topic);
      }
    }, LONG_PRESS_MS);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>): void {
    if (longPressTimer.current === undefined) return;
    const dx = e.clientX - pressStart.current.x;
    const dy = e.clientY - pressStart.current.y;
    if (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD) {
      clearTimer();
    }
  }

  function onTap(id: number): void {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    if (id !== activeTopicID) {
      onSelect(id);
      return;
    }
    // Активный таб. В режиме «путь в табе» вход в папку расширяет его —
    // повторный тап открывает шторку папок (замена строки-крошки).
    if (pathInTab && activeFolderID !== null) {
      onOpenFolders?.();
    }
  }

  if (topics.length === 0) return null;

  return (
    <div
      ref={islandRef}
      className="island-glass no-scrollbar pointer-events-auto relative mx-auto flex w-full max-w-md items-center gap-1 overflow-x-auto rounded-full px-1.5 py-1.5"
      role="tablist"
    >
      {/* Капсула-подсветка: единый акцентный фон позади табов, едет между
          ними при переключении и за пальцем при свайпе контента (dragPos). */}
      {pillState !== null && (
        <div
          className="island-pill pointer-events-none absolute z-0 rounded-full bg-accent-strong"
          style={{
            left: `${pillState.left}px`,
            top: `${pillState.top}px`,
            width: `${pillState.width}px`,
            height: `${pillState.height}px`,
          }}
          aria-hidden="true"
        ></div>
      )}
      {topics.map((topic, index) => {
        // Активность — по фактическому активному топику либо по тому, куда
        // едет свайпер после отпускания (pendingTopicID). Текст красится по
        // положению капсулы (whites): белый под ней, цвет контента вне её.
        const active = topic.id === (pendingTopicID ?? activeTopicID);
        const extended =
          active && pathInTab && activeFolderID !== null && chainNames.length > 0;
        const w = whites[index] ?? 0;
        return (
          <button
            key={topic.id}
            type="button"
            role="tab"
            data-topic-id={topic.id}
            aria-selected={active}
            title={extended ? `${topic.name} › ${chainNames.join(' › ')}` : topic.name}
            className={`relative z-10 flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm ${
              extended ? 'max-w-full' : ''
            } ${w >= 1 ? 'text-white' : 'text-content'}`}
            style={{ color: w > 0 && w < 1 ? textMix(w) : undefined }}
            onPointerDown={(e) => handlePointerDown(topic.id, e)}
            onPointerUp={clearTimer}
            onPointerCancel={clearTimer}
            onPointerLeave={clearTimer}
            onPointerMove={handlePointerMove}
            onClick={() => onTap(topic.id)}
          >
            {extended ? (
              /* Активный таб в папке: обычная акцентная таблетка, ширина — по
                 тексту пути. Длинный путь ужимается до влезающего: корень
                 (имя топика) и активная папка всегда видны, средние сегменты
                 прячутся за «…»; полный путь — в title и в шторке папок. */
              <CrumbPath
                segments={[topic.name, ...chainNames]}
                firstClass="font-semibold"
                restClass="text-white/75"
              />
            ) : (
              <>
                <span className="max-w-36 truncate">{topic.name}</span>
                {topic.note_count > 0 && (
                  <span className="shrink-0 text-xs opacity-70">{topic.note_count}</span>
                )}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
