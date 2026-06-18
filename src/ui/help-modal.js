/**
 * Help Modal Builder — shared utility for creating documentation popups.
 * Data-driven: pass sections as structured data, not HTML strings.
 */
window.App = window.App || {};
window.App.helpModal = (() => {

  /**
   * Show a help modal with structured sections.
   * @param {string} id - Unique modal id (e.g. 'tfHelpModal')
   * @param {string} title - Modal title
   * @param {Array} sections - Array of section objects:
   *   { heading, intro?, rows?: [{cols: string[]}], examples?: [{title, items: string[]}], tips?: string[], links?: [{text, href}] }
   *   rows: table rows (first row = header); examples: grouped code examples; tips: bullet list; links: external links
   */
  function show(id, title, sections) {
    const existing = document.getElementById(id);
    if (existing) { existing.classList.add('show'); return; }

    const closeId = id + 'Close';
    let body = '';
    for (const sec of sections) {
      body += `<section class="qp-doc-section"><h3>${sec.heading}</h3>`;
      if (sec.intro) body += `<p style="margin:0 0 8px;font-size:12px;color:var(--text-sec)">${sec.intro}</p>`;
      if (sec.code) body += `<div class="qp-doc-example"><code>${sec.code}</code></div>`;
      if (sec.rows && sec.rows.length > 0) {
        body += '<table class="qp-doc-table">';
        const [header, ...dataRows] = sec.rows;
        body += '<tr>' + header.map(h => `<th>${h}</th>`).join('') + '</tr>';
        for (const row of dataRows) {
          body += '<tr>' + row.map(c => `<td>${c}</td>`).join('') + '</tr>';
        }
        body += '</table>';
      }
      if (sec.examples) {
        for (const ex of sec.examples) {
          body += `<div class="qp-doc-example"><strong>${ex.title}</strong><ul>`;
          for (const item of ex.items) body += `<li>${item}</li>`;
          body += '</ul></div>';
        }
      }
      if (sec.tips) {
        body += '<ul class="qp-doc-tips">';
        for (const tip of sec.tips) body += `<li>${tip}</li>`;
        body += '</ul>';
      }
      if (sec.links) {
        body += '<ul class="qp-doc-links">';
        for (const lnk of sec.links) body += `<li><a href="${lnk.href}" target="_blank" rel="noopener">${lnk.text}</a></li>`;
        body += '</ul>';
      }
      body += '</section>';
    }

    const modal = document.createElement('div');
    modal.className = 'qp-help-modal show';
    modal.id = id;
    modal.innerHTML = `
      <div class="qp-help-popup">
        <div class="qp-help-popup-header">
          <span>${title}</span>
          <button class="qp-close" id="${closeId}">&#10005;</button>
        </div>
        <div class="qp-help-popup-body">${body}</div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById(closeId).addEventListener('click', () => modal.classList.remove('show'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('show'); });
    modal.addEventListener('keydown', e => { if (e.key === 'Escape') modal.classList.remove('show'); });
  }

  return { show };
})();
