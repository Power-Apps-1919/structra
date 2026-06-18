/**
 * Data Masking — detect and anonymize PII
 */
window.App = window.App || {};
window.App.dataMask = (() => {

  const PATTERNS = [
    { type: 'email', regex: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, mask: v => v[0] + '***@' + v.split('@')[1].replace(/./g, (c, i) => i < 2 ? c : '*') },
    { type: 'phone', regex: /^[\+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{7,}$/, mask: v => v.replace(/\d(?=\d{4})/g, '*') },
    { type: 'uuid', regex: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, mask: () => '********-****-****-****-************' },
    { type: 'ip', regex: /^(\d{1,3}\.){3}\d{1,3}$/, mask: v => v.split('.').map((p, i) => i < 2 ? p : '***').join('.') },
    { type: 'creditcard', regex: /^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/, mask: v => '**** **** **** ' + v.replace(/[\s-]/g, '').slice(-4) },
  ];

  function detectAndMask(val) {
    if (typeof val !== 'string' || val.length < 3) return null;
    for (const p of PATTERNS) {
      if (p.regex.test(val)) return { type: p.type, masked: p.mask(val) };
    }
    return null;
  }

  function maskData(obj) {
    let count = 0;

    function walk(val) {
      if (typeof val === 'string') {
        const result = detectAndMask(val);
        if (result) { count++; return result.masked; }
        return val;
      }
      if (Array.isArray(val)) return val.map(item => walk(item));
      if (val && typeof val === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(val)) out[k] = walk(v);
        return out;
      }
      return val;
    }

    const masked = walk(obj);
    return { data: masked, count };
  }

  function scan(obj) {
    let count = 0;
    function walk(val) {
      if (typeof val === 'string' && detectAndMask(val)) count++;
      else if (Array.isArray(val)) val.forEach(walk);
      else if (val && typeof val === 'object') Object.values(val).forEach(walk);
    }
    walk(obj);
    return count;
  }

  return { maskData, scan, detectAndMask };
})();
