(function () {
  'use strict';

  const MINIMAP_WIDTH = 80;
  const LINE_HEIGHT = 2;
  const COLORS = {
    key: '#60a5fa',
    string: '#34d399',
    number: '#fbbf24',
    boolean: '#f472b6',
    null: '#9ca3af',
    bracket: '#6b7280',
    bg: 'transparent'
  };

  let canvas = null;
  let ctx = null;
  let container = null;
  let viewport = null;
  let active = false;
  let lineData = [];
  let jsonView = null;
  let dragging = false;
  let observer = null;

  function create() {
    if (container) return;
    jsonView = document.getElementById('jsonView');
    const panel = jsonView.parentElement;

    container = document.createElement('div');
    container.className = 'minimap-container';
    container.id = 'minimapContainer';

    canvas = document.createElement('canvas');
    canvas.className = 'minimap-canvas';
    canvas.width = MINIMAP_WIDTH;
    container.appendChild(canvas);

    viewport = document.createElement('div');
    viewport.className = 'minimap-viewport';
    container.appendChild(viewport);

    panel.appendChild(container);
    ctx = canvas.getContext('2d');

    // Scroll sync
    jsonView.addEventListener('scroll', syncViewport);

    // Click/drag on minimap to navigate
    container.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function destroy() {
    if (container) {
      jsonView.removeEventListener('scroll', syncViewport);
      container.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (observer) { observer.disconnect(); observer = null; }
      container.remove();
      container = null;
      canvas = null;
      ctx = null;
      viewport = null;
    }
  }

  function toggle() {
    if (active) {
      active = false;
      destroy();
    } else {
      active = true;
      create();
      render();
      // Watch for re-renders of the JSON view
      observer = new MutationObserver(() => { if (active) requestAnimationFrame(render); });
      observer.observe(jsonView, { childList: true, subtree: false });
    }
    return active;
  }

  function render() {
    if (!active || !canvas || !jsonView) return;

    const lines = jsonView.querySelectorAll('.j-line');
    lineData = [];

    lines.forEach(line => {
      const spans = line.querySelectorAll('span');
      const lineInfo = [];
      spans.forEach(sp => {
        const cls = sp.className || '';
        let color = COLORS.bracket;
        if (cls.includes('j-key')) color = COLORS.key;
        else if (cls.includes('j-string')) color = COLORS.string;
        else if (cls.includes('j-number')) color = COLORS.number;
        else if (cls.includes('j-boolean')) color = COLORS.boolean;
        else if (cls.includes('j-null')) color = COLORS.null;
        const textLen = (sp.textContent || '').length;
        if (textLen > 0) lineInfo.push({ color, len: Math.min(textLen, 60) });
      });
      lineData.push(lineInfo);
    });

    const totalLines = lineData.length;
    const canvasHeight = Math.min(totalLines * LINE_HEIGHT, jsonView.clientHeight);
    canvas.height = canvasHeight;
    canvas.style.height = canvasHeight + 'px';

    ctx.clearRect(0, 0, MINIMAP_WIDTH, canvasHeight);

    const scale = canvasHeight / (totalLines * LINE_HEIGHT);

    lineData.forEach((line, i) => {
      let x = 2;
      const y = Math.round(i * LINE_HEIGHT * scale);
      line.forEach(seg => {
        const w = Math.max(1, Math.round(seg.len * 0.8));
        ctx.fillStyle = seg.color;
        ctx.globalAlpha = 0.7;
        ctx.fillRect(x, y, w, Math.max(1, LINE_HEIGHT * scale - 0.5));
        x += w + 1;
        if (x > MINIMAP_WIDTH - 4) return;
      });
    });
    ctx.globalAlpha = 1;

    syncViewport();
  }

  function syncViewport() {
    if (!active || !viewport || !jsonView || !canvas) return;
    const scrollH = jsonView.scrollHeight;
    const clientH = jsonView.clientHeight;
    const scrollTop = jsonView.scrollTop;

    if (scrollH <= clientH) {
      viewport.style.top = '0px';
      viewport.style.height = canvas.height + 'px';
      return;
    }

    const ratio = canvas.height / scrollH;
    const vpTop = scrollTop * ratio;
    const vpH = clientH * ratio;

    viewport.style.top = vpTop + 'px';
    viewport.style.height = Math.max(12, vpH) + 'px';
  }

  function scrollToY(clientY) {
    if (!container || !jsonView || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const y = clientY - rect.top;
    const ratio = y / canvas.height;
    const targetScroll = ratio * jsonView.scrollHeight - jsonView.clientHeight / 2;
    jsonView.scrollTop = Math.max(0, targetScroll);
  }

  function onMouseDown(e) {
    dragging = true;
    scrollToY(e.clientY);
    e.preventDefault();
  }

  function onMouseMove(e) {
    if (dragging) scrollToY(e.clientY);
  }

  function onMouseUp() {
    dragging = false;
  }

  window.App = window.App || {};
  window.App.minimap = { toggle, render };
})();
