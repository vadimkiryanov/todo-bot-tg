// Утилиты форматирования заметок: markdown-разметка ↔ entities Telegram,
// безопасный HTML-рендер. offsets/length — в UTF-16 единицах (как у Telegram),
// поэтому String.slice (тоже UTF-16) совпадает по позициям.

import type { NoteEntity } from '../types/api';

// --- Markdown → entities (зеркало parseMarkdownEntities в Go) ---

export interface ParsedMarkdown {
  text: string;
  entities: NoteEntity[];
}

/**
 * Разбирает markdown-подобную разметку (**bold**, *italic*, `code`, [text](url))
 * в чистый текст + entities. Маркеры удаляются; вложенность не поддерживается.
 */
export function parseMarkdown(input: string): ParsedMarkdown {
  const runes = [...input];
  let out = '';
  const entities: NoteEntity[] = [];
  let i = 0;
  let pos = 0;

  const pushEntity = (content: string[], type: string, url?: string) => {
    const frag = content.join('');
    const length = [...frag].reduce((acc, r) => acc + (r.codePointAt(0)! > 0xffff ? 2 : 1), 0);
    entities.push({ type, offset: pos, length, ...(url !== undefined ? { url } : {}) });
    out += frag;
    pos += length;
  };

  while (i < runes.length) {
    const r = runes[i];
    // **bold**
    if (r === '*' && runes[i + 1] === '*') {
      const res = findClosing(runes, i + 2, ['*', '*']);
      if (res) {
        pushEntity(res.content, 'bold');
        i = res.next;
        continue;
      }
    }
    // *italic* (не часть **)
    if (r === '*' && runes[i - 1] !== '*' && runes[i + 1] !== '*') {
      const res = findClosing(runes, i + 1, ['*']);
      if (res) {
        pushEntity(res.content, 'italic');
        i = res.next;
        continue;
      }
    }
    // `code`
    if (r === '`') {
      const res = findClosing(runes, i + 1, ['`']);
      if (res) {
        pushEntity(res.content, 'code');
        i = res.next;
        continue;
      }
    }
    // [text](url)
    if (r === '[') {
      const res = findLink(runes, i);
      if (res) {
        pushEntity(res.content, 'text_link', res.url);
        i = res.next;
        continue;
      }
    }
    out += r;
    pos += r.codePointAt(0)! > 0xffff ? 2 : 1;
    i++;
  }
  return { text: out, entities };
}

interface ClosingRes {
  content: string[];
  next: number;
}

function findClosing(runes: string[], from: number, close: string[]): ClosingRes | null {
  for (let j = from; j + close.length <= runes.length; j++) {
    if (runes.slice(j, j + close.length).join('') === close.join('')) {
      return { content: runes.slice(from, j), next: j + close.length };
    }
  }
  return null;
}

function findLink(runes: string[], i: number): (ClosingRes & { url: string }) | null {
  for (let j = i + 1; j + 2 <= runes.length; j++) {
    if (runes[j] === ']' && runes[j + 1] === '(') {
      const content = runes.slice(i + 1, j);
      const urlStart = j + 2;
      const end = runes.indexOf(')', urlStart);
      if (end !== -1) {
        const url = runes.slice(urlStart, end).join('');
        if (url !== '') {
          return { content, next: end + 1, url };
        }
      }
      return null;
    }
  }
  return null;
}

// --- HTML-рендер ---

const TAG: Record<string, [string, string]> = {
  bold: ['<strong>', '</strong>'],
  italic: ['<em>', '</em>'],
  underline: ['<u>', '</u>'],
  strikethrough: ['<s>', '</s>'],
  code: ['<code>', '</code>'],
  pre: ['<pre>', '</pre>'],
  spoiler: ['<span class="spoiler">', '</span>'],
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(url: string): string | null {
  // Разрешаем только http/https (и относительные ссылки без схемы).
  if (/^(https?:)?\/\//i.test(url)) return url;
  return null;
}

/** Рендерит заметку (text + entities) в безопасный HTML. */
export function renderNoteHtml(text: string, entities: NoteEntity[]): string {
  const sorted = [...entities].sort((a, b) => a.offset - b.offset);
  let html = '';
  let pos = 0;
  for (const e of sorted) {
    if (e.offset < pos || e.length <= 0) continue;
    html += escapeHtml(text.slice(pos, e.offset));
    const frag = text.slice(e.offset, e.offset + e.length);
    if (e.type === 'text_link') {
      const href = safeUrl(e.url ?? '');
      if (href !== null) {
        html += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(frag)}</a>`;
      } else {
        html += escapeHtml(frag);
      }
    } else {
      const tag = TAG[e.type];
      html += tag ? tag[0] + escapeHtml(frag) + tag[1] : escapeHtml(frag);
    }
    pos = e.offset + e.length;
  }
  html += escapeHtml(text.slice(pos));
  return html;
}

/** HTML первой строки заметки (для карточки-превью). */
export function firstLineHtml(text: string, entities: NoteEntity[]): string {
  const nl = text.indexOf('\n');
  const line = nl === -1 ? text : text.slice(0, nl);
  const lineEntities: NoteEntity[] = [];
  for (const e of entities) {
    if (e.offset >= line.length) continue;
    const end = Math.min(e.offset + e.length, line.length);
    if (end <= e.offset) continue;
    lineEntities.push({ ...e, length: end - e.offset });
  }
  return renderNoteHtml(line, lineEntities);
}

// --- entities → markdown (для редактора) ---

interface Marker {
  open: string;
  close: string;
}

function markerFor(type: string, url?: string): Marker | null {
  switch (type) {
    case 'bold':
      return { open: '**', close: '**' };
    case 'italic':
      return { open: '*', close: '*' };
    case 'underline':
      return { open: '__', close: '__' };
    case 'strikethrough':
      return { open: '~~', close: '~~' };
    case 'code':
      return { open: '`', close: '`' };
    case 'pre':
      return { open: '```', close: '```' };
    case 'spoiler':
      return { open: '||', close: '||' };
    case 'text_link':
      return { open: '[', close: `](${url ?? ''})` };
    default:
      return null;
  }
}

/** Восстанавливает markdown-разметку из text + entities (для редактирования). */
export function markdownFromEntities(text: string, entities: NoteEntity[]): string {
  interface Event {
    pos: number;
    open?: Marker;
    close?: string;
  }
  const events: Event[] = [];
  for (const e of entities) {
    const m = markerFor(e.type, e.url);
    if (m === null) continue;
    events.push({ pos: e.offset, open: m });
    events.push({ pos: e.offset + e.length, close: m.close });
  }
  events.sort((a, b) => {
    if (a.pos !== b.pos) return a.pos - b.pos;
    // На одной позиции: сначала закрытия, потом открытия.
    if (a.open && !b.open) return 1;
    if (!a.open && b.open) return -1;
    return 0;
  });

  let out = '';
  let pos = 0;
  const stack: string[] = [];
  for (const ev of events) {
    if (ev.pos < pos) continue;
    out += text.slice(pos, ev.pos);
    pos = ev.pos;
    if (ev.open) {
      stack.push(ev.open.close);
      out += ev.open.open;
    } else {
      const close = stack.pop();
      if (close !== undefined) out += close;
    }
  }
  out += text.slice(pos);
  return out;
}
