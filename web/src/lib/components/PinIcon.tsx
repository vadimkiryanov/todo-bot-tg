// Закрепление: канцелярская кнопка контуром — в наборе иконок библиотеки
// (@telegram-apps/telegram-ui/dist/icons) пина нет. Одна иконка на все места,
// где раньше стояло слово «Пин»/«пин»: метка строки заметки, пункты меню
// заметки и страницы, кнопка панели ввода, метки закреплённого топика.
// Размер задаёт вызывающий (className), по умолчанию — как в строке заметки.
interface PinIconProps {
  /** Размер и цвет (currentColor): «h-4 w-4», «h-6 w-6» и т.п. */
  className?: string;
}

export function PinIcon({ className = 'h-4 w-4' }: PinIconProps) {
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
      <path d="M5.75 2h4.5M6.75 2v5.4L5.1 9.6h5.8L9.25 7.4V2M8 9.6V14" />
    </svg>
  );
}
