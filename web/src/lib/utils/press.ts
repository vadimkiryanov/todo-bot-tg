// Отклик нажатия под пальцем: кнопки и поля ввода (см. app.css —
// .input-press и .btn-press*). Класс .pressed ставится на элемент под
// пальцем и снимается на отпускании.
//
// Почему не чистый CSS :active: на телефоне :active не срабатывает —
// кнопки не продавливались вовсе (проверено на устройстве), поэтому
// состояние под пальцем ведёт класс.
//
// Слушателей ровно три, все на window в фазе capture (перехватываем раньше
// компонентов, которые могут гасить всплытие):
//   pointerdown                      — поставить .pressed,
//   pointerup, pointercancel         — снять.
// pointercancel обязателен: при скролле ленты или свайпе жест забирает
// браузер, pointerup не приходит — без него кнопка осталась бы «прижатой».
// Отдельного pointermove нет: начавшийся скролл браузер сам отменяет
// событием pointercancel.
//
// Мышь класс не трогает: на десктопе тот же вид даёт нативный :active.
// Выключенные элементы (disabled/aria-disabled) не надуваются.

const PRESSABLE = '.input-press, .btn-press, .btn-press-wide, .btn-press-soft, .btn-press-plain';

let pressed: HTMLElement | null = null;

function release(): void {
  if (pressed === null) return;
  pressed.classList.remove('pressed');
  pressed = null;
}

/** Ближайший элемент с классом отклика; выключенные — мимо. */
function pressableFrom(target: EventTarget | null): HTMLElement | null {
  // Идём вверх от ЛЮБОГО элемента, а не только от HTMLElement: под пальцем
  // чаще всего оказывается иконка набора (<svg>), а SVGElement — не
  // HTMLElement. Проверка на HTMLElement отсекала такие нажатия, и кнопка,
  // вся площадь которой занята иконкой, не отзывалась вовсе (проба: событие
  // pointerdown приходит, класс .pressed не ставится).
  if (!(target instanceof Element)) return null;
  const el = target.closest(PRESSABLE);
  if (el === null || !(el instanceof HTMLElement)) return null;
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return null;
  return el;
}

export function installPress(): () => void {
  if (typeof window === 'undefined') return () => {};

  const onPointerDown = (e: PointerEvent): void => {
    release();
    if (e.pointerType === 'mouse') return;
    const el = pressableFrom(e.target);
    if (el === null) return;
    pressed = el;
    el.classList.add('pressed');
  };

  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointerup', release, true);
  window.addEventListener('pointercancel', release, true);

  return () => {
    release();
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('pointerup', release, true);
    window.removeEventListener('pointercancel', release, true);
  };
}
