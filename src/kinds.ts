/**
 * Block kinds aligned with Noto markdown v3 (`NotoBlockKind`).
 * Keep the string union identical so adapters stay trivial.
 */
export type BlockKind =
  | 'heading'
  | 'paragraph'
  | 'bullet-list'
  | 'ordered-list'
  | 'task-list'
  | 'quote'
  | 'fenced-code'
  | 'indented-code'
  | 'table'
  | 'display-math'
  | 'frontmatter'
  | 'html'
  | 'thematic-break'
  | 'footnote-definition'
  | 'link-definition';
