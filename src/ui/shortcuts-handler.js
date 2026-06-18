/**
 * Shortcuts Handler — all keyboard shortcut bindings
 */
window.App = window.App || {};
window.App.shortcutsHandler = (() => {
  const { $, toast } = window.App.dom;

  function init() {
    const { toggleSearch, navigateSearch, clearSearchHighlights } = window.App.search;
    const uf = window.App.universalFilter;

    // Primary shortcuts
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && e.key === 'f') { e.preventDefault(); toggleSearch(); }
      if (e.ctrlKey && e.key === 'b') { e.preventDefault(); $('btnBookmark').click(); }
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); $('btnBack').click(); }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); $('btnForward').click(); }
      if (e.key === 'ArrowDown' && document.activeElement === $('jsonView')) { window.App.appActions.navigateLines(1); e.preventDefault(); }
      if (e.key === 'ArrowUp' && document.activeElement === $('jsonView')) { window.App.appActions.navigateLines(-1); e.preventDefault(); }
    });

    // Search input shortcuts
    $('searchInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.shiftKey ? navigateSearch(-1) : navigateSearch(1); }
      if (e.key === 'Escape') { $('searchBar').classList.remove('show'); clearSearchHighlights(); }
    });

    // Enhanced keyboard shortcuts
    document.addEventListener('keydown', e => {
      // Zoom shortcuts
      if (window.App.zoom.isHovered()) {
        if (e.ctrlKey && !e.shiftKey && (e.key === '=' || e.key === '+')) {
          e.preventDefault(); window.App.zoom.zoomIn(); return;
        }
        if (e.ctrlKey && !e.shiftKey && e.key === '-') {
          e.preventDefault(); window.App.zoom.zoomOut(); return;
        }
        if (e.ctrlKey && !e.shiftKey && e.key === '0') {
          e.preventDefault(); window.App.zoom.reset(); return;
        }
      }
      // Ctrl+Shift+F → Universal filter
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        uf.open('jsonpath');
        return;
      }
      // Ctrl+H → Toggle replace
      if (e.ctrlKey && e.key === 'h') {
        e.preventDefault();
        if (!$('searchBar').classList.contains('show')) toggleSearch();
        $('replaceRow').classList.toggle('show');
        if ($('replaceRow').classList.contains('show')) $('replaceInput').focus();
        return;
      }
      // Ctrl+K → Command Palette
      if (e.ctrlKey && !e.shiftKey && e.key === 'k') {
        e.preventDefault();
        window.App.commandPalette.toggle();
        return;
      }
      // Ctrl+Z → Undo
      if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
        const tag = document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable) return;
        if (!window.App.undoStack || !window.App.undoStack.canUndo()) return;
        e.preventDefault();
        window.App.appActions.undo();
        return;
      }
      // Ctrl+Y → Redo
      if (e.ctrlKey && !e.shiftKey && e.key === 'y') {
        const tag = document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable) return;
        if (!window.App.undoStack || !window.App.undoStack.canRedo()) return;
        e.preventDefault();
        window.App.appActions.redo();
        return;
      }
      // Ctrl+T → Transform
      if (e.ctrlKey && !e.shiftKey && e.key === 't') {
        e.preventDefault();
        $('btnTransform').click();
        return;
      }
      // Ctrl+1/2/3 → switch views
      if (e.ctrlKey && e.key === '1') { e.preventDefault(); window.App.appActions.switchView('json'); }
      if (e.ctrlKey && e.key === '2') { e.preventDefault(); $('btnTable').click(); }
      if (e.ctrlKey && e.key === '3') { e.preventDefault(); $('btnSchema').click(); }
      // ? → Shortcuts overlay
      if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const tag = document.activeElement.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !document.activeElement.isContentEditable) {
          e.preventDefault();
          window.App.shortcutsOverlay.toggle();
          return;
        }
      }
      // Escape → close modals
      if (e.key === 'Escape' && !e.defaultPrevented) {
        if (window.App.commandPalette.isVisible()) { window.App.commandPalette.hide(); return; }
        if (window.App.shortcutsOverlay.isVisible()) { window.App.shortcutsOverlay.hide(); return; }
        if (window.App.typeDefModal.isVisible()) { window.App.typeDefModal.hide(); return; }
        if (window.App.snippetLibrary && window.App.snippetLibrary.isVisible()) { window.App.snippetLibrary.hide(); return; }
        if ($('convertModal').classList.contains('show')) $('convertModal').classList.remove('show');
        if ($('urlModal').classList.contains('show')) $('urlModal').classList.remove('show');
        if ($('diffOverlay').classList.contains('show')) $('diffOverlay').classList.remove('show');
        if (window.App.transformPanel.isVisible()) window.App.transformPanel.hide();
        if (window.App.validator.isVisible()) window.App.validator.hide();
        if (window.App.nullFinder.isActive()) { window.App.nullFinder.clear(); return; }
        if (uf.isActive()) { uf.close(); return; }
      }
    });
  }

  return { init };
})();
