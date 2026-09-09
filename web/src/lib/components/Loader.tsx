// Загрузочное состояние списка/превью: акцентный круглый спиннер по центру
// (вместо «качающегося» эмодзи ⏳). Контейнер повторяет EmptyState, чтобы
// подстановка в те же места разметки не двигала вёрстку.
export function Loader({ label }: { label?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 px-6 py-16"
      role="status"
      aria-label="Загрузка"
    >
      <span className="loader" aria-hidden="true"></span>
      {label !== undefined && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  );
}
