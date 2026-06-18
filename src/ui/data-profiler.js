/**
 * Data Profiler — per-field statistics for arrays of objects
 */
window.App = window.App || {};
window.App.dataProfiler = (() => {
  const { $, toast, esc } = window.App.dom;
  const { profileKeys } = window.App.jsonUtils;

  function profile(arr) {
    if (!Array.isArray(arr) || arr.length === 0 || typeof arr[0] !== 'object') return null;

    const profiled = profileKeys(arr);
    const fields = [];

    for (const { key, present, total, types, sampleVal } of profiled) {
      const values = arr.map(obj => (obj && obj[key] !== undefined) ? obj[key] : undefined);
      const defined = values.filter(v => v !== undefined);
      const nonNull = defined.filter(v => v !== null && v !== '');

      const field = {
        key,
        count: present,
        total,
        coverage: ((present / total) * 100).toFixed(0),
        nullPct: (((present - nonNull.length) / total) * 100).toFixed(0),
        types,
        primaryType: Object.entries(types).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown',
      };

      // Numeric stats
      const nums = nonNull.filter(v => typeof v === 'number');
      if (nums.length > 0) {
        field.min = Math.min(...nums);
        field.max = Math.max(...nums);
        field.avg = (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2);
        field.sum = nums.reduce((a, b) => a + b, 0);
      }

      // Unique values
      const uniq = new Set(nonNull.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)));
      field.unique = uniq.size;
      field.uniquePct = ((uniq.size / Math.max(nonNull.length, 1)) * 100).toFixed(0);

      // Top values (for strings/booleans)
      if (field.primaryType === 'string' || field.primaryType === 'boolean') {
        const freq = {};
        for (const v of nonNull) { const s = String(v); freq[s] = (freq[s] || 0) + 1; }
        field.topValues = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([val, cnt]) => ({ val, cnt }));
      }

      fields.push(field);
    }

    return { fields, rowCount: arr.length, fieldCount: profiled.length, quality: computeQuality(fields, arr.length) };
  }

  function computeQuality(fields, rowCount) {
    if (fields.length === 0) return { overall: 100, completeness: 100, consistency: 100, uniqueness: 100, issues: [] };

    // Completeness: 100 - avg(nullPct)
    const avgNull = fields.reduce((s, f) => s + parseFloat(f.nullPct), 0) / fields.length;
    const completeness = Math.max(0, 100 - avgNull);

    // Consistency: % of fields that have a single non-null type
    const consistentCount = fields.filter(f => {
      const typeKeys = Object.keys(f.types).filter(t => t !== 'null');
      return typeKeys.length <= 1;
    }).length;
    const consistency = (consistentCount / fields.length) * 100;

    // Uniqueness: avg uniquePct for string/number fields (skip booleans)
    const uniqFields = fields.filter(f => f.primaryType === 'string' || f.primaryType === 'number');
    const uniqueness = uniqFields.length > 0
      ? uniqFields.reduce((s, f) => s + parseFloat(f.uniquePct), 0) / uniqFields.length
      : 100;

    const overall = Math.round(completeness * 0.4 + consistency * 0.35 + uniqueness * 0.25);

    // Top issues
    const issues = [];
    for (const f of fields) {
      const np = parseFloat(f.nullPct);
      if (np >= 30) issues.push({ field: f.key, type: 'null', msg: `${np}% null`, severity: np >= 60 ? 'high' : 'med' });
      const typeKeys = Object.keys(f.types).filter(t => t !== 'null');
      if (typeKeys.length > 1) issues.push({ field: f.key, type: 'mixed', msg: `mixed types (${typeKeys.join(', ')})`, severity: 'high' });
      if (f.primaryType === 'string' && parseFloat(f.uniquePct) < 5 && parseFloat(f.coverage) > 50) {
        issues.push({ field: f.key, type: 'dup', msg: `only ${f.uniquePct}% unique`, severity: 'med' });
      }
    }
    issues.sort((a, b) => (a.severity === 'high' ? 0 : 1) - (b.severity === 'high' ? 0 : 1));

    return { overall, completeness: Math.round(completeness), consistency: Math.round(consistency), uniqueness: Math.round(uniqueness), issues: issues.slice(0, 5) };
  }

  function renderPanel(profileData) {
    if (!profileData) return;

    let existing = document.getElementById('profilerPanel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.className = 'profiler-panel show';
    panel.id = 'profilerPanel';

    let html = `<div class="profiler-header">
      <span class="profiler-title">Data Profile: ${profileData.rowCount} rows, ${profileData.fieldCount} fields</span>
      <button class="qp-close" id="profilerClose">&#10005;</button>
    </div>`;

    // Quality Score section
    if (profileData.quality) {
      const q = profileData.quality;
      const color = q.overall >= 80 ? '#22c55e' : q.overall >= 50 ? '#f59e0b' : '#ef4444';
      const colorClass = q.overall >= 80 ? 'good' : q.overall >= 50 ? 'warn' : 'bad';
      html += `<div class="pf-quality">
        <div class="pf-q-score pf-q-${colorClass}">
          <svg viewBox="0 0 36 36" class="pf-q-ring">
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none" stroke="var(--border)" stroke-width="2.5"/>
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none" stroke="${color}" stroke-width="2.5"
              stroke-dasharray="${q.overall}, 100" stroke-linecap="round"/>
          </svg>
          <span class="pf-q-num">${q.overall}</span>
        </div>
        <div class="pf-q-bars">
          <div class="pf-q-bar-row"><span class="pf-q-label">Completeness</span>
            <div class="pf-q-track"><div class="pf-q-fill" style="width:${q.completeness}%;background:${q.completeness >= 80 ? '#22c55e' : q.completeness >= 50 ? '#f59e0b' : '#ef4444'}"></div></div>
            <span class="pf-q-val">${q.completeness}%</span></div>
          <div class="pf-q-bar-row"><span class="pf-q-label">Consistency</span>
            <div class="pf-q-track"><div class="pf-q-fill" style="width:${q.consistency}%;background:${q.consistency >= 80 ? '#22c55e' : q.consistency >= 50 ? '#f59e0b' : '#ef4444'}"></div></div>
            <span class="pf-q-val">${q.consistency}%</span></div>
          <div class="pf-q-bar-row"><span class="pf-q-label">Uniqueness</span>
            <div class="pf-q-track"><div class="pf-q-fill" style="width:${q.uniqueness}%;background:${q.uniqueness >= 80 ? '#22c55e' : q.uniqueness >= 50 ? '#f59e0b' : '#ef4444'}"></div></div>
            <span class="pf-q-val">${q.uniqueness}%</span></div>
        </div>
        ${q.issues.length > 0 ? `<div class="pf-q-issues"><span class="pf-q-issues-title">Top Issues</span>${q.issues.map(i =>
          `<div class="pf-q-issue pf-q-issue-${i.severity}"><span class="pf-q-issue-field">${esc(i.field)}</span> ${esc(i.msg)}</div>`
        ).join('')}</div>` : ''}
      </div>`;
    }

    html += `<div class="profiler-body"><table class="profiler-table">
      <thead><tr>
        <th>Field</th><th>Type</th><th>Coverage</th><th>Null%</th><th>Unique</th><th>Min</th><th>Max</th><th>Avg</th><th>Top Values</th>
      </tr></thead><tbody>`;

    for (const f of profileData.fields) {
      const topStr = f.topValues ? f.topValues.map(t => `${esc(t.val)} (${t.cnt})`).join(', ') : '-';
      html += `<tr>
        <td class="pf-key">${esc(f.key)}</td>
        <td><span class="pf-type pf-type-${f.primaryType}">${f.primaryType}</span></td>
        <td>${f.coverage}%</td>
        <td>${f.nullPct}%</td>
        <td>${f.unique} <small>(${f.uniquePct}%)</small></td>
        <td>${f.min != null ? f.min : '-'}</td>
        <td>${f.max != null ? f.max : '-'}</td>
        <td>${f.avg != null ? f.avg : '-'}</td>
        <td class="pf-top">${topStr}</td>
      </tr>`;
    }

    html += '</tbody></table></div>';
    panel.innerHTML = html;
    document.body.appendChild(panel);

    document.getElementById('profilerClose').addEventListener('click', () => panel.remove());
  }

  function showForData(data) {
    // Find the first meaningful array using shared helper
    const arr = window.App.traverse.findArrayOfObjects(data);

    if (!arr) { toast('No data to profile. Load an array of objects first.'); return; }
    const result = profile(arr);
    if (result) renderPanel(result);
  }

  return { profile, renderPanel, showForData };
})();
