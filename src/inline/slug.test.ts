import { describe, expect, it } from 'vitest';
import { headingForFragment, headingSlug, headingSlugs } from './slug.js';

const texts = ['B12 脚注', '九、HTML', 'Setup', 'Setup'];

describe('heading slugs', () => {
  it('slugs as GitHub and Typora do, keeping CJK', () => {
    expect(headingSlug('B12 脚注')).toBe('b12-脚注');
    expect(headingSlug('九、HTML')).toBe('九html');
    expect(headingSlug('What’s new?')).toBe('whats-new');
    expect(headingSlug('  a  b ')).toBe('a--b');
  });

  it('tells repeats apart with a suffix after the first', () => {
    expect(headingSlugs(texts)).toEqual(['b12-脚注', '九html', 'setup', 'setup-1']);
    // A suffix never lands on a slug a heading already has, as in github-slugger.
    expect(headingSlugs(['a', 'a-1', 'a', 'a'])).toEqual(['a', 'a-1', 'a-2', 'a-3']);
  });

  it('finds a heading by slug, encoded or not, then by its text as written', () => {
    expect(headingForFragment('b12-脚注', texts)).toBe(0);
    expect(headingForFragment(`#${encodeURIComponent('b12-脚注')}`, texts)).toBe(0);
    expect(headingForFragment('九、HTML', texts)).toBe(1);
    expect(headingForFragment('setup', texts)).toBe(2);
    expect(headingForFragment('setup-1', texts)).toBe(3);
    expect(headingForFragment('nowhere', texts)).toBeNull();
    expect(headingForFragment('#', texts)).toBeNull();
  });
});
