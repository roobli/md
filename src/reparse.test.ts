import { describe, expect, it } from 'vitest';
import { joinSplit, parseBlocks } from './parse.js';
import { applySourceEdit, reparseBlocks, reparseFromText, sourceEditBetween, type SourceEdit } from './reparse.js';

function assertContiguous(split: ReturnType<typeof parseBlocks>, text: string): void {
  expect(joinSplit(split)).toBe(text);
  for (let i = 0; i < split.spans.length; i += 1) {
    const span = split.spans[i]!;
    expect(span.markdown).toBe(text.slice(span.start, span.end));
    expect(span.end).toBeGreaterThan(span.start);
    if (i > 0) {
      expect(span.start).toBeGreaterThanOrEqual(split.spans[i - 1]!.end);
    }
  }
}

describe('reparseBlocks', () => {
  it('edits a middle paragraph and preserves untouched span markdown identity', () => {
    const text = '# Title\n\nPara one\n\nPara two\n\n# End\n';
    const prior = parseBlocks(text);
    expect(prior.spans.map((s) => s.kind)).toEqual(['heading', 'paragraph', 'paragraph', 'heading']);

    const target = prior.spans[1]!;
    const edit: SourceEdit = {
      priorStart: target.start,
      priorEnd: target.end,
      inserted: 'Para ONE edited',
    };
    const nextText = applySourceEdit(text, edit);
    const result = reparseBlocks({
      prior,
      text: nextText,
      edit,
      replacedBlocks: { from: 1, to: 1 },
      neighborSlack: 0,
    });

    assertContiguous(result, nextText);
    expect(result.spans.map((s) => s.kind)).toEqual(['heading', 'paragraph', 'paragraph', 'heading']);
    expect(result.spans[1]!.markdown).toBe('Para ONE edited');

    // Prefix / suffix outside the dirty window keep object / markdown identity.
    expect(result.spans[0]).toBe(prior.spans[0]);
    expect(result.spans[2]!.markdown).toBe(prior.spans[2]!.markdown);
    expect(result.spans[3]!.markdown).toBe(prior.spans[3]!.markdown);
    expect(result.dirtyFrom).toBe(1);
    expect(result.dirtyTo).toBe(1);
  });

  it('edits a fenced code block without fracturing internal blanks', () => {
    const text = 'Intro\n\n```js\n\nconst x = 1;\n\n```\n\nOutro\n';
    const prior = parseBlocks(text);
    expect(prior.spans.map((s) => s.kind)).toEqual(['paragraph', 'fenced-code', 'paragraph']);

    const fence = prior.spans[1]!;
    const edit: SourceEdit = {
      priorStart: fence.start,
      priorEnd: fence.end,
      inserted: '```js\n\nconst x = 2;\n\nconst y = 3;\n\n```',
    };
    const nextText = applySourceEdit(text, edit);
    const result = reparseBlocks({
      prior,
      edit,
      replacedBlocks: { from: 1, to: 1 },
      neighborSlack: 0,
    });

    assertContiguous(result, nextText);
    expect(result.spans).toHaveLength(3);
    expect(result.spans[1]!.kind).toBe('fenced-code');
    expect(result.spans[1]!.markdown.includes('const y = 3')).toBe(true);
    expect(result.spans[0]).toBe(prior.spans[0]);
    expect(result.spans[2]!.markdown).toBe(prior.spans[2]!.markdown);
  });

  it('inserts a block boundary (one paragraph → two) and shifts suffix offsets', () => {
    const text = '# A\n\nOnly para\n\n# B\n';
    const prior = parseBlocks(text);
    expect(prior.spans.map((s) => s.kind)).toEqual(['heading', 'paragraph', 'heading']);

    const para = prior.spans[1]!;
    const edit: SourceEdit = {
      priorStart: para.start,
      priorEnd: para.end,
      inserted: 'First\n\nSecond',
    };
    const nextText = applySourceEdit(text, edit);
    const result = reparseBlocks({
      prior,
      text: nextText,
      edit,
      replacedBlocks: { from: 1, to: 1 },
      neighborSlack: 0,
    });

    assertContiguous(result, nextText);
    expect(result.spans.map((s) => s.kind)).toEqual(['heading', 'paragraph', 'paragraph', 'heading']);
    expect(result.spans[0]).toBe(prior.spans[0]);
    expect(result.spans[3]!.markdown).toBe(prior.spans[2]!.markdown);
    expect(result.spans[3]!.start).toBeGreaterThan(prior.spans[2]!.start);
    // Full parse agrees on structure.
    expect(result.spans.map((s) => s.kind)).toEqual(parseBlocks(nextText).spans.map((s) => s.kind));
  });

  it('deletes a block boundary (two paragraphs → one)', () => {
    const text = '# A\n\nFirst\n\nSecond\n\n# B\n';
    const prior = parseBlocks(text);
    expect(prior.spans.map((s) => s.kind)).toEqual(['heading', 'paragraph', 'paragraph', 'heading']);

    // Replace "First\n\nSecond" (two spans + gap) with a single paragraph.
    const edit: SourceEdit = {
      priorStart: prior.spans[1]!.start,
      priorEnd: prior.spans[2]!.end,
      inserted: 'Merged paragraph',
    };
    const nextText = applySourceEdit(text, edit);
    const result = reparseBlocks({
      prior,
      edit,
      replacedBlocks: { from: 1, to: 2 },
      neighborSlack: 0,
    });

    assertContiguous(result, nextText);
    expect(result.spans.map((s) => s.kind)).toEqual(['heading', 'paragraph', 'heading']);
    expect(result.spans[1]!.markdown).toBe('Merged paragraph');
    expect(result.spans[0]).toBe(prior.spans[0]);
    expect(result.spans[2]!.markdown).toBe(prior.spans[3]!.markdown);
  });

  it('neighborSlack widens the dirty window for boundary safety', () => {
    const text = 'Alpha\n\nBeta\n\nGamma\n';
    const prior = parseBlocks(text);
    const edit: SourceEdit = {
      priorStart: prior.spans[1]!.start,
      priorEnd: prior.spans[1]!.end,
      inserted: 'Beta changed',
    };
    const withSlack = reparseBlocks({
      prior,
      edit,
      replacedBlocks: { from: 1, to: 1 },
      neighborSlack: 1,
    });
    expect(withSlack.dirtyFrom).toBe(0);
    expect(withSlack.dirtyTo).toBe(2);
    // With slack covering the whole doc, no prefix identity — but coverage holds.
    assertContiguous(withSlack, applySourceEdit(text, edit));
  });

  it('replacedBlocks-only path (Noto replaceMarkdown middle) without explicit edit', () => {
    const text = '# Keep\n\nOld body\n\n# Tail\n';
    const prior = parseBlocks(text);
    const nextText = '# Keep\n\nNew body line\n\n# Tail\n';
    const result = reparseBlocks({
      prior,
      text: nextText,
      replacedBlocks: { from: 1, to: 1 },
      neighborSlack: 0,
    });
    assertContiguous(result, nextText);
    expect(result.spans[0]).toBe(prior.spans[0]);
    expect(result.spans[1]!.markdown).toBe('New body line');
    expect(result.spans[2]!.markdown).toBe(prior.spans[2]!.markdown);
  });

  it('matches full parseBlocks on a multi-construct document after a local edit', () => {
    const text = [
      '---',
      'title: t',
      '---',
      '',
      '# Hello',
      '',
      'Para',
      '',
      '```',
      'code',
      '',
      'still',
      '```',
      '',
      '- [ ] task',
      '',
      '$$',
      'x',
      '$$',
      '',
    ].join('\n');
    const prior = parseBlocks(text);
    const para = prior.spans.find((s) => s.kind === 'paragraph')!;
    const paraIndex = prior.spans.indexOf(para);
    const edit: SourceEdit = {
      priorStart: para.start,
      priorEnd: para.end,
      inserted: 'Para updated',
    };
    const nextText = applySourceEdit(text, edit);
    const result = reparseBlocks({
      prior,
      edit,
      replacedBlocks: { from: paraIndex, to: paraIndex },
      neighborSlack: 1,
    });
    const full = parseBlocks(nextText);
    assertContiguous(result, nextText);
    expect(result.spans.map((s) => s.kind)).toEqual(full.spans.map((s) => s.kind));
    expect(result.spans.map((s) => s.markdown)).toEqual(full.spans.map((s) => s.markdown));
  });
});

describe('sourceEditBetween / reparseFromText (Phase 11)', () => {
  it('returns null when texts are identical', () => {
    expect(sourceEditBetween('a\n\nb\n', 'a\n\nb\n')).toBeNull();
  });

  it('derives a middle replacement that round-trips through applySourceEdit', () => {
    const prior = '# Title\n\nOld para\n\n## Tail\n';
    const next = '# Title\n\nNew para\n\n## Tail\n';
    const edit = sourceEditBetween(prior, next);
    expect(edit).not.toBeNull();
    // Longest common ends may share the trailing " para…"; the edit still
    // round-trips through applySourceEdit.
    expect(applySourceEdit(prior, edit!)).toBe(next);
    expect(edit!.priorStart).toBe(9);
    expect(edit!.inserted.length).toBeGreaterThan(0);
  });

  it('derives a pure insert at the caret between shared ends', () => {
    const prior = 'aaabb';
    const next = 'aaaXXbb';
    const edit = sourceEditBetween(prior, next);
    expect(edit).toEqual({ priorStart: 3, priorEnd: 3, inserted: 'XX' });
    expect(applySourceEdit(prior, edit!)).toBe(next);
  });

  it('reparses from full next text and keeps prefix span identity with slack 0', () => {
    const text = '# Keep\n\nChange me\n\n## Still\n';
    const prior = parseBlocks(text);
    const nextText = '# Keep\n\nChanged\n\n## Still\n';
    const result = reparseFromText(prior, nextText, { neighborSlack: 0 });
    assertContiguous(result, nextText);
    expect(result.spans[0]).toBe(prior.spans[0]);
    expect(result.spans.map((s) => s.markdown)).toEqual(
      parseBlocks(nextText).spans.map((s) => s.markdown),
    );
    expect(result.dirtyFrom).toBe(1);
    expect(result.dirtyTo).toBe(1);
  });

  it('matches a full parseBlocks of the next text with default neighbor slack', () => {
    const text = '# Keep\n\nChange me\n\n## Still\n';
    const prior = parseBlocks(text);
    const nextText = '# Keep\n\nChanged\n\n## Still\n';
    const result = reparseFromText(prior, nextText);
    const full = parseBlocks(nextText);
    assertContiguous(result, nextText);
    expect(result.spans.map((s) => [s.kind, s.markdown])).toEqual(
      full.spans.map((s) => [s.kind, s.markdown]),
    );
  });

  it('returns an empty dirty window when the text is unchanged', () => {
    const text = '# A\n\nB\n';
    const prior = parseBlocks(text);
    const result = reparseFromText(prior, text);
    expect(result.spans).toBe(prior.spans);
    expect(result.dirtyTo).toBeLessThan(result.dirtyFrom);
    expect(joinSplit(result)).toBe(text);
  });
});
