/**
 * Toolbar Pin — right-click toolbar buttons to pin/unpin.
 * Unpinned buttons are hidden and accessible via an overflow "More" dropdown.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'toolbar_hidden';
  // Buttons that should never be hidden
  const ALWAYS_VISIBLE = new Set(['btnCopy', 'btnBookmark', 'btnSearch', 'btnDark', 'btnNew']);

  function getHidden() {
    return window.App.storage.get(STORAGE_KEY, []);
  }
  function setHidden(list) {
    window.App.storage.set(STORAGE_KEY, list);
  }

  function init() {
    const toolbar = document.querySelector('.toolbar-items');
    if (!toolbar) return;

    // Build overflow dropdown
    const moreWrap = document.createElement('div');
    moreWrap.className = 'toolbar-more-wrap';
    moreWrap.innerHTML = '<button class="toolbar-btn toolbar-more-btn" id="btnMore" title="More tools..."><i data-lucide="more-horizontal"></i></button><div class="toolbar-more-menu" id="toolbarMoreMenu"></div>';
    toolbar.appendChild(moreWrap);

    // Right-click on toolbar buttons to toggle
    toolbar.addEventListener('contextmenu', (e) => {
      const btn = e.target.closest('.toolbar-btn');
      if (!btn || !btn.id || ALWAYS_VISIBLE.has(btn.id)) return;
      if (btn.id === 'btnMore') return;
      e.preventDefault();
      togglePin(btn.id);
    });

    // Toggle overflow menu
    document.getElementById('btnMore').addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = document.getElementById('toolbarMoreMenu');
      menu.classList.toggle('show');
      if (menu.classList.contains('show')) buildOverflowMenu();
    });
    document.addEventListener('click', () => {
      document.getElementById('toolbarMoreMenu').classList.remove('show');
    });

    applyHidden();

    // Create Lucide icon for the more button
    if (window.lucide) window.lucide.createIcons();
  }

  function togglePin(btnId) {
    const hidden = getHidden();
    const idx = hidden.indexOf(btnId);
    if (idx >= 0) {
      hidden.splice(idx, 1);
      window.App.dom.toast('Tool pinned to toolbar');
    } else {
      hidden.push(btnId);
      window.App.dom.toast('Tool unpinned (right-click to re-pin, or use More ›)');
    }
    setHidden(hidden);
    applyHidden();
  }

  function applyHidden() {
    const hidden = new Set(getHidden());
    const toolbar = document.querySelector('.toolbar-items');
    toolbar.querySelectorAll('.toolbar-btn[id]').forEach(btn => {
      if (btn.id === 'btnMore') return;
      btn.style.display = hidden.has(btn.id) ? 'none' : '';
    });
    // Show/hide the More button based on whether anything is hidden
    const moreBtn = document.getElementById('btnMore');
    if (moreBtn) moreBtn.style.display = hidden.size > 0 ? '' : 'none';
  }

  function buildOverflowMenu() {
    const hidden = new Set(getHidden());
    const menu = document.getElementById('toolbarMoreMenu');
    const toolbar = document.querySelector('.toolbar-items');
    const esc = window.App.dom.esc;
    const items = [];

    toolbar.querySelectorAll('.toolbar-btn[id]').forEach(btn => {
      if (btn.id === 'btnMore' || ALWAYS_VISIBLE.has(btn.id)) return;
      const title = btn.getAttribute('title') || btn.id.replace('btn', '');
      const isHidden = hidden.has(btn.id);
      items.push(`<div class="toolbar-more-item" data-btn="${btn.id}" style="display:flex;align-items:center;gap:6px;padding:5px 10px;cursor:pointer;font-size:11px;white-space:nowrap">
        <span style="width:14px;text-align:center">${isHidden ? '' : '📌'}</span>
        <span>${esc(title)}</span>
      </div>`);
    });

    menu.innerHTML = items.join('') +
      '<div style="border-top:1px solid var(--border);padding:5px 10px;font-size:10px;color:var(--text-muted);text-align:center">Click to toggle • Right-click button to pin/unpin</div>';

    menu.querySelectorAll('.toolbar-more-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const btnId = item.dataset.btn;
        const isCurrentlyHidden = hidden.has(btnId);
        if (isCurrentlyHidden) {
          // Re-pin it
          togglePin(btnId);
        } else {
          // Click the actual button
          const btn = document.getElementById(btnId);
          if (btn) btn.click();
        }
        menu.classList.remove('show');
      });
    });
  }

  window.App = window.App || {};
  window.App.toolbarPin = { init };
})();
