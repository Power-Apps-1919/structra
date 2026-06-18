/**
 * Format conversion & export — JSON ↔ YAML, JSON → XML, CSV export
 */
window.App = window.App || {};
window.App.formatConvert = (() => {
  const { require } = window.App.libLoader;
  const { toast } = window.App.dom;

  // --- YAML ---
  async function jsonToYaml(json) {
    await require('jsyaml');
    return jsyaml.dump(json, { indent: 2, lineWidth: 120, noRefs: true });
  }

  async function yamlToJson(yamlStr) {
    await require('jsyaml');
    return jsyaml.load(yamlStr);
  }

  function isYaml(text) {
    const trimmed = text.trim();
    // Not JSON (doesn't start with { or [) and has YAML-like structure
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return false;
    // Check for YAML markers or key: value patterns
    if (trimmed.startsWith('---') || trimmed.startsWith('%YAML')) return true;
    return /^[\w-]+\s*:/m.test(trimmed) && !trimmed.includes(';');
  }

  // --- XML ---
  function jsonToXml(json, rootName = 'root') {
    function convert(obj, indent = '') {
      if (obj === null) return `${indent}<null/>`;
      if (typeof obj !== 'object') return `${indent}${escXml(String(obj))}`;

      let xml = '';
      if (Array.isArray(obj)) {
        for (const item of obj) {
          xml += `${indent}<item>\n${convert(item, indent + '  ')}\n${indent}</item>\n`;
        }
      } else {
        for (const [key, val] of Object.entries(obj)) {
          const tag = key.replace(/[^a-zA-Z0-9_-]/g, '_');
          if (val === null) {
            xml += `${indent}<${tag} xsi:nil="true"/>\n`;
          } else if (typeof val === 'object') {
            xml += `${indent}<${tag}>\n${convert(val, indent + '  ')}\n${indent}</${tag}>\n`;
          } else {
            xml += `${indent}<${tag}>${escXml(String(val))}</${tag}>\n`;
          }
        }
      }
      return xml.replace(/\n$/, '');
    }

    function escXml(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }

    return `<?xml version="1.0" encoding="UTF-8"?>\n<${rootName}>\n${convert(json, '  ')}\n</${rootName}>`;
  }

  // --- CSV ---
  function escCsv(v) {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function generateCsv(rows, columns) {
    const lines = [columns.map(c => escCsv(c)).join(',')];
    for (const row of rows) {
      lines.push(columns.map(c => escCsv(row[c])).join(','));
    }
    return lines.join('\n') + '\n';
  }

  function downloadCsv(rows, columns, filename) {
    const csv = generateCsv(rows, columns);
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'export.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('CSV exported');
  }

  return { jsonToYaml, yamlToJson, isYaml, jsonToXml, generateCsv, downloadCsv };
})();

// Backward-compatible alias (scoped to CSV-only methods)
window.App.csvExport = { generateCsv: window.App.formatConvert.generateCsv, downloadCsv: window.App.formatConvert.downloadCsv };
