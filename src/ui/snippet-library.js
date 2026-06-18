/**
 * Snippet Library — save, load, and manage reusable JSON snippets
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'snippets';
  let overlay = null;
  let visible = false;

  function getSnippets() {
    return window.App.storage.get(STORAGE_KEY, []);
  }
  function saveSnippets(list) {
    window.App.storage.set(STORAGE_KEY, list);
  }

  function init() {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'snippetModal';
    overlay.innerHTML = `
      <div class="modal-box">
        <div class="modal-header"><h3>Snippet Library</h3><button class="toolbar-btn" id="snippetClose">&#10005;</button></div>
        <div class="snippet-actions" style="padding:8px 16px;display:flex;gap:6px">
          <input type="text" id="snippetName" placeholder="Snippet name..." style="flex:1;padding:4px 8px;font-size:12px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text)">
          <button class="toolbar-btn" id="snippetSaveCurrent" title="Save current path value">Save Value</button>
          <button class="toolbar-btn" id="snippetSaveAll" title="Save entire document">Save Doc</button>
        </div>
        <div class="snippet-list" id="snippetList" style="padding:8px 16px;max-height:400px;overflow:auto"></div>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById('snippetClose').addEventListener('click', hide);
    document.getElementById('snippetSaveCurrent').addEventListener('click', () => saveFromPath());
    document.getElementById('snippetSaveAll').addEventListener('click', () => saveFromDoc());
    document.getElementById('snippetList').addEventListener('click', onListClick);
  }

  function show() {
    if (!overlay) init();
    renderList();
    overlay.classList.add('show');
    visible = true;
  }
  function hide() {
    if (overlay) overlay.classList.remove('show');
    visible = false;
  }
  function isVisible() { return visible; }

  function saveFromPath() {
    const name = document.getElementById('snippetName').value.trim();
    if (!name) { window.App.dom.toast('Enter a snippet name'); return; }
    const pathInput = document.getElementById('pathInput');
    const data = window.App._jsonDataRef;
    if (!data) { window.App.dom.toast('Load JSON first'); return; }
    let value;
    if (pathInput && pathInput.value) {
      value = window.App.path.resolvePath(data, pathInput.value);
    } else {
      value = data;
    }
    addSnippet(name, value);
  }

  function saveFromDoc() {
    const name = document.getElementById('snippetName').value.trim();
    if (!name) { window.App.dom.toast('Enter a snippet name'); return; }
    const data = window.App._jsonDataRef;
    if (!data) { window.App.dom.toast('Load JSON first'); return; }
    addSnippet(name, data);
  }

  function addSnippet(name, value) {
    const snippets = getSnippets();
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    snippets.unshift({ name, text, timestamp: Date.now(), preview: text.substring(0, 100) });
    if (snippets.length > 50) snippets.length = 50;
    saveSnippets(snippets);
    document.getElementById('snippetName').value = '';
    renderList();
    window.App.dom.toast('Snippet saved: ' + name);
  }

  function renderList() {
    const snippets = getSnippets();
    const list = document.getElementById('snippetList');
    const esc = window.App.dom.esc;
    if (!snippets.length) {
      list.innerHTML = '<div style="color:var(--text-muted);padding:12px;text-align:center">No snippets saved yet</div>';
      return;
    }
    list.innerHTML = snippets.map((s, i) => `
      <div class="snippet-item" style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid var(--border);cursor:pointer" data-idx="${i}">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:12px">${esc(s.name)}</div>
          <div style="font-size:10px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.preview || '')}</div>
        </div>
        <button class="toolbar-btn snippet-load" data-idx="${i}" title="Load as new tab" style="font-size:10px">Load</button>
        <button class="toolbar-btn snippet-copy" data-idx="${i}" title="Copy to clipboard" style="font-size:10px">Copy</button>
        <button class="toolbar-btn snippet-del" data-idx="${i}" title="Delete" style="font-size:10px;color:var(--danger)">×</button>
      </div>
    `).join('');
  }

  function onListClick(e) {
    const snippets = getSnippets();
    const loadBtn = e.target.closest('.snippet-load');
    const copyBtn = e.target.closest('.snippet-copy');
    const delBtn = e.target.closest('.snippet-del');

    if (loadBtn) {
      const s = snippets[parseInt(loadBtn.dataset.idx, 10)];
      if (s) {
        document.dispatchEvent(new CustomEvent('snippet-load', { detail: { name: s.name, text: s.text } }));
        hide();
      }
      return;
    }
    if (copyBtn) {
      const s = snippets[parseInt(copyBtn.dataset.idx, 10)];
      if (s) {
        navigator.clipboard.writeText(s.text);
        window.App.dom.toast('Snippet copied!');
      }
      return;
    }
    if (delBtn) {
      const idx = parseInt(delBtn.dataset.idx, 10);
      snippets.splice(idx, 1);
      saveSnippets(snippets);
      renderList();
      return;
    }
  }

  window.App = window.App || {};
  window.App.snippetLibrary = { show, hide, isVisible };
})();
