// Глобальные флаги модалок создания: открываются из разных мест
// (меню топика в шторке, дропдауны долгого нажатия, пустой экран),
// поэтому формы рендерятся один раз в ChatView, а здесь — только флаги.
import { create } from 'zustand';

interface UiState {
  topicCreateOpen: boolean;
  folderCreateOpen: boolean;
}

export const useUiStore = create<UiState>()(() => ({
  topicCreateOpen: false,
  folderCreateOpen: false,
}));

/** Сброс флагов (выход из аккаунта) — модалки не должны протекать между пользователями. */
export function resetUi(): void {
  useUiStore.setState({ topicCreateOpen: false, folderCreateOpen: false });
}
