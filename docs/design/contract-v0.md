# Engine contract v0

## Parse API (sketch)

```ts
type BlockKind =
  | "heading" | "paragraph"
  | "bullet-list" | "ordered-list" | "task-list"
  | "quote" | "fenced-code" | "indented-code"
  | "table" | "display-math" | "frontmatter" | "html"
  | "thematic-break" | "footnote-definition" | "link-definition";

interface BlockSpan {
  kind: BlockKind;
  start: number; // into source text (no BOM)
  end: number;   // exclusive; trailing newlines belong to gaps
  markdown: string; // text.slice(start, end)
  /** Native hot path: null. Legacy micromark entry may attach mdast. */
  node: unknown;
}

interface SplitDocument {
  spans: readonly BlockSpan[];
  leading: string;
  gaps: readonly string[]; // between span i and i+1
  trailing: string;
}

function parseBlocks(text: string): SplitDocument;
function parseSingleBlock(markdown: string): BlockSpan | null;

type ParseResult =
  | { status: "parsed"; document: EngineDocument }
  | { status: "failed"; code: "INVALID_UTF8"; message: string };

function parseDocument(bytes: Uint8Array): ParseResult;

/** Character edit against joinSplit(prior). */
interface SourceEdit {
  priorStart: number;
  priorEnd: number;
  inserted: string;
}

interface BlockOrdinalRange { from: number; to: number; }

interface ReparseBlocksOptions {
  prior: SplitDocument;
  text?: string;                 // required if edit omitted
  edit?: SourceEdit;             // prior-source coordinates
  replacedBlocks?: BlockOrdinalRange;
  neighborSlack?: number;        // default 1; pass 0 for single-block path
}

interface ReparseBlocksResult extends SplitDocument {
  dirtyFrom: number;
  dirtyTo: number;
  windowStart: number;
  windowEnd: number;
}

/** Incremental / block-local reparse (Phase 4). Native only (Phase 6). */
function reparseBlocks(options: ReparseBlocksOptions): ReparseBlocksResult;

/** Longest common prefix/suffix → SourceEdit (null if identical). Phase 11. */
function sourceEditBetween(priorText: string, nextText: string): SourceEdit | null;

/** prior + full next text → reparseBlocks via sourceEditBetween. Phase 11. */
function reparseFromText(
  prior: SplitDocument,
  text: string,
  options?: { neighborSlack?: number },
): ReparseBlocksResult;
```

Coverage invariant: concatenating `leading`, each `span.markdown`, each
inter-span `gaps[i]`, and `trailing` yields `text` exactly.

### Incremental reparse (Phase 4)

`reparseBlocks` takes a prior `SplitDocument` plus either a `SourceEdit` (char
range in prior coordinates) or `replacedBlocks` (inclusive ordinals), reparses
only the dirty window (widened by `neighborSlack`), and stitches prefix /
middle / suffix with absolute offsets. Untouched prefix spans keep object
identity; untouched suffix spans keep `markdown` string identity. Micromark is not imported on this path (Phase 6); use `@roobli/md/legacy-micromark` for compat.

Noto call sites: `replaceMarkdown` can pass the differing middle ordinals as
`replacedBlocks` instead of `splitBlocks(fullMarkdown)`; when the host only has
the full next buffer, prefer `reparseFromText(prior, nextText)` (Phase 11).
The single-block save path can use `neighborSlack: 0` after `parseSingleBlock`
validation.

### Serialize (Phase 5)

```ts
interface SerializeUnit {
  origin: number | null;   // prior block ordinal, or null = insert
  markdown: string | null; // null = pristine (slice from document.text)
  node?: RootContent | null; // optional dialect render for dirty units
}

interface SerializeOptions {
  units: readonly SerializeUnit[];
  envelope?: { lineEnding?: 'lf' | 'crlf' | 'mixed'; hasFinalNewline?: boolean };
}

function joinSplit(split: SplitDocument, source?: string): string;
function identityUnits(document: EngineDocument): SerializeUnit[];
function serializeDocument(document: EngineDocument, options: SerializeOptions): SerializeResult;
function replaceBlock(document: EngineDocument, ordinal: number, markdown: string): SerializeResult;
function renderMarkdown(node: Nodes): string; // dialect path for edited mdast
```

Byte-exact rules (aligned with Noto `serialize.ts`):

1. **Untouched spans** are emitted by slicing `document.text.slice(start, end)`,
   never by re-stringifying mdast / dialect output.
2. **Gaps** between adjacent surviving origins are reused from the prior split
   when the gap contains a blank line, or when both neighbours are pristine.
3. **Edited spans** emit host-supplied markdown (LF → document line ending) or
   `renderMarkdown(node)` when only an mdast node is provided; each unit must
   still be exactly one block (`parseSingleBlock`).
4. `joinSplit(split, source)` hardens coverage tests: with `source`, spans are
   sliced by offset so a poisoned `span.markdown` cannot fake a round-trip.

Dialect hypothesis (verify on bridge): bullet `-`, emphasis/strong `*`, fenced
backticks, `listItemIndent: 'one'`, GFM `tablePipeAlign: false` (content cells
unpadded), pair-only tilde strike, math + YAML frontmatter, CJK to-markdown.
**Phase 7**: engine owns hard-break-as-two-spaces and list-marker-from-node
(`node.data.bullet` / `node.data.delimiter`). **Phase 8**: engine owns
verbatim runs (wiki links, alerts, footnotes, `[TOC]`, snake_case / metrics)
and bare http(s) autolink shape (previously host-owned in Noto). **Phase 9**:
delimiter rows widened to ≥3 dashes (vault three-dash style); content stays
unpadded. **Phase 10**: line-prefix offsets aligned with micromark (0–3 leading
ASCII spaces → leading/gaps; html / indented-code / frontmatter unchanged).
**Phase 12**: CJK-friendly `renderMarkdown` lock-in — Typora-shaped
`**注意：**这是正文` (and CJK flanking / punctuation) must not emit `&#x…`
numeric escapes; `cjkFriendlyToMarkdown()` stays on the dialect path.

**Phase 13**: Native split CommonMark lazy continuation — unprefixed paragraph
lines stay inside quote and list spans (micromark parity). Blank lines still
end quotes; block starts (`#`, fences, `---`, list markers, …) still open a
new sibling block. Setext `===` after a quote line stays in-quote.

**Phase 14**: Nest / interrupt parity — footnote/link-definition lazy
continuations; GFM tables interrupt paragraphs (two-line look-ahead only);
after a blank inside a list, indented nested content (table rows, indented
code) stays in the list span (micromark parity).

**Phase 15**: Setext level-2 vs thematic-break — while extending a paragraph,
continuous `---` / `===` underlines (`isSetextUnderline`) absorb as `heading`
before `isBlockStart` treats `---` as thematic. Spaced `- - -` and `*`/`_`
markers stay thematic; standalone `---` / frontmatter unchanged. Closes Noto
intentional golden gap #1 (setext-`---` vs hr).

**Phase 16**: Mixed-marker nested lists — while extending a list, a different
family list item whose indent reaches the current sibling content column stays
in the same span (micromark nest parity). Unindented / under-indented mixed
markers still open a new list. Closes Noto intentional golden gap #2.

**Phase 17**: GFM table header/delimiter column-count parity — a table opens
only when the delimiter row's cell count equals the header's (micromark/GFM).
Leading/trailing pipes are optional; empty edge cells from outer pipes are
ignored. Mismatched counts stay paragraph; ragged body rows with a matching
header/delimiter still form a table.

**Phase 19**: Same-indent sibling list items with a different bullet
(`-`/`+`/`*`) or ordered delimiter (`.`/`)`) open a new list span (CommonMark /
micromark). Indented mixed-marker nests (Phase 16) stay one span.

## Correctness goals

- CommonMark subset for the block kinds above
- GFM: tables, strikethrough (pair tildes), task lists
- Math: inline `$…$` and display math
- YAML frontmatter
- CJK-friendly emphasis flanking (same amendment Noto already depends on)
- No `unsupported` island kind — every construct is an editable block

## Performance targets

Relative to Noto’s Linux micromark `parseDocument` (2026-09-11):

| Corpus | Size | Current micromark | Target (engine) |
| ------ | ---- | ----------------- | ----------------- |
| small  | ~66 KB | ~124 ms | ≤ 80 ms |
| medium | ~525 KB | ~570 ms | ≤ 280 ms (clearly under Typora’s ~343 ms *felt* open once host overhead is added, and half of today’s parse) |
| large  | ~2.1 MB | ~2424 ms | ≤ 900 ms and **must succeed** (Typora does not load this class) |

Targets are for the pure parse/split on Node 22 Linux, warm process, excluding
IPC and first paint. Revisit with a shared public corpus (never private vault
files in this repo).

## Phase plan

Full table: [`roadmap.md`](./roadmap.md). Contract-facing summary:

| Phase | Deliverable |
| ----- | ----------- |
| **0** (done) | Package + docs + API; micromark behind `// replace` |
| **1** (done slice) | Native block splitter + offsets (heading/paragraph/list/fence/quote/thematic); micromark fallback for unknown |
| **2** (done) | Native GFM tables + task lists |
| **3** (done) | Native math / frontmatter / HTML / defs + synthetic A/B bench |
| **4** (done) | Incremental / block-local reparse (`reparseBlocks`); streaming first-paint left to host |
| **5** (done) | Serialize dialect aligned with Noto’s byte-exact save rules |
| **6** (done) | Quarantine micromark; `@roobli/md/legacy-micromark`; mdast optional |
| **7** (done) | Serialize dialect parity: hard-break → two spaces; list marker/delimiter from `node.data` |
| **8** (done) | Verbatim runs + bare http(s) autolink serialize |
| **9** (done) | Table delimiter widening (vault three-dash; content unpadded) |
| **10** (done) | Line-prefix offset alignment (micromark parity) |
| **11** (done) | `sourceEditBetween` + `reparseFromText` host helpers |
| **12** (done) | CJK emphasis / Typora interop lock-in (`renderMarkdown`) |
| **13** (done) | CommonMark lazy continuation (quotes + list items) |
| **14** (done) | Nest / interrupt parity (defs / table-vs-para / list-after-blank) |
| **15** (done) | Setext `---` vs thematic-break (Noto golden gap #1) |
| **16** (done) | Mixed-marker nested lists (Noto golden gap #2) |
| **17** (done) | GFM table header/delimiter column-count parity |
| **18** (done) | `md serve` thin local read-only folder browser |
| **19** (done) | Same-indent mixed bullet/delimiter → new list span |

## Replace boundary

`src/backend/micromark-backend.ts` is quarantined behind `@roobli/md/legacy-micromark` (Phase 6). Default `parseBlocks` uses the native scanner only.
