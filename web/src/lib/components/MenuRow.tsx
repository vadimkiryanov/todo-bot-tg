// Строка меню действий на компонентах @telegram-apps/telegram-ui: плоская
// строка-Cell в карточке-секции — как строки списков и шторок приложения.
// Иконка/маркер слева слотом `before` (своя колонка — подписи строк выровнены;
// слот есть у всех строк, даже когда иконки нет), счётчик непрочитанных справа
// бейджем. Меню (дропдауны у карточки и шторки действий) собирают строки в
// `List`/`Section`: разделители между пунктами рисует секция, поэтому своим
// меню остаётся только рамка и анимация.
import { Badge, Cell } from '@telegram-apps/telegram-ui';
import type { ReactNode } from 'react';

interface MenuRowProps {
  /** Иконка библиотеки или короткий текст слева; пусто — строка без метки. */
  icon?: ReactNode;
  /** Число непрочитанных: 0/undefined — бейджа нет. */
  badge?: number;
  /** Красная строка (удаление). */
  danger?: boolean;
  disabled?: boolean;
  /** Действие пункта: меню закрывает себя само. */
  onSelect: () => void;
  children: ReactNode;
}

export function MenuRow({
  icon,
  badge,
  danger = false,
  disabled = false,
  onSelect,
  children,
}: MenuRowProps) {
  return (
    <Cell
      Component="button"
      type="button"
      role="menuitem"
      disabled={disabled}
      // text-destructive! — цвет строки важнее стилей библиотеки: они
      // unlayered и перебивают утилиты Tailwind из @layer utilities.
      // w-full обязателен: <button> в Chromium схлопывается по содержимому —
      // строка не заняла бы карточку, и бейдж встал бы сразу за подписью.
      className={`w-full select-none text-left btn-press-soft disabled:opacity-50${
        danger ? ' text-destructive!' : ''
      }`}
      before={<span className="flex w-6 items-center justify-center text-base">{icon}</span>}
      after={
        badge !== undefined && badge > 0 ? (
          <Badge type="number" mode="critical">
            {badge > 99 ? '99+' : badge}
          </Badge>
        ) : undefined
      }
      onClick={onSelect}
    >
      <span className="text-[15px] leading-6">{children}</span>
    </Cell>
  );
}
