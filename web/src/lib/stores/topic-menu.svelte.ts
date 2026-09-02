// Меню топика (переименовать/удалить/создать): состояние открытого топика
// для общего компонента TopicMenu. Открывается из табов островка и сетки
// топиков в шторке — логика меню одна (TopicMenu.svelte рендерится в ChatView).
import type { Topic } from '../types/api';

export const topicMenu = $state<{
  topic: Topic | null;
}>({
  topic: null,
});

export function openTopicMenu(topic: Topic): void {
  topicMenu.topic = topic;
}

export function closeTopicMenu(): void {
  topicMenu.topic = null;
}

/** Сброс (выход из аккаунта) — меню не должно протекать между пользователями. */
export function resetTopicMenu(): void {
  topicMenu.topic = null;
}
