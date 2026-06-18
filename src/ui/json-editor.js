/**
 * JSON Editor — inline text editing mode
 */
window.App = window.App || {};
window.App.jsonEditor = (() => {
  const { $ } = window.App.dom;

  let editMode = false;
  let originalText = '';
  let onApply = null; // callback: (newData) => void

  function init(applyCallback) {
    onApply = applyCallback;

    $('btnEdit').addEventListener('click', toggle);
    $('jeApply').addEventListener('click', applyChanges);

    $('jeFormat').addEventListener('click', () => {
      const ta = $('jeTextarea');
      try {
        ta.value = JSON.stringify(JSON.parse(ta.value), null, 2);
        ta.classList.remove('je-error');
        updateLines();
        setStatus('Formatted', false);
      } catch (err) {
        ta.classList.add('je-error');
        setStatus('Invalid JSON: ' + err.message, true);
      }
    });

    $('jeMinify').addEventListener('click', () => {
      const ta = $('jeTextarea');
      try {
        ta.value = JSON.stringify(JSON.parse(ta.value));
        ta.classList.remove('je-error');
        updateLines();
        setStatus('Minified', false);
      } catch (err) {
        ta.classList.add('je-error');
        setStatus('Invalid JSON: ' + err.message, true);
      }
    });

    $('jeUndo').addEventListener('click', () => {
      const ta = $('jeTextarea');
      ta.value = originalText;
      ta.classList.remove('je-error', 'je-modified');
      updateLines();
      setStatus('Reverted', false);
    });

    $('jeTextarea').addEventListener('input', () => {
      updateLines();
      const ta = $('jeTextarea');
      const modified = ta.value !== originalText;
      ta.classList.toggle('je-modified', modified);
      if (!ta.classList.contains('je-error')) {
        $('jeStatus').textContent = `${ta.value.split('\n').length} lines${modified ? ' • modified' : ''}`;
        $('jeStatus').className = 'je-status';
      }
    });

    $('jeTextarea').addEventListener('scroll', () => {
      $('jeLines').scrollTop = $('jeTextarea').scrollTop;
    });

    $('jeTextarea').addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        applyChanges();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const ta = e.target;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        if (e.shiftKey) {
          const before = ta.value.slice(0, start);
          const lineStart = before.lastIndexOf('\n') + 1;
          const selected = ta.value.slice(lineStart, end);
          const outdented = selected.replace(/^  /gm, '');
          const diff = selected.length - outdented.length;
          ta.value = ta.value.slice(0, lineStart) + outdented + ta.value.slice(end);
          ta.selectionStart = Math.max(lineStart, start - 2);
          ta.selectionEnd = end - diff;
        } else {
          ta.value = ta.value.slice(0, start) + '  ' + ta.value.slice(end);
          ta.selectionStart = ta.selectionEnd = start + 2;
        }
        ta.dispatchEvent(new Event('input'));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const ta = e.target;
        const start = ta.selectionStart;
        const before = ta.value.slice(0, start);
        const currentLine = before.slice(before.lastIndexOf('\n') + 1);
        const indent = currentLine.match(/^(\s*)/)[1];
        const lastChar = before.trimEnd().slice(-1);
        let extra = '';
        if (lastChar === '{' || lastChar === '[') extra = '  ';
        ta.value = ta.value.slice(0, start) + '\n' + indent + extra + ta.value.slice(ta.selectionEnd);
        ta.selectionStart = ta.selectionEnd = start + 1 + indent.length + extra.length;
        ta.dispatchEvent(new Event('input'));
      }
    });
  }

  function enter(jsonData) {
    if (!jsonData) return;
    editMode = true;
    const text = JSON.stringify(jsonData, null, 2);
    originalText = text;
    $('jsonView').classList.add('hidden');
    $('jsonEditor').classList.remove('hidden');
    $('btnEdit').classList.add('active');
    const ta = $('jeTextarea');
    ta.value = text;
    ta.classList.remove('je-error', 'je-modified');
    $('jeStatus').textContent = `${text.split('\n').length} lines`;
    $('jeStatus').className = 'je-status';
    updateLines();
    ta.focus();
  }

  function exit() {
    editMode = false;
    $('jsonEditor').classList.add('hidden');
    $('jsonView').classList.remove('hidden');
    $('btnEdit').classList.remove('active');
  }

  function toggle() {
    if (editMode) exit();
    else document.dispatchEvent(new CustomEvent('editor-enter'));
  }

  function applyChanges() {
    const text = $('jeTextarea').value.trim();
    if (!text) { setStatus('Empty input', true); return; }
    try {
      const newData = JSON.parse(text);
      $('jeTextarea').classList.remove('je-error', 'je-modified');
      setStatus('Applied ✓', false);
      originalText = text;
      if (onApply) onApply(newData);
    } catch (err) {
      $('jeTextarea').classList.add('je-error');
      setStatus('Error: ' + err.message, true);
    }
  }

  function updateLines() {
    const lineCount = $('jeTextarea').value.split('\n').length;
    let html = '';
    for (let i = 1; i <= lineCount; i++) html += `<span>${i}</span>`;
    $('jeLines').innerHTML = html;
  }

  function setStatus(msg, isError) {
    const el = $('jeStatus');
    el.textContent = msg;
    el.className = 'je-status ' + (isError ? 'error' : 'success');
  }

  function isActive() { return editMode; }

  return { init, enter, exit, isActive };
})();
