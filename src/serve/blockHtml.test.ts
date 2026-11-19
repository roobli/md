import { describe, expect, it } from 'vitest';
import { parseBlocks } from '../parse.js';
import { spansToHtml } from './blockHtml.js';

describe('spansToHtml (parseBlocks path)', () => {
  it('renders heading + paragraph + list via parseBlocks IR', () => {
    const text = '# Hello\n\nPara with **bold**\n\n- a\n- b\n';
    const split = parseBlocks(text);
    expect(split.spans.every((s) => s.node === null)).toBe(true);
    const html = spansToHtml(split.spans);
    expect(html).toContain('<h1 id="hello">Hello</h1>');
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

describe('inline syntax Typora draws, read through @roobli/md/inline', () => {
  const html = (text: string) => spansToHtml(parseBlocks(text).spans);

  it('draws highlight, superscript, subscript and emoji, and hides an escaped space', () => {
    const out = html('A ==key== x^2^ H~2~O X~long\\ text~ :smile: 10:30:00\n');
    expect(out).toContain('<mark>key</mark>');
    expect(out).toContain('x<sup>2</sup>');
    expect(out).toContain('H<sub>2</sub>O');
    expect(out).toContain('<sub>long text</sub>');
    expect(out).toContain('<span class="rmd-emoji" title=":smile:">\u{1F604}</span>');
    expect(out).toContain('10:30:00');
  });

  it('reads nothing inside a code span', () => {
    const out = html('`==no== <b>x</b> :smile:`\n');
    expect(out).toContain('<code>==no== &lt;b&gt;x&lt;/b&gt; :smile:</code>');
  });

  it('draws the tags a note colours and sizes words with, through custom properties only', () => {
    const out = html('<span style="color:red; position:fixed">red</span> <font color=green size=5>big</font> <abbr title="HyperText">HTML</abbr> <kbd>Ctrl</kbd>\n');
    expect(out).toContain('<span class="rmd-styled" style="--note-color: red">red</span>');
    expect(out).toContain('<span class="rmd-styled" style="--note-color: green; --note-size: 1.5em">big</span>');
    expect(out).toContain('<abbr title="HyperText">HTML</abbr>');
    expect(out).toContain('<kbd>Ctrl</kbd>');
    expect(out).not.toContain('position');
  });

  it('escapes every other tag, hides comments, and closes what a line left open', () => {
    const out = html('<img src=x onerror=alert(1)> <span class="x">c</span> a<!-- hidden -->b <b>open\n');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;span class=&quot;x&quot;&gt;c&lt;/span&gt;');
    expect(out).toContain('ab');
    expect(out).not.toContain('hidden');
    expect(out).toMatch(/<b>open<\/b><\/p>$/);
  });

  it('places an anchor a note names, and draws no link tag for it', () => {
    expect(html('<a id="here">Here</a> it is\n')).toContain('<p><a id="here"></a>Here it is</p>');
  });

  it('gives each heading the slug a fragment link names, repeats suffixed', () => {
    const out = html('# B12 \u811a\u6ce8\n\n## Setup\n\n## Setup\n\n[go](#b12-\u811a\u6ce8)\n');
    expect(out).toContain('<h1 id="b12-\u811a\u6ce8">B12 \u811a\u6ce8</h1>');
    expect(out).toContain('<h2 id="setup">Setup</h2>');
    expect(out).toContain('<h2 id="setup-1">Setup</h2>');
    expect(out).toContain('<a href="#b12-\u811a\u6ce8"');
  });

  it('keeps a tag written in a link target inside the target, and a forged placeholder out', () => {
    for (const text of [
      '[x](https://a.b/<abbr title="x onmouseover=alert(1) y">)\n',
      '[x](https://a.b/\u00000\u0000) <abbr title="q onmouseover=alert(1)">t</abbr>\n',
      '[x](https://a.b/`<b onmouseover=alert(1)>`)\n',
    ]) {
      const out = html(text);
      const anchors = out.match(/<a [^>]*>/g) ?? [];
      for (const anchor of anchors) expect(anchor).toMatch(/^<a href="[^"<>]*" rel="noopener noreferrer">$/);
      expect(out).not.toContain('\u0000');
    }
  });

  it('reads the label of a link as inline text', () => {
    expect(html('[**bold** ==mark==](https://a.b)\n')).toContain('<a href="https://a.b" rel="noopener noreferrer"><strong>bold</strong> <mark>mark</mark></a>');
  });

  it('keeps snake_case words and arithmetic as written', () => {
    const out = html('use snake_case_name and 2 * 3 * 4\n');
    expect(out).toContain('snake_case_name');
    expect(out).not.toContain('<em>');
  });
});
