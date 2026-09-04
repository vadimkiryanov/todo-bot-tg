import { describe, expect, it } from 'vitest';
import { parseNoteLines, renderNoteBlocksHtml } from './blocks';

describe('parseNoteLines', () => {
  it('распознаёт заголовки, список, чеклист и текст', () => {
    const lines = parseNoteLines('# Заголовок\n## Под\n- пункт\n- [ ] задача\n- [x] сделано\nобычный');
    expect(lines).toEqual([
      { kind: 'h1', start: 0, end: 11, markerLen: 2 },
      { kind: 'h2', start: 12, end: 18, markerLen: 3 },
      { kind: 'list', start: 19, end: 26, markerLen: 2 },
      { kind: 'check', start: 27, end: 39, markerLen: 6, checked: false },
      { kind: 'check', start: 40, end: 53, markerLen: 6, checked: true },
      { kind: 'text', start: 54, end: 61, markerLen: 0 },
    ]);
  });

  it('«#» без пробела и «##» без текста — не маркеры', () => {
    const lines = parseNoteLines('#нет\n##\n-нет');
    expect(lines.map((l) => l.kind)).toEqual(['text', 'text', 'text']);
  });

  it('пустая строка — отдельная строка типа text', () => {
    const lines = parseNoteLines('а\n\nб');
    expect(lines).toHaveLength(3);
    expect(lines[1].kind).toBe('text');
    expect(lines[1].start).toBe(2);
    expect(lines[1].end).toBe(2);
  });
});

describe('renderNoteBlocksHtml', () => {
  it('экранирует HTML внутри строк', () => {
    const html = renderNoteBlocksHtml('# <b>x</b>', []);
    expect(html).toBe('<div class="note-h1">&lt;b&gt;x&lt;/b&gt;</div>');
  });

  it('заголовки и обычные строки получают свои классы', () => {
    const html = renderNoteBlocksHtml('# А\nтекст', []);
    expect(html).toBe(
      '<div class="note-h1">А</div><div class="note-line">текст</div>',
    );
  });

  it('список: маркер-буллет и текст в отдельном span', () => {
    const html = renderNoteBlocksHtml('- пункт', []);
    expect(html).toBe(
      '<div class="note-li"><span class="note-bullet">•</span><span class="note-li-text">пункт</span></div>',
    );
  });

  it('чеклист: отмеченный пункт — с классом checked и зачёркнутым текстом', () => {
    const html = renderNoteBlocksHtml('- [x] готово', []);
    expect(html).toBe(
      '<div class="note-li checked"><span class="note-cb note-cb-static"></span><span class="note-li-text note-checked-text">готово</span></div>',
    );
  });

  it('checkable: чекбокс — кнопка с data-cb на позиции маркера', () => {
    const html = renderNoteBlocksHtml('- [ ] задача', [], true);
    expect(html).toBe(
      '<div class="note-li"><button type="button" class="note-cb" data-cb="0" aria-pressed="false" aria-label="Отметить выполненным"></button><span class="note-li-text">задача</span></div>',
    );
  });

  it('пустая строка — блок-отступ, а не схлопывание в ноль', () => {
    const html = renderNoteBlocksHtml('а\n\nб', []);
    expect(html).toContain('<div class="note-blank"></div>');
  });

  it('inline-entities внутри строки сохраняют смещения (маркер исключён)', () => {
    // '*' маркер курсива: offset считается по чистому тексту строки после '## '.
    const html = renderNoteBlocksHtml('## Заголовок', [
      { type: 'bold', offset: 3, length: 9 },
    ]);
    expect(html).toBe('<div class="note-h2"><strong>Заголовок</strong></div>');
  });

  it('entity, пересекающий границу строки, обрезается по строкам', () => {
    // Курсив 2..10 в сыром тексте покрывает «пункт» и начало «хвост».
    const html = renderNoteBlocksHtml('- пункт\nхвост', [
      { type: 'italic', offset: 2, length: 8 },
    ]);
    expect(html).toBe(
      '<div class="note-li"><span class="note-bullet">•</span><span class="note-li-text"><em>пункт</em></span></div><div class="note-line"><em>хв</em>ост</div>',
    );
  });

  it('голый URL внутри строки не ломает ссылку после маркера', () => {
    const html = renderNoteBlocksHtml('- https://x.io', []);
    expect(html).toContain('class="note-li-text"><a href="https://x.io"');
  });
});
