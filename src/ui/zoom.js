/**
 * Zoom — controls JSON viewer font-size zoom with toolbar, keyboard, and mouse wheel.
 */
window.App = window.App || {};
window.App.zoom = (() => {
  const { $ } = window.App.dom;

  let level = 100;
  const STEP = 10;
  const MIN = 40;
  const MAX = 200;
  let hovered = false;

  function set(val) {
    level = Math.max(MIN, Math.min(MAX, val));
    const view = $('jsonView');
    view.style.fontSize = (level / 100) + 'em';
    const sel = $('zoomSelect');
    const optVal = String(level);
    if ([...sel.options].some(o => o.value === optVal)) {
      sel.value = optVal;
    } else {
      sel.value = '';
    }
    let indicator = $('zoomIndicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'zoomIndicator';
      indicator.className = 'zoom-indicator';
      view.parentElement.appendChild(indicator);
    }
    indicator.textContent = level + '%';
    indicator.classList.add('show');
    clearTimeout(indicator._hideTimer);
    indicator._hideTimer = setTimeout(() => indicator.classList.remove('show'), 1200);
  }

  function fit() {
    const view = $('jsonView');
    if (!view.scrollWidth || !view.clientWidth) return;
    view.style.fontSize = '1em';
    void view.offsetWidth;
    const contentWidth = view.scrollWidth;
    const viewWidth = view.clientWidth;
    const fitLevel = Math.floor((viewWidth / contentWidth) * 100);
    const rounded = Math.round(Math.max(MIN, Math.min(MAX, fitLevel)) / 5) * 5;
    set(rounded);
  }

  function zoomIn() { set(level + STEP); }
  function zoomOut() { set(level - STEP); }
  function reset() { set(100); }
  function isHovered() { return hovered; }
  function getLevel() { return level; }

  function init() {
    $('jsonView').addEventListener('mouseenter', () => { hovered = true; });
    $('jsonView').addEventListener('mouseleave', () => { hovered = false; });
    $('btnZoomIn').addEventListener('click', zoomIn);
    $('btnZoomOut').addEventListener('click', zoomOut);
    $('btnZoomFit').addEventListener('click', fit);
    $('zoomSelect').addEventListener('change', e => set(parseInt(e.target.value, 10)));

    $('jsonView').addEventListener('wheel', e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn(); else zoomOut();
    }, { passive: false });
  }

  return { init, set, fit, zoomIn, zoomOut, reset, isHovered, getLevel };
})();
