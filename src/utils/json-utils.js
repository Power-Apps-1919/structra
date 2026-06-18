/**
 * JSON Utilities — lint (duplicate key detection), operations (sort/flatten/search-replace),
 * and patch (RFC 6902 diff/apply).
 */
window.App = window.App || {};
window.App.jsonUtils = (() => {

  // =====================================================
  //  LINT — duplicate key detection
  // =====================================================

  function detectDuplicateKeys(text) {
    const duplicates = [];
    const stack = [{ keys: new Set(), path: '$' }];
    let inString = false;
    let escaped = false;
    let currentKey = '';
    let lastKey = '';
    let collectingKey = false;
    let line = 1;
    let expectingColon = false;
    let expectingValue = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\n') line++;

      if (inString) {
        if (escaped) { escaped = false; currentKey += ch; continue; }
        if (ch === '\\') { escaped = true; currentKey += ch; continue; }
        if (ch === '"') {
          inString = false;
          if (collectingKey) {
            expectingColon = true;
          }
          continue;
        }
        if (collectingKey) currentKey += ch;
        continue;
      }

      if (ch === '"') {
        inString = true;
        if (expectingValue) {
          collectingKey = false;
          expectingValue = false;
        } else if (!expectingColon && stack.length > 0 && stack[stack.length - 1].type === 'object') {
          collectingKey = true;
          currentKey = '';
        } else {
          collectingKey = false;
        }
        continue;
      }

      if (ch === ':') {
        if (expectingColon && currentKey) {
          const ctx = stack[stack.length - 1];
          const fullPath = ctx.path + '.' + currentKey;
          if (ctx.keys.has(currentKey)) {
            duplicates.push({ key: currentKey, path: fullPath, line });
          } else {
            ctx.keys.add(currentKey);
          }
          lastKey = currentKey;
          currentKey = '';
          expectingColon = false;
        }
        expectingValue = true;
        continue;
      }

      if (ch === ',') {
        expectingValue = false;
        continue;
      }

      if (ch === '{') {
        const parentPath = stack.length > 0 ? stack[stack.length - 1].path : '$';
        stack.push({ keys: new Set(), path: parentPath + (lastKey ? '.' + lastKey : ''), type: 'object' });
        lastKey = '';
        currentKey = '';
        expectingColon = false;
        expectingValue = false;
        continue;
      }

      if (ch === '[') {
        const parentPath = stack.length > 0 ? stack[stack.length - 1].path : '$';
        stack.push({ keys: new Set(), path: parentPath + (lastKey ? '.' + lastKey : ''), type: 'array' });
        lastKey = '';
        expectingValue = false;
        continue;
      }

      if (ch === '}' || ch === ']') {
        if (stack.length > 1) stack.pop();
        expectingValue = false;
        continue;
      }
    }

    return duplicates;
  }

  // =====================================================
  //  OPS — sort keys, sort arrays, flatten/unflatten, search-replace
  // =====================================================

  function sortKeys(obj, order = 'asc', recursive = true) {
    if (Array.isArray(obj)) {
      return recursive ? obj.map(item => sortKeys(item, order, true)) : [...obj];
    }
    if (obj && typeof obj === 'object' && obj !== null) {
      const keys = Object.keys(obj).sort((a, b) => {
        const cmp = a.localeCompare(b, undefined, { sensitivity: 'base' });
        return order === 'desc' ? -cmp : cmp;
      });
      const result = {};
      for (const k of keys) {
        result[k] = recursive ? sortKeys(obj[k], order, true) : obj[k];
      }
      return result;
    }
    return obj;
  }

  function sortArray(arr, field, order = 'asc') {
    if (!Array.isArray(arr)) return arr;
    return [...arr].sort((a, b) => {
      const va = a && a[field] != null ? a[field] : '';
      const vb = b && b[field] != null ? b[field] : '';
      let cmp;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' });
      }
      return order === 'desc' ? -cmp : cmp;
    });
  }

  function flatten(obj, separator = '.', prefix = '') {
    const result = {};
    function walk(val, path) {
      if (val === null || typeof val !== 'object') {
        result[path] = val;
        return;
      }
      if (Array.isArray(val)) {
        if (val.length === 0) { result[path] = []; return; }
        for (let i = 0; i < val.length; i++) {
          walk(val[i], path ? `${path}[${i}]` : `[${i}]`);
        }
        return;
      }
      const keys = Object.keys(val);
      if (keys.length === 0) { result[path] = {}; return; }
      for (const k of keys) {
        const newPath = path ? `${path}${separator}${k}` : k;
        walk(val[k], newPath);
      }
    }
    walk(obj, prefix);
    return result;
  }

  function unflatten(obj, separator = '.') {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const result = {};
    for (const [flatKey, val] of Object.entries(obj)) {
      const parts = [];
      let current = '';
      for (let i = 0; i < flatKey.length; i++) {
        const ch = flatKey[i];
        if (ch === separator[0] && current) {
          parts.push(current);
          current = '';
        } else if (ch === '[') {
          if (current) { parts.push(current); current = ''; }
          const end = flatKey.indexOf(']', i);
          parts.push(parseInt(flatKey.slice(i + 1, end)));
          i = end;
        } else {
          current += ch;
        }
      }
      if (current) parts.push(current);

      let target = result;
      for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        const nextKey = parts[i + 1];
        if (target[key] == null) {
          target[key] = typeof nextKey === 'number' ? [] : {};
        }
        target = target[key];
      }
      target[parts[parts.length - 1]] = val;
    }

    const keys = Object.keys(result);
    if (keys.length > 0 && keys.every(k => /^\d+$/.test(k))) {
      const arr = [];
      for (const k of keys) arr[parseInt(k)] = result[k];
      return arr;
    }
    return result;
  }

  function searchReplace(obj, search, replacement, options = { keys: false, values: true }) {
    let count = 0;
    const regex = search instanceof RegExp ? search : null;

    function matches(str) {
      if (regex) return regex.test(str);
      return str.includes(search);
    }

    function replace(str) {
      if (regex) return str.replace(new RegExp(regex.source, regex.flags), replacement);
      return str.split(search).join(replacement);
    }

    function walk(val) {
      if (typeof val === 'string' && options.values) {
        if (matches(val)) { count++; return replace(val); }
        return val;
      }
      if (Array.isArray(val)) {
        return val.map(item => walk(item));
      }
      if (val && typeof val === 'object') {
        const result = {};
        for (const [k, v] of Object.entries(val)) {
          let newKey = k;
          if (options.keys && typeof k === 'string' && matches(k)) {
            count++;
            newKey = replace(k);
          }
          result[newKey] = walk(v);
        }
        return result;
      }
      return val;
    }

    const result = walk(obj);
    return { result, count };
  }

  // =====================================================
  //  PATCH — RFC 6902 diff/apply
  // =====================================================

  function diff(source, target, path = '') {
    const ops = [];
    if (source === target) return ops;
    if (source === null || target === null || typeof source !== 'object' || typeof target !== 'object') {
      ops.push({ op: 'replace', path: path || '/', value: target });
      return ops;
    }
    if (Array.isArray(source) && Array.isArray(target)) {
      return diffArrays(source, target, path);
    }
    if (Array.isArray(source) !== Array.isArray(target)) {
      ops.push({ op: 'replace', path: path || '/', value: target });
      return ops;
    }

    const sourceKeys = new Set(Object.keys(source));
    const targetKeys = new Set(Object.keys(target));

    for (const key of sourceKeys) {
      if (!targetKeys.has(key)) {
        ops.push({ op: 'remove', path: `${path}/${escapePointer(key)}` });
      }
    }
    for (const key of targetKeys) {
      if (!sourceKeys.has(key)) {
        ops.push({ op: 'add', path: `${path}/${escapePointer(key)}`, value: target[key] });
      }
    }
    for (const key of sourceKeys) {
      if (targetKeys.has(key)) {
        const childOps = diff(source[key], target[key], `${path}/${escapePointer(key)}`);
        ops.push(...childOps);
      }
    }
    return ops;
  }

  function diffArrays(source, target, path) {
    const ops = [];
    const minLen = Math.min(source.length, target.length);
    for (let i = 0; i < minLen; i++) {
      const childOps = diff(source[i], target[i], `${path}/${i}`);
      ops.push(...childOps);
    }
    for (let i = minLen; i < target.length; i++) {
      ops.push({ op: 'add', path: `${path}/-`, value: target[i] });
    }
    for (let i = source.length - 1; i >= minLen; i--) {
      ops.push({ op: 'remove', path: `${path}/${i}` });
    }
    return ops;
  }

  function escapePointer(str) {
    return String(str).replace(/~/g, '~0').replace(/\//g, '~1');
  }

  function applyPatch(doc, patch) {
    let result = JSON.parse(JSON.stringify(doc));
    for (const op of patch) {
      const tokens = parsePath(op.path);
      if (op.op === 'add') {
        setAtPath(result, tokens, op.value, true);
      } else if (op.op === 'remove') {
        removeAtPath(result, tokens);
      } else if (op.op === 'replace') {
        setAtPath(result, tokens, op.value, false);
      } else if (op.op === 'move') {
        const fromTokens = parsePath(op.from);
        const val = getAtPath(result, fromTokens);
        removeAtPath(result, fromTokens);
        setAtPath(result, tokens, val, true);
      } else if (op.op === 'copy') {
        const fromTokens = parsePath(op.from);
        const val = JSON.parse(JSON.stringify(getAtPath(result, fromTokens)));
        setAtPath(result, tokens, val, true);
      }
    }
    return result;
  }

  function parsePath(path) {
    if (!path || path === '/') return [];
    return path.split('/').slice(1).map(t => t.replace(/~1/g, '/').replace(/~0/g, '~'));
  }

  function getAtPath(obj, tokens) {
    let cur = obj;
    for (const t of tokens) {
      if (cur === null || cur === undefined) return undefined;
      cur = Array.isArray(cur) ? cur[parseInt(t)] : cur[t];
    }
    return cur;
  }

  function setAtPath(obj, tokens, value, isAdd) {
    if (tokens.length === 0) return;
    let cur = obj;
    for (let i = 0; i < tokens.length - 1; i++) {
      const t = tokens[i];
      cur = Array.isArray(cur) ? cur[parseInt(t)] : cur[t];
    }
    const last = tokens[tokens.length - 1];
    if (Array.isArray(cur)) {
      if (last === '-') cur.push(value);
      else if (isAdd) cur.splice(parseInt(last), 0, value);
      else cur[parseInt(last)] = value;
    } else {
      cur[last] = value;
    }
  }

  function removeAtPath(obj, tokens) {
    if (tokens.length === 0) return;
    let cur = obj;
    for (let i = 0; i < tokens.length - 1; i++) {
      const t = tokens[i];
      cur = Array.isArray(cur) ? cur[parseInt(t)] : cur[t];
    }
    const last = tokens[tokens.length - 1];
    if (Array.isArray(cur)) cur.splice(parseInt(last), 1);
    else delete cur[last];
  }

  function formatPatch(patch) {
    return JSON.stringify(patch, null, 2);
  }

  // =====================================================
  //  ANALYSIS — key coverage, nested analysis, deep search
  // =====================================================

  /**
   * Analyze key presence/missing/empty across an array of objects.
   * Returns [{ key, present, missing, empty, pct, type:'primitive'|'object'|'array' }]
   */
  function analyzeKeys(arr) {
    const keyMap = Object.create(null);
    const total = arr.length;
    for (let i = 0; i < total; i++) {
      const row = arr[i];
      if (!row || typeof row !== 'object') continue;
      const keys = Object.keys(row);
      for (let j = 0; j < keys.length; j++) {
        const key = keys[j];
        if (!keyMap[key]) keyMap[key] = { key, present: 0, missing: 0, empty: 0, pct: 0, type: 'primitive' };
        keyMap[key].present++;
        const val = row[key];
        if (val === null || val === undefined || val === '') keyMap[key].empty++;
        if (val !== null && typeof val === 'object') {
          keyMap[key].type = Array.isArray(val) ? 'array' : 'object';
        }
      }
    }
    const entries = Object.values(keyMap);
    for (let i = 0; i < entries.length; i++) {
      entries[i].missing = total - entries[i].present;
      entries[i].pct = Math.round((entries[i].present / total) * 100);
    }
    return entries;
  }

  /**
   * Analyze nested keys for object-typed fields within an array.
   */
  function analyzeNestedKeys(arr, parentKey) {
    const keyMap = Object.create(null);
    let total = 0;
    for (let i = 0; i < arr.length; i++) {
      const row = arr[i];
      if (!row || typeof row !== 'object') continue;
      const val = row[parentKey];
      if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
      total++;
      const keys = Object.keys(val);
      for (let j = 0; j < keys.length; j++) {
        const key = keys[j];
        if (!keyMap[key]) keyMap[key] = { key, present: 0, missing: 0, empty: 0, pct: 0, type: 'primitive' };
        keyMap[key].present++;
        const v = val[key];
        if (v === null || v === undefined || v === '') keyMap[key].empty++;
        if (v !== null && typeof v === 'object') keyMap[key].type = Array.isArray(v) ? 'array' : 'object';
      }
    }
    const entries = Object.values(keyMap);
    for (let i = 0; i < entries.length; i++) {
      entries[i].missing = total - entries[i].present;
      entries[i].pct = total > 0 ? Math.round((entries[i].present / total) * 100) : 0;
    }
    return entries;
  }

  /**
   * Collect all array values of a given key from rows, flattening into one array.
   */
  function collectArrayItems(data, key) {
    const merged = [];
    for (let i = 0; i < data.length; i++) {
      const val = data[i] && data[i][key];
      if (Array.isArray(val)) {
        for (let j = 0; j < val.length; j++) merged.push(val[j]);
      }
    }
    return merged;
  }

  /**
   * Recursively stringify any value to a flat string of all leaf values (for deep search).
   */
  function deepStr(val) {
    if (val == null) return '';
    if (typeof val !== 'object') return String(val);
    const parts = [];
    const stack = [val];
    while (stack.length) {
      const cur = stack.pop();
      if (cur == null) continue;
      if (typeof cur !== 'object') { parts.push(String(cur)); continue; }
      if (Array.isArray(cur)) { for (let i = cur.length - 1; i >= 0; i--) stack.push(cur[i]); }
      else { for (const v of Object.values(cur)) stack.push(v); }
    }
    return parts.join(' ');
  }

  /**
   * Profile keys across an array of objects: discover all keys, count presence,
   * detect types per key, collect sample values. Shared foundation for
   * analyzeKeys, inferArrayItemSchema, and data-profiler.
   * Returns [{ key, present, total, types:{type→count}, primaryType, sampleVal }]
   */
  function profileKeys(arr) {
    const total = arr.length;
    const keyMap = Object.create(null);
    for (let i = 0; i < total; i++) {
      const row = arr[i];
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      for (const k of Object.keys(row)) {
        if (!keyMap[k]) keyMap[k] = { key: k, present: 0, total, types: {}, sampleVal: undefined };
        const entry = keyMap[k];
        entry.present++;
        const v = row[k];
        const t = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
        entry.types[t] = (entry.types[t] || 0) + 1;
        if (entry.sampleVal === undefined && v !== null && v !== undefined) entry.sampleVal = v;
      }
    }
    return Object.values(keyMap);
  }

  /**
   * Wildcard pattern matching (supports * and ? globs).
   */
  function wildcardMatch(text, pattern) {
    const escaped = pattern.replace(/([.+^${}()|[\]\\])/g, '\\$1');
    const regex = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
    try { return new RegExp('^' + regex + '$', 'i').test(text); } catch { return false; }
  }

  /**
   * Find all paths to null, empty string, empty array, or empty object values.
   */
  function findNullPaths(obj, path) {
    const p = path || '';
    const results = [];
    if (obj === null || obj === '') { results.push(p); return results; }
    if (Array.isArray(obj)) {
      if (obj.length === 0) { results.push(p); return results; }
      for (let i = 0; i < obj.length; i++) results.push(...findNullPaths(obj[i], `${p}[${i}]`));
    } else if (obj && typeof obj === 'object') {
      if (Object.keys(obj).length === 0) { results.push(p); return results; }
      for (const [k, v] of Object.entries(obj)) results.push(...findNullPaths(v, p ? `${p}.${k}` : k));
    }
    return results;
  }

  return {
    // Lint
    detectDuplicateKeys,
    // Ops
    sortKeys, sortArray, flatten, unflatten, searchReplace,
    // Patch
    diff, apply: applyPatch, format: formatPatch,
    // Analysis
    analyzeKeys, analyzeNestedKeys, collectArrayItems, deepStr,
    // Shared utilities
    profileKeys, wildcardMatch, findNullPaths
  };
})();

// Backward-compatible aliases (scoped to original APIs)
window.App.jsonLint = { detectDuplicateKeys: window.App.jsonUtils.detectDuplicateKeys };
window.App.jsonOps = { sortKeys: window.App.jsonUtils.sortKeys, sortArray: window.App.jsonUtils.sortArray, flatten: window.App.jsonUtils.flatten, unflatten: window.App.jsonUtils.unflatten, searchReplace: window.App.jsonUtils.searchReplace };
window.App.jsonPatch = { diff: window.App.jsonUtils.diff, apply: window.App.jsonUtils.apply, format: window.App.jsonUtils.format };
