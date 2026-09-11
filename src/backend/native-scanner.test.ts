import { describe, expect, it } from 'vitest';
import { joinSplit } from '../parse.js';
import { tryNativeSplit } from './native-scanner.js';

/** Blank-line-naive splitter — the baseline Phase 1 must beat for fences. */
function blankLineNaive(text: string): string[] {
  return text.split(/\n\n+/).filter((chunk) => chunk.length > 0);
}

describe('tryNativeSplit', () => {
  it('returns empty split for empty input', () => {
    expect(tryNativeSplit('')).toEqual({ spans: [], leading: '', gaps: [], trailing: '' });
  });

  it('covers heading + paragraph + list with exact offsets', () => {
    const text = '# Title\n\nHello world\n\n- a\n- b\n';
    const split = tryNativeSplit(text);
    expect(split).not.toBeNull();
    expect(joinSplit(split!)).toBe(text);
    expect(split!.spans.map((s) => s.kind)).toEqual(['heading', 'paragraph', 'bullet-list']);
    expect(split!.spans[0]!.markdown).toBe('# Title');
    expect(split!.spans[0]!.start).toBe(0);
    expect(split!.spans[0]!.end).toBe('# Title'.length);
    expect(split!.spans[0]!.node).toBeNull();
  });

  it('keeps fenced code with internal blank lines as one block (beats blank-line-naive)', () => {
    const text = '```js\n\nconst x = 1;\n\n```\n';
    const naive = blankLineNaive(text);
    expect(naive.length).toBeGreaterThan(1); // naive fractures the fence

    const split = tryNativeSplit(text);
    expect(split).not.toBeNull();
    expect(joinSplit(split!)).toBe(text);
    expect(split!.spans).toHaveLength(1);
    expect(split!.spans[0]!.kind).toBe('fenced-code');
    expect(split!.spans[0]!.markdown.startsWith('```js')).toBe(true);
    expect(split!.spans[0]!.markdown.includes('\n\nconst x')).toBe(true);
  });

  it('keeps loose lists as one block across blank lines', () => {
    const text = '- one\n\n- two\n';
    const split = tryNativeSplit(text);
    expect(split).not.toBeNull();
    expect(joinSplit(split!)).toBe(text);
    expect(split!.spans).toHaveLength(1);
    expect(split!.spans[0]!.kind).toBe('bullet-list');
  });

  it('classifies ordered lists and setext headings', () => {
    const text = '1. alpha\n2. beta\n\nTitle\n=====\n';
    const split = tryNativeSplit(text);
    expect(split).not.toBeNull();
    expect(joinSplit(split!)).toBe(text);
    expect(split!.spans.map((s) => s.kind)).toEqual(['ordered-list', 'heading']);
  });

  it('falls back (null) for GFM tables', () => {
    const text = '| a | b |\n| - | - |\n| 1 | 2 |\n';
    expect(tryNativeSplit(text)).toBeNull();
  });

  it('falls back (null) for task lists', () => {
    expect(tryNativeSplit('- [ ] todo\n')).toBeNull();
  });

  it('falls back (null) for frontmatter, math, html', () => {
    expect(tryNativeSplit('---\ntitle: t\n---\n\nHi\n')).toBeNull();
    expect(tryNativeSplit('$$\nx\n$$\n')).toBeNull();
    expect(tryNativeSplit('<div>\nHi\n</div>\n')).toBeNull();
  });
});
