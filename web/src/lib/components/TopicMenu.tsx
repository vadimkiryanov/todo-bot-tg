// Меню топика (шторка): пункты «Создать топик», «Закрепить/Открепить»,
// «Переименовать», «Удалить» — плоские строки-Cell (MenuRow) на компонентах
// @telegram-apps/telegram-ui, как в списках и шторках приложения.
// Форма переименования и «Отмена» — тоже библиотечные Button/Input
// (Input с bg-muted!: библиотечная заливка совпадает с фоном шторки).
// «Отмена» под списком лежит в блочном div, а не в flex-колонке, поэтому
// w-full у неё обязателен: <button> схлопывается по содержимому.
// Открывается долгим нажатием по табу топика — в островке и в сетке шторки
// топиков. Общее для всех мест (состояние открытого топика — в сторе topicMenu).
import { useState } from 'react';
import type * as React from 'react';
import { Button, Input, List, Section } from '@telegram-apps/telegram-ui';
import { Icon16Cancel } from '@telegram-apps/telegram-ui/dist/icons/16/cancel';
import { Icon28AddCircle } from '@telegram-apps/telegram-ui/dist/icons/28/add_circle';
import { Icon28Edit } from '@telegram-apps/telegram-ui/dist/icons/28/edit';

import { ConfirmModal } from './ConfirmModal';
import { MenuRow } from './MenuRow';
import { Modal } from './Modal';
import { closeTopicMenu, useTopicMenuStore } from '../stores/topic-menu';
import { deleteTopic, renameTopic, setTopicPinned } from '../stores/topics';
import { useUiStore } from '../stores/ui';

export function TopicMenu() {
  const topic = useTopicMenuStore((s) => s.topic);

  const [renameMode, setRenameMode] = useState(false);
  const [renameName, setRenameName] = useState('');

  const [showDelete, setShowDelete] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [renameError, setRenameError] = useState('');
  const [pinError, setPinError] = useState('');
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
    setPinError('');
  }

  /** Закреп/открепление (быстрый топик бота): меню закрывается по успеху,
      ошибку показываем инлайном (и тостом из стора). */
  async function togglePin(): Promise<void> {
    const current = topic;
    if (current === null) return;
    setBusy(true);
    setPinError('');
    try {
      await setTopicPinned(current.id, !current.pinned);
      close();
    } catch (e) {
      setPinError(e instanceof Error ? e.message : 'ошибка');
    } finally {
      setBusy(false);
    }
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
            <Input
              type="text"
              value={renameName}
              onChange={onRenameInput}
              maxLength={64}
              className="bg-muted! input-press"
              autoFocus
            />
            {renameError !== '' && <p className="text-sm text-destructive">{renameError}</p>}
            <div className="flex gap-2">
              <Button
                type="button"
                mode="outline"
                className="h-11! flex-1 btn-press-wide"
                onClick={() => {
                  setRenameMode(false);
                  setRenameError('');
                }}
              >
                Назад
              </Button>
              <Button
                type="submit"
                mode="filled"
                className="h-11! flex-1 disabled:opacity-50 btn-press-wide"
                disabled={busy}
              >
                Сохранить
              </Button>
            </div>
          </form>
        ) : (
          <div role="menu">
            <h2 className="px-2 pb-2 text-lg font-semibold">{topic.name}</h2>
            {pinError !== '' && <p className="px-2 pb-2 text-sm text-destructive">{pinError}</p>}
            {/* Пункты — плоские строки-Cell (MenuRow); «Отмена» остаётся
                отдельной кнопкой под списком. */}
            <List className="px-0! py-0!">
              <Section>
                <MenuRow
                  icon={<Icon28AddCircle />}
                  onSelect={() => {
                    close();
                    useUiStore.setState({ topicCreateOpen: true });
                  }}
                >
                  Создать топик
                </MenuRow>
                <MenuRow
                  disabled={busy}
                  onSelect={() => {
                    void togglePin();
                  }}
                >
                  {topic.pinned ? 'Открепить' : 'Закрепить'}
                </MenuRow>
                <MenuRow icon={<Icon28Edit />} onSelect={openRename}>
                  Переименовать
                </MenuRow>
                <MenuRow
                  icon={<Icon16Cancel className="h-5 w-5" />}
                  danger
                  onSelect={() => {
                    setDeleteError('');
                    setShowDelete(true);
                  }}
                >
                  Удалить
                </MenuRow>
              </Section>
            </List>
            <Button type="button" mode="outline" className="mt-2 h-11! w-full btn-press-wide" onClick={close}>
              Отмена
            </Button>
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
