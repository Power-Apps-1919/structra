(function () {
  'use strict';

  /**
   * Multi-Tab
   * Allows holding multiple JSON documents in tabs.
   */

  const MAX_TABS = 8;
  const SESSION_KEY = 'jpe_tab_session';
  let tabs = []; // { id, label, data, rawText, scrollTop }
  let activeTabId = null;
  let tabBar = null;

  function init() {
    // Create tab bar above the json-panel header
    const panel = document.querySelector('.json-panel');
    if (!panel || document.getElementById('tabBar')) return;

    tabBar = document.createElement('div');
    tabBar.className = 'tab-bar';
    tabBar.id = 'tabBar';
    tabBar.innerHTML = '<div class="tab-items" id="tabItems"></div><div class="tab-actions"><button class="tab-btn" id="tabAdd" title="New Tab (+)">+</button></div>';
    panel.insertBefore(tabBar, panel.firstChild);

    document.getElementById('tabAdd').addEventListener('click', addNewTab);
    document.getElementById('tabItems').addEventListener('click', onTabClick);
    document.getElementById('tabItems').addEventListener('dblclick', onTabDblClick);
  }

  function addTab(label, data, rawText) {
    if (tabs.length >= MAX_TABS) {
      window.App.toast && window.App.toast(`Max ${MAX_TABS} tabs`);
      return null;
    }
    const id = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    tabs.push({ id, label: label || `Tab ${tabs.length + 1}`, data, rawText: rawText || JSON.stringify(data, null, 2), scrollTop: 0 });
    activeTabId = id;
    renderTabs();
    return id;
  }

  function addNewTab() {
    const id = addTab('Untitled', null, '');
    if (id) {
      window.App.toast && window.App.toast('New tab created. Load some JSON to get started.');
      document.dispatchEvent(new CustomEvent('tab-new', { detail: { tabId: id } }));
    }
  }

  function setActiveData(data, rawText, label) {
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) {
      tab.data = data;
      tab.rawText = rawText || JSON.stringify(data, null, 2);
      if (label) tab.label = label;
      renderTabs();
    }
  }

  function getActiveTab() {
    return tabs.find(t => t.id === activeTabId) || null;
  }

  function switchTab(id) {
    const jsonView = document.getElementById('jsonView');
    const current = tabs.find(t => t.id === activeTabId);
    if (current && jsonView) current.scrollTop = jsonView.scrollTop;

    activeTabId = id;
    renderTabs();
    const tab = tabs.find(t => t.id === id);
    if (tab) {
      document.dispatchEvent(new CustomEvent('tab-switch', { detail: { tab } }));
    }
  }

  function closeTab(id) {
    if (tabs.length <= 1) {
      window.App.toast && window.App.toast('Cannot close last tab');
      return;
    }
    const idx = tabs.findIndex(t => t.id === id);
    tabs.splice(idx, 1);
    if (activeTabId === id) {
      activeTabId = tabs[Math.min(idx, tabs.length - 1)].id;
      const tab = tabs.find(t => t.id === activeTabId);
      document.dispatchEvent(new CustomEvent('tab-switch', { detail: { tab } }));
    }
    renderTabs();
  }

  let clickTimer = null;

  function onTabClick(e) {
    const item = e.target.closest('.tab-item');
    if (!item) return;
    const id = item.dataset.tabId;

    if (e.target.classList.contains('tab-close')) {
      closeTab(id);
      return;
    }

    // Delay single-click to allow dblclick detection
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return; }
    clickTimer = setTimeout(() => {
      clickTimer = null;
      switchTab(id);
    }, 250);
  }

  function onTabDblClick(e) {
    // Cancel pending single-click
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }

    const label = e.target.closest('.tab-label');
    const item = (label || e.target).closest('.tab-item');
    if (!item) return;
    const id = item.dataset.tabId;
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;

    // Switch to this tab first if not active
    if (id !== activeTabId) {
      activeTabId = id;
      document.dispatchEvent(new CustomEvent('tab-switch', { detail: { tab } }));
    }

    // Find the label span in the current DOM
    const labelEl = item.querySelector('.tab-label');
    if (!labelEl) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tab-rename-input';
    input.value = tab.label;
    input.style.cssText = 'width:80px;font-size:11px;padding:1px 4px;border:1px solid var(--accent);border-radius:3px;background:var(--bg);color:var(--text);outline:none;';
    labelEl.replaceWith(input);
    input.focus();
    input.select();

    const oldLabel = tab.label;
    const commit = () => {
      const val = input.value.trim();
      if (val) tab.label = val;
      renderTabs();
      document.dispatchEvent(new CustomEvent('tab-renamed', { detail: { tab, oldLabel } }));
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
      if (ev.key === 'Escape') { input.value = tab.label; input.blur(); }
    });
  }

  function renderTabs() {
    if (!tabBar) return;
    const esc = window.App.dom.esc;
    const items = document.getElementById('tabItems');
    items.innerHTML = tabs.map(t => {
      const isActive = t.id === activeTabId;
      return `<div class="tab-item ${isActive ? 'active' : ''}" data-tab-id="${t.id}">
        <span class="tab-label">${esc(t.label || 'Untitled')}</span>
        ${tabs.length > 1 ? '<span class="tab-close" title="Close tab">×</span>' : ''}
      </div>`;
    }).join('');
  }

  function getTabCount() { return tabs.length; }
  function getTabs() { return tabs; }

  // --- Session persistence ---
  function saveSession() {
    try {
      const session = tabs.map(t => ({
        id: t.id,
        label: t.label,
        rawText: t.rawText || '',
        scrollTop: t.scrollTop || 0
      }));
      // Store tab metadata in localStorage, large rawText in IDB
      const meta = session.map(s => ({ id: s.id, label: s.label, scrollTop: s.scrollTop, hasData: !!s.rawText }));
      localStorage.setItem(SESSION_KEY, JSON.stringify({ activeTabId, tabs: meta }));
      // Store rawText per tab via IDB
      if (window.App.storage) {
        session.forEach(s => {
          if (s.rawText) {
            window.App.storage.set('tab_' + s.id, s.rawText);
          }
        });
      }
    } catch { /* storage full — silently fail */ }
  }

  function restoreSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      const session = JSON.parse(raw);
      if (!session.tabs || !session.tabs.length) return false;
      const storage = window.App.storage;
      const restoredTabs = [];
      for (const meta of session.tabs) {
        let rawText = '';
        if (storage && meta.hasData) {
          rawText = storage.get('tab_' + meta.id, '');
        }
        let data = null;
        if (rawText) {
          try { data = JSON.parse(rawText); } catch { /* invalid */ }
        }
        restoredTabs.push({ id: meta.id, label: meta.label, data, rawText, scrollTop: meta.scrollTop || 0 });
      }
      if (restoredTabs.length === 0) return false;
      tabs = restoredTabs;
      activeTabId = session.activeTabId || tabs[0].id;
      renderTabs();
      return true;
    } catch { return false; }
  }

  function clearSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw);
        if (session.tabs && window.App.storage) {
          session.tabs.forEach(m => window.App.storage.remove('tab_' + m.id));
        }
      }
      localStorage.removeItem(SESSION_KEY);
    } catch { /* ignore */ }
  }

  window.App = window.App || {};
  window.App.multiTab = { init, addTab, setActiveData, getActiveTab, switchTab, closeTab, getTabCount, getTabs, renderTabs, saveSession, restoreSession, clearSession, renameTab: function(id, name) { const t = tabs.find(x => x.id === id); if (t) { t.label = name; renderTabs(); } } };
})();
