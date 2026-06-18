/**
 * Input Handler — file/paste/CSV/URL/clipboard loading
 */
window.App = window.App || {};
window.App.inputHandler = (() => {
  const { $, toast, esc } = window.App.dom;

  let parseJsonAsync = null;
  let onJsonLoaded = null; // (data, text, name) => void
  let readFileFn = null;

  function init(opts) {
    parseJsonAsync = opts.parseJsonAsync;
    onJsonLoaded = opts.onJsonLoaded;
    readFileFn = readFile;

    setupInputTabs();
    setupDropArea();
    setupPasteHandler();
    setupCsvImport();
    setupUrlModal();
    setupClipboardDetect();
  }

  // --- Input Tabs ---
  function setupInputTabs() {
    document.querySelectorAll('.input-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.input-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.input-panel').forEach(p => p.classList.remove('active'));
        $('ip-' + btn.dataset.t).classList.add('active');
        if (btn.dataset.t === 'recent') renderRecentPanel();
      });
    });
  }

  // --- Drop Area ---
  function setupDropArea() {
    const dropArea = $('dropArea');
    const fileInput = $('fileInput');
    dropArea.addEventListener('click', () => fileInput.click());
    dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.classList.add('dragover'); });
    dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragover'));
    dropArea.addEventListener('drop', e => { e.preventDefault(); dropArea.classList.remove('dragover'); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); });
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) readFile(fileInput.files[0]); });
  }

  // --- Paste Handler ---
  function setupPasteHandler() {
    $('btnGo').addEventListener('click', () => {
      $('inputError').classList.remove('show');
      const text = $('pasteInput').value.trim();
      if (!text) { showInputError('Paste some JSON first.'); return; }
      loadText(text, 'Pasted JSON');
    });

    // YAML auto-detection on paste (capture phase)
    $('btnGo').addEventListener('click', async function yamlDetect(e) {
      const text = $('pasteInput').value.trim();
      if (!text) return;
      if (window.App.formatConvert.isYaml(text)) {
        e.stopImmediatePropagation();
        try {
          const data = await window.App.formatConvert.yamlToJson(text);
          if (data && typeof data === 'object') {
            onJsonLoaded(data, JSON.stringify(data, null, 2), 'YAML → JSON');
            return;
          }
        } catch { /* fall through to JSON parse */ }
      }
    }, true);
  }

  function loadText(text, name) {
    parseJsonAsync(text).then(data => {
      onJsonLoaded(data, text, name);
    }).catch(err => {
      showInputError('Invalid JSON: ' + err.message, text);
    });
  }

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      loadText(e.target.result, file.name);
    };
    reader.readAsText(file);
  }

  let lastFailedText = '';
  function showInputError(msg, rawText) {
    lastFailedText = rawText || '';
    const el = $('inputError');
    if (rawText) {
      el.innerHTML = `${esc(msg)} <button class="btn-repair" id="btnRepairInline">&#128295; Auto-Repair</button>`;
    } else {
      el.textContent = msg;
    }
    el.classList.add('show');
    const repairBtn = document.getElementById('btnRepairInline');
    if (repairBtn) {
      repairBtn.addEventListener('click', async () => {
        repairBtn.textContent = 'Repairing...';
        repairBtn.disabled = true;
        try {
          await window.App.libLoader.require('jsonrepair');
          const repaired = jsonrepair(lastFailedText);
          const data = JSON.parse(repaired);
          el.classList.remove('show');
          toast('JSON repaired successfully!');
          onJsonLoaded(data, repaired, 'Repaired JSON');
        } catch (e) {
          el.innerHTML = esc('Auto-repair failed: ' + e.message);
        }
      });
    }
  }

  // --- CSV Import ---
  function setupCsvImport() {
    $('btnCsvGo').addEventListener('click', async () => {
      const text = $('csvInput').value.trim();
      if (!text) { toast('Paste CSV data first'); return; }
      try {
        await window.App.libLoader.require('papaparse');
        const result = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: true });
        if (result.errors.length > 0 && result.data.length === 0) {
          toast('CSV parse error: ' + result.errors[0].message);
          return;
        }
        onJsonLoaded(result.data, JSON.stringify(result.data, null, 2), 'CSV Import');
      } catch (e) { toast('CSV parse failed: ' + e.message); }
    });
  }

  // --- URL Modal ---
  function setupUrlModal() {
    $('btnUrl').addEventListener('click', () => $('urlModal').classList.add('show'));
    $('urlClose').addEventListener('click', () => $('urlModal').classList.remove('show'));

    // Landing page rich API panel
    setupApiPanel({
      method: 'apiMethod', url: 'apiUrlInput', send: 'btnApiSend',
      error: 'urlLandingError', status: 'apiStatus',
      authType: 'apiAuthType', authFields: 'apiAuthFields',
      headersList: 'apiHeadersList', addHeader: 'apiAddHeader',
      bodyType: 'apiBodyType', bodyEditor: 'apiBodyEditor',
      tabAttr: 'ap', tabSel: '#ip-url .api-opt-tab', panelSel: '#ip-url .api-opt-panel'
    });

    // Toolbar modal rich API panel
    setupApiPanel({
      method: 'modalApiMethod', url: 'modalApiUrl', send: 'modalApiSend',
      error: 'urlError', status: 'modalApiStatus',
      authType: 'modalAuthType', authFields: 'modalAuthFields',
      headersList: 'modalHeadersList', addHeader: 'modalAddHeader',
      bodyType: 'modalBodyType', bodyEditor: 'modalBodyEditor',
      tabAttr: 'mp', tabSel: '#urlModal .api-opt-tab', panelSel: '#urlModal .api-opt-panel',
      onSuccess: () => $('urlModal').classList.remove('show')
    });
  }

  function setupApiPanel(cfg) {
    const methodEl = $(cfg.method);
    const urlEl = $(cfg.url);
    const sendBtn = $(cfg.send);
    const errorEl = $(cfg.error);
    const statusEl = $(cfg.status);
    const authType = $(cfg.authType);
    const authFields = $(cfg.authFields);
    const headersList = $(cfg.headersList);
    const bodyType = $(cfg.bodyType);
    const bodyEditor = $(cfg.bodyEditor);
    if (!sendBtn) return;

    // Option sub-tabs
    const tabDataKey = cfg.tabAttr;
    document.querySelectorAll(cfg.tabSel).forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll(cfg.tabSel).forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll(cfg.panelSel).forEach(p => p.classList.remove('active'));
        $(tabDataKey + '-' + tab.dataset[tabDataKey]).classList.add('active');
      });
    });

    // Auth type switching
    authType.addEventListener('change', () => renderAuthFields());
    renderAuthFields();

    // Add header row
    $(cfg.addHeader).addEventListener('click', () => addHeaderRow());

    // Remove header row
    headersList.addEventListener('click', e => {
      if (e.target.classList.contains('api-kv-remove')) e.target.closest('.api-kv-row').remove();
    });

    // Body type switching
    bodyType.addEventListener('change', () => {
      bodyEditor.style.display = bodyType.value === 'none' ? 'none' : 'block';
      if (bodyType.value === 'json') bodyEditor.placeholder = '{"key": "value"}';
      else if (bodyType.value === 'form') bodyEditor.placeholder = 'key1=value1&key2=value2';
      else bodyEditor.placeholder = 'Enter request body...';
    });

    // Enter to send
    urlEl.addEventListener('keydown', e => { if (e.key === 'Enter') sendBtn.click(); });

    // Send
    sendBtn.addEventListener('click', async () => {
      const url = urlEl.value.trim();
      if (!url) return;
      errorEl.textContent = '';
      statusEl.innerHTML = '';
      sendBtn.textContent = 'Sending...';
      sendBtn.disabled = true;

      try {
        const opts = buildFetchOptions();
        const t0 = performance.now();
        const resp = await fetch(url, opts);
        const elapsed = Math.round(performance.now() - t0);
        const text = await resp.text();
        const size = new Blob([text]).size;

        // Show status
        const cls = resp.status < 300 ? '2xx' : resp.status < 400 ? '3xx' : resp.status < 500 ? '4xx' : '5xx';
        statusEl.innerHTML =
          `<span class="status-badge status-${cls}">${resp.status} ${resp.statusText}</span>` +
          `<span class="status-time">${elapsed}ms</span>` +
          `<span class="status-size">${formatBytes(size)}</span>`;

        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        const data = JSON.parse(text);
        if (cfg.onSuccess) cfg.onSuccess();
        onJsonLoaded(data, text, url.split('/').pop().split('?')[0] || 'API Response');
      } catch (err) {
        errorEl.textContent = err.message;
      } finally {
        sendBtn.textContent = '\u25B6 Send';
        sendBtn.disabled = false;
      }
    });

    function buildFetchOptions() {
      const method = methodEl.value;
      const headers = {};

      // Collect custom headers
      headersList.querySelectorAll('.api-kv-row').forEach(row => {
        const k = row.querySelector('.api-kv-key').value.trim();
        const v = row.querySelector('.api-kv-val').value.trim();
        if (k) headers[k] = v;
      });

      // Auth
      const auth = authType.value;
      if (auth === 'bearer') {
        let token = authFields.querySelector('[data-role="token"]')?.value.trim() || '';
        token = token.replace(/^bearer\s+/i, '');
        if (token) headers['Authorization'] = 'Bearer ' + token;
      } else if (auth === 'basic') {
        const user = authFields.querySelector('[data-role="user"]')?.value.trim() || '';
        const pass = authFields.querySelector('[data-role="pass"]')?.value.trim() || '';
        if (user) headers['Authorization'] = 'Basic ' + btoa(user + ':' + pass);
      } else if (auth === 'apikey') {
        const name = authFields.querySelector('[data-role="keyname"]')?.value.trim();
        const val = authFields.querySelector('[data-role="keyval"]')?.value.trim();
        if (name && val) headers[name] = val;
      }

      const opts = { method, headers };

      // Body
      if (method !== 'GET' && method !== 'DELETE' && bodyType.value !== 'none') {
        const raw = bodyEditor.value;
        if (bodyType.value === 'json') {
          headers['Content-Type'] = 'application/json';
          opts.body = raw;
        } else if (bodyType.value === 'form') {
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
          opts.body = raw;
        } else {
          headers['Content-Type'] = 'text/plain';
          opts.body = raw;
        }
      }

      return opts;
    }

    function renderAuthFields() {
      const type = authType.value;
      if (type === 'none') {
        authFields.innerHTML = '';
      } else if (type === 'bearer') {
        authFields.innerHTML = '<input type="text" data-role="token" placeholder="Paste token (with or without Bearer prefix)">' +
          '<button class="api-add-row api-decode-jwt" data-role="decode" type="button">Decode Token</button>' +
          '<div class="api-jwt-claims" data-role="claims"></div>';
        authFields.querySelector('[data-role="decode"]').addEventListener('click', () => {
          let raw = authFields.querySelector('[data-role="token"]').value.trim().replace(/^bearer\s+/i, '');
          const claimsEl = authFields.querySelector('[data-role="claims"]');
          if (!raw) { claimsEl.innerHTML = '<div class="api-jwt-error">No token entered</div>'; return; }
          try {
            const parts = raw.split('.');
            if (parts.length !== 3) throw new Error('Not a valid JWT (expected 3 parts, got ' + parts.length + ')');
            const decodeB64 = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return JSON.parse(atob(s)); };
            const header = decodeB64(parts[0]);
            const payload = decodeB64(parts[1]);
            let html = '<div class="api-jwt-header-bar"><span class="api-jwt-title">Decoded Token</span><button class="api-jwt-close" data-role="close-claims" type="button">\u2715</button></div>';
            html += '<div class="api-jwt-section"><div class="api-jwt-section-header"><span class="api-jwt-label">Header</span><button class="api-jwt-copy" data-copy="header" type="button">Copy</button></div><pre class="api-jwt-json">' + escHtml(JSON.stringify(header, null, 2)) + '</pre></div>';
            html += '<div class="api-jwt-section"><div class="api-jwt-section-header"><span class="api-jwt-label">Payload</span><button class="api-jwt-copy" data-copy="payload" type="button">Copy</button></div><pre class="api-jwt-json">' + escHtml(JSON.stringify(payload, null, 2)) + '</pre></div>';
            if (payload.exp) { const d = new Date(payload.exp * 1000); const expired = d < new Date(); html += '<div class="api-jwt-meta">' + (expired ? '\u26d4 Expired' : '\u2705 Valid') + ' | Expires: ' + d.toLocaleString() + '</div>'; }
            if (payload.iat) { html += '<div class="api-jwt-meta">Issued: ' + new Date(payload.iat * 1000).toLocaleString() + '</div>'; }
            html += '<button class="api-add-row api-jwt-copy-all" data-copy="all" type="button">Copy Full Decoded Token</button>';
            claimsEl.innerHTML = html;
            claimsEl.querySelector('[data-role="close-claims"]').addEventListener('click', () => { claimsEl.innerHTML = ''; });
            claimsEl.querySelectorAll('[data-copy]').forEach(btn => {
              btn.addEventListener('click', () => {
                let text;
                if (btn.dataset.copy === 'header') text = JSON.stringify(header, null, 2);
                else if (btn.dataset.copy === 'payload') text = JSON.stringify(payload, null, 2);
                else text = JSON.stringify({ header, payload }, null, 2);
                navigator.clipboard.writeText(text).then(() => { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = btn.dataset.copy === 'all' ? 'Copy Full Decoded Token' : 'Copy', 1500); });
              });
            });
          } catch (e) { claimsEl.innerHTML = '<div class="api-jwt-error">' + escHtml(e.message) + '</div>'; }
        });
      } else if (type === 'basic') {
        authFields.innerHTML =
          '<input type="text" data-role="user" placeholder="Username">' +
          '<input type="password" data-role="pass" placeholder="Password">';
      } else if (type === 'apikey') {
        authFields.innerHTML =
          '<input type="text" data-role="keyname" placeholder="Header name (e.g. X-API-Key)">' +
          '<input type="text" data-role="keyval" placeholder="Key value">';
      }
    }

    function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function addHeaderRow() {
      const row = document.createElement('div');
      row.className = 'api-kv-row';
      row.innerHTML =
        '<input type="text" placeholder="Header name" class="api-kv-key">' +
        '<input type="text" placeholder="Value" class="api-kv-val">' +
        '<button class="api-kv-remove" title="Remove">&#10005;</button>';
      headersList.appendChild(row);
    }

    function formatBytes(b) {
      if (b < 1024) return b + ' B';
      if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
      return (b / 1048576).toFixed(1) + ' MB';
    }
  }

  // --- Clipboard Auto-Detect ---
  function setupClipboardDetect() {
    let lastClipHash = '';
    let clipboardAllowed = null;

    async function checkPermission() {
      try {
        const status = await navigator.permissions.query({ name: 'clipboard-read' });
        clipboardAllowed = status.state === 'granted';
        status.addEventListener('change', () => { clipboardAllowed = status.state === 'granted'; });
      } catch { clipboardAllowed = false; }
    }
    checkPermission();

    window.addEventListener('focus', async () => {
      try {
        if (!clipboardAllowed || !navigator.clipboard || !navigator.clipboard.readText) return;
        const text = await navigator.clipboard.readText();
        if (!text || text.length < 2 || text.length > 500000) return;
        const trimmed = text.trim();
        if ((trimmed[0] !== '{' && trimmed[0] !== '[') || trimmed === lastClipHash) return;
        JSON.parse(trimmed);
        lastClipHash = trimmed;
        showClipboardBanner(trimmed);
      } catch { /* not JSON or no permission */ }
    });
  }

  function showClipboardBanner(text) {
    let banner = document.getElementById('clipBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'clipBanner';
      banner.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:var(--primary);color:#fff;padding:8px 16px;border-radius:8px;font-size:12px;display:flex;align-items:center;gap:10px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.2);transition:opacity .3s';
      document.body.appendChild(banner);
    }
    const preview = text.substring(0, 60).replace(/\s+/g, ' ');
    banner.innerHTML = `<span>📋 JSON found on your clipboard: <em>${esc(preview)}...</em></span><button id="clipLoad" style="background:#fff;color:var(--primary);border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600">Load</button><button id="clipDismiss" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.4);padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px">✕</button>`;
    banner.style.display = 'flex';
    document.getElementById('clipLoad').onclick = () => {
      banner.style.display = 'none';
      try {
        const data = JSON.parse(text);
        const id = window.App.multiTab.addTab('Clipboard', data, text);
        if (id) onJsonLoaded(data, text, 'Clipboard');
      } catch (e) { toast('Invalid JSON: ' + e.message); }
    };
    document.getElementById('clipDismiss').onclick = () => { banner.style.display = 'none'; };
    setTimeout(() => { if (banner.style.display !== 'none') banner.style.display = 'none'; }, 8000);
  }

  // --- Recent Files ---
  function renderRecentPanel() {
    const list = $('recentList');
    if (!window.App.storage) return;
    const recent = window.App.storage.getRecent();
    if (recent.length === 0) {
      list.innerHTML = '<div class="recent-empty">No recent files</div>';
      return;
    }
    list.innerHTML = recent.map((r, i) => `
      <div class="recent-item" data-idx="${i}">
        <div class="recent-item-name">${esc(r.name)}</div>
        <div class="recent-item-meta">${window.App.storage.formatSize(r.size)} &middot; ${window.App.storage.formatTime(r.timestamp)}</div>
        <div class="recent-item-preview">${esc(r.preview)}</div>
      </div>
    `).join('') + '<div class="recent-clear"><button class="btn-clear-recent" id="btnClearRecent">Clear History</button></div>';

    list.querySelectorAll('.recent-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.idx);
        const entry = recent[idx];
        if (!entry) return;
        item.style.opacity = '0.5';
        window.App.storage.loadRecentData(entry).then(text => {
          item.style.opacity = '';
          if (!text) {
            toast('File not available. Select it again...');
            const inp = document.createElement('input');
            inp.type = 'file'; inp.accept = '.json,.txt';
            inp.onchange = () => { if (inp.files[0]) readFile(inp.files[0]); };
            inp.click();
            return;
          }
          try {
            const data = JSON.parse(text);
            onJsonLoaded(data, text, entry.name);
          } catch { toast('Could not read the saved data'); }
        }).catch(() => { item.style.opacity = ''; toast('Could not load this file'); });
      });
    });
    const clearBtn = document.getElementById('btnClearRecent');
    if (clearBtn) clearBtn.addEventListener('click', () => { window.App.storage.clearRecent(); renderRecentPanel(); });
  }

  // --- Load from URL hash ---
  function loadFromHash() {
    const hash = window.location.hash;
    if (hash.startsWith('#data=')) {
      try {
        const encoded = hash.slice(6);
        const json = decodeURIComponent(escape(atob(encoded)));
        parseJsonAsync(json).then(data => {
          onJsonLoaded(data, json, 'Shared JSON');
        }).catch(() => { /* ignore */ });
      } catch { /* ignore */ }
    }
  }

  return { init, loadFromHash, readFile: () => readFileFn };
})();
