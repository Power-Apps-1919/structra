/**
 * Search — find/replace in JSON tree view
 */
window.App = window.App || {};
window.App.search = (() => {
  const { $ } = window.App.dom;

  let searchMatches = [];
  let searchIndex = -1;
  let searchDebounce = 0;
  let searchAbort = false;

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
    searchDebounce = setTimeout(performSearchNow, 200);
  }

  function performSearchNow() {
    searchAbort = true;
    clearHighlights();
    const query = $('searchInput').value.trim().toLowerCase();
    if (!query) { $('searchInfo').textContent = '0/0'; searchMatches = []; return; }
    searchAbort = false;
    const view = $('jsonView');
    const lines = view.getElementsByClassName('j-line');
    const len = lines.length;

    if (len < 10000) {
      for (let i = 0; i < len; i++) {
        if (lines[i].textContent.toLowerCase().includes(query)) searchMatches.push(lines[i]);
      }
      for (let i = 0; i < searchMatches.length; i++) searchMatches[i].classList.add('search-match');
      searchIndex = searchMatches.length > 0 ? 0 : -1;
      updateInfo();
      if (searchMatches.length > 0) {
        searchMatches[0].classList.add('search-current');
        scrollToMatch(searchMatches[0]);
      }
      return;
    }

    // Cooperative search for large DOMs
    let idx = 0;
    const BATCH_TIME = 8;
    function searchBatch() {
      if (searchAbort) return;
      const start = performance.now();
      const batchMatches = [];
      while (idx < len && (performance.now() - start) < BATCH_TIME) {
        if (lines[idx].textContent.toLowerCase().includes(query)) {
          searchMatches.push(lines[idx]);
          batchMatches.push(lines[idx]);
        }
        idx++;
      }
      for (let i = 0; i < batchMatches.length; i++) batchMatches[i].classList.add('search-match');
      updateInfo();
      if (idx < len) {
        requestAnimationFrame(searchBatch);
      } else {
        searchIndex = searchMatches.length > 0 ? 0 : -1;
        updateInfo();
        if (searchMatches.length > 0) {
          searchMatches[0].classList.add('search-current');
          scrollToMatch(searchMatches[0]);
        }
      }
    }
    requestAnimationFrame(searchBatch);
  }

  function performSearchExactKey(keyName) {
    searchAbort = true;
    clearHighlights();
    searchAbort = false;
    const allKeys = $('jsonView').getElementsByClassName('j-key');
    for (let i = 0; i < allKeys.length; i++) {
      const kText = allKeys[i].textContent.replace(/^"|"$/g, '');
      if (kText === keyName) {
        const line = allKeys[i].closest('.j-line');
        if (line) searchMatches.push(line);
      }
    }
    for (let i = 0; i < searchMatches.length; i++) searchMatches[i].classList.add('search-match');
    searchIndex = searchMatches.length > 0 ? 0 : -1;
    updateInfo();
    if (searchMatches.length > 0) {
      searchMatches[0].classList.add('search-current');
      scrollToMatch(searchMatches[0]);
    }
  }

  function navigate(dir) {
    if (searchMatches.length === 0) return;
    searchMatches[searchIndex]?.classList.remove('search-current');
    searchIndex = (searchIndex + dir + searchMatches.length) % searchMatches.length;
    const match = searchMatches[searchIndex];
    match.classList.add('search-current');
    scrollToMatch(match);
    updateInfo();
  }

  function scrollToMatch(match) {
    const { expandParents } = window.App.jsonView;
    expandParents(match, $('jsonView'));
    const container = $('jsonView');
    match.offsetHeight; // force layout
    const matchRect = match.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const offsetTop = matchRect.top - containerRect.top + container.scrollTop;
    container.scrollTo({ top: offsetTop - container.clientHeight / 2 + matchRect.height / 2, behavior: 'instant' });
  }

  function updateInfo() {
    $('searchInfo').textContent = searchMatches.length > 0 ? `${searchIndex + 1}/${searchMatches.length}` : '0/0';
  }

  function clearHighlights() {
    for (let i = 0; i < searchMatches.length; i++) {
      searchMatches[i].classList.remove('search-match', 'search-current');
    }
    searchMatches = [];
  }

  function getMatches() { return searchMatches; }
  function getIndex() { return searchIndex; }

  return {
    toggleSearch, performSearch, performSearchNow, performSearchExactKey,
    navigate, clearHighlights, getSearchParams, getMatches, getIndex
  };
})();
