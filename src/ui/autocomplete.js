/**
 * Reusable autocomplete — attach to any input with a data source.
 *
 * Usage:
 *   const ac = App.autocomplete.attach(inputEl, {
 *     getItems: () => [{ text: 'users[0].name', type: 'string' }, ...],
 *     onSelect: (item) => { ... },
 *     maxResults: 15,          // default 15
 *     matchMode: 'prefix'      // 'prefix' | 'contains' | 'fuzzy'
 *   });
 *   ac.updateItems(newItems);   // hot-swap item list
 *   ac.destroy();               // cleanup
 */
window.App = window.App || {};
window.App.autocomplete = (() => {
  const { esc } = window.App.dom;

  function attach(inputEl, opts = {}) {
    const maxResults = opts.maxResults || 15;
    const getMatchMode = typeof opts.matchMode === 'function' ? opts.matchMode : () => (opts.matchMode || 'prefix');
    const onSelect = opts.onSelect || (() => {});
    let getItems = opts.getItems || (() => []);

    // Build dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'autocomplete';
    inputEl.parentElement.style.position = 'relative';
    inputEl.parentElement.appendChild(dropdown);

    let items = [];
    let itemsLower = [];
    let selectedIdx = -1;
    let visible = false;

    function rebuildIndex() {
      items = getItems();
      itemsLower = items.map(it => (it.text || '').toLowerCase());
    }

    function updateItems(newItems) {
      getItems = () => newItems;
      rebuildIndex();
    }

    function show(query) {
      if (!query) { hide(); return; }
      if (items.length === 0) rebuildIndex();
      if (items.length === 0) { hide(); return; }
      const qLower = query.toLowerCase();
      const matches = [];

      const mm = getMatchMode();
      for (let i = 0; i < itemsLower.length && matches.length < maxResults; i++) {
        let hit = false;
        if (mm === 'prefix') hit = itemsLower[i].startsWith(qLower);
        else if (mm === 'contains') hit = itemsLower[i].includes(qLower);
        else if (mm === 'fuzzy') hit = fuzzyTest(qLower, itemsLower[i]);
        if (hit) matches.push(items[i]);
      }

      if (matches.length === 0 || (matches.length === 1 && matches[0].text === query)) {
        hide();
        return;
      }

      let html = '';
      for (const m of matches) {
        html += `<div class="ac-item" data-path="${esc(m.text)}">${esc(m.text)}`;
        if (m.type) html += `<span class="ac-type">${esc(m.type)}</span>`;
        html += '</div>';
      }
      dropdown.innerHTML = html;
      dropdown.classList.add('show');
      selectedIdx = -1;
      visible = true;
    }

    function hide() {
      dropdown.classList.remove('show');
      selectedIdx = -1;
      visible = false;
    }

    function navigate(dir) {
      const els = dropdown.getElementsByClassName('ac-item');
      if (els.length === 0) return null;
      // Clear previous
      if (selectedIdx >= 0 && selectedIdx < els.length) els[selectedIdx].classList.remove('active');
      if (dir > 0) selectedIdx = (selectedIdx + 1) % els.length;
      else selectedIdx = (selectedIdx - 1 + els.length) % els.length;
      els[selectedIdx].classList.add('active');
      els[selectedIdx].scrollIntoView({ block: 'nearest' });
      return els[selectedIdx].dataset.path;
    }

    function selectCurrent() {
      const els = dropdown.getElementsByClassName('ac-item');
      if (selectedIdx >= 0 && selectedIdx < els.length) {
        const val = els[selectedIdx].dataset.path;
        hide();
        return val;
      }
      return null;
    }

    function fuzzyTest(query, text) {
      let qi = 0;
      for (let ti = 0; ti < text.length && qi < query.length; ti++) {
        if (text[ti] === query[qi]) qi++;
      }
      return qi === query.length;
    }

    // --- Event handlers ---
    function onInput() {
      show(inputEl.value.trim());
    }

    function onKeydown(e) {
      if (!visible) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const val = navigate(e.key === 'ArrowDown' ? 1 : -1);
        if (val != null) inputEl.value = val;
      } else if (e.key === 'Enter' && selectedIdx >= 0) {
        e.preventDefault();
        const val = selectCurrent();
        if (val != null) {
          inputEl.value = val;
          onSelect({ text: val });
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        hide();
      }
    }

    function onBlur() {
      setTimeout(hide, 150);
    }

    function onMousedown(e) {
      const item = e.target.closest('.ac-item');
      if (!item) return;
      e.preventDefault();
      const val = item.dataset.path;
      inputEl.value = val;
      hide();
      onSelect({ text: val });
    }

    inputEl.addEventListener('input', onInput);
    inputEl.addEventListener('keydown', onKeydown);
    inputEl.addEventListener('blur', onBlur);
    dropdown.addEventListener('mousedown', onMousedown);

    function destroy() {
      inputEl.removeEventListener('input', onInput);
      inputEl.removeEventListener('keydown', onKeydown);
      inputEl.removeEventListener('blur', onBlur);
      dropdown.removeEventListener('mousedown', onMousedown);
      dropdown.remove();
    }

    return { show, hide, updateItems, rebuildIndex, destroy, isVisible: () => visible, hasSelection: () => selectedIdx >= 0 };
  }

  return { attach };
})();
