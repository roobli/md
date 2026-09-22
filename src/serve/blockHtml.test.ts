import { describe, expect, it } from 'vitest';
import { parseBlocks } from '../parse.js';
import { spansToHtml } from './blockHtml.js';

describe('spansToHtml (parseBlocks path)', () => {
  it('renders heading + paragraph + list via parseBlocks IR', () => {
    const text = '# Hello\n\nPara with **bold**\n\n- a\n- b\n';
    const split = parseBlocks(text);
    expect(split.spans.every((s) => s.node === null)).toBe(true);
    const html = spansToHtml(split.spans);
    expect(html).toContain('<h1>Hello</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<ul class="rmd-bullet-list">');
    expect(html).toContain('<li>a</li>');
  });

  it('escapes raw HTML blocks instead of injecting', () => {
    const text = '<script>alert(1)</script>\n';
    const split = parseBlocks(text);
    const html = spansToHtml(split.spans);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});
