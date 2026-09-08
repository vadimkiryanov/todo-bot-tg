// Модалка-«шторка» снизу (на десктопе — центрированный диалог). Закрытие
// с анимацией: сначала проигрываются обратные классы (.backdrop-out/.sheet-out),
// и только потом зовётся onClose — родитель размонтирует шторку уже невидимой.
import { useEffect, useRef, useState, type ReactNode } from 'react';

interface ModalProps {
  open?: boolean;
  onClose?: () => void;
  children?: ReactNode;
  /** Tailwind-класс слоя: модалка поверх страницы заметки (z-[70]) и её
      меню (z-[72]) получает z-[80], остальные — стандартный z-50. */
  z?: string;
}

export function Modal({ open = false, onClose, children, z = 'z-50' }: ModalProps) {
  const [closing, setClosing] = useState(false);
  // window.setTimeout (DOM) возвращает number; ReturnType<typeof setTimeout>
  // из-за @types/node резолвился бы в NodeJS.Timeout — отсюда явный тип.
  const closeTimer = useRef<number | undefined>(undefined);

  // Мобильная клавиатура перекрывает низ экрана (iOS не сжимает вьюпорт,
  // в отличие от Android): следим за visualViewport и поднимаем шторку
  // над клавиатурой — отступ снизу + ограничение высоты. Без этого инпуты
  // (создание/переименование, напоминание) оказываются под клавиатурой.
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [visualHeight, setVisualHeight] = useState(0);

  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = (): void => {
      // На Android высота вьюпорта уже сжимается клавиатурой — разница ≈ 0.
      setKeyboardInset(Math.max(0, window.innerHeight - vv.height));
      setVisualHeight(vv.height);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [open]);

  // Таймер закрытия не должен сработать после размонтирования модалки.
  useEffect(
    () => () => {
      if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  function requestClose(): void {
    if (closing) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      setClosing(false);
      onClose?.();
    }, 180);
  }

  function onKeydown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      requestClose();
    }
  }

  if (!open) return null;

  return (
    <div
      className={`backdrop-glass fixed inset-0 ${z} flex items-end justify-center bg-black/40 sm:items-center ${
        closing ? 'backdrop-out' : 'backdrop-anim'
      }`}
      style={{ paddingBottom: keyboardInset }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      onKeyDown={onKeydown}
      role="presentation"
    >
      <div
        className={`glass-sheet max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl p-4 shadow-xl sm:rounded-2xl ${
          closing ? 'sheet-out' : 'sheet-anim'
        }`}
        style={keyboardInset > 0 ? { maxHeight: visualHeight } : undefined}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}
