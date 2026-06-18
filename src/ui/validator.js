/**
 * JSON Schema Validator — validates JSON data against a JSON Schema using Ajv.
 */
window.App = window.App || {};
window.App.validator = (() => {
  const { $, esc, toast } = window.App.dom;
  const { require } = window.App.libLoader;

  let panel = null;
  let visible = false;
  let jsonData = null;

  function init(container) {
    panel = document.createElement('div');
    panel.className = 'val-panel';
    panel.id = 'validatorPanel';
    panel.innerHTML = `
      <div class="val-header">
        <span class="val-title">JSON Schema Validator</span>
        <button class="val-close" id="valClose">&#10005;</button>
      </div>
      <div class="val-input-area">
        <textarea class="val-input" id="valInput" rows="6" placeholder="Paste your JSON Schema here..." spellcheck="false"></textarea>
      </div>
      <div class="val-actions">
        <button class="val-btn val-btn-run" id="valRun">&#9989; Validate</button>
        <button class="val-btn" id="valGenerate">Generate Schema from Data</button>
      </div>
      <div class="val-results" id="valResults"></div>
    `;
    container.appendChild(panel);

    $('valClose').addEventListener('click', hide);
    $('valRun').addEventListener('click', runValidation);
    $('valGenerate').addEventListener('click', generateSchema);
    $('valInput').addEventListener('keydown', e => {
      if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); runValidation(); }
      if (e.key === 'Escape') hide();
    });
  }

  function show(data) {
    jsonData = data;
    if (!panel) init(document.body);
    panel.classList.add('show');
    visible = true;
    $('valInput').focus();
  }

  function hide() {
    if (panel) panel.classList.remove('show');
    visible = false;
  }

  function toggle(data) {
    if (visible) hide(); else show(data);
  }

  async function runValidation() {
    const schemaText = $('valInput').value.trim();
    if (!schemaText) { toast('Paste a JSON Schema first'); return; }
    if (!jsonData) { toast('No JSON loaded'); return; }

    let schema;
    try {
      schema = JSON.parse(schemaText);
    } catch (e) {
      $('valResults').innerHTML = `<div class="val-error">Invalid schema JSON: ${esc(e.message)}</div>`;
      return;
    }

    try {
      await require('ajv');
    } catch {
      $('valResults').innerHTML = `<div class="val-error">Failed to load Ajv validation library</div>`;
      return;
    }

    try {
      const ajv = new window.Ajv({ allErrors: true, verbose: true });
      const validate = ajv.compile(schema);
      const valid = validate(jsonData);

      if (valid) {
        $('valResults').innerHTML = `<div class="val-success">&#9989; Valid! Data matches the schema.</div>`;
      } else {
        let html = `<div class="val-fail">&#10060; Validation failed (${validate.errors.length} error${validate.errors.length > 1 ? 's' : ''})</div>`;
        html += '<div class="val-error-list">';
        for (const err of validate.errors.slice(0, 50)) {
          const path = err.instancePath || '(root)';
          html += `<div class="val-err-item">
            <span class="val-err-path">${esc(path)}</span>
            <span class="val-err-msg">${esc(err.message || 'unknown error')}</span>
            ${err.params ? `<span class="val-err-params">${esc(JSON.stringify(err.params))}</span>` : ''}
          </div>`;
        }
        if (validate.errors.length > 50) {
          html += `<div class="val-err-more">...and ${validate.errors.length - 50} more errors</div>`;
        }
        html += '</div>';
        $('valResults').innerHTML = html;
      }
    } catch (e) {
      $('valResults').innerHTML = `<div class="val-error">Schema compilation error: ${esc(e.message)}</div>`;
    }
  }

  function generateSchema() {
    if (!jsonData) { toast('No JSON loaded'); return; }
    const schema = window.App.schemaGen.generateSmartSchema(jsonData);
    $('valInput').value = JSON.stringify(schema, null, 2);
    toast('Schema generated from data');
  }

  function isVisible() { return visible; }

  return { show, hide, toggle, isVisible };
})();
