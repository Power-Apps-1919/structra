/**
 * Table Filter Panel — filter UI with values and conditions tabs.
 * Used by simple-table.js for column-level filtering.
 */
window.App = window.App || {};
window.App.tableFilter = (() => {
  const { esc, toast } = window.App.dom;

  /**
   * Show a filter panel for a column.
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {string} col - Column name
   * @param {Array} data - Current data rows
   * @param {object} filters - Filters object (mutated)
   * @param {Array} conditions - CONDITIONS array from simple-table
   * @param {function} onApply - Called after filter applied/cleared
   */
  function showFilterPanel(x, y, col, data, filters, conditions, onApply) {
    const old = document.getElementById('stFilterPanel');
    if (old) old.remove();

    const uniqueMap = new Map();
    for (const row of data) {
      const val = row[col];
      const key = val == null ? '__null__' : String(val);
      if (!uniqueMap.has(key)) uniqueMap.set(key, val);
    }
    const uniqueKeys = [...uniqueMap.keys()].sort((a, b) => a.localeCompare(b));
    const currentFilter = filters[col];

    const panel = document.createElement('div');
    panel.id = 'stFilterPanel';
    panel.className = 'st-filter-panel';

    const activeTab = currentFilter && currentFilter.type === 'conditions' ? 'conditions' : 'values';

    panel.innerHTML = `
      <div class="st-filter-header">
        <strong>${esc(col)}</strong>
        <span class="st-filter-count">${uniqueKeys.length} unique</span>
      </div>
      <div class="st-filter-tabs">
        <button class="st-tab ${activeTab === 'values' ? 'active' : ''}" data-tab="values">Values</button>
        <button class="st-tab ${activeTab === 'conditions' ? 'active' : ''}" data-tab="conditions">Conditions</button>
      </div>
      <div class="st-tab-body" id="stTabValues" style="${activeTab !== 'values' ? 'display:none' : ''}">
        ${buildValuesTab(uniqueKeys, currentFilter)}
      </div>
      <div class="st-tab-body" id="stTabConditions" style="${activeTab !== 'conditions' ? 'display:none' : ''}">
        ${buildConditionsTab(currentFilter, conditions)}
      </div>
      <div class="st-filter-footer">
        <button class="st-btn st-btn-primary" id="stFilterApply">Apply</button>
        <button class="st-btn" id="stFilterClear">Clear</button>
        <button class="st-btn" id="stFilterCancel">Cancel</button>
      </div>
    `;

    panel.style.left = Math.min(x, window.innerWidth - 300) + 'px';
    panel.style.top = Math.min(y, window.innerHeight - 420) + 'px';
    document.body.appendChild(panel);

    // Tab switching
    panel.querySelectorAll('.st-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll('.st-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        panel.querySelector('#stTabValues').style.display = btn.dataset.tab === 'values' ? '' : 'none';
        panel.querySelector('#stTabConditions').style.display = btn.dataset.tab === 'conditions' ? '' : 'none';
      });
    });

    // Values tab: search
    const searchInput = panel.querySelector('.st-filter-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const term = searchInput.value.toLowerCase();
        panel.querySelectorAll('.st-filter-row').forEach(row => {
          const text = row.querySelector('span').textContent.toLowerCase();
          row.style.display = text.includes(term) ? '' : 'none';
        });
      });
    }

    // Select All / None
    const allLink = panel.querySelector('#stFilterAll');
    const noneLink = panel.querySelector('#stFilterNone');
    if (allLink) allLink.addEventListener('click', e => {
      e.preventDefault();
      panel.querySelectorAll('.st-filter-row input[type=checkbox]').forEach(cb => { if (cb.closest('.st-filter-row').style.display !== 'none') cb.checked = true; });
    });
    if (noneLink) noneLink.addEventListener('click', e => {
      e.preventDefault();
      panel.querySelectorAll('.st-filter-row input[type=checkbox]').forEach(cb => { if (cb.closest('.st-filter-row').style.display !== 'none') cb.checked = false; });
    });

    // Add rule button
    const addBtn = panel.querySelector('#stAddRule');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const list = panel.querySelector('.st-cond-list');
        list.insertAdjacentHTML('beforeend', buildConditionRow('contains', '', conditions));
      });
    }

    // Remove rule (delegated)
    panel.addEventListener('click', e => {
      if (e.target.classList.contains('st-cond-remove')) {
        e.target.closest('.st-cond-row').remove();
      }
    });

    // Apply
    panel.querySelector('#stFilterApply').addEventListener('click', () => {
      const activeTabEl = panel.querySelector('.st-tab.active');
      const tab = activeTabEl ? activeTabEl.dataset.tab : 'values';

      if (tab === 'values') {
        const checked = new Set();
        panel.querySelectorAll('.st-filter-row input[type=checkbox]:checked').forEach(cb => checked.add(cb.value));
        if (checked.size === uniqueKeys.length) {
          delete filters[col];
        } else if (checked.size === 0) {
          toast('Select at least one value');
          return;
        } else {
          filters[col] = { type: 'values', values: checked };
        }
      } else {
        const rules = [];
        panel.querySelectorAll('.st-cond-row').forEach(row => {
          const op = row.querySelector('.st-cond-op').value;
          const val = row.querySelector('.st-cond-val') ? row.querySelector('.st-cond-val').value : '';
          if (op) rules.push({ op, value: val });
        });
        if (rules.length === 0) {
          delete filters[col];
        } else {
          const logic = panel.querySelector('.st-cond-logic') ? panel.querySelector('.st-cond-logic').value : 'and';
          filters[col] = { type: 'conditions', rules, logic };
        }
      }
      panel.remove();
      onApply();
    });

    // Clear
    panel.querySelector('#stFilterClear').addEventListener('click', () => {
      delete filters[col];
      panel.remove();
      onApply();
    });

    // Cancel
    panel.querySelector('#stFilterCancel').addEventListener('click', () => panel.remove());

    // Close on Escape
    const onKey = e => { if (e.key === 'Escape') { panel.remove(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);

    if (searchInput) searchInput.focus();
  }

  function buildValuesTab(uniqueKeys, currentFilter) {
    let listHtml = '';
    for (const key of uniqueKeys) {
      const checked = (!currentFilter || currentFilter.type !== 'values' || currentFilter.values.has(key)) ? 'checked' : '';
      const display = key === '__null__' ? '<em>null</em>' : esc(key.length > 60 ? key.slice(0, 60) + '...' : key);
      listHtml += `<label class="st-filter-row"><input type="checkbox" value="${esc(key)}" ${checked}><span>${display}</span></label>`;
    }
    return `
      <input class="st-filter-search" placeholder="Search values..." type="text">
      <div class="st-filter-actions">
        <a href="#" id="stFilterAll">All</a> | <a href="#" id="stFilterNone">None</a>
      </div>
      <div class="st-filter-list">${listHtml}</div>
    `;
  }

  function buildConditionsTab(currentFilter, conditions) {
    const rules = (currentFilter && currentFilter.type === 'conditions') ? currentFilter.rules : [{ op: 'contains', value: '' }];
    const logic = (currentFilter && currentFilter.type === 'conditions') ? currentFilter.logic : 'and';

    let rulesHtml = '';
    for (const rule of rules) {
      rulesHtml += buildConditionRow(rule.op, rule.value, conditions);
    }

    return `
      <div class="st-cond-logic-row">
        Match
        <select class="st-cond-logic">
          <option value="and" ${logic === 'and' ? 'selected' : ''}>ALL conditions</option>
          <option value="or" ${logic === 'or' ? 'selected' : ''}>ANY condition</option>
        </select>
      </div>
      <div class="st-cond-list">${rulesHtml}</div>
      <button class="st-btn st-btn-sm" id="stAddRule">+ Add Condition</button>
    `;
  }

  function buildConditionRow(op, value, conditions) {
    const needsValue = !['is-empty', 'not-empty'].includes(op);
    let options = '';
    for (const c of conditions) {
      options += `<option value="${c.id}" ${c.id === op ? 'selected' : ''}>${c.label}</option>`;
    }
    return `
      <div class="st-cond-row">
        <select class="st-cond-op" onchange="this.nextElementSibling&&(this.nextElementSibling.style.display=['is-empty','not-empty'].includes(this.value)?'none':'')">${options}</select>
        <input class="st-cond-val" type="text" value="${esc(value)}" placeholder="value..." style="${needsValue ? '' : 'display:none'}">
        <button class="st-cond-remove" title="Remove">✕</button>
      </div>
    `;
  }

  return { showFilterPanel };
})();
