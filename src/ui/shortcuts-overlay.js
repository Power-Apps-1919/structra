/**
 * Keyboard Shortcuts Overlay — press ? to show/hide
 */
window.App = window.App || {};
window.App.shortcutsOverlay = (() => {
  const { $ } = window.App.dom;
  let modal = null;

  const SHORTCUTS = [
    ['Navigation', [
      ['Click element', 'Select path'],
      ['↑ / ↓', 'Navigate autocomplete'],
      ['Enter', 'Confirm path / autocomplete'],
      ['Alt+←', 'Path history back'],
      ['Alt+→', 'Path history forward'],
    ]],
    ['Views & Panels', [
      ['Ctrl+1', 'JSON Tree view'],
      ['Ctrl+2', 'Table view'],
      ['Ctrl+3', 'Schema view'],
      ['Ctrl+K', 'Command Palette'],
      ['Ctrl+Shift+F', 'Universal Filter (JSONPath mode)'],
      ['Ctrl+T', 'Transform panel'],
      ['Ctrl+F', 'Find in JSON'],
      ['Ctrl+H', 'Find & Replace'],
      ['Ctrl+B', 'Bookmark current path'],
    ]],
    ['Zoom (hover over JSON)', [
      ['Ctrl++', 'Zoom in'],
      ['Ctrl+-', 'Zoom out'],
      ['Ctrl+0', 'Reset zoom'],
      ['Ctrl+Scroll', 'Zoom in/out'],
    ]],
    ['General', [
      ['Ctrl+Z', 'Undo last mutation'],
      ['Ctrl+Y', 'Redo'],
      ['?', 'Show this shortcuts overlay'],
      ['Escape', 'Close any panel/modal'],
      ['Double-click key', 'Search for key in tree'],
    ]],
  ];

  function show() {
    if (modal) { modal.classList.add('show'); return; }
    modal = document.createElement('div');
    modal.className = 'qp-help-modal show';
    modal.id = 'shortcutsModal';

    let html = `<div class="qp-help-popup" style="max-width:560px">
      <div class="qp-help-popup-header">
        <span>Keyboard Shortcuts</span>
        <button class="qp-close" id="shortcutsClose">&#10005;</button>
      </div>
      <div class="qp-help-popup-body">`;

    for (const [section, keys] of SHORTCUTS) {
      html += `<section class="qp-doc-section"><h3>${section}</h3>
        <table class="qp-doc-table"><tr><th>Shortcut</th><th>Action</th></tr>`;
      for (const [key, desc] of keys) {
        html += `<tr><td><kbd>${key}</kbd></td><td>${desc}</td></tr>`;
      }
      html += '</table></section>';
    }

    html += '</div></div>';
    modal.innerHTML = html;
    document.body.appendChild(modal);

    $('shortcutsClose').addEventListener('click', hide);
    modal.addEventListener('click', e => { if (e.target === modal) hide(); });
  }

  function hide() { if (modal) modal.classList.remove('show'); }
  function isVisible() { return modal && modal.classList.contains('show'); }
  function toggle() { isVisible() ? hide() : show(); }

  return { show, hide, toggle, isVisible };
})();
