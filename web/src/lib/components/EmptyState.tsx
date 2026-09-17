// Пустое состояние списка: метка (иконка библиотеки) и опциональный
// поясняющий текст. Иконке задаём размер контейнером (`[&_svg]`): у иконок
// пакета свои атрибуты width/height, а «шарик» пустого состояния крупный.
import { Icon28Edit } from '@telegram-apps/telegram-ui/dist/icons/28/edit';
import type { ReactNode } from 'react';

export function EmptyState({ icon, text }: { icon?: ReactNode; text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16">
      <div className="empty-bob flex h-12 items-center justify-center text-5xl [&_svg]:h-12 [&_svg]:w-12">
        {icon ?? <Icon28Edit />}
      </div>
      {text !== undefined && <p className="text-sm text-muted-foreground">{text}</p>}
    </div>
  );
}
