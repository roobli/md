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

  it('natively splits YAML frontmatter with exact offsets', () => {
    const text = '---\ntitle: t\nauthor: a\n---\n\nHi\n';
    const split = tryNativeSplit(text);
    expect(split).not.toBeNull();
    expect(joinSplit(split!)).toBe(text);
    expect(split!.spans.map((s) => s.kind)).toEqual(['frontmatter', 'paragraph']);
    expect(split!.spans[0]!.start).toBe(0);
    expect(split!.spans[0]!.end).toBe('---\ntitle: t\nauthor: a\n---'.length);
    expect(split!.spans[0]!.markdown).toBe('---\ntitle: t\nauthor: a\n---');
    expect(split!.spans[0]!.node).toBeNull();
  });

  it('splits tight adjacent quotes across an unprefixed blank (CommonMark ex. 231)', () => {
    const text = '> 普通引用\n> second line\n\n> [!NOTE]\n> 显式 callout\n';
    const split = tryNativeSplit(text);
    expect(split).not.toBeNull();
    expect(joinSplit(split!)).toBe(text);
    expect(split!.spans.map((s) => s.kind)).toEqual(['quote', 'quote']);
    expect(split!.spans[0]!.markdown).toBe('> 普通引用\n> second line');
    expect(split!.spans[1]!.markdown).toBe('> [!NOTE]\n> 显式 callout');
    expect(split!.gaps).toEqual(['\n\n']);
  });

  it('keeps one quote when blank lines carry the > marker', () => {
    const text = '> foo\n>\n> bar\n';
    const split = tryNativeSplit(text);
    expect(split).not.toBeNull();
    expect(joinSplit(split!)).toBe(text);
    expect(split!.spans).toHaveLength(1);
    expect(split!.spans[0]!.kind).toBe('quote');
    expect(split!.spans[0]!.markdown).toBe('> foo\n>\n> bar');
  });

  it('keeps CommonMark lazy continuation inside quotes (Phase 13)', () => {
    const para = '> foo\nbar\n\nAfter\n';
    const paraSplit = tryNativeSplit(para)!;
    expect(joinSplit(paraSplit)).toBe(para);
    expect(paraSplit.spans.map((s) => s.kind)).toEqual(['quote', 'paragraph']);
    expect(paraSplit.spans[0]!.markdown).toBe('> foo\nbar');

    const list = '> - foo\nbar\n\nAfter\n';
    const listSplit = tryNativeSplit(list)!;
    expect(joinSplit(listSplit)).toBe(list);
    expect(listSplit.spans.map((s) => s.kind)).toEqual(['quote', 'paragraph']);
    expect(listSplit.spans[0]!.markdown).toBe('> - foo\nbar');

    const setext = '> foo\n===\n\nAfter\n';
    const setextSplit = tryNativeSplit(setext)!;
    expect(setextSplit.spans.map((s) => s.kind)).toEqual(['quote', 'paragraph']);
    expect(setextSplit.spans[0]!.markdown).toBe('> foo\n===');

    // Block starts still end the quote (micromark parity).
    const hr = '> foo\n---\n\nAfter\n';
    expect(tryNativeSplit(hr)!.spans.map((s) => s.kind)).toEqual([
      'quote',
      'thematic-break',
      'paragraph',
    ]);
    const atx = '> foo\n# bar\n\nAfter\n';
    expect(tryNativeSplit(atx)!.spans.map((s) => s.kind)).toEqual([
      'quote',
      'heading',
      'paragraph',
    ]);
    const outerList = '> - foo\n- bar\n\nAfter\n';
    expect(tryNativeSplit(outerList)!.spans.map((s) => s.kind)).toEqual([
      'quote',
      'bullet-list',
      'paragraph',
    ]);
  });

  it('keeps CommonMark lazy continuation inside lists (Phase 13)', () => {
    const bullet = '- foo\nbar\n\nAfter\n';
    const bulletSplit = tryNativeSplit(bullet)!;
    expect(joinSplit(bulletSplit)).toBe(bullet);
    expect(bulletSplit.spans.map((s) => s.kind)).toEqual(['bullet-list', 'paragraph']);
    expect(bulletSplit.spans[0]!.markdown).toBe('- foo\nbar');

    const ordered = '1. foo\nbar\n\nAfter\n';
    const orderedSplit = tryNativeSplit(ordered)!;
    expect(orderedSplit.spans.map((s) => s.kind)).toEqual(['ordered-list', 'paragraph']);
    expect(orderedSplit.spans[0]!.markdown).toBe('1. foo\nbar');

    const nested = '- foo\n  - bar\nbaz\n\nAfter\n';
    const nestedSplit = tryNativeSplit(nested)!;
    expect(nestedSplit.spans.map((s) => s.kind)).toEqual(['bullet-list', 'paragraph']);
    expect(nestedSplit.spans[0]!.markdown).toBe('- foo\n  - bar\nbaz');

    // A following list marker is a new block, not lazy text.
    const two = '- foo\n- bar\n';
    expect(tryNativeSplit(two)!.spans.map((s) => s.kind)).toEqual(['bullet-list']);
    expect(tryNativeSplit(two)!.spans[0]!.markdown).toBe('- foo\n- bar');
  });

  it('Phase 14: footnote/link-def lazy continuation', () => {
    const fn = '[^1]: first\nlazy line\n';
    const fnSplit = tryNativeSplit(fn)!;
    expect(joinSplit(fnSplit)).toBe(fn);
    expect(fnSplit.spans.map((s) => s.kind)).toEqual(['footnote-definition']);
    expect(fnSplit.spans[0]!.markdown).toBe('[^1]: first\nlazy line');

    // Indented title/body still works; blank still ends the definition.
    const titled = '[foo]: /url\n  "title"\n\nAfter\n';
    const titledSplit = tryNativeSplit(titled)!;
    expect(joinSplit(titledSplit)).toBe(titled);
    expect(titledSplit.spans.map((s) => s.kind)).toEqual(['link-definition', 'paragraph']);
    expect(titledSplit.spans[0]!.markdown).toBe('[foo]: /url\n  "title"');

    // A following block start is not lazy-absorbed.
    const atx = '[^1]: first\n# Heading\n';
    expect(tryNativeSplit(atx)!.spans.map((s) => s.kind)).toEqual([
      'footnote-definition',
      'heading',
    ]);

    // Adjacent definitions stay separate spans (not absorbed as lazy text).
    const twoLinks = '[alpha]: https://example.com/alpha "Alpha Title"\n[shortcut]: https://example.com/shortcut\n';
    const twoSplit = tryNativeSplit(twoLinks)!;
    expect(joinSplit(twoSplit)).toBe(twoLinks);
    expect(twoSplit.spans.map((s) => s.kind)).toEqual([
      'link-definition',
      'link-definition',
    ]);
    expect(twoSplit.spans[0]!.markdown).toBe('[alpha]: https://example.com/alpha "Alpha Title"');
    expect(twoSplit.spans[1]!.markdown).toBe('[shortcut]: https://example.com/shortcut');
  });

  it('Phase 14: GFM tables interrupt paragraphs', () => {
    const text = 'para\n| a | b |\n| --- | --- |\n';
    const split = tryNativeSplit(text)!;
    expect(joinSplit(split)).toBe(text);
    expect(split.spans.map((s) => s.kind)).toEqual(['paragraph', 'table']);
    expect(split.spans[0]!.markdown).toBe('para');
    expect(split.spans[1]!.markdown).toBe('| a | b |\n| --- | --- |');

    // Lone pipe lines without a delimiter row stay in the paragraph.
    const pipes = 'para\n| not a table\n';
    const pipesSplit = tryNativeSplit(pipes)!;
    expect(pipesSplit.spans.map((s) => s.kind)).toEqual(['paragraph']);
    expect(pipesSplit.spans[0]!.markdown).toBe('para\n| not a table');
  });

  it('Phase 14: list continues after blank when next content is indented', () => {
    const table = '- item\n\n  | a | b |\n  | - | - |\n  | 1 | 2 |\n';
    const tableSplit = tryNativeSplit(table)!;
    expect(joinSplit(tableSplit)).toBe(table);
    expect(tableSplit.spans.map((s) => s.kind)).toEqual(['bullet-list']);
    expect(tableSplit.spans[0]!.markdown).toBe(
      '- item\n\n  | a | b |\n  | - | - |\n  | 1 | 2 |',
    );

    const code = '1. hi\n\n    code\n    more\n';
    const codeSplit = tryNativeSplit(code)!;
    expect(joinSplit(codeSplit)).toBe(code);
    expect(codeSplit.spans.map((s) => s.kind)).toEqual(['ordered-list']);
    expect(codeSplit.spans[0]!.markdown).toBe('1. hi\n\n    code\n    more');

    // Unindented content after a blank still ends the list.
    const after = '- item\n\nAfter\n';
    expect(tryNativeSplit(after)!.spans.map((s) => s.kind)).toEqual([
      'bullet-list',
      'paragraph',
    ]);
  });

    it('natively splits display math $$ with exact offsets', () => {
    const text = '$$\n\\sum_i x_i\n$$\n\nAfter\n';
    const split = tryNativeSplit(text);
    expect(split).not.toBeNull();
    expect(joinSplit(split!)).toBe(text);
    expect(split!.spans.map((s) => s.kind)).toEqual(['display-math', 'paragraph']);
    expect(split!.spans[0]!.start).toBe(0);
    expect(split!.spans[0]!.end).toBe('$$\n\\sum_i x_i\n$$'.length);
    expect(split!.spans[0]!.node).toBeNull();
    // Same-line $$…$$ stays a paragraph (inline), not display-math.
    const inline = tryNativeSplit('$$x = 1$$\n');
    expect(inline!.spans.map((s) => s.kind)).toEqual(['paragraph']);
  });

  it('natively splits HTML blocks (type 1/2/6/7) with exact offsets', () => {
    const div = '<div>\nHi\n</div>\n\nAfter\n';
    const divSplit = tryNativeSplit(div);
    expect(divSplit).not.toBeNull();
    expect(joinSplit(divSplit!)).toBe(div);
    expect(divSplit!.spans.map((s) => s.kind)).toEqual(['html', 'paragraph']);
    expect(divSplit!.spans[0]!.markdown).toBe('<div>\nHi\n</div>');
    expect(divSplit!.spans[0]!.start).toBe(0);
    expect(divSplit!.spans[0]!.end).toBe('<div>\nHi\n</div>'.length);

    const comment = '<!-- c\nspanning\n-->\n';
    const commentSplit = tryNativeSplit(comment);
    expect(commentSplit!.spans[0]!.kind).toBe('html');
    expect(commentSplit!.spans[0]!.markdown).toBe('<!-- c\nspanning\n-->');

    const script = '<script>\nalert(1)\n</script>\n';
    expect(tryNativeSplit(script)!.spans[0]!.kind).toBe('html');

    // Type 7 continues until blank line.
    const br = '<br/>\nHi\n';
    const brSplit = tryNativeSplit(br);
    expect(brSplit!.spans).toHaveLength(1);
    expect(brSplit!.spans[0]!.kind).toBe('html');
    expect(brSplit!.spans[0]!.markdown).toBe('<br/>\nHi');
  });

  it('natively splits link and footnote definitions with exact offsets', () => {
    const link = '[id]: https://example.com\n\nUse [id]\n';
    const linkSplit = tryNativeSplit(link);
    expect(linkSplit).not.toBeNull();
    expect(joinSplit(linkSplit!)).toBe(link);
    expect(linkSplit!.spans.map((s) => s.kind)).toEqual(['link-definition', 'paragraph']);
    expect(linkSplit!.spans[0]!.start).toBe(0);
    expect(linkSplit!.spans[0]!.end).toBe('[id]: https://example.com'.length);
    expect(linkSplit!.spans[0]!.node).toBeNull();

    const titled = '[foo]: /url\n  "title"\n';
    const titledSplit = tryNativeSplit(titled);
    expect(titledSplit!.spans[0]!.kind).toBe('link-definition');
    expect(titledSplit!.spans[0]!.markdown).toBe('[foo]: /url\n  "title"');

    const fn = '[^note]: line1\n  line2\n\nPara\n';
    const fnSplit = tryNativeSplit(fn);
    expect(fnSplit!.spans.map((s) => s.kind)).toEqual(['footnote-definition', 'paragraph']);
    expect(fnSplit!.spans[0]!.markdown).toBe('[^note]: line1\n  line2');
  });

  it('natively splits indented code with exact offsets (beats paragraph mislabel)', () => {
    const single = '    indented();\n';
    const singleSplit = tryNativeSplit(single);
    expect(singleSplit).not.toBeNull();
    expect(joinSplit(singleSplit!)).toBe(single);
    expect(singleSplit!.spans).toHaveLength(1);
    expect(singleSplit!.spans[0]!.kind).toBe('indented-code');
    expect(singleSplit!.spans[0]!.start).toBe(0);
    expect(singleSplit!.spans[0]!.end).toBe('    indented();'.length);
    expect(singleSplit!.spans[0]!.markdown).toBe('    indented();');
    expect(singleSplit!.spans[0]!.node).toBeNull();

    // Tab indent counts as ≥4.
    const tabbed = '\ttabbed\n';
    expect(tryNativeSplit(tabbed)!.spans[0]!.kind).toBe('indented-code');

    // Internal blank between indented chunks stays one block (micromark parity).
    const multi = '    a\n\n    b\n';
    const multiSplit = tryNativeSplit(multi);
    expect(joinSplit(multiSplit!)).toBe(multi);
    expect(multiSplit!.spans).toHaveLength(1);
    expect(multiSplit!.spans[0]!.kind).toBe('indented-code');
    expect(multiSplit!.spans[0]!.markdown).toBe('    a\n\n    b');

    // After a paragraph + blank → indented-code, not paragraph.
    const after = 'Para\n\n    code\n';
    const afterSplit = tryNativeSplit(after);
    expect(joinSplit(afterSplit!)).toBe(after);
    expect(afterSplit!.spans.map((s) => s.kind)).toEqual(['paragraph', 'indented-code']);
    expect(afterSplit!.spans[1]!.markdown).toBe('    code');

    // Does not interrupt a paragraph (CommonMark).
    const lazy = 'foo\n    bar\n';
    const lazySplit = tryNativeSplit(lazy);
    expect(lazySplit!.spans.map((s) => s.kind)).toEqual(['paragraph']);
    expect(lazySplit!.spans[0]!.markdown).toBe('foo\n    bar');

    // 4-space list / fence-looking lines are indented-code, not list/fence.
    expect(tryNativeSplit('    - not list\n')!.spans[0]!.kind).toBe('indented-code');
    expect(tryNativeSplit('    ```\n    notfence\n')!.spans[0]!.kind).toBe('indented-code');

    // 3 spaces remain a paragraph (not indented-code); Phase 10 drops the
    // prefix from the span (micromark parity).
    const three = tryNativeSplit('   three\n')!;
    expect(three.spans[0]!.kind).toBe('paragraph');
    expect(three.leading).toBe('   ');
    expect(three.spans[0]!.markdown).toBe('three');
    expect(three.spans[0]!.start).toBe(3);
  });

  it('Phase 10: line-prefix offsets match micromark (spaces → leading/gap)', () => {
    const heading = tryNativeSplit('  # Title\n')!;
    expect(joinSplit(heading)).toBe('  # Title\n');
    expect(heading.leading).toBe('  ');
    expect(heading.spans[0]!.kind).toBe('heading');
    expect(heading.spans[0]!.start).toBe(2);
    expect(heading.spans[0]!.markdown).toBe('# Title');

    const listAfter = tryNativeSplit('# first\n\n  - item\n')!;
    expect(joinSplit(listAfter)).toBe('# first\n\n  - item\n');
    expect(listAfter.spans.map((s) => s.kind)).toEqual(['heading', 'bullet-list']);
    expect(listAfter.gaps[0]).toBe('\n\n  ');
    expect(listAfter.spans[1]!.markdown).toBe('- item');
    expect(listAfter.spans[1]!.start).toBe(11);

    const quote = tryNativeSplit('   > hi\n')!;
    expect(quote.leading).toBe('   ');
    expect(quote.spans[0]!.markdown).toBe('> hi');

    const fence = tryNativeSplit('  ```\ncode\n```\n')!;
    expect(fence.leading).toBe('  ');
    expect(fence.spans[0]!.markdown).toBe('```\ncode\n```');

    const table = tryNativeSplit('   | a | b |\n   | - | - |\n')!;
    expect(table.leading).toBe('   ');
    expect(table.spans[0]!.markdown.startsWith('| a | b |')).toBe(true);

    const para = tryNativeSplit('  foo\n  bar\n')!;
    expect(para.leading).toBe('  ');
    expect(para.spans[0]!.markdown).toBe('foo\n  bar');

    // HTML and indented-code keep their opening bytes (micromark parity).
    const html = tryNativeSplit('  <!-- c -->\n')!;
    expect(html.leading).toBe('');
    expect(html.spans[0]!.markdown).toBe('  <!-- c -->');

    const indented = tryNativeSplit('    code();\n')!;
    expect(indented.leading).toBe('');
    expect(indented.spans[0]!.kind).toBe('indented-code');
    expect(indented.spans[0]!.markdown).toBe('    code();');
  });

  it('handles frontmatter + math + html + defs in one native pass', () => {
    const text =
      '---\ntitle: t\n---\n\n# H\n\n$$\na+b\n$$\n\n<div>\nx\n</div>\n\n[ref]: https://ex.com\n\n[^a]: note\n';
    const split = tryNativeSplit(text);
    expect(split).not.toBeNull();
    expect(joinSplit(split!)).toBe(text);
    expect(split!.spans.map((s) => s.kind)).toEqual([
      'frontmatter',
      'heading',
      'display-math',
      'html',
      'link-definition',
      'footnote-definition',
    ]);
    expect(split!.spans.every((s) => s.node === null)).toBe(true);
  });
});
