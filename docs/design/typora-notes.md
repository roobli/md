# Typora study notes (interop research)

Honest notes from (1) an official Linux `.deb` install on this box, (2) Noto’s
existing measurements under `/workspace/Noto/docs/`, and (3) public docs that
ship inside the package. **No proprietary source dump** — only visible assets
(themes, CSS, public strings, process architecture, measured behaviour).

## Install status (this box)

| Item | Result |
| ---- | ------ |
| Package | Official `typora_1.13.6_amd64.deb` from `download.typora.io` |
| Install | Succeeded via `apt` on Debian 13 (trixie), x86_64 |
| Binary | `/usr/bin/typora` → `/usr/share/typora/Typora` |
| Version | App `1.13.6` (`resources/package.json`); Electron/Chromium payload `35.6.0` (`/usr/share/typora/version`) |
| GUI / license | Not exercised headlessly here; package installs cleanly. License gate is a runtime concern for interactive use, not for inspecting on-disk assets. |

## Architecture hints

### Linux (this install): Electron / Chromium

On-disk evidence:

- `chrome-sandbox`, `chrome_*.pak`, `chrome_crashpad_handler`, `libffmpeg.so`,
  `v8_context_snapshot.bin`, `LICENSES.chromium.html`
- `resources/app.asar`, `lib.asar`, `node_modules.asar`, Electron-style
  `package.json` with `"main": "launch.dist.js"`
- `page-dist/electron.css`, `window.html`

So **Linux Typora is an Electron shell**, not a native WebKit app.

### macOS (from Noto measurements): native WebKit

Noto’s `docs/performance/measurements.md` records that Typora on macOS is a
**native WebKit** application (not Electron), which is why CDP-based driving
failed and why process-tree CPU sampling missed the content process. Treat
platform shells as different; the editing model below is what matters for a
parser.

## Theme / CSS model

Public theme docs (`resources/Docs/Custom Themes.md`) and
`resources/style/themes/`:

- Each theme is a `.css` file under the theme folder (`github`, `newsprint`,
  `night`, `pixyll`, `whitey`, …).
- Custom themes: drop CSS into the user theme folder; `base.user.css` applies
  to all themes; `{name}.user.css` scopes to one theme.
- Built-in CSS is overwritten on update — do not patch shipped files.
- Chrome chrome vs document: `base.css`, `base-control.css`, `window.css`,
  `megamenu.css`, plus CodeMirror styles for source / fence editing.

Document surface selectors visible in `base.css` (class names only — useful as
a **block vocabulary** Typora paints, not as something to clone):

- Blocks / constructs: `md-fences`, `md-math-block`, `md-meta-block` (YAML),
  `md-table`, `md-task-list-item`, `md-rawblock`, `md-toc`, `md-alert*`
  (GFM alerts / callouts), `md-footnote`, `md-diagram-panel`
- Inline: `md-inline-math`, `md-html-inline`, `md-emoji`, `md-image`
- Focus / expand: `md-focus`, `md-expand`, `md-plain`, `md-meta` (delimiter
  chrome that shows while editing)

Implication for a WYSIWYG parser: **top-level blocks are first-class editing
units**, with optional “raw” / meta chrome shown only when focused — the same
habit Noto’s ProseMirror node views already chase.

## Source mode / live preview / block model

From shipped `Quick Start.md` (public):

- **Live Preview** is the default: inline styles appear after typing finishes;
  block styles appear as you type or after Enter / leaving the paragraph.
- Markdown tags for inline marks hide smartly; block markers (`###`, `- [x]`)
  hide once the block is rendered.
- **Source code mode** exists (`Ctrl+/`) but Typora itself calls support
  “very basic” and does not recommend it as the primary path.
- Fence / source editing uses **CodeMirror** styling (`codemirror.css`,
  `mock-cm` fences) inside the live document — hybrid, not a separate preview
  pane.

Parser implications:

1. Prefer a **block stream with exact offsets** over a single opaque AST dump.
2. Support **single-block reparse** (validate an edited unit stays one block).
3. Keep delimiter / source text recoverable per block for focus-reveal and for
   byte-exact save of untouched neighbours.
4. Source mode is a consumer of the same underlying text, not a second dialect.

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
| CJK emphasis | CM flanking + CJK punctuation; Typora closes `**注意：**…` |
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

- OK: themes, CSS, public docs, process layout, measured open behaviour,
  remote-control timing Noto already built.
- Not OK: cracking license checks, redistributing Typora, or checking
  proprietary ASAR/JS into this repo.
