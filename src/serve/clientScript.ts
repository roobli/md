/** Browser client for md serve SPA shell. */
export const CLIENT_SCRIPT = String.raw`
(() => {
  const treeEl = document.getElementById('tree');
  const pane = document.getElementById('pane');
  const crumbs = document.getElementById('crumbs');
  const badge = document.getElementById('badge');
  const rootLabel = document.getElementById('root-label');
  let rootName = rootLabel ? rootLabel.textContent || '' : '';
  let currentPath = null;

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showEmpty() {
    currentPath = null;
    crumbs.innerHTML = '<span>' + esc(rootName) + '</span>';
    badge.textContent = '—';
    pane.innerHTML =
      '<div class="article-wrap"><div class="state-card">' +
      '<h1>选一个文件</h1>' +
      '<p>在已挂载的目录里选一个文件。有 <code>README.md</code> 时冷启动可自动打开。目录由 <code>md serve &lt;dir&gt;</code> 钉死，此处不能换 root。</p>' +
      '</div></div>';
    document.querySelectorAll('.tree .file').forEach((f) => f.setAttribute('aria-current', 'false'));
  }

  function setCrumbs(filePath) {
    const parts = (filePath || '').split('/').filter(Boolean);
    const bits = ['<span>' + esc(rootName) + '</span>'];
    parts.forEach((p, i) => {
      if (i === parts.length - 1) bits.push('<b>' + esc(p) + '</b>');
      else bits.push('<span>' + esc(p) + '</span>');
    });
    crumbs.innerHTML = bits.join(' / ');
  }

  function renderTreeNodes(nodes) {
    let html = '';
    for (const n of nodes) {
      if (n.type === 'dir') {
        html +=
          '<details open><summary>' +
          esc(n.name) +
          '</summary><div class="nested">' +
          renderTreeNodes(n.children || []) +
          '</div></details>';
      } else {
        html +=
          '<button type="button" class="file" data-path="' +
          esc(n.path) +
          '">' +
          esc(n.name) +
          '</button>';
      }
    }
    return html;
  }

  async function openFile(relPath) {
    currentPath = relPath;
    document.querySelectorAll('.tree .file').forEach((f) => {
      f.setAttribute('aria-current', f.getAttribute('data-path') === relPath ? 'true' : 'false');
    });
    setCrumbs(relPath);
    badge.textContent = '…';
    try {
      const res = await fetch('/api/file?path=' + encodeURIComponent(relPath));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'load failed');
      badge.textContent = data.badge || '—';
      if (data.kind === 'markdown') {
        pane.innerHTML = '<div class="article-wrap"><article class="md">' + data.html + '</article></div>';
      } else if (data.kind === 'text') {
        pane.innerHTML = '<div class="code-wrap"><pre class="source">' + esc(data.text) + '</pre></div>';
      } else if (data.kind === 'image') {
        pane.innerHTML =
          '<div class="img-wrap"><img src="' +
          esc(data.url) +
          '" alt="' +
          esc(data.name) +
          '" /></div>';
      } else {
        pane.innerHTML =
          '<div class="article-wrap"><div class="state-card">' +
          '<h1>无法预览</h1>' +
          '<p>此类型不在预览白名单。<code>' +
          esc(data.name) +
          '</code></p>' +
          '<div class="actions"><a href="' +
          esc(data.url) +
          '" download>下载文件</a></div>' +
          '</div></div>';
      }
    } catch (err) {
      badge.textContent = 'Error';
      pane.innerHTML =
        '<div class="article-wrap"><div class="state-card"><h1>加载失败</h1><p>' +
        esc(err.message || String(err)) +
        '</p></div></div>';
    }
  }

  async function boot() {
    showEmpty();
    try {
      const res = await fetch('/api/tree');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'tree failed');
      rootName = data.root || rootName;
      if (rootLabel) {
        rootLabel.textContent = rootName;
        rootLabel.setAttribute('title', rootName);
      }
      treeEl.innerHTML = renderTreeNodes(data.tree || []);
      treeEl.addEventListener('click', (ev) => {
        const btn = ev.target.closest('.file');
        if (!btn) return;
        const p = btn.getAttribute('data-path');
        if (p) openFile(p);
      });
      if (data.defaultOpen) openFile(data.defaultOpen);
    } catch (err) {
      treeEl.innerHTML = '<p style="padding:8px;color:var(--muted)">' + esc(err.message || String(err)) + '</p>';
    }
  }

  boot();
})();
`;
