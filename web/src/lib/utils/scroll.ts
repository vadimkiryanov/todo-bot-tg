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

/** Показать прямоугольник каретки (координаты вьюпорта, как их даёт
    getBoundingClientRect) внутри контейнера прокрутки. Нужен правке заметки:
    клавиатура и панель форматирования растут внизу и забирают высоту у текста,
    без подтягивания строка с кареткой уезжает за край видимой части. Отступ
    margin оставляет строку «на виду», а не вплотную к краю. */
export function revealRect(
  scroller: HTMLElement,
  rect: { top: number; bottom: number },
  margin = 8,
): void {
  const height = scroller.clientHeight;
  if (height === 0) return;
  const box = scroller.getBoundingClientRect();
  // Прямоугольник → смещение в контенте контейнера (scrollTop — от верхнего
  // края видимой части, getBoundingClientRect — от рамки; рамки у контейнеров
  // правки нет).
  const top = rect.top - box.top + scroller.scrollTop;
  const bottom = rect.bottom - box.top + scroller.scrollTop;
  if (bottom > height - margin) {
    scroller.scrollTop += bottom - (height - margin);
  } else if (top < margin) {
    scroller.scrollTop = Math.max(0, scroller.scrollTop - (margin - top));
  }
}

/** Свойства текста и блока, от которых зависит перенос строк: зеркальный блок
    должен повторять их у поля один в один, иначе каретка «поедет». */
const MIRROR_PROPS = [
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'textIndent',
  'textTransform',
  'wordSpacing',
  'tabSize',
  'whiteSpace',
  'wordBreak',
  'overflowWrap',
  'boxSizing',
  'direction',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
] as const;

/** Прямоугольник каретки в поле с разметкой ('plain'). Текстовое поле своего
    прямоугольника каретки не отдаёт (в отличие от выделения в вёрстке),
    поэтому позицию мерим зеркальным блоком: тот же текст тем же шрифтом в том
    же блоке той же ширины, что и у поля. */
export function textareaCaretRect(ta: HTMLTextAreaElement): { top: number; bottom: number } {
  const cs = getComputedStyle(ta);
  const mirror = document.createElement('div');
  for (const prop of MIRROR_PROPS) mirror.style[prop] = cs[prop];
  // Зеркало не участвует в раскладке страницы: за кадром, без прокрутки.
  mirror.style.position = 'absolute';
  mirror.style.left = '-9999px';
  mirror.style.top = '0';
  mirror.style.height = 'auto';
  mirror.style.visibility = 'hidden';
  mirror.style.overflow = 'visible';
  mirror.style.width = `${ta.clientWidth}px`;
  mirror.textContent = ta.value.slice(0, ta.selectionStart ?? 0);
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const caretTop = marker.getBoundingClientRect().top - mirror.getBoundingClientRect().top;
  const lineHeight = Number.parseFloat(cs.lineHeight);
  document.body.removeChild(mirror);
  // Смещение в поле → координаты вьюпорта: зеркало стоит на нулевой прокрутке,
  // поле прокручено на scrollTop.
  const box = ta.getBoundingClientRect();
  const top = box.top + caretTop - ta.scrollTop;
  const height = Number.isFinite(lineHeight) ? lineHeight : Number.parseFloat(cs.fontSize) * 1.2;
  return { top, bottom: top + height };
}
