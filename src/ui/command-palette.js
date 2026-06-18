/**
 * Command Palette — Ctrl+K to fuzzy-search all actions
 */
window.App = window.App || {};
window.App.commandPalette = (() => {
  const { $, toast } = window.App.dom;
  let panel = null;
  let input = null;
  let list = null;
  let visible = false;
  let commands = [];
  let filtered = [];
  let selectedIdx = 0;

  function registerCommand(id, label, shortcut, action, category) {
    commands.push({ id, label, shortcut: shortcut || '', action, category: category || 'General' });
  }

  function registerMany(cmds) {
    for (const c of cmds) commands.push(c);
  }

  function fuzzyMatch(query, text) {
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    if (t.includes(q)) return { match: true, score: t.indexOf(q) === 0 ? 100 : 80 };
    let qi = 0, score = 0;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
      if (t[ti] === q[qi]) { score += (ti === 0 || t[ti - 1] === ' ' ? 10 : 5); qi++; }
    }
    return { match: qi === q.length, score };
  }

  function render() {
    list.innerHTML = '';
    filtered.forEach((cmd, i) => {
      const div = document.createElement('div');
      div.className = 'cp-item' + (i === selectedIdx ? ' cp-active' : '');
      div.dataset.idx = i;
      div.innerHTML = `<span class="cp-label">${cmd.label}</span>` +
        (cmd.shortcut ? `<span class="cp-shortcut"><kbd>${cmd.shortcut}</kbd></span>` : '') +
        `<span class="cp-cat">${cmd.category}</span>`;
      list.appendChild(div);
    });
  }

  function filter(query) {
    if (!query) {
      filtered = commands.slice(0, 20);
    } else {
      filtered = commands
        .map(c => ({ ...c, ...fuzzyMatch(query, c.label + ' ' + c.category) }))
        .filter(c => c.match)
        .sort((a, b) => b.score - a.score)
        .slice(0, 15);
    }
    selectedIdx = 0;
    render();
  }

  function execute(idx) {
    const cmd = filtered[idx];
    if (cmd && cmd.action) {
      hide();
      try { cmd.action(); } catch (e) { toast('Command failed'); }
    }
  }

  function show() {
    if (!panel) build();
    panel.classList.add('show');
    visible = true;
    input.value = '';
    filter('');
    input.focus();
  }

  function hide() {
    if (panel) panel.classList.remove('show');
    visible = false;
  }

  function toggle() { visible ? hide() : show(); }
  function isVisible() { return visible; }

  function build() {
    panel = document.createElement('div');
    panel.className = 'cp-overlay';
    panel.id = 'commandPalette';
    panel.innerHTML = `
      <div class="cp-container">
        <div class="cp-input-wrap">
          <input class="cp-input" id="cpInput" placeholder="Type a command..." autocomplete="off" spellcheck="false">
        </div>
        <div class="cp-list" id="cpList"></div>
      </div>
    `;
    document.body.appendChild(panel);
    input = $('cpInput');
    list = $('cpList');

    input.addEventListener('input', () => filter(input.value));
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, filtered.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = Math.max(selectedIdx - 1, 0); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); execute(selectedIdx); }
      else if (e.key === 'Escape') { e.preventDefault(); hide(); }
    });

    list.addEventListener('click', e => {
      const item = e.target.closest('.cp-item');
      if (item) execute(parseInt(item.dataset.idx));
    });

    panel.addEventListener('click', e => { if (e.target === panel) hide(); });
  }

  return { registerCommand, registerMany, show, hide, toggle, isVisible, filter };
})();
