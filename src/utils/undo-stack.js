/**
 * Undo/Redo Stack — track mutations and allow Ctrl+Z / Ctrl+Y
 */
window.App = window.App || {};
window.App.undoStack = (() => {
  const MAX_SNAPSHOTS = 20;
  let stack = [];   // Array of { data: string, label: string, timestamp: number }
  let index = -1;   // Current position in stack

  /**
   * Push a new state onto the stack.
   * @param {*} data - The JSON data to snapshot
   * @param {string} label - Description of the action (e.g. "Sort Keys A→Z")
   */
  function push(data, label) {
    const snapshot = JSON.stringify(data);
    // Don't push if identical to current
    if (index >= 0 && stack[index] && stack[index].data === snapshot) return;
    // Discard any redo history beyond current index
    stack = stack.slice(0, index + 1);
    stack.push({ data: snapshot, label, timestamp: Date.now() });
    if (stack.length > MAX_SNAPSHOTS) stack.shift();
    index = stack.length - 1;
  }

  function canUndo() { return index > 0; }
  function canRedo() { return index < stack.length - 1; }

  function undo() {
    if (!canUndo()) return null;
    index--;
    return JSON.parse(stack[index].data);
  }

  function redo() {
    if (!canRedo()) return null;
    index++;
    return JSON.parse(stack[index].data);
  }

  function current() {
    if (index < 0 || !stack[index]) return null;
    return { label: stack[index].label, index, total: stack.length };
  }

  function clear() { stack = []; index = -1; }

  function getHistory() {
    return stack.map((s, i) => ({
      label: s.label,
      active: i === index,
      timestamp: s.timestamp
    }));
  }

  return { push, undo, redo, canUndo, canRedo, current, clear, getHistory };
})();
