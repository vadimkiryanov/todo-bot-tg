// Подтверждение необратимого действия (удаление): заголовок, описание,
// кнопки «Отмена» / опасное действие. Открывается поверх текущего экрана.
// Кнопки — Button библиотеки: акцент и нейтраль берутся из наших токенов
// (--tg-theme-button-color / --tgui--plain_foreground), опасное действие
// перекрашиваем в наш destructive. h-11! возвращает инвариант тач-цели 44 px
// (size m = 42 px), disabled:opacity-50 — своего вида у disabled нет.
import { Button } from '@telegram-apps/telegram-ui';

import { Modal } from './Modal';

interface ConfirmModalProps {
  title: string;
  text?: string;
  confirmText?: string;
  busy?: boolean;
  error?: string;
  /** Слой поверх текущего экрана (см. Modal.z). */
  z?: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function ConfirmModal({
  title,
  text,
  confirmText = 'Удалить',
  busy = false,
  error = '',
  z,
  onClose,
  onConfirm,
}: ConfirmModalProps) {
  return (
    <Modal open onClose={onClose} z={z}>
      <div className="flex flex-col gap-4 px-1 py-2">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {text !== undefined && <p className="mt-1 text-sm text-muted-foreground">{text}</p>}
        </div>
        {error !== '' && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button
            type="button"
            mode="outline"
            className="h-11! flex-1 disabled:opacity-50"
            disabled={busy}
            onClick={onClose}
          >
            Отмена
          </Button>
          <Button
            type="button"
            mode="filled"
            className="h-11! flex-1 bg-destructive! text-white! disabled:opacity-50"
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
