// Хлебная цепочка с «ужиманием до влезающего»: полный путь показывается
// целиком, пока влезает в ширину контейнера; если места не хватает —
// средние сегменты отбрасываются по одному (от корня к активному концу),
// остаются «Корень › … › Активная папка»; в крайнем случае (не влезает и
// корень с активной) активный сегмент получает собственное многоточие.
// Полный путь всегда доступен: у родителя в title.
import { useEffect, useRef, useState } from 'react';

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

export function CrumbPath({
  segments,
  firstClass = '',
  restClass = '',
  containerClass = '',
}: CrumbPathProps) {
  const el = useRef<HTMLSpanElement>(null);
  // Сколько средних сегментов скрыто за «…» (убираем от корня к концу).
  const [drops, setDrops] = useState(0);
  // Крайний случай: не влезает даже «корень › … › активный» — активный
  // сегмент ужимается с собственным многоточием (truncate).
  const [clipLast, setClipLast] = useState(false);

  // Новый путь — начинаем с полного и ужимаем до влезающего.
  const lastSegments = useRef<string[] | undefined>(undefined);
  useEffect(() => {
    if (lastSegments.current !== segments) {
      lastSegments.current = segments;
      setDrops(0);
      setClipLast(false);
    }
  }, [segments]);

  // Проверка переполнения после отрисовки: пока текст шире контейнера,
  // прячем по одному среднему сегменту за кадр. Измерение — реальным DOM
  // (scrollWidth против clientWidth), поэтому точно, без canvas-приближений.
  useEffect(() => {
    const node = el.current;
    if (node === null) return;
    const maxDrops = Math.max(0, segments.length - 2);
    const current = drops;
    const id = requestAnimationFrame(() => {
      if (node.scrollWidth <= node.clientWidth + 1) return;
      if (current < maxDrops) {
        setDrops(current + 1);
      } else {
        setClipLast(true);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [segments, drops]);

  // Оставшиеся после ужимания сегменты (без первого): средние + активный.
  const tail = segments.slice(1 + drops);
  const middles = tail.slice(0, Math.max(0, tail.length - 1));
  const last = tail[tail.length - 1];
  const showEllipsis = drops > 0;

  return (
    <span ref={el} className={`flex min-w-0 items-baseline overflow-hidden ${containerClass}`}>
      <span className={`shrink-0 whitespace-nowrap ${firstClass}`}>{segments[0]}</span>
      {showEllipsis && <span className={`shrink-0 whitespace-nowrap ${restClass}`}> › …</span>}
      {middles.map((seg) => (
        <span key={seg} className={`shrink-0 whitespace-nowrap ${restClass}`}>
          {' '}
          › {seg}
        </span>
      ))}
      {last !== undefined && (
        <span
          className={`${clipLast ? 'min-w-0 truncate' : 'shrink-0 whitespace-nowrap'} ${restClass}`}
        >
          {' '}
          › {last}
        </span>
      )}
    </span>
  );
}
