/**
 * Traverse — unified iterative JSON traversal utility.
 * Safely handles deeply nested structures using a stack (no recursion overflow).
 */
window.App = window.App || {};
window.App.traverse = (() => {

  /**
   * Walk a JSON value iteratively (stack-based, depth-first).
   * @param {*} obj - Root value to traverse
   * @param {function} visitor - Called with (value, path, depth). Return false to skip children.
   * @param {object} opts - { maxDepth: 20 }
   */
  function walk(obj, visitor, opts = {}) {
    const { maxDepth = 20 } = opts;
    const stack = [{ val: obj, path: '', depth: 0 }];

    while (stack.length > 0) {
      const { val, path, depth } = stack.pop();
      if (depth > maxDepth) continue;

      const action = visitor(val, path, depth);
      if (action === false) continue; // skip children

      if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          // Push in reverse so index 0 comes off stack first
          for (let i = val.length - 1; i >= 0; i--) {
            const childPath = path ? `${path}[${i}]` : `[${i}]`;
            stack.push({ val: val[i], path: childPath, depth: depth + 1 });
          }
        } else {
          const entries = Object.entries(val);
          for (let i = entries.length - 1; i >= 0; i--) {
            const [k, v] = entries[i];
            const childPath = path ? `${path}.${k}` : k;
            stack.push({ val: v, path: childPath, depth: depth + 1 });
          }
        }
      }
    }
  }

  /**
   * Collect all paths in a JSON structure.
   * @param {*} obj
   * @returns {Array<{path: string, type: string}>}
   */
  function collectPaths(obj) {
    const paths = [];
    walk(obj, (val, path, depth) => {
      if (path === '' && !Array.isArray(val)) return; // skip root object itself
      if (Array.isArray(val)) {
        paths.push({ path: path || '(root)', type: 'array' });
        // Only traverse first item for schema detection
        if (val.length > 0) {
          const cp = path ? `${path}[0]` : '[0]';
          if (val[0] && typeof val[0] === 'object') {
            // Will be handled by stack naturally if we don't skip
          } else {
            paths.push({ path: cp, type: val[0] === null ? 'null' : typeof val[0] });
          }
        }
        return false; // Don't auto-traverse array items (we handle [0] manually below)
      }
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        if (path) paths.push({ path, type: 'object' });
        return; // let children be traversed
      }
      // Primitive
      paths.push({ path, type: val === null ? 'null' : typeof val });
    });
    // For arrays, also traverse first item's structure
    walk(obj, (val, path) => {
      if (Array.isArray(val) && val.length > 0 && val[0] && typeof val[0] === 'object') {
        const firstPath = path ? `${path}[0]` : '[0]';
        walk(val[0], (v, p, d) => {
          const fullPath = p ? `${firstPath}.${p}` : firstPath;
          if (Array.isArray(v)) {
            paths.push({ path: fullPath, type: 'array' });
            return false;
          }
          if (v && typeof v === 'object') {
            paths.push({ path: fullPath, type: 'object' });
            return;
          }
          paths.push({ path: fullPath, type: v === null ? 'null' : typeof v });
        });
        return false; // don't recurse into array items beyond first
      }
    });
    return paths;
  }

  /**
   * Find all arrays in a JSON structure at any depth.
   * Returns { path, count, data } for each array found.
   */
  function findAllArrays(obj, path = '', _seen) {
    const seen = _seen || new Set();
    if (obj && typeof obj === 'object') {
      if (seen.has(obj)) return [];
      seen.add(obj);
    }
    const result = [];
    if (Array.isArray(obj)) {
      result.push({ path: path || '(root)', count: obj.length, data: obj });
      // Recurse into each item of the array
      for (let i = 0; i < obj.length; i++) {
        const item = obj[i];
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          for (const [k, v] of Object.entries(item)) {
            if (v && typeof v === 'object') {
              const childPath = path ? `${path}[*].${k}` : `[*].${k}`;
              // Avoid duplicate paths — only discover from first occurrence
              if (!result.some(r => r.path === childPath)) {
                const sub = findAllArrays(v, childPath, seen);
                for (let s = 0; s < sub.length; s++) {
                  if (!result.some(r => r.path === sub[s].path)) result.push(sub[s]);
                }
              }
            }
          }
        }
      }
    } else if (obj && typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) {
        const sub = findAllArrays(v, path ? `${path}.${k}` : k, seen);
        for (let i = 0; i < sub.length; i++) result.push(sub[i]);
      }
    }
    return result;
  }

  /**
   * Find all arrays in a JSON structure.
   * @param {*} obj
   * @param {string} basePath
   * @returns {Array<{path: string, length: number, sample: *}>}
   */
  function findArrays(obj, basePath = '') {
    const arrays = [];
    walk(obj, (val, path) => {
      if (Array.isArray(val)) {
        arrays.push({ path: path || '(root)', length: val.length, sample: val });
      }
    });
    return arrays;
  }

  /**
   * Find the first array of plain objects in a JSON structure.
   * @param {*} obj
   * @returns {Array|null}
   */
  function findArrayOfObjects(obj) {
    if (Array.isArray(obj) && obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null && !Array.isArray(obj[0])) {
      return obj;
    }
    if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
      for (const v of Object.values(obj)) {
        const result = findArrayOfObjects(v);
        if (result) return result;
      }
    }
    return null;
  }

  /**
   * Search all keys and values in a JSON structure against a regex.
   * Returns a Set of data-path strings for matching leaves/keys.
   * @param {*} obj - Root JSON value
   * @param {RegExp} regex - Pattern to test against keys and values
   * @returns {{ matchedPaths: Set<string>, total: number }}
   */
  function searchValues(obj, regex) {
    const matchedPaths = new Set();
    let total = 0;
    const stack = [{ val: obj, path: '', depth: 0 }];
    while (stack.length > 0) {
      const { val, path, depth } = stack.pop();
      if (depth > 20) continue;
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          for (let i = val.length - 1; i >= 0; i--) {
            const cp = path ? `${path}[${i}]` : `[${i}]`;
            stack.push({ val: val[i], path: cp, depth: depth + 1 });
          }
        } else {
          const entries = Object.entries(val);
          for (let i = entries.length - 1; i >= 0; i--) {
            const [k, v] = entries[i];
            const cp = path ? `${path}.${k}` : k;
            // Test key name
            if (regex.test(k)) matchedPaths.add(cp);
            stack.push({ val: v, path: cp, depth: depth + 1 });
          }
        }
      } else {
        // Leaf value — test string representation
        if (path) {
          total++;
          const str = val === null ? 'null' : String(val);
          if (regex.test(str)) matchedPaths.add(path);
        }
      }
    }
    return { matchedPaths, total };
  }

  /**
   * Search for all paths where the key name matches exactly.
   * @param {*} obj - Root JSON value
   * @param {string} keyName - Exact key name to find
   * @returns {Set<string>} Set of matching data-path strings
   */
  function searchKeys(obj, keyName) {
    const matched = new Set();
    const stack = [{ val: obj, path: '', depth: 0 }];
    while (stack.length > 0) {
      const { val, path, depth } = stack.pop();
      if (depth > 20) continue;
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          for (let i = val.length - 1; i >= 0; i--) {
            const cp = path ? `${path}[${i}]` : `[${i}]`;
            stack.push({ val: val[i], path: cp, depth: depth + 1 });
          }
        } else {
          const entries = Object.entries(val);
          for (let i = entries.length - 1; i >= 0; i--) {
            const [k, v] = entries[i];
            const cp = path ? `${path}.${k}` : k;
            if (k === keyName) matched.add(cp);
            stack.push({ val: v, path: cp, depth: depth + 1 });
          }
        }
      }
    }
    return matched;
  }

  /**
   * Count paths matching a regex pattern (for path-mode filter counting).
   * @param {*} obj - Root JSON value
   * @param {RegExp} regex - Pattern to test against paths
   * @returns {{ matched: number, total: number }}
   */
  function countPathMatches(obj, regex) {
    let matched = 0, total = 0;
    const stack = [{ val: obj, path: '', depth: 0 }];
    while (stack.length > 0) {
      const { val, path, depth } = stack.pop();
      if (depth > 20) continue;
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          for (let i = val.length - 1; i >= 0; i--) {
            const cp = path ? `${path}[${i}]` : `[${i}]`;
            stack.push({ val: val[i], path: cp, depth: depth + 1 });
          }
        } else {
          const entries = Object.entries(val);
          for (let i = entries.length - 1; i >= 0; i--) {
            const [k, v] = entries[i];
            const cp = path ? `${path}.${k}` : k;
            stack.push({ val: v, path: cp, depth: depth + 1 });
          }
        }
      } else if (path) {
        total++;
        if (regex.test(path)) matched++;
      }
    }
    return { matched, total };
  }

  return { walk, collectPaths, findArrays, findAllArrays, findArrayOfObjects, searchValues, searchKeys, countPathMatches };
})();
