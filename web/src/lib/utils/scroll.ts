// Фриз скролла списков при открытом контекстном меню (NoteMenu/QuickMenu):
// body получает класс scroll-locked (см. app.css — body.scroll-locked .scroll-area).
// Счётчик — меню могут накладываться (теоретически), снимаем только с последним.
let locks = 0;

export function lockScroll(): void {
  if (typeof document === 'undefined') return;
  locks += 1;
  document.body.classList.add('scroll-locked');
}

export function unlockScroll(): void {
  if (typeof document === 'undefined') return;
  locks = Math.max(0, locks - 1);
  if (locks === 0) {
    document.body.classList.remove('scroll-locked');
  }
}
