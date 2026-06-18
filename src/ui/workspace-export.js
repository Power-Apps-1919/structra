/**
 * Workspace Export/Import — save and restore full workspace state as a JSON file.
 */
window.App = window.App || {};
window.App.workspaceExport = (() => {
  const { toast } = window.App.dom;
  const PREFIX = 'jpe_';

  function collectState() {
    const state = { version: 1, exportedAt: new Date().toISOString() };

    // Theme
    state.theme = document.documentElement.getAttribute('data-theme') || 'light';

    // Bookmarks
    try { state.bookmarks = JSON.parse(localStorage.getItem(PREFIX + 'bookmarks') || '[]'); } catch { state.bookmarks = []; }

    // Snippets
    try { state.snippets = JSON.parse(localStorage.getItem(PREFIX + 'snippets') || '[]'); } catch { state.snippets = []; }

    // Toolbar pins
    try { state.toolbarHidden = JSON.parse(localStorage.getItem(PREFIX + 'toolbar_hidden') || '[]'); } catch { state.toolbarHidden = []; }

    // Filter history
    try { state.filterHistory = JSON.parse(localStorage.getItem(PREFIX + 'filter_history') || '{}'); } catch { state.filterHistory = {}; }

    // Tabs (data references — store tab names, not the full JSON data)
    if (window.App.multiTab) {
      const tabs = window.App.multiTab.getTabs();
      state.tabs = tabs.map(t => ({ id: t.id, name: t.name }));
    }

    return state;
  }

  function exportWorkspace() {
    const state = collectState();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workspace-${new Date().toISOString().slice(0, 10)}.jpe-workspace.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Workspace saved');
  }

  function importWorkspace(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const state = JSON.parse(reader.result);
        if (!state.version) throw new Error('Invalid workspace file');

        // Theme
        if (state.theme) {
          document.documentElement.setAttribute('data-theme', state.theme);
          localStorage.setItem(PREFIX + 'theme', state.theme);
        }

        // Bookmarks
        if (state.bookmarks) localStorage.setItem(PREFIX + 'bookmarks', JSON.stringify(state.bookmarks));

        // Snippets
        if (state.snippets) localStorage.setItem(PREFIX + 'snippets', JSON.stringify(state.snippets));

        // Toolbar pins
        if (state.toolbarHidden) {
          localStorage.setItem(PREFIX + 'toolbar_hidden', JSON.stringify(state.toolbarHidden));
          if (window.App.toolbarPin) window.App.toolbarPin.init();
        }

        // Filter history
        if (state.filterHistory) localStorage.setItem(PREFIX + 'filter_history', JSON.stringify(state.filterHistory));

        toast('Workspace loaded. Refresh the page to finish setup.');
      } catch (err) {
        toast('Import failed: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  return { exportWorkspace, importWorkspace };
})();
