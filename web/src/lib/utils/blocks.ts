// Построчный рендер заметки: кроме inline-разметки (**bold** и т.п., entities
// Telegram) веб понимает «структурные» маркеры в начале строк — # заголовок,
// ## подзаголовок, 1. нумерованный список, - список, - [ ] чеклист. Маркеры
// остаются в тексте как есть (их как текст видит бот), оформление добавляется
// только при показе в вебе. Смещения — в UTF-16 единицах (String.slice
// совпадает с Telegram).

import type { NoteEntity } from '../types/api';
import { renderNoteHtml } from './format';

export type NoteLineKind = 'h1' | 'h2' | 'ol' | 'list' | 'check' | 'text';

export interface NoteLine {
  kind: NoteLineKind;
  /** Смещение начала строки (вместе с маркером) в исходном тексте. */
  start: number;
  /** Длина маркера: '# '=2, '## '=3, '1. ' — 3 и больше (номер), '- '=2,
      '- [ ] '/'- [x] '=6, у текста 0. */
  markerLen: number;
  /** Смещение конца строки (без переноса). */
  end: number;
  /** Для чеклиста: строка отмечена («[x]»). */
  checked?: boolean;
}

const CHECK_RE = /^-\s\[( |x)\]\s/;
/** Нумерованный пункт: «1. », «12. » (не больше 9 цифр — как в редакторах). */
const OL_RE = /^(\d{1,9})\.\s/;

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
      const ol = OL_RE.exec(raw);
      if (m !== null) {
        kind = 'check';
        markerLen = 6;
        checked = m[1] === 'x';
      } else if (ol !== null) {
        kind = 'ol';
        markerLen = ol[0].length;
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
export function clipEntities(entities: NoteEntity[], start: number, end: number): NoteEntity[] {
  const out: NoteEntity[] = [];
  for (const e of entities) {
    const from = Math.max(e.offset, start);
    const to = Math.min(e.offset + e.length, end);
    if (to <= from) continue;
    out.push({ ...e, offset: from - start, length: to - from });
  }
  return out;
}

/** HTML одной строки-блока (обёртки блоков + inline-разметка содержимого). */
function renderBlockLine(
  text: string,
  entities: NoteEntity[],
  line: NoteLine,
  checkable: boolean,
): string {
  const contentStart = line.start + line.markerLen;
  const content = text.slice(contentStart, line.end);
  const inner = renderNoteHtml(content, clipEntities(entities, contentStart, line.end));

  switch (line.kind) {
    case 'h1':
      return `<div class="note-h1">${inner}</div>`;
    case 'h2':
      return `<div class="note-h2">${inner}</div>`;
    case 'list':
      return `<div class="note-li"><span class="note-bullet">•</span><span class="note-li-text">${inner}</span></div>`;
    case 'ol': {
      // Номер берём из самого текста строки (в маркере только цифры и точка —
      // экранировать нечего), чтобы нумерация оставалась авторской.
      const num = text.slice(line.start, line.start + line.markerLen - 1);
      return `<div class="note-li"><span class="note-ol-num">${num}</span><span class="note-li-text">${inner}</span></div>`;
    }
    case 'check': {
      const checked = line.checked === true;
      const box = checkable
        ? `<button type="button" class="note-cb btn-press" data-cb="${line.start}" aria-pressed="${checked}" aria-label="${checked ? 'Снять отметку' : 'Отметить выполненным'}"></button>`
        : '<span class="note-cb note-cb-static"></span>';
      return `<div class="note-li${checked ? ' checked' : ''}">${box}<span class="note-li-text${checked ? ' note-checked-text' : ''}">${inner}</span></div>`;
    }
    default:
      // Пустая строка — видимый отступ между абзацами (как перенос строки
      // в whitespace-pre-wrap), поэтому не схлопываем её в ноль высоты.
      return content === '' ? '<div class="note-blank"></div>' : `<div class="note-line">${inner}</div>`;
  }
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
    html += renderBlockLine(text, entities, line, checkable);
  }
  return html;
}

// --- Продолжение строкового формата при Enter (редактор заметки) ---------

/** Что делать с форматом строки при Enter (без Shift). */
export type LineContinuation =
  /** Формат продолжается: маркер новой строки (у нумерованного — следующий номер). */
  | { action: 'continue'; marker: string }
  /** В пункте ничего нет — маркер снимается, из формата выходим. */
  | { action: 'clear' };

/** Маркеры, которые переносятся на новую строку как есть. */
const PLAIN_MARKERS = ['- ', '## ', '# '];

/**
 * Формат строки, который надо применить к новой строке при Enter: «# », «## »
 * и «- » переносятся как есть, «- [ ] » — всегда снятая галочка, «1. » — со
 * следующим номером. Пустой пункт (в строке только маркер) закрывает формат —
 * маркер снимается, как в markdown- и обычных редакторах, чтобы из списка
 * можно было выйти. Обычная строка — null: перенос нативный.
 */
export function lineContinuation(raw: string): LineContinuation | null {
  const check = CHECK_RE.exec(raw);
  if (check !== null) {
    return isEmptyItem(raw, check[0].length)
      ? { action: 'clear' }
      : { action: 'continue', marker: '- [ ] ' };
  }
  const ol = OL_RE.exec(raw);
  if (ol !== null) {
    return isEmptyItem(raw, ol[0].length)
      ? { action: 'clear' }
      : { action: 'continue', marker: `${Number(ol[1]) + 1}. ` };
  }
  for (const marker of PLAIN_MARKERS) {
    if (raw.startsWith(marker)) {
      return isEmptyItem(raw, marker.length)
        ? { action: 'clear' }
        : { action: 'continue', marker };
    }
  }
  return null;
}

/** В пункте после маркера ничего нет (только пробелы). */
function isEmptyItem(raw: string, markerLen: number): boolean {
  return raw.slice(markerLen).trim() === '';
}

// --- Превью карточки (компактное, с блоками) -----------------------------

/** Сколько «строк карточки» занимает блок (эмпирика под app.css): обычная
    строка/список/чек — одну (line-height 1.5rem), заголовок крупнее и с
    отступами. Лимит 2.2 — в карточку помещаются, например, заголовок и
    первый пункт списка, но не третья обычная строка. */
const PREVIEW_WEIGHT_LIMIT = 2.2;

function blockRowWeight(kind: NoteLineKind): number {
  switch (kind) {
    case 'h1':
      return 1.2;
    case 'h2':
      return 1.1;
    default:
      return 1;
  }
}

/**
 * HTML компактного превью заметки для карточки списка: первые строки с
 * учётом блочных маркеров (# заголовок, ## подзаголовок, - список,
 * - [ ] чеклист со статичным квадратиком). Пустые строки пропускаются
 * (в карточке нет абзацных отступов); обрыв по «весу» строк, чтобы карточка
 * оставалась в две строки высотой — остальной текст не рендерится.
 */
export function previewBlocksHtml(text: string, entities: NoteEntity[]): string {
  const lines = parseNoteLines(text);
  let html = '';
  let weight = 0;
  for (const line of lines) {
    // Пустые строки в превью схлопываем (на лимит не влияют, в HTML не идут).
    if (line.kind === 'text' && line.end === line.start) continue;
    const w = blockRowWeight(line.kind);
    if (weight > 0 && weight + w > PREVIEW_WEIGHT_LIMIT) break;
    html += renderBlockLine(text, entities, line, false);
    weight += w;
  }
  return html;
}
