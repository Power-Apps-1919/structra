/**
 * Search — find/replace in JSON tree view (data-level).
 * Searches raw JSON data via traverse.searchValues, not DOM elements.
 * Results persist across chunked rendering via jsonView.setHighlight.
 */
window.App = window.App || {};
window.App.search = (() => {
  const { $ } = window.App.dom;

  let searchPaths = [];   // ordered array of matched path strings
  let searchIndex = -1;
  let searchDebounce = 0;

  function getSearchParams() {
    const term = $('searchInput').value;
    if (!term) return { search: '', regex: null };
    if ($('searchRegex').checked) {
      try { return { search: term, regex: new RegExp(term, 'g') }; }
      catch { window.App.dom.toast('Invalid search pattern'); return { search: '', regex: null }; }
    }
    return { search: term, regex: null };
  }

  function toggleSearch() {
    const bar = $('searchBar');
    bar.classList.toggle('show');
    if (bar.classList.contains('show')) $('searchInput').focus();
    else clearHighlights();
  }

  function performSearch() {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(performSearchNow, 1000);
  }

  async function performSearchNow() {
    clearHighlights();
    const query = $('searchInput').value.trim();
    if (!query) { $('searchInfo').textContent = '0/0'; searchPaths = []; return; }

    // Dismiss universal filter if active — they share the same tree highlight slot
    if (window.App.universalFilter?.isActive?.()) window.App.universalFilter.close();
    // Dismiss null-finder if active
    if (window.App.nullFinder?.isActive?.()) window.App.nullFinder.clear();

    const jsonData = window.App._jsonDataRef;
    if (!jsonData) { $('searchInfo').textContent = '0/0'; return; }

    // Build regex for the search term
    let regex;
    if ($('searchRegex').checked) {
      try { regex = new RegExp(query, 'i'); }
      catch { window.App.dom.toast('Invalid pattern'); return; }
    } else {
      // Escape for literal match
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regex = new RegExp(escaped, 'i');
    }

    const { showLoading, hideLoading } = window.App.dom;
    showLoading('Searching…');
    await new Promise(r => setTimeout(r, 0));

    // Data-level search — traverse entire JSON
    const { matchedPaths } = await window.App.traverse.searchValues(jsonData, regex);

    searchPaths = [...matchedPaths];
    searchIndex = searchPaths.length > 0 ? 0 : -1;

    // Apply persistent highlight via json-view infrastructure
    if (window.App.jsonView?.setHighlight) {
      await window.App.jsonView.setHighlight(matchedPaths);
    }
    hideLoading();

    updateInfo();
    if (searchPaths.length > 0) navigateToCurrentMatch();
  }

  async function performSearchExactKey(keyName) {
    clearHighlights();
    const jsonData = window.App._jsonDataRef;
    if (!jsonData) return;

    // Dismiss universal filter if active — they share the same tree highlight slot
    if (window.App.universalFilter?.isActive?.()) window.App.universalFilter.close();
    // Dismiss null-finder if active
    if (window.App.nullFinder?.isActive?.()) window.App.nullFinder.clear();

    const { showLoading, hideLoading } = window.App.dom;
    showLoading('Searching…');
    await new Promise(r => setTimeout(r, 0));

    // Data-level key search
    const matchedPaths = await window.App.traverse.searchKeys(jsonData, keyName);

    searchPaths = [...matchedPaths];
    searchIndex = searchPaths.length > 0 ? 0 : -1;

    if (window.App.jsonView?.setHighlight) {
      await window.App.jsonView.setHighlight(matchedPaths);
    }
    hideLoading();

    updateInfo();
    if (searchPaths.length > 0) navigateToCurrentMatch();
  }

  function navigate(dir) {
    if (searchPaths.length === 0) return;
    searchIndex = (searchIndex + dir + searchPaths.length) % searchPaths.length;
    navigateToCurrentMatch();
    updateInfo();
  }

  function navigateToCurrentMatch() {
    const path = searchPaths[searchIndex];
    if (!path) return;
    // Use jsonView.highlightPath to scroll to the element
    if (window.App.jsonView?.highlightPath) {
      window.App.jsonView.highlightPath(path);
    }
  }

  function updateInfo() {
    $('searchInfo').textContent = searchPaths.length > 0
      ? `${searchIndex + 1}/${searchPaths.length.toLocaleString()}`
      : '0/0';
  }

  function clearHighlights() {
    searchPaths = [];
    searchIndex = -1;
    // Only clear tree highlight if no other feature is actively owning it
    if (!window.App.universalFilter?.isActive?.() && !window.App.nullFinder?.isActive?.()) {
      if (window.App.jsonView?.clearHighlight) {
        window.App.jsonView.clearHighlight();
      }
    }
    // Also clear the single-path highlight
    if (window.App.jsonView?.highlightPath) {
      window.App.jsonView.highlightPath(null);
    }
  }

  function getMatches() { return searchPaths; }
  function getIndex() { return searchIndex; }

  return {
    toggleSearch, performSearch, performSearchNow, performSearchExactKey,
    navigate, clearHighlights, getSearchParams, getMatches, getIndex
  };
})();
