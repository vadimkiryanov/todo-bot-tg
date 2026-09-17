// Модалка создания топика: открывается из разных мест (меню топика в шторке,
// дропдаун долгого нажатия на строке контекста, кнопка «Создать» на пустом
// экране) — флаг в ui-сторе, форма одна.
// Поле и кнопки — из @telegram-apps/telegram-ui: заливка Input по умолчанию
// (--tgui--bg_color) совпадает с фоном шторки, поэтому возвращаем фону наших
// полей bg-muted!; высота 48 px библиотечная. Кнопкам h-11! возвращает
// тач-цель 44 px (size m = 42 px), loading показывает спиннер сам.
import { useEffect, useRef, useState } from 'react';
import { Button, Input } from '@telegram-apps/telegram-ui';

import { createTopic } from '../stores/topics';
import { useUiStore } from '../stores/ui';

import { Modal } from './Modal';

export function CreateTopicModal() {
  const topicCreateOpen = useUiStore((s) => s.topicCreateOpen);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Автофокус в инпут при открытии формы (autofocus-атрибут в Safari/повторном
  // открытии не срабатывает). Подъём шторки над клавиатурой — в Modal.
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!topicCreateOpen) return;
    input.current?.focus();
  }, [topicCreateOpen]);

  function close(): void {
    useUiStore.setState({ topicCreateOpen: false });
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
      await createTopic(value);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка');
    } finally {
      setBusy(false);
    }
  }

  if (!topicCreateOpen) return null;

  return (
    <Modal open onClose={close}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 className="text-lg font-semibold">Новый топик</h2>
        <Input
          ref={input}
          type="text"
          value={name}
          placeholder="Название"
          maxLength={64}
          onChange={(e) => setName(e.target.value)}
          className="bg-muted!"
        />
        {error !== '' && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" mode="outline" className="h-11! flex-1" onClick={close}>
            Отмена
          </Button>
          <Button
            type="submit"
            mode="filled"
            className="h-11! flex-1 disabled:opacity-50"
            disabled={busy}
            loading={busy}
          >
            Создать
          </Button>
        </div>
      </form>
    </Modal>
  );
}
