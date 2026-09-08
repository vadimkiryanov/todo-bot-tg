// Пустое состояние списка: эмодзи-«шарик» и опциональный поясняющий текст.
export function EmptyState({ emoji = '📝', text }: { emoji?: string; text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16">
      <div className="empty-bob text-5xl">{emoji}</div>
      {text !== undefined && <p className="text-sm text-muted">{text}</p>}
    </div>
  );
}
