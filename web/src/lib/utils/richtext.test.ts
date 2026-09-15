import { describe, expect, it } from 'vitest';
import { markdownFromEntities, parseMarkdown } from './format';
import {
  blockMarker,
  markerBlock,
  noteToRich,
  richEditorHtml,
  richMarkdown,
  richToNote,
} from './richtext';

describe('blockMarker', () => {
  it('маркер строки — по виду блока', () => {
    expect(blockMarker({ kind: 'h1', content: [] })).toBe('# ');
    expect(blockMarker({ kind: 'h2', content: [] })).toBe('## ');
    expect(blockMarker({ kind: 'list', content: [] })).toBe('- ');
    expect(blockMarker({ kind: 'check', content: [] })).toBe('- [ ] ');
    expect(blockMarker({ kind: 'check', checked: true, content: [] })).toBe('- [x] ');
    expect(blockMarker({ kind: 'ol', num: 12, content: [] })).toBe('12. ');
    expect(blockMarker({ kind: 'ol', content: [] })).toBe('1. ');
    expect(blockMarker({ kind: 'text', content: [] })).toBe('');
  });
});

describe('markerBlock', () => {
  it('распознаёт введённый маркер строки', () => {
    expect(markerBlock('## Привет')).toEqual({ kind: 'h2', markerLen: 3, num: 1, checked: false });
    expect(markerBlock('# Привет')).toEqual({ kind: 'h1', markerLen: 2, num: 1, checked: false });
    expect(markerBlock('3. пункт')).toEqual({ kind: 'ol', markerLen: 3, num: 3, checked: false });
    expect(markerBlock('- пункт')).toEqual({ kind: 'list', markerLen: 2, num: 1, checked: false });
    expect(markerBlock('- [ ] задача')).toEqual({ kind: 'check', markerLen: 6, num: 1, checked: false });
    expect(markerBlock('- [x] готово')).toEqual({ kind: 'check', markerLen: 6, num: 1, checked: true });
  });

  it('обычный текст и «маркеры» без пробела маркером не считаются', () => {
    expect(markerBlock('просто текст')).toBeNull();
    expect(markerBlock('#нет')).toBeNull();
    expect(markerBlock('1.нет')).toBeNull();
  });
});

describe('noteToRich', () => {
  it('строки превращаются в блоки, маркеры в содержимое не попадают', () => {
    const blocks = noteToRich('# Заголовок\n- пункт\n- [x] готово\n1. первый\n\nхвост', []);
    expect(blocks).toEqual([
      { kind: 'h1', content: [{ kind: 'text', text: 'Заголовок' }] },
      { kind: 'list', content: [{ kind: 'text', text: 'пункт' }] },
      { kind: 'check', checked: true, content: [{ kind: 'text', text: 'готово' }] },
      { kind: 'ol', num: 1, content: [{ kind: 'text', text: 'первый' }] },
      { kind: 'text', content: [] },
      { kind: 'text', content: [{ kind: 'text', text: 'хвост' }] },
    ]);
  });

  it('номер пункта берётся из текста, а не нумеруется заново', () => {
    const blocks = noteToRich('7. седьмой\n8. восьмой', []);
    expect(blocks.map((b) => b.num)).toEqual([7, 8]);
  });

  it('inline-entities становятся узлами оформления', () => {
    const blocks = noteToRich('см жирный конец', [{ type: 'bold', offset: 3, length: 6 }]);
    expect(blocks).toEqual([
      {
        kind: 'text',
        content: [
          { kind: 'text', text: 'см ' },
          { kind: 'fmt', type: 'bold', children: [{ kind: 'text', text: 'жирный' }] },
          { kind: 'text', text: ' конец' },
        ],
      },
    ]);
  });

  it('вложенное оформление раскладывается по диапазонам', () => {
    const blocks = noteToRich('abcdef', [
      { type: 'italic', offset: 2, length: 1 },
      { type: 'bold', offset: 0, length: 5 },
    ]);
    expect(blocks[0].content).toEqual([
      {
        kind: 'fmt',
        type: 'bold',
        children: [
          { kind: 'text', text: 'ab' },
          { kind: 'fmt', type: 'italic', children: [{ kind: 'text', text: 'c' }] },
          { kind: 'text', text: 'de' },
        ],
      },
      { kind: 'text', text: 'f' },
    ]);
  });

  it('«голая» ссылка показывается ссылкой, но помечается как auto', () => {
    const blocks = noteToRich('см https://x.io', []);
    expect(blocks[0].content).toEqual([
      { kind: 'text', text: 'см ' },
      {
        kind: 'fmt',
        type: 'text_link',
        url: 'https://x.io',
        auto: true,
        children: [{ kind: 'text', text: 'https://x.io' }],
      },
    ]);
  });

  it('entity-ссылка важнее «голой» на том же месте', () => {
    const blocks = noteToRich('https://x.io', [
      { type: 'text_link', offset: 0, length: 12, url: 'https://x.io' },
    ]);
    expect(blocks[0].content).toEqual([
      {
        kind: 'fmt',
        type: 'text_link',
        url: 'https://x.io',
        children: [{ kind: 'text', text: 'https://x.io' }],
      },
    ]);
  });

  it('пустая заметка — одна пустая строка (есть куда поставить каретку)', () => {
    expect(noteToRich('', [])).toEqual([{ kind: 'text', content: [] }]);
  });
});

describe('richToNote', () => {
  it('маркеры строк возвращаются в текст, оформление — в entities', () => {
    const blocks = noteToRich('# Заголовок\n- пункт\n- [x] готово\n1. первый\n\nхвост', []);
    expect(richToNote(blocks)).toEqual({
      text: '# Заголовок\n- пункт\n- [x] готово\n1. первый\n\nхвост',
      entities: [],
    });
  });

  it('существующие entities переживают разбор и сборку', () => {
    const text = 'см жирный конец';
    const entities = [{ type: 'bold', offset: 3, length: 6 }];
    expect(richToNote(noteToRich(text, entities))).toEqual({ text, entities });
  });

  it('вложенное оформление возвращается двумя entities', () => {
    const entities = [
      { type: 'italic', offset: 2, length: 1 },
      { type: 'bold', offset: 0, length: 5 },
    ];
    // Порядок — по смещению (так entities идут и с сервера).
    expect(richToNote(noteToRich('abcdef', entities))).toEqual({
      text: 'abcdef',
      entities: [
        { type: 'bold', offset: 0, length: 5 },
        { type: 'italic', offset: 2, length: 1 },
      ],
    });
  });

  it('«голые» ссылки остаются текстом (в заметке entity не появляется)', () => {
    expect(richToNote(noteToRich('см https://x.io', []))).toEqual({
      text: 'см https://x.io',
      entities: [],
    });
  });

  it('соседние одинаковые entities склеиваются в одну', () => {
    // Иначе в правке-разметке получилось бы «**a****b**».
    const entities = [
      { type: 'bold', offset: 0, length: 1 },
      { type: 'bold', offset: 1, length: 1 },
    ];
    expect(richToNote(noteToRich('ab', entities))).toEqual({
      text: 'ab',
      entities: [{ type: 'bold', offset: 0, length: 2 }],
    });
  });

  it('пустая строка в середине переживает разбор и сборку один в один', () => {
    expect(richToNote(noteToRich('а\n\nб', [])).text).toBe('а\n\nб');
    // Строка, оканчивающаяся переносом, отдельной пустой строки не даёт —
    // ровно как в просмотре (там та же разбивка на строки).
    expect(richToNote(noteToRich('\n\n', [])).text).toBe('\n');
  });
});

describe('richMarkdown', () => {
  it('для заметки без переносов внутри оформления совпадает с разметкой entities', () => {
    const text = '# Заголовок\n- пункт';
    const entities = [{ type: 'bold', offset: 2, length: 9 }];
    expect(richMarkdown(text, entities)).toBe(markdownFromEntities(text, entities));
    expect(richMarkdown(text, entities)).toBe('# **Заголовок**\n- пункт');
  });

  it('устойчив: повторный разбор своей же разметки ничего не меняет', () => {
    // Entity, разрезанная переносом строки: в вёрстке это два маркера.
    const text = 'пункт\nхвост';
    const entities = [{ type: 'italic', offset: 2, length: 8 }];
    const once = richMarkdown(text, entities);
    const again = parseMarkdown(once);
    expect(richMarkdown(again.text, again.entities)).toBe(once);
  });

  it('entities, склеиваемые воедино, не дают двойных маркеров подряд', () => {
    const entities = [
      { type: 'bold', offset: 0, length: 1 },
      { type: 'bold', offset: 1, length: 1 },
    ];
    expect(richMarkdown('ab', entities)).toBe('**ab**');
  });

  it('ссылка остаётся ссылкой, «голая» — текстом', () => {
    expect(richMarkdown('x', [{ type: 'text_link', offset: 0, length: 1, url: 'https://x.io' }])).toBe(
      '[x](https://x.io)',
    );
    expect(richMarkdown('см https://x.io', [])).toBe('см https://x.io');
  });
});

describe('richEditorHtml', () => {
  it('блоки получают те же классы, что в просмотре, а содержимое — один span', () => {
    const html = richEditorHtml(noteToRich('# А\n- Б\n\nВ', []));
    expect(html).toBe(
      '<div class="note-h1"><span class="note-li-text">А</span></div>' +
        '<div class="note-li"><span class="note-bullet" contenteditable="false">•</span><span class="note-li-text">Б</span></div>' +
        '<div class="note-blank"><span class="note-li-text"><br></span></div>' +
        '<div class="note-line"><span class="note-li-text">В</span></div>',
    );
  });

  it('нумерованный пункт показывает номер с точкой, как просмотр', () => {
    const html = richEditorHtml(noteToRich('12. двенадцатый', []));
    expect(html).toBe(
      '<div class="note-li"><span class="note-ol-num" contenteditable="false">12.</span><span class="note-li-text">двенадцатый</span></div>',
    );
  });

  it('чеклист: статичный квадратик, а у активной заметки — кнопка-переключатель', () => {
    expect(richEditorHtml(noteToRich('- [ ] задача', []))).toContain(
      '<span class="note-cb note-cb-static" contenteditable="false"></span>',
    );
    expect(richEditorHtml(noteToRich('- [x] готово', []), true)).toBe(
      '<div class="note-li checked"><button type="button" class="note-cb" contenteditable="false" aria-pressed="true" aria-label="Снять отметку"></button><span class="note-li-text note-checked-text">готово</span></div>',
    );
  });

  it('оформление и ссылки рендерятся теми же тегами, что просмотр', () => {
    const html = richEditorHtml(
      noteToRich('жирный x', [
        { type: 'bold', offset: 0, length: 6 },
        { type: 'text_link', offset: 7, length: 1, url: 'https://x.io' },
      ]),
    );
    expect(html).toBe(
      '<div class="note-line"><span class="note-li-text"><strong>жирный</strong> <a href="https://x.io" target="_blank" rel="noopener noreferrer">x</a></span></div>',
    );
  });

  it('«голая» ссылка помечается data-auto (текст ссылки не станет ссылкой)', () => {
    expect(richEditorHtml(noteToRich('https://x.io', []))).toContain('data-auto="1"');
  });

  it('текст экранируется', () => {
    expect(richEditorHtml(noteToRich('# <b>x</b>', []))).toBe(
      '<div class="note-h1"><span class="note-li-text">&lt;b&gt;x&lt;/b&gt;</span></div>',
    );
  });
});
