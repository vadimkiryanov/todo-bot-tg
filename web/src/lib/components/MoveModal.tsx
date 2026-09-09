// Перемещение заметки в топик/папку (как «Перенос в другой топик» в боте):
// выбор топика чипами, под ним — дерево папок выбранного топика. Папки
// «чужих» топиков грузятся через getTopicFolders (кеш/запрос) и НЕ пишут
// в foldersStore — список на экране под модалкой не меняется. Текущее
// место заметки помечено «здесь» и недоступно; «Корень» — если заметка
// не в корне выбранного топика.
import { useEffect, useMemo, useState } from 'react';

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
              className={`flex h-9 min-w-0 items-center gap-1.5 rounded-full px-3 text-sm transition-[background-color,transform] active:scale-[0.97] ${
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
          <>
            {/* Корень выбранного топика */}
            <button
              type="button"
              className={`flex h-11 items-center rounded-xl px-2 text-base ${
                hereRoot ? 'cursor-default text-muted-foreground' : 'active:bg-border/50'
              }`}
              disabled={busy || hereRoot}
              onClick={() => {
                void doMove(null);
              }}
            >
              <span className="w-7 shrink-0 text-center">📂</span> Корень
              {hereRoot && <span className="ml-auto text-sm text-muted-foreground">здесь</span>}
            </button>

            {tree.map(({ folder, depth }) => {
              const active = inSelectedTopic && note.folder_id === folder.id;
              return (
                <button
                  key={folder.id}
                  type="button"
                  className={`flex h-11 items-center rounded-xl px-2 text-base ${
                    active ? 'cursor-default text-muted-foreground' : 'active:bg-border/50'
                  }`}
                  style={{ paddingLeft: `${0.5 + depth * 1.25}rem` }}
                  disabled={busy || active}
                  onClick={() => {
                    void doMove(folder.id);
                  }}
                >
                  <span className="w-7 shrink-0 text-center">📁</span>
                  <span className="truncate">{folder.name}</span>
                  {active && <span className="ml-auto text-sm text-muted-foreground">здесь</span>}
                </button>
              );
            })}
          </>
        )}

        <button
          type="button"
          className="mt-1 h-11 rounded-xl border border-border text-sm"
          onClick={onClose}
        >
          Отмена
        </button>
      </div>
    </Modal>
  );
}
