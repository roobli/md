# Typora study notes (interop research)

Honest notes from (1) an official Linux `.deb` install on this box, (2) macOS
Typora **1.14.9** inspected on the author’s Mac (`/Applications/Typora.app`),
(3) Noto’s existing measurements under `/workspace/Noto/docs/`, and (4) public
docs that ship inside the packages. **No proprietary source dump** — only
visible assets (themes, CSS class names, public Docs strings, process
architecture, measured behaviour). Do **not** copy Typora JS into this repo.

## Install status

### Linux (this box)

| Item | Result |
| ---- | ------ |
| Package | Official `typora_1.13.6_amd64.deb` from `download.typora.io` (prior measure) |
| Install | Succeeded via `apt` on Debian 13 (trixie), x86_64 when last installed |
| Binary | `/usr/bin/typora` → `/usr/share/typora/Typora` (when present) |
| Version | App `1.13.6` (`resources/package.json`); Electron/Chromium payload `35.6.0` (`/usr/share/typora/version`) |
| GUI / license | Not exercised headlessly here; package installs cleanly. License gate is a runtime concern for interactive use, not for inspecting on-disk assets. |
| Re-check (2026-09-15) | `/usr/share/typora` **absent** on this box at Phase 12 run — no new CSS/Docs scrape; macOS + prior Linux notes still apply. |

### macOS 1.14.9 (author’s Mac)

| Item | Result |
| ---- | ------ |
| Path | `/Applications/Typora.app` |
| Version | **1.14.9** |
| Shell | **Native WebKit** — `otool` links `WebKit.framework`; Sparkle for updates. **Not Electron** on macOS. |
| Content bundle | `Contents/Resources/TypeMark/` |
| Notable assets | `appsrc/main.js` (~1.6 MB — proprietary, do not vendor), `tpl/core.js`, CodeMirror, MathJax **4**, diagram helpers, `style/base.css`, public Docs |

Platform shells differ (Electron on Linux, WebKit + TypeMark on macOS); the
editing / block model below is what matters for a parser.

## Architecture hints

### Linux: Electron / Chromium

On-disk evidence:

- `chrome-sandbox`, `chrome_*.pak`, `chrome_crashpad_handler`, `libffmpeg.so`,
  `v8_context_snapshot.bin`, `LICENSES.chromium.html`
- `resources/app.asar`, `lib.asar`, `node_modules.asar`, Electron-style
  `package.json` with `"main": "launch.dist.js"`
- `page-dist/electron.css`, `window.html`

So **Linux Typora is an Electron shell**, not a native WebKit app.

### macOS: native WebKit + TypeMark

Confirmed on 1.14.9 via framework linkage (`WebKit.framework`) and the
`TypeMark/` content tree under `Contents/Resources/`. Noto’s
`docs/performance/measurements.md` already noted that CDP-based driving failed
on macOS and that process-tree CPU sampling missed the content process — that
matches a WebKit content process, not an Electron renderer.

**Research boundary:** summarize public CSS vocabulary + Docs + layout only.
Never check `appsrc/main.js` / other proprietary TypeMark JS into `@roobli/md`.

## Theme / CSS model / `md-*` block vocabulary

Public theme docs and `style/` (Linux package; macOS TypeMark mirrors the
document surface):

- Each theme is a `.css` file under the theme folder (`github`, `newsprint`,
  `night`, `pixyll`, `whitey`, …).
- Custom themes: drop CSS into the user theme folder; `base.user.css` applies
  to all themes; `{name}.user.css` scopes to one theme.
- Built-in CSS is overwritten on update — do not patch shipped files.
- Chrome vs document: `base.css`, `base-control.css`, `window.css`,
  `megamenu.css`, plus CodeMirror styles for source / fence editing.

Document surface selectors visible in public `style/base.css` (`md-*` class
names only — a **block vocabulary** Typora paints, not something to clone):

| Area | Classes (names only) |
| ---- | -------------------- |
| Blocks / constructs | `md-fences`, `md-math-block`, `md-meta-block` (YAML), `md-table`, `md-task-list-item`, `md-rawblock`, `md-toc`, `md-alert*` (GFM alerts / callouts), `md-footnote`, `md-diagram-panel` |
| Inline | `md-inline-math`, `md-html-inline`, `md-emoji`, `md-image` |
| Focus / expand | `md-focus`, `md-expand`, `md-plain`, `md-meta` (delimiter chrome while editing) |

Implication for a WYSIWYG parser: **top-level blocks are first-class editing
units**, with optional “raw” / meta chrome shown only when focused — the same
habit Noto’s ProseMirror node views already chase.

## Source mode / live preview / dialect (public Docs)

From shipped public Docs (`Quick Start` and related):

- **Live Preview** is the default: inline styles appear after typing finishes;
  block styles appear as you type or after Enter / leaving the paragraph.
- Markdown tags for inline marks hide smartly; block markers (`###`, `- [x]`)
  hide once the block is rendered.
- **Source code mode** exists but Typora itself calls support “very basic”.
- Fence / source editing uses **CodeMirror** styling inside the live document —
  hybrid, not a separate preview pane.
- Public Docs state Typora uses **GFM**. Paragraph = one Return; Shift+Return
  soft break.

Parser implications:

1. Prefer a **block stream with exact offsets** over a single opaque AST dump.
2. Support **single-block reparse** (validate an edited unit stays one block).
3. Keep delimiter / source text recoverable per block for focus-reveal and for
   byte-exact save of untouched neighbours.
4. Source mode is a consumer of the same underlying text, not a second dialect.
5. Align soft-break / hard-break habits with GFM Docs claims when serializing.

## Constructs Noto already cares about (from typora-gap + v3)

Drawn from `Noto/docs/design/typora-gap.md` and
`Noto/src/shared/markdown/v3/contracts.ts` — the engine must eventually cover:

| Area | Notes |
| ---- | ----- |
| Headings, paragraphs, lists | Core CM; list marker style matters for serialize diffs |
| Task lists | GFM; checkbox behaviour measured against Typora |
| Quotes / GFM alerts (callouts) | Typora `md-alert*`; Noto models callout as quote+marker |
| Fenced + indented code | Line numbers / indent guides are UI; fence bytes must round-trip |
| Tables | GFM; alignment and padding are serialize-sensitive |
| Math | Inline `$` and display `$$` / math fences; Typora centres display math |
| Frontmatter | YAML `md-meta-block`; broken opening fences are a vault hazard |
| CJK emphasis | CM flanking + CJK punctuation; Typora closes `**注意：**…`. **Phase 12 engine lock-in:** `renderMarkdown` emits `**注意：**这是正文` (and `中文*强调*继续`, `（**重要**）`) with **no** numeric HTML escapes (`&#x…`); without `mdast-util-to-markdown-cjk-friendly` the same mdast becomes `**注意：**&#x8FD9;是正文`. |
| Strikethrough | GFM; single tilde is subscript/text in Typora (`singleTilde: false`) |
| HTML blocks / inline HTML | Editable, not “unsupported islands” |
| Footnotes + link definitions | Top-level blocks in Noto v3 |
| Thematic breaks | Leaf blocks; avoid needless re-serialize |
| Wiki links / TOC markers | Serialize exemptions in Noto today |
| Images / diagrams | Mostly host/renderer; parser must keep source spans |

## Performance picture (Noto measurements — do not mythologize)

On the author’s machine (see `Noto/docs/performance/measurements.md`):

- Medium (~525 KB): Typora ~343 ms open vs Noto historically slower; after
  wire-`nodes`, Linux main `parseDocument` alone is still ~**570 ms**.
- Large (~2.1 MB) / huge: **Typora never loads** (empty document for 180 s);
  Noto does open them, slowly (~2.3 s+ parse on Linux large).

Target for `@roobli/md`: beat the micromark parse cost on medium and large
**without** giving up files Typora refuses. Surpassing Typora means winning the
files people actually keep and the mid-size open they feel every day.

## Research boundaries

- OK: themes, CSS class vocabulary, public Docs, process / bundle layout,
  measured open behaviour, remote-control timing Noto already built.
- Not OK: cracking license checks, redistributing Typora, dumping proprietary
  `TypeMark/appsrc` JS (or Linux ASAR bodies) into this repo.
