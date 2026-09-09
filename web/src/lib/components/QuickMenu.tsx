// Компактный дропдаун-меню действий: позиционируется fixed около точки
// долгого нажатия; если снизу мало места — над ней. Закрывается по тапу
// вне или Escape; пока меню открыто, скролл списка заморожен (уход пальца
// или скролл-жест не закрывают меню).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { lockScroll, unlockScroll } from '../utils/scroll';

export interface QuickMenuItem {
  emoji?: string;
  label: string;
  danger?: boolean;
  action: () => void;
}

interface QuickMenuProps {
  x: number;
  y: number;
  items: QuickMenuItem[];
  onClose: () => void;
}

const WIDTH = 224; // w-56
const MARGIN = 8;

export function QuickMenu({ x, y, items, onClose }: QuickMenuProps) {
  const menuEl = useRef<HTMLDivElement>(null);
  const [openUp, setOpenUp] = useState(false);

  // Горизонталь не выходит за экран: держим отступ MARGIN от краёв.
  const left = Math.max(MARGIN, Math.min(x, window.innerWidth - WIDTH - MARGIN));

  // Escape слушаем один раз на время жизни меню — onClose держим в ref,
  // чтобы не переподписываться при каждом ре-рендере родителя.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // «Открыть вверх?» — если снизу меньше места, чем высота меню. Измеряем
  // реальный offsetHeight уже вставленного в DOM элемента (useLayoutEffect —
  // до отрисовки, без мигания позиции).
  useLayoutEffect(() => {
    const node = menuEl.current;
    if (node === null) return;
    const below = window.innerHeight - y - MARGIN;
    setOpenUp(node.offsetHeight > below);
  }, [y]);

  // Пока меню открыто, скролл списка заморожен (уход пальца или скролл-жест
  // не закрывают меню). Escape — закрыть.
  useEffect(() => {
    lockScroll();
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKeydown);
    return () => {
      unlockScroll();
      window.removeEventListener('keydown', onKeydown);
    };
  }, []);

  function pick(item: QuickMenuItem): void {
    onClose();
    item.action();
  }

  return (
    <>
      <div
        className="backdrop-glass backdrop-anim pointer-events-auto fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      ></div>
      <div
        ref={menuEl}
        className="glass-menu menu-anim pointer-events-auto fixed z-50 flex w-56 flex-col gap-1 rounded-2xl p-2 shadow-xl"
        style={{
          left: `${left}px`,
          top: openUp ? undefined : `${y + MARGIN}px`,
          bottom: openUp ? `${Math.max(MARGIN, window.innerHeight - y + MARGIN)}px` : undefined,
        }}
        role="menu"
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={`flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[15px] transition-colors active:bg-border/50 ${
              item.danger === true ? 'text-destructive' : ''
            }`}
            onClick={() => pick(item)}
          >
            {item.emoji !== undefined && (
              <span className="w-6 shrink-0 text-center text-base">{item.emoji}</span>
            )}
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}
