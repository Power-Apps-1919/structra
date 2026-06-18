/**
 * Graph View — interactive tree/node visualization of JSON structure.
 * Lightweight SVG-based, no external dependencies.
 */
window.App = window.App || {};
window.App.graphView = (() => {
  const { $, esc } = window.App.dom;

  const NODE_W = 140;
  const NODE_H = 28;
  const H_GAP = 30;
  const V_GAP = 8;
  const ZOOM_MIN = 0.2;
  const ZOOM_MAX = 3;
  const ZOOM_STEP = 0.1;
  let svgEl = null;
  let containerEl = null;
  let scale = 1;
  let panX = 20, panY = 20;
  let dragging = false, dragStartX, dragStartY;
  let treeBounds = { maxX: 0, maxY: 0 };

  let currentData = null;
  let rootTree = null;

  /**
   * Render JSON as a tree graph in the given container.
   */
  function render(data, container) {
    containerEl = container;
    currentData = data;
    // Preserve toolbar — clear only SVG
    container.querySelectorAll('.graph-svg').forEach(el => el.remove());
    container.classList.add('graph-container');

    // Reset pan/zoom
    scale = 1;
    panX = 20;
    panY = 20;

    // Build tree structure
    rootTree = buildTree(data, 'root', 0);
    redraw();

    // Pan & zoom interaction
    setupInteraction(container, svgEl);
    // Wire up toolbar
    setupToolbar();
    updateZoomLabel();
  }

  /** Redraw the SVG from the current rootTree (preserves pan/zoom) */
  function redraw() {
    containerEl.querySelectorAll('.graph-svg').forEach(el => el.remove());

    layoutTree(rootTree, 0, 0);
    treeBounds = getBounds(rootTree);

    svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('width', '100%');
    svgEl.setAttribute('height', '100%');
    svgEl.setAttribute('class', 'graph-svg');
    svgEl.innerHTML = `<g id="graphGroup" transform="translate(${panX},${panY}) scale(${scale})"></g>`;
    containerEl.appendChild(svgEl);

    const g = svgEl.querySelector('#graphGroup');

    // Draw edges first (behind nodes)
    drawEdges(g, rootTree);
    // Draw nodes
    drawNodes(g, rootTree);
  }

  function buildTree(val, key, depth) {
    const node = { key, children: [], x: 0, y: 0, depth, width: 0, height: 0, sourceVal: val };

    if (val === null) {
      node.type = 'null';
      node.label = key + ': null';
    } else if (Array.isArray(val)) {
      node.type = 'array';
      node.label = `${key} [${val.length}]`;
      if (depth < 4) {
        const max = Math.min(val.length, 5);
        for (let i = 0; i < max; i++) {
          node.children.push(buildTree(val[i], `[${i}]`, depth + 1));
        }
        if (val.length > 5) {
          const ellipsis = { key: `... +${val.length - 5}`, type: 'ellipsis', label: `+${val.length - 5} more`, children: [], x: 0, y: 0, depth: depth + 1, width: 0, height: 0 };
          ellipsis.parentNode = node;
          ellipsis.expandFrom = max;
          ellipsis.expandSource = val;
          node.children.push(ellipsis);
        }
      } else {
        // Depth-limited: show as collapsed
        node.collapsed = true;
        node.label = `${key} [${val.length}] ▸`;
      }
    } else if (typeof val === 'object') {
      node.type = 'object';
      const keys = Object.keys(val);
      node.label = `${key} {${keys.length}}`;
      if (depth < 4) {
        const max = Math.min(keys.length, 8);
        for (let i = 0; i < max; i++) {
          node.children.push(buildTree(val[keys[i]], keys[i], depth + 1));
        }
        if (keys.length > 8) {
          const ellipsis = { key: `... +${keys.length - 8}`, type: 'ellipsis', label: `+${keys.length - 8} more`, children: [], x: 0, y: 0, depth: depth + 1, width: 0, height: 0 };
          ellipsis.parentNode = node;
          ellipsis.expandFrom = max;
          ellipsis.expandSource = val;
          ellipsis.expandKeys = keys;
          node.children.push(ellipsis);
        }
      } else {
        // Depth-limited: show as collapsed
        node.collapsed = true;
        node.label = `${key} {${keys.length}} ▸`;
      }
    } else {
      node.type = typeof val;
      const strVal = String(val).slice(0, 20);
      node.label = `${key}: ${strVal}`;
    }
    return node;
  }

  function layoutTree(node, x, y) {
    node.x = x;
    node.y = y;

    if (node.children.length === 0) {
      node.height = NODE_H;
      return;
    }

    let childY = y;
    const childX = x + NODE_W + H_GAP;
    for (const child of node.children) {
      layoutTree(child, childX, childY);
      childY += getSubtreeHeight(child) + V_GAP;
    }

    // Center parent vertically relative to children
    const firstChild = node.children[0];
    const lastChild = node.children[node.children.length - 1];
    node.y = (firstChild.y + lastChild.y) / 2;
  }

  function getSubtreeHeight(node) {
    if (node.children.length === 0) return NODE_H;
    let total = 0;
    for (let i = 0; i < node.children.length; i++) {
      total += getSubtreeHeight(node.children[i]);
      if (i < node.children.length - 1) total += V_GAP;
    }
    return total;
  }

  function getBounds(node) {
    let maxX = node.x, maxY = node.y;
    for (const child of node.children) {
      const b = getBounds(child);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
    }
    return { maxX, maxY };
  }

  function drawEdges(g, node) {
    for (const child of node.children) {
      const x1 = node.x + NODE_W;
      const y1 = node.y + NODE_H / 2;
      const x2 = child.x;
      const y2 = child.y + NODE_H / 2;
      const mx = (x1 + x2) / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
      path.setAttribute('class', 'graph-edge');
      g.appendChild(path);
      drawEdges(g, child);
    }
  }

  function drawNodes(g, node) {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('transform', `translate(${node.x},${node.y})`);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', NODE_W);
    rect.setAttribute('height', NODE_H);
    rect.setAttribute('rx', '4');
    rect.setAttribute('class', `graph-node graph-node-${node.type}${node.type === 'ellipsis' || node.collapsed ? ' graph-node-clickable' : ''}`);
    group.appendChild(rect);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '8');
    text.setAttribute('y', '18');
    text.setAttribute('class', `graph-text${node.type === 'ellipsis' || node.collapsed ? ' graph-text-clickable' : ''}`);
    text.textContent = node.label.length > 18 ? node.label.slice(0, 16) + '...' : node.label;
    group.appendChild(text);

    // Make ellipsis nodes expandable on click
    if (node.type === 'ellipsis') {
      group.style.cursor = 'pointer';
      group.addEventListener('click', e => {
        e.stopPropagation();
        expandEllipsis(node);
      });
    }
    // Make collapsed depth-limited nodes expandable
    if (node.collapsed) {
      group.style.cursor = 'pointer';
      group.addEventListener('click', e => {
        e.stopPropagation();
        expandCollapsed(node);
      });
    }

    g.appendChild(group);

    for (const child of node.children) {
      drawNodes(g, child);
    }
  }

  function expandEllipsis(ellipsisNode) {
    const parent = ellipsisNode.parentNode;
    if (!parent) return;
    const src = ellipsisNode.expandSource;
    const from = ellipsisNode.expandFrom;

    // Remove ellipsis from parent's children
    parent.children = parent.children.filter(c => c !== ellipsisNode);

    if (Array.isArray(src)) {
      // Expand remaining array items
      for (let i = from; i < src.length; i++) {
        parent.children.push(buildTree(src[i], `[${i}]`, parent.depth + 1));
      }
    } else {
      // Expand remaining object keys
      const keys = ellipsisNode.expandKeys || Object.keys(src);
      for (let i = from; i < keys.length; i++) {
        parent.children.push(buildTree(src[keys[i]], keys[i], parent.depth + 1));
      }
    }
    redraw();
  }

  function expandCollapsed(node) {
    const val = node.sourceVal;
    if (!val || typeof val !== 'object') return;
    node.collapsed = false;
    // Remove the ▸ from label
    node.label = node.label.replace(' ▸', '');
    // Build children
    if (Array.isArray(val)) {
      const max = Math.min(val.length, 5);
      for (let i = 0; i < max; i++) {
        node.children.push(buildTree(val[i], `[${i}]`, node.depth + 1));
      }
      if (val.length > 5) {
        const ellipsis = { key: `... +${val.length - 5}`, type: 'ellipsis', label: `+${val.length - 5} more`, children: [], x: 0, y: 0, depth: node.depth + 1, width: 0, height: 0 };
        ellipsis.parentNode = node;
        ellipsis.expandFrom = max;
        ellipsis.expandSource = val;
        node.children.push(ellipsis);
      }
    } else {
      const keys = Object.keys(val);
      const max = Math.min(keys.length, 8);
      for (let i = 0; i < max; i++) {
        node.children.push(buildTree(val[keys[i]], keys[i], node.depth + 1));
      }
      if (keys.length > 8) {
        const ellipsis = { key: `... +${keys.length - 8}`, type: 'ellipsis', label: `+${keys.length - 8} more`, children: [], x: 0, y: 0, depth: node.depth + 1, width: 0, height: 0 };
        ellipsis.parentNode = node;
        ellipsis.expandFrom = max;
        ellipsis.expandSource = val;
        ellipsis.expandKeys = keys;
        node.children.push(ellipsis);
      }
    }
    redraw();
  }

  function setupInteraction(container, svg) {
    // Zoom
    container.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, scale * delta));
      // Zoom towards cursor
      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      panX = mx - (mx - panX) * (newScale / scale);
      panY = my - (my - panY) * (newScale / scale);
      scale = newScale;
      updateTransform();
      updateZoomLabel();
    }, { passive: false });

    // Pan — only on SVG background, not on clickable nodes
    container.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      if (e.target.closest('[style*="cursor: pointer"]') || e.target.closest('.gz-btn')) return;
      dragging = true;
      dragStartX = e.clientX - panX;
      dragStartY = e.clientY - panY;
    });
    container.addEventListener('mousemove', e => {
      if (!dragging) return;
      panX = e.clientX - dragStartX;
      panY = e.clientY - dragStartY;
      updateTransform();
    });
    container.addEventListener('mouseup', () => { dragging = false; });
    container.addEventListener('mouseleave', () => { dragging = false; });
  }

  function updateTransform() {
    const g = svgEl.querySelector('#graphGroup');
    if (g) g.setAttribute('transform', `translate(${panX},${panY}) scale(${scale})`);
  }

  function updateZoomLabel() {
    const el = $('gzLevel');
    if (el) el.textContent = Math.round(scale * 100) + '%';
  }

  function zoomIn() {
    scale = Math.min(ZOOM_MAX, scale + ZOOM_STEP);
    updateTransform();
    updateZoomLabel();
  }

  function zoomOut() {
    scale = Math.max(ZOOM_MIN, scale - ZOOM_STEP);
    updateTransform();
    updateZoomLabel();
  }

  function zoomToFit() {
    if (!containerEl || !svgEl) return;
    const cw = containerEl.clientWidth;
    const ch = containerEl.clientHeight;
    const contentW = treeBounds.maxX + NODE_W + 40;
    const contentH = treeBounds.maxY + NODE_H + 40;
    if (!contentW || !contentH) return;
    const scaleX = cw / contentW;
    const scaleY = ch / contentH;
    scale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(scaleX, scaleY) * 0.9));
    // Center content
    panX = (cw - contentW * scale) / 2;
    panY = (ch - contentH * scale) / 2;
    updateTransform();
    updateZoomLabel();
  }

  function zoomReset() {
    scale = 1;
    panX = 20;
    panY = 20;
    updateTransform();
    updateZoomLabel();
  }

  let toolbarWired = false;
  function setupToolbar() {
    if (toolbarWired) return;
    toolbarWired = true;
    const fit = $('gzFit');
    const out = $('gzOut');
    const inn = $('gzIn');
    const rst = $('gzReset');
    if (fit) fit.addEventListener('click', zoomToFit);
    if (out) out.addEventListener('click', zoomOut);
    if (inn) inn.addEventListener('click', zoomIn);
    if (rst) rst.addEventListener('click', zoomReset);
  }

  function reset() {
    scale = 1;
    panX = 20;
    panY = 20;
  }

  return { render, reset };
})();
