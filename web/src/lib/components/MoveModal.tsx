// Перемещение заметки в топик/папку (как «Перенос в другой топик» в боте):
// выбор топика чипами, под ним — дерево папок выбранного топика. Папки
// «чужих» топиков грузятся через getTopicFolders (кеш/запрос) и НЕ пишут
// в foldersStore — список на экране под модалкой не меняется. Текущее
// место заметки помечено «здесь» и недоступно; «Корень» — если заметка
// не в корне выбранного топика.
// Дерево — плоские строки-Cell (как дерево папок в шторке, FolderBar):
// тап — перенос, вложенность — отступом ряда. Чипы топиков остаются своими:
// выбранный топик у них залит основным цветом, а у Chip из библиотеки
// состояния «выбран» нет (только elevated/mono/outline). «Отмена» внизу —
// Button библиотеки: в flex-колонке кнопка растягивается сама, h-11!
// возвращает тач-цель 44 px.
import { Button, Cell, List, Section } from '@telegram-apps/telegram-ui';
import { useEffect, useMemo, useState } from 'react';

import { FolderIcon } from './FolderIcon';
import { Modal } from './Modal';
import { Spinner } from './Spinner';
import { moveNote } from '../stores/notes';
import { getTopicFolders, peekCachedFolders } from '../stores/folders';
import { useTopicsStore } from '../stores/topics';
import type { Folder, Note } from '../types/api';

interface MoveModalProps {
  note: Note;
  /** Слой поверх текущего экрана (см. Modal.z). */
  z?: string;
  onClose: () => void;
}

export function MoveModal({ note, z, onClose }: MoveModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Топик назначения: стартуем с топика заметки — папки показываются сразу
  // из кеша, переключаться на другие топики не нужно для «просто в папку».
  const [selectedTopicId, setSelectedTopicId] = useState(note.topic_id);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);

  const topics = useTopicsStore((s) => s.topics);

  // Папки выбранного топика: кеш показываем сразу, свежесть догружаем
  // (getTopicFolders). При быстром переключении топиков ответ старого
  // запроса отменяется флагом (cancelled) — папки не «перескакивают».
  useEffect(() => {
    const topicId = selectedTopicId;
    const cached = peekCachedFolders(topicId);
    setFolders(cached ?? []);
    setFoldersLoading(cached === undefined);
    setError('');
    let cancelled = false;
    void getTopicFolders(topicId)
      .then((fs) => {
        if (cancelled) return;
        setFolders(fs);
        setFoldersLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setFoldersLoading(false);
        setError(e instanceof Error ? e.message : 'не удалось загрузить папки');
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTopicId]);

  /** Заметка сейчас в выбранном топике — для пометок «здесь». */
  const inSelectedTopic = selectedTopicId === note.topic_id;

  // Дерево папок выбранного топика плоским списком с глубиной: корневые
  // (depth 0) → подпапки (depth 1)…
  const tree = useMemo(() => {
    const depth = new Map<number, number>();
    for (const f of folders) {
      if (f.parent_folder_id === null) depth.set(f.id, 0);
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of folders) {
        if (depth.has(f.id)) continue;
        const parentDepth =
          f.parent_folder_id === null ? undefined : depth.get(f.parent_folder_id);
        if (parentDepth !== undefined) {
          depth.set(f.id, parentDepth + 1);
          changed = true;
        }
      }
    }
    return folders
      .map((f) => ({ folder: f, depth: depth.get(f.id) ?? 0 }))
      .sort((a, b) => a.depth - b.depth || a.folder.id - b.folder.id);
  }, [folders]);

  const hereRoot = inSelectedTopic && note.folder_id === null;

  async function doMove(folderId: number | null): Promise<void> {
    setBusy(true);
    setError('');
    try {
      await moveNote(note, selectedTopicId, folderId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} z={z}>
      <div className="flex flex-col gap-2">
        <h2 className="px-2 pb-1 pt-1 text-lg font-semibold">Переместить</h2>
        {error !== '' && <p className="px-2 pb-1 text-sm text-destructive">{error}</p>}

        {/* Топик назначения: чипы (стиль шторки «Топики»), выбранный подсвечен.
            Клик по уже выбранному — без действия (папки и так его). */}
        <div className="flex flex-wrap gap-1.5 px-1">
          {topics.map((topic) => (
            <button
              key={topic.id}
              type="button"
              className={`flex h-9 min-w-0 items-center gap-1.5 rounded-full px-3 text-sm btn-press-soft ${
                topic.id === selectedTopicId ? 'bg-primary text-white' : 'bg-muted text-foreground'
              }`}
              disabled={busy}
              onClick={() => setSelectedTopicId(topic.id)}
            >
              <span className="truncate">{topic.name}</span>
              {topic.id === selectedTopicId && topic.note_count > 0 && (
                <span className="shrink-0 text-xs opacity-60">{topic.note_count}</span>
              )}
            </button>
          ))}
        </div>

        {foldersLoading ? (
          <div className="flex h-20 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          // px-0! — снимаем собственные отступы List (10px 18px на iOS):
          // горизонтальные отступы задаёт шторка (как в дереве папок).
          // Строки помечены иконкой папки: в списке только папки, но иконка
          // отличает их от строк заметок в остальных шторках и метит «Корень»
          // как уровень топика.
          <List className="px-0!">
            <Section>
              {/* Корень выбранного топика */}
              <Cell
                Component="button"
                type="button"
                // w-full обязателен: <button> в Chromium схлопывается по
                // содержимому — пометка «здесь» встала бы сразу за подписью.
                className={`w-full select-none text-left btn-press-soft ${
                  hereRoot ? 'text-muted-foreground' : ''
                }`}
                disabled={busy || hereRoot}
                after={
                  hereRoot ? (
                    <span className="text-sm text-muted-foreground">здесь</span>
                  ) : undefined
                }
                onClick={() => {
                  void doMove(null);
                }}
              >
                <span className="flex min-w-0 items-center gap-2 text-[15px] leading-6">
                  <span className="shrink-0 text-muted-foreground">
                    <FolderIcon />
                  </span>
                  <span className="truncate">Корень</span>
                </span>
              </Cell>

              {tree.map(({ folder, depth }) => {
                const active = inSelectedTopic && note.folder_id === folder.id;
                return (
                  <Cell
                    key={folder.id}
                    Component="button"
                    type="button"
                    className={`w-full select-none text-left btn-press-soft ${
                      active ? 'text-muted-foreground' : ''
                    }`}
                    // Вложенность — отступом всего ряда, как в дереве шторки.
                    style={depth > 0 ? { paddingLeft: `${16 + depth * 16}px` } : undefined}
                    disabled={busy || active}
                    after={
                      active ? (
                        <span className="text-sm text-muted-foreground">здесь</span>
                      ) : undefined
                    }
                    onClick={() => {
                      void doMove(folder.id);
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-2 text-[15px] leading-6">
                      <span className="shrink-0 text-muted-foreground">
                        <FolderIcon />
                      </span>
                      <span className="truncate">{folder.name}</span>
                    </span>
                  </Cell>
                );
              })}
            </Section>
          </List>
        )}

        <Button type="button" mode="outline" className="mt-1 h-11!" onClick={onClose}>
          Отмена
        </Button>
      </div>
    </Modal>
  );
}
