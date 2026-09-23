// Компактный дропдаун-меню действий: позиционируется fixed около точки
// долгого нажатия; если снизу мало места — над ней. Закрывается по тапу
// вне или Escape; пока меню открыто, скролл списка заморожен (уход пальца
// или скролл-жест не закрывают меню). Пункты — плоские строки-Cell на
// компонентах @telegram-apps/telegram-ui (MenuRow): своим у меню остаётся
// только «стекло», позиция и анимация.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { List, Section } from '@telegram-apps/telegram-ui';

import { MenuRow } from './MenuRow';
import { useCloseAnim } from '../utils/closeAnim';
import { lockScroll, unlockScroll } from '../utils/scroll';

export interface QuickMenuItem {
  /** Иконка библиотеки слева от подписи; нет — строка без метки. */
  icon?: ReactNode;
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

  // Уход — обратной анимацией (меню «сжимается» на месте, подложка гаснет):
  // без неё меню исчезало рывком, хотя появлялось плавно.
  const { closing, requestClose } = useCloseAnim(onClose);

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
  // не закрывают меню). Escape — закрыть (requestClose неизменна, поэтому
  // подписка одна на всё время жизни меню).
  useEffect(() => {
    lockScroll();
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKeydown);
    return () => {
      unlockScroll();
      window.removeEventListener('keydown', onKeydown);
    };
  }, [requestClose]);

  function pick(item: QuickMenuItem): void {
    requestClose();
    item.action();
  }

  return (
    <>
      <div
        className={`backdrop-glass pointer-events-auto fixed inset-0 z-40 bg-black/40 ${
          closing ? 'backdrop-out' : 'backdrop-anim'
        }`}
        onClick={requestClose}
        aria-hidden="true"
      ></div>
      <div
        ref={menuEl}
        className={`glass-menu pointer-events-auto fixed z-50 w-56 rounded-2xl p-2 shadow-xl ${
          closing ? 'menu-out' : 'menu-anim'
        }`}
        style={{
          left: `${left}px`,
          top: openUp ? undefined : `${y + MARGIN}px`,
          bottom: openUp ? `${Math.max(MARGIN, window.innerHeight - y + MARGIN)}px` : undefined,
        }}
        role="menu"
      >
        {/* px-0! py-0! — снимаем собственные отступы List (10px 18px): поля
            меню и отступы строк задаёт карточка-секция. */}
        <List className="px-0! py-0!">
          <Section>
            {items.map((item) => (
              <MenuRow
                key={item.label}
                icon={item.icon}
                danger={item.danger === true}
                onSelect={() => pick(item)}
              >
                {item.label}
              </MenuRow>
            ))}
          </Section>
        </List>
      </div>
    </>
  );
}
