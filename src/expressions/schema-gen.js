/**
 * Parse JSON Schema Generator for Power Automate
 * - generateJsonSchema: basic single-sample inference
 * - generateSmartSchema: multi-sample inference with nullable/required detection
 */
window.App = window.App || {};
window.App.schemaGen = (() => {
  const { $, toast } = window.App.dom;

  function generateJsonSchema(value) {
    if (value === null) return { type: 'null' };
    if (Array.isArray(value)) {
      if (value.length === 0) return { type: 'array', items: {} };
      return { type: 'array', items: generateJsonSchema(value[0]) };
    }
    if (typeof value === 'object') {
      const schema = { type: 'object', properties: {} };
      const required = [];
      for (const [k, v] of Object.entries(value)) {
        schema.properties[k] = generateJsonSchema(v);
        if (v !== null) required.push(k);
      }
      if (required.length > 0) schema.required = required;
      return schema;
    }
    if (typeof value === 'string') return { type: 'string' };
    if (typeof value === 'number') return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' };
    if (typeof value === 'boolean') return { type: 'boolean' };
    return {};
  }

  /** Smart schema inference — scans ALL array items to detect nullable/required/mixed types */
  function generateSmartSchema(data) {
    if (data === null) return { type: 'null' };
    if (Array.isArray(data)) {
      const schema = { type: 'array' };
      if (data.length > 0) schema.items = inferArrayItemSchema(data);
      return schema;
    }
    if (typeof data === 'object') {
      const properties = {};
      const required = [];
      for (const [k, v] of Object.entries(data)) {
        properties[k] = generateSmartSchema(v);
        required.push(k);
      }
      return { type: 'object', properties, required };
    }
    if (typeof data === 'string') return { type: 'string' };
    if (typeof data === 'number') return Number.isInteger(data) ? { type: 'integer' } : { type: 'number' };
    if (typeof data === 'boolean') return { type: 'boolean' };
    return {};
  }

  /** Merge schemas across all array items to handle inconsistent keys */
  function inferArrayItemSchema(arr) {
    const { profileKeys } = window.App.jsonUtils;
    const objects = arr.filter(item => item !== null && typeof item === 'object' && !Array.isArray(item));
    if (objects.length === 0) return generateSmartSchema(arr[0]);

    const profiled = profileKeys(objects);

    const properties = {};
    for (const { key, present, total, types, sampleVal } of profiled) {
      const typeNames = Object.keys(types);
      const hasNull = 'null' in types;
      const nonNullTypes = typeNames.filter(t => t !== 'null');

      if (nonNullTypes.length === 1 && !hasNull) {
        properties[key] = generateSmartSchema(sampleVal);
      } else if (nonNullTypes.length === 1 && hasNull) {
        const base = generateSmartSchema(sampleVal !== null && sampleVal !== undefined ? sampleVal : '');
        properties[key] = { anyOf: [base, { type: 'null' }] };
      } else if (nonNullTypes.length > 1) {
        properties[key] = {};
      } else {
        properties[key] = { type: 'null' };
      }
    }

    const required = profiled.filter(p => p.present === p.total).map(p => p.key);
    const schema = { type: 'object', properties };
    if (required.length > 0) schema.required = required;
    return schema;
  }

  function render(jsonData) {
    if (!jsonData) return;
    const schema = generateJsonSchema(jsonData);
    const output = JSON.stringify(schema, null, 2);
    $('schemaGenContent').style.display = 'block';
    $('schemaGenBody').querySelector('.no-result').style.display = 'none';
    $('schemaOutput').textContent = output;
  }

  function init() {
    $('btnCopySchema').addEventListener('click', () => {
      const text = $('schemaOutput').textContent;
      navigator.clipboard.writeText(text).then(() => toast('Schema copied!'));
    });
  }

  return { render, init, generateJsonSchema, generateSmartSchema };
})();
