// Генерация PWA-иконок из SVG (галочка на фоне Telegram blue).
// Запуск: npm run gen:icons
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const sizes = [192, 512, 180];

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#3390ec"/>
  <path d="M150 268 l72 72 l140 -148" stroke="#ffffff" stroke-width="52" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

const outDir = fileURLToPath(new URL('../public/icons/', import.meta.url));
await mkdir(outDir, { recursive: true });

for (const size of sizes) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(path.join(outDir, `icon-${size}.png`));
}

console.log(`Иконки сгенерированы: ${sizes.map((s) => `icon-${s}.png`).join(', ')}`);
