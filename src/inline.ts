/**
 * `@roobli/md/inline`: the readers for what a note writes inside a line that
 * CommonMark does not, as Typora draws it. Each is pure and reads a string,
 * so an editor can draw from it and a renderer can emit from it alike.
 */
export { ALL_MARK_KINDS, typoraMarkRanges } from './inline/marks.js';
export type { TyporaMarkKind, TyporaMarkKinds, TyporaMarkRange } from './inline/marks.js';
export { BARE_TAGS, closingTag, isInlineComment, openingTag } from './inline/tag.js';
export type { InlineTag } from './inline/tag.js';
export { headingForFragment, headingSlug, headingSlugs } from './inline/slug.js';
