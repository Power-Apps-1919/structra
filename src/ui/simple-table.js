/**
 * Simple Table View - single <table> with sticky header and column context menu.
 */
window.App = window.App || {};
window.App.simpleTable = (() => {
  const { $, esc, toast } = window.App.dom;
  const { parseDate, detectDateColumns } = window.App.dateHelpers;
  const { downloadCsv } = window.App.csvExport;
  const { resolvePath } = window.App.path;
  const { deepStr, wildcardMatch } = window.App.jsonUtils;

  let currentData = null;
  let basePath = '';
  let onSelectCb = null;
  let columnOrder = [];
  let hiddenCols = new Set();
  let filters = {}; // col → { type:'values', values:Set } | { type:'conditions', rules:[{op,value}], logic:'and'|'or' }
  let sortKey = null;
  let sortDir = 1;
  let searchTerm = ''; // global table search
  let dateColumns = new Set(); // auto-detected date columns
  let availableArrays = []; // all discovered arrays for selector

  // --- Advanced filter highlight state ---
  let _highlightRows = null;   // Set of row indices to highlight, or null (no filter)
  let _highlightCols = null;   // Set of column names to highlight, or null

  // --- Global search (supports wildcards with * and ?) ---
  function matchesSearch(row, term) {
    if (!term) return true;
    const cols = visibleCols();
    const hasWild = term.includes('*') || term.includes('?');
    for (const col of cols) {
      const val = row[col];
      const str = deepStr(val);
      if (hasWild) {
        if (wildcardMatch(str, term)) return true;
      } else {
        if (str.toLowerCase().includes(term.toLowerCase())) return true;
      }
    }
    // Also search hidden/all columns for deep matches
    for (const col of columnOrder) {
      if (cols.includes(col)) continue; // already checked
      const val = row[col];
      if (val == null) continue;
      const str = deepStr(val);
      if (hasWild) {
        if (wildcardMatch(str, term)) return true;
      } else {
        if (str.toLowerCase().includes(term.toLowerCase())) return true;
      }
    }
    return false;
  }

  // Condition operators
  const CONDITIONS = [
    { id: 'contains', label: 'Contains', fn: (v, t) => v.toLowerCase().includes(t.toLowerCase()) },
    { id: 'not-contains', label: 'Does not contain', fn: (v, t) => !v.toLowerCase().includes(t.toLowerCase()) },
    { id: 'equals', label: 'Equals', fn: (v, t) => v === t },
    { id: 'not-equals', label: 'Does not equal', fn: (v, t) => v !== t },
    { id: 'starts-with', label: 'Starts with', fn: (v, t) => v.toLowerCase().startsWith(t.toLowerCase()) },
    { id: 'ends-with', label: 'Ends with', fn: (v, t) => v.toLowerCase().endsWith(t.toLowerCase()) },
    { id: 'wildcard', label: 'Wildcard (* ?)', fn: (v, t) => wildcardMatch(v, t) },
    { id: 'gt', label: 'Greater than', fn: (v, t) => parseFloat(v) > parseFloat(t) },
    { id: 'lt', label: 'Less than', fn: (v, t) => parseFloat(v) < parseFloat(t) },
    { id: 'gte', label: 'Greater or equal', fn: (v, t) => parseFloat(v) >= parseFloat(t) },
    { id: 'lte', label: 'Less or equal', fn: (v, t) => parseFloat(v) <= parseFloat(t) },
    { id: 'date-before', label: 'Date before', fn: (v, t) => { const d = parseDate(v), td = parseDate(t); return d && td && d < td; } },
    { id: 'date-after', label: 'Date after', fn: (v, t) => { const d = parseDate(v), td = parseDate(t); return d && td && d > td; } },
    { id: 'date-between', label: 'Date between (a,b)', fn: (v, t) => { const d = parseDate(v); const [a, b] = t.split(',').map(s => parseDate(s.trim())); return d && a && b && d >= a && d <= b; } },
    { id: 'is-empty', label: 'Is empty or null', fn: (v) => v === '' || v === 'null' || v === '__null__' },
    { id: 'not-empty', label: 'Is not empty', fn: (v) => v !== '' && v !== 'null' && v !== '__null__' },
    { id: 'regex', label: 'Matches pattern', fn: (v, t) => { try { return new RegExp(t, 'i').test(v); } catch { return false; } } },
  ];

  function render(data, path, onSelect) {
    currentData = data;
    basePath = path;
    onSelectCb = onSelect;
    columnOrder = Object.keys(data[0]);
    hiddenCols.clear();
    filters = {};
    sortKey = null;
    sortDir = 1;
    searchTerm = '';
    dateColumns = detectDateColumns(data);
    buildTable();
  }

  function visibleCols() {
    return columnOrder.filter(c => !hiddenCols.has(c));
  }

  function getFilteredData() {
    let data = currentData;

    // Global search first
    if (searchTerm) {
      data = data.filter(row => matchesSearch(row, searchTerm));
    }

    // Column filters
    const activeCols = Object.keys(filters);
    if (activeCols.length === 0) return data;
    return data.filter(row => {
      for (const col of activeCols) {
        const f = filters[col];
        const val = row[col];
        const strVal = val == null ? '__null__' : String(val);

        if (f.type === 'values') {
          if (!f.values.has(strVal)) return false;
        } else if (f.type === 'conditions') {
          const results = f.rules.map(rule => {
            const cond = CONDITIONS.find(c => c.id === rule.op);
            if (!cond) return true;
            return cond.fn(strVal, rule.value || '');
          });
          const pass = f.logic === 'or'
            ? results.some(r => r)
            : results.every(r => r);
          if (!pass) return false;
        }
      }
      return true;
    });
  }

  function getSortedData() {
    const data = getFilteredData();
    if (!sortKey) return data;
    const isDate = dateColumns.has(sortKey);
    return [...data].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (isDate) {
        const da = parseDate(av), db = parseDate(bv);
        if (da && db) return (da - db) * sortDir;
      }
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sortDir;
      return String(av).localeCompare(String(bv)) * sortDir;
    });
  }

  /* ---- Chunk + Recycle constants (mirrors json-view pattern) ---- */
  const CHUNK_SIZE = 200;          // rows per chunk
  const OFFSCREEN_MARGIN = 2000;   // px before recycling offscreen chunks

  let _cachedRows = null;          // sorted+filtered data
  let _cols = [];                  // visible columns cache
  let _loadObserver = null;        // IntersectionObserver for loading next chunk
  let _recycleObserver = null;     // IntersectionObserver for memory recycling
  let _scrollEl = null;
  let _tbodyEl = null;

  function cleanupObservers() {
    if (_loadObserver) { _loadObserver.disconnect(); _loadObserver = null; }
    if (_recycleObserver) { _recycleObserver.disconnect(); _recycleObserver = null; }
    if (_scrollEl) { _scrollEl.removeEventListener('scroll', _onScrollFallback); }
  }

  /* Scroll fallback: eagerly load sentinel when within 2 viewports */
  let _scrollRAF = 0;
  function _onScrollFallback() {
    if (_scrollRAF) return;
    _scrollRAF = requestAnimationFrame(() => {
      _scrollRAF = 0;
      if (!_scrollEl) return;
      const sentinel = _tbodyEl?.querySelector('.st-sentinel-wrap');
      if (!sentinel) return;
      const scrollBottom = _scrollEl.scrollTop + _scrollEl.clientHeight;
      const sentinelTop = sentinel.offsetTop - _scrollEl.offsetTop;
      // If sentinel is within 2 viewport heights, force load
      if (sentinelTop - scrollBottom < _scrollEl.clientHeight * 2) {
        _loadObserver?.unobserve(sentinel);
        loadNextChunk(sentinel);
      }
    });
  }

  function buildTable() {
    cleanupObservers();
    const container = $('simpleTableView');
    _cols = visibleCols();
    _cachedRows = getSortedData();
    const rows = _cachedRows;

    let html = '<div class="st-toolbar">';
    if (availableArrays.length > 1) {
      html += '<select class="st-array-select" id="stArraySelect">';
      for (const a of availableArrays) {
        const sel = a.path === basePath ? ' selected' : '';
        const disabled = (!a.data.length || typeof a.data[0] !== 'object') ? ' disabled' : '';
        html += `<option value="${esc(a.path)}"${sel}${disabled}>${esc(a.path)} (${a.count})</option>`;
      }
      html += '</select>';
    }
    html += '<div class="st-search-wrap"><input class="st-search" id="stSearch" type="text" placeholder="Search table... (use * or ? for wildcards)" value="' + esc(searchTerm) + '"></div>';
    const filterCount = Object.keys(filters).length;
    html += `<span class="st-info">${rows.length}${searchTerm || filterCount ? ' / ' + currentData.length : ''} rows × ${_cols.length} columns`;
    if (dateColumns.size > 0) html += ` · ${dateColumns.size} date col${dateColumns.size > 1 ? 's' : ''}`;
    html += `</span>`;
    if (filterCount > 0) html += `<button class="st-btn st-btn-warn" id="stClearFilters">Clear Filters (${filterCount})</button>`;
    if (searchTerm) html += `<button class="st-btn st-btn-warn" id="stClearSearch">Clear Search</button>`;
    if (hiddenCols.size > 0) html += `<button class="st-btn" id="stShowAll">Show All (${hiddenCols.size} hidden)</button>`;
    html += `<button class="st-btn" id="stExportCsv">CSV</button>`;
    html += '</div>';

    html += '<div class="st-scroll" id="stScroll"><table class="st-table"><thead><tr>';
    html += '<th class="st-th-idx">#</th>';
    for (const col of _cols) {
      const sortIcon = sortKey === col ? (sortDir === 1 ? ' ▲' : ' ▼') : '';
      const filterIcon = filters[col] ? ' <span class="st-filter-icon">⏷</span>' : '';
      const dateIcon = dateColumns.has(col) ? ' <span class="st-date-icon">📅</span>' : '';
      const colMatch = _highlightCols?.has(col) ? ' uf-col-match' : '';
      html += `<th data-col="${esc(col)}" class="${colMatch}">${esc(col)}${sortIcon}${filterIcon}${dateIcon}</th>`;
    }
    html += '</tr></thead></table></div>';
    container.innerHTML = html;

    _scrollEl = container.querySelector('#stScroll');
    _tbodyEl = container.querySelector('.st-table'); // table element, chunks are appended as <tbody>

    // Setup observers
    setupObservers();

    // Render first chunk + sentinel
    const end = Math.min(CHUNK_SIZE, rows.length);
    const chunk = buildChunk(0, end);
    _tbodyEl.appendChild(chunk);
    if (rows.length > CHUNK_SIZE) observeRecycle(chunk);

    if (end < rows.length) {
      const sentinel = makeSentinel(end, rows.length);
      _tbodyEl.appendChild(sentinel);
      _loadObserver.observe(sentinel);
    }

    // Bind toolbar/header events
    bindEvents(container);
  }

  /* Build a <tbody>-fragment (chunk wrapper) for rows [start..end) */
  function buildChunk(start, end) {
    const chunk = document.createElement('tbody');
    chunk.className = 'st-chunk';
    chunk.dataset.start = start;
    chunk.dataset.end = end;
    fillChunk(chunk, start, end);
    return chunk;
  }

  /* Populate a chunk element with <tr> rows */
  function fillChunk(chunk, start, end) {
    const cols = _cols;
    const rows = _cachedRows;
    const hasRowFilter = _highlightRows !== null;
    const hasColFilter = _highlightCols !== null;
    const parts = [];
    for (let i = start; i < end; i++) {
      const row = rows[i];
      const rowMatch = !hasRowFilter || _highlightRows.has(i);
      const trClass = hasRowFilter && !rowMatch ? ' class="uf-row-hidden"' : '';
      parts.push(`<tr data-idx="${i}"${trClass}><td class="st-td-idx">${i}</td>`);
      for (const col of cols) {
        const val = row[col];
        let display;
        if (val === null || val === undefined) display = '<span class="st-null">null</span>';
        else if (typeof val === 'object') display = esc(JSON.stringify(val));
        else if (dateColumns.has(col)) {
          const d = parseDate(val);
          display = d ? `<span class="st-date">${esc(d.toLocaleDateString())} <span class="st-time">${esc(d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}))}</span></span>` : esc(String(val));
        }
        else display = esc(String(val));
        if (searchTerm && !searchTerm.includes('*') && !searchTerm.includes('?') && display.toLowerCase().includes(searchTerm.toLowerCase())) {
          const idx = display.toLowerCase().indexOf(searchTerm.toLowerCase());
          display = display.slice(0, idx) + '<mark class="st-highlight">' + display.slice(idx, idx + searchTerm.length) + '</mark>' + display.slice(idx + searchTerm.length);
        }
        const cellClass = (rowMatch && hasColFilter && _highlightCols.has(col)) ? ' class="uf-table-match"' : '';
        parts.push(`<td${cellClass} title="${esc(String(val ?? ''))}">${display}</td>`);
      }
      parts.push('</tr>');
    }
    chunk.innerHTML = parts.join('');
    // Bind row clicks
    chunk.querySelectorAll('tr[data-idx]').forEach(tr => {
      tr.addEventListener('click', () => {
        const idx = tr.dataset.idx;
        const path = basePath === '(root)' ? `[${idx}]` : `${basePath}[${idx}]`;
        if (onSelectCb) onSelectCb(path);
        document.querySelectorAll('.st-chunk tr.st-selected').forEach(r => r.classList.remove('st-selected'));
        tr.classList.add('st-selected');
      });
    });
  }

  /* Create a sentinel element that triggers loading the next chunk */
  function makeSentinel(start, total) {
    const el = document.createElement('tr');
    el.className = 'st-sentinel';
    el.dataset.start = start;
    el.dataset.total = total;
    const remaining = total - start;
    el.innerHTML = `<td colspan="${_cols.length + 1}" class="st-sentinel-td">Loading... ${remaining.toLocaleString()} more rows</td>`;
    // Wrap in a tbody so it's a valid table child
    const wrapper = document.createElement('tbody');
    wrapper.className = 'st-sentinel-wrap';
    wrapper.appendChild(el);
    return wrapper;
  }

  /* Setup IntersectionObservers for lazy-load and memory recycling */
  function setupObservers() {
    // Load observer: trigger well ahead of sentinel (must exceed chunk height ~5600px for 200 rows)
    _loadObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const sentinel = entry.target;
        _loadObserver.unobserve(sentinel);
        loadNextChunk(sentinel);
      }
    }, { root: _scrollEl, rootMargin: '6000px' });

    // Scroll-based fallback: if sentinel is close to viewport, load eagerly
    _scrollEl.addEventListener('scroll', _onScrollFallback, { passive: true });

    // Recycle observer: recycles chunks that are >OFFSCREEN_MARGIN away
    _recycleObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const chunk = entry.target;
        if (entry.isIntersecting) {
          // Scrolled back into range → rehydrate
          if (chunk.dataset.recycled === '1') rehydrateChunk(chunk);
        } else {
          // Scrolled far away → recycle
          if (chunk.dataset.recycled !== '1') recycleChunk(chunk);
        }
      }
    }, { root: _scrollEl, rootMargin: OFFSCREEN_MARGIN + 'px' });
  }

  /* Load the next chunk when the sentinel is reached */
  function loadNextChunk(sentinelWrap) {
    const sentinel = sentinelWrap.querySelector('.st-sentinel');
    const start = parseInt(sentinel.dataset.start, 10);
    const total = parseInt(sentinel.dataset.total, 10);
    const end = Math.min(start + CHUNK_SIZE, total);

    const chunk = buildChunk(start, end);
    sentinelWrap.before(chunk);
    observeRecycle(chunk);

    if (end < total) {
      // Update sentinel for next batch
      sentinel.dataset.start = end;
      const remaining = total - end;
      sentinel.querySelector('.st-sentinel-td').textContent = `Loading... ${remaining.toLocaleString()} more rows`;
      _loadObserver.observe(sentinelWrap);
    } else {
      // All rows loaded, remove sentinel
      sentinelWrap.remove();
    }
  }

  /* Register a chunk with the recycle observer */
  function observeRecycle(chunk) {
    if (_cachedRows.length > CHUNK_SIZE) {
      _recycleObserver.observe(chunk);
    }
  }

  /* Recycle: clear innerHTML, preserve height as placeholder */
  function recycleChunk(chunk) {
    const h = chunk.offsetHeight;
    if (h === 0) return; // collapsed/hidden, skip
    chunk.dataset.savedHeight = h;
    chunk.innerHTML = `<tr><td colspan="${_cols.length + 1}" style="height:${h}px;padding:0;border:none"></td></tr>`;
    chunk.dataset.recycled = '1';
  }

  /* Rehydrate: re-render from cached data */
  function rehydrateChunk(chunk) {
    const start = parseInt(chunk.dataset.start, 10);
    const end = parseInt(chunk.dataset.end, 10);
    fillChunk(chunk, start, end);
    delete chunk.dataset.recycled;
    delete chunk.dataset.savedHeight;
  }

  function bindEvents(container) {
    // Global search
    const searchBox = container.querySelector('#stSearch');
    if (searchBox) {
      let debounce = 0;
      searchBox.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          searchTerm = searchBox.value.trim();
          buildTable();
          // Re-focus search and restore cursor
          const newBox = $('simpleTableView').querySelector('#stSearch');
          if (newBox) { newBox.focus(); newBox.selectionStart = newBox.selectionEnd = newBox.value.length; }
        }, 200);
      });
      searchBox.addEventListener('keydown', e => {
        if (e.key === 'Escape') { searchTerm = ''; buildTable(); }
      });
    }

    // Clear search button
    const clearSearchBtn = container.querySelector('#stClearSearch');
    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => { searchTerm = ''; buildTable(); });
    }

    // Column header click → sort
    container.querySelectorAll('thead th[data-col]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (sortKey === col) {
          sortDir *= -1;
        } else {
          sortKey = col;
          sortDir = 1;
        }
        buildTable();
      });

      // Right-click → column menu
      th.addEventListener('contextmenu', e => {
        e.preventDefault();
        showColumnMenu(e.clientX, e.clientY, th.dataset.col);
      });
    });

    // Row click is handled by chunk fillChunk()

    // Show All button
    const showAllBtn = container.querySelector('#stShowAll');
    if (showAllBtn) {
      showAllBtn.addEventListener('click', () => {
        hiddenCols.clear();
        buildTable();
      });
    }

    // Clear Filters button
    const clearBtn = container.querySelector('#stClearFilters');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        filters = {};
        buildTable();
      });
    }

    // CSV export
    const csvBtn = container.querySelector('#stExportCsv');
    if (csvBtn) {
      csvBtn.addEventListener('click', exportCsv);
    }

    // Array selector
    const arraySelect = container.querySelector('#stArraySelect');
    if (arraySelect) {
      arraySelect.addEventListener('change', () => {
        const path = arraySelect.value;
        const arr = availableArrays.find(a => a.path === path);
        if (!arr) return;
        // For wildcard paths, resolve full merged data from root JSON
        let data = arr.data;
        if (path.includes('[*]') && window.App._jsonDataRef) {
          const resolved = resolvePath(window.App._jsonDataRef, path);
          if (Array.isArray(resolved) && resolved.length > 0) data = resolved;
        }
        if (data.length && typeof data[0] === 'object') {
          render(data, path, onSelectCb);
        } else {
          toast('This array cannot be shown as a table');
        }
      });
    }
  }

  function showColumnMenu(x, y, col) {
    // Remove existing menu
    const old = document.getElementById('stColMenu');
    if (old) old.remove();

    const menu = document.createElement('div');
    menu.id = 'stColMenu';
    menu.className = 'st-col-menu';

    const hasFilter = !!filters[col];
    // Check if column contains nested objects that can be expanded
    const hasObjects = currentData.some(row => {
      const val = row[col];
      return val !== null && typeof val === 'object' && !Array.isArray(val);
    });
    menu.innerHTML = `
      <div class="st-menu-item" data-action="sort-asc">▲ Sort Ascending</div>
      <div class="st-menu-item" data-action="sort-desc">▼ Sort Descending</div>
      <div class="st-menu-sep"></div>
      <div class="st-menu-item" data-action="filter">⏷ Filter Values...</div>
      ${hasFilter ? '<div class="st-menu-item" data-action="clear-filter">✕ Clear Filter</div>' : ''}
      <div class="st-menu-sep"></div>
      ${hasObjects ? '<div class="st-menu-item" data-action="expand">⊞ Expand Object Column</div>' : ''}
      <div class="st-menu-item" data-action="hide">⊘ Hide Column</div>
      <div class="st-menu-item" data-action="copy-col">📋 Copy Column Values</div>
    `;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    document.body.appendChild(menu);

    menu.addEventListener('click', e => {
      const item = e.target.closest('.st-menu-item');
      if (!item) return;
      const action = item.dataset.action;
      if (action === 'sort-asc') { sortKey = col; sortDir = 1; buildTable(); menu.remove(); }
      else if (action === 'sort-desc') { sortKey = col; sortDir = -1; buildTable(); menu.remove(); }
      else if (action === 'hide') { hiddenCols.add(col); buildTable(); menu.remove(); }
      else if (action === 'copy-col') { copyColumn(col); menu.remove(); }
      else if (action === 'clear-filter') { delete filters[col]; buildTable(); menu.remove(); }
      else if (action === 'filter') { menu.remove(); showFilterPanel(x, y, col); }
      else if (action === 'expand') { expandColumn(col); menu.remove(); }
    });

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function close() {
        menu.remove();
        document.removeEventListener('click', close);
      }, { once: true });
    }, 0);
  }

  function showFilterPanel(x, y, col) {
    window.App.tableFilter.showFilterPanel(x, y, col, currentData, filters, CONDITIONS, buildTable);
  }

  function copyColumn(col) {
    const rows = getSortedData();
    const values = rows.map(r => r[col] == null ? '' : String(r[col]));
    navigator.clipboard.writeText(values.join('\n')).then(() => toast('Column copied'));
  }

  function expandColumn(col) {
    // Collect all nested keys from this column across all rows
    const nestedKeys = new Set();
    for (const row of currentData) {
      const val = row[col];
      if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        for (const k of Object.keys(val)) nestedKeys.add(k);
      }
    }
    if (nestedKeys.size === 0) { toast('No nested keys to expand'); return; }
    showExpandKeyPicker(col, Array.from(nestedKeys));
  }

  function showExpandKeyPicker(col, allKeys) {
    // Remove existing picker
    const old = document.getElementById('stExpandPicker');
    if (old) old.remove();

    const panel = document.createElement('div');
    panel.id = 'stExpandPicker';
    panel.className = 'st-expand-picker';
    panel.innerHTML = `
      <div class="st-expand-title">Expand "${esc(col)}" and select keys</div>
      <div class="st-expand-actions">
        <label class="st-expand-toggle"><input type="checkbox" id="stExpandAll" checked> Select All</label>
      </div>
      <div class="st-expand-list">${allKeys.map(k => `<label class="st-expand-key"><input type="checkbox" value="${esc(k)}" checked> ${esc(k)}</label>`).join('')}</div>
      <div class="st-expand-btns">
        <button class="st-btn" id="stExpandOk">Expand Selected</button>
        <button class="st-btn" id="stExpandCancel">Cancel</button>
      </div>
    `;
    document.body.appendChild(panel);

    // Center on screen
    panel.style.position = 'fixed';
    panel.style.top = '50%';
    panel.style.left = '50%';
    panel.style.transform = 'translate(-50%, -50%)';
    panel.style.zIndex = '10000';

    const allCb = panel.querySelector('#stExpandAll');
    const keyCbs = panel.querySelectorAll('.st-expand-list input[type="checkbox"]');

    allCb.addEventListener('change', () => {
      keyCbs.forEach(cb => cb.checked = allCb.checked);
    });
    keyCbs.forEach(cb => cb.addEventListener('change', () => {
      allCb.checked = Array.from(keyCbs).every(c => c.checked);
    }));

    panel.querySelector('#stExpandCancel').addEventListener('click', () => panel.remove());
    panel.querySelector('#stExpandOk').addEventListener('click', () => {
      const selected = Array.from(keyCbs).filter(c => c.checked).map(c => c.value);
      panel.remove();
      if (selected.length === 0) { toast('No keys selected'); return; }
      doExpand(col, selected);
    });

    // Close on Escape
    const onKey = e => { if (e.key === 'Escape') { panel.remove(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
  }

  function doExpand(col, selectedKeys) {
    const colIdx = columnOrder.indexOf(col);
    const expandedColNames = selectedKeys.map(k => `${col}.${k}`);
    columnOrder.splice(colIdx + 1, 0, ...expandedColNames);
    for (const row of currentData) {
      const val = row[col];
      for (const k of selectedKeys) {
        const expandedKey = `${col}.${k}`;
        row[expandedKey] = (val !== null && typeof val === 'object' && !Array.isArray(val)) ? val[k] ?? null : null;
      }
    }
    hiddenCols.add(col);
    buildTable();
    toast(`Expanded "${col}" into ${selectedKeys.length} columns`);
  }

  function exportCsv() {
    const cols = visibleCols();
    const rows = getSortedData();
    downloadCsv(rows, cols, 'table_export.csv');
  }

  function setArrays(arrays) {
    availableArrays = arrays;
  }

  /* Set highlight state for advanced filter (called from universal-filter.js) */
  function setHighlight(matchedRowIndices, matchedColNames) {
    _highlightRows = matchedRowIndices; // Set<number> or null
    _highlightCols = matchedColNames;   // Set<string> or null
    // Re-render all active chunks with new highlight state
    if (_tbodyEl) {
      _tbodyEl.querySelectorAll('.st-chunk').forEach(chunk => {
        const start = parseInt(chunk.dataset.start, 10);
        const end = parseInt(chunk.dataset.end, 10);
        if (chunk.dataset.recycled === '1') return; // skip recycled, they'll pick up state on rehydrate
        fillChunk(chunk, start, end);
      });
      // Also update column header highlights
      _tbodyEl.querySelectorAll('th[data-col]').forEach(th => {
        th.classList.toggle('uf-col-match', !!_highlightCols?.has(th.dataset.col));
      });
    }
  }

  function clearHighlight() {
    _highlightRows = null;
    _highlightCols = null;
    if (_tbodyEl) {
      _tbodyEl.querySelectorAll('.st-chunk').forEach(chunk => {
        if (chunk.dataset.recycled === '1') return;
        const start = parseInt(chunk.dataset.start, 10);
        const end = parseInt(chunk.dataset.end, 10);
        fillChunk(chunk, start, end);
      });
      _tbodyEl.querySelectorAll('th.uf-col-match').forEach(th => th.classList.remove('uf-col-match'));
    }
  }

  return { render, setArrays, setHighlight, clearHighlight, getData: () => currentData, getColumns: () => columnOrder.filter(c => !hiddenCols.has(c)), isVisible: () => $('simpleTableView')?.classList.contains('show') };
})();
