// Хлебная цепочка с «ужиманием до влезающего»: полный путь показывается
// целиком, пока влезает в ширину контейнера; если места не хватает —
// средние сегменты отбрасываются по одному (от корня к активному концу),
// остаются «Корень › … › Активная папка»; в крайнем случае (не влезает и
// корень с активной) активный сегмент получает собственное многоточие.
// Полный путь всегда доступен: у родителя в title.
//
// Ужатие вычисляется ДО покраски: рядом с видимым рядом всегда живёт
// скрытый измеритель с полным путём (absolute + invisible — в поток не
// влияет), ширины его сегментов читаются в useLayoutEffect, и состояние
// ужатия применяется в том же кадре. Пользователь видит сразу конечный
// (ужатый) вид, без промежуточных кадров полного пути. Прежняя схема —
// сброс после отрисовки + пошаговое ужатие по requestAnimationFrame —
// «схлопывала» путь на глазах (мерцание от большего к многоточию).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface CrumbPathProps {
  /** Сегменты пути от корня к активному (последний — активный). */
  segments: string[];
  /** Классы первого сегмента (напр. font-semibold — имя топика). */
  firstClass?: string;
  /** Классы остальных сегментов и разделителей. */
  restClass?: string;
  /** Доп. классы корневого контейнера (flex-1 в строке-крошке). */
  containerClass?: string;
}

/** Состояние ужатия: сколько средних сегментов скрыто за «…» и ужат ли
    активный сегмент (truncate). */
interface Fit {
  drops: number;
  clipLast: boolean;
}

const FULL_FIT: Fit = { drops: 0, clipLast: false };

export function CrumbPath({
  segments,
  firstClass = '',
  restClass = '',
  containerClass = '',
}: CrumbPathProps) {
  const el = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState<Fit>(FULL_FIT);
  // Актуальное (применённое в DOM) состояние — чтобы не ставить то же самое.
  const fitRef = useRef<Fit>(FULL_FIT);

  // Ключ пути — по содержимому, а не по ссылке: родители (островок топиков)
  // пересоздают массив segments на каждом своём рендере (анимация капсулы,
  // пересборка геометрии), и пересчёт по ссылке на неизменном пути превращал
  // ужатие в цикл «ужал → сбросил → ужал», из-за чего «…» пульсировало
  // при переходах в папку. NUL в именах папок не встречается.
  const pathKey = segments.join('\u0000');
  const lastKey = useRef<string | undefined>(undefined);

  /** Пересчитать ужатие по текущей ширине контейнера и сегментам измерителя.
      Точное измерение реальным DOM: offsetWidth сегментов против clientWidth
      контейнера, без canvas-приближений. */
  function refit(): void {
    const node = el.current;
    if (node === null) return;
    const segSpans = node.querySelectorAll<HTMLElement>('span[data-crumb-seg]');
    const ellipsis = node.querySelector<HTMLElement>('span[data-crumb-ellipsis]');
    if (segSpans.length !== segments.length || ellipsis === null) return;

    const n = segments.length;
    const widths: number[] = [];
    for (const span of segSpans) widths.push(span.offsetWidth);
    const ellipsisW = ellipsis.offsetWidth;
    const avail = node.clientWidth;

    // Ширина видимого ряда при drops=k: первый сегмент + «…» (если k>0) +
    // хвост сегментов (средние с разделителем) + активный. Ширины измерителя
    // совпадают с видимыми: тот же текст и классы, flex без зазоров.
    const widthAt = (k: number): number => {
      let total = widths[0] + widths[n - 1];
      if (k > 0) total += ellipsisW;
      for (let i = 1 + k; i < n - 1; i++) total += widths[i];
      return total;
    };

    const maxDrops = Math.max(0, n - 2);
    let drops = 0;
    let clipLast = false;
    if (n > 1 && widthAt(0) > avail + 1) {
      // Ищем наименьшее число скрытых сегментов, при котором путь влезает.
      for (let k = 1; k <= maxDrops; k++) {
        if (widthAt(k) <= avail + 1) {
          drops = k;
          break;
        }
      }
      if (drops === 0) {
        // Не влезает даже «первый › … › активный» — ужимаем активный сегмент.
        drops = maxDrops;
        clipLast = true;
      }
    }

    const next: Fit = { drops, clipLast };
    if (next.drops !== fitRef.current.drops || next.clipLast !== fitRef.current.clipLast) {
      fitRef.current = next;
      setFit(next);
    }
  }

  // Новый путь — пересчитываем ужатие до покраски (useLayoutEffect работает
  // после изменения DOM, но до того, как браузер нарисует кадр; setState
  // внутри React применяет синхронно). Измеритель на этом рендере уже
  // содержит сегменты нового пути — промежуточных кадров не нужно.
  useLayoutEffect(() => {
    if (lastKey.current === pathKey) return;
    lastKey.current = pathKey;
    fitRef.current = FULL_FIT;
    refit();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- пересчёт только при смене пути
  }, [pathKey]);

  // Следим за шириной контейнера (ресайз окна, пересборка островка): при
  // изменении ужатие пересчитывается (появилось место — путь разворачивается).
  const refitRef = useRef(refit);
  refitRef.current = refit;
  useEffect(() => {
    const node = el.current;
    if (node === null) return;
    const ro = new ResizeObserver(() => refitRef.current());
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const { drops, clipLast } = fit;

  // Оставшиеся после ужимания сегменты (без первого): средние + активный.
  const tail = segments.slice(1 + drops);
  const middles = tail.slice(0, Math.max(0, tail.length - 1));
  const last = tail[tail.length - 1];
  const showEllipsis = drops > 0;

  return (
    <span
      ref={el}
      className={`relative flex min-w-0 items-baseline overflow-hidden ${containerClass}`}
    >
      {/* Скрытый измеритель: всегда полный путь. invisible сохраняет раскладку
          (offsetWidth читается), absolute не влияет на ширину контейнера,
          pointer-events-none + aria-hidden — невидим для пользователя. Текст
          и классы каждого сегмента повторяют видимый ряд байт в байт. */}
      <span
        aria-hidden="true"
        className="invisible pointer-events-none absolute left-0 top-0 flex items-baseline whitespace-nowrap"
      >
        {segments.map((seg, i) => (
          <span
            key={i}
            data-crumb-seg
            className={`whitespace-nowrap ${i === 0 ? firstClass : restClass}`}
          >
            {i === 0 ? seg : ` › ${seg}`}
          </span>
        ))}
        {segments.length > 1 && (
          <span data-crumb-ellipsis className={`whitespace-nowrap ${restClass}`}>
            {' '}› …
          </span>
        )}
      </span>

      {/* Видимый ряд: полный путь либо ужатый (решение — в fit). */}
      <span className="flex min-w-0 items-baseline">
        <span className={`shrink-0 whitespace-nowrap ${firstClass}`}>{segments[0]}</span>
        {showEllipsis && <span className={`shrink-0 whitespace-nowrap ${restClass}`}> › …</span>}
        {middles.map((seg) => (
          <span key={seg} className={`shrink-0 whitespace-nowrap ${restClass}`}>
            {' '}› {seg}
          </span>
        ))}
        {last !== undefined && (
          <span
            className={`${clipLast ? 'min-w-0 truncate' : 'shrink-0 whitespace-nowrap'} ${restClass}`}
          >
            {' '}› {last}
          </span>
        )}
      </span>
    </span>
  );
}
