/**
 * Command Registry — registers all default commands for the command palette
 */
window.App = window.App || {};
window.App.commandRegistry = (() => {
  const { $ } = window.App.dom;

  function init() {
    const cp = window.App.commandPalette;
    const uf = window.App.universalFilter;

    cp.registerMany([
      { id: 'search', label: 'Find in JSON', shortcut: 'Ctrl+F', action: () => $('btnSearch').click(), category: 'Search' },
      { id: 'replace', label: 'Find & Replace', shortcut: 'Ctrl+H', action: () => { $('btnSearch').click(); $('replaceRow').classList.add('show'); }, category: 'Search' },
      { id: 'query', label: 'Advanced Filter (JSONPath)', shortcut: 'Ctrl+Shift+F', action: () => { uf.isActive() ? uf.close() : uf.open('jsonpath'); }, category: 'Filter' },
      { id: 'transform', label: 'Transform Expression', shortcut: 'Ctrl+T', action: () => $('btnTransform').click(), category: 'Query' },
      { id: 'validate', label: 'Validate Schema', shortcut: 'Ctrl+Shift+V', action: () => $('btnValidate').click(), category: 'Schema' },
      { id: 'typedef', label: 'Generate Types (TS/Go/Python)', shortcut: 'Ctrl+Shift+T', action: () => $('btnTypeDef').click(), category: 'Schema' },
      { id: 'schema', label: 'Schema Preview', shortcut: 'Ctrl+3', action: () => $('btnSchema').click(), category: 'Views' },
      { id: 'table', label: 'Table View', shortcut: 'Ctrl+2', action: () => $('btnTable').click(), category: 'Views' },
      { id: 'graph', label: 'Graph View', shortcut: 'Ctrl+4', action: () => $('btnGraph').click(), category: 'Views' },
      { id: 'json', label: 'JSON Tree View', shortcut: 'Ctrl+1', action: () => window.App.appActions.switchView('json'), category: 'Views' },
      { id: 'diff', label: 'Compare / Diff JSON', shortcut: 'Ctrl+D', action: () => $('btnDiff').click(), category: 'Tools' },
      { id: 'sort', label: 'Sort Keys', shortcut: 'Ctrl+Shift+S', action: () => $('btnSort').click(), category: 'Tools' },
      { id: 'flatten', label: 'Flatten or Unflatten', shortcut: 'Ctrl+Shift+L', action: () => $('btnFlatten').click(), category: 'Tools' },
      { id: 'minify', label: 'Compact or Expand', shortcut: 'Ctrl+Shift+M', action: () => $('btnMinify').click(), category: 'Tools' },
      { id: 'convert', label: 'Convert Format (YAML/XML/TOML)', shortcut: 'Ctrl+Shift+C', action: () => $('btnConvert').click(), category: 'Tools' },
      { id: 'heatmap', label: 'Toggle Size Heatmap', shortcut: 'Ctrl+Shift+H', action: () => $('btnHeatmap').click(), category: 'Tools' },
      { id: 'mask', label: 'Mask or Unmask Sensitive Data', shortcut: 'Ctrl+Shift+P', action: () => $('btnMask').click(), category: 'Tools' },
      { id: 'nullfinder', label: 'Find Null or Empty Values', shortcut: 'Ctrl+Shift+N', action: () => $('btnNullFinder').click(), category: 'Search' },
      { id: 'export-csv', label: 'Export as CSV', shortcut: 'Ctrl+Shift+E', action: () => $('btnExport').click(), category: 'Export' },
      { id: 'export-img', label: 'Export as Image', shortcut: 'Ctrl+Shift+I', action: () => $('btnImg').click(), category: 'Export' },
      { id: 'share', label: 'Share URL', shortcut: 'Ctrl+Shift+U', action: () => $('btnShare').click(), category: 'Export' },
      { id: 'ws-export', label: 'Save Workspace', shortcut: 'Ctrl+Shift+W', action: () => window.App.workspaceExport.exportWorkspace(), category: 'Export' },
      { id: 'ws-import', label: 'Load Workspace', shortcut: '', action: () => $('workspaceImportInput').click(), category: 'Export' },
      { id: 'copy', label: 'Copy Current Path', shortcut: 'Ctrl+Shift+C', action: () => $('btnCopy').click(), category: 'Edit' },
      { id: 'bookmark', label: 'Bookmark Path', shortcut: 'Ctrl+B', action: () => $('btnBookmark').click(), category: 'Edit' },
      { id: 'expand', label: 'Expand All Nodes', shortcut: 'Ctrl+Shift+E', action: () => $('btnExpandAll').click(), category: 'View' },
      { id: 'collapse', label: 'Collapse All Nodes', shortcut: 'Ctrl+Shift+C', action: () => $('btnCollapseAll').click(), category: 'View' },
      { id: 'wrap', label: 'Toggle Word Wrap', shortcut: 'Alt+Z', action: () => $('btnWrap').click(), category: 'View' },
      { id: 'dark', label: 'Toggle Dark/Light Theme', shortcut: 'Alt+T', action: () => $('btnDark').click(), category: 'View' },
      { id: 'new', label: 'Clear & Load New JSON', shortcut: 'Ctrl+Shift+N', action: () => $('btnNew').click(), category: 'File' },
      { id: 'url', label: 'Load from URL', shortcut: 'Ctrl+Shift+U', action: () => $('btnUrl').click(), category: 'File' },
      { id: 'shortcuts', label: 'Show Keyboard Shortcuts', shortcut: '?', action: () => window.App.shortcutsOverlay.show(), category: 'Help' },
      { id: 'charts', label: 'Show Data Charts', shortcut: 'Alt+C', action: () => $('btnCharts').click(), category: 'Tools' },
      { id: 'profile', label: 'Data Profile (field stats)', shortcut: 'Alt+P', action: () => $('btnProfile').click(), category: 'Tools' },
      { id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z', action: () => window.App.appActions.undo(), category: 'Edit' },
      { id: 'redo', label: 'Redo', shortcut: 'Ctrl+Y', action: () => window.App.appActions.redo(), category: 'Edit' },
      { id: 'minimap', label: 'Tree Overview', shortcut: 'Alt+M', action: () => $('btnMinimap').click(), category: 'View' },
      { id: 'repair', label: 'Repair JSON', shortcut: 'Alt+R', action: () => $('btnRepair').click(), category: 'Tools' },
      { id: 'pivot', label: 'Pivot Table (group and summarize)', shortcut: 'Alt+V', action: () => $('btnPivot').click(), category: 'Tools' },
      { id: 'newtab', label: 'New Tab', shortcut: 'Ctrl+Shift+T', action: () => document.getElementById('tabAdd').click(), category: 'File' },
      { id: 'snippets', label: 'Snippet Library', shortcut: 'Alt+S', action: () => window.App.snippetLibrary.show(), category: 'Tools' },
      { id: 'pintools', label: 'Customize Toolbar', shortcut: '', action: () => { const m = document.getElementById('toolbarMoreMenu'); m.classList.toggle('show'); }, category: 'View' },
      { id: 'treefilter', label: 'Advanced Filter', shortcut: 'Ctrl+Shift+F', action: () => $('btnTreeFilter').click(), category: 'Search' },
      { id: 'depth1', label: 'Collapse to Depth 1', shortcut: 'Alt+1', action: () => $('btnDepth1').click(), category: 'View' },
      { id: 'depth2', label: 'Collapse to Depth 2', shortcut: 'Alt+2', action: () => $('btnDepth2').click(), category: 'View' },
      { id: 'depth3', label: 'Collapse to Depth 3', shortcut: 'Alt+3', action: () => $('btnDepth3').click(), category: 'View' },
      { id: 'edit', label: 'Edit JSON (inline editor)', shortcut: 'Ctrl+E', action: () => window.App.appActions.enterEditor(), category: 'Edit' },
      { id: 'zoomin', label: 'Zoom In', shortcut: 'Ctrl++', action: () => window.App.zoom.zoomIn(), category: 'View' },
      { id: 'zoomout', label: 'Zoom Out', shortcut: 'Ctrl+-', action: () => window.App.zoom.zoomOut(), category: 'View' },
      { id: 'zoomreset', label: 'Zoom Reset (100%)', shortcut: 'Ctrl+0', action: () => window.App.zoom.reset(), category: 'View' },
      { id: 'zoomfit', label: 'Zoom Fit to Window', shortcut: '', action: () => window.App.zoom.fit(), category: 'View' },
      { id: 'back', label: 'Navigate Back', shortcut: 'Alt+←', action: () => $('btnBack').click(), category: 'Navigation' },
      { id: 'forward', label: 'Navigate Forward', shortcut: 'Alt+→', action: () => $('btnForward').click(), category: 'Navigation' },
    ]);
  }

  return { init };
})();
