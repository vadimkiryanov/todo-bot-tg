// Меню топика (шторка): пункты «Создать топик», «Переименовать», «Удалить».
// Открывается долгим нажатием по табу топика — в островке и в сетке шторки
// топиков. Общее для всех мест (состояние открытого топика — в сторе topicMenu).
import { useState } from 'react';
import type * as React from 'react';

import { ConfirmModal } from './ConfirmModal';
import { Modal } from './Modal';
import { closeTopicMenu, useTopicMenuStore } from '../stores/topic-menu';
import { deleteTopic, renameTopic } from '../stores/topics';
import { useUiStore } from '../stores/ui';

export function TopicMenu() {
  const topic = useTopicMenuStore((s) => s.topic);

  const [renameMode, setRenameMode] = useState(false);
  const [renameName, setRenameName] = useState('');

  const [showDelete, setShowDelete] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [renameError, setRenameError] = useState('');
  const [busy, setBusy] = useState(false);

  function openRename(): void {
    if (topic === null) return;
    setRenameMode(true);
    setRenameName(topic.name);
    setRenameError('');
  }

  function close(): void {
    closeTopicMenu();
    setRenameMode(false);
    setRenameError('');
    setDeleteError('');
  }

  async function submitRename(): Promise<void> {
    const current = topic;
    if (current === null) return;
    const name = renameName.trim();
    if (name === '') {
      setRenameError('введите название');
      return;
    }
    setBusy(true);
    setRenameError('');
    try {
      await renameTopic(current.id, name);
      close();
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : 'ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function doDelete(): Promise<void> {
    const current = topic;
    if (current === null) return;
    setBusy(true);
    setDeleteError('');
    try {
      await deleteTopic(current.id);
      setShowDelete(false);
      close();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'ошибка');
    } finally {
      setBusy(false);
    }
  }

  function onRenameInput(e: React.ChangeEvent<HTMLInputElement>): void {
    setRenameName(e.target.value);
  }

  if (topic === null) return null;

  return (
    <>
      <Modal open onClose={close}>
        {renameMode ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submitRename();
            }}
          >
            <h2 className="text-lg font-semibold">Переименовать</h2>
            <input
              type="text"
              value={renameName}
              onChange={onRenameInput}
              maxLength={64}
              className="h-11 rounded-xl border border-border bg-muted px-4 text-base outline-none focus:border-ring"
              autoFocus
            />
            {renameError !== '' && <p className="text-sm text-destructive">{renameError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                className="h-11 flex-1 rounded-xl border border-border text-sm"
                onClick={() => {
                  setRenameMode(false);
                  setRenameError('');
                }}
              >
                Назад
              </button>
              <button
                type="submit"
                className="h-11 flex-1 rounded-xl bg-primary text-sm font-medium text-white disabled:opacity-50"
                disabled={busy}
              >
                Сохранить
              </button>
            </div>
          </form>
        ) : (
          <div className="sheet-menu flex flex-col gap-1">
            <h2 className="px-2 pb-2 pt-1 text-lg font-semibold">{topic.name}</h2>
            <button
              type="button"
              className="flex h-12 items-center gap-3 rounded-xl px-2 text-base"
              onClick={() => {
                close();
                useUiStore.setState({ topicCreateOpen: true });
              }}
            >
              <span>📚</span> Создать топик
            </button>
            <button
              type="button"
              className="flex h-12 items-center gap-3 rounded-xl px-2 text-base"
              onClick={openRename}
            >
              <span>✏️</span> Переименовать
            </button>
            <button
              type="button"
              className="flex h-12 items-center gap-3 rounded-xl px-2 text-base text-destructive"
              onClick={() => {
                setDeleteError('');
                setShowDelete(true);
              }}
            >
              <span>🗑</span> Удалить
            </button>
            <button
              type="button"
              className="mt-2 h-11 rounded-xl border border-border text-sm"
              onClick={close}
            >
              Отмена
            </button>
          </div>
        )}
      </Modal>

      {showDelete && (
        <ConfirmModal
          title="Удалить топик?"
          text="Вместе с топиком удалятся все заметки и папки"
          busy={busy}
          error={deleteError}
          onClose={() => {
            setShowDelete(false);
            setDeleteError('');
          }}
          onConfirm={() => {
            void doDelete();
          }}
        />
      )}
    </>
  );
}
