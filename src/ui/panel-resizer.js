/**
 * Panel Resizer — drag to resize left/right panels, collapse button.
 */
window.App = window.App || {};
window.App.panelResizer = (() => {
  const { $ } = window.App.dom;

  function init() {
    const resizer = $('panelResizer');
    const main = resizer.parentElement;
    const collapseBtn = $('resizerCollapse');
    let dragging = false;

    resizer.addEventListener('mousedown', e => {
      if (e.target === collapseBtn) return;
      e.preventDefault();
      dragging = true;
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      const rect = main.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const leftFr = Math.max(0.15, Math.min(0.85, x / rect.width));
      const rightFr = 1 - leftFr - (5 / rect.width);
      main.style.gridTemplateColumns = `${leftFr}fr 5px ${Math.max(0, rightFr)}fr`;
      if (main.classList.contains('right-collapsed')) main.classList.remove('right-collapsed');
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });

    collapseBtn.addEventListener('click', () => {
      main.classList.toggle('right-collapsed');
      if (!main.classList.contains('right-collapsed')) {
        main.style.gridTemplateColumns = '';
      }
    });
  }

  return { init };
})();
