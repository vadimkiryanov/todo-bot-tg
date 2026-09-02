// Подавление «клика отпускания» после долгого нажатия, открывшего дропдаун.
// Пока палец ещё на экране, под ним уже появился fixed-оверлей меню
// (backdrop/панель): браузер может синтезировать click в момент отпускания
// и сразу закрыть меню (или выполнить пункт под пальцем).
//
// Подавляем ТОЛЬКО этот клик отпускания, не трогая следующие нажатия по
// пунктам меню: на новом pointerdown (осознанный тап) слушатель снимается
// раньше, чем клик дойдёт до пункта/фона.
//
// ВАЖНО: нельзя сниматься на pointerup (даже через setTimeout 0) — на
// мобильных браузерах клик отпускания синтезируется отдельной задачей ПОСЛЕ
// pointerup, таймер успевает снять слушатель раньше, и клик закрывает только
// что открытое меню в момент отжатия пальца. Поэтому после pointerup держим
// подавление короткую паузу: клик отпускания придёт в её пределах и будет
// перехвачен.
export function suppressNextClick(): void {
  if (typeof window === 'undefined') return;

  let released = false;
  let graceTimer: number | undefined;
  let failsafe: number;

  const stopClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    cleanup();
  };
  const cleanup = (): void => {
    window.removeEventListener('click', stopClick, true);
    window.removeEventListener('pointerdown', cleanup, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.clearTimeout(graceTimer);
    window.clearTimeout(failsafe);
  };
  const onPointerUp = (): void => {
    if (released) return;
    released = true;
    graceTimer = window.setTimeout(cleanup, 400);
  };

  // Страховка от «зависшего» слушателя, если pointerup так и не наступит
  // (pointercancel без pointerup и т.п.): новый pointerdown всё равно снимет
  // слушатель раньше.
  failsafe = window.setTimeout(cleanup, 5000);

  window.addEventListener('click', stopClick, true);
  window.addEventListener('pointerdown', cleanup, true);
  window.addEventListener('pointerup', onPointerUp, true);
}
