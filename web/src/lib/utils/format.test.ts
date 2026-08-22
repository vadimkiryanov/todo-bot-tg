import { describe, expect, it } from 'vitest';
import {
  firstLineHtml,
  markdownFromEntities,
  parseMarkdown,
  renderNoteHtml,
} from './format';

describe('parseMarkdown', () => {
  it('разбирает **bold**, *italic*, `code` и [ссылка](url)', () => {
    const { text, entities } = parseMarkdown(
      'Купить **молоко**, *срочно* и `позвонить` на [сайт](https://x.io)',
    );
    expect(text).toBe('Купить молоко, срочно и позвонить на сайт');
    expect(entities).toEqual([
      { type: 'bold', offset: 7, length: 6 },
      { type: 'italic', offset: 15, length: 6 },
      { type: 'code', offset: 24, length: 9 },
      { type: 'text_link', offset: 37, length: 4, url: 'https://x.io' },
    ]);
  });

  it('считает UTF-16: эмодзи = 2 единицы', () => {
    const { text, entities } = parseMarkdown('🛒 **молоко**');
    expect(text).toBe('🛒 молоко');
    expect(entities).toEqual([{ type: 'bold', offset: 3, length: 6 }]);
  });

  it('незакрытый маркер остаётся литералом', () => {
    const { text, entities } = parseMarkdown('Купить *молоко');
    expect(text).toBe('Купить *молоко');
    expect(entities).toEqual([]);
  });
});

describe('renderNoteHtml', () => {
  it('экранирует HTML и оборачивает entity в тег', () => {
    const html = renderNoteHtml('a <b> & "x"', [{ type: 'bold', offset: 0, length: 1 }]);
    expect(html).toBe('<strong>a</strong> &lt;b&gt; &amp; &quot;x&quot;');
  });

  it('рендерит text_link безопасным URL', () => {
    const html = renderNoteHtml('сайт', [
      { type: 'text_link', offset: 0, length: 4, url: 'https://x.io' },
    ]);
    expect(html).toBe(
      '<a href="https://x.io" target="_blank" rel="noopener noreferrer">сайт</a>',
    );
  });

  it('не рендерит ссылку с опасным URL (javascript:)', () => {
    const html = renderNoteHtml('текст', [
      { type: 'text_link', offset: 0, length: 4, url: 'javascript:alert(1)' },
    ]);
    expect(html).toBe('текст');
  });

  it('первая строка: обрезает текст и entities по границе строки', () => {
    const html = firstLineHtml('первая строка\nвторая', [
      { type: 'bold', offset: 0, length: 6 },
    ]);
    expect(html).toBe('<strong>первая</strong> строка');
  });
});

describe('markdownFromEntities', () => {
  it('восстанавливает разметку из entities', () => {
    const text = markdownFromEntities('Купить молоко', [
      { type: 'bold', offset: 7, length: 6 },
    ]);
    expect(text).toBe('Купить **молоко**');
  });

  it('восстанавливает ссылку', () => {
    const text = markdownFromEntities('сайт', [
      { type: 'text_link', offset: 0, length: 4, url: 'https://x.io' },
    ]);
    expect(text).toBe('[сайт](https://x.io)');
  });
});
