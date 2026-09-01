// Глобальные флаги модалок создания: открываются из разных мест
// (меню топика в шторке, дропдауны долгого нажатия, пустой экран),
// поэтому формы рендерятся один раз в ChatView, а здесь — только флаги.
export const ui = $state({
  topicCreateOpen: false,
  folderCreateOpen: false,
});

/** Сброс флагов (выход из аккаунта) — модалки не должны протекать между пользователями. */
export function resetUi(): void {
  ui.topicCreateOpen = false;
  ui.folderCreateOpen = false;
}
