// Список топиков (шторка «Топики») на компонентах @telegram-apps/telegram-ui:
// тап — выбор топика (шторка не закрывается), долгий тач (правый клик) — меню
// топика (TopicMenu: создать/закрепить/переименовать/удалить). Закреплённые
// помечены коротким словом-меткой и идут первыми, число заметок — бейджем
// у правого края, активный топик — галочкой, как строки настроек: шторки
// выглядят одинаково.
import { Badge, Cell, List, Section } from '@telegram-apps/telegram-ui';
import { Icon20Select } from '@telegram-apps/telegram-ui/dist/icons/20/select';

import { setActiveTopic, useNavigationStore } from '../stores/navigation';
import { openTopicMenu } from '../stores/topic-menu';
import { useTopicsStore } from '../stores/topics';
import type { Topic } from '../types/api';
import { useLongPress } from '../utils/longPress';

import { PinIcon } from './PinIcon';

/** Удержание — как у табов островка (не короче): тап по топику переключает,
    меню открывается сознательным удержанием. */
const HOLD_MS = 500;

interface TopicRowProps {
  topic: Topic;
  active: boolean;
}

function TopicRow({ topic, active }: TopicRowProps) {
  // Долгий тач — меню топика; клик после него подавляется хуком.
  const press = useLongPress(() => {
    openTopicMenu(topic);
  }, HOLD_MS);

  return (
    <Cell
      Component="button"
      type="button"
      // w-full обязателен: <button> в Chromium не растягивается как блочный
      // бокс, а схлопывается по содержимому — короткое имя топика не заняло бы
      // карточку, и бейдж с галочкой встали бы сразу за подписью.
      className="w-full select-none text-left btn-press-soft [-webkit-touch-callout:none]"
      after={
        <span className="flex items-center gap-1">
          {topic.note_count > 0 && (
            <Badge type="number" mode="gray">
              {topic.note_count}
            </Badge>
          )}
          {active && <Icon20Select className="h-5 w-5 text-ring" />}
        </span>
      }
      onClick={() => {
        if (press.skipClick()) return;
        setActiveTopic(topic.id);
      }}
      onPointerDown={press.onPointerDown}
      onPointerMove={press.onPointerMove}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      onContextMenu={press.onContextMenu}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-[15px] leading-6">
        {topic.pinned && (
          /* Иконка закрепления вместо слова «пин» (PinIcon — своя: в наборе
             библиотеки пина нет). */
          <PinIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{topic.name}</span>
      </span>
    </Cell>
  );
}

export function TopicTabs() {
  const topics = useTopicsStore((s) => s.topics);
  const activeTopicID = useNavigationStore((s) => s.activeTopicID);

  return (
    // px-0! — снимаем собственные отступы List (10px 18px на iOS):
    // горизонтальные отступы задаёт шторка, иначе карточка-секция уезжает
    // к центру и становится узкой (как в шторке настроек).
    <List className="px-0!">
      <Section>
        {topics.map((topic) => (
          <TopicRow key={topic.id} topic={topic} active={topic.id === activeTopicID} />
        ))}
      </Section>
    </List>
  );
}
