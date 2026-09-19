# Roadmap — @roobli/md

Phases are ordered for Noto’s bridge (`docs/design/noto-bridge.md`): keep
`parseBlocks` / `parseDocument` stable, grow the native scanner behind them,
and only then quarantine micromark from the hot path (done in Phase 6).

| Phase | Status | Deliverable |
| ----- | ------ | ----------- |
| **0** | **Done** | Package scaffold, design docs, public API. Micromark + mdast dialect behind `// replace` in `src/backend/micromark-backend.ts`. Coverage + BOM tests. |
| **1** | **Done (vertical slice)** | Own **block splitter** with exact offsets that beats a blank-line-naive split (fences keep internal blanks; loose lists stay one block). Native recognition: ATX/setext heading, paragraph, bullet/ordered list, fenced code, quote, thematic break. **Fall back to micromark** for unknown constructs. Bench vs micromark deferred. |
| **2** | **Done** | Native **GFM tables** + **task lists** (strikethrough stays inline inside paragraphs). Micromark fallback shrinks to math / frontmatter / HTML / definitions. |
| **3** | **Done** | Native **display math** (`$$`), **YAML frontmatter**, HTML blocks, link/footnote definitions with exact offsets. Whole-doc micromark fallback no longer triggered for those constructs. Synthetic corpus A/B bench vs micromark recorded in `docs/design/bench.md`. |
| **4** | **Done** | **Incremental / block-local reparse** (`reparseBlocks` + edit range / replaced ordinals). Streaming / first-paint remains a host concern (parse a prefix with `parseBlocks`). |
| **5** | **Done** | **Serialize** dialect aligned with Noto’s byte-exact save rules (untouched spans sliced, not re-emitted). |
| **6** | **Done** | Quarantine micromark from the hot path; legacy entry `@roobli/md/legacy-micromark`; mdast `node` optional on native path. |
| **7** | **Done** | Serialize dialect parity: hard-break → two trailing spaces; list marker / ordered delimiter from `node.data`. |
| **8** | **Done** | Serialize dialect: verbatim runs (wiki / alert / footnote / TOC / snake_case / metrics) + bare http(s) autolink — previously host-owned in Noto. |
| **9** | **Done** | Table delimiter widening to vault three-dash style; `tablePipeAlign: false` kept (content unpadded). |
| **10** | **Done** | Line-prefix offset alignment: up to three leading ASCII spaces before a block marker land in leading/gaps (micromark parity); html / indented-code / frontmatter unchanged. |
| **11** | **Done** | Host helpers: `sourceEditBetween` + `reparseFromText` — derive a contiguous `SourceEdit` from prior/next full buffers and incremental-reparse without a hand-built edit or ordinals. |
| **12** | **Done** | CJK emphasis / Typora interop lock-in: `renderMarkdown` keeps Typora-shaped `**注意：**…` without numeric-escaping Chinese flanking. |
| **13** | **Done** | CommonMark **lazy continuation** in native split: unprefixed paragraph lines stay inside **quotes** and **list items** (micromark parity; setext `===` in quotes; `---` / ATX / fences / new list markers still end the block). |
| **14** | **Done** | Nest / interrupt parity vs micromark: **definition lazy** continuations; **GFM tables interrupt paragraphs**; lists keep **indented nested blocks after a blank** (tables / indented-code stay inside the list span). |
| **15** | **Done** | CommonMark **setext level-2** (`text` + continuous `---`) vs thematic-break parity: while extending a paragraph, `isSetextUnderline` wins before `isBlockStart` / thematic; spaced `- - -` / `***` / `___` stay thematic; standalone `---` unchanged. Closes Noto intentional golden gap #1. |

## Phase 1 acceptance (this slice)

- [x] `tryNativeSplit(text)` in `src/backend/native-scanner.ts`
- [x] `parseBlocks` prefers native, falls back to micromark
- [x] Fence-with-internal-blank stays **one** `fenced-code` span (naive split fails)
- [x] Loose lists stay one span; math/frontmatter/HTML/definitions still parse via micromark
- [x] Bench vs micromark on a public medium corpus (completed in Phase 3; no private vault files)

## Phase 2 acceptance

- [x] Native **GFM tables** (header + delimiter + body) with exact offsets; `node: null`
- [x] Native **task lists** (bullet/ordered, loose, mixed checkbox → `task-list`)
- [x] Documents that are only Phase 1+2 constructs no longer hit micromark
- [x] Micromark remains for display math, YAML frontmatter, HTML blocks, link/footnote defs (until Phase 3)
- [x] Bench vs micromark on a public medium corpus (completed in Phase 3)

## Phase 3 acceptance

- [x] Native **YAML frontmatter** at doc start with exact offsets; `node: null`
- [x] Native **display math** `$$` fences (same-line `$$…$$` stays paragraph / inline)
- [x] Native **HTML blocks** (CommonMark types 1–7 subset used by Noto’s dialect)
- [x] Native **link-definition** + **footnote-definition** (incl. indented continuations)
- [x] Whole-doc micromark fallback no longer fires for Phase 3 constructs
- [x] `scripts/bench-ab.mjs` synthetic medium/large A/B vs micromark; numbers in `docs/design/bench.md`

Phase 3 **shipped** on `main`. Phase 6 moved micromark behind `@roobli/md/legacy-micromark`.

### What still falls back / remaining gaps

- **Whole-doc micromark fallback (Phase 6)**: removed from `parseBlocks`. Compat lives at `@roobli/md/legacy-micromark`.
- **Indented code**: **native** (`indented-code`) with exact offsets; internal blanks between indented chunks stay one span; does not interrupt paragraphs (CommonMark). Shipped post–Phase 6 in v0.1.2.
- **Line-prefix offsets**: **aligned** (Phase 10) — up to three leading ASCII spaces before a block marker go to leading/gaps, matching micromark; html / indented-code / frontmatter keep opening bytes.
- **CJK emphasis / `semanticKey`**: block split is kind+offset only; **serialize** CJK flanking locked in Phase 12 (`renderMarkdown`). Inline parse / `semanticKey` remains a host / IR concern.
- **Phase 4 done**: `reparseBlocks` stitches local native reparses; see contract.
- **Phase 5 done**: `serializeDocument` / hardened `joinSplit`; see contract.

## Phase 4 acceptance

- [x] `reparseBlocks({ prior, edit?, replacedBlocks?, neighborSlack? })` in `src/reparse.ts`
- [x] Reparse only dirty window (+ neighbors); stitch spans/gaps with absolute offsets
- [x] Tests: edit middle paragraph, edit fence, insert/delete block boundary; contiguous offsets; untouched markdown identity
- [x] Contract + roadmap document the API; micromark stays out of the hot path
- [x] Noto bridge note: `replaceMarkdown` / single-block path can call `reparseBlocks`

Phase 4 **shipped** on `main`. Streaming first-paint hooks stay with the host
(open can still `parseBlocks` a growing prefix); no separate streaming API in
this package yet.


## Phase 5 acceptance

- [x] Untouched spans emitted by slicing original source offsets (never re-stringify)
- [x] Gaps between adjacent pristine / blank-line neighbours reused from prior split
- [x] Edited spans via host markdown or `renderMarkdown` dialect path (Noto-compatible defaults)
- [x] `joinSplit(split, source?)` hardened; `serializeDocument` + `replaceBlock` + identity round-trips
- [x] Tests: open → touch one block → file equals except that block; long rule / aligned table preserved
- [x] Contract + roadmap + Noto bridge adoption notes

Phase 5 **shipped** on `main`. Full Noto transaction versioning / sha256 /
preserved-range store checks stay in Noto until the bridge adopts this API.

## Noto hand-off checkpoints

After Phase 2+: adapter can map `parseBlocks` → `splitBlocks` while Noto keeps
branded IDs and hashing. After Phase 5: Noto can call `serializeDocument` /
`replaceBlock` (or keep its richer `NotoTransaction` wrapper). Wire `nodes`
remain a host concern until the engine’s IR is stable.

## Phase 6 acceptance

- [x] `parseBlocks` / `parseDocument` / `reparseBlocks` / serialize never import micromark on the default path
- [x] Micromark backend exported only via `@roobli/md/legacy-micromark`
- [x] Direct micromark-extension / `mdast-util-from-markdown` deps moved to `optionalDependencies`
- [x] `pnpm bench:ab` compares native vs legacy entry
- [x] Document dependency / entry breaking change honestly

Phase 6 **shipped** on `main`. Post–Phase 6 construct polish: **native
indented-code** (v0.1.2).

## Phase 7 acceptance

- [x] `break` handler: default `\\n` → two-space hard break (`  \n`); other forms preserved
- [x] `list` handler: `node.data.bullet` (`*`/`+`/`-`) and ordered `node.data.delimiter` (`.`/`)`) temporarily set serializer options
- [x] Wired into `serializerOptions.extensions` in `src/dialect.ts`
- [x] Tests in `src/dialect.test.ts` (hard break, star bullet, `)` delimiter)
- [x] Contract + README + roadmap updated; package `0.1.3`

Phase 7 **shipped** on `main` (v0.1.3).

## Phase 8 acceptance

- [x] `verbatimRunsInText`: wiki `[[…]]`, alerts, footnotes, `[TOC]`, snake_case,
      metrics (`NDCG@10`), lone `*nix`-style stars; image alt uses the same runs
- [x] `bareAutolink`: self-labelled http(s) links emit bare URL, not `<url>`
- [x] Wired into `serializerOptions.extensions` in `src/dialect.ts`
- [x] Tests in `src/dialect.test.ts` (wiki, alert/footnote/TOC, snake_case,
      image alt, bare vs labelled link)
- [x] Contract + README + roadmap updated; package `0.1.4`

Phase 8 **shipped** on `main` (v0.1.4).

## Phase 9 acceptance

- [x] `widenDelimiterCells` + `tablesAsTheVaultWritesThem` ported from Noto
- [x] Wired around GFM (`tablePipeAlign: false` kept — content cells unpadded;
      delimiter hyphens widened to ≥3)
- [x] Tests for alignment variants, space preservation, non-delimiter passthrough,
      and `renderMarkdown` three-dash output
- [x] Contract + README + roadmap updated; package `0.1.5`

Phase 9 **shipped** on `main` (v0.1.5).

## Phase 10 acceptance

- [x] Opening-line `span.start` skips 0–3 ASCII spaces for heading / paragraph /
      list / quote / fence / thematic / table / display-math / defs (micromark
      parity); spaces land in `leading` / gaps
- [x] HTML blocks, indented-code, and frontmatter keep opening bytes
- [x] Coverage / `joinSplit` identity preserved; tests for prefix → leading/gap
- [x] Contract + README + roadmap updated; package `0.1.6`

Phase 10 **shipped** on `main` (v0.1.6).

## Phase 11 acceptance

- [x] `sourceEditBetween(priorText, nextText)` → `SourceEdit | null` (longest
      common prefix/suffix; null when identical)
- [x] `reparseFromText(prior, text, { neighborSlack? })` wires that edit into
      `reparseBlocks`; identical text returns empty dirty window
      (`dirtyTo < dirtyFrom`)
- [x] Tests for round-trip edit, pure insert, identity-preserving reparse,
      full-parse parity with default slack, and no-op
- [x] Contract + README + roadmap updated; package `0.1.7`

Phase 11 **shipped** on `main` (v0.1.7). Noto host adoption of
`reparseFromText` on flagged `replaceMarkdown` landed in Noto
[#81](https://github.com/roobli/Noto/pull/81). Default-on adapter still needs
broader golden gates on the Noto side (host-owned, not this package).

## Phase 12 acceptance

- [x] Focused `renderMarkdown` tests: Typora-shaped strong `**注意：**` +
      following Chinese must not emit `&#x…` numeric escapes
- [x] Emphasis between CJK characters and CJK punctuation flanking strong
      preserve vault-shaped delimiters
- [x] `cjkFriendlyToMarkdown()` remains on the serialize dialect path (no
      dialect logic change required — lock-in only)
- [x] Contract + README + roadmap + typora-notes updated; package `0.1.8`

Phase 12 **shipped** on `main` (v0.1.8). Remaining optional engine work: further
Typora interop notes if newly measured. Noto golden / default-on stays host-side.

## Phase 13 acceptance

- [x] Quote spans absorb non-blank, non-`isBlockStart` lines without a `>` marker
      (paragraph + list-item lazy; setext `===` stays in-quote; blank still ends)
- [x] List spans absorb unindented lazy paragraph continuations (bullet / ordered /
      nested); a following list/ATX/fence/hr/quote marker still starts a new block
- [x] Tests vs prior micromark-shaped fixtures; `joinSplit` identity preserved
- [x] Contract + README + roadmap updated; package `0.1.9`

Phase 13 **shipped** on `main` (v0.1.9). Noto host IR→PM / golden adoption of
no-`>` lazy quotes and unindented list soft-wrap is host-side.

## Phase 14 acceptance

- [x] Footnote / link-definition spans absorb unindented lazy non-`isBlockStart`
      continuations after indented title/body lines (blank still ends)
- [x] While extending a paragraph, `looksLikeTable(lines, j)` breaks so the outer
      loop can open a table (pipe lines alone are not `isBlockStart`)
- [x] List blank-handling: when the next non-blank is not a same-family list item
      but has indent ≥ 2, keep absorbing (indented table rows / indented-code stay
      inside the list)
- [x] Tests for all three cases (`joinSplit` identity + kind sequences); package
      `0.1.10`

Phase 14 **shipped** on `main` (v0.1.10). **v0.1.11**: adjacent link/footnote definitions are `isBlockStart` so they are not absorbed as definition-lazy text. Noto host IR→PM / golden adoption of
table-interrupt and list-nested indented blocks is host-side.

## Phase 15 acceptance

- [x] While extending a paragraph, continuous setext underline (`===` / `---+`)
      becomes a `heading` before thematic-break / other `isBlockStart` wins
- [x] Spaced thematic markers after a paragraph (`- - -`, `***`, `___`) stay
      `thematic-break`; standalone / top-of-doc `---` unchanged
- [x] Quote lazy path still ends on `---` (Phase 13 micromark parity); no
      Phase 13/14 regressions
- [x] Tests in `native-scanner.test.ts` (`joinSplit` identity); package `0.1.12`
- [x] Closes Noto intentional golden diff #1 (setext-`---` vs hr) on the engine side

Phase 15 **shipped** on `main` (v0.1.12). Noto host golden / IR→PM adoption of
setext-`---` headings remains host-side.

## Phase 16 acceptance

- [x] Mixed-marker nested lists (bullet under ordered / ordered under bullet)
      stay one span when the nest reaches the parent item content column
      (CommonMark / micromark); insufficient indent still opens a new list
- [x] Blank-then-indented mixed nest continues the parent list; nested tasks do
      not flip the outer span to `task-list` unless a sibling item is a task
- [x] Same-family nesting unchanged; `joinSplit` identity + kind sequences in
      `native-scanner.test.ts`; package `0.1.13`
- [x] Closes Noto intentional golden diff #2 (mixed-marker nested lists) on the
      engine side

Phase 16 **shipped** on `main` (v0.1.13). Noto host golden / IR→PM adoption of
cross-family nests remains host-side.
