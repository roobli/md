import { describe, expect, it } from 'vitest';
import { tryNativeSplit } from './backend/native-scanner.js';
import { joinSplit, parseBlocks, parseDocument, parseSingleBlock } from './parse.js';

describe('parseBlocks', () => {
  it('covers every character exactly once (micromark fallback path)', () => {
    const text = '---\ntitle: t\n---\n\n# Hello\n\nPara with **注意：**强调\n\n- [ ] task\n\n$$\nx\n$$\n';
    const split = parseBlocks(text);
    expect(tryNativeSplit(text)).toBeNull(); // forces micromark
    expect(joinSplit(split)).toBe(text);
    expect(split.spans.length).toBeGreaterThanOrEqual(4);
    const kinds = split.spans.map((s) => s.kind);
    expect(kinds).toContain('frontmatter');
    expect(kinds).toContain('heading');
    expect(kinds).toContain('task-list');
    expect(kinds).toContain('display-math');
  });

  it('uses native path for heading/paragraph/list/fence', () => {
    const text = '# Hi\n\nPara\n\n```\ncode\n\nstill\n```\n\n- a\n- b\n';
    expect(tryNativeSplit(text)).not.toBeNull();
    const split = parseBlocks(text);
    expect(joinSplit(split)).toBe(text);
    expect(split.spans.map((s) => s.kind)).toEqual(['heading', 'paragraph', 'fenced-code', 'bullet-list']);
  });

  it('uses native path for GFM tables; strikethrough stays inline in paragraphs', () => {
    const text = '| a | b |\n| - | - |\n| 1 | 2 |\n\n~~gone~~\n';
    expect(tryNativeSplit(text)).not.toBeNull();
    const split = parseBlocks(text);
    expect(joinSplit(split)).toBe(text);
    expect(split.spans.map((s) => s.kind)).toEqual(['table', 'paragraph']);
    expect(split.spans[0]!.node).toBeNull();
    expect(split.spans[1]!.markdown).toBe('~~gone~~');
  });

  it('uses native path for task lists', () => {
    const text = '- [ ] todo\n- [x] done\n';
    expect(tryNativeSplit(text)).not.toBeNull();
    const split = parseBlocks(text);
    expect(joinSplit(split)).toBe(text);
    expect(split.spans.map((s) => s.kind)).toEqual(['task-list']);
  });

  it('blank document is all trailing', () => {
    const split = parseBlocks('');
    expect(split.spans).toEqual([]);
    expect(split.trailing).toBe('');
  });
});

describe('parseSingleBlock', () => {
  it('accepts one heading', () => {
    const span = parseSingleBlock('# Hi');
    expect(span?.kind).toBe('heading');
  });

  it('rejects multi-block input', () => {
    expect(parseSingleBlock('# A\n\n# B')).toBeNull();
  });
});

describe('parseDocument', () => {
  it('strips BOM and reports envelope', () => {
    const body = '# Hi\n';
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(body)]);
    const result = parseDocument(bytes);
    expect(result.status).toBe('parsed');
    if (result.status !== 'parsed') return;
    expect(result.document.envelope.bom).toBe('utf8');
    expect(result.document.text).toBe(body);
    expect(result.document.blocks[0]?.kind).toBe('heading');
  });

  it('rejects invalid utf-8', () => {
    const result = parseDocument(Uint8Array.from([0xff, 0xfe, 0xfd]));
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.code).toBe('INVALID_UTF8');
  });
});
