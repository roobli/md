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
  /** Host may ignore; micromark path uses mdast; native path may be null. */
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

/** Incremental / block-local reparse (Phase 4). Native hot path only. */
function reparseBlocks(options: ReparseBlocksOptions): ReparseBlocksResult;
```

Coverage invariant: concatenating `leading`, each `span.markdown`, each
inter-span `gaps[i]`, and `trailing` yields `text` exactly.

### Incremental reparse (Phase 4)

`reparseBlocks` takes a prior `SplitDocument` plus either a `SourceEdit` (char
range in prior coordinates) or `replacedBlocks` (inclusive ordinals), reparses
only the dirty window (widened by `neighborSlack`), and stitches prefix /
middle / suffix with absolute offsets. Untouched prefix spans keep object
identity; untouched suffix spans keep `markdown` string identity. Micromark
stays off this hot path for Phase 1–3 dialect documents.

Noto call sites: `replaceMarkdown` can pass the differing middle ordinals as
`replacedBlocks` instead of `splitBlocks(fullMarkdown)`; the single-block save
path can use `neighborSlack: 0` after `parseSingleBlock` validation.

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
backticks, `listItemIndent: 'one'`, GFM `tablePipeAlign: false`, pair-only
tilde strike, math + YAML frontmatter, CJK to-markdown. Noto still owns
wiki-link verbatim runs, list-marker-from-node, and hard-break-as-two-spaces
until those handlers move.

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
| **6** | Quarantine micromark from the hot path; mdast optional |

## Replace boundary

`src/backend/micromark-backend.ts` is the compatibility backend. Phase 1 adds
`src/backend/native-scanner.ts`; `parseBlocks` in `src/parse.ts` prefers native
and falls back. Call sites go through `src/parse.ts` only. When the custom
engine covers the dialect, quarantine micromark without changing
`parseBlocks`’s signature.
