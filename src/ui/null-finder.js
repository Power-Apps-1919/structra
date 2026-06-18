/**
 * Null/Empty value finder — highlights and navigates null, empty string, empty array/object values.
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
    document.querySelectorAll('.j-null-highlight').forEach(el => el.classList.remove('j-null-highlight'));
  }

  function toggle(jsonData, expandParents) {
    if (!jsonData) { toast('Load JSON first'); return; }
    if (active) { clear(); return; }
    matches = findNullPaths(jsonData);
    if (matches.length === 0) { toast('No null or empty values found'); return; }
    active = true;
    index = 0;
    $('btnNullFinder').classList.add('active');
    toast(`Found ${matches.length} null or empty value${matches.length > 1 ? 's' : ''}. Click again to dismiss.`);
    for (const p of matches) {
      const el = document.querySelector(`[data-path="${CSS.escape(p)}"]`);
      if (el) el.classList.add('j-null-highlight');
    }
    if (matches[0]) {
      const el = document.querySelector(`[data-path="${CSS.escape(matches[0])}"]`);
      if (el) { if (expandParents) expandParents(el); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    }
  }

  function isActive() { return active; }

  return { toggle, clear, isActive };
})();
