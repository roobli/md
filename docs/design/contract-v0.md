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
```

Coverage invariant: concatenating `leading`, each `span.markdown`, each
inter-span `gaps[i]`, and `trailing` yields `text` exactly.

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
| **1** (now) | Native block splitter + offsets (heading/paragraph/list/fence/quote/thematic); micromark fallback for unknown |
| **2** | Native GFM tables + task lists |
| **3** | Math, frontmatter, HTML/defs, CJK parity; optional semantic keys |
| **4** | Incremental / block-local reparse; streaming first-paint hooks |
| **5** | Serialize dialect aligned with Noto’s byte-exact save rules |
| **6** | Quarantine micromark from the hot path; mdast optional |

## Replace boundary

`src/backend/micromark-backend.ts` is the compatibility backend. Phase 1 adds
`src/backend/native-scanner.ts`; `parseBlocks` in `src/parse.ts` prefers native
and falls back. Call sites go through `src/parse.ts` only. When the custom
engine covers the dialect, quarantine micromark without changing
`parseBlocks`’s signature.
