// Раскрытие заметки: своя иконка — в наборе библиотеки
// (@telegram-apps/telegram-ui/dist/icons) есть только шеврон, а он про
// направление стрелки, а не про объём показанной заметки. Здесь видно сам
// объём: короткая карточка с обрезанной строкой (пунктир) и шевроном
// «раскрыть» — заметка показана сокращённо; высокая карточка со всеми
// строками — заметка развёрнута целиком. Одна иконка на все места, где
// переключают режим: кнопка панели ввода, пункт меню заметки и пункт меню
// «Ещё» на странице заметки.
interface ExpandIconProps {
  /** Заметка показана целиком (развёрнута). */
  expanded: boolean;
  /** Размер и цвет (currentColor): «h-5 w-5», «h-6 w-6» и т.п. */
  className?: string;
}

export function ExpandIcon({ expanded, className = 'h-6 w-6' }: ExpandIconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {expanded ? (
        <>
          {/* Развёрнута целиком: высокая карточка со всеми строками */}
          <rect x="2" y="1.8" width="12" height="12.4" rx="2" />
          <path d="M4.6 4.9h6.8M4.6 7.5h6.8M4.6 10.1h4.4" />
        </>
      ) : (
        <>
          {/* Сокращённо: карточка обрезана — пунктирная строка и шеврон вниз */}
          <rect x="2" y="1.8" width="12" height="6.6" rx="2" />
          <path d="M4.6 4.4h6.8M4.6 6.8h4.4" />
          <path d="M4.7 11h6.6" strokeDasharray="1.7 1.7" />
          <path d="M6.2 13 8 14.6l1.8-1.6" />
        </>
      )}
    </svg>
  );
}
