// Сетка топиков (шторка «Топики»): тап — выбор топика (шторка не
// закрывается), долгий тап — меню топика (TopicMenu: создать/переименовать/
// удалить).
import { useEffect, useRef } from 'react';

import { setActiveTopic, useNavigationStore } from '../stores/navigation';
import { useTopicsStore } from '../stores/topics';
import { openTopicMenu } from '../stores/topic-menu';
import { suppressNextClick } from '../utils/click';

const LONG_PRESS_MS = 500;

export function TopicTabs() {
  const topics = useTopicsStore((s) => s.topics);
  const activeTopicID = useNavigationStore((s) => s.activeTopicID);

  const longPressTimer = useRef<number | undefined>(undefined);
  const longPressFired = useRef(false);

  // Таймер долгого нажатия гасим вместе с жизнью компонента.
  useEffect(
    () => () => {
      window.clearTimeout(longPressTimer.current);
    },
    [],
  );

  function handlePointerDown(id: number): void {
    longPressFired.current = false;
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      suppressNextClick();
      const topic = useTopicsStore.getState().topics.find((t) => t.id === id);
      if (topic !== undefined) {
        openTopicMenu(topic);
      }
    }, LONG_PRESS_MS);
  }

  function cancelLongPress(): void {
    window.clearTimeout(longPressTimer.current);
  }

  function onTap(id: number): void {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    setActiveTopic(id);
  }

  return (
    <div className="shrink-0 px-1 pb-1">
      {/* Сетка топиков (2 колонки): долгий тап по топику — меню. Высота не
          ограничена изнутри — длинный список раскрывает шторку до 85dvh,
          скроллится сама шторка (Modal). */}
      <div className="topic-grid grid grid-cols-2 gap-2">
        {topics.map((topic) => (
          <button
            key={topic.id}
            type="button"
            className={`flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-full px-3 text-sm transition-[background-color,transform] active:scale-[0.97] ${
              topic.id === activeTopicID
                ? 'bg-primary text-white'
                : 'bg-muted text-foreground'
            }`}
            onPointerDown={() => handlePointerDown(topic.id)}
            onPointerUp={cancelLongPress}
            onPointerCancel={cancelLongPress}
            onPointerLeave={cancelLongPress}
            onClick={() => onTap(topic.id)}
          >
            <span className="truncate">{topic.name}</span>
            {topic.note_count > 0 && (
              <span className="shrink-0 text-xs opacity-60">{topic.note_count}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
