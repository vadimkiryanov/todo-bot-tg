// Полноэкранный поиск по заметкам (как в Telegram): результаты появляются по
// мере ввода (дебаунс 300 мс), пустой запрос — подсказка вместо списка.
// Режим-тогл: «В топике» — по активному топику островка (topic_id в запросе);
// «Везде» — глобально по всем топикам, результаты группируются сплиттерами
// с именем топика. Поиск не включает выполненные и архивные (сервер).
// Карточки/меню работают по объекту заметки (NoteCard/NoteMenu) — заметки
// из результатов не обязаны лежать в списках активного контекста.
import { useEffect, useRef, useState } from 'react';
import type * as React from 'react';

import { searchNotes } from '../api/notes';
import { useNavigationStore } from '../stores/navigation';
import { useTopicsStore } from '../stores/topics';
import type { Note } from '../types/api';
import { groupNotesByTopic } from '../utils/search';
import { EmptyState } from './EmptyState';
import { Loader } from './Loader';
import { NoteCard } from './NoteCard';

const DEBOUNCE_MS = 300;

/** Значение, «устоявшееся» через delayMs после последнего изменения. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

type SearchMode = 'topic' | 'global';

interface SearchPanelProps {
  onClose: () => void;
  onOpenNote: (note: Note) => void;
  onMenu: (note: Note, rect: DOMRect) => void;
}

export function SearchPanel({ onClose, onOpenNote, onMenu }: SearchPanelProps) {
  const activeTopicID = useNavigationStore((s) => s.activeTopicID);
  const topics = useTopicsStore((s) => s.topics);

  // Без активного топика (нет островка/выбора) локальный режим невозможен.
  const canScopeTopic = activeTopicID !== null;
  const [mode, setMode] = useState<SearchMode>(() => (canScopeTopic ? 'topic' : 'global'));
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Note[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  // Клавиатура сразу готова к вводу, как в Telegram.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const debouncedQuery = useDebouncedValue(query.trim(), DEBOUNCE_MS);

  useEffect(() => {
    if (debouncedQuery === '') {
      setResults(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    const topicId = mode === 'topic' ? activeTopicID : null;
    setLoading(true);
    setError(null);
    searchNotes(debouncedQuery, topicId)
      .then((notes) => {
        if (cancelled) return;
        setResults(notes);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setResults([]);
        setLoading(false);
        setError(err instanceof Error ? err.message : 'Ошибка поиска');
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, mode, activeTopicID]);

  const scopeLabel =
    activeTopicID !== null
      ? topics.find((t) => t.id === activeTopicID)?.name
      : undefined;

  let body: React.ReactNode;
  if (debouncedQuery === '') {
    body = <EmptyState emoji="🔍" text="Начните вводить — заметки появятся здесь" />;
  } else if (error !== null) {
    body = <EmptyState emoji="⚠️" text={error} />;
  } else if (results === null) {
    body = <Loader />;
  } else if (results.length === 0) {
    body = <EmptyState text="Ничего не найдено" />;
  } else if (mode === 'topic') {
    body = (
      <div className="flex flex-col gap-2">
        {results.map((note) => (
          <NoteCard key={note.id} note={note} onOpen={onOpenNote} onMenu={onMenu} />
        ))}
      </div>
    );
  } else {
    const groups = groupNotesByTopic(results, topics);
    body = (
      <div className="flex flex-col gap-2">
        {groups.map((group) => (
          <div key={group.topicId} className="flex flex-col gap-2">
            {/* Сплиттер-заголовок: имя топика перед его заметками. */}
            <div className="mt-1 flex items-center gap-2 px-1 first:mt-0">
              <span className="shrink-0 text-[13px] font-medium text-muted-foreground">
                {group.name}
              </span>
              <div className="h-px min-w-0 flex-1 bg-border/70" />
            </div>
            {group.notes.map((note) => (
              <NoteCard key={note.id} note={note} onOpen={onOpenNote} onMenu={onMenu} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* Шапка: назад (закрыть), строка поиска, ✕ очистки внутри. */}
      <div className="flex items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+8px)]">
        <button
          type="button"
          aria-label="Закрыть поиск"
          className="glass-fab flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg text-muted-foreground transition-[background-color,transform] active:scale-90"
          onClick={onClose}
        >
          ←
        </button>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
          placeholder={mode === 'topic' && scopeLabel !== undefined ? `В топике «${scopeLabel}»` : 'Поиск заметок'}
          autoCapitalize="sentences"
          autoCorrect="off"
          className="min-h-11 flex-1 rounded-2xl border border-border bg-muted px-4 py-3 text-base outline-none placeholder:text-muted-foreground focus:border-ring"
        />
        {query !== '' && (
          <button
            type="button"
            aria-label="Очистить"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg text-muted-foreground transition-[background-color,transform] active:scale-90"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Тогл области поиска: «В топике» (активный топик островка) / «Везде». */}
      <div className="flex justify-center px-3 pt-2">
        <div className="flex items-center gap-1 rounded-full border border-border bg-muted p-1">
          {canScopeTopic && (
            <button
              type="button"
              aria-pressed={mode === 'topic'}
              className={`flex h-8 items-center rounded-full px-3 text-sm transition-colors ${
                mode === 'topic' ? 'bg-primary text-white' : 'text-muted-foreground'
              }`}
              onClick={() => setMode('topic')}
            >
              В топике
            </button>
          )}
          <button
            type="button"
            aria-pressed={mode === 'global'}
            className={`flex h-8 items-center rounded-full px-3 text-sm transition-colors ${
              mode === 'global' ? 'bg-primary text-white' : 'text-muted-foreground'
            }`}
            onClick={() => setMode('global')}
          >
            Везде
          </button>
        </div>
      </div>

      <div className="mt-2 flex-1 overflow-y-auto px-3 pb-6">{body}</div>
    </div>
  );
}
