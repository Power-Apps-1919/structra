/**
 * JSON Path Explorer - Main Application Entry Point
 * Wires together all modules and manages application state.
 */
window.App = window.App || {};
(() => {
  const { $, toast, esc, escCode, copyAndToast, showLoading, hideLoading } = window.App.dom;
  const { tokenizePath, resolvePath, buildPAPath, buildFxPathFull } = window.App.path;
  const { findAllArrays } = window.App.traverse;
  const { collectAllPaths, renderStats } = window.App.stats;
  const { render: renderJsonView, expandAll, collapseAll, collapseToDepth, highlightPath, updateBookmarkHighlights, highlightKeyByName, expandParents } = window.App.jsonView;
  const { renderSchema, renderDiff } = window.App.views;
  const { generate: generatePA } = window.App.expressionsPA;
  const { generate: generateFx } = window.App.expressionsFx;
  const { render: renderHelpers } = window.App.helpers;
  const { render: renderParseJsonSchema, init: initSchemaGen } = window.App.schemaGen;

  // === STATE ===
  let jsonData = null;
  let rawJsonText = '';
  let fileName = '';
  let pathHistory = [];
  let historyIndex = -1;
  let bookmarks = [];
  let currentView = 'json';
  let allPaths = [];
  let focusedLineIdx = -1;

  // === WEB WORKER for JSON parsing (offloads main thread) ===
  let jsonWorker = null;
  let jsonWorkerReqId = 0;
  function initWorker() {
    try {
      jsonWorker = new Worker('src/workers/json-parser.js?v='+Date.now());
    } catch (e) {
      jsonWorker = null; // Fallback to sync parse if worker fails
    }
  }
  initWorker();

  function parseJsonAsync(text) {
    return new Promise((resolve, reject) => {
      if (!jsonWorker) {
        // Fallback: sync parse
        try { resolve(JSON.parse(text)); } catch (e) { reject(e); }
        return;
      }
      const id = ++jsonWorkerReqId;
      const handler = (e) => {
        if (e.data.id !== id) return;
        jsonWorker.removeEventListener('message', handler);
        if (e.data.success) resolve(e.data.data);
        else reject(new Error(e.data.error));
      };
      jsonWorker.addEventListener('message', handler);
      // For large strings (>1MB), use Transferable ArrayBuffer to avoid structured clone of string
      if (text.length > 1048576) {
        const encoder = new TextEncoder();
        const buffer = encoder.encode(text).buffer;
        jsonWorker.postMessage({ id, buffer }, [buffer]);
      } else {
        jsonWorker.postMessage({ id, text });
      }
    });
  }

  // === INIT ===
  document.querySelectorAll('.acc-header').forEach(h => h.addEventListener('click', () => h.parentElement.classList.toggle('open')));
  initSchemaGen();

  // Delegated click-to-copy for .ecode elements in resultBody (avoids per-evaluate listener accumulation)
  $('resultBody').addEventListener('click', e => {
    const ecode = e.target.closest('.ecode');
    if (ecode) { copyAndToast(ecode.textContent.replace(/^(Power Automate:|Canvas App \(Power Fx\):)\s*/, ''), 'Copied!'); }
  });

  // === INPUT HANDLING (delegated to input-handler module) ===
  window.App.inputHandler.init({
    parseJsonAsync,
    onJsonLoaded(data, text, name) {
      jsonData = data;
      rawJsonText = text;
      fileName = name;
      startExplorer();
    }
  });

  // === START ===
  // Cooperative yielding helper: uses scheduler.yield() if available, else setTimeout(0)
  function yieldToMain() {
    if (globalThis.scheduler && globalThis.scheduler.yield) {
      return scheduler.yield();
    }
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  async function startExplorer() {
    showLoading('Rendering JSON…');
    $('inputOverlay').classList.add('hidden');
    pathHistory = []; historyIndex = -1; bookmarks = [];
    window.App._jsonDataRef = jsonData; // Expose for lazy tree rendering
    $('docMeta').textContent = fileName;
    $('pathInput').value = '';
    $('resultBody').innerHTML = '<div class="no-result">Click any element in the JSON or type a path above</div>';
    $('ep-automate').innerHTML = '<div class="no-result">Select a path to see expressions</div>';
    $('ep-canvas').innerHTML = '<div class="no-result">Select a path to see expressions</div>';
    $('resultBadge').textContent = '';
    updateHistoryBtns();
    renderBookmarks();
    if (window.App.jsonEditor.isActive()) window.App.jsonEditor.exit();
    switchView('json');

    // Yield to let UI paint the overlay removal first
    await yieldToMain();

    // Critical path: render JSON view first (user sees it)
    allPaths = collectAllPaths(jsonData);
    buildPathIndex();
    renderJsonView(jsonData, onPathSelect, showContextMenu);

    // Push initial state to undo stack
    if (window.App.undoStack) {
      window.App.undoStack.clear();
      window.App.undoStack.push(jsonData, 'Initial load');
    }

    // Sync multi-tab
    if (window.App.multiTab) {
      window.App.multiTab.setActiveData(jsonData, rawJsonText, fileName);
      window.App.multiTab.saveSession();
    }

    // Yield before non-critical work (stats, helpers, schema)
    await yieldToMain();

    $('gLoadingMsg').textContent = 'Calculating stats\u2026';
    renderStats(jsonData, evaluatePath);
    renderHelpers(jsonData);
    renderParseJsonSchema(jsonData);

    // Save to recent history
    if (window.App.storage) {
      window.App.storage.addRecent(fileName, jsonData);
    }

    // Duplicate key detection
    if (rawJsonText && window.App.jsonLint) {
      const dupes = window.App.jsonLint.detectDuplicateKeys(rawJsonText);
      if (dupes.length > 0) {
        toast(`⚠️ ${dupes.length} duplicate key${dupes.length > 1 ? 's' : ''} found`);
        const metaEl = $('docMeta');
        metaEl.innerHTML = `${esc(fileName)} <span class="dupe-badge" title="${dupes.map(d => d.key + ' (line ' + d.line + ')').join(', ')}">⚠ ${dupes.length} duplicate${dupes.length > 1 ? 's' : ''}</span>`;
      }
    }

    // Auto-open universal filter
    if (window.App.universalFilter && !window.App.universalFilter.isActive()) {
      window.App.universalFilter.open();
    }
    hideLoading();
  }

  function onPathSelect(path) {
    $('pathInput').value = path;
    evaluatePath(path);
  }

  // === VIEW SWITCHING ===
  function switchView(view) {
    currentView = view;
    // Exit edit mode if switching away
    const edActive = window.App.jsonEditor.isActive();
    if (view !== 'json' && edActive) window.App.jsonEditor.exit();
    $('jsonView').classList.toggle('hidden', view !== 'json' || edActive);
    $('jsonEditor').classList.toggle('hidden', !edActive || view !== 'json');
    $('simpleTableView').classList.toggle('show', view === 'table');
    $('schemaView').classList.toggle('show', view === 'schema');
    $('graphView').classList.toggle('show', view === 'graph');
    $('btnTable').classList.toggle('active', view === 'table');
    $('btnSchema').classList.toggle('active', view === 'schema');
    $('btnGraph').classList.toggle('active', view === 'graph');
    // Hide tree-only controls when not in JSON view
    const hideTreeControls = view !== 'json';
    $('treeZoomGroup').style.display = hideTreeControls ? 'none' : '';
    $('treeZoomSep').style.display = hideTreeControls ? 'none' : '';
    $('btnExpandAll').style.display = hideTreeControls ? 'none' : '';
    $('btnCollapseAll').style.display = hideTreeControls ? 'none' : '';
    $('btnDepth1').style.display = hideTreeControls ? 'none' : '';
    $('btnDepth2').style.display = hideTreeControls ? 'none' : '';
    $('btnDepth3').style.display = hideTreeControls ? 'none' : '';
    $('btnWrap').style.display = hideTreeControls ? 'none' : '';
    $('btnEdit').style.display = hideTreeControls ? 'none' : '';
  }

  // === PATH EVALUATION (debounced for performance) ===
  let pathDebounceTimer = 0;
  $('pathInput').addEventListener('input', () => {
    clearTimeout(pathDebounceTimer);
    pathDebounceTimer = setTimeout(() => {
      const val = $('pathInput').value.trim();
      evaluatePath(val);
    }, 120);
  });
  $('pathInput').addEventListener('keydown', e => {
    if (pathAc.isVisible()) return; // let autocomplete handle arrows/enter/escape
    if (e.key === 'Enter') evaluatePath($('pathInput').value.trim());
  });

  // === AUTOCOMPLETE (reusable module) ===
  function buildPathIndex() {
    window.App._allPaths = allPaths;
    if (pathAc) pathAc.rebuildIndex();
  }

  const pathAc = window.App.autocomplete.attach($('pathInput'), {
    getItems: () => allPaths.map(p => ({ text: p.path, type: p.type })),
    onSelect: (item) => evaluatePath(item.text),
    maxResults: 15,
    matchMode: 'prefix'
  });

  function evaluatePath(path) {
    highlightPath(''); // clear
    if (!path) {
      $('resultBody').innerHTML = '<div class="no-result">Type or click a path</div>';
      $('resultBadge').textContent = ''; clearExpressions(); updateBreadcrumb(''); return;
    }

    const result = resolvePath(jsonData, path);
    highlightPath(path);
    updateBreadcrumb(path);

    // History
    if (historyIndex < 0 || pathHistory[historyIndex] !== path) {
      pathHistory = pathHistory.slice(0, historyIndex + 1);
      pathHistory.push(path);
      historyIndex = pathHistory.length - 1;
      updateHistoryBtns();
    }

    if (result === undefined) {
      $('resultBody').innerHTML = '<div class="no-result">No match for this path</div>';
      $('resultBadge').textContent = '✗'; clearExpressions();
    } else {
      const type = Array.isArray(result) ? `array[${result.length}]` : typeof result;
      $('resultBadge').textContent = type;
      const paAccess = buildPAPath(path);
      const fxAccess = buildFxPathFull(tokenizePath(path));
      let html = '';
      html += `<div class="res-section"><div class="res-label">&#128204; Path</div>`;
      html += `<div class="ecode res-ecode-path">${esc(path)}</div></div>`;
      html += `<div class="res-section"><div class="res-label">&#9889; Access</div>`;
      html += `<div class="res-access-row">`;
      html += `<div class="ecode res-ecode-sm" title="Power Automate"><span class="res-ecode-lbl">Power Automate:</span>${esc(paAccess)}</div>`;
      html += `<div class="ecode res-ecode-sm" title="Canvas App"><span class="res-ecode-lbl">Canvas App (Power Fx):</span>${esc(fxAccess)}</div>`;
      html += `</div></div>`;
      html += `<div class="result-type">Type: <span class="badge">${type}</span>`;
      if (Array.isArray(result)) html += ` &bull; Items: <strong>${result.length}</strong>`;
      html += `</div>`;
      html += `<div class="res-label">&#128196; Value</div>`;
      html += `<div class="result-code" id="resultValueContainer"></div>`;
      $('resultBody').innerHTML = html;
      // Render value asynchronously to keep UI responsive
      const valueContainer = $('resultValueContainer');
      if (valueContainer) {
        setTimeout(() => {
          const jsonStr = JSON.stringify(result, null, 2);
          if (jsonStr.length > 500000) {
            // For very large values, use textarea for better browser performance
            const ta = document.createElement('textarea');
            ta.readOnly = true;
            ta.className = 'result-code-textarea';
            ta.value = jsonStr;
            valueContainer.appendChild(ta);
          } else {
            valueContainer.textContent = jsonStr;
          }
        }, 0);
      }
      $('accResult').classList.add('open');
      $('accExpr').classList.add('open');
      generateExpressions(path, result);
    }
  }

  // Expression click-to-copy: single delegated listener (avoids accumulating per-element listeners)
  const exprBody = $('exprBody');
  if (exprBody) {
    exprBody.addEventListener('click', e => {
      const ecode = e.target.closest('.ecode');
      if (ecode) { copyAndToast(ecode.textContent, 'Copied!'); }
    });
  }
  function generateExpressions(path, value) {
    $('ep-automate').innerHTML = generatePA(path, value);
    $('ep-canvas').innerHTML = generateFx(path, value);
  }

  function clearExpressions() {
    $('ep-automate').innerHTML = '<div class="no-result">Select a path</div>';
    $('ep-canvas').innerHTML = '<div class="no-result">Select a path</div>';
  }

  // === BREADCRUMB (uses event delegation — single listener, no per-segment binding) ===
  $('breadcrumb').addEventListener('click', e => {
    const seg = e.target.closest('.bc-seg');
    if (!seg) return;
    const p = seg.dataset.bcpath;
    $('pathInput').value = p;
    evaluatePath(p);
  });
  function updateBreadcrumb(path) {
    const bar = $('breadcrumb');
    if (!path) { bar.classList.remove('show'); return; }
    bar.classList.add('show');
    const tokens = tokenizePath(path);
    let html = `<span class="bc-seg" data-bcpath="">root</span>`;
    let running = '';
    for (const t of tokens) {
      if (t.type === 'key') {
        running += (running ? '.' : '') + t.value;
        html += `<span class="bc-sep">›</span><span class="bc-seg" data-bcpath="${esc(running)}">${esc(t.value)}</span>`;
      } else if (t.type === 'wildcard') {
        running += `[*]`;
        html += `<span class="bc-sep">›</span><span class="bc-seg bc-wild" data-bcpath="${esc(running)}">[*]</span>`;
      } else {
        running += `[${t.value}]`;
        html += `<span class="bc-sep">›</span><span class="bc-seg" data-bcpath="${esc(running)}">[${t.value}]</span>`;
      }
    }
    bar.innerHTML = html;
  }

  // === HISTORY ===
  $('btnBack').addEventListener('click', () => { if (historyIndex > 0) { historyIndex--; const p = pathHistory[historyIndex]; $('pathInput').value = p; evaluatePath(p); updateHistoryBtns(); } });
  $('btnForward').addEventListener('click', () => { if (historyIndex < pathHistory.length - 1) { historyIndex++; const p = pathHistory[historyIndex]; $('pathInput').value = p; evaluatePath(p); updateHistoryBtns(); } });
  function updateHistoryBtns() { $('btnBack').disabled = historyIndex <= 0; $('btnForward').disabled = historyIndex >= pathHistory.length - 1; }

  // === BOOKMARKS ===
  $('btnBookmark').addEventListener('click', () => {
    const path = $('pathInput').value.trim();
    if (!path) return;
    if (bookmarks.includes(path)) { bookmarks = bookmarks.filter(b => b !== path); }
    else { bookmarks.push(path); }
    renderBookmarks();
    updateBookmarkHighlights(bookmarks);
    toast(bookmarks.includes(path) ? 'Bookmarked!' : 'Removed bookmark');
  });

  // Bookmark list delegation (single listener, no per-item binding)
  $('bookmarksBody').addEventListener('click', e => {
    const bmPath = e.target.closest('.bm-path');
    if (bmPath) { $('pathInput').value = bmPath.dataset.bmpath; evaluatePath(bmPath.dataset.bmpath); return; }
    const bmDel = e.target.closest('.bm-del');
    if (bmDel) { bookmarks = bookmarks.filter(b => b !== bmDel.dataset.bmdel); renderBookmarks(); updateBookmarkHighlights(bookmarks); }
  });
  function renderBookmarks() {
    if (bookmarks.length === 0) { $('bookmarksBody').innerHTML = '<div class="no-result">No bookmarks yet. Click &#11088; to add.</div>'; return; }
    let html = '';
    for (const b of bookmarks) {
      html += `<div class="bookmark-item"><span class="bm-path" data-bmpath="${esc(b)}">${esc(b)}</span><span class="bm-del" data-bmdel="${esc(b)}">&#10005;</span></div>`;
    }
    $('bookmarksBody').innerHTML = html;
  }

  // === SEARCH (delegated to search module) ===
  const { toggleSearch, performSearch, performSearchNow, performSearchExactKey,
          navigate: navigateSearch, clearHighlights: clearSearchHighlights, getSearchParams } = window.App.search;

  $('btnSearch').addEventListener('click', toggleSearch);
  $('searchClose').addEventListener('click', () => { $('searchBar').classList.remove('show'); clearSearchHighlights(); });
  $('searchInput').addEventListener('input', performSearch);
  $('searchPrev').addEventListener('click', () => navigateSearch(-1));
  $('searchNext').addEventListener('click', () => navigateSearch(1));

  // Toggle replace row
  $('searchToggleReplace').addEventListener('click', () => {
    $('replaceRow').classList.toggle('show');
  });

  // Replace one occurrence
  $('replaceOne').addEventListener('click', () => {
    if (!jsonData) return;
    const { search, regex } = getSearchParams();
    if (!search) return;
    const replacement = $('replaceInput').value;
    const opts = { keys: $('searchKeys').checked, values: true };
    // Replace only first match — use non-global regex
    const singleSearch = regex ? new RegExp(regex.source, regex.flags.replace('g', '')) : search;
    const { result, count } = window.App.jsonOps.searchReplace(jsonData, singleSearch, replacement, opts);
    if (count > 0) {
      jsonData = result;
      toast(`Replaced 1 occurrence`);
      renderJsonView(jsonData, onPathSelect, showContextMenu);
      performSearchNow();
    } else {
      toast('No match found');
    }
  });

  // Replace all
  $('replaceAll').addEventListener('click', () => {
    if (!jsonData) return;
    const { search, regex } = getSearchParams();
    if (!search) return;
    const replacement = $('replaceInput').value;
    const opts = { keys: $('searchKeys').checked, values: true };
    const { result, count } = window.App.jsonOps.searchReplace(jsonData, regex || search, replacement, opts);
    if (count > 0) {
      jsonData = result;
      toast(`Replaced ${count} occurrence${count > 1 ? 's' : ''}`);
      renderJsonView(jsonData, onPathSelect, showContextMenu);
      performSearchNow();
    } else {
      toast('No matches found');
    }
  });

  // Expose searchForKey for double-click key → find (exact key match)
  window.App.searchForKey = function(keyName) {
    const bar = $('searchBar');
    if (!bar.classList.contains('show')) bar.classList.add('show');
    $('searchInput').value = '"' + keyName + '"';
    $('searchInput').focus();
    performSearchExactKey(keyName);
  };

  // Expose highlightKeyInView for stats panel click → highlight occurrences in JSON view
  window.App.highlightKeyInView = function(keyName) {
    switchView('json');
    highlightKeyByName(keyName);
  };

  // Expose switchToJsonView for stats panel navigation
  window.App.switchToJsonView = function() {
    switchView('json');
  };

  // === CONTEXT MENU ===
  let ctxPath = '';
  function showContextMenu(x, y, path) {
    ctxPath = path;
    const menu = $('ctxMenu');
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    menu.classList.add('show');
  }

  document.addEventListener('click', () => $('ctxMenu').classList.remove('show'));
  $('ctxMenu').addEventListener('click', e => {
    const item = e.target.closest('.ctx-item');
    if (!item) return;
    const action = item.dataset.action;
    if (action === 'copy-path') { copyAndToast(ctxPath, 'Path copied!'); }
    else if (action === 'copy-value') {
      const val = resolvePath(jsonData, ctxPath);
      copyAndToast(typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val), 'Value copied!');
    }
    else if (action === 'copy-subtree') {
      const val = resolvePath(jsonData, ctxPath);
      copyAndToast(JSON.stringify(val, null, 2), 'Subtree copied!');
    }
    else if (action === 'bookmark') {
      if (!bookmarks.includes(ctxPath)) bookmarks.push(ctxPath);
      renderBookmarks(); updateBookmarkHighlights(bookmarks); toast('Bookmarked!');
    }
    else if (action === 'gen-mock') { generateMockData(ctxPath); }
    $('ctxMenu').classList.remove('show');
  });

  // Copy As... submenu handler
  $('ctxCopyAs').addEventListener('click', e => {
    e.stopPropagation();
    const item = e.target.closest('[data-lang]');
    if (!item) return;
    const lang = item.dataset.lang;
    const val = resolvePath(jsonData, ctxPath);
    const code = window.App.codeGen.generate(lang, val, 'Data');
    copyAndToast(code, `Copied as ${item.textContent.trim()}!`);
    $('ctxMenu').classList.remove('show');
  });

  // === MOCK DATA ===
  function generateMockData(path) {
    const val = resolvePath(jsonData, path);
    const mock = window.App.mockGen.generate(val);
    copyAndToast(JSON.stringify(mock, null, 2), 'Mock data copied!');
  }

  // === TOOLBAR ACTIONS (delegated to toolbar-actions module) ===
  window.App.toolbarActions.init(() => ({
    jsonData, rawJsonText, fileName, currentView,
    expandAll, collapseAll, collapseToDepth,
    onPathSelect,
    setJsonData(data, text, name) {
      jsonData = data;
      if (text !== undefined && text !== null) rawJsonText = text;
      if (name) fileName = name;
    },
    rerender() {
      renderJsonView(jsonData, onPathSelect, showContextMenu);
      updateBookmarkHighlights(bookmarks);
    },
    startExplorer
  }));

  // === JSON EDITOR MODE (delegated to json-editor module) ===
  window.App.jsonEditor.init((newData) => {
    jsonData = newData;
    window.App._jsonDataRef = jsonData;
    allPaths = collectAllPaths(jsonData);
    buildPathIndex();
    renderJsonView(jsonData, onPathSelect, showContextMenu);
    renderStats(jsonData, evaluatePath);
    renderHelpers(jsonData);
  });
  document.addEventListener('editor-enter', () => {
    if (jsonData) window.App.jsonEditor.enter(jsonData);
  });

  // Panel resizer (delegated to panel-resizer module)
  window.App.panelResizer.init();

  // Table view
  $('btnTable').addEventListener('click', async () => {
    if (currentView === 'table') { switchView('json'); return; }
    const arrays = findAllArrays(jsonData);
    const mainArr = arrays.find(a => a.data.length > 0 && typeof a.data[0] === 'object');
    if (!mainArr) { toast('No table data found in this JSON'); return; }
    showLoading('Building table…');
    switchView('table');
    window.App.simpleTable.setArrays(arrays);
    await new Promise(r => setTimeout(r, 0));
    window.App.simpleTable.render(mainArr.data, mainArr.path, onPathSelect);
    hideLoading();
  });

  // Schema view
  $('btnSchema').addEventListener('click', () => {
    if (currentView === 'schema') { switchView('json'); return; }
    switchView('schema');
    renderSchema(jsonData);
  });

  // Graph view
  $('btnGraph').addEventListener('click', async () => {
    if (!jsonData) { toast('Load JSON first'); return; }
    if (currentView === 'graph') { switchView('json'); return; }
    showLoading('Building graph…');
    switchView('graph');
    await new Promise(r => setTimeout(r, 0));
    window.App.graphView.render(jsonData, $('graphView'));
    hideLoading();
  });

  // Mock Data Generator (from context menu)
  window.App.generateMock = function() {
    if (!jsonData) return;
    const mock = window.App.mockGen.generate(jsonData);
    jsonData = mock;
    fileName = 'Mock Data';
    startExplorer();
    toast('Mock data generated!');
  };

  // Type definitions (delegated to type-def-modal module)
  window.App.typeDefModal.init(() => jsonData);

  // Expression subtabs
  document.querySelectorAll('.expr-subtab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.expr-subtab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.expr-pane').forEach(p => p.classList.remove('active'));
      $('ep-' + tab.dataset.et).classList.add('active');
    });
  });

  // Diff
  $('btnDiff').addEventListener('click', () => {
    if (!jsonData) return;
    // Populate tab dropdown
    const sel = $('diffTabSelect');
    const activeId = window.App.multiTab.getActiveTab()?.id;
    sel.innerHTML = '<option value="">Select a tab</option>' +
      window.App.multiTab.getTabs()
        .filter(t => t.id !== activeId && t.data)
        .map(t => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join('');
    $('diffOverlay').classList.add('show');
  });
  $('diffTabSelect').addEventListener('change', (e) => {
    const id = e.target.value;
    if (!id) return;
    const tab = window.App.multiTab.getTabs().find(t => t.id === id);
    if (tab && tab.rawText) {
      $('diffInput').value = tab.rawText;
    }
    e.target.value = '';
  });
  $('diffClose').addEventListener('click', () => { $('diffOverlay').classList.remove('show'); $('diffLeft').style.gridColumn = ''; });
  $('diffShowAll').addEventListener('click', () => {
    const container = $('diffLeft');
    if (container.classList.contains('jsondiffpatch-unchanged-showing')) {
      container.classList.remove('jsondiffpatch-unchanged-showing');
      container.classList.add('jsondiffpatch-unchanged-hidden');
    } else {
      container.classList.add('jsondiffpatch-unchanged-showing');
      container.classList.remove('jsondiffpatch-unchanged-hidden');
    }
  });
  $('btnDiffRun').addEventListener('click', async () => {
    const text = $('diffInput').value.trim();
    if (!text) return;
    try {
      const other = JSON.parse(text);
      $('diffLeft').innerHTML = '<div style="padding:20px;color:var(--text-muted)">Loading diff...</div>';
      $('diffRight').innerHTML = '';
      await renderDiff(jsonData, other);
    } catch (e) { toast('Invalid JSON: ' + e.message); }
  });

  // JSON Patch (RFC 6902) — copy patch operations
  $('btnDiffPatch').addEventListener('click', () => {
    const text = $('diffInput').value.trim();
    if (!text) { toast('Paste comparison JSON first'); return; }
    try {
      const other = JSON.parse(text);
      const patch = window.App.jsonPatch.diff(jsonData, other);
      if (patch.length === 0) { toast('No differences found'); return; }
      copyAndToast(JSON.stringify(patch, null, 2), `Copied ${patch.length} change${patch.length > 1 ? 's' : ''} as patch`);
    } catch (e) { toast('Invalid JSON: ' + e.message); }
  });

  // Drag & Drop into diff textarea
  const diffTA = $('diffInput');
  diffTA.addEventListener('dragover', e => { e.preventDefault(); diffTA.classList.add('drag-over'); });
  diffTA.addEventListener('dragleave', () => { diffTA.classList.remove('drag-over'); });
  diffTA.addEventListener('drop', e => {
    e.preventDefault();
    diffTA.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = ev => { diffTA.value = ev.target.result; };
      reader.readAsText(file);
    }
  });

  // Copy path
  $('btnCopy').addEventListener('click', () => { const p = $('pathInput').value; if (p) { copyAndToast(p, 'Path copied!'); } });

  // New JSON (clear & reset)
  $('btnNew').addEventListener('click', () => {
    jsonData = null;
    fileName = '';
    pathHistory = []; historyIndex = -1;
    bookmarks = [];
    allPaths = [];
    focusedLineIdx = -1;
    currentView = 'json';
    window.App._jsonDataRef = null;
    $('inputOverlay').classList.remove('hidden');
    $('pasteInput').value = '';
    $('pathInput').value = '';
    $('docMeta').textContent = '';
    $('jsonView').innerHTML = '';
    $('simpleTableView').innerHTML = '';
    $('resultBody').innerHTML = '<div class="no-result">Click any element in the JSON or type a path above</div>';
    $('ep-automate').innerHTML = '<div class="no-result">Select a path to see expressions</div>';
    $('ep-canvas').innerHTML = '<div class="no-result">Select a path to see expressions</div>';
    $('resultBadge').textContent = '';
    $('statsBody').innerHTML = 'Load JSON to see stats';
    $('helpersBody').innerHTML = 'Load JSON for utilities';
    $('schemaGenBody').innerHTML = 'Load JSON to generate schema';
    switchView('json');
    updateHistoryBtns();
    renderBookmarks();
  });

  // === MULTI-TAB ===
  window.App.multiTab.init();
  if (window.App.toolbarPin) window.App.toolbarPin.init();
  // Restore previous session, or create initial tab
  if (!window.App.multiTab.restoreSession()) {
    window.App.multiTab.addTab('Initial', null, '');
  } else {
    // Trigger switch to the active tab to restore its view
    const active = window.App.multiTab.getActiveTab();
    if (active && active.data) {
      document.dispatchEvent(new CustomEvent('tab-switch', { detail: { tab: active } }));
    }
  }
  // Auto-save session on changes and before unload
  window.addEventListener('beforeunload', () => window.App.multiTab.saveSession());
  document.addEventListener('tab-switch', () => window.App.multiTab.saveSession());
  document.addEventListener('tab-renamed', () => window.App.multiTab.saveSession());

  document.addEventListener('tab-switch', (e) => {
    const tab = e.detail.tab;
    if (tab && tab.data) {
      jsonData = tab.data;
      window.App._jsonDataRef = jsonData;
      rawJsonText = tab.rawText;
      fileName = tab.label || 'Untitled';
      $('inputOverlay').classList.add('hidden');
      $('docMeta').textContent = fileName;
      $('pathInput').value = '';
      $('resultBody').innerHTML = '<div class="no-result">Click any element in the JSON or type a path above</div>';
      $('resultBadge').textContent = '';
      allPaths = collectAllPaths(jsonData);
      buildPathIndex();
      renderJsonView(jsonData, onPathSelect, showContextMenu);
      updateBookmarkHighlights(bookmarks);
      renderStats(jsonData, evaluatePath);
      renderHelpers(jsonData);
      renderParseJsonSchema(jsonData);
      switchView('json');
      const jv = document.getElementById('jsonView');
      if (jv) jv.scrollTop = tab.scrollTop || 0;
    } else {
      // Tab has no data — show input overlay
      $('inputOverlay').classList.remove('hidden');
    }
  });

  document.addEventListener('tab-renamed', (e) => {
    const { tab, oldLabel } = e.detail;
    if (tab && tab.id === window.App.multiTab.getActiveTab()?.id) {
      fileName = tab.label;
      $('docMeta').textContent = fileName;
    }
    if (oldLabel && oldLabel !== tab.label && window.App.storage) {
      window.App.storage.updateRecentName(oldLabel, tab.label);
    }
  });

  document.addEventListener('tab-new', () => {
    $('inputOverlay').classList.remove('hidden');
  });

  // === INLINE VALUE EDITING ===
  document.addEventListener('inline-edit', (e) => {
    if (!jsonData) return;
    const { path, value } = e.detail;
    if (window.App.undoStack) {
      window.App.undoStack.push(JSON.parse(JSON.stringify(jsonData)), 'Edit ' + path);
    }
    rawJsonText = JSON.stringify(jsonData, null, 2);
    window.App.multiTab.setActiveData(jsonData, rawJsonText, fileName);
    renderJsonView(jsonData, onPathSelect, showContextMenu);
    toast('Updated: ' + path);
  });

  // === UNIVERSAL FILTER BAR (module) ===
  const uf = window.App.universalFilter;
  uf.init(() => jsonData);
  $('btnTreeFilter').addEventListener('click', () => uf.toggle());
  document.addEventListener('snippet-load', (e) => {
    const { name, text } = e.detail;
    try {
      const data = JSON.parse(text);
      // Open in a new tab
      const id = window.App.multiTab.addTab(name, data, text);
      if (id) {
        jsonData = data;
        rawJsonText = text;
        fileName = name;
        startExplorer();
      }
    } catch (err) { toast('Invalid JSON in snippet: ' + err.message); }
  });

  // === COMMAND PALETTE (Ctrl+K) ===
  window.App.commandRegistry.init();

  // === KEYBOARD SHORTCUTS (delegated to shortcuts-handler module) ===
  // JSON view keyboard nav (uses live HTMLCollection for performance)
  $('jsonView').setAttribute('tabindex', '0');
  const jsonLinesCollection = $('jsonView').getElementsByClassName('j-line');
  let highlightedNavLine = null;
  function navigateJsonLines(dir) {
    const lines = jsonLinesCollection;
    if (lines.length === 0) return;
    if (highlightedNavLine) highlightedNavLine.classList.remove('highlighted');
    focusedLineIdx = Math.max(0, Math.min(lines.length - 1, focusedLineIdx + dir));
    const line = lines[focusedLineIdx];
    if (!line) return;
    line.classList.add('highlighted');
    highlightedNavLine = line;
    line.scrollIntoView({ behavior: 'instant', block: 'center' });
    const path = line.getAttribute('data-path');
    if (path) $('pathInput').value = path;
  }

  $('jsonView').addEventListener('keydown', e => {
    if (e.key === 'Enter' && focusedLineIdx >= 0) {
      const line = jsonLinesCollection[focusedLineIdx];
      const path = line?.getAttribute('data-path');
      if (path) evaluatePath(path);
    }
  });

  // === Zoom & Keyboard Shortcuts (delegated to modules) ===
  window.App.zoom.init();

  // Expose app actions for extracted modules
  window.App.appActions = {
    switchView,
    undo() {
      if (!window.App.undoStack || !window.App.undoStack.canUndo()) return;
      jsonData = window.App.undoStack.undo();
      const info = window.App.undoStack.current();
      toast(`Undo: ${info ? info.label : 'previous state'}`);
      renderJsonView(jsonData, onPathSelect, showContextMenu);
      updateBookmarkHighlights(bookmarks);
    },
    redo() {
      if (!window.App.undoStack || !window.App.undoStack.canRedo()) return;
      jsonData = window.App.undoStack.redo();
      const info = window.App.undoStack.current();
      toast(`Redo: ${info ? info.label : 'next state'}`);
      renderJsonView(jsonData, onPathSelect, showContextMenu);
      updateBookmarkHighlights(bookmarks);
    },
    enterEditor() {
      if (jsonData) window.App.jsonEditor.enter(jsonData);
      else toast('Load JSON first');
    },
    navigateLines: navigateJsonLines
  };

  window.App.shortcutsHandler.init();
  window.App.inputHandler.loadFromHash();

  // ===== Toolbar dropdown groups =====
  document.querySelectorAll('.toolbar-group-trigger').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = trigger.nextElementSibling;
      const wasOpen = menu.classList.contains('show');
      document.querySelectorAll('.toolbar-group-menu.show').forEach(m => m.classList.remove('show'));
      document.querySelectorAll('.toolbar-more-menu.show').forEach(m => m.classList.remove('show'));
      if (!wasOpen) menu.classList.add('show');
    });
  });
  document.querySelectorAll('.toolbar-group-item').forEach(item => {
    item.addEventListener('click', () => {
      const menu = item.closest('.toolbar-group-menu');
      if (menu) menu.classList.remove('show');
    });
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.toolbar-group')) {
      document.querySelectorAll('.toolbar-group-menu.show').forEach(m => m.classList.remove('show'));
    }
  });
})();
