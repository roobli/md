/** Product shell derived from md-serve-ui skeleton (no demo-bar). */
export function shellHtml(rootName: string): string {
  const safeRoot = escapeAttr(rootName);
  return `<!DOCTYPE html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>md serve — ${safeRoot}</title>
<style>
  :root {
    --bg: #f4f2ec;
    --bg-rail: #eceae3;
    --paper: #faf9f5;
    --ink: #1c1b18;
    --muted: #6e6b63;
    --line: #d8d4c8;
    --accent: #3d5a4c;
    --accent-soft: #e4ebe6;
    --code-bg: #f0eee6;
    --rail: 248px;
    --measure: 42rem;
    --font-ui: "SF Pro Text", "Segoe UI", system-ui, sans-serif;
    --font-body: "Iowan Old Style", "Palatino Linotype", Palatino, "Songti SC", "Noto Serif CJK SC", serif;
    --font-mono: "SF Mono", ui-monospace, Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    font-family: var(--font-ui);
    color: var(--ink);
    background: var(--bg);
    display: flex;
    flex-direction: column;
    min-height: 100%;
  }
  .shell { flex: 1; display: flex; min-height: 0; }
  .rail {
    width: var(--rail); flex-shrink: 0;
    background: var(--bg-rail); border-right: 1px solid var(--line);
    display: flex; flex-direction: column; min-height: 0;
  }
  .rail-head {
    padding: 14px 14px 10px;
    border-bottom: 1px solid var(--line);
  }
  .rail-head .label { font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
  .rail-head .root { margin-top: 4px; font-size: 14px; font-weight: 600; color: var(--ink);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tree { flex: 1; overflow: auto; padding: 8px 6px 16px; font-size: 13px; }
  .tree details { margin: 0; }
  .tree summary {
    list-style: none; cursor: pointer; padding: 5px 8px; border-radius: 6px;
    color: var(--ink); display: flex; gap: 6px; align-items: center;
  }
  .tree summary::-webkit-details-marker { display: none; }
  .tree summary::before { content: "▸"; color: var(--muted); font-size: 10px; width: 10px; }
  .tree details[open] > summary::before { content: "▾"; }
  .tree summary:hover, .tree .file:hover { background: rgba(0,0,0,.04); }
  .tree .nested { padding-left: 14px; }
  .tree .file {
    display: block; width: 100%; text-align: left; border: 0; background: transparent;
    font: inherit; padding: 5px 8px 5px 24px; border-radius: 6px; color: var(--ink); cursor: pointer;
  }
  .tree .file[aria-current="true"] {
    background: var(--accent-soft); color: var(--accent); font-weight: 550;
  }
  .main { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; background: var(--bg); }
  .top {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 20px; border-bottom: 1px solid var(--line);
    background: rgba(244,242,236,.92);
  }
  .crumbs { font-size: 12px; color: var(--muted); min-width: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .crumbs b { color: var(--ink); font-weight: 550; }
  .badge {
    margin-left: auto; flex-shrink: 0;
    font-size: 11px; padding: 2px 8px; border-radius: 999px;
    border: 1px solid var(--line); color: var(--muted); background: var(--paper);
  }
  .pane { flex: 1; overflow: auto; min-height: 0; }
  .article-wrap { padding: 28px 32px 64px; }
  article.md {
    max-width: var(--measure); margin: 0 auto;
    font-family: var(--font-body); font-size: 17px; line-height: 1.65; color: var(--ink);
  }
  article.md h1 { font-size: 1.75em; font-weight: 650; line-height: 1.25; margin: 0 0 .6em;
    letter-spacing: -0.02em; }
  article.md h2 { font-size: 1.25em; font-weight: 650; margin: 1.6em 0 .5em;
    padding-bottom: .25em; border-bottom: 1px solid var(--line); }
  article.md h3 { font-size: 1.05em; font-weight: 650; margin: 1.3em 0 .4em; }
  article.md p { margin: 0 0 0.9em; }
  article.md a { color: var(--accent); }
  article.md code {
    font-family: var(--font-mono); font-size: .86em;
    background: var(--code-bg); padding: .1em .35em; border-radius: 4px;
  }
  article.md pre, article.md .rmd-code {
    font-family: var(--font-mono); font-size: 13px; line-height: 1.5;
    background: var(--code-bg); border: 1px solid var(--line); border-radius: 8px;
    padding: 14px 16px; overflow: auto; margin: 0 0 1.1em;
  }
  article.md pre code { background: none; padding: 0; font-size: inherit; }
  article.md blockquote {
    margin: 0 0 1em; padding: .2em 0 .2em 1em;
    border-left: 3px solid #c5c0b2; color: var(--muted);
  }
  article.md ul, article.md ol { margin: 0 0 1em; padding-left: 1.3em; }
  article.md li { margin: .25em 0; }
  article.md table { border-collapse: collapse; width: 100%; margin: 0 0 1.1em; font-size: .95em; }
  article.md th, article.md td { border: 1px solid var(--line); padding: 6px 10px; text-align: left; }
  article.md th { background: var(--code-bg); font-weight: 600; }
  article.md hr.rmd-hr { border: 0; border-top: 1px solid var(--line); margin: 1.5em 0; }
  article.md .rmd-task { list-style: none; margin-left: -1.1em; }
  article.md .rmd-task input { margin-right: 6px; }
  .code-wrap { padding: 0; }
  pre.source {
    margin: 0; min-height: 100%; padding: 20px 24px 48px;
    font-family: var(--font-mono); font-size: 13px; line-height: 1.55;
    background: var(--paper); color: var(--ink); white-space: pre; overflow: auto;
  }
  .img-wrap {
    min-height: 100%; display: flex; align-items: center; justify-content: center;
    padding: 32px; background: #e9e6dc;
  }
  .img-wrap img {
    max-width: min(100%, 960px); max-height: calc(100vh - 120px);
    object-fit: contain; border-radius: 4px; box-shadow: 0 1px 2px rgba(20,24,29,.06);
    background: var(--paper);
  }
  .state-card {
    max-width: 28rem; margin: 12vh auto 0; padding: 28px 28px 24px;
    background: var(--paper); border: 1px solid var(--line); border-radius: 10px;
  }
  .state-card h1 { font-size: 18px; font-weight: 650; margin: 0 0 8px; }
  .state-card p { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.5; }
  .state-card .actions { margin-top: 16px; }
  .state-card a {
    font-size: 13px; color: var(--accent); text-decoration: none;
    border-bottom: 1px solid transparent;
  }
  .state-card a:hover { border-bottom-color: var(--accent); }
  .readonly { font-size: 11px; color: var(--muted); margin-left: 8px; }
  @media (max-width: 720px) {
    .rail { width: 200px; }
    .article-wrap { padding: 20px 16px 48px; }
  }
</style>
</head>
<body>
  <div class="shell">
    <aside class="rail" aria-label="文件夹">
      <div class="rail-head">
        <div class="label">md serve</div>
        <div class="root" id="root-label" title="${safeRoot}">${safeRoot}</div>
      </div>
      <nav class="tree" id="tree" aria-label="文件树"></nav>
    </aside>
    <section class="main">
      <header class="top">
        <div class="crumbs" id="crumbs"><span>${safeRoot}</span></div>
        <span class="readonly">只读</span>
        <span class="badge" id="badge">—</span>
      </header>
      <div class="pane" id="pane"></div>
    </section>
  </div>
<script src="/app.js"></script>
</body>
</html>`;
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
