// Построчный рендер заметки: кроме inline-разметки (**bold** и т.п., entities
// Telegram) веб понимает «структурные» маркеры в начале строк — # заголовок,
// ## подзаголовок, - список, - [ ] чеклист. Маркеры остаются в тексте как
// есть (их как текст видит бот), оформление добавляется только при показе
// в вебе. Смещения — в UTF-16 единицах (String.slice совпадает с Telegram).

import type { NoteEntity } from '../types/api';
import { renderNoteHtml } from './format';

export type NoteLineKind = 'h1' | 'h2' | 'list' | 'check' | 'text';

export interface NoteLine {
  kind: NoteLineKind;
  /** Смещение начала строки (вместе с маркером) в исходном тексте. */
  start: number;
  /** Длина маркера: '# '=2, '## '=3, '- '=2, '- [ ] '/'- [x] '=6, у текста 0. */
  markerLen: number;
  /** Смещение конца строки (без переноса). */
  end: number;
  /** Для чеклиста: строка отмечена («[x]»). */
  checked?: boolean;
}

const CHECK_RE = /^-\s\[( |x)\]\s/;

/** Разбирает текст на строки и распознаёт структурные маркеры в их начале. */
export function parseNoteLines(text: string): NoteLine[] {
  const lines: NoteLine[] = [];
  let pos = 0;
  while (pos < text.length) {
    const nl = text.indexOf('\n', pos);
    const end = nl === -1 ? text.length : nl;
    const raw = text.slice(pos, end);

    let kind: NoteLineKind = 'text';
    let markerLen = 0;
    let checked: boolean | undefined;
    if (raw.startsWith('## ')) {
      kind = 'h2';
      markerLen = 3;
    } else if (raw.startsWith('# ')) {
      kind = 'h1';
      markerLen = 2;
    } else {
      const m = CHECK_RE.exec(raw);
      if (m !== null) {
        kind = 'check';
        markerLen = 6;
        checked = m[1] === 'x';
      } else if (raw.startsWith('- ')) {
        kind = 'list';
        markerLen = 2;
      }
    }

    lines.push({ kind, start: pos, end, markerLen, ...(checked !== undefined ? { checked } : {}) });
    pos = end + 1;
  }
  return lines;
}

/** Entities, пересекающие диапазон [start, end), со смещениями относительно него. */
function clipEntities(entities: NoteEntity[], start: number, end: number): NoteEntity[] {
  const out: NoteEntity[] = [];
  for (const e of entities) {
    const from = Math.max(e.offset, start);
    const to = Math.min(e.offset + e.length, end);
    if (to <= from) continue;
    out.push({ ...e, offset: from - start, length: to - from });
  }
  return out;
}

/**
 * Рендерит заметку в HTML с блоками (заголовки/список/чеклист) и inline-
 * разметкой внутри строк. checkable — рисовать чекбоксы кнопками (переключение
 * галочки в вебе); иначе — статичными квадратиками.
 */
export function renderNoteBlocksHtml(
  text: string,
  entities: NoteEntity[],
  checkable = false,
): string {
  const lines = parseNoteLines(text);
  let html = '';
  for (const line of lines) {
    const contentStart = line.start + line.markerLen;
    const content = text.slice(contentStart, line.end);
    const inner = renderNoteHtml(content, clipEntities(entities, contentStart, line.end));

    switch (line.kind) {
      case 'h1':
        html += `<div class="note-h1">${inner}</div>`;
        break;
      case 'h2':
        html += `<div class="note-h2">${inner}</div>`;
        break;
      case 'list':
        html += `<div class="note-li"><span class="note-bullet">•</span><span class="note-li-text">${inner}</span></div>`;
        break;
      case 'check': {
        const checked = line.checked === true;
        const box = checkable
          ? `<button type="button" class="note-cb" data-cb="${line.start}" aria-pressed="${checked}" aria-label="${checked ? 'Снять отметку' : 'Отметить выполненным'}"></button>`
          : '<span class="note-cb note-cb-static"></span>';
        html += `<div class="note-li${checked ? ' checked' : ''}">${box}<span class="note-li-text${checked ? ' note-checked-text' : ''}">${inner}</span></div>`;
        break;
      }
      default:
        // Пустая строка — видимый отступ между абзацами (как перенос строки
        // в whitespace-pre-wrap), поэтому не схлопываем её в ноль высоты.
        html +=
          content === ''
            ? '<div class="note-blank"></div>'
            : `<div class="note-line">${inner}</div>`;
    }
  }
  return html;
}
