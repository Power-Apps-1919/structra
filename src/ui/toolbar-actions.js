/**
 * Toolbar Actions — button click handlers that delegate to existing modules.
 * Keeps app.js focused on state management and orchestration.
 */
window.App = window.App || {};
window.App.toolbarActions = (() => {
  const { $, toast, copyAndToast, showLoading, hideLoading } = window.App.dom;

  function init(getState) {
    const state = getState; // () => { jsonData, rawJsonText, fileName, currentView, findAllArrays, ... }

    // --- Collapse/Expand ---
    $('btnExpandAll').addEventListener('click', () => state().expandAll());
    $('btnCollapseAll').addEventListener('click', () => state().collapseAll());
    $('btnDepth1').addEventListener('click', () => state().collapseToDepth(1));
    $('btnDepth2').addEventListener('click', () => state().collapseToDepth(2));
    $('btnDepth3').addEventListener('click', () => state().collapseToDepth(3));

    // --- Wrap toggle ---
    $('btnWrap').addEventListener('click', () => {
      const view = $('jsonView');
      view.classList.toggle('wrap-mode');
      $('btnWrap').classList.toggle('active', view.classList.contains('wrap-mode'));
    });

    // --- Dark mode ---
    const savedTheme = window.App.storage ? window.App.storage.getTheme() : 'light';
    function applyTheme(dark) {
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : '');
      const icon = dark ? 'sun' : 'moon';
      $('btnDark').innerHTML = `<i data-lucide="${icon}"></i>`;
      const overlayBtn = document.getElementById('overlayThemeToggle');
      if (overlayBtn) overlayBtn.innerHTML = `<i data-lucide="${icon}"></i>`;
      if (window.lucide) lucide.createIcons({attrs: {width: 14, height: 14, 'stroke-width': 1.5}, nameAttr: 'data-lucide'});
      if (window.App.storage) window.App.storage.setTheme(dark ? 'dark' : 'light');
    }
    if (savedTheme === 'dark') applyTheme(true);

    function toggleTheme() {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      applyTheme(!isDark);
    }
    $('btnDark').addEventListener('click', toggleTheme);
    const overlayBtn = document.getElementById('overlayThemeToggle');
    if (overlayBtn) overlayBtn.addEventListener('click', toggleTheme);

    // --- Export CSV ---
    $('btnExport').addEventListener('click', () => {
      const { jsonData } = state();
      if (!jsonData) return;
      const arrays = window.App.traverse.findAllArrays(jsonData);
      const mainArr = arrays[0];
      if (!mainArr || !mainArr.data.length || typeof mainArr.data[0] !== 'object') { toast('No table data found'); return; }
      const keys = Object.keys(mainArr.data[0]);
      window.App.csvExport.downloadCsv(mainArr.data, keys, 'json-export.csv');
    });

    // --- Minify/Prettify ---
    let minified = false;
    $('btnMinify').addEventListener('click', () => {
      const { jsonData, rerender } = state();
      if (!jsonData) return;
      minified = !minified;
      $('btnMinify').classList.toggle('active', minified);
      if (minified) {
        $('jsonView').style.whiteSpace = 'nowrap';
        $('jsonView').textContent = JSON.stringify(jsonData);
      } else {
        $('jsonView').style.whiteSpace = 'pre-wrap';
        rerender();
      }
    });

    // --- Sort Keys ---
    let sortState = 0;
    $('btnSort').addEventListener('click', () => {
      const { jsonData, setJsonData, rerender } = state();
      if (!jsonData) { toast('Load JSON first'); return; }
      sortState = (sortState + 1) % 3;
      if (sortState === 0) { toast('Sort cleared. Reload to restore original order.'); return; }
      const order = sortState === 1 ? 'asc' : 'desc';
      const sorted = window.App.jsonOps.sortKeys(jsonData, order, true);
      setJsonData(sorted);
      toast(`Keys sorted ${order === 'asc' ? 'A to Z' : 'Z to A'}`);
      if (window.App.undoStack) window.App.undoStack.push(sorted, `Sort keys ${order}`);
      rerender();
      $('btnSort').classList.toggle('active', sortState !== 0);
    });

    // --- Flatten/Unflatten ---
    let flattened = false;
    let unflattenedBackup = null;
    $('btnFlatten').addEventListener('click', () => {
      const { jsonData, setJsonData, rerender } = state();
      if (!jsonData) { toast('Load JSON first'); return; }
      if (!flattened) {
        unflattenedBackup = JSON.parse(JSON.stringify(jsonData));
        const flat = window.App.jsonOps.flatten(jsonData);
        setJsonData(flat);
        flattened = true;
        toast('JSON flattened to a single level');
        if (window.App.undoStack) window.App.undoStack.push(flat, 'Flatten');
      } else {
        setJsonData(unflattenedBackup);
        unflattenedBackup = null;
        flattened = false;
        toast('JSON restored to original');
        if (window.App.undoStack) window.App.undoStack.push(unflattenedBackup, 'Unflatten');
      }
      $('btnFlatten').classList.toggle('active', flattened);
      rerender();
    });

    // --- Null Finder ---
    $('btnNullFinder').addEventListener('click', () => {
      const { jsonData } = state();
      window.App.nullFinder.toggle(jsonData, window.App.jsonView.expandParents);
    });

    // --- Size Heatmap ---
    $('btnHeatmap').addEventListener('click', async () => {
      const { jsonData } = state();
      if (!jsonData) { toast('Load JSON first'); return; }
      showLoading('Applying heatmap…');
      await new Promise(r => setTimeout(r, 0));
      const isActive = window.App.sizeHeatmap.toggle(jsonData);
      $('btnHeatmap').classList.toggle('active', isActive);
      toast(isActive ? 'Heatmap on: bigger items appear in warmer colors' : 'Heatmap cleared');
      hideLoading();
    });

    // --- Mini Charts ---
    $('btnCharts').addEventListener('click', async () => {
      const { jsonData } = state();
      if (!jsonData) { toast('Load JSON first'); return; }
      showLoading('Generating charts…');
      await new Promise(r => setTimeout(r, 0));
      const isActive = window.App.miniCharts.toggle(jsonData);
      $('btnCharts').classList.toggle('active', isActive);
      toast(isActive ? 'Charts shown for numeric data' : 'Charts cleared');
      hideLoading();
    });

    // --- Data Profiler ---
    $('btnProfile').addEventListener('click', async () => {
      const { jsonData } = state();
      if (!jsonData) { toast('Load JSON first'); return; }
      showLoading('Profiling data…');
      await new Promise(r => setTimeout(r, 0));
      window.App.dataProfiler.showForData(jsonData);
      hideLoading();
    });

    // --- Minimap ---
    $('btnMinimap').addEventListener('click', () => {
      const { jsonData } = state();
      if (!jsonData) { toast('Load JSON first'); return; }
      const isActive = window.App.minimap.toggle();
      $('btnMinimap').classList.toggle('active', isActive);
      toast(isActive ? 'Tree overview shown' : 'Tree overview hidden');
    });

    // --- JSON Repair ---
    $('btnRepair').addEventListener('click', async () => {
      const { jsonData, rawJsonText, setJsonData, startExplorer } = state();
      let textToRepair = rawJsonText;
      if (!textToRepair) {
        const pasteEl = $('pasteInput');
        textToRepair = pasteEl ? pasteEl.value.trim() : '';
      }
      if (!textToRepair) { toast('No JSON to repair. Paste or load some text first.'); return; }
      try {
        await window.App.libLoader.require('jsonrepair');
        const repairFn = window.JSONRepair ? window.JSONRepair.jsonrepair : (window.jsonrepair || null);
        if (!repairFn) throw new Error('jsonrepair library not available');
        const repaired = repairFn(textToRepair);
        if (repaired === textToRepair) { toast('JSON is already valid, no repairs needed'); return; }
        const newData = JSON.parse(repaired);
        if (jsonData) window.App.undoStack.push(jsonData, 'Before repair');
        setJsonData(newData, repaired, 'Repaired JSON');
        window.App.undoStack.push(newData, 'JSON Repair');
        startExplorer();
        toast('JSON repaired successfully!');
      } catch (e) { toast('Repair failed: ' + e.message); }
    });

    // --- Pivot Table ---
    $('btnPivot').addEventListener('click', () => {
      const { jsonData } = state();
      if (!jsonData) { toast('Load JSON first'); return; }
      window.App.pivotTable.show(jsonData);
    });

    // --- Data Masking ---
    let maskBackup = null;
    $('btnMask').addEventListener('click', () => {
      const { jsonData, currentView, setJsonData, rerender } = state();
      if (!jsonData) { toast('Load JSON first'); return; }
      if (maskBackup) {
        setJsonData(maskBackup);
        maskBackup = null;
        $('btnMask').classList.remove('active');
        toast('Original data restored');
        rerender();
        if (currentView === 'table') { const a = window.App.traverse.findAllArrays(state().jsonData)[0]; if (a) window.App.simpleTable.render(a.data, a.path, state().onPathSelect); }
        return;
      }
      const scanCount = window.App.dataMask.scan(jsonData);
      if (scanCount === 0) { toast('No sensitive data found (emails, phone numbers, IDs, IPs)'); return; }
      maskBackup = JSON.parse(JSON.stringify(jsonData));
      const { data, count } = window.App.dataMask.maskData(jsonData);
      setJsonData(data);
      $('btnMask').classList.add('active');
      toast(`Masked ${count} sensitive value${count > 1 ? 's' : ''}. Click again to restore.`);
      if (window.App.undoStack) window.App.undoStack.push(data, `Mask ${count} sensitive values`);
      rerender();
      if (currentView === 'table') { const a = window.App.traverse.findAllArrays(data)[0]; if (a) window.App.simpleTable.render(a.data, a.path, state().onPathSelect); }
    });

    // --- Export as Image ---
    $('btnImg').addEventListener('click', async () => {
      const { jsonData, currentView } = state();
      if (!jsonData) { toast('Load JSON first'); return; }
      toast('Capturing...');
      try {
        await window.App.libLoader.require('html2canvas');
        const target = currentView === 'table' ? $('simpleTableView')
          : currentView === 'schema' ? $('schemaView') : $('jsonView');
        const canvas = await html2canvas(target, { backgroundColor: null, scale: 2 });
        const link = document.createElement('a');
        link.download = 'json-view.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        toast('Image exported!');
      } catch (e) { toast('Export failed: ' + e.message); }
    });

    // --- Format Conversion ---
    $('btnConvert').addEventListener('click', async () => {
      const { jsonData } = state();
      if (!jsonData) { toast('Load JSON first'); return; }
      $('convertModal').classList.add('show');
      await doConvert('yaml');
    });
    $('convertClose').addEventListener('click', () => $('convertModal').classList.remove('show'));
    $('convertCopy').addEventListener('click', () => { copyAndToast($('convertBody').textContent, 'Copied!'); });
    document.querySelectorAll('[data-cv]').forEach(btn => {
      btn.addEventListener('click', async () => {
        document.querySelectorAll('[data-cv]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        await doConvert(btn.dataset.cv);
      });
    });
    async function doConvert(format) {
      const body = $('convertBody');
      body.textContent = 'Converting...';
      try {
        const { jsonToYaml, jsonToXml } = window.App.formatConvert;
        let result;
        if (format === 'yaml') result = await jsonToYaml(state().jsonData);
        else if (format === 'xml') result = jsonToXml(state().jsonData);
        else result = JSON.stringify(state().jsonData, null, 2);
        body.textContent = result;
      } catch (err) { body.textContent = 'Error: ' + err.message; }
    }

    // --- Share URL ---
    $('btnShare').addEventListener('click', () => {
      const { jsonData } = state();
      if (!jsonData) return;
      const json = JSON.stringify(jsonData);
      if (json.length > 10000) { toast('JSON too large to share via URL'); return; }
      try {
        const encoded = btoa(unescape(encodeURIComponent(json)));
        const url = window.location.href.split('#')[0] + '#data=' + encoded;
        copyAndToast(url, 'Share URL copied!');
      } catch (e) { toast('Could not create share link'); }
    });

    // --- Workspace Export/Import ---
    $('btnWorkspaceExport').addEventListener('click', () => {
      let dd = document.getElementById('wsExportDropdown');
      if (dd) { dd.remove(); return; }
      dd = document.createElement('div');
      dd.id = 'wsExportDropdown';
      dd.className = 'ws-export-dropdown';
      dd.innerHTML = `<div class="ws-dd-item" data-action="export">&#128229; Save Workspace</div>
        <div class="ws-dd-item" data-action="import">&#128228; Load Workspace</div>`;
      const rect = $('btnWorkspaceExport').getBoundingClientRect();
      dd.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;z-index:9999`;
      document.body.appendChild(dd);
      dd.addEventListener('click', ev => {
        const item = ev.target.closest('[data-action]');
        if (!item) return;
        dd.remove();
        if (item.dataset.action === 'export') window.App.workspaceExport.exportWorkspace();
        else $('workspaceImportInput').click();
      });
      setTimeout(() => {
        const close = (ev) => { if (!dd.contains(ev.target)) { dd.remove(); document.removeEventListener('click', close); } };
        document.addEventListener('click', close);
      }, 0);
    });
    $('workspaceImportInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) window.App.workspaceExport.importWorkspace(file);
      e.target.value = '';
    });

    // --- Transform ---
    $('btnTransform').addEventListener('click', () => {
      const { jsonData, startExplorer, setJsonData } = state();
      if (!jsonData) { toast('Load JSON first'); return; }
      window.App.transformPanel.toggle(jsonData, (result) => {
        setJsonData(result, null, 'Transformed');
        startExplorer();
      });
    });

    // --- Validate Schema ---
    $('btnValidate').addEventListener('click', () => {
      const { jsonData } = state();
      if (!jsonData) { toast('Load JSON first'); return; }
      window.App.validator.toggle(jsonData);
    });

    // --- Snippet Library ---
    $('btnSnippets').addEventListener('click', () => window.App.snippetLibrary.show());

    // --- Command Palette ---
    $('btnCmdPalette').addEventListener('click', () => window.App.commandPalette.toggle());
  }

  return { init };
})();
