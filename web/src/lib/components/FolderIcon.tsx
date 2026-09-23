// Папка: контурная иконка — в наборе иконок библиотеки
// (@telegram-apps/telegram-ui/dist/icons) папки нет, как нет и пина. Одна
// иконка на все места, где папка раньше обозначалась словом: строка папки в
// общем списке (там стояла метка «папка»), деревья папок в шторках «Папки» и
// переноса вместе со строкой «Корень», путь в папках (крошки в островке и
// строка под ним), кнопка входа в папки у поля ввода. Размер задаёт
// вызывающий (className), по умолчанию — как в строке папки.
interface FolderIconProps {
  /** Размер и цвет (currentColor): «h-4 w-4», «h-6 w-6» и т.п. */
  className?: string;
}

export function FolderIcon({ className = 'h-4 w-4' }: FolderIconProps) {
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
      <path d="M3.1 3.4h2.6l1.7 1.9h5.5a1.2 1.2 0 0 1 1.2 1.2v4.9a1.2 1.2 0 0 1-1.2 1.2H3.1a1.2 1.2 0 0 1-1.2-1.2V4.6a1.2 1.2 0 0 1 1.2-1.2Z" />
    </svg>
  );
}
