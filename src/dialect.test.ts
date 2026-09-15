import type { Break, Image, Link, List, Paragraph, Table } from 'mdast';
import { describe, expect, it } from 'vitest';
import { renderMarkdown, widenDelimiterCells } from './dialect.js';

describe('dialect serialize parity (Phase 7)', () => {
  it('hard break renders as two spaces + newline, not backslash-newline', () => {
    const para: Paragraph = {
      type: 'paragraph',
      children: [
        { type: 'text', value: 'line one' },
        { type: 'break' } satisfies Break,
        { type: 'text', value: 'line two' },
      ],
    };
    const out = renderMarkdown(para);
    expect(out).toContain('  \n');
    expect(out).not.toContain('\\\n');
    expect(out).toBe('line one  \nline two');
  });

  it('bullet list with data.bullet "*" serializes with *', () => {
    const list: List = {
      type: 'list',
      ordered: false,
      spread: false,
      children: [
        {
          type: 'listItem',
          spread: false,
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', value: 'star item' }],
            },
          ],
        },
      ],
      data: { bullet: '*' },
    };
    const out = renderMarkdown(list);
    expect(out.startsWith('* ')).toBe(true);
    expect(out).toContain('star item');
    expect(out).not.toMatch(/^- /);
  });

  it('ordered list with data.delimiter ")" serializes with )', () => {
    const list: List = {
      type: 'list',
      ordered: true,
      start: 1,
      spread: false,
      children: [
        {
          type: 'listItem',
          spread: false,
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', value: 'paren item' }],
            },
          ],
        },
      ],
      data: { delimiter: ')' },
    };
    const out = renderMarkdown(list);
    expect(out).toMatch(/^1\) /);
    expect(out).toContain('paren item');
    expect(out).not.toMatch(/^1\. /);
  });
});

describe('dialect serialize parity (Phase 8)', () => {
  it('wiki links survive re-serialize without escaped brackets', () => {
    const para: Paragraph = {
      type: 'paragraph',
      children: [{ type: 'text', value: 'See [[DailyNews/index|Daily]] and [[note]].' }],
    };
    const out = renderMarkdown(para);
    expect(out).toContain('[[DailyNews/index|Daily]]');
    expect(out).toContain('[[note]]');
    expect(out).not.toContain('\\[');
  });

  it('alert / footnote / TOC markers stay unescaped', () => {
    const para: Paragraph = {
      type: 'paragraph',
      children: [{ type: 'text', value: '[!NOTE] see [^1] and [TOC]' }],
    };
    const out = renderMarkdown(para);
    expect(out).toContain('[!NOTE]');
    expect(out).toContain('[^1]');
    expect(out).toContain('[TOC]');
    expect(out).not.toContain('\\[');
  });

  it('snake_case identifiers and metrics keep underscores / @', () => {
    const para: Paragraph = {
      type: 'paragraph',
      children: [{ type: 'text', value: 'call mcp__claude_api with NDCG@10' }],
    };
    const out = renderMarkdown(para);
    expect(out).toContain('mcp__claude_api');
    expect(out).toContain('NDCG@10');
    expect(out).not.toContain('\\_');
    expect(out).not.toContain('\\@');
  });

  it('image alt keeps snake_case identifiers', () => {
    const para: Paragraph = {
      type: 'paragraph',
      children: [
        {
          type: 'image',
          url: 'https://example.com/a.png',
          alt: 'img_v3_shot',
        } satisfies Image,
      ],
    };
    const out = renderMarkdown(para);
    expect(out).toContain('![img_v3_shot]');
    expect(out).not.toContain('\\_');
  });

  it('bare http(s) autolink stays bare, not angle-bracketed', () => {
    const para: Paragraph = {
      type: 'paragraph',
      children: [
        {
          type: 'link',
          url: 'https://example.com/path',
          children: [{ type: 'text', value: 'https://example.com/path' }],
        } satisfies Link,
      ],
    };
    const out = renderMarkdown(para);
    expect(out).toBe('https://example.com/path');
    expect(out).not.toContain('<https://');
  });

  it('labelled links still use markdown link syntax', () => {
    const para: Paragraph = {
      type: 'paragraph',
      children: [
        {
          type: 'link',
          url: 'https://example.com/path',
          children: [{ type: 'text', value: 'Example' }],
        } satisfies Link,
      ],
    };
    const out = renderMarkdown(para);
    expect(out).toBe('[Example](https://example.com/path)');
  });
});

describe('dialect serialize parity (Phase 9)', () => {
  it('widenDelimiterCells widens unaligned / left / center / right cells', () => {
    expect(widenDelimiterCells('| - | :- | :-: | -: |')).toBe('| --- | :--- | :---: | ---: |');
  });

  it('widenDelimiterCells keeps already-long hyphen runs', () => {
    expect(widenDelimiterCells('| ---- | :----- | :----: | ----: |')).toBe(
      '| ---- | :----- | :----: | ----: |',
    );
  });

  it('widenDelimiterCells preserves spaces around cells when present', () => {
    // GFM short cells already carry one space on each side; those stay.
    expect(widenDelimiterCells('| - | :- |')).toBe('| --- | :--- |');
    // Only a single lead/tail space is restored (matches Noto helper).
    expect(widenDelimiterCells('|  -  |')).toBe('| --- |');
    // No surrounding spaces stay absent.
    expect(widenDelimiterCells('|-|:-|')).toBe('|---|:---|');
  });

  it('widenDelimiterCells leaves non-delimiter lines unchanged', () => {
    expect(widenDelimiterCells('| a | hello | mid |')).toBe('| a | hello | mid |');
    expect(widenDelimiterCells('not a table')).toBe('not a table');
  });

  it('renderMarkdown emits vault three-dash delimiter row (content unpadded)', () => {
    const table: Table = {
      type: 'table',
      align: [null, 'left', 'center', 'right'],
      children: [
        {
          type: 'tableRow',
          children: [
            { type: 'tableCell', children: [{ type: 'text', value: 'a' }] },
            { type: 'tableCell', children: [{ type: 'text', value: 'hello' }] },
            { type: 'tableCell', children: [{ type: 'text', value: 'mid' }] },
            { type: 'tableCell', children: [{ type: 'text', value: 'wide column' }] },
          ],
        },
        {
          type: 'tableRow',
          children: [
            { type: 'tableCell', children: [{ type: 'text', value: '1' }] },
            { type: 'tableCell', children: [{ type: 'text', value: '2' }] },
            { type: 'tableCell', children: [{ type: 'text', value: '3' }] },
            { type: 'tableCell', children: [{ type: 'text', value: '4' }] },
          ],
        },
      ],
    };
    const out = renderMarkdown(table);
    expect(out).toBe(
      '| a | hello | mid | wide column |\n| --- | :--- | :---: | ---: |\n| 1 | 2 | 3 | 4 |',
    );
  });
});
