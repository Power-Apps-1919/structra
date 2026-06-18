/**
 * Transform Panel — jq-style expressions to filter/map/transform JSON data.
 * Uses safe evaluation (no eval) with predefined operations.
 */
window.App = window.App || {};
window.App.transformPanel = (() => {
  const { $, esc, toast } = window.App.dom;

  let panel = null;
  let visible = false;
  let jsonData = null;
  let onApply = null;

  const EXAMPLES = [
    { label: 'Select field', expr: '.items', desc: 'Navigate into a key' },
    { label: 'Map values', expr: 'map(x => x.name)', desc: 'Extract a field from each item' },
    { label: 'Filter', expr: 'filter(x => x.age > 18)', desc: 'Keep items matching condition' },
    { label: 'Sort asc', expr: 'sort((a,b) => a.name > b.name ? 1 : -1)', desc: 'Sort by field' },
    { label: 'Sort desc', expr: 'sort((a,b) => a.name < b.name ? 1 : -1)', desc: 'Sort descending' },
    { label: 'Unique', expr: 'unique()', desc: 'Remove duplicates (primitives)' },
    { label: 'Flatten', expr: 'flat()', desc: 'Flatten nested arrays' },
    { label: 'Count', expr: 'length', desc: 'Get array length' },
    { label: 'Keys', expr: 'keys()', desc: 'Get object keys' },
    { label: 'Values', expr: 'values()', desc: 'Get object values' },
    { label: 'Group by', expr: 'groupBy(x => x.category)', desc: 'Group array items by field' },
    { label: 'First 5', expr: 'slice(0, 5)', desc: 'Take first N items' },
    { label: 'Last 5', expr: 'slice(-5)', desc: 'Take last N items' },
    { label: 'Reverse', expr: 'reverse()', desc: 'Reverse array order' },
    { label: 'Pick fields', expr: 'map(x => ({name: x.name, id: x.id}))', desc: 'Select specific fields' },
    { label: 'Sum', expr: 'reduce((a,b) => a + b, 0)', desc: 'Sum all numbers' },
  ];

  function init(container) {
    panel = document.createElement('div');
    panel.className = 'tf-panel';
    panel.id = 'transformPanel';
    panel.innerHTML = `
      <div class="tf-header">
        <span class="tf-title">Transform</span>
        <span class="tf-help-link" id="tfHelpBtn">📖 Docs & Examples</span>
        <button class="tf-close" id="tfClose">&#10005;</button>
      </div>
      <div class="tf-input-row">
        <textarea class="tf-input" id="tfInput" rows="2" placeholder=".items | filter(x => x.active) | map(x => x.name)" spellcheck="false"></textarea>
      </div>
      <div class="tf-actions">
        <button class="tf-btn tf-btn-run" id="tfRun">&#9654; Preview</button>
        <button class="tf-btn" id="tfApply">Apply to JSON</button>
        <button class="tf-btn" id="tfCopy">Copy Result</button>
      </div>
      <div class="tf-examples" id="tfExamples">
        ${EXAMPLES.map(e => `<button class="tf-ex" data-expr="${esc(e.expr)}" title="${esc(e.desc)}">${esc(e.label)}</button>`).join('')}
      </div>
      <div class="tf-info" id="tfInfo"></div>
      <div class="tf-results" id="tfResults"></div>
    `;
    container.appendChild(panel);

    $('tfClose').addEventListener('click', hide);
    $('tfRun').addEventListener('click', runTransform);
    $('tfApply').addEventListener('click', applyTransform);
    $('tfCopy').addEventListener('click', copyResult);
    $('tfHelpBtn').addEventListener('click', showHelpPopup);
    $('tfInput').addEventListener('keydown', e => {
      if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); runTransform(); }
      if (e.key === 'Escape') hide();
    });
    $('tfExamples').addEventListener('click', e => {
      const btn = e.target.closest('[data-expr]');
      if (btn) {
        const current = $('tfInput').value.trim();
        $('tfInput').value = current ? current + ' | ' + btn.dataset.expr : btn.dataset.expr;
        $('tfInput').focus();
      }
    });
  }

  function show(data, applyCallback) {
    jsonData = data;
    onApply = applyCallback;
    if (!panel) init(document.body);
    panel.classList.add('show');
    visible = true;
    $('tfInput').focus();
  }

  function hide() {
    if (panel) panel.classList.remove('show');
    visible = false;
  }

  function toggle(data, applyCallback) {
    if (visible) hide(); else show(data, applyCallback);
  }

  let lastResult = null;

  function runTransform() {
    const expr = $('tfInput').value.trim();
    if (!expr || !jsonData) return;

    try {
      lastResult = executeChain(jsonData, expr);
      const info = $('tfInfo');
      const results = $('tfResults');

      if (lastResult === undefined) {
        info.textContent = 'undefined';
        info.className = 'tf-info tf-warn';
        results.innerHTML = '';
        return;
      }

      const typeStr = Array.isArray(lastResult) ? `Array[${lastResult.length}]` : typeof lastResult;
      info.textContent = typeStr;
      info.className = 'tf-info';

      const display = JSON.stringify(lastResult, null, 2);
      if (display.length > 50000) {
        results.textContent = display.slice(0, 50000) + '\n... (truncated)';
      } else {
        results.textContent = display;
      }
    } catch (err) {
      $('tfInfo').textContent = 'Error';
      $('tfInfo').className = 'tf-info tf-warn';
      $('tfResults').textContent = err.message;
    }
  }

  function applyTransform() {
    if (lastResult == null) { runTransform(); }
    if (lastResult != null && onApply) {
      onApply(lastResult);
      toast('Transform applied');
      hide();
    }
  }

  function copyResult() {
    if (lastResult == null) runTransform();
    if (lastResult != null) {
      navigator.clipboard.writeText(JSON.stringify(lastResult, null, 2));
      toast('Result copied!');
    }
  }

  // --- Safe expression evaluator (no eval) ---
  function executeChain(data, expr) {
    // Split by pipe operator (respecting parentheses)
    const steps = splitPipes(expr);
    let result = data;
    for (const step of steps) {
      result = executeStep(result, step.trim());
    }
    return result;
  }

  function splitPipes(expr) {
    const parts = [];
    let depth = 0, current = '', inStr = false, strChar = '';
    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i];
      if (inStr) {
        current += ch;
        if (ch === strChar && expr[i - 1] !== '\\') inStr = false;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { inStr = true; strChar = ch; current += ch; continue; }
      if (ch === '(' || ch === '[' || ch === '{') { depth++; current += ch; continue; }
      if (ch === ')' || ch === ']' || ch === '}') { depth--; current += ch; continue; }
      if (ch === '|' && depth === 0) { parts.push(current); current = ''; continue; }
      current += ch;
    }
    if (current.trim()) parts.push(current);
    return parts;
  }

  // Delegate to transform-ops module
  const executeStep = window.App.transformOps.executeStep;

  function showHelpPopup() {
    window.App.helpModal.show('tfHelpModal', 'Transform Expression Reference', [
      { heading: 'How It Works', intro: 'Chain operations with the pipe <code>|</code> operator. Each step transforms the result of the previous one. Uses safe evaluation — no <code>eval</code>, no access to DOM/globals.', code: '.value | filter(x =&gt; x.active) | map(x =&gt; x.name) | sort((a,b) =&gt; a &gt; b ? 1 : -1)' },
      { heading: 'Navigation', rows: [
        ['Expression', 'Description', 'Example'],
        ['<code>.key</code>', 'Access a property', '<code>.users</code>'],
        ['<code>.key.sub</code>', 'Nested property access', '<code>.data.results</code>'],
        ['<code>[0]</code>', 'Array index (0-based)', '<code>[0]</code> → first item'],
        ['<code>[-1]</code>', 'Negative index (from end)', '<code>[-1]</code> → last item'],
        ['<code>length</code>', 'Array/string/object length', '<code>.items | length</code>'],
        ['<code>keys()</code>', 'Object keys as array', '<code>keys()</code>'],
        ['<code>values()</code>', 'Object values as array', '<code>values()</code>'],
        ['<code>entries()</code>', 'Object as [key, value] pairs', '<code>entries()</code>'],
      ]},
      { heading: 'Array Operations', rows: [
        ['Expression', 'Description', 'Example'],
        ['<code>map(x =&gt; expr)</code>', 'Transform each item', '<code>map(x =&gt; x.name)</code>'],
        ['<code>filter(x =&gt; expr)</code>', 'Keep items matching condition', '<code>filter(x =&gt; x.age &gt; 18)</code>'],
        ['<code>find(x =&gt; expr)</code>', 'First item matching condition', '<code>find(x =&gt; x.id === 5)</code>'],
        ['<code>sort((a,b) =&gt; expr)</code>', 'Sort with comparator', '<code>sort((a,b) =&gt; a.name &gt; b.name ? 1 : -1)</code>'],
        ['<code>reverse()</code>', 'Reverse array order', '<code>reverse()</code>'],
        ['<code>flat()</code>', 'Flatten nested arrays', '<code>flat()</code>'],
        ['<code>unique()</code>', 'Remove duplicates', '<code>unique()</code>'],
        ['<code>slice(start, end?)</code>', 'Take a sub-array', '<code>slice(0, 10)</code>'],
      ]},
      { heading: 'Aggregation', rows: [
        ['Expression', 'Description', 'Example'],
        ['<code>count(x =&gt; expr)</code>', 'Count matching items', '<code>count(x =&gt; x.status === \'active\')</code>'],
        ['<code>sum(x =&gt; expr)</code>', 'Sum a numeric field', '<code>sum(x =&gt; x.price)</code>'],
        ['<code>avg(x =&gt; expr)</code>', 'Average a numeric field', '<code>avg(x =&gt; x.score)</code>'],
        ['<code>min(x =&gt; expr)</code>', 'Minimum value', '<code>min(x =&gt; x.age)</code>'],
        ['<code>max(x =&gt; expr)</code>', 'Maximum value', '<code>max(x =&gt; x.age)</code>'],
        ['<code>reduce((a,x) =&gt; expr, init)</code>', 'Custom accumulator', '<code>reduce((a,b) =&gt; a + b, 0)</code>'],
        ['<code>groupBy(x =&gt; expr)</code>', 'Group into object by key', '<code>groupBy(x =&gt; x.department)</code>'],
      ]},
      { heading: 'Advanced Examples', examples: [
        { title: 'Dataverse/API response — extract &amp; filter:', items: [
          '<code>.value | filter(x =&gt; x.statecode === 0) | map(x =&gt; ({name: x.fullname, email: x.emailaddress1}))</code>',
          '<code>.value | groupBy(x =&gt; x._ownerid_value) | keys() | length</code> → count unique owners',
        ]},
        { title: 'Statistics &amp; aggregation:', items: [
          '<code>.orders | sum(x =&gt; x.total)</code> → total revenue',
          '<code>.employees | avg(x =&gt; x.salary)</code> → average salary',
          '<code>.items | groupBy(x =&gt; x.category)</code> → group by category',
        ]},
        { title: 'Chaining multiple operations:', items: [
          '<code>.value | filter(x =&gt; x.createdon &gt; \'2024-01-01\') | sort((a,b) =&gt; a.createdon &gt; b.createdon ? 1 : -1) | slice(0, 10) | map(x =&gt; x.fullname)</code>',
          '<code>.data | flat() | unique() | sort((a,b) =&gt; a &gt; b ? 1 : -1)</code>',
        ]},
      ]},
      { heading: 'Expression Rules in Callbacks', rows: [
        ['Allowed', 'Example'],
        ['Property access', '<code>x.name</code>, <code>x.address.city</code>'],
        ['Comparisons', '<code>===</code>, <code>!==</code>, <code>&gt;</code>, <code>&lt;</code>, <code>&gt;=</code>, <code>&lt;=</code>'],
        ['Arithmetic', '<code>+</code>, <code>-</code>, <code>*</code>, <code>/</code>, <code>%</code>'],
        ['Logical', '<code>&amp;&amp;</code>, <code>||</code>, <code>!</code>'],
        ['Ternary', '<code>x.val &gt; 0 ? \'positive\' : \'negative\'</code>'],
        ['String methods', '<code>x.name.toLowerCase()</code>, <code>x.s.includes(\'foo\')</code>'],
        ['Object literals', '<code>({name: x.name, id: x.id})</code>'],
      ]},
      { heading: 'Tips', tips: [
        '<strong>Start with navigation:</strong> Use <code>.key</code> to drill into your data first',
        '<strong>Click examples:</strong> The chip buttons above the input append to your expression',
        '<strong>Preview first:</strong> Press Ctrl+Enter to preview before applying',
        '<strong>Pipe chain:</strong> Build incrementally — add one <code>| step</code> at a time',
        '<strong>Object reshaping:</strong> Wrap object literals in parentheses: <code>map(x =&gt; ({...}))</code>',
        '<strong>Apply:</strong> "Apply to JSON" replaces the loaded data — use for iterative refinement',
      ]},
    ]);
  }

  function isVisible() { return visible; }

  return { show, hide, toggle, isVisible };
})();
