// Мини-спиннер для busy-кнопок: крутится и окрашивается в currentColor —
// подходит и на белой кнопке с текстом, и на цветной с иконкой.
export function Spinner({ size = '18px' }: { size?: string }) {
  return (
    <span
      className="spinner shrink-0"
      style={{ width: size, height: size, borderWidth: `max(2px, calc(${size} / 9))` }}
      aria-hidden="true"
    ></span>
  );
}
