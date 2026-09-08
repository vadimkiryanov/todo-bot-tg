// Меню топика (переименовать/удалить/создать): состояние открытого топика
// для общего компонента TopicMenu. Открывается из табов островка и сетки
// топиков в шторке — логика меню одна (TopicMenu рендерится в ChatView).
import { create } from 'zustand';

import type { Topic } from '../types/api';

interface TopicMenuState {
  topic: Topic | null;
}

export const useTopicMenuStore = create<TopicMenuState>()(() => ({
  topic: null,
}));

export function openTopicMenu(topic: Topic): void {
  useTopicMenuStore.setState({ topic });
}

export function closeTopicMenu(): void {
  useTopicMenuStore.setState({ topic: null });
}

/** Сброс (выход из аккаунта) — меню не должно протекать между пользователями. */
export function resetTopicMenu(): void {
  useTopicMenuStore.setState({ topic: null });
}
