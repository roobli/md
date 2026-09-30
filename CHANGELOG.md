# Changelog

All notable changes to `@roobli/md`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Before 1.0 a minor release may
change the API; each entry says so when it does.

Phases refer to [`docs/design/roadmap.md`](docs/design/roadmap.md).

## [0.1.20] - 2026-09-30

### Fixed
- `reparseBlocks` and `reparseFromText` no longer cut a block short at the
  edge of their window. An edit that opened a code fence, a display-math block
  or an HTML comment without closing it was read as one short block followed
  by the old blocks after it, where a whole parse has it run to the end of the
  text. The window now has to end with the untouched block after it, exactly
  as that block was; when it does not, the reparse reads on to the end. A line
  that now continues the block before the window (lazy continuation) is also
  picked up. (Phase 23.)

### Changed
- `serializeDocument` builds the next document from the blocks it moved and
  small reparses around what changed, pinned the same way, instead of parsing
  its whole output again. The document is the one `parseDocument` would
  return, which the tests check on thousands of generated saves; the whole
  parse remains as the fallback. On an 8 MB note a one-block save goes from
  about 130-200 ms to 40-80 ms. (Phase 23.)
- Line-ending detection uses two native scans instead of a character loop,
  which took 20-35 ms of every parse of an 8 MB note.

## [0.1.19] - 2026-09-29

### Fixed
- Lazy continuation needs an open paragraph: empty quotes and marker-only empty
  list items no longer absorb unindented lines. A complete link definition
  absorbs at most one indented title line. Ordered lists that start at a
  number other than 1 no longer interrupt a paragraph. (Phase 22, CommonMark
  and micromark parity.)

## [0.1.18] - 2026-09-27

### Fixed
- Pipe-less delimiter rows such as `- | -` or `1. | ---` are list items, not
  tables. (Phase 21.)

## [0.1.17] - 2026-09-27

### Fixed
- Marker-only empty list items are lists; an empty item followed by a blank
  line and an indented block leaves that block outside the list. (Phase 20.)

## [0.1.16] - 2026-09-23

### Fixed
- Sibling lists at the same indent with a different bullet (`-` `+` `*`) or
  ordered delimiter (`.` `)`) start a new span. (Phase 19.)

## [0.1.15] - 2026-09-22

### Added
- `md serve <dir>`: a read-only local folder browser over HTTP, previewing
  Markdown through `parseBlocks`. The root is pinned and resolved with
  `realpath`, so symlinks cannot escape it. (Phase 18.)

## [0.1.14] - 2026-09-21

### Fixed
- A GFM table needs as many delimiter cells as header cells; otherwise it
  stays a paragraph. (Phase 17.)

## [0.1.13] - 2026-09-19

### Fixed
- Nested lists that mix markers stay one span when indented to the parent
  item's content column. (Phase 16.)

## [0.1.12] - 2026-09-18

### Fixed
- `text` followed by a continuous `---` is a setext level-2 heading, not a
  thematic break. (Phase 15.)

## [0.1.11] - 2026-09-17

### Fixed
- Adjacent definitions each start a block.

## [0.1.10] - 2026-09-17

### Fixed
- Nesting and interruption parity: definition lazy continuations, GFM tables
  interrupting paragraphs, and indented blocks after a blank line staying
  inside a list. (Phase 14.)

## [0.1.9] - 2026-09-17

### Fixed
- CommonMark lazy continuation: unprefixed paragraph lines stay inside quotes
  and list items. (Phase 13.)

## [0.1.8] - 2026-09-15

### Fixed
- CJK emphasis: `renderMarkdown` keeps Typora-shaped `**注意：**…` without
  escaping the Chinese flanking characters. (Phase 12.)

## [0.1.7] - 2026-09-15

### Added
- `sourceEditBetween` and `reparseFromText`, so a host holding a previous
  split and a full new buffer can reparse incrementally. (Phase 11.)

## [0.1.6] - 2026-09-15

### Fixed
- Up to three leading spaces before a block marker are counted as leading
  whitespace or gap, as micromark does. (Phase 10.)

## [0.1.5] - 2026-09-15

### Changed
- Table delimiters are widened to the three-dash style
  (`| --- | :--- | :---: |`); cell content stays unpadded. (Phase 9.)

## [0.1.4] - 2026-09-14

### Changed
- Serialize keeps verbatim runs (wiki links, alerts, footnotes, `[TOC]`,
  snake_case identifiers) and bare http(s) autolinks as written. (Phase 8.)

## [0.1.3] - 2026-09-14

### Changed
- Serialize writes a hard break as two trailing spaces and keeps each list's
  marker and ordered delimiter. (Phase 7.)

## [0.1.2] - 2026-09-11

### Added
- Native indented code blocks.

## [0.1.1] - 2026-09-11

### Fixed
- Tightly adjacent quotes and callouts split the way micromark splits them.

## [0.1.0] - 2026-09-11

### Added
- A native block scanner with exact byte offsets and preserved gaps:
  headings, paragraphs, lists, task lists, fenced code, quotes, thematic
  breaks, GFM tables, display math, YAML frontmatter, HTML blocks, and link
  and footnote definitions. (Phases 1–3.)
- Incremental reparse of a dirty window with `reparseBlocks`. (Phase 4.)
- Byte-exact saves: `serializeDocument`, `identityUnits` and `joinSplit`
  slice untouched blocks from the source rather than re-emitting them.
  (Phase 5.)

### Changed
- micromark is off the hot path and available only from
  `@roobli/md/legacy-micromark`. (Phase 6; breaking for callers that relied
  on the fallback.)

[0.1.20]: https://github.com/roobli/md/compare/v0.1.19...v0.1.20
[0.1.19]: https://github.com/roobli/md/compare/v0.1.18...v0.1.19
[0.1.18]: https://github.com/roobli/md/compare/v0.1.17...v0.1.18
[0.1.17]: https://github.com/roobli/md/compare/v0.1.16...v0.1.17
[0.1.16]: https://github.com/roobli/md/compare/v0.1.15...v0.1.16
[0.1.15]: https://github.com/roobli/md/compare/v0.1.14...v0.1.15
[0.1.14]: https://github.com/roobli/md/compare/v0.1.13...v0.1.14
[0.1.13]: https://github.com/roobli/md/compare/v0.1.12...v0.1.13
[0.1.12]: https://github.com/roobli/md/compare/v0.1.11...v0.1.12
[0.1.11]: https://github.com/roobli/md/compare/v0.1.10...v0.1.11
[0.1.10]: https://github.com/roobli/md/compare/v0.1.9...v0.1.10
[0.1.9]: https://github.com/roobli/md/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/roobli/md/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/roobli/md/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/roobli/md/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/roobli/md/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/roobli/md/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/roobli/md/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/roobli/md/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/roobli/md/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/roobli/md/releases/tag/v0.1.0
