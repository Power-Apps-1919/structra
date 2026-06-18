/**
 * Data Visualization — size heatmap & mini charts (sparklines/bar charts)
 * for the JSON tree view.
 */
window.App = window.App || {};
window.App.dataViz = (() => {
  const { formatSize, getByteSize } = window.App.format;

  // =====================================================
  //  SIZE HEATMAP
  // =====================================================

  let heatmapActive = false;

  function computeSizes(data) {
    const { walk } = window.App.traverse;
    const sizes = new Map();
    walk(data, (val, path) => {
      sizes.set(path, getByteSize(val));
    }, { maxDepth: 50 });
    return sizes;
  }

  function getColor(size, maxSize) {
    const ratio = Math.min(size / maxSize, 1);
    if (ratio < 0.1) return '';
    if (ratio < 0.3) return 'rgba(250, 204, 21, 0.12)';
    if (ratio < 0.5) return 'rgba(249, 115, 22, 0.15)';
    if (ratio < 0.7) return 'rgba(239, 68, 68, 0.15)';
    return 'rgba(239, 68, 68, 0.25)';
  }

  function applyHeatmap(data) {
    const sizes = computeSizes(data);
    const maxSize = Math.max(...sizes.values(), 1);
    const lines = document.querySelectorAll('[data-path]');

    for (const el of lines) {
      const path = el.getAttribute('data-path');
      const size = sizes.get(path);
      if (size == null) continue;
      const color = getColor(size, maxSize);
      if (color) {
        el.style.background = color;
        if (size > maxSize * 0.2 && !el.querySelector('.size-badge')) {
          const badge = document.createElement('span');
          badge.className = 'size-badge';
          badge.textContent = formatSize(size);
          el.appendChild(badge);
        }
      }
    }
    heatmapActive = true;
  }

  function clearHeatmap() {
    const lines = document.querySelectorAll('[data-path]');
    for (const el of lines) {
      el.style.background = '';
    }
    document.querySelectorAll('.size-badge').forEach(b => b.remove());
    heatmapActive = false;
  }

  function toggleHeatmap(data) {
    if (heatmapActive) clearHeatmap();
    else applyHeatmap(data);
    return heatmapActive;
  }

  function isHeatmapActive() { return heatmapActive; }

  // =====================================================
  //  MINI CHARTS — sparklines & bar charts
  // =====================================================

  let chartsActive = false;

  function isNumericArray(arr) {
    if (!Array.isArray(arr) || arr.length < 2) return false;
    return arr.every(v => typeof v === 'number' && isFinite(v));
  }

  function createSparkline(values, width = 80, height = 18) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const step = width / (values.length - 1);

    const points = values.map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
    const title = `min: ${min}, max: ${max}, avg: ${avg}, count: ${values.length}`;

    return `<span class="mini-chart" title="${title}">
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <polyline points="${points}" fill="none" stroke="var(--primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </span>`;
  }

  function createBarChart(values, width = 80, height = 18) {
    const max = Math.max(...values.map(Math.abs));
    const barW = Math.max(2, (width / values.length) - 1);
    const bars = values.map((v, i) => {
      const h = max === 0 ? 0 : (Math.abs(v) / max) * (height - 2);
      const x = i * (barW + 1);
      const y = height - h - 1;
      const color = v >= 0 ? 'var(--primary)' : 'var(--danger)';
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${h.toFixed(1)}" fill="${color}" opacity="0.7" rx="1"/>`;
    }).join('');

    const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
    const title = `min: ${Math.min(...values)}, max: ${Math.max(...values)}, avg: ${avg}, count: ${values.length}`;

    return `<span class="mini-chart" title="${title}">
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${bars}</svg>
    </span>`;
  }

  function applyCharts(data) {
    clearCharts();
    const { walk } = window.App.traverse;

    walk(data, (val, path) => {
      if (Array.isArray(val)) {
        if (isNumericArray(val)) {
          const selector = `[data-path="${CSS.escape(path)}"]`;
          const el = document.querySelector(selector);
          if (el && !el.querySelector('.mini-chart')) {
            const chart = val.length <= 20 ? createBarChart(val) : createSparkline(val);
            el.insertAdjacentHTML('beforeend', ' ' + chart);
          }
          return false;
        }
      } else if (val && typeof val === 'object') {
        for (const [k, v] of Object.entries(val)) {
          if (Array.isArray(v) && isNumericArray(v)) {
            const childPath = path ? `${path}.${k}` : k;
            const selector = `[data-path="${CSS.escape(childPath)}"]`;
            const el = document.querySelector(selector);
            if (el && !el.querySelector('.mini-chart')) {
              const chart = v.length <= 20 ? createBarChart(v) : createSparkline(v);
              el.insertAdjacentHTML('beforeend', ' ' + chart);
            }
          }
        }
      }
    }, { maxDepth: 50 });

    chartsActive = true;
  }

  function clearCharts() {
    document.querySelectorAll('.mini-chart').forEach(el => {
      if (el.previousSibling && el.previousSibling.nodeType === 3 && el.previousSibling.textContent === ' ') {
        el.previousSibling.remove();
      }
      el.remove();
    });
    chartsActive = false;
  }

  function toggleCharts(data) {
    if (chartsActive) clearCharts();
    else applyCharts(data);
    return chartsActive;
  }

  function isChartsActive() { return chartsActive; }

  return {
    // Heatmap
    applyHeatmap, clearHeatmap, toggleHeatmap, isHeatmapActive,
    // Charts
    applyCharts, clearCharts, toggleCharts, isChartsActive,
    createSparkline, createBarChart
  };
})();

// Backward-compatible aliases
window.App.sizeHeatmap = {
  apply: window.App.dataViz.applyHeatmap,
  clear: window.App.dataViz.clearHeatmap,
  toggle: window.App.dataViz.toggleHeatmap,
  isActive: window.App.dataViz.isHeatmapActive
};
window.App.miniCharts = {
  apply: window.App.dataViz.applyCharts,
  clear: window.App.dataViz.clearCharts,
  toggle: window.App.dataViz.toggleCharts,
  isActive: window.App.dataViz.isChartsActive,
  createSparkline: window.App.dataViz.createSparkline,
  createBarChart: window.App.dataViz.createBarChart
};
