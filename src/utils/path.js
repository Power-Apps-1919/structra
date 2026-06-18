/**
 * Path tokenization, resolution, and Power Platform path builders
 */
window.App = window.App || {};
window.App.path = (() => {
  function tokenizePath(path) {
    const tokens = [];
    let i = 0;
    while (i < path.length) {
      if (path[i] === '[') {
        // Check if it's a quoted key like ["key.with.dots"]
        if (path[i + 1] === '"' || path[i + 1] === "'") {
          const quote = path[i + 1];
          const start = i + 2;
          const end = path.indexOf(quote + ']', start);
          if (end === -1) break;
          tokens.push({ type: 'key', value: path.slice(start, end) });
          i = end + 2;
          if (path[i] === '.') i++;
        } else {
          const end = path.indexOf(']', i);
          if (end === -1) break;
          const inner = path.slice(i + 1, end);
          if (inner === '*') {
            tokens.push({ type: 'wildcard', value: '*' });
          } else {
            tokens.push({ type: 'index', value: parseInt(inner) });
          }
          i = end + 1;
          if (path[i] === '.') i++;
        }
      } else {
        let end = i;
        while (end < path.length && path[end] !== '.' && path[end] !== '[') end++;
        if (end > i) tokens.push({ type: 'key', value: path.slice(i, end) });
        i = end;
        if (path[i] === '.') i++;
      }
    }
    return tokens;
  }

  function resolvePath(obj, path) {
    if (!path) return obj;
    const tokens = tokenizePath(path);
    return resolveTokens(obj, tokens, 0);
  }

  function resolveTokens(obj, tokens, idx) {
    if (idx >= tokens.length) return obj;
    if (obj === null || obj === undefined) return undefined;
    const t = tokens[idx];
    if (t.type === 'wildcard') {
      // Iterate all items in array, resolve remaining tokens on each, flatten
      if (!Array.isArray(obj)) return undefined;
      const results = [];
      for (let i = 0; i < obj.length; i++) {
        const sub = resolveTokens(obj[i], tokens, idx + 1);
        if (sub !== undefined) {
          if (Array.isArray(sub)) results.push(...sub);
          else results.push(sub);
        }
      }
      return results;
    }
    return resolveTokens(obj[t.value], tokens, idx + 1);
  }

  function buildPAPath(path) {
    const tokens = tokenizePath(path);
    let result = "body('Parse_JSON')";
    for (const t of tokens) {
      if (t.type === 'key') result += `?['${t.value}']`;
      else result += `[${t.value}]`;
    }
    return result;
  }

  function buildFxPathFull(tokens) {
    let expr = "ParseJSON(jsonText)";
    for (const p of tokens) {
      if (p.type === 'key') {
        const needsQuote = /[^a-zA-Z0-9_]/.test(p.value);
        expr += needsQuote ? `.\'${p.value}\'` : `.${p.value}`;
      } else {
        expr = `Index(${expr}, ${p.value + 1})`;
      }
    }
    return expr;
  }

  function getLastKey(path) {
    const tokens = tokenizePath(path);
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (tokens[i].type === 'key') return tokens[i].value;
    }
    return 'data';
  }

  function setNestedValue(obj, path, value) {
    const tokens = tokenizePath(path);
    let current = obj;
    for (let i = 0; i < tokens.length - 1; i++) {
      current = current[tokens[i].value];
      if (current == null) return;
    }
    const last = tokens[tokens.length - 1];
    current[last.value] = value;
  }

  return { tokenizePath, resolvePath, buildPAPath, buildFxPathFull, getLastKey, setNestedValue };
})();
