import type { Break, Image, Link, List, Paragraph } from 'mdast';
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './dialect.js';

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
