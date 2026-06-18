/**
 * JSON stats, array discovery, key analysis
 */
window.App = window.App || {};
window.App.stats = (() => {
  const { $, esc } = window.App.dom;
  const { collectPaths, findAllArrays } = window.App.traverse;
  const { resolvePath } = window.App.path;
  const { analyzeKeys, analyzeNestedKeys, collectArrayItems } = window.App.jsonUtils;
  let evaluatePathFn = null;
  let currentMainArr = null; // Track current array for click handlers
  let currentJsonData = null; // Store for re-resolution on array click
  let drillStack = []; // Stack of { path, data } for drill-up

  function closeMissingPopup() {
    const existing = document.querySelector('.missing-panel');
    if (existing) existing.remove();
    document.removeEventListener('click', onDocClickMissing, true);
  }

  function onDocClickMissing(e) {
    const panel = document.querySelector('.missing-panel');
    if (panel && !panel.contains(e.target) && !e.target.closest('[data-missingkey]')) {
      closeMissingPopup();
    }
  }

  function showMissingObjects(keyName, arrInfo, anchorEl) {
    closeMissingPopup();
    if (!arrInfo || !arrInfo.data) return;
    const data = arrInfo.data;
    const missingIndices = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row || typeof row !== 'object') { missingIndices.push(i); continue; }
      // Key truly missing from object (not just empty value)
      if (!Object.prototype.hasOwnProperty.call(row, keyName)) missingIndices.push(i);
    }
    if (missingIndices.length === 0) return;
    showIndicesPopup(`Missing "${keyName}"`, missingIndices, arrInfo, anchorEl);
  }

  function showEmptyObjects(keyName, arrInfo, anchorEl) {
    closeMissingPopup();
    if (!arrInfo || !arrInfo.data) return;
    const data = arrInfo.data;
    const emptyIndices = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row || typeof row !== 'object') continue;
      if (Object.prototype.hasOwnProperty.call(row, keyName)) {
        const val = row[keyName];
        if (val === null || val === undefined || val === '') emptyIndices.push(i);
      }
    }
    if (emptyIndices.length === 0) return;
    showIndicesPopup(`Empty "${keyName}"`, emptyIndices, arrInfo, anchorEl);
  }

  function showIndicesPopup(title, indices, arrInfo, anchorEl) {
    const basePath = arrInfo.path === '(root)' ? '' : arrInfo.path;
    const maxShow = 50;
    const showing = indices.slice(0, maxShow);
    let html = `<div class="missing-panel"><div class="missing-header"><span class="missing-header-text">${title} (${indices.length})</span><span class="missing-close" title="Close">&times;</span></div><div class="missing-list">`;
    for (const idx of showing) {
      const path = basePath ? `${basePath}[${idx}]` : `[${idx}]`;
      html += `<span class="missing-item" data-statpath="${esc(path)}">[${idx}]</span>`;
    }
    if (indices.length > maxShow) {
      html += `<span class="missing-more">...and ${indices.length - maxShow} more</span>`;
    }
    html += `</div></div>`;

    // Position as popup near the clicked cell
    document.body.insertAdjacentHTML('beforeend', html);
    const panel = document.querySelector('.missing-panel');
    panel.querySelector('.missing-close').addEventListener('click', closeMissingPopup);

    // Handle clicks on missing items inside the popup
    panel.addEventListener('click', function(e) {
      const item = e.target.closest('[data-statpath]');
      if (item) {
        if (window.App.switchToJsonView) window.App.switchToJsonView();
        $('pathInput').value = item.dataset.statpath;
        evaluatePathFn(item.dataset.statpath);
      }
    });

    // Position near anchor element
    const rect = anchorEl.getBoundingClientRect();
    let top = rect.bottom + 4;
    let left = rect.left;
    // Keep within viewport
    const panelRect = panel.getBoundingClientRect();
    if (left + panelRect.width > window.innerWidth - 8) left = window.innerWidth - panelRect.width - 8;
    if (top + panelRect.height > window.innerHeight - 8) top = rect.top - panelRect.height - 4;
    if (left < 4) left = 4;
    panel.style.top = top + 'px';
    panel.style.left = left + 'px';

    // Close on outside click (deferred so this click doesn't trigger it)
    setTimeout(() => document.addEventListener('click', onDocClickMissing, true), 0);
  }

  function buildKeyCoverageHtml(path, data) {
    const keyAnalysis = analyzeKeys(data);
    if (!keyAnalysis || keyAnalysis.length === 0) return '';
    const backBtn = drillStack.length > 0
      ? ` <span class="stat-drill-back" data-drillback="1" title="Go back to ${esc(drillStack[drillStack.length - 1].path)}">↑ Back</span>`
      : '';
    let html = `<div class="stat-section-label-mt">Key Coverage (${esc(path)}) <span style="font-weight:400;color:var(--text-sec);font-size:11px">${data.length} rows</span>${backBtn}</div>`;
    html += `<table class="stat-table"><tr><th>Key</th><th>Present</th><th>Empty</th><th>Missing</th><th>%</th></tr>`;
    const sorted = [...keyAnalysis].sort((a, b) => b.missing - a.missing || b.empty - a.empty);
    for (const k of sorted) {
      const color = k.pct === 100 ? 'var(--success)' : k.pct >= 80 ? 'var(--warning)' : 'var(--danger)';
      const missingCell = k.missing > 0
        ? `<td class="stat-missing-cell" data-missingkey="${esc(k.key)}"><strong>${k.missing}</strong></td>`
        : `<td>-</td>`;
      const emptyCell = k.empty > 0
        ? `<td class="stat-empty-cell" data-emptykey="${esc(k.key)}">${k.empty}</td>`
        : `<td>-</td>`;
      const typeTag = k.type === 'object' ? ' <span class="stat-nested-tag" data-nestedkey="' + esc(k.key) + '">▶ {…}</span>'
                    : k.type === 'array' ? ' <span class="stat-nested-tag" data-arraykey="' + esc(k.key) + '">[…]</span>' : '';
      html += `<tr><td class="stat-key-cell" data-keyname="${esc(k.key)}">${esc(k.key)}${typeTag}</td><td>${k.present}</td>${emptyCell}${missingCell}<td class="stat-pct-bold" style="color:${color}">${k.pct}%</td></tr>`;
      if (k.type === 'object') {
        const nested = analyzeNestedKeys(data, k.key);
        if (nested.length > 0) {
          const nestedSorted = [...nested].sort((a, b) => b.missing - a.missing || b.empty - a.empty);
          for (const nk of nestedSorted) {
            const nc = nk.pct === 100 ? 'var(--success)' : nk.pct >= 80 ? 'var(--warning)' : 'var(--danger)';
            const nm = nk.missing > 0 ? `<td><strong>${nk.missing}</strong></td>` : `<td>-</td>`;
            const ne = nk.empty > 0 ? `<td>${nk.empty}</td>` : `<td>-</td>`;
            const nestedTypeTag = nk.type === 'object' ? ' <span class="stat-nested-tag-arr">{…}</span>'
                                : nk.type === 'array' ? ' <span class="stat-nested-tag-arr">[…]</span>' : '';
            html += `<tr class="stat-nested-row" data-parent="${esc(k.key)}" style="display:none"><td class="stat-key-cell" style="padding-left:20px;color:var(--text-sec)"><span style="color:var(--text-muted)">└ </span>${esc(nk.key)}${nestedTypeTag}</td><td>${nk.present}</td>${ne}${nm}<td class="stat-pct-bold" style="color:${nc}">${nk.pct}%</td></tr>`;
          }
        }
      }
    }
    html += `</table>`;
    return html;
  }

  function updateKeyCoverage(statsEl, path, data) {
    // Remove existing key coverage section and replace
    const existing = statsEl.querySelector('.stat-section-label-mt');
    if (existing) {
      // Remove the label and the table that follows it
      let el = existing;
      const toRemove = [el];
      while (el.nextElementSibling && !el.nextElementSibling.classList.contains('stat-section-label')) {
        toRemove.push(el.nextElementSibling);
        el = el.nextElementSibling;
      }
      toRemove.forEach(e => e.remove());
    }
    // Append new key coverage HTML
    const frag = document.createElement('div');
    frag.innerHTML = buildKeyCoverageHtml(path, data);
    while (frag.firstChild) statsEl.appendChild(frag.firstChild);
    // Update mini-grid rows count
    const sv = statsEl.querySelector('.stat-mini .sv');
    if (sv) sv.textContent = data.length.toLocaleString();
    // Update keys count
    const keyAnalysis = analyzeKeys(data);
    const svAll = statsEl.querySelectorAll('.stat-mini .sv');
    if (svAll[1]) svAll[1].textContent = keyAnalysis.length;
    const keysWithGaps = keyAnalysis.filter(k => k.missing > 0).length;
    if (svAll[2]) { svAll[2].textContent = keysWithGaps; svAll[2].closest('.stat-mini').className = 'stat-mini ' + (keysWithGaps > 0 ? 'warn' : 'ok'); }
  }

  function renderStats(jsonData, evaluatePath) {
    evaluatePathFn = evaluatePath;
    currentJsonData = jsonData;
    drillStack = [];
    const stats = $('statsBody');
    const arrays = findAllArrays(jsonData);
    const mainArr = arrays[0];
    currentMainArr = mainArr; // Update module-level reference for click handlers
    let totalRows = mainArr ? mainArr.count : 0;
    let totalKeys = 0, keysWithGaps = 0, keyAnalysis = null;

    if (mainArr && mainArr.data.length > 0 && typeof mainArr.data[0] === 'object') {
      keyAnalysis = analyzeKeys(mainArr.data);
      totalKeys = keyAnalysis.length;
      keysWithGaps = keyAnalysis.filter(k => k.missing > 0).length;
    }

    let html = `<div class="stat-mini-grid">
      <div class="stat-mini"><div class="sv">${totalRows.toLocaleString()}</div><div class="sl">Rows</div></div>
      <div class="stat-mini"><div class="sv">${totalKeys}</div><div class="sl">Keys</div></div>
      <div class="stat-mini ${keysWithGaps > 0 ? 'warn' : 'ok'}"><div class="sv">${keysWithGaps}</div><div class="sl">Gaps</div></div>
    </div>`;

    if (arrays.length > 1) {
      html += `<div class="stat-section-label">Arrays Found (${arrays.length})</div>`;
      html += `<table class="stat-table"><tr><th>Path</th><th>Count</th></tr>`;
      for (const a of arrays) {
        const isPrimitive = a.data.length > 0 && (typeof a.data[0] !== 'object' || a.data[0] === null);
        const primTag = isPrimitive ? ' <span class="stat-prim-tag">primitive</span>' : '';
        const cls = isPrimitive ? 'stat-path-cell stat-path-prim' : 'stat-path-cell';
        html += `<tr><td class="${cls}" data-statpath="${esc(a.path)}">${esc(a.path)}${primTag}</td><td><strong>${a.count.toLocaleString()}</strong></td></tr>`;
      }
      html += `</table>`;
    }

    if (keyAnalysis && keyAnalysis.length > 0) {
      html += buildKeyCoverageHtml(mainArr.path, mainArr.data);
    }

    stats.innerHTML = html;
    // Use event delegation — single listener, not per-element (avoids re-binding on each renderStats call)
    if (!stats._delegated) {
      stats._delegated = true;
      stats.addEventListener('click', e => {
        // Toggle nested key rows
        const nestedTag = e.target.closest('[data-nestedkey]');
        if (nestedTag) {
          const key = nestedTag.dataset.nestedkey;
          const rows = stats.querySelectorAll(`.stat-nested-row[data-parent="${key}"]`);
          const isOpen = rows[0]?.style.display !== 'none';
          rows.forEach(r => r.style.display = isOpen ? 'none' : '');
          nestedTag.textContent = isOpen ? '▶ {…}' : '▼ {…}';
          return;
        }
        // Click on array key tag → drill into that array
        const arrayTag = e.target.closest('[data-arraykey]');
        if (arrayTag) {
          const key = arrayTag.dataset.arraykey;
          const newPath = (currentMainArr ? currentMainArr.path : '') + '[*].' + key;
          // Don't drill if already at this path
          if (currentMainArr && currentMainArr.path === newPath) return;
          // Collect all values of this key from current array, flatten arrays
          const merged = currentMainArr && currentMainArr.data ? collectArrayItems(currentMainArr.data, key) : [];
          if (merged.length > 0 && typeof merged[0] === 'object' && merged[0] !== null) {
            // Only push to stack when drill actually succeeds
            if (currentMainArr) {
              drillStack.push({ path: currentMainArr.path, data: currentMainArr.data });
            }
            currentMainArr = { path: newPath, count: merged.length, data: merged };
            updateKeyCoverage(stats, newPath, merged);
            $('pathInput').value = newPath;
            evaluatePathFn(newPath);
          } else if (merged.length > 0) {
            // Primitive array — just show count
            const { toast } = window.App.dom;
            toast(`${key}: ${merged.length} values (simple list)`);
          } else {
            const { toast } = window.App.dom;
            toast(`${key}: empty arrays`);
          }
          return;
        }
        // Drill-back button
        const drillBack = e.target.closest('[data-drillback]');
        if (drillBack && drillStack.length > 0) {
          const prev = drillStack.pop();
          currentMainArr = { path: prev.path, count: prev.data.length, data: prev.data };
          updateKeyCoverage(stats, prev.path, prev.data);
          $('pathInput').value = prev.path;
          evaluatePathFn(prev.path);
          return;
        }
        const missingEl = e.target.closest('[data-missingkey]');
        if (missingEl) {
          const keyName = missingEl.dataset.missingkey;
          showMissingObjects(keyName, currentMainArr, missingEl);
          return;
        }
        const emptyEl = e.target.closest('[data-emptykey]');
        if (emptyEl) {
          const keyName = emptyEl.dataset.emptykey;
          showEmptyObjects(keyName, currentMainArr, emptyEl);
          return;
        }
        const keyEl = e.target.closest('[data-keyname]');
        if (keyEl) {
          const keyName = keyEl.dataset.keyname;
          if (window.App.highlightKeyInView) window.App.highlightKeyInView(keyName);
          return;
        }
        const el = e.target.closest('[data-statpath]');
        if (el) {
          const clickedPath = el.dataset.statpath;
          // Always update path input and evaluate in JSON view (without switching)
          $('pathInput').value = clickedPath;
          evaluatePathFn(clickedPath);
          // Resolve the array data for this path
          const resolved = resolvePath(currentJsonData, clickedPath);
          if (Array.isArray(resolved) && resolved.length > 0 && typeof resolved[0] === 'object') {
            // Reset drill stack when switching arrays from the table
            drillStack = [];
            // Update key coverage section inline
            currentMainArr = { path: clickedPath, count: resolved.length, data: resolved };
            updateKeyCoverage(stats, clickedPath, resolved);
          } else if (Array.isArray(resolved) && resolved.length > 0) {
            const { toast } = window.App.dom;
            toast(`Simple list with ${resolved.length} values. No keys to analyze.`);
          }
          // Highlight the clicked row
          stats.querySelectorAll('.stat-path-cell').forEach(c => c.classList.remove('stat-path-active'));
          el.classList.add('stat-path-active');
        }
      });
      stats.addEventListener('dblclick', e => {
        const keyEl = e.target.closest('[data-keyname]');
        if (keyEl) {
          const keyName = keyEl.dataset.keyname;
          if (window.App.searchForKey) window.App.searchForKey(keyName);
        }
      });
    }
  }

  return { collectAllPaths: collectPaths, renderStats };
})();
