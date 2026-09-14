import type { Break, List, Paragraph } from 'mdast';
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
