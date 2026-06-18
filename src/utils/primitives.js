/**
 * Shared helpers — formatting, naming, type detection, date utilities
 */
window.App = window.App || {};
window.App.primitives = (() => {

  // --- Formatting ---

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    if (bytes < 1099511627776) return (bytes / 1073741824).toFixed(1) + ' GB';
    return (bytes / 1099511627776).toFixed(1) + ' TB';
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const now = Date.now();
    const diff = now - d.getTime();
    const abs = Math.abs(diff);
    const future = diff < 0;
    const prefix = future ? 'in ' : '';
    const suffix = future ? '' : ' ago';
    if (abs < 60000) return 'just now';
    if (abs < 3600000) return prefix + Math.floor(abs / 60000) + 'm' + suffix;
    if (abs < 86400000) return prefix + Math.floor(abs / 3600000) + 'h' + suffix;
    if (abs < 2592000000) return prefix + Math.floor(abs / 86400000) + 'd' + suffix;
    if (abs < 31536000000) return prefix + Math.floor(abs / 2592000000) + 'mo' + suffix;
    return prefix + Math.floor(abs / 31536000000) + 'y' + suffix;
  }

  function relativeTime(date) { return formatTime(date.getTime()); }

  function getByteSize(val) {
    try { return JSON.stringify(val).length; } catch { return 0; }
  }

  // --- Naming conventions ---

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function camelCase(s) { return s.replace(/[-_](\w)/g, (_, c) => c.toUpperCase()); }
  function pascalCase(s) { return capitalize(camelCase(s)); }
  function snakeCase(s) { return s.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '').replace(/[-\s]+/g, '_'); }

  // --- Type detection ---

  function typeOf(val) {
    if (val === null) return 'null';
    if (Array.isArray(val)) return 'array';
    return typeof val;
  }

  function typeFlags(val) {
    const t = typeOf(val);
    return {
      isArr: t === 'array',
      isObj: t === 'object',
      isStr: t === 'string',
      isNum: t === 'number',
      isBool: t === 'boolean',
      isNull: t === 'null',
      type: t
    };
  }

  // --- Date detection & parsing ---

  const DATE_PATTERNS = [
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/,
    /^\d{1,2}\/\d{1,2}\/\d{2,4}/,
    /^\d{1,2}-\w{3}-\d{2,4}/,
  ];

  function isDateValue(v) {
    if (v == null || v === '') return false;
    const s = String(v).trim();
    if (DATE_PATTERNS.some(p => p.test(s))) {
      const d = new Date(s);
      return !isNaN(d.getTime());
    }
    return false;
  }

  function parseDate(v) {
    if (v == null) return null;
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? null : d;
  }

  function detectDateColumns(data) {
    const dateCols = new Set();
    if (!data.length) return dateCols;
    const sample = data.slice(0, Math.min(20, data.length));
    const cols = Object.keys(data[0]);
    for (const col of cols) {
      const nonNull = sample.filter(r => r[col] != null && r[col] !== '');
      if (nonNull.length > 0 && nonNull.every(r => isDateValue(r[col]))) {
        dateCols.add(col);
      }
    }
    return dateCols;
  }

  const api = {
    formatSize, formatTime, relativeTime, getByteSize,
    capitalize, camelCase, pascalCase, snakeCase,
    typeOf, typeFlags,
    isDateValue, parseDate, detectDateColumns
  };
  return api;
})();

// Backward-compatible aliases (scoped to original consumers)
const _p = window.App.primitives;
window.App.format = { formatSize: _p.formatSize, formatTime: _p.formatTime, relativeTime: _p.relativeTime, getByteSize: _p.getByteSize, capitalize: _p.capitalize, camelCase: _p.camelCase, pascalCase: _p.pascalCase, snakeCase: _p.snakeCase };
window.App.typeHelpers = { typeOf: _p.typeOf, typeFlags: _p.typeFlags };
window.App.dateHelpers = { isDateValue: _p.isDateValue, parseDate: _p.parseDate, detectDateColumns: _p.detectDateColumns };
