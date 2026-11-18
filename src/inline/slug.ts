/**
 * Where a `#fragment` link lands in a note.
 *
 * A note links to a place in itself the way GitHub spells it, and Typora
 * follows: `[jump](#b12-脚注)` for the heading "B12 脚注". The slug is the
 * heading in lower case with spaces as hyphens and every character dropped
 * that is not a letter, a digit, a mark, a hyphen, an underscore or a space;
 * CJK text is letters and stays. Two headings with one slug are told apart
 * with `-1`, `-2` after the first, skipping any a heading already has, as
 * github-slugger does: `a`, `a-1`, `a` are `a`, `a-1`, `a-2`.
 */

/** GitHub's slug for one heading's text. */
export function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** The slugs of a note's headings, in order, with GitHub's suffixes for repeats. */
export function headingSlugs(texts: readonly string[]): string[] {
  const occurrences = new Map<string, number>();
  return texts.map((text) => {
    const base = headingSlug(text);
    let slug = base;
    while (occurrences.has(slug)) {
      const count = occurrences.get(base)! + 1;
      occurrences.set(base, count);
      slug = `${base}-${count}`;
    }
    occurrences.set(slug, 0);
    return slug;
  });
}

function decoded(fragment: string): string {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

/**
 * Which of a note's headings a fragment names, by index, or null.
 *
 * Tried in order: a heading whose slug is the fragment (encoded or not, with
 * or without its `#`), then a heading whose text is the fragment as written,
 * which Typora also accepts. Anchors a note places with `<a id>` are the
 * host's to find; this knows only headings.
 */
export function headingForFragment(fragment: string, texts: readonly string[]): number | null {
  const wanted = decoded(fragment.replace(/^#/, '')).trim();
  if (wanted.length === 0) return null;
  const lower = wanted.toLowerCase();
  const asSlug = headingSlug(wanted);
  const slugs = headingSlugs(texts);
  const bySlug = slugs.findIndex((slug) => slug === lower || slug === asSlug);
  if (bySlug >= 0) return bySlug;
  const byText = texts.findIndex((text) => text.trim().toLowerCase() === lower);
  return byText >= 0 ? byText : null;
}
