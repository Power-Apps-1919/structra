/**
 * Universal Filter — multi-mode filter bar (Path, JSONPath, Regex, JS Expression).
 * Replaces query-panel.js. Uses help-modal.js for documentation popups.
 */
window.App = window.App || {};
window.App.universalFilter = (() => {
  const { $, toast, esc } = window.App.dom;

  let mode = 'path'; // path | jsonpath | regex | js
  let active = false;
  let historyIndex = -1;
  let debounceTimer = null;
  let getJsonData = () => null; // injected getter

  const HISTORY_KEY = 'jpe_filter_history';

  // --- History ---
  function getHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}'); } catch { return {}; }
  }
  function pushHistory(m, expr) {
    if (!expr) return;
    const h = getHistory();
    if (!h[m]) h[m] = [];
    h[m] = h[m].filter(e => e !== expr);
    h[m].unshift(expr);
    if (h[m].length > 20) h[m].length = 20;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  }

  // --- Mode ---
  function setMode(m) {
    mode = m;
    $('ufRun').style.display = (m === 'jsonpath' || m === 'js') ? '' : 'none';
    historyIndex = -1;
    if (ac) { ac.hide(); ac.rebuildIndex(); }
  }

  function detectMode(val) {
    if (val.startsWith('$')) return 'jsonpath';
    if (val.startsWith('/')) return 'regex';
    if (val.startsWith('=')) return 'js';
    return 'path';
  }

  // --- Autocomplete item builders per mode ---
  function pathItems(paths) {
    return paths.map(p => ({ text: p.path, type: p.type }));
  }

  function jsonpathItems(paths) {
    const seen = new Set();
    const out = [];
    for (const p of paths) {
      // Direct: $.users[0].name
      const direct = '$.' + p.path;
      if (!seen.has(direct)) { seen.add(direct); out.push({ text: direct, type: p.type }); }
      // Wildcard array: $.users[*].name
      if (/\[\d+\]/.test(p.path)) {
        const wild = '$.' + p.path.replace(/\[\d+\]/g, '[*]');
        if (!seen.has(wild)) { seen.add(wild); out.push({ text: wild, type: p.type + ' *' }); }
      }
      // Deep scan for leaf keys: $..name
      const dot = p.path.lastIndexOf('.');
      const bracket = p.path.lastIndexOf('[');
      if (dot > 0) {
        const leaf = '$..' + p.path.slice(dot + 1);
        if (!seen.has(leaf)) { seen.add(leaf); out.push({ text: leaf, type: p.type + ' ..' }); }
      } else if (bracket < 0) {
        // Top-level key
        const leaf = '$..' + p.path;
        if (!seen.has(leaf)) { seen.add(leaf); out.push({ text: leaf, type: p.type + ' ..' }); }
      }
    }
    return out;
  }

  function jsItems(paths) {
    const seen = new Set();
    const out = [];
    for (const p of paths) {
      const expr = '=data.' + p.path;
      if (!seen.has(expr)) { seen.add(expr); out.push({ text: expr, type: p.type }); }
      // Wildcard: =data.users.map(x => x.name)
      if (/\[\d+\]\./.test(p.path)) {
        const parts = p.path.split(/\[\d+\]\./);
        if (parts.length === 2) {
          const map = '=data.' + parts[0] + '.map(x => x.' + parts[1] + ')';
          if (!seen.has(map)) { seen.add(map); out.push({ text: map, type: p.type + ' map' }); }
        }
      }
    }
    return out;
  }

  function regexItems(paths) {
    const seen = new Set();
    const out = [];
    for (const p of paths) {
      // Extract leaf key name
      const dot = p.path.lastIndexOf('.');
      const key = dot >= 0 ? p.path.slice(dot + 1) : p.path;
      if (/\[\d+\]$/.test(key)) continue; // skip array indices
      const expr = '/' + key + '/i';
      if (!seen.has(expr)) { seen.add(expr); out.push({ text: expr, type: p.type }); }
    }
    return out;
  }

  function getItemsForMode() {
    const paths = window.App._allPaths;
    if (!paths) return [];
    switch (mode) {
      case 'path': return pathItems(paths);
      case 'jsonpath': return jsonpathItems(paths);
      case 'js': return jsItems(paths);
      case 'regex': return regexItems(paths);
      default: return [];
    }
  }

  // --- Public API ---
  let ac = null; // autocomplete instance

  function init(jsonDataGetter) {
    getJsonData = jsonDataGetter;

    $('treeFilterClear').addEventListener('click', close);
    $('ufRun').addEventListener('click', run);

    // Attach reusable autocomplete to filter input
    const input = $('treeFilterInput');
    ac = window.App.autocomplete.attach(input, {
      getItems: getItemsForMode,
      onSelect: (item) => {
        input.value = item.text;
        run();
      },
      maxResults: 15,
      matchMode: () => (mode === 'path' || mode === 'regex') ? 'contains' : 'prefix'
    });

    input.addEventListener('input', () => {
      const val = input.value;
      const detected = detectMode(val.trim());
      if (detected !== mode) {
        setMode(detected);    // rebuilds items for new mode
        ac.show(val.trim());  // re-show with correct items
      }
      clearTimeout(debounceTimer);
      if (mode === 'path' || mode === 'regex') {
        debounceTimer = setTimeout(run, 200);
      }
    });

    $('treeFilterInput').addEventListener('keydown', e => {
      if (e.defaultPrevented) return; // already handled by autocomplete
      if (ac && ac.isVisible()) {
        // Let autocomplete handle arrows unconditionally
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') return;
        // Enter with a selected autocomplete item — let autocomplete handle it
        if (e.key === 'Enter' && ac.hasSelection()) return;
        // Escape — autocomplete handles its own hiding via preventDefault
        if (e.key === 'Escape') return;
      }
      if (e.key === 'Enter') { e.preventDefault(); ac && ac.hide(); run(); return; }
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const hist = getHistory()[mode] || [];
        if (hist.length === 0) return;
        e.preventDefault();
        if (e.key === 'ArrowUp') historyIndex = Math.min(historyIndex + 1, hist.length - 1);
        else historyIndex = Math.max(historyIndex - 1, -1);
        $('treeFilterInput').value = historyIndex >= 0 ? hist[historyIndex] : '';
      }
    });

    $('ufHelpBtn').addEventListener('click', showHelp);
  }

  function open(forceMode) {
    $('treeFilterBar').style.display = '';
    if (forceMode) setMode(forceMode);
    $('treeFilterInput').focus();
    $('btnTreeFilter').classList.add('active');
  }

  function close() {
    $('treeFilterBar').style.display = 'none';
    $('treeFilterInput').value = '';
    $('btnTreeFilter').classList.remove('active');
    $('ufResults').style.display = 'none';
    resetDisplay();
  }

  function isActive() { return active; }

  function toggle(forceMode) {
    if ($('treeFilterBar').style.display === 'none') open(forceMode);
    else close();
  }

  // --- Table view helpers ---
  function isTableView() {
    return window.App.simpleTable?.isVisible?.();
  }

  function getTableParts() {
    const view = $('simpleTableView');
    if (!view) return null;
    const table = view.querySelector('.st-table');
    if (!table) return null;
    const headers = Array.from(table.querySelectorAll('th[data-col]')).map(th => th.dataset.col);
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    return { table, headers, rows };
  }

  function resetTableFilter() {
    const parts = getTableParts();
    if (!parts) return;
    parts.rows.forEach(tr => tr.style.display = '');
    parts.table.querySelectorAll('.uf-table-match').forEach(el => el.classList.remove('uf-table-match'));
    // Reset column highlights
    parts.table.querySelectorAll('.uf-col-match').forEach(el => el.classList.remove('uf-col-match'));
  }

  function filterTableByPath(pattern) {
    const parts = getTableParts();
    if (!parts) { resetDisplay(); return; }
    let regex;
    try {
      const escaped = pattern.toLowerCase().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      regex = new RegExp(escaped, 'i');
    } catch { resetDisplay(); return; }

    // Match column names — highlight matching columns, show rows that have values in those columns
    const matchedColIdx = [];
    parts.headers.forEach((col, i) => {
      if (regex.test(col)) matchedColIdx.push(i + 1); // +1 for index column offset
    });

    if (matchedColIdx.length === 0) {
      // No columns match — try matching cell values like a text search
      let shown = 0;
      parts.rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        let hit = false;
        cells.forEach(td => {
          if (regex.test(td.textContent)) { hit = true; td.classList.add('uf-table-match'); }
        });
        tr.style.display = hit ? '' : 'none';
        if (hit) shown++;
      });
      $('treeFilterInfo').textContent = `${shown}/${parts.rows.length} rows`;
    } else {
      // Highlight matching column headers and cells
      const ths = parts.table.querySelectorAll('th');
      matchedColIdx.forEach(ci => { if (ths[ci]) ths[ci].classList.add('uf-col-match'); });

      let shown = 0;
      parts.rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        let hasVal = false;
        matchedColIdx.forEach(ci => {
          const td = cells[ci];
          if (td) {
            td.classList.add('uf-table-match');
            const v = td.textContent.trim();
            if (v && v !== 'null' && v !== '') hasVal = true;
          }
        });
        tr.style.display = hasVal ? '' : 'none';
        if (hasVal) shown++;
      });
      $('treeFilterInfo').textContent = `${matchedColIdx.length} col${matchedColIdx.length > 1 ? 's' : ''} · ${shown}/${parts.rows.length} rows`;
    }
    $('ufResults').style.display = 'none';
    active = true;
  }

  function filterTableByRegex(raw) {
    const parts = getTableParts();
    if (!parts) return;
    const m = raw.match(/^\/(.+)\/([gimsuy]*)$/);
    let regex;
    try {
      regex = m ? new RegExp(m[1], m[2] || '') : new RegExp(raw, 'i');
    } catch {
      $('treeFilterInfo').textContent = 'Invalid pattern';
      $('treeFilterInfo').className = 'tree-filter-info uf-no-match';
      return;
    }

    // Match headers
    const ths = parts.table.querySelectorAll('th');
    const matchedColIdx = [];
    parts.headers.forEach((col, i) => {
      if (regex.test(col)) { ths[i + 1]?.classList.add('uf-col-match'); matchedColIdx.push(i + 1); }
    });

    // Match cell values + any column-matched cells
    let shown = 0;
    parts.rows.forEach(tr => {
      const cells = tr.querySelectorAll('td');
      let hit = false;
      cells.forEach(td => {
        const txt = td.textContent.replace(/^"|"$/g, '');
        if (regex.test(txt)) { hit = true; td.classList.add('uf-table-match'); }
      });
      // If regex matched column names, highlight those cells and show the row
      if (!hit && matchedColIdx.length > 0) {
        matchedColIdx.forEach(ci => { if (cells[ci]) { cells[ci].classList.add('uf-table-match'); hit = true; } });
      }
      tr.style.display = hit ? '' : 'none';
      if (hit) shown++;
    });
    $('treeFilterInfo').textContent = `${shown}/${parts.rows.length} rows matched`;
    $('ufResults').style.display = 'none';
    active = true;
  }

  function filterTableByJsonPath(result) {
    const parts = getTableParts();
    if (!parts) return;
    // Identify matching row indices from JSONPath result pointers
    const matchedIndices = new Set();
    for (const r of result) {
      const ptr = typeof r.pointer === 'string' ? r.pointer : '';
      // Pointer like /users/0/name → extract array index
      const idxMatch = ptr.match(/\/(\d+)/);
      if (idxMatch) matchedIndices.add(parseInt(idxMatch[1]));
    }
    let shown = 0;
    parts.rows.forEach((tr, i) => {
      const match = matchedIndices.has(i);
      tr.style.display = match ? '' : 'none';
      if (match) {
        shown++;
        tr.querySelectorAll('td').forEach(td => td.classList.add('uf-table-match'));
      }
    });
    $('treeFilterInfo').textContent = `${result.length} match${result.length !== 1 ? 'es' : ''} · ${shown}/${parts.rows.length} rows`;
    active = true;
  }

  function filterTableByJs(result) {
    const parts = getTableParts();
    if (!parts) return;
    // If result is an array, try to match rows by checking if row data is in result
    if (!Array.isArray(result)) return; // non-array results shown in ufResults panel
    const data = window.App.simpleTable.getData?.();
    if (!data) return;
    let shown = 0;
    parts.rows.forEach((tr, i) => {
      const row = data[i];
      const match = row && result.some(r => r === row || JSON.stringify(r) === JSON.stringify(row));
      tr.style.display = match ? '' : 'none';
      if (match) {
        shown++;
        tr.querySelectorAll('td').forEach(td => td.classList.add('uf-table-match'));
      }
    });
    // Update info to include row count
    const existing = $('treeFilterInfo').textContent;
    $('treeFilterInfo').textContent = existing + ` · ${shown}/${parts.rows.length} rows`;
  }

  // --- Run ---
  async function run() {
    const raw = $('treeFilterInput').value.trim();
    if (!raw) { resetDisplay(); return; }
    pushHistory(mode, raw);
    historyIndex = -1;

    switch (mode) {
      case 'path': filterByPath(raw); break;
      case 'jsonpath': await filterByJsonPath(raw); break;
      case 'regex': filterByRegex(raw); break;
      case 'js': filterByJs(raw); break;
    }
  }

  // --- Path filter ---
  function filterByPath(pattern) {
    if (isTableView()) { resetTableFilter(); filterTableByPath(pattern); return; }
    const view = $('jsonView');
    if (!view) { resetDisplay(); return; }
    let regex;
    try {
      const escaped = pattern.toLowerCase().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      regex = new RegExp(escaped, 'i');
    } catch { resetDisplay(); return; }

    const lines = view.getElementsByClassName('j-line');
    let shown = 0, total = 0;
    for (let i = 0; i < lines.length; i++) {
      const el = lines[i];
      const path = el.querySelector('[data-path]')?.getAttribute('data-path') || '';
      total++;
      if (regex.test(path)) { el.classList.remove('filter-hidden'); shown++; }
      else el.classList.add('filter-hidden');
    }
    $('treeFilterInfo').textContent = `${shown}/${total} visible`;
    $('ufResults').style.display = 'none';
    active = true;
  }

  // --- JSONPath filter ---
  async function filterByJsonPath(expr) {
    const jsonData = getJsonData();
    if (!jsonData) { toast('Load JSON first'); return; }
    try { await window.App.libLoader.require('jsonpath'); }
    catch { toast('Could not load the advanced filter feature'); return; }

    try {
      const result = JSONPath.JSONPath({ path: expr, json: jsonData, resultType: 'all' });
      $('treeFilterInfo').className = 'tree-filter-info' + (result.length === 0 ? ' uf-no-match' : '');
      $('ufResults').style.display = 'none';

      if (result.length === 0) {
        $('treeFilterInfo').textContent = '0 matches';
        // Reset view but preserve info text
        const view0 = $('jsonView');
        if (view0) {
          view0.querySelectorAll('.filter-hidden').forEach(el => el.classList.remove('filter-hidden'));
          view0.querySelectorAll('.filter-match').forEach(el => el.classList.remove('filter-match'));
        }
        active = false;
        return;
      }

      // Convert JSON pointer (/0/name) → data-path format ([0].name)
      const matchedPaths = new Set();
      for (const r of result) {
        const ptr = typeof r.pointer === 'string' ? r.pointer : '';
        const converted = ptr.replace(/^\//, '').replace(/\/(\d+)/g, '[$1]').replace(/\//g, '.').replace(/^(\d+)/, '[$1]');
        matchedPaths.add(converted); // '' = root
      }

      const view = $('jsonView');
      if (!view) return;
      const lines = view.getElementsByClassName('j-line');
      let shown = 0, total = 0;
      for (let i = 0; i < lines.length; i++) {
        const el = lines[i];
        const dp = el.querySelector('[data-path]')?.getAttribute('data-path') || '';
        total++;
        let match = matchedPaths.has(''); // root match → show all
        for (const mp of matchedPaths) {
          if (mp && (dp === mp || dp.startsWith(mp + '.') || dp.startsWith(mp + '['))) { match = true; break; }
        }
        if (match) {
          el.classList.remove('filter-hidden');
          if (matchedPaths.has(dp)) {
            el.querySelectorAll('.j-str, .j-num, .j-bool, .j-null').forEach(vs => vs.classList.add('filter-match'));
          }
          shown++;
        } else {
          el.classList.add('filter-hidden');
        }
      }
      $('treeFilterInfo').textContent = `${result.length} match${result.length !== 1 ? 'es' : ''} · ${shown}/${total} visible`;
      if (isTableView()) filterTableByJsonPath(result);
      active = true;
    } catch (err) {
      $('treeFilterInfo').textContent = 'Error';
      $('treeFilterInfo').className = 'tree-filter-info uf-no-match';
      $('ufResults').innerHTML = `<div class="uf-error">${esc(err.message)}</div>`;
      $('ufResults').style.display = '';
    }
  }

  // --- Regex value filter ---
  function filterByRegex(raw) {
    if (isTableView()) { resetTableFilter(); filterTableByRegex(raw); return; }
    const view = $('jsonView');
    if (!view) return;
    const m = raw.match(/^\/(.+)\/([gimsuy]*)$/);
    let regex;
    try {
      regex = m ? new RegExp(m[1], m[2] || '') : new RegExp(raw, 'i');
    } catch {
      $('treeFilterInfo').textContent = 'Invalid pattern';
      $('treeFilterInfo').className = 'tree-filter-info uf-no-match';
      return;
    }

    view.querySelectorAll('.filter-match').forEach(el => el.classList.remove('filter-match'));

    const lines = view.getElementsByClassName('j-line');
    let shown = 0, total = 0;
    for (let i = 0; i < lines.length; i++) {
      const el = lines[i];
      total++;
      let matched = false;

      // Match keys
      const keySpans = el.querySelectorAll('.j-key');
      for (const ks of keySpans) {
        if (regex.test(ks.textContent.replace(/"|:/g, '').trim())) {
          ks.classList.add('filter-match');
          matched = true;
        }
      }
      // Match values
      const valSpans = el.querySelectorAll('.j-str, .j-num, .j-bool, .j-null');
      for (const vs of valSpans) {
        if (regex.test(vs.textContent.replace(/^"|"$/g, ''))) {
          vs.classList.add('filter-match');
          matched = true;
        }
      }
      if (matched) { el.classList.remove('filter-hidden'); shown++; }
      else el.classList.add('filter-hidden');
    }
    $('treeFilterInfo').textContent = `${shown}/${total} matched`;
    $('ufResults').style.display = 'none';
    active = true;
  }

  // --- JS expression filter ---
  function filterByJs(raw) {
    const jsonData = getJsonData();
    if (!jsonData) { toast('Load JSON first'); return; }
    const expr = raw.startsWith('=') ? raw.slice(1).trim() : raw;
    if (!expr) return;

    try {
      window.App.transformOps.validateExpression(expr);
    } catch (err) {
      $('treeFilterInfo').textContent = 'Not allowed';
      $('treeFilterInfo').className = 'tree-filter-info uf-no-match';
      $('ufResults').innerHTML = `<div class="uf-error">${esc(err.message)}</div>`;
      $('ufResults').style.display = '';
      return;
    }

    try {
      const fn = new Function('data', `return (${expr});`);
      const result = fn(jsonData);

      if (result === undefined || result === null) {
        $('treeFilterInfo').textContent = String(result);
        $('ufResults').style.display = 'none';
        return;
      }

      const resEl = $('ufResults');
      const typeStr = Array.isArray(result) ? `Array[${result.length}]` : typeof result;
      $('treeFilterInfo').textContent = typeStr;
      $('treeFilterInfo').className = 'tree-filter-info';

      const display = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
      resEl.innerHTML = `<pre class="uf-val">${esc(display.length > 50000 ? display.slice(0, 50000) + '\n... (truncated)' : display)}</pre>`;
      resEl.style.display = '';
      if (isTableView()) { resetTableFilter(); filterTableByJs(result); }
      active = true;
    } catch (err) {
      $('treeFilterInfo').textContent = 'Error';
      $('treeFilterInfo').className = 'tree-filter-info uf-no-match';
      $('ufResults').innerHTML = `<div class="uf-error">${esc(err.message)}</div>`;
      $('ufResults').style.display = '';
    }
  }

  // --- Reset ---
  function resetDisplay() {
    const view = $('jsonView');
    if (view) {
      view.querySelectorAll('.filter-hidden').forEach(el => el.classList.remove('filter-hidden'));
      view.querySelectorAll('.filter-match').forEach(el => el.classList.remove('filter-match'));
    }
    resetTableFilter();
    $('treeFilterInfo').textContent = '';
    $('treeFilterInfo').className = 'tree-filter-info';
    $('ufResults').style.display = 'none';
    active = false;
  }

  // --- Help (mode-aware, uses help-modal) ---
  function showHelp() {
    if (mode === 'jsonpath') {
      showJsonPathHelp();
    } else {
      showFilterHelp();
    }
  }

  function showFilterHelp() {
    window.App.helpModal.show('ufHelpModal', 'Filter Guide', [
      { heading: 'Filter Modes', rows: [
        ['Mode', 'Prefix', 'Example'],
        ['<code>Path</code>', '<em>(default)</em>', '<code>*.email</code> wildcard path match'],
        ['<code>JSONPath</code>', '<code>$</code>', '<code>$.store.book[?(@.price&lt;10)]</code>'],
        ['<code>Regex</code>', '<code>/.../</code>', '<code>/^[A-Z]/</code> match values by pattern'],
        ['<code>JS</code>', '<code>=</code>', '<code>=data.filter(x =&gt; x.age &gt; 25)</code>'],
      ]},
      { heading: 'Path Mode', tips: [
        '<code>*</code> matches any part. <code>users</code> shows lines whose path contains "users".',
        'Not case-sensitive. <code>*.email</code> matches <code>contacts[0].email</code>.',
      ]},
      { heading: 'Pattern Mode', tips: [
        'Write patterns like <code>/pattern/flags</code>. Tests each value in the tree.',
        'Matching values get highlighted. Non-matching lines are hidden.',
        'Flags: <code>i</code> (ignore case), <code>g</code>, <code>m</code>.',
      ]},
      { heading: 'JavaScript Mode', tips: [
        'Write <code>=expression</code>. The variable <code>data</code> is your loaded JSON.',
        'Results show below. Filters get applied to the tree view.',
        'Some keywords are not allowed: <code>eval</code>, <code>fetch</code>, <code>document</code>, <code>window</code>, etc.',
        'Examples: <code>=data.length</code>, <code>=data.filter(x =&gt; x.active)</code>',
      ]},
      { heading: 'Keyboard Shortcuts', rows: [
        ['Key', 'What it does'],
        ['<code>Enter</code>', 'Run filter'],
        ['<code>Escape</code>', 'Close filter bar'],
        ['<code>↑ / ↓</code>', 'Go through previous filters'],
      ]},
    ]);
  }

  function showJsonPathHelp() {
    window.App.helpModal.show('qpHelpModal', 'JSONPath Guide', [
      { heading: 'Basics', rows: [
        ['Expression', 'Description'],
        ['<code>$</code>', 'The root element (your entire JSON)'],
        ['<code>.key</code> or <code>[\'key\']</code>', 'Access a child property'],
        ['<code>..key</code>', 'Deep scan: find <em>key</em> at any depth'],
        ['<code>[0]</code>', 'Array index (0-based)'],
        ['<code>[*]</code>', 'All elements in an array or object'],
        ['<code>[0,1,2]</code>', 'Multiple array indices'],
        ['<code>[0:5]</code>', 'Array slice (start:end)'],
        ['<code>[?()]</code>', 'Filter expression'],
      ]},
      { heading: 'Common Patterns', rows: [
        ['Expression', 'What it does'],
        ['<code>$..*</code>', 'All values recursively'],
        ['<code>$..name</code>', 'All "name" fields at any level'],
        ['<code>$.items[*].id</code>', 'Get "id" from every item in array'],
        ['<code>$[0]</code>', 'First element (when root is array)'],
        ['<code>$[-1:]</code>', 'Last element of array'],
        ['<code>$.store.book.length</code>', 'Length of array'],
      ]},
      { heading: 'Filters', rows: [
        ['Expression', 'Description'],
        ['<code>[?(@.price &lt; 10)]</code>', 'Items where price &lt; 10'],
        ['<code>[?(@.name)]</code>', 'Items that have a "name" field'],
        ['<code>[?(@.type==\'book\')]</code>', 'Items where type equals "book"'],
        ['<code>[?(@.price &gt; 5 &amp;&amp; @.price &lt; 20)]</code>', 'Multiple conditions'],
        ['<code>[?(@.tags.indexOf(\'sale\') != -1)]</code>', 'Array contains value'],
      ]},
      { heading: 'Examples by Data Shape', examples: [
        { title: 'Root is an array: <code>[{"name":"A"}, {"name":"B"}]</code>', items: [
          '<code>$[*].name</code> → all names: ["A", "B"]',
          '<code>$[0]</code> → first object',
          '<code>$[?(@.name==\'A\')]</code> → objects where name is "A"',
        ]},
        { title: 'Root is an object: <code>{"store":{"books":[...]}}</code>', items: [
          '<code>$.store.books[*].title</code> → all book titles',
          '<code>$.store.books[?(@.price&lt;10)]</code> → cheap books',
          '<code>$..author</code> → all authors at any depth',
        ]},
        { title: 'Nested arrays: <code>{"data":{"users":[{"roles":["admin"]}]}}</code>', items: [
          '<code>$.data.users[*].roles[*]</code> → all roles',
          '<code>$..roles[0]</code> → first role of each user',
        ]},
      ]},
      { heading: 'Tips', tips: [
        '<strong>Root array?</strong> Use <code>$[*].field</code> not <code>$.field</code>',
        '<strong>Deep search:</strong> Use <code>$..</code> when you don\'t know the exact path',
        '<strong>Special chars in keys:</strong> Use bracket notation <code>$[\'my-key\']</code>',
        '<strong>Combine:</strong> <code>$..items[?(@.active==true)].name</code>',
        '<strong>Count:</strong> Check the "N matches" indicator for result count',
      ]},
      { heading: 'Documentation &amp; References', links: [
        { text: 'JSONPath: Original Specification (Stefan Goessner)', href: 'https://goessner.net/articles/JsonPath/' },
        { text: 'IETF RFC 9535: JSONPath Standard', href: 'https://www.ietf.org/archive/id/draft-ietf-jsonpath-base-21.html' },
        { text: 'JSONPath-Plus: Library used by this tool (GitHub)', href: 'https://github.com/JSONPath-Plus/JSONPath' },
        { text: 'JSONPath Online Evaluator: Try expressions live', href: 'https://jsonpath.com/' },
        { text: 'JSONPath Comparison: Cross-implementation behavior', href: 'https://cburgmer.github.io/json-path-comparison/' },
      ]},
    ]);
  }

  return { init, open, close, toggle, isActive, resetDisplay };
})();
