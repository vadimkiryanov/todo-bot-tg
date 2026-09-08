// Строка текущей папки под островком топиков: «📁 Папка › Подпапка» (или
// «Корень»). Тап — шторка папок (дерево активного топика); долгий тап —
// дропдаун «Создать папку» (на текущем уровне) / «Создать топик».
import { useEffect, useMemo, useRef, useState } from 'react';
import type * as React from 'react';

import { CrumbPath } from './CrumbPath';
import { QuickMenu } from './QuickMenu';
import { folderChain, useFoldersStore } from '../stores/folders';
import { useNavigationStore } from '../stores/navigation';
import { useTopicsStore } from '../stores/topics';
import { useUiStore } from '../stores/ui';
import { suppressNextClick } from '../utils/click';

interface FolderStripProps {
  /** Открыть шторку папок. */
  onOpen: () => void;
}

export function FolderStrip({ onOpen }: FolderStripProps) {
  const topics = useTopicsStore((s) => s.topics);
  const activeFolderID = useNavigationStore((s) => s.activeFolderID);
  const folders = useFoldersStore((s) => s.all);

  // Цепочка хлебных крошек активной папки (folderChain читает стор напрямую).
  const chain = useMemo(() => folderChain().map((f) => f.name), [folders, activeFolderID]);

  // Долгий тап на строке — дропдаун создания.
  const LONG_PRESS_MS = 500;
  const longPressTimer = useRef<number | undefined>(undefined);
  const longPressFired = useRef(false);
  const [quickMenu, setQuickMenu] = useState<{ x: number; y: number } | null>(null);

  // Таймер долгого нажатия гасим вместе с жизнью компонента.
  useEffect(
    () => () => {
      window.clearTimeout(longPressTimer.current);
    },
    [],
  );

  function clearTimer(): void {
    window.clearTimeout(longPressTimer.current);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>): void {
    if (e.button !== 0) return;
    longPressFired.current = false;
    clearTimer();
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      suppressNextClick();
      setQuickMenu({ x: e.clientX, y: e.clientY });
    }, LONG_PRESS_MS);
  }

  function onTap(): void {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    onOpen();
  }

  if (topics.length === 0) return null;

  const inFolder = activeFolderID !== null;

  return (
    <>
      <button
        type="button"
        title={inFolder && chain.length > 0 ? chain.join(' › ') : 'Корень'}
        className={`strip-glass pointer-events-auto mx-auto flex h-9 w-full max-w-md select-none items-center gap-2 rounded-xl px-3 text-left text-[13px] text-muted transition-colors active:bg-black/5 dark:active:bg-white/10${
          inFolder ? ' in-folder' : ''
        }`}
        onPointerDown={handlePointerDown}
        onPointerUp={clearTimer}
        onPointerCancel={clearTimer}
        onPointerLeave={clearTimer}
        onClick={onTap}
      >
        <span className="shrink-0 text-sm leading-none">📁</span>
        {!inFolder || chain.length === 0 ? (
          <span className="min-w-0 flex-1 truncate">Корень</span>
        ) : (
          // Длинный путь ужимается до влезающего: корневая папка и активная
          // всегда видны, середина маскируется «…» (полный путь — в title).
          <CrumbPath containerClass="flex-1" segments={chain} />
        )}
      </button>

      {quickMenu !== null && (
        <QuickMenu
          x={quickMenu.x}
          y={quickMenu.y}
          items={[
            {
              emoji: '📁',
              label: 'Создать папку',
              action: () => useUiStore.setState({ folderCreateOpen: true }),
            },
            {
              emoji: '📚',
              label: 'Создать топик',
              action: () => useUiStore.setState({ topicCreateOpen: true }),
            },
          ]}
          onClose={() => setQuickMenu(null)}
        />
      )}
    </>
  );
}
