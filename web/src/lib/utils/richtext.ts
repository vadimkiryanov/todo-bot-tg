// Правка заметки «как просмотр» (настройка «правка без разметки»): вёрстка
// редактора — те же блоки и классы, что у показа заметки (utils/blocks.ts),
// поэтому правка выглядит точно как просмотр: крупные заголовки, отступы
// списков, настоящие жирный/курсив/код/ссылка.
//
// Маркеры строк (# / ## / - / 1. / - [ ]) в редакторе не показываются
// символами — их место занимает оформление блока; в тексте заметки они
// остаются как есть (их видит бот) и собираются обратно из вида блока.
// Инлайн-оформление живёт как entities Telegram (а не как **маркеры**: в
// поле с разметкой их пишет пользователь, здесь — тулбар). Смещения — в
// UTF-16 единицах, как у Telegram (String.slice совпадает).
//
// Модуль из двух частей: разбор/сборка (чистые функции) и операции над живой
// вёрсткой редактора (DOM, contenteditable).

import type { NoteEntity } from '../types/api';
import { clipEntities, parseNoteLines } from './blocks';
import { autoLinks, escapeHtml, markdownFromEntities, safeUrl } from './format';

export type RichBlockKind = 'h1' | 'h2' | 'ol' | 'list' | 'check' | 'text';

/** Содержимое блока: текст или инлайн-оформление (одна entity заметки). */
export type RichNode =
  | { kind: 'text'; text: string }
  /** auto — «голая» ссылка: в просмотре она становится ссылкой, но в заметке
   *  остаётся текстом, поэтому при разборе вёрстки такие узлы отбрасываются. */
  | { kind: 'fmt'; type: string; url?: string; auto?: boolean; children: RichNode[] };

export interface RichBlock {
  kind: RichBlockKind;
  /** Номер нумерованного пункта (kind 'ol') — авторская нумерация. */
  num?: number;
  /** Отметка чеклиста (kind 'check'). */
  checked?: boolean;
  content: RichNode[];
}

/** Маркер строки в тексте заметки — по виду блока. */
export function blockMarker(block: RichBlock): string {
  switch (block.kind) {
    case 'h1':
      return '# ';
    case 'h2':
      return '## ';
    case 'list':
      return '- ';
    case 'check':
      return block.checked === true ? '- [x] ' : '- [ ] ';
    case 'ol':
      return `${block.num ?? 1}. `;
    default:
      return '';
  }
}

/** Вид блока, если строка начинается с маркера разметки (правило ввода
 *  «# » → заголовок). Возвращает null для обычной строки. */
export function markerBlock(
  raw: string,
): { kind: RichBlockKind; markerLen: number; num: number; checked: boolean } | null {
  const line = parseNoteLines(raw)[0];
  if (line === undefined || line.kind === 'text') return null;
  return {
    kind: line.kind,
    markerLen: line.markerLen,
    num: line.kind === 'ol' ? Number(raw.slice(0, line.markerLen - 1)) || 1 : 1,
    checked: line.checked === true,
  };
}

/** Заметка (text + entities) → блоки вёрстки. Пустая заметка — одна пустая
 *  строка (в редакторе должно быть куда поставить каретку). */
export function noteToRich(text: string, entities: NoteEntity[]): RichBlock[] {
  const lines = parseNoteLines(text);
  if (lines.length === 0) return [{ kind: 'text', content: [] }];
  return lines.map((line) => {
    const from = line.start + line.markerLen;
    const raw = text.slice(from, line.end);
    const own = clipEntities(entities, from, line.end);
    // «Голые» ссылки показываем ссылками (в просмотре это делает linkifyHtml),
    // но не поверх оформления: у занятых участков приоритет у entities.
    const busy = own.map((e) => [e.offset, e.offset + e.length] as const);
    const links = autoLinks(raw)
      .filter((l) => !busy.some(([a, b]) => l.offset < b && a < l.offset + l.length))
      .map((l) => ({ type: 'text_link', offset: l.offset, length: l.length, url: l.href, auto: true }));
    const block: RichBlock = { kind: line.kind, content: buildInline(raw, [...own, ...links]) };
    if (line.kind === 'ol') block.num = Number(text.slice(line.start, from - 1)) || 1;
    if (line.kind === 'check') block.checked = line.checked === true;
    return block;
  });
}

/** Диапазон оформления внутри строки (entity заметки, дополненная признаком
 *  auto для «голых» ссылок). */
interface InlineRange {
  type: string;
  offset: number;
  length: number;
  url?: string;
  auto?: boolean;
}

/** Инлайн-содержимое строки → дерево узлов вёрстки. */
function buildInline(text: string, ranges: InlineRange[]): RichNode[] {
  const sorted = ranges
    .filter((r) => r.length > 0)
    .sort((a, b) => (a.offset !== b.offset ? a.offset - b.offset : b.length - a.length));
  return buildRange(text, 0, text.length, sorted);
}

function buildRange(text: string, from: number, to: number, ranges: InlineRange[]): RichNode[] {
  const out: RichNode[] = [];
  let pos = from;
  while (pos < to) {
    // При одном смещении первым берём самый длинный диапазон (обёртка), а
    // вложенные в него достанутся рекурсии.
    const outer = ranges.find((r) => r.offset === pos && r.offset + r.length <= to);
    if (outer !== undefined) {
      const inner = buildRange(
        text,
        outer.offset,
        outer.offset + outer.length,
        ranges.filter(
          (r) =>
            r !== outer && r.offset >= outer.offset && r.offset + r.length <= outer.offset + outer.length,
        ),
      );
      const node: RichNode = { kind: 'fmt', type: outer.type, children: inner };
      if (outer.url !== undefined) node.url = outer.url;
      if (outer.auto === true) node.auto = true;
      out.push(node);
      pos = outer.offset + outer.length;
      continue;
    }
    let next = to;
    for (const r of ranges) {
      if (r.offset > pos && r.offset < next) next = r.offset;
    }
    if (next <= pos) break;
    out.push({ kind: 'text', text: text.slice(pos, next) });
    pos = next;
  }
  return out;
}

/** Блоки вёрстки → заметка (text + entities). Маркеры строк возвращаются в
 *  текст, инлайн-оформление — в entities. */
export function richToNote(blocks: RichBlock[]): { text: string; entities: NoteEntity[] } {
  let text = '';
  const entities: NoteEntity[] = [];
  // Уже открытые форматы: одинаковые вложенные обёртки не плодят две entity.
  const open: string[] = [];

  const append = (nodes: RichNode[]): void => {
    for (const node of nodes) {
      if (node.kind === 'text') {
        text += node.text;
        continue;
      }
      const key = `${node.type}\u0000${node.url ?? ''}`;
      // auto-ссылка живёт только в вёрстке: в просмотре это ссылка, а в заметке
      // тот же адрес остаётся обычным текстом (entity не появляется).
      if (node.children.length === 0 || node.auto === true || open.includes(key)) {
        append(node.children);
        continue;
      }
      const offset = text.length;
      open.push(key);
      append(node.children);
      open.pop();
      const length = text.length - offset;
      if (length > 0) {
        entities.push({
          type: node.type,
          offset,
          length,
          ...(node.url !== undefined ? { url: node.url } : {}),
        });
      }
    }
  };

  blocks.forEach((block, index) => {
    if (index > 0) text += '\n';
    text += blockMarker(block);
    append(block.content);
  });

  return { text, entities: mergeAdjacent(entities) };
}

/** Соседние одинаковые entities — в одну (иначе в правке-разметке рядом
 *  окажутся два маркера подряд: «**a****b**»). */
function mergeAdjacent(entities: NoteEntity[]): NoteEntity[] {
  const sorted = [...entities].sort((a, b) => a.offset - b.offset);
  const out: NoteEntity[] = [];
  for (const e of sorted) {
    const prev = out[out.length - 1];
    if (
      prev !== undefined &&
      prev.type === e.type &&
      (prev.url ?? '') === (e.url ?? '') &&
      prev.offset + prev.length === e.offset
    ) {
      prev.length += e.length;
      continue;
    }
    out.push({ ...e });
  }
  return out;
}

/** Markdown, которым вёрстка описывает заметку (для поля с разметкой и для
 *  сравнения «есть ли правки»). Собирается из вёрстки, а не из исходной
 *  разметки: entity, разрезанная переносом строки, в вёрстке даёт два маркера
 *  — иначе нетронутая заметка выглядела бы изменённой. */
export function richMarkdown(text: string, entities: NoteEntity[]): string {
  const note = richToNote(noteToRich(text, entities));
  return markdownFromEntities(note.text, note.entities);
}

// ── Вёрстка: HTML для редактора ─────────────────────────────────────────

const FMT_TAGS: Record<string, string> = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  strikethrough: 's',
  code: 'code',
  pre: 'pre',
  spoiler: 'span',
};

/** Класс блока вёрстки: те же классы, что у показа заметки. */
const BLOCK_CLASS: Record<RichBlockKind, string> = {
  h1: 'note-h1',
  h2: 'note-h2',
  ol: 'note-li',
  list: 'note-li',
  check: 'note-li',
  text: 'note-line',
};

const BLOCK_SELECTOR = '.note-h1, .note-h2, .note-li, .note-line, .note-blank';

/** Служебный узел блока (не редактируется: каретка в него не встаёт). */
function chromeHtml(kind: RichBlockKind, num: number, checked: boolean, checkable: boolean): string {
  switch (kind) {
    case 'list':
      return '<span class="note-bullet" contenteditable="false">•</span>';
    case 'ol':
      // Точка после номера — как в просмотре (там её рисует маркер строки).
      return `<span class="note-ol-num" contenteditable="false">${num}.</span>`;
    case 'check':
      return checkable
        ? `<button type="button" class="note-cb btn-press" contenteditable="false" aria-pressed="${checked}" aria-label="${checked ? 'Снять отметку' : 'Отметить выполненным'}"></button>`
        : '<span class="note-cb note-cb-static" contenteditable="false"></span>';
    default:
      return '';
  }
}

function inlineHtml(nodes: RichNode[]): string {
  let html = '';
  for (const node of nodes) {
    if (node.kind === 'text') {
      html += escapeHtml(node.text);
      continue;
    }
    const inner = inlineHtml(node.children);
    if (node.type === 'text_link') {
      const href = safeUrl(node.url ?? '');
      if (href === null) {
        html += inner;
        continue;
      }
      const auto = node.auto === true ? ' data-auto="1"' : '';
      html += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"${auto}>${inner}</a>`;
      continue;
    }
    const tag = FMT_TAGS[node.type];
    if (tag === undefined) {
      html += inner;
      continue;
    }
    const cls = node.type === 'spoiler' ? ' class="spoiler"' : '';
    html += `<${tag}${cls}>${inner}</${tag}>`;
  }
  return html;
}

/** HTML одного блока: содержимое всегда в одном span.note-li-text — по нему
 *  (а не по всему блоку) ходят каретка и разбор вёрстки. */
function blockHtml(block: RichBlock, checkable: boolean): string {
  const inner = inlineHtml(block.content);
  const checked = block.checked === true;
  if (block.kind === 'check') {
    const cls = `note-li-text${checked ? ' note-checked-text' : ''}`;
    return `<div class="note-li${checked ? ' checked' : ''}">${chromeHtml('check', 1, checked, checkable)}<span class="${cls}">${inner === '' ? '<br>' : inner}</span></div>`;
  }
  const body = `<span class="note-li-text">${inner === '' ? '<br>' : inner}</span>`;
  switch (block.kind) {
    case 'h1':
      return `<div class="note-h1">${body}</div>`;
    case 'h2':
      return `<div class="note-h2">${body}</div>`;
    case 'list':
      return `<div class="note-li">${chromeHtml('list', 1, false, checkable)}${body}</div>`;
    case 'ol':
      return `<div class="note-li">${chromeHtml('ol', block.num ?? 1, false, checkable)}${body}</div>`;
    default:
      return inner === '' ? `<div class="note-blank">${body}</div>` : `<div class="note-line">${body}</div>`;
  }
}

/** HTML вёрстки редактора. checkable — рисовать чекбоксы кнопками (активная
 *  заметка), иначе — статичными квадратиками (выполненная/архивная). */
export function richEditorHtml(blocks: RichBlock[], checkable = false): string {
  let html = '';
  for (const block of blocks) html += blockHtml(block, checkable);
  return html;
}

// ── Живой редактор: разбор вёрстки ──────────────────────────────────────

const INLINE_TAGS: Record<string, string> = {
  B: 'bold',
  STRONG: 'bold',
  I: 'italic',
  EM: 'italic',
  U: 'underline',
  S: 'strikethrough',
  STRIKE: 'strikethrough',
  DEL: 'strikethrough',
  CODE: 'code',
  PRE: 'pre',
};

/** Теги, которые браузер может вставить сам (Enter, paste): их содержимое
 *  разворачиваем, а перенос перед ними сохраняем переносом строки. */
const BLOCK_TAGS = new Set(['DIV', 'P', 'SECTION', 'ARTICLE', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'H1', 'H2', 'H3']);

function element(tag: string, cls: string, text?: string): HTMLElement {
  const el = document.createElement(tag);
  el.className = cls;
  el.contentEditable = 'false';
  if (text !== undefined) el.textContent = text;
  return el;
}

/** Вид блока вёрстки — по классу и служебному узлу. */
export function editorBlockKindOf(block: HTMLElement): RichBlockKind {
  if (block.classList.contains('note-h1')) return 'h1';
  if (block.classList.contains('note-h2')) return 'h2';
  if (block.classList.contains('note-li')) {
    if (block.querySelector(':scope > .note-cb') !== null) return 'check';
    if (block.querySelector(':scope > .note-ol-num') !== null) return 'ol';
    return 'list';
  }
  return 'text';
}

/** Узел содержимого блока — то, что правит пользователь. */
function contentOf(block: HTMLElement): HTMLElement {
  const el = block.querySelector(':scope > .note-li-text');
  return el instanceof HTMLElement ? el : block;
}

/** Блок вёрстки, внутри которого лежит узел (или ближайший к нему). */
function blockOfNode(root: HTMLElement, node: Node | null): HTMLElement | null {
  let el: Node | null = node;
  while (el !== null && el.parentElement !== root) el = el.parentElement;
  return el instanceof HTMLElement && el.matches(BLOCK_SELECTOR) ? el : null;
}

/** Блок под кареткой (null — каретка вне вёрстки редактора). */
export function editorBlockAt(root: HTMLElement): HTMLElement | null {
  const range = editorRange(root);
  return range === null ? null : blockOfNode(root, range.startContainer);
}

/** Блок вёрстки, в котором лежит узел (клик по служебному узлу блока). */
export function richBlockOf(node: Node | null): HTMLElement | null {
  let el = node instanceof HTMLElement ? node : (node?.parentElement ?? null);
  while (el !== null && !el.matches(BLOCK_SELECTOR)) el = el.parentElement;
  return el;
}

/** Выделение в вёрстке правки — копия диапазона (её возвращает restoreRange,
 *  когда фокус из правки всё же уходил: форма ссылки, кнопка панели). */
export function currentRange(root: HTMLElement): Range | null {
  const range = editorRange(root);
  return range === null ? null : range.cloneRange();
}

/** Вернуть выделение, снятое currentRange. Диапазон мог устареть (узел
    удалён) — тогда просто ничего не делаем. */
export function restoreRange(range: Range | null): void {
  if (range === null) return;
  const sel = window.getSelection();
  if (sel === null) return;
  try {
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    return;
  }
}

function editorBlocks(root: HTMLElement): HTMLElement[] {
  return Array.from(root.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.matches(BLOCK_SELECTOR),
  );
}

function editorRange(root: HTMLElement): Range | null {
  const sel = window.getSelection();
  if (sel === null || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  return root.contains(range.commonAncestorContainer) ? range : null;
}

/** Разбор живого содержимого в узлы вёрстки. */
function nodesFromDom(el: Node): RichNode[] {
  const out: RichNode[] = [];
  const children = Array.from(el.childNodes);
  children.forEach((child, index) => {
    if (child.nodeType === Node.TEXT_NODE) {
      // Неразрывный пробел браузер ставит сам (двойной пробел, конец строки) —
      // в заметке он должен остаться обычным.
      const text = (child as Text).data.replace(/\u00A0/g, ' ');
      if (text !== '') out.push({ kind: 'text', text });
      return;
    }
    if (!(child instanceof HTMLElement)) return;
    if (child.tagName === 'BR') {
      // <br> в конце блока — заглушка пустой строки, а не перенос.
      if (index === children.length - 1) return;
      out.push({ kind: 'text', text: '\n' });
      return;
    }
    const inner = nodesFromDom(child);
    if (child.dataset.auto === '1') {
      out.push(...inner);
      return;
    }
    const type =
      child.tagName === 'A'
        ? 'text_link'
        : child.classList.contains('spoiler')
          ? 'spoiler'
          : INLINE_TAGS[child.tagName];
    if (type === undefined) {
      if (BLOCK_TAGS.has(child.tagName) && out.length > 0) out.push({ kind: 'text', text: '\n' });
      out.push(...inner);
      return;
    }
    if (inner.length === 0) return;
    out.push({
      kind: 'fmt',
      type,
      ...(type === 'text_link' ? { url: child.getAttribute('href') ?? '' } : {}),
      children: inner,
    });
  });
  return out;
}

/** Содержимое блока — только заглушка <br>: строка пуста. */
function isBlank(nodes: RichNode[]): boolean {
  return (
    nodes.length === 0 ||
    (nodes.length === 1 && nodes[0].kind === 'text' && nodes[0].text === '\n')
  );
}

/** Живая вёрстка → блоки. */
export function editorDomToRich(root: HTMLElement): RichBlock[] {
  const blocks: RichBlock[] = [];
  for (const el of editorBlocks(root)) {
    const kind = editorBlockKindOf(el);
    const content = nodesFromDom(contentOf(el));
    const block: RichBlock = { kind, content: isBlank(content) ? [] : content };
    if (kind === 'ol') {
      const num = el.querySelector(':scope > .note-ol-num');
      block.num = Number((num?.textContent ?? '').trim()) || 1;
    }
    if (kind === 'check') block.checked = el.classList.contains('checked');
    blocks.push(block);
  }
  return blocks.length === 0 ? [{ kind: 'text', content: [] }] : blocks;
}

/** Markdown текущей вёрстки — то, что уйдёт в сохранение. */
export function richDraftOf(root: HTMLElement): string {
  const note = richToNote(editorDomToRich(root));
  return markdownFromEntities(note.text, note.entities);
}

// ── Живой редактор: каретка ─────────────────────────────────────────────

/** Символьное смещение каретки внутри элемента (или null — каретка не тут). */
export function caretOffsetIn(el: HTMLElement): number | null {
  const sel = window.getSelection();
  if (sel === null || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return null;
  const before = document.createRange();
  before.selectNodeContents(el);
  before.setEnd(range.startContainer, range.startOffset);
  return before.toString().length;
}

/** Точка (узел, смещение) для символьного смещения внутри элемента. */
function pointAt(el: Node, offset: number): { node: Node; offset: number } | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node as Text;
    if (remaining <= text.data.length) return { node: text, offset: remaining };
    remaining -= text.data.length;
  }
  return null;
}

/** Поставить каретку в символьное смещение внутри элемента. */
export function setCaretOffset(el: HTMLElement, offset: number): void {
  const sel = window.getSelection();
  if (sel === null) return;
  const range = document.createRange();
  const point = pointAt(el, offset);
  if (point !== null) {
    range.setStart(point.node, point.offset);
  } else {
    range.selectNodeContents(el);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Поставить каретку по смещению в plain-тексте заметки (тап по просмотру):
 *  вёрстка построена из тех же строк, поэтому номер блока совпадает. */
export function placeCaretAtPlainOffset(root: HTMLElement, text: string, plain: number): void {
  const lines = parseNoteLines(text);
  const blocks = editorBlocks(root);
  for (let i = 0; i < blocks.length && i < lines.length; i++) {
    const line = lines[i];
    if (plain > line.end && i < blocks.length - 1 && i < lines.length - 1) continue;
    const contentStart = line.start + line.markerLen;
    setCaretOffset(contentOf(blocks[i]), Math.max(0, Math.min(plain, line.end) - contentStart));
    return;
  }
  const last = blocks[blocks.length - 1];
  if (last !== undefined) setCaretOffset(contentOf(last), 0);
}

/** Поставить каретку в конец вёрстки — когда в неё входят программно
 *  (кнопка-карандаш, панель форматирования без каретки в тексте). */
export function focusEditorEnd(root: HTMLElement): void {
  const blocks = editorBlocks(root);
  const last = blocks[blocks.length - 1];
  if (last === undefined) return;
  const content = contentOf(last);
  setCaretOffset(content, plainTextOf(content).length);
}

/** Текст блока без служебных узлов (маркеров строк в вёрстке нет). */
function plainTextOf(el: Node): string {
  return (el.textContent ?? '').replace(/\u00A0/g, ' ');
}

// ── Живой редактор: правки ──────────────────────────────────────────────

/** Сменить вид блока, не пересоздавая содержимое: каретка остаётся на месте
 *  (текст не трогаем — меняются класс блока и служебный узел перед ним). */
export function setBlockKind(
  block: HTMLElement,
  kind: RichBlockKind,
  num = 1,
  checked = false,
): void {
  const content = contentOf(block);
  const old = block.querySelector(':scope > .note-bullet, :scope > .note-ol-num, :scope > .note-cb');
  old?.remove();
  const html = chromeHtml(kind, num, checked, true);
  if (html !== '') {
    const holder = document.createElement('template');
    holder.innerHTML = html;
    const node = holder.content.firstElementChild;
    if (node !== null) block.insertBefore(node, content);
  }
  const empty = plainTextOf(content) === '';
  block.className = kind === 'text' && empty ? 'note-blank' : BLOCK_CLASS[kind];
  if (kind === 'check' && checked) block.classList.add('checked');
  content.classList.toggle('note-checked-text', kind === 'check' && checked);
}

/** Тулбар: поставить/снять структурный маркер текущей строки. */
export function toggleBlockKind(root: HTMLElement, kind: RichBlockKind): void {
  const block = editorBlockAt(root);
  if (block === null) return;
  if (editorBlockKindOf(block) === kind) {
    setBlockKind(block, 'text');
    return;
  }
  // Нумерованный список продолжает предыдущий номер, если строка идёт следом.
  let num = 1;
  if (kind === 'ol') {
    const prev = block.previousElementSibling;
    if (prev instanceof HTMLElement && editorBlockKindOf(prev) === 'ol') {
      const prevNum = Number(plainTextOf(prev.querySelector(':scope > .note-ol-num') ?? prev)) || 1;
      num = prevNum + 1;
    }
  }
  setBlockKind(block, kind, num, false);
}

/** Тап по чекбоксу в правке: [ ] ↔ [x] (текст и каретка не трогаются). */
export function toggleBlockChecked(block: HTMLElement): void {
  const checked = !block.classList.contains('checked');
  const btn = block.querySelector(':scope > .note-cb');
  block.classList.toggle('checked', checked);
  contentOf(block).classList.toggle('note-checked-text', checked);
  if (btn instanceof HTMLElement) {
    btn.setAttribute('aria-pressed', String(checked));
    btn.setAttribute('aria-label', checked ? 'Снять отметку' : 'Отметить выполненным');
  }
}

/** Правило ввода: маркер в начале строки превращает её в блок. Набранный
 *  маркер стирается — в заметке он появится из вида блока. */
export function applyTypedMarkerRule(root: HTMLElement): void {
  const block = editorBlockAt(root);
  if (block === null || editorBlockKindOf(block) !== 'text') return;
  const content = contentOf(block);
  const marker = markerBlock(plainTextOf(content));
  if (marker === null) return;
  const caret = caretOffsetIn(content);
  if (caret === null || caret < marker.markerLen) return;
  const from = pointAt(content, 0);
  const to = pointAt(content, marker.markerLen);
  if (from === null || to === null) return;
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  range.deleteContents();
  setBlockKind(block, marker.kind, marker.num, marker.checked);
  setCaretOffset(content, 0);
}

/** Вставить новый пустой блок после указанного (вид — как у образца). */
function insertBlockAfter(block: HTMLElement, kind: RichBlockKind, num: number): HTMLElement {
  const holder = document.createElement('template');
  holder.innerHTML = blockHtml({ kind, num, checked: false, content: [] }, true);
  const node = holder.content.firstElementChild;
  const next = node instanceof HTMLElement ? node : block;
  block.after(next);
  return next;
}

/** Смещение каретки в символах внутри содержимого блока. Каретка может стоять
 *  не в тексте, а на самом блоке — рядом со служебным узлом строки (буллетом,
 *  чекбоксом): тогда она считается в начале текста, если узел стоит после неё,
 *  и в конце, если узел до неё. */
function caretInBlockContent(block: HTMLElement, range: Range): number {
  const content = contentOf(block);
  if (content.contains(range.startContainer)) return caretOffsetIn(content) ?? 0;
  if (range.startContainer === block) {
    const contentIndex = Array.prototype.indexOf.call(block.childNodes, content);
    if (range.startOffset > contentIndex) return plainTextOf(content).length;
  }
  return 0;
}

/** Enter: разделить блок по каретке. Новый блок наследует формат строки
 *  (у нумерованного — следующий номер, у чеклиста — снятая галочка), а
 *  пустой пункт формат закрывает: маркер снимается, как в markdown-редакторах.
 *  Возвращает false, если Enter надо обработать нативно (выделение/чужой узел). */
export function splitBlockOnEnter(root: HTMLElement): boolean {
  const range = editorRange(root);
  if (range === null || !range.collapsed) return false;
  const block = blockOfNode(root, range.startContainer);
  if (block === null) return false;
  const content = contentOf(block);
  const kind = editorBlockKindOf(block);
  if (plainTextOf(content).trim() === '') {
    if (kind === 'text') {
      // Пустая строка остаётся на месте, а под ней появляется следующая:
      // иначе Enter на пустой строке не делал ничего, и подряд можно было
      // создать только одну строку — как в обычном многострочном вводе.
      const blank = insertBlockAfter(block, 'text', 1);
      setCaretOffset(contentOf(blank), 0);
      return true;
    }
    // Пустой пункт списка — выходим из формата (у чеклиста снимаем галочку).
    setBlockKind(block, 'text');
    return true;
  }
  const num = kind === 'ol' ? Number(plainTextOf(block.querySelector(':scope > .note-ol-num') ?? block)) || 1 : 1;
  const tail = document.createRange();
  tail.selectNodeContents(content);
  // Каретку берём символьным смещением: она может стоять и в тексте, и рядом
  // со служебным узлом блока — делим по одному и тому же месту содержимого.
  const at = caretInBlockContent(block, range);
  const from = pointAt(content, at);
  if (from !== null) tail.setStart(from.node, from.offset);
  const frag = tail.extractContents();
  const next = insertBlockAfter(block, kind, kind === 'ol' ? num + 1 : num);
  const nextContent = contentOf(next);
  nextContent.replaceChildren(frag);
  if (plainTextOf(nextContent) === '') nextContent.replaceChildren(document.createElement('br'));
  if (plainTextOf(content) === '') content.replaceChildren(document.createElement('br'));
  // Обычная строка: пустая — отступ (note-blank), с текстом — строка (note-line).
  if (kind === 'text') {
    setBlockKind(block, 'text');
    setBlockKind(next, 'text');
  }
  setCaretOffset(nextContent, 0);
  return true;
}

/** Слить блок с предыдущим (Backspace в начале строки, Delete в конце).
 *  Содержимое переезжает в конец предыдущего блока, каретка — на стык. */
function mergeBlocks(prev: HTMLElement, block: HTMLElement): void {
  const prevContent = contentOf(prev);
  const content = contentOf(block);
  if (plainTextOf(prevContent) === '') prevContent.replaceChildren();
  const junction = plainTextOf(prevContent).length;
  prevContent.append(...Array.from(content.childNodes));
  block.remove();
  if (plainTextOf(prevContent) === '') prevContent.replaceChildren(document.createElement('br'));
  setBlockKind(prev, editorBlockKindOf(prev));
  setCaretOffset(prevContent, junction);
}

/** Backspace в начале строки: снять маркер (выход из формата) или склеить с
 *  предыдущей строкой. Возвращает false, если нужен нативный Backspace. */
export function backspaceAtBlockStart(root: HTMLElement): boolean {
  const range = editorRange(root);
  if (range === null) return false;
  const block = blockOfNode(root, range.startContainer);
  if (block === null) return false;
  // Каретка рядом со служебным узлом строки (буллетом, чекбоксом) тоже
  // считается началом — в текст строки она не попала.
  if (caretInBlockContent(block, range) !== 0) return false;
  if (editorBlockKindOf(block) !== 'text') {
    setBlockKind(block, 'text');
    return true;
  }
  const prev = block.previousElementSibling;
  if (!(prev instanceof HTMLElement) || !prev.matches(BLOCK_SELECTOR)) return false;
  if (plainTextOf(contentOf(block)) === '') {
    // Пустая строка — просто убираем её.
    block.remove();
    setCaretOffset(contentOf(prev), plainTextOf(contentOf(prev)).length);
    return true;
  }
  mergeBlocks(prev, block);
  return true;
}

/** Delete в конце строки: склеить со следующей. */
export function deleteAtBlockEnd(root: HTMLElement): boolean {
  const range = editorRange(root);
  if (range === null) return false;
  const block = blockOfNode(root, range.startContainer);
  if (block === null) return false;
  const content = contentOf(block);
  if (caretInBlockContent(block, range) !== plainTextOf(content).length) return false;
  const next = block.nextElementSibling;
  if (!(next instanceof HTMLElement) || !next.matches(BLOCK_SELECTOR)) return false;
  if (plainTextOf(contentOf(next)) === '') {
    next.remove();
    return true;
  }
  mergeBlocks(block, next);
  return true;
}

/** Вставка из буфера: только простой текст (чужие теги и стили в заметку не
 *  попадают). Переносы строк остаются переносами. */
export function insertPlainText(root: HTMLElement, text: string): void {
  let range = editorRange(root);
  if (range === null) return;
  const clean = text.replace(/\r\n?/g, '\n').replace(/\u00A0/g, ' ');
  if (clean === '') return;
  const block = blockOfNode(root, range.startContainer);
  if (block !== null && plainTextOf(contentOf(block)) === '') {
    // Пустая строка: стираем заглушку <br>, текст встаёт на её место.
    contentOf(block).replaceChildren();
    setCaretOffset(contentOf(block), 0);
    range = editorRange(root) ?? range;
  }
  range.deleteContents();
  const node = document.createTextNode(clean);
  range.insertNode(node);
  const after = document.createRange();
  after.setStart(node, node.data.length);
  after.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(after);
  if (block !== null && editorBlockKindOf(block) === 'text') {
    // Строка перестала быть пустой — вернуть ей обычный вид (не .note-blank).
    setBlockKind(block, 'text');
    setCaretOffset(contentOf(block), plainTextOf(contentOf(block)).length);
  }
}

// ── Живой редактор: инлайн-оформление (тулбар) ──────────────────────────

function createFormat(type: string, url?: string): HTMLElement | null {
  if (type === 'text_link') {
    const href = safeUrl(url ?? '');
    if (href === null) return null;
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }
  if (type === 'spoiler') return element('span', 'spoiler');
  const tag = FMT_TAGS[type];
  return tag === undefined ? null : document.createElement(tag);
}

/** Ближайшая обёртка этого оформления (не выходя за пределы блока). */
function formatAncestor(node: Node | null, type: string): HTMLElement | null {
  let el = node instanceof HTMLElement ? node : (node?.parentElement ?? null);
  while (el !== null) {
    if (el.tagName === 'A') {
      if (type === 'text_link') return el;
    } else if (el.classList.contains('spoiler')) {
      if (type === 'spoiler') return el;
    } else if (INLINE_TAGS[el.tagName] === type) {
      return el;
    }
    if (el.matches(BLOCK_SELECTOR) || el.classList.contains('note-li-text')) return null;
    el = el.parentElement;
  }
  return null;
}

function selectContents(node: Node): void {
  const sel = window.getSelection();
  if (sel === null) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  sel.removeAllRanges();
  sel.addRange(range);
}

function wrapRange(range: Range, type: string, url?: string): boolean {
  const wrapper = createFormat(type, url);
  if (wrapper === null) return false;
  if (range.collapsed) {
    // Без выделения — подставляем слово-заготовку, как **текст** в поле.
    const text = document.createTextNode(type === 'text_link' ? 'ссылка' : 'текст');
    wrapper.appendChild(text);
    range.insertNode(wrapper);
    selectContents(text);
    return true;
  }
  try {
    range.surroundContents(wrapper);
  } catch {
    // Выделение задело узлы частично — переносим фрагмент целиком.
    const frag = range.extractContents();
    wrapper.appendChild(frag);
    range.insertNode(wrapper);
  }
  selectContents(wrapper);
  return true;
}

/** Тулбар: применить оформление к выделению (повторный клик — снять).
 *  Выделение через несколько строк разбивается по блокам: строка — один блок
 *  вёрстки, обёртка не может перешагнуть его границу. */
export function applyInlineFormat(root: HTMLElement, type: string, url?: string): void {
  const range = editorRange(root);
  if (range === null) return;
  if (range.collapsed) {
    wrapRange(range, type, url);
    return;
  }
  const start = { node: range.startContainer, offset: range.startOffset };
  const end = { node: range.endContainer, offset: range.endOffset };
  const first = blockOfNode(root, start.node);
  const last = blockOfNode(root, end.node);
  if (first === null || last === null) return;
  const blocks = editorBlocks(root);
  for (const block of blocks) {
    if (blocks.indexOf(block) < blocks.indexOf(first) || blocks.indexOf(block) > blocks.indexOf(last)) {
      continue;
    }
    const content = contentOf(block);
    const sub = document.createRange();
    sub.selectNodeContents(content);
    if (content.contains(start.node)) sub.setStart(start.node, start.offset);
    if (content.contains(end.node)) sub.setEnd(end.node, end.offset);
    if (sub.collapsed) continue;
    const ancestor = formatAncestor(sub.startContainer, type);
    if (ancestor !== null && ancestor === formatAncestor(sub.endContainer, type)) {
      const parent = ancestor.parentElement;
      ancestor.replaceWith(...Array.from(ancestor.childNodes));
      parent?.normalize();
      continue;
    }
    wrapRange(sub, type, url);
  }
}

// ── Живой редактор: что действует под кареткой (подсветка панели) ───────

/** Оформление, действующее под кареткой, — по нему панель подсвечивает кнопки. */
export interface ActiveFormats {
  bold: boolean;
  italic: boolean;
  code: boolean;
  link: boolean;
  h1: boolean;
  h2: boolean;
  ol: boolean;
  list: boolean;
  check: boolean;
}

/** Ничего не действует: начальное значение и сброс, когда правка закрыта. */
export const NO_FORMATS: ActiveFormats = {
  bold: false,
  italic: false,
  code: false,
  link: false,
  h1: false,
  h2: false,
  ol: false,
  list: false,
  check: false,
};

/** Один ли и тот же набор — чтобы не перерисовывать панель на каждое
 *  движение каретки (выделение меняется постоянно). */
export function sameFormats(a: ActiveFormats, b: ActiveFormats): boolean {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.code === b.code &&
    a.link === b.link &&
    a.h1 === b.h1 &&
    a.h2 === b.h2 &&
    a.ol === b.ol &&
    a.list === b.list &&
    a.check === b.check
  );
}

/** Что действует в каретке: инлайн-оформление — по обёртке вокруг неё (как
 *  applyInlineFormat), вид строки — по блоку (как toggleBlockKind). */
export function activeFormats(root: HTMLElement): ActiveFormats {
  const range = editorRange(root);
  if (range === null) return NO_FORMATS;
  const node = range.startContainer;
  const block = blockOfNode(root, node);
  const kind = block === null ? 'text' : editorBlockKindOf(block);
  return {
    bold: formatAncestor(node, 'bold') !== null,
    italic: formatAncestor(node, 'italic') !== null,
    code: formatAncestor(node, 'code') !== null,
    link: formatAncestor(node, 'text_link') !== null,
    h1: kind === 'h1',
    h2: kind === 'h2',
    ol: kind === 'ol',
    list: kind === 'list',
    check: kind === 'check',
  };
}
