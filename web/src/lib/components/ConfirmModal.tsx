// Подтверждение необратимого действия (удаление): заголовок, описание,
// кнопки «Отмена» / опасное действие. Открывается поверх текущего экрана.
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
          {text !== undefined && <p className="mt-1 text-sm text-muted">{text}</p>}
        </div>
        {error !== '' && <p className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            className="h-11 flex-1 rounded-xl border border-border text-sm disabled:opacity-50"
            disabled={busy}
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            type="button"
            className="h-11 flex-1 rounded-xl bg-danger text-sm font-medium text-white disabled:opacity-50"
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
