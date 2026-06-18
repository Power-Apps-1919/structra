/**
 * Schema skeleton view, Diff view
 */
window.App = window.App || {};
window.App.views = (() => {
  const { $, esc, toast } = window.App.dom;


  // === SCHEMA SKELETON ===
  function buildSchema(obj, indent) {
    const pad = '  '.repeat(indent);
    if (Array.isArray(obj)) {
      if (obj.length === 0) return `${pad}<span class="schema-type">Array&lt;unknown&gt;</span>\n`;
      return `${pad}<span class="schema-type">Array</span>[${obj.length}] {\n${buildSchema(obj[0], indent + 1)}${pad}}\n`;
    }
    if (obj && typeof obj === 'object') {
      let html = '';
      for (const [k, v] of Object.entries(obj)) {
        if (v && typeof v === 'object') {
          const type = Array.isArray(v) ? `Array[${v.length}]` : 'Object';
          html += `${pad}<span class="j-key">${esc(k)}</span>: <span class="schema-type">${type}</span> {\n${buildSchema(v, indent + 1)}${pad}}\n`;
        } else {
          const type = v === null ? 'null' : typeof v;
          html += `${pad}<span class="j-key">${esc(k)}</span>: <span class="schema-type">${type}</span>\n`;
        }
      }
      return html;
    }
    return `${pad}<span class="schema-type">${obj === null ? 'null' : typeof obj}</span>\n`;
  }

  function renderSchema(jsonData) {
    $('schemaView').innerHTML = buildSchema(jsonData, 0);
  }

  // === DIFF (jsondiffpatch-powered) ===
  async function renderDiff(a, b) {
    const { require } = window.App.libLoader;
    try {
      await require('jsondiffpatch');
    } catch {
      // Fallback to basic diff if CDN fails
      renderBasicDiff(a, b);
      return;
    }

    const instance = jsondiffpatch.create({
      objectHash: function(obj) { return obj.id || obj._id || obj.name || JSON.stringify(obj); },
      arrays: { detectMove: true, includeValueOnMove: false }
    });

    const delta = instance.diff(a, b);
    if (!delta) {
      $('diffLeft').innerHTML = '<div class="diff-identical">Documents are identical</div>';
      $('diffRight').innerHTML = '';
      return;
    }

    // Visual HTML output
    const html = jsondiffpatch.formatters.html.format(delta, a);
    $('diffLeft').innerHTML = html;
    $('diffRight').innerHTML = '';
    // Make the diff panel full-width
    $('diffLeft').style.gridColumn = '1 / -1';
    jsondiffpatch.formatters.html.hideUnchanged();
  }

  function renderBasicDiff(a, b) {
    const aLines = JSON.stringify(a, null, 2).split('\n');
    const bLines = JSON.stringify(b, null, 2).split('\n');
    const maxLen = Math.max(aLines.length, bLines.length);
    let leftHtml = '', rightHtml = '';
    for (let i = 0; i < maxLen; i++) {
      const al = aLines[i] || '';
      const bl = bLines[i] || '';
      if (al === bl) {
        leftHtml += `<div>${esc(al)}</div>`;
        rightHtml += `<div>${esc(bl)}</div>`;
      } else {
        leftHtml += `<div class="diff-rem">${esc(al)}</div>`;
        rightHtml += `<div class="diff-add">${esc(bl)}</div>`;
      }
    }
    $('diffLeft').style.gridColumn = '';
    $('diffLeft').innerHTML = leftHtml;
    $('diffRight').innerHTML = rightHtml;
  }

  return { renderSchema, renderDiff };
})();
