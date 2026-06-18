/**
 * Null/Empty value finder — highlights and navigates null, empty string, empty array/object values.
 * Uses data-level path computation + jsonView.setHighlight for chunk-safe display.
 */
window.App = window.App || {};
window.App.nullFinder = (() => {
  const { $, toast } = window.App.dom;
  const { findNullPaths } = window.App.jsonUtils;

  let matches = [];
  let index = -1;
  let active = false;

  function clear() {
    active = false;
    matches = [];
    index = -1;
    $('btnNullFinder').classList.remove('active');
    // Clear highlight via data-level API
    if (window.App.jsonView?.clearHighlight) {
      window.App.jsonView.clearHighlight();
    }
  }

  function toggle(jsonData) {
    if (!jsonData) { toast('Load JSON first'); return; }
    if (active) { clear(); return; }

    // Dismiss filter/search — they share the same tree highlight slot
    if (window.App.universalFilter?.isActive?.()) window.App.universalFilter.close();
    const searchBar = document.getElementById('searchBar');
    if (searchBar?.classList.contains('show')) {
      searchBar.classList.remove('show');
      if (window.App.search?.clearHighlights) window.App.search.clearHighlights();
    }

    matches = findNullPaths(jsonData);
    if (matches.length === 0) { toast('No null or empty values found'); return; }
    active = true;
    index = 0;
    $('btnNullFinder').classList.add('active');
    toast(`Found ${matches.length} null or empty value${matches.length > 1 ? 's' : ''}. Click again to dismiss.`);

    // Use setHighlight for persistent chunk-safe display
    if (window.App.jsonView?.setHighlight) {
      window.App.jsonView.setHighlight(new Set(matches));
    }

    // Navigate to first match
    if (matches[0] && window.App.jsonView?.highlightPath) {
      window.App.jsonView.highlightPath(matches[0]);
    }
  }

  function next() {
    if (!active || matches.length === 0) return;
    index = (index + 1) % matches.length;
    if (window.App.jsonView?.highlightPath) {
      window.App.jsonView.highlightPath(matches[index]);
    }
  }

  function prev() {
    if (!active || matches.length === 0) return;
    index = (index - 1 + matches.length) % matches.length;
    if (window.App.jsonView?.highlightPath) {
      window.App.jsonView.highlightPath(matches[index]);
    }
  }

  function isActive() { return active; }

  return { toggle, clear, isActive, next, prev };
})();
