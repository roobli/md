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

  it('natively splits GFM tables with exact offsets', () => {
    const text = '| a | b |\n| - | - |\n| 1 | 2 |\n';
    const split = tryNativeSplit(text);
    expect(split).not.toBeNull();
    expect(joinSplit(split!)).toBe(text);
    expect(split!.spans).toHaveLength(1);
    expect(split!.spans[0]!.kind).toBe('table');
    expect(split!.spans[0]!.start).toBe(0);
    expect(split!.spans[0]!.end).toBe('| a | b |\n| - | - |\n| 1 | 2 |'.length);
    expect(split!.spans[0]!.markdown).toBe('| a | b |\n| - | - |\n| 1 | 2 |');
    expect(split!.spans[0]!.node).toBeNull();
    expect(split!.trailing).toBe('\n');
  });

  it('natively splits pipe-optional tables and multi-row bodies', () => {
    const text = 'a | b\n--- | ---\n1 | 2\n3 | 4\n\nAfter\n';
    const split = tryNativeSplit(text);
    expect(split).not.toBeNull();
    expect(joinSplit(split!)).toBe(text);
    expect(split!.spans.map((s) => s.kind)).toEqual(['table', 'paragraph']);
    expect(split!.spans[0]!.markdown).toBe('a | b\n--- | ---\n1 | 2\n3 | 4');
    expect(split!.spans[1]!.markdown).toBe('After');
  });

  it('natively splits task lists (bullet + ordered) with exact offsets', () => {
    const bullet = '- [ ] todo\n- [x] done\n';
    const bulletSplit = tryNativeSplit(bullet);
    expect(bulletSplit).not.toBeNull();
    expect(joinSplit(bulletSplit!)).toBe(bullet);
    expect(bulletSplit!.spans).toHaveLength(1);
    expect(bulletSplit!.spans[0]!.kind).toBe('task-list');
    expect(bulletSplit!.spans[0]!.start).toBe(0);
    expect(bulletSplit!.spans[0]!.end).toBe('- [ ] todo\n- [x] done'.length);
    expect(bulletSplit!.spans[0]!.node).toBeNull();

    const ordered = '1. [ ] one\n2. [X] two\n';
    const orderedSplit = tryNativeSplit(ordered);
    expect(orderedSplit).not.toBeNull();
    expect(joinSplit(orderedSplit!)).toBe(ordered);
    expect(orderedSplit!.spans[0]!.kind).toBe('task-list');
  });

  it('keeps loose task lists as one block; mixed checkbox → task-list', () => {
    const loose = '- [ ] a\n\n- [ ] b\n';
    const looseSplit = tryNativeSplit(loose);
    expect(looseSplit).not.toBeNull();
    expect(joinSplit(looseSplit!)).toBe(loose);
    expect(looseSplit!.spans).toHaveLength(1);
    expect(looseSplit!.spans[0]!.kind).toBe('task-list');

    const mixed = '- normal\n- [ ] mixed\n';
    const mixedSplit = tryNativeSplit(mixed);
    expect(mixedSplit).not.toBeNull();
    expect(mixedSplit!.spans[0]!.kind).toBe('task-list');
  });

  it('handles heading + table + task list in one native pass', () => {
    const text = '# Hi\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n- [ ] t\n';
    const split = tryNativeSplit(text);
    expect(split).not.toBeNull();
    expect(joinSplit(split!)).toBe(text);
    expect(split!.spans.map((s) => s.kind)).toEqual(['heading', 'table', 'task-list']);
    expect(split!.spans[1]!.start).toBe(6);
    expect(split!.spans[1]!.end).toBe(35);
    expect(split!.spans[2]!.start).toBe(37);
    expect(split!.spans[2]!.end).toBe(44);
  });

  it('falls back (null) for frontmatter, math, html, definitions', () => {
    expect(tryNativeSplit('---\ntitle: t\n---\n\nHi\n')).toBeNull();
    expect(tryNativeSplit('$$\nx\n$$\n')).toBeNull();
    expect(tryNativeSplit('<div>\nHi\n</div>\n')).toBeNull();
    expect(tryNativeSplit('[id]: https://example.com\n')).toBeNull();
  });
});
