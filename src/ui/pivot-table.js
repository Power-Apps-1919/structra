(function () {
  'use strict';

  /**
   * Pivot Table — takes an array of objects and lets user pick
   * a "group by" field, then aggregates numeric fields (sum, avg, count).
   */

  let panel = null;

  function show(data) {
    // Find first array of objects
    const arr = window.App.traverse.findArrayOfObjects(data);
    if (!arr || arr.length === 0) {
      window.App.toast && window.App.toast('No array of objects found for pivot table');
      return;
    }

    const fields = Object.keys(arr[0]);
    const stringFields = fields.filter(f => typeof arr[0][f] === 'string' || typeof arr[0][f] === 'boolean');
    const numFields = fields.filter(f => arr.some(row => typeof row[f] === 'number'));

    if (stringFields.length === 0) {
      window.App.toast && window.App.toast('No text or category fields to group by');
      return;
    }

    createPanel(arr, fields, stringFields, numFields);
  }

  function createPanel(arr, fields, stringFields, numFields) {
    close();

    panel = document.createElement('div');
    panel.className = 'pivot-panel show';
    panel.id = 'pivotPanel';
    panel.innerHTML = `
      <div class="pivot-header">
        <span class="pivot-title">Pivot Table: ${arr.length} rows</span>
        <div class="pivot-controls">
          <label>Group by: <select class="pivot-select" id="pivotGroupBy">
            ${stringFields.map(f => `<option value="${f}">${f}</option>`).join('')}
          </select></label>
          <label>Aggregate: <select class="pivot-select" id="pivotAgg">
            <option value="count">Count</option>
            ${numFields.length ? '<option value="sum">Sum</option><option value="avg">Average</option><option value="min">Min</option><option value="max">Max</option>' : ''}
          </select></label>
          ${numFields.length ? `<label>Value: <select class="pivot-select" id="pivotValue">${numFields.map(f => `<option value="${f}">${f}</option>`).join('')}</select></label>` : ''}
          <button class="toolbar-btn" id="pivotClose" title="Close">✕</button>
        </div>
      </div>
      <div class="pivot-body" id="pivotBody"></div>
    `;

    document.body.appendChild(panel);

    const groupSel = panel.querySelector('#pivotGroupBy');
    const aggSel = panel.querySelector('#pivotAgg');
    const valSel = panel.querySelector('#pivotValue');
    const closeBtn = panel.querySelector('#pivotClose');

    const rebuild = () => renderPivot(arr, groupSel.value, aggSel.value, valSel ? valSel.value : null);

    groupSel.addEventListener('change', rebuild);
    aggSel.addEventListener('change', rebuild);
    if (valSel) valSel.addEventListener('change', rebuild);
    closeBtn.addEventListener('click', close);

    rebuild();
  }

  function renderPivot(arr, groupField, aggType, valueField) {
    const body = panel.querySelector('#pivotBody');
    const groups = {};

    arr.forEach(row => {
      const key = String(row[groupField] ?? '(null)');
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    });

    const rows = Object.entries(groups).map(([key, items]) => {
      let value;
      if (aggType === 'count') {
        value = items.length;
      } else if (valueField) {
        const nums = items.map(r => r[valueField]).filter(n => typeof n === 'number');
        if (nums.length === 0) { value = '-'; }
        else if (aggType === 'sum') value = nums.reduce((a, b) => a + b, 0);
        else if (aggType === 'avg') value = (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2);
        else if (aggType === 'min') value = Math.min(...nums);
        else if (aggType === 'max') value = Math.max(...nums);
      } else {
        value = items.length;
      }
      return { key, value, count: items.length };
    });

    rows.sort((a, b) => (typeof b.value === 'number' ? b.value : 0) - (typeof a.value === 'number' ? a.value : 0));

    const label = aggType === 'count' ? 'Count' : `${aggType}(${valueField})`;

    body.innerHTML = `
      <table class="pivot-table">
        <thead><tr><th>${groupField}</th><th>${label}</th><th>Count</th><th>Bar</th></tr></thead>
        <tbody>${rows.map(r => {
          const maxVal = Math.max(...rows.map(x => typeof x.value === 'number' ? x.value : 0));
          const pct = typeof r.value === 'number' && maxVal > 0 ? (r.value / maxVal * 100) : 0;
          return `<tr>
            <td class="pv-key">${window.App.dom.esc(r.key)}</td>
            <td class="pv-val">${r.value}</td>
            <td class="pv-count">${r.count}</td>
            <td class="pv-bar"><div class="pv-bar-fill" style="width:${pct}%"></div></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    `;
  }

  function close() {
    if (panel) {
      panel.remove();
      panel = null;
    }
  }

  window.App = window.App || {};
  window.App.pivotTable = { show, close };
})();
