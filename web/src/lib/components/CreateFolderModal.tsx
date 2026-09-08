// Модалка создания папки: открывается из дропдаунов долгого нажатия
// (заметка / пустое место) — флаг в ui-сторе, форма одна. Папка создаётся
// на текущем уровне (в активной папке или в корне топика).
import { useEffect, useRef, useState } from 'react';

import { createFolder } from '../stores/folders';
import { useUiStore } from '../stores/ui';

import { Modal } from './Modal';
import { Spinner } from './Spinner';

export function CreateFolderModal() {
  const folderCreateOpen = useUiStore((s) => s.folderCreateOpen);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Автофокус в инпут при открытии формы (autofocus-атрибут в Safari/повторном
  // открытии не срабатывает). Подъём шторки над клавиатурой — в Modal.
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!folderCreateOpen) return;
    input.current?.focus();
  }, [folderCreateOpen]);

  function close(): void {
    useUiStore.setState({ folderCreateOpen: false });
    setName('');
    setError('');
  }

  async function submit(): Promise<void> {
    const value = name.trim();
    if (value === '') {
      setError('введите название');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await createFolder(value);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка');
    } finally {
      setBusy(false);
    }
  }

  if (!folderCreateOpen) return null;

  return (
    <Modal open onClose={close}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 className="text-lg font-semibold">Новая папка</h2>
        <input
          ref={input}
          type="text"
          value={name}
          placeholder="Название"
          maxLength={64}
          onChange={(e) => setName(e.target.value)}
          className="h-11 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent"
        />
        {error !== '' && <p className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <button type="button" className="h-11 flex-1 rounded-xl border border-border text-sm" onClick={close}>
            Отмена
          </button>
          <button
            type="submit"
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent-strong text-sm font-medium text-white disabled:opacity-50"
            disabled={busy}
          >
            {busy ? <Spinner size="16px" /> : 'Создать'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
