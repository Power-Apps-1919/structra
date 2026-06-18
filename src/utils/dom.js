/**
 * DOM utilities & shared helpers
 */
window.App = window.App || {};
window.App.dom = (() => {
  const $ = id => document.getElementById(id);

  const toast = msg => {
    $('toast').textContent = msg;
    $('toast').classList.add('show');
    setTimeout(() => $('toast').classList.remove('show'), 2000);
  };

  const ESC_RE = /[&<>"']/g;
  // Switch is faster than object lookup in V8 for small character sets
  const escReplacer = c => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  };
  const esc = s => {
    if (s == null) return '';
    const str = String(s);
    return str.replace(ESC_RE, escReplacer);
  };

  const escCode = s => esc(s).replace(/\n/g, '<br>');

  function copyAndToast(text, msg) {
    navigator.clipboard.writeText(text).then(() => toast(msg || 'Copied!'));
  }

  const exprRow = (label, code) =>
    `<div class="expr-row"><span class="elabel">${esc(label)}</span><div class="ecode">${esc(code)}</div></div>`;

  /**
   * Delegated event helper — listens on container, fires handler when a matching descendant is clicked.
   * @param {HTMLElement} container
   * @param {string} selector - CSS selector to match
   * @param {string} event - Event name (default 'click')
   * @param {function} handler - Called with (event, matchedElement)
   */
  function delegate(container, selector, event, handler) {
    container.addEventListener(event, e => {
      const el = e.target.closest(selector);
      if (el && container.contains(el)) handler(e, el);
    });
  }

  return { $, toast, esc, escCode, copyAndToast, exprRow, delegate };
})();
