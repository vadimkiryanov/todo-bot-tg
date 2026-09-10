import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  firstLineHtml,
  formatEditedAt,
  formatReminderAt,
  markdownDraftOffsets,
  markdownFromEntities,
  nextPriority,
  parseMarkdown,
  priorityEmoji,
  priorityLabel,
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

describe('renderNoteHtml — автопарсинг ссылок', () => {
  const A = (url: string, text: string) =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;

  it('http-ссылку оборачивает в <a>, экранируя остальной текст', () => {
    const html = renderNoteHtml('См. https://x.io/a и дальше', []);
    expect(html).toBe(`См. ${A('https://x.io/a', 'https://x.io/a')} и дальше`);
  });

  it('www-ссылку дополняет схемой https://', () => {
    const html = renderNoteHtml('Сайт: www.example.com/path', []);
    expect(html).toBe(`Сайт: ${A('https://www.example.com/path', 'www.example.com/path')}`);
  });

  it('пунктуация конца предложения в ссылку не попадает', () => {
    const html = renderNoteHtml('Пункт 1: https://x.io.', []);
    expect(html).toBe(`Пункт 1: ${A('https://x.io', 'https://x.io')}.`);
  });

  it('парную скобку в URL сохраняет, висячую — отрезает', () => {
    expect(renderNoteHtml('https://en.wikipedia.org/wiki/Foo_(bar)', [])).toBe(
      A('https://en.wikipedia.org/wiki/Foo_(bar)', 'https://en.wikipedia.org/wiki/Foo_(bar)'),
    );
    expect(renderNoteHtml('https://x.io/a_(b))', [])).toBe(
      `${A('https://x.io/a_(b)', 'https://x.io/a_(b)')})`,
    );
  });

  it('не линкует URL внутри слова или сразу после @', () => {
    expect(renderNoteHtml('nowww.example.com', [])).toBe('nowww.example.com');
    expect(renderNoteHtml('xhttps://y.io/path', [])).toBe('xhttps://y.io/path');
    expect(renderNoteHtml('см. @www.example.com', [])).toBe('см. @www.example.com');
  });

  it('URL в code/entity-фрагментах не дублирует ссылку', () => {
    const html = renderNoteHtml('код www.x.io', [{ type: 'code', offset: 4, length: 9 }]);
    expect(html).toBe('код <code>www.x.io</code>');
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

describe('formatReminderAt', () => {
  it('ежедневное напоминание — только время', () => {
    const at = '2026-09-05T14:05:00Z';
    const text = formatReminderAt(at, 'daily');
    // Время — локальное, поэтому сверяем только префикс и наличие часов.
    expect(text.startsWith('ежедневно в ')).toBe(true);
  });

  it('одноразовое сегодня — «в HH:MM»', () => {
    const now = new Date();
    const at = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      14,
      5,
    ).toISOString();
    const text = formatReminderAt(at, 'once');
    expect(text).toMatch(/^в \d{1,2}:\d{2}$/);
  });

  it('завтра — «завтра, в HH:MM»', () => {
    const now = new Date();
    const tomorrow = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      9,
      0,
    );
    const text = formatReminderAt(tomorrow.toISOString(), 'once');
    expect(text).toMatch(/^завтра, в \d{1,2}:\d{2}$/);
  });
});

describe('formatEditedAt', () => {
  // Фиксируем «сегодня», иначе ветки «сегодня»/«вчера»/год зависят от даты запуска.
  const NOW = new Date(2026, 8, 10, 12, 0, 0); // 10 сентября 2026 (локально)

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('сегодня — «сегодня»', () => {
    expect(formatEditedAt(new Date(2026, 8, 10, 8, 30).toISOString())).toBe('сегодня');
  });

  it('вчера — «вчера»', () => {
    expect(formatEditedAt(new Date(2026, 8, 9, 23, 0).toISOString())).toBe('вчера');
  });

  it('раньше в этом году — день и месяц без года', () => {
    expect(formatEditedAt(new Date(2026, 8, 5, 10, 0).toISOString())).toBe('5 сент.');
  });

  it('прошлый год — день, месяц и год', () => {
    expect(formatEditedAt(new Date(2025, 11, 31, 10, 0).toISOString())).toBe('31 дек. 2025');
  });

  it('некорректная дата — пустая строка (подпись не показывается)', () => {
    expect(formatEditedAt('не дата')).toBe('');
  });
});

describe('приоритет', () => {
  it('цикл как в боте: None→Low→Medium→High→None', () => {
    expect(nextPriority('none')).toBe('low');
    expect(nextPriority('low')).toBe('medium');
    expect(nextPriority('medium')).toBe('high');
    expect(nextPriority('high')).toBe('none');
  });

  it('эмодзи и подпись', () => {
    expect(priorityEmoji('high')).toBe('🔴');
    expect(priorityEmoji('medium')).toBe('🟡');
    expect(priorityEmoji('low')).toBe('🔵');
    expect(priorityEmoji('none')).toBe('—');
    expect(priorityLabel('high')).toBe('высокий');
    expect(priorityLabel('none')).toBe('нет');
  });
});

describe('markdownDraftOffsets', () => {
  it('без entities смещения совпадают с длиной текста', () => {
    expect(markdownDraftOffsets('просто', [])).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('границы entity сдвигаются на длину маркеров **жирного**', () => {
    const text = 'Купить молоко';
    const offs = markdownDraftOffsets(text, [{ type: 'bold', offset: 7, length: 6 }]);
    // «Купить » (7) + «**молоко**» (10) — разметка длиной 17.
    expect(offs.slice(0, 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(offs[7]).toBe(9); // перед «м» — после открывающих **
    expect(offs[8]).toBe(10);
    expect(offs[12]).toBe(14); // перед закрывающими **
    expect(offs[13]).toBe(17); // конец текста — после всех маркеров
  });

  it('каждая граница plain-текста указывает на тот же символ в разметке', () => {
    const text = 'Купить молоко и хлеб';
    const entities = [
      { type: 'bold', offset: 7, length: 6 },
      { type: 'text_link', offset: 16, length: 4, url: 'https://x.io' },
    ];
    const draft = markdownFromEntities(text, entities);
    const offs = markdownDraftOffsets(text, entities);
    expect(offs).toHaveLength(text.length + 1);
    for (let i = 0; i < text.length; i++) {
      expect(draft.charAt(offs[i])).toBe(text.charAt(i));
    }
    expect(offs[text.length]).toBe(draft.length);
  });

  it('считает UTF-16: эмодзи занимает две границы', () => {
    const text = '🛒 молоко';
    const offs = markdownDraftOffsets(text, [{ type: 'bold', offset: 3, length: 6 }]);
    expect(offs[0]).toBe(0);
    expect(offs[3]).toBe(5); // после «🛒 » и открывающих **
    expect(offs[9]).toBe(13); // конец текста — после закрывающих **
  });
});
