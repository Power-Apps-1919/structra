/**
 * JSON tree view rendering, collapsing, search highlighting.
 * Uses chunked lazy-loading + DOM recycling for memory efficiency with 200k+ arrays.
 * - Forward loading: IntersectionObserver loads next chunk as user scrolls down
 * - DOM recycling: Offscreen chunks are replaced with height-preserving placeholders
 * - Re-hydration: Chunks are re-rendered when scrolled back into view
 */
window.App = window.App || {};
window.App.jsonView = (() => {
  const { $, esc, toast, showLoading, hideLoading } = window.App.dom;
  let lineCounter = 0;
  let fileLine = 0;             // Tracks actual file line number
  const CHUNK_SIZE = 100;        // Items per chunk
  const OFFSCREEN_MARGIN = 3000; // px away from viewport before recycling
  let loadObserver = null;       // Loads new chunks (forward)
  let recycleObserver = null;    // Recycles offscreen chunks
  let onPathSelectCb = null;
  let onContextMenuCb = null;
  let chunkId = 0;

  // --- Data-level filter state (survives chunk recycle/rehydrate) ---
  let _filterMatchedPaths = null;   // Set<string> of matched data-paths, or null (no filter)
  let _filterPathRegex = null;      // RegExp for path-based filter, or null
  let _filterScrollHandler = null;  // Scroll-based chunk loader when filter is active

  function render(jsonData, onPathSelect, onContextMenu) {
    lineCounter = 0;
    fileLine = 0;
    chunkId = 0;
    _filterMatchedPaths = null;
    _filterPathRegex = null;
    _removeFilterScrollLoader($('jsonView'));
    onPathSelectCb = onPathSelect;
    onContextMenuCb = onContextMenu;
    cleanup();
    const view = $('jsonView');
    view.innerHTML = buildLines(jsonData, '', 0).join('');
    setupDelegation(view);
    setupObservers(view);
    if (window.App.contentPreview) window.App.contentPreview.setupHandlers(view);
  }

  // Pre-compute how many lines a value takes in JSON.stringify(data, null, indent) format
  function countFileLines(val) {
    if (val === null || typeof val !== 'object') return 1;
    if (Array.isArray(val)) {
      if (val.length === 0) return 1; // [] on one line
      let count = 2; // opening [ and closing ]
      for (let i = 0; i < val.length; i++) count += countFileLines(val[i]);
      return count;
    }
    const keys = Object.keys(val);
    if (keys.length === 0) return 1; // {} on one line
    let count = 2; // opening { and closing }
    for (let i = 0; i < keys.length; i++) {
      const v = val[keys[i]];
      if (v && typeof v === 'object') {
        count += countFileLines(v); // key merged with opening bracket = same line count
      } else {
        count += 1;
      }
    }
    return count;
  }

  function cleanup() {
    if (loadObserver) { loadObserver.disconnect(); loadObserver = null; }
    if (recycleObserver) { recycleObserver.disconnect(); recycleObserver = null; }
  }

  function setupObservers(view) {
    // Observer to load new chunks (sentinels)
    loadObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          loadObserver.unobserve(entry.target);
          loadNextChunk(entry.target);
        }
      }
    }, { root: view, rootMargin: '400px' });

    // Observer to recycle/rehydrate chunks for memory management
    recycleObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const chunk = entry.target;
        if (!entry.isIntersecting) {
          // Gone offscreen → recycle (free DOM nodes)
          if (!chunk.dataset.recycled) {
            recycleChunk(chunk);
          }
        } else {
          // Back in view → rehydrate (re-render from data)
          if (chunk.dataset.recycled) {
            rehydrateChunk(chunk);
          }
        }
      }
    }, { root: view, rootMargin: `${OFFSCREEN_MARGIN}px` });

    // Observe existing sentinels and chunks
    view.querySelectorAll('.j-lazy-sentinel').forEach(s => loadObserver.observe(s));
    // Only observe chunks for recycling if they belong to large arrays (>CHUNK_SIZE items)
    // Small chunks (entire small arrays) should never be recycled as it causes visibility bugs
    view.querySelectorAll('.j-chunk').forEach(c => {
      const total = parseInt(c.dataset.chunktotal);
      if (total > CHUNK_SIZE) recycleObserver.observe(c);
    });
  }

  function recycleChunk(chunk) {
    // Save height to prevent layout shift
    const h = chunk.offsetHeight;
    if (h === 0) return; // Don't recycle collapsed/hidden chunks
    chunk.dataset.recycled = '1';
    chunk.innerHTML = '';
    chunk.style.height = h + 'px';
  }

  function rehydrateChunk(chunk) {
    const path = chunk.dataset.chunkpath || '';
    const indent = parseInt(chunk.dataset.chunkindent);
    const start = parseInt(chunk.dataset.chunkstart);
    const end = parseInt(chunk.dataset.chunkend);
    const total = parseInt(chunk.dataset.chunktotal);
    const startLine = parseInt(chunk.dataset.chunkstartline) || 0;

    const dataRef = window.App._jsonDataRef;
    const actualArr = path ? window.App.path.resolvePath(dataRef, path) : dataRef;
    if (!actualArr || !Array.isArray(actualArr)) return;

    const lines = buildChunkLines(actualArr, path, indent, start, end, total, startLine);
    chunk.innerHTML = lines.join('');
    chunk.style.height = '';
    delete chunk.dataset.recycled;
    applyFilterToContainer(chunk);
  }

  function buildChunkLines(arr, path, indent, start, end, total, startLine) {
    const lines = [];
    const innerPad = '  '.repeat(indent + 1);
    let currentLine = startLine || 0;
    for (let i = start; i < end; i++) {
      const item = arr[i];
      const cp = path ? `${path}[${i}]` : `[${i}]`;
      const needsComma = i < total - 1;
      if (item && typeof item === 'object') {
        // Temporarily set fileLine for nested buildLines calls
        const savedFileLine = fileLine;
        fileLine = currentLine;
        const sub = buildLines(item, cp, indent + 1);
        currentLine = fileLine;
        fileLine = savedFileLine;
        for (let s = 0; s < sub.length; s++) lines.push(sub[s]);
        if (needsComma && lines.length) {
          const last = lines[lines.length - 1];
          const idx = last.lastIndexOf('</span>');
          if (idx !== -1) lines[lines.length - 1] = last.slice(0, idx) + ',</span>';
        }
      } else {
        currentLine++;
        const comma = needsComma ? ',' : '';
        lines.push(`<span class="j-line" data-path="${esc(cp)}" data-ln="${currentLine}">${innerPad}${valSpan(item, cp)}${comma}</span>`);
      }
    }
    return lines;
  }

  function loadNextChunk(sentinel) {
    const path = sentinel.dataset.lazypath || '';
    const indent = parseInt(sentinel.dataset.indent);
    const start = parseInt(sentinel.dataset.start);
    const total = parseInt(sentinel.dataset.total);
    const startLine = parseInt(sentinel.dataset.startline) || 0;
    const end = Math.min(start + CHUNK_SIZE, total);

    const dataRef = window.App._jsonDataRef;
    const actualArr = path ? window.App.path.resolvePath(dataRef, path) : dataRef;
    if (!actualArr || !Array.isArray(actualArr)) { sentinel.remove(); return; }

    // Create chunk container
    const chunk = document.createElement('span');
    chunk.className = 'j-chunk';
    chunk.dataset.chunkpath = path;
    chunk.dataset.chunkindent = indent;
    chunk.dataset.chunkstart = start;
    chunk.dataset.chunkend = end;
    chunk.dataset.chunktotal = total;
    chunk.dataset.chunkstartline = startLine;
    chunk.id = 'jchunk' + (chunkId++);

    const lines = buildChunkLines(actualArr, path, indent, start, end, total, startLine);
    chunk.innerHTML = lines.join('');
    applyFilterToContainer(chunk);

    // Calculate next chunk's start line
    let nextStartLine = startLine;
    for (let i = start; i < end; i++) {
      nextStartLine += countFileLines(actualArr[i]);
    }

    // Insert chunk before sentinel
    sentinel.parentNode.insertBefore(chunk, sentinel);

    // Check if filter hid all lines in this chunk — prevent cascade loading
    const filterActive = !!(_filterMatchedPaths || _filterPathRegex);

    // Update or remove sentinel
    if (end < total) {
      sentinel.dataset.start = end;
      sentinel.dataset.startline = nextStartLine;
      const remaining = total - end;
      const pad = '  '.repeat(indent + 1);
      sentinel.innerHTML = `<span class="j-muted">${pad}// ${remaining} more items below...</span>`;
      // When filter active, scroll handler manages loading — don't re-observe (prevents cascade)
      if (!filterActive) loadObserver.observe(sentinel);
    } else {
      sentinel.remove();
    }

    // Observe for recycling only if part of large array
    if (recycleObserver && total > CHUNK_SIZE) recycleObserver.observe(chunk);
  }

  function makeSentinel(path, indent, start, total, startLine) {
    const remaining = total - start;
    const pad = '  '.repeat(indent + 1);
    return `<span class="j-lazy-sentinel j-line" data-lazypath="${esc(path || '')}" data-indent="${indent}" data-start="${start}" data-total="${total}" data-startline="${startLine}" data-ln=""><span class="j-muted">${pad}// ${remaining} more items below...</span></span>`;
  }

  // --- Inline value editing ---
  function startInlineEdit(valEl) {
    const path = valEl.dataset.path;
    const data = window.App._jsonDataRef;
    if (!path || !data) return;

    const { resolvePath } = window.App.path;
    const currentVal = resolvePath(data, path);

    // Build display value (strip quotes for strings)
    let displayVal;
    if (currentVal === null) displayVal = 'null';
    else if (typeof currentVal === 'string') displayVal = currentVal;
    else displayVal = String(currentVal);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'j-inline-edit';
    input.value = displayVal;
    input.style.cssText = 'font-family:var(--mono);font-size:inherit;padding:0 2px;border:1px solid var(--accent, var(--primary));border-radius:3px;background:var(--bg);color:var(--text);outline:none;min-width:40px;width:' + Math.max(60, valEl.offsetWidth + 20) + 'px;';

    const parent = valEl.parentNode;
    parent.replaceChild(input, valEl);
    input.focus();
    input.select();

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const raw = input.value;
      let newVal;
      if (raw === 'null') newVal = null;
      else if (raw === 'true') newVal = true;
      else if (raw === 'false') newVal = false;
      else if (raw !== '' && !isNaN(Number(raw)) && raw.trim() === raw) newVal = Number(raw);
      else newVal = raw; // string

      // Apply change
      setNestedValue(data, path, newVal);
      // Fire event so app.js can update state
      document.dispatchEvent(new CustomEvent('inline-edit', { detail: { path, value: newVal } }));
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
      if (ev.key === 'Escape') { committed = true; restoreValEl(); }
    });

    function restoreValEl() {
      if (input.parentNode) input.parentNode.replaceChild(valEl, input);
    }
  }

  function setNestedValue(obj, path, value) {
    window.App.path.setNestedValue(obj, path, value);
  }

  // Event delegation: single listeners on the view container handle all clicks.
  // This replaces thousands of per-element listeners with O(1) listeners.
  let delegationBound = false;
  function setupDelegation(view) {
    if (delegationBound) return;
    delegationBound = true;

    let clickScrollTimer = null; // debounce scroll to avoid conflict with dblclick

    view.addEventListener('click', e => {
      // Handle toggle clicks (collapse/expand)
      const tog = e.target.closest('.j-toggle');
      if (tog) { e.stopPropagation(); toggleCollapse(tog); return; }

      // Handle key occurrence highlighting (VS Code style)
      const keyEl = e.target.closest('.j-key');
      if (keyEl) {
        e.stopPropagation();
        highlightKeyOccurrences(view, keyEl);
        const p = keyEl.getAttribute('data-path');
        if (p && onPathSelectCb) {
          // Delay path select (which scrolls) to allow dblclick to cancel it
          clearTimeout(clickScrollTimer);
          clickScrollTimer = setTimeout(() => onPathSelectCb(p), 250);
        }
        return;
      }

      // Clear key highlights when clicking elsewhere
      clearKeyHighlights(view);

      // Handle path element clicks
      const pathEl = e.target.closest('[data-path]');
      if (pathEl) {
        e.stopPropagation();
        const p = pathEl.getAttribute('data-path');
        if (p && onPathSelectCb) {
          clearTimeout(clickScrollTimer);
          clickScrollTimer = setTimeout(() => onPathSelectCb(p), 250);
        }
      }
    });

    // Double-click key → open search with key name
    // Double-click value → inline edit
    view.addEventListener('dblclick', e => {
      // Cancel pending single-click scroll
      clearTimeout(clickScrollTimer);

      const keyEl = e.target.closest('.j-key');
      if (keyEl) {
        e.stopPropagation();
        const keyName = extractKeyName(keyEl);
        if (keyName && window.App.searchForKey) {
          window.App.searchForKey(keyName);
        }
        return;
      }

      // Inline value editing
      const valEl = e.target.closest('.j-str, .j-num, .j-bool, .j-null');
      if (valEl && valEl.dataset.path) {
        e.stopPropagation();
        startInlineEdit(valEl);
      }
    });

    view.addEventListener('contextmenu', e => {
      const pathEl = e.target.closest('[data-path]');
      if (pathEl) {
        e.preventDefault(); e.stopPropagation();
        if (onContextMenuCb) onContextMenuCb(e.clientX, e.clientY, pathEl.getAttribute('data-path'));
      }
    });
  }

  function extractKeyName(keyEl) {
    // Key text is rendered as "keyName" — strip quotes
    const text = keyEl.textContent;
    return text.replace(/^"|"$/g, '');
  }

  function highlightKeyOccurrences(view, clickedKey) {
    clearKeyHighlights(view);
    const keyName = extractKeyName(clickedKey);
    if (!keyName) return;
    const allKeys = view.getElementsByClassName('j-key');
    for (let i = 0; i < allKeys.length; i++) {
      if (extractKeyName(allKeys[i]) === keyName) {
        allKeys[i].classList.add('j-key-hl');
      }
    }
  }

  function clearKeyHighlights(view) {
    const highlighted = view.getElementsByClassName('j-key-hl');
    while (highlighted.length > 0) {
      highlighted[0].classList.remove('j-key-hl');
    }
  }

  function buildLines(obj, path, indent) {
    const lines = [];
    const pad = '  '.repeat(indent);
    if (Array.isArray(obj)) {
      if (obj.length === 0) {
        // Empty array: render inline as [] (1 file line)
        lines.push(ln(`${pad}<span class="j-bracket">[]</span>`, path));
        return lines;
      }
      const id = 'bl' + (lineCounter++);
      lines.push(ln(`${pad}<span class="j-toggle" data-block="${id}">&#9660;</span><span class="j-bracket">[</span><span class="j-ellipsis" data-block="${id}" style="display:none"> ...${obj.length} items ]</span>`, path));
      const chunkStartLine = fileLine; // line number after opening [

      // Render first chunk inline
      const renderCount = Math.min(obj.length, CHUNK_SIZE);
      const chunkHtml = [];
      for (let i = 0; i < renderCount; i++) {
        const item = obj[i];
        const cp = path ? `${path}[${i}]` : `[${i}]`;
        if (item && typeof item === 'object') {
          const sub = buildLines(item, cp, indent + 1);
          for (let s = 0; s < sub.length; s++) chunkHtml.push(sub[s]);
          if (i < obj.length - 1 && chunkHtml.length) {
            const last = chunkHtml[chunkHtml.length - 1];
            const idx = last.lastIndexOf('</span>');
            if (idx !== -1) chunkHtml[chunkHtml.length - 1] = last.slice(0, idx) + ',</span>';
          }
        } else {
          const comma = i < obj.length - 1 ? ',' : '';
          chunkHtml.push(ln(`${'  '.repeat(indent + 1)}${valSpan(item, cp)}${comma}`, cp));
        }
      }

      // Wrap first chunk in recyclable container
      const cid = 'jchunk' + (chunkId++);
      let blockContent = `<span class="j-chunk" id="${cid}" data-chunkpath="${esc(path || '')}" data-chunkindent="${indent}" data-chunkstart="0" data-chunkend="${renderCount}" data-chunktotal="${obj.length}" data-chunkstartline="${chunkStartLine}">${chunkHtml.join('')}</span>`;

      // Sentinel for remaining items - skip file lines for unloaded items
      if (obj.length > CHUNK_SIZE) {
        let skippedLines = 0;
        for (let i = CHUNK_SIZE; i < obj.length; i++) {
          skippedLines += countFileLines(obj[i]);
        }
        const sentinelStartLine = fileLine;
        fileLine += skippedLines; // advance file line counter past unloaded content
        blockContent += makeSentinel(path, indent, CHUNK_SIZE, obj.length, sentinelStartLine);
      }

      lines.push(`<span class="j-block" data-block="${id}">${blockContent}</span>`);
      lines.push(`<span class="j-line j-close" data-path="${esc(path)}" data-close="${id}" data-ln="${++fileLine}">${pad}<span class="j-bracket">]</span></span>`);
    } else if (obj && typeof obj === 'object') {
      const keys = Object.keys(obj);
      const kLen = keys.length;
      if (kLen === 0) {
        // Empty object: render inline as {} (1 file line)
        lines.push(ln(`${pad}<span class="j-bracket">{}</span>`, path));
        return lines;
      }
      const id = 'bl' + (lineCounter++);
      lines.push(ln(`${pad}<span class="j-toggle" data-block="${id}">&#9660;</span><span class="j-bracket">{</span><span class="j-ellipsis" data-block="${id}" style="display:none"> ...${kLen} keys }</span>`, path));
      const inner = [];
      const innerPad = '  '.repeat(indent + 1);
      for (let i = 0; i < kLen; i++) {
        const key = keys[i];
        const needsBracket = /[.\[\]]/.test(key);
        const cp = path 
          ? (needsBracket ? `${path}["${key}"]` : `${path}.${key}`) 
          : (needsBracket ? `["${key}"]` : key);
        const comma = i < kLen - 1 ? ',' : '';
        const value = obj[key];
        if (value && typeof value === 'object') {
          const keyStr = `${innerPad}<span class="j-key" data-path="${esc(cp)}">"${esc(key)}"</span>: `;
          const sub = buildLines(value, cp, indent + 1);
          if (sub.length > 0) {
            const first = sub[0].replace(/^<span class="j-line"[^>]*>(\s*)/, '');
            sub[0] = `<span class="j-line" data-path="${esc(cp)}" data-ln="${sub[0].match(/data-ln="(\d+)"/)[1]}">${keyStr}${first}`;
            for (let s = 0; s < sub.length; s++) inner.push(sub[s]);
            if (comma && inner.length) {
              const last = inner[inner.length - 1];
              const idx = last.lastIndexOf('</span>');
              if (idx !== -1) inner[inner.length - 1] = last.slice(0, idx) + comma + '</span>';
            }
          }
        } else {
          inner.push(ln(`${innerPad}<span class="j-key" data-path="${esc(cp)}">"${esc(key)}"</span>: ${valSpan(value, cp)}${comma}`, cp));
        }
      }
      lines.push(`<span class="j-block" data-block="${id}">${inner.join('')}</span>`);
      lines.push(`<span class="j-line j-close" data-path="${esc(path)}" data-close="${id}" data-ln="${++fileLine}">${pad}<span class="j-bracket">}</span></span>`);
    } else {
      lines.push(ln(pad + valSpan(obj, path), path));
    }
    return lines;
  }

  function ln(content, path) { return `<span class="j-line" data-path="${esc(path)}" data-ln="${++fileLine}">${content}</span>`; }

  function valSpan(val, path) {
    const chip = window.App.contentPreview ? window.App.contentPreview.getChip(val) : '';
    if (val === null) return `<span class="j-null" data-path="${esc(path)}">null</span>`;
    if (typeof val === 'string') { const escaped = esc(val.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/\r/g,'\\r').replace(/\t/g,'\\t')).replace(/\\[nrt\\]/g, m => `<span class="j-esc">${m}</span>`); return `<span class="j-str" data-path="${esc(path)}">&quot;${escaped}&quot;</span>${chip}`; }
    if (typeof val === 'number') return `<span class="j-num" data-path="${esc(path)}">${val}</span>${chip}`;
    if (typeof val === 'boolean') return `<span class="j-bool" data-path="${esc(path)}">${val}</span>`;
    return `<span data-path="${esc(path)}">${esc(String(val))}</span>`;
  }

  // Collapse/Expand
  function toggleCollapse(tog) {
    const blockId = tog.dataset.block;
    // Use nextElementSibling chain from toggle's parent line to find block/ellipsis
    // The structure is: <j-line> [toggle] [bracket] [ellipsis] </j-line> <j-block> ...
    // Both ellipsis and block share data-block attribute
    const parentLine = tog.closest('.j-line');
    let ellipsis = null, block = null;
    if (parentLine) {
      // Ellipsis is a sibling within the same line
      ellipsis = parentLine.querySelector(`.j-ellipsis[data-block="${blockId}"]`);
      // Block is the next sibling element after the line
      const next = parentLine.nextElementSibling;
      if (next && next.classList.contains('j-block') && next.dataset.block === blockId) {
        block = next;
      }
    }
    // Fallback to full querySelector if sibling traversal failed (e.g. nested differently)
    if (!block) block = $('jsonView').querySelector(`.j-block[data-block="${blockId}"]`);
    if (!ellipsis) ellipsis = $('jsonView').querySelector(`.j-ellipsis[data-block="${blockId}"]`);
    if (!block) return;
    const collapsed = block.style.display === 'none';
    block.style.display = collapsed ? '' : 'none';
    if (ellipsis) ellipsis.style.display = collapsed ? 'none' : 'inline';
    tog.textContent = collapsed ? '\u25BC' : '\u25B6';
    // Toggle closing bracket line
    const closeLine = block.nextElementSibling;
    if (closeLine && closeLine.dataset.close === blockId) {
      closeLine.style.display = collapsed ? '' : 'none';
    }
  }

  async function expandAll() {
    showLoading('Expanding all…');
    await new Promise(r => setTimeout(r, 0));
    const view = $('jsonView');
    view.classList.remove('all-collapsed');
    const walker = document.createTreeWalker(view, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        const cl = node.classList;
        if (cl.contains('j-block') || cl.contains('j-ellipsis') || cl.contains('j-toggle') || cl.contains('j-close')) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_SKIP;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      if (node.classList.contains('j-block')) node.style.display = '';
      else if (node.classList.contains('j-ellipsis')) node.style.display = 'none';
      else if (node.classList.contains('j-toggle')) node.textContent = '\u25BC';
      else if (node.classList.contains('j-close')) node.style.display = '';
    }
    hideLoading();
  }

  async function collapseAll() {
    showLoading('Collapsing all…');
    await new Promise(r => setTimeout(r, 0));
    const view = $('jsonView');
    const walker = document.createTreeWalker(view, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        const cl = node.classList;
        if (cl.contains('j-block') || cl.contains('j-ellipsis') || cl.contains('j-toggle') || cl.contains('j-close')) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_SKIP;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      if (node.classList.contains('j-block')) node.style.display = 'none';
      else if (node.classList.contains('j-ellipsis')) node.style.display = 'inline';
      else if (node.classList.contains('j-toggle')) node.textContent = '\u25B6';
      else if (node.classList.contains('j-close')) node.style.display = 'none';
    }
    hideLoading();
  }

  async function collapseToDepth(maxDepth) {
    showLoading('Collapsing…');
    await new Promise(r => setTimeout(r, 0));
    const view = $('jsonView');
    view.classList.remove('all-collapsed');
    const blocks = view.getElementsByClassName('j-block');
    const blockMap = Object.create(null);
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.dataset.block) blockMap[b.dataset.block] = b;
    }
    const ellipses = view.getElementsByClassName('j-ellipsis');
    const ellMap = Object.create(null);
    for (let i = 0; i < ellipses.length; i++) {
      const e = ellipses[i];
      if (e.dataset.block) ellMap[e.dataset.block] = e;
    }
    const closes = view.getElementsByClassName('j-close');
    const closeMap = Object.create(null);
    for (let i = 0; i < closes.length; i++) {
      const c = closes[i];
      if (c.dataset.close) closeMap[c.dataset.close] = c;
    }
    const toggles = view.getElementsByClassName('j-toggle');
    for (let i = 0; i < toggles.length; i++) {
      const tog = toggles[i];
      const depth = getDepth(tog);
      const shouldCollapse = depth >= maxDepth;
      const blockId = tog.dataset.block;
      const block = blockMap[blockId];
      const ellipsis = ellMap[blockId];
      const closeLine = closeMap[blockId];
      if (block) block.style.display = shouldCollapse ? 'none' : '';
      if (ellipsis) ellipsis.style.display = shouldCollapse ? 'inline' : 'none';
      if (closeLine) closeLine.style.display = shouldCollapse ? 'none' : '';
      tog.textContent = shouldCollapse ? '\u25B6' : '\u25BC';
    }
    hideLoading();
  }

  function getDepth(el) {
    let depth = 0; let node = el;
    while (node && node !== $('jsonView')) {
      if (node.classList && node.classList.contains('j-block')) depth++;
      node = node.parentElement;
    }
    return depth;
  }

  function expandParents(el, container) {
    let node = el.parentElement;
    while (node && node !== container) {
      if (node.classList.contains('j-block') && node.style.display === 'none') {
        node.style.display = '';
        const blockId = node.dataset.block;
        if (blockId) {
          const toggle = container.querySelector(`.j-toggle[data-block="${blockId}"]`);
          if (toggle) toggle.innerHTML = '&#9660;';
          const ellipsis = container.querySelector(`.j-ellipsis[data-block="${blockId}"]`);
          if (ellipsis) ellipsis.style.display = 'none';
          const closeLine = container.querySelector(`.j-close[data-close="${blockId}"]`);
          if (closeLine) closeLine.style.display = '';
        }
      }
      node = node.parentElement;
    }
  }

  let highlightedEl = null; // Cache highlighted element to avoid full DOM scan
  function highlightPath(path) {
    if (highlightedEl) { highlightedEl.classList.remove('highlighted'); highlightedEl = null; }
    if (!path) return;
    const view = $('jsonView');
    const match = view.querySelector(`.j-line[data-path="${CSS.escape(path)}"]`);
    if (match) {
      match.classList.add('highlighted');
      highlightedEl = match;
      expandParents(match, view);
      // Reliable scroll within the json-view container
      match.offsetHeight; // force reflow
      const matchRect = match.getBoundingClientRect();
      const containerRect = view.getBoundingClientRect();
      const offsetTop = matchRect.top - containerRect.top + view.scrollTop;
      const targetScroll = offsetTop - view.clientHeight / 2 + matchRect.height / 2;
      view.scrollTo({ top: targetScroll, behavior: 'instant' });
    }
  }

  let bookmarkedEls = []; // Cache bookmarked elements
  function updateBookmarkHighlights(bookmarks) {
    for (let i = 0; i < bookmarkedEls.length; i++) bookmarkedEls[i].classList.remove('bookmarked');
    bookmarkedEls = [];
    for (const b of bookmarks) {
      const el = $('jsonView').querySelector(`.j-line[data-path="${CSS.escape(b)}"]`);
      if (el) { el.classList.add('bookmarked'); bookmarkedEls.push(el); }
    }
  }

  function highlightKeyByName(keyName) {
    const view = $('jsonView');
    clearKeyHighlights(view);
    if (!keyName) return;
    const allKeys = view.getElementsByClassName('j-key');
    for (let i = 0; i < allKeys.length; i++) {
      if (extractKeyName(allKeys[i]) === keyName) {
        allKeys[i].classList.add('j-key-hl');
      }
    }
    // Scroll to first occurrence
    const first = view.querySelector('.j-key-hl');
    if (first) first.scrollIntoView({ behavior: 'instant', block: 'center' });
  }

  /** Render JSON tree into an arbitrary container (for split view). Read-only, no callbacks. */
  function renderInto(container, data) {
    const savedLine = lineCounter;
    const savedFile = fileLine;
    const savedChunk = chunkId;
    lineCounter = 0; fileLine = 0; chunkId = 0;
    container.innerHTML = buildLines(data, '', 0).join('');
    setupDelegation(container);
    setupObservers(container);
    lineCounter = savedLine; fileLine = savedFile; chunkId = savedChunk;
  }

  // --- Filter state management (persists across chunk recycle/rehydrate) ---

  /** Apply current filter state to lines inside a container (chunk or full view) */
  function applyFilterToContainer(container) {
    if (!_filterMatchedPaths && !_filterPathRegex) return;

    // Detach container from DOM to avoid layout thrashing during bulk class changes
    const parent = container.parentNode;
    const next = container.nextSibling;
    if (parent) parent.removeChild(container);

    const lines = container.getElementsByClassName('j-line');
    for (let i = 0; i < lines.length; i++) {
      const el = lines[i];
      if (el.classList.contains('j-lazy-sentinel')) {
        // Don't use filter-hidden (display:none) — sentinel must stay in layout for IntersectionObserver
        el.style.visibility = 'hidden';
        el.style.height = '1px';
        el.style.overflow = 'hidden';
        continue;
      }
      const dp = el.getAttribute('data-path') || '';

      if (_filterPathRegex) {
        if (_filterPathRegex.test(dp)) { el.classList.remove('filter-hidden'); }
        else { el.classList.add('filter-hidden'); }
      } else if (_filterMatchedPaths) {
        const match = isAncestorMatched(dp);
        if (match) {
          el.classList.remove('filter-hidden');
          if (_filterMatchedPaths.has(dp)) {
            el.querySelectorAll('.j-str, .j-num, .j-bool, .j-null').forEach(vs => vs.classList.add('filter-match'));
          }
        } else {
          el.classList.add('filter-hidden');
        }
      }
    }

    // Re-attach container — single reflow
    if (parent) {
      if (next) parent.insertBefore(container, next);
      else parent.appendChild(container);
    }
  }

  /** Check if dp or any ancestor is in _filterMatchedPaths — O(depth) not O(matchedPaths) */
  function isAncestorMatched(dp) {
    if (_filterMatchedPaths.has('')) return true;
    if (_filterMatchedPaths.has(dp)) return true;
    // Walk up the path: [0].address.street → [0].address → [0]
    let p = dp;
    while (p) {
      const lastDot = p.lastIndexOf('.');
      const lastBracket = p.lastIndexOf('[');
      const cut = Math.max(lastDot, lastBracket);
      if (cut <= 0) break;
      p = p.substring(0, cut);
      if (_filterMatchedPaths.has(p)) return true;
    }
    return false;
  }

  /** Set filter highlight state with matched paths — persists across chunk recycle/rehydrate */
  async function setHighlight(matchedPaths) {
    _filterMatchedPaths = matchedPaths;
    _filterPathRegex = null;
    if (loadObserver) loadObserver.disconnect();
    const view = $('jsonView');
    if (view) {
      showLoading('Applying filter…');
      await new Promise(r => setTimeout(r, 0));
      applyFilterToContainer(view);
      _installFilterScrollLoader(view);
      _fillViewport(view, true);
    }
  }

  /** Set filter highlight state with path regex — persists across chunk recycle/rehydrate */
  async function setHighlightByRegex(regex) {
    _filterPathRegex = regex;
    _filterMatchedPaths = null;
    if (loadObserver) loadObserver.disconnect();
    const view = $('jsonView');
    if (view) {
      showLoading('Applying filter…');
      await new Promise(r => setTimeout(r, 0));
      applyFilterToContainer(view);
      _installFilterScrollLoader(view);
      _fillViewport(view, true);
    }
  }

  /** Load chunks until viewport is filled with visible content (or no more data) */
  function _fillViewport(view, dismissSpinner) {
    // Skip if view is hidden (e.g. table view is active) — clientHeight is 0
    if (!view.clientHeight) { if (dismissSpinner) hideLoading(); return; }
    const maxIterations = 200;
    let iterations = 0;
    const doFill = () => {
      if (iterations++ >= maxIterations) { if (dismissSpinner) hideLoading(); return; }
      const sentinel = view.querySelector('.j-lazy-sentinel');
      if (!sentinel) { if (dismissSpinner) hideLoading(); return; }
      if (view.scrollHeight > view.clientHeight + 100) { if (dismissSpinner) hideLoading(); return; }
      loadNextChunk(sentinel);
      requestAnimationFrame(doFill);
    };
    requestAnimationFrame(doFill);
  }

  /** Scroll-based chunk loader — loads chunks when user scrolls near bottom (prevents cascade) */
  function _installFilterScrollLoader(view) {
    _removeFilterScrollLoader(view);
    let loading = false;
    _filterScrollHandler = () => {
      if (loading) return;
      const sentinel = view.querySelector('.j-lazy-sentinel');
      if (!sentinel) return;
      const remaining = view.scrollHeight - view.scrollTop - view.clientHeight;
      if (remaining < 600) {
        loading = true;
        showLoading('Loading more\u2026');
        let chunksLoaded = 0;
        const maxChunksPerScroll = 30;
        const doLoad = () => {
          const s = view.querySelector('.j-lazy-sentinel');
          if (!s || chunksLoaded >= maxChunksPerScroll) { loading = false; hideLoading(); return; }
          const rem = view.scrollHeight - view.scrollTop - view.clientHeight;
          if (rem > 400 && chunksLoaded > 0) { loading = false; hideLoading(); return; }
          loadNextChunk(s);
          chunksLoaded++;
          requestAnimationFrame(doLoad);
        };
        requestAnimationFrame(doLoad);
      }
    };
    view.addEventListener('scroll', _filterScrollHandler, { passive: true });
  }

  function _removeFilterScrollLoader(view) {
    if (_filterScrollHandler && view) {
      view.removeEventListener('scroll', _filterScrollHandler);
      _filterScrollHandler = null;
    }
  }

  /** Clear filter state */
  async function clearHighlight() {
    _filterMatchedPaths = null;
    _filterPathRegex = null;
    const view = $('jsonView');
    _removeFilterScrollLoader(view);
    if (view) {
      showLoading('Clearing filter…');
      await new Promise(r => setTimeout(r, 0));
      const parent = view.parentNode;
      const next = view.nextSibling;
      if (parent) parent.removeChild(view);

      view.querySelectorAll('.filter-hidden').forEach(el => el.classList.remove('filter-hidden'));
      view.querySelectorAll('.filter-match').forEach(el => el.classList.remove('filter-match'));
      // Restore sentinel visibility
      view.querySelectorAll('.j-lazy-sentinel').forEach(s => {
        s.style.visibility = '';
        s.style.height = '';
        s.style.overflow = '';
      });

      if (parent) {
        if (next) parent.insertBefore(view, next);
        else parent.appendChild(view);
      }
      // Re-observe sentinels now that filter is cleared (restore normal IO-based loading)
      if (loadObserver) {
        view.querySelectorAll('.j-lazy-sentinel').forEach(s => loadObserver.observe(s));
      }
      hideLoading();
    }
  }

  return { render, renderInto, expandAll, collapseAll, collapseToDepth, highlightPath, updateBookmarkHighlights, highlightKeyByName, expandParents, setHighlight, clearHighlight, setHighlightByRegex };
})();
