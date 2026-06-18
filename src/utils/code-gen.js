/**
 * Code Generator — generate typed code from JSON in multiple languages
 */
window.App = window.App || {};
window.App.codeGen = (() => {

  const { typeOf } = window.App.typeHelpers;
  const { capitalize, camelCase, pascalCase, snakeCase } = window.App.format;

  // === TypeScript ===
  function toTypeScript(val, name = 'Root') {
    const interfaces = [];

    function walk(v, iName) {
      if (Array.isArray(v)) {
        if (v.length > 0 && typeof v[0] === 'object' && v[0] !== null) {
          walk(v[0], iName + 'Item');
          return `${iName}Item[]`;
        }
        if (v.length > 0) return inferTsType(v[0]) + '[]';
        return 'any[]';
      }
      if (v && typeof v === 'object') {
        const fields = [];
        for (const [k, val] of Object.entries(v)) {
          const type = walk(val, pascalCase(k));
          const optional = val === null ? '?' : '';
          fields.push(`  ${k}${optional}: ${type};`);
        }
        interfaces.push(`interface ${iName} {\n${fields.join('\n')}\n}`);
        return iName;
      }
      return inferTsType(v);
    }

    function inferTsType(v) {
      if (v === null) return 'null';
      if (typeof v === 'string') return 'string';
      if (typeof v === 'number') return Number.isInteger(v) ? 'number' : 'number';
      if (typeof v === 'boolean') return 'boolean';
      return 'any';
    }

    walk(val, name);
    return interfaces.reverse().join('\n\n');
  }

  // === Python (dataclass) ===
  function toPython(val, name = 'Root') {
    const classes = [];

    function walk(v, cName) {
      if (Array.isArray(v)) {
        if (v.length > 0 && typeof v[0] === 'object' && v[0] !== null) {
          walk(v[0], cName + 'Item');
          return `List[${cName}Item]`;
        }
        if (v.length > 0) return `List[${pyType(v[0])}]`;
        return 'List[Any]';
      }
      if (v && typeof v === 'object') {
        const fields = [];
        for (const [k, val] of Object.entries(v)) {
          const type = walk(val, pascalCase(k));
          const optional = val === null ? `Optional[${type}]` : type;
          fields.push(`    ${snakeCase(k)}: ${val === null ? optional : type}`);
        }
        classes.push(`@dataclass\nclass ${cName}:\n${fields.join('\n')}`);
        return cName;
      }
      return pyType(v);
    }

    function pyType(v) {
      if (v === null) return 'None';
      if (typeof v === 'string') return 'str';
      if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float';
      if (typeof v === 'boolean') return 'bool';
      return 'Any';
    }

    walk(val, name);
    return 'from dataclasses import dataclass\nfrom typing import List, Optional, Any\n\n' + classes.reverse().join('\n\n');
  }

  // === C# ===
  function toCSharp(val, name = 'Root') {
    const classes = [];

    function walk(v, cName) {
      if (Array.isArray(v)) {
        if (v.length > 0 && typeof v[0] === 'object' && v[0] !== null) {
          walk(v[0], cName + 'Item');
          return `List<${cName}Item>`;
        }
        if (v.length > 0) return `List<${csType(v[0])}>`;
        return 'List<object>';
      }
      if (v && typeof v === 'object') {
        const props = [];
        for (const [k, val] of Object.entries(v)) {
          const type = walk(val, pascalCase(k));
          const nullable = val === null ? '?' : '';
          props.push(`    public ${type}${nullable} ${pascalCase(k)} { get; set; }`);
        }
        classes.push(`public class ${cName}\n{\n${props.join('\n')}\n}`);
        return cName;
      }
      return csType(v);
    }

    function csType(v) {
      if (v === null) return 'object';
      if (typeof v === 'string') return 'string';
      if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'double';
      if (typeof v === 'boolean') return 'bool';
      return 'object';
    }

    walk(val, name);
    return classes.reverse().join('\n\n');
  }

  // === Go ===
  function toGo(val, name = 'Root') {
    const structs = [];

    function walk(v, sName) {
      if (Array.isArray(v)) {
        if (v.length > 0 && typeof v[0] === 'object' && v[0] !== null) {
          walk(v[0], sName + 'Item');
          return `[]${sName}Item`;
        }
        if (v.length > 0) return `[]${goType(v[0])}`;
        return '[]interface{}';
      }
      if (v && typeof v === 'object') {
        const fields = [];
        for (const [k, val] of Object.entries(v)) {
          const type = walk(val, pascalCase(k));
          const ptr = val === null ? '*' : '';
          fields.push(`\t${pascalCase(k)} ${ptr}${type} \`json:"${k}"\``);
        }
        structs.push(`type ${sName} struct {\n${fields.join('\n')}\n}`);
        return sName;
      }
      return goType(v);
    }

    function goType(v) {
      if (v === null) return 'interface{}';
      if (typeof v === 'string') return 'string';
      if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float64';
      if (typeof v === 'boolean') return 'bool';
      return 'interface{}';
    }

    walk(val, name);
    return structs.reverse().join('\n\n');
  }

  // === Rust ===
  function toRust(val, name = 'Root') {
    const structs = [];

    function walk(v, sName) {
      if (Array.isArray(v)) {
        if (v.length > 0 && typeof v[0] === 'object' && v[0] !== null) {
          walk(v[0], sName + 'Item');
          return `Vec<${sName}Item>`;
        }
        if (v.length > 0) return `Vec<${rustType(v[0])}>`;
        return 'Vec<serde_json::Value>';
      }
      if (v && typeof v === 'object') {
        const fields = [];
        for (const [k, val] of Object.entries(v)) {
          const type = walk(val, pascalCase(k));
          const opt = val === null ? `Option<${type}>` : type;
          fields.push(`    pub ${snakeCase(k)}: ${val === null ? opt : type},`);
        }
        structs.push(`#[derive(Debug, Serialize, Deserialize)]\npub struct ${sName} {\n${fields.join('\n')}\n}`);
        return sName;
      }
      return rustType(v);
    }

    function rustType(v) {
      if (v === null) return 'serde_json::Value';
      if (typeof v === 'string') return 'String';
      if (typeof v === 'number') return Number.isInteger(v) ? 'i64' : 'f64';
      if (typeof v === 'boolean') return 'bool';
      return 'serde_json::Value';
    }

    walk(val, name);
    return 'use serde::{Serialize, Deserialize};\n\n' + structs.reverse().join('\n\n');
  }

  // === Java ===
  function toJava(val, name = 'Root') {
    const classes = [];

    function walk(v, cName) {
      if (Array.isArray(v)) {
        if (v.length > 0 && typeof v[0] === 'object' && v[0] !== null) {
          walk(v[0], cName + 'Item');
          return `List<${cName}Item>`;
        }
        if (v.length > 0) return `List<${javaType(v[0], true)}>`;
        return 'List<Object>';
      }
      if (v && typeof v === 'object') {
        const fields = [];
        for (const [k, val] of Object.entries(v)) {
          const type = walk(val, pascalCase(k));
          fields.push(`    private ${type} ${camelCase(k)};`);
        }
        classes.push(`public class ${cName} {\n${fields.join('\n')}\n}`);
        return cName;
      }
      return javaType(v, false);
    }

    function javaType(v, boxed) {
      if (v === null) return 'Object';
      if (typeof v === 'string') return 'String';
      if (typeof v === 'number') return Number.isInteger(v) ? (boxed ? 'Integer' : 'int') : (boxed ? 'Double' : 'double');
      if (typeof v === 'boolean') return boxed ? 'Boolean' : 'boolean';
      return 'Object';
    }

    walk(val, name);
    return 'import java.util.List;\n\n' + classes.reverse().join('\n\n');
  }

  // === Power Fx UDT ===
  function toPowerFx(val) {
    const body = buildFxUDTInline(val, 2);
    return `RootType :=\n    Type(\n${body}\n    );\n`;
  }

  function buildFxUDTInline(obj, indent) {
    const pad = '    '.repeat(indent);
    if (Array.isArray(obj)) {
      if (obj.length === 0) {
        return `${pad}[\n${pad}    {\n${pad}        Value: Text\n${pad}    }\n${pad}]`;
      } else if (typeof obj[0] === 'object' && obj[0] !== null) {
        const inner = buildFxRecordFields(obj[0], indent + 2);
        return `${pad}[\n${pad}    {\n${inner}\n${pad}    }\n${pad}]`;
      } else {
        return `${pad}[\n${pad}    {\n${pad}        Value: ${fxType(obj[0])}\n${pad}    }\n${pad}]`;
      }
    } else if (obj && typeof obj === 'object') {
      const inner = buildFxRecordFields(obj, indent + 1);
      return `${pad}{\n${inner}\n${pad}}`;
    }
    return `${pad}${fxType(obj)}`;
  }

  function buildFxRecordFields(obj, indent) {
    const pad = '    '.repeat(indent);
    const entries = Object.entries(obj);
    const lines = [];
    for (const [k, v] of entries) {
      const safe = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k) ? k : `'${k}'`;
      if (Array.isArray(v)) {
        if (v.length > 0 && typeof v[0] === 'object' && v[0] !== null) {
          const inner = buildFxRecordFields(v[0], indent + 2);
          lines.push(`${pad}${safe}: [\n${pad}    {\n${inner}\n${pad}    }\n${pad}]`);
        } else {
          const valType = v.length > 0 ? fxType(v[0]) : 'Text';
          lines.push(`${pad}${safe}: [{ Value: ${valType} }]`);
        }
      } else if (v && typeof v === 'object') {
        const inner = buildFxRecordFields(v, indent + 1);
        lines.push(`${pad}${safe}: {\n${inner}\n${pad}}`);
      } else {
        lines.push(`${pad}${safe}: ${fxType(v)}`);
      }
    }
    return lines.join(',\n');
  }

  function fxType(v) {
    if (v === null) return 'Text';
    if (typeof v === 'string') return 'Text';
    if (typeof v === 'number') return 'Number';
    if (typeof v === 'boolean') return 'Boolean';
    return 'Text';
  }

  // === SQL DDL ===
  function toSQL(val, name = 'Root') {
    const tableName = snakeCase(name);
    // Normalise input: if object, wrap in array; if array of primitives, skip
    let rows;
    if (Array.isArray(val)) {
      rows = val.filter(r => r && typeof r === 'object' && !Array.isArray(r));
      if (rows.length === 0) return `-- Cannot generate SQL: array does not contain objects`;
    } else if (val && typeof val === 'object') {
      rows = [val];
    } else {
      return `-- Cannot generate SQL from primitive value`;
    }

    // Collect all columns across all rows
    const colSet = new Map();
    for (const row of rows) {
      for (const [k, v] of Object.entries(row)) {
        if (!colSet.has(k)) colSet.set(k, inferSqlType(v));
        else {
          const existing = colSet.get(k);
          const newType = inferSqlType(v);
          if (existing !== newType && v !== null) colSet.set(k, mergeSqlTypes(existing, newType));
        }
      }
    }

    const cols = [...colSet.entries()];
    const lines = cols.map(([col, type]) => `  ${sqlIdent(col)} ${type}`);
    let ddl = `CREATE TABLE ${sqlIdent(tableName)} (\n${lines.join(',\n')}\n);\n`;

    // INSERT statements
    if (rows.length <= 200) {
      const colNames = cols.map(c => sqlIdent(c[0]));
      ddl += `\nINSERT INTO ${sqlIdent(tableName)} (${colNames.join(', ')})\nVALUES\n`;
      const valueRows = rows.map(row => {
        const vals = cols.map(([col]) => sqlLiteral(row[col]));
        return `  (${vals.join(', ')})`;
      });
      ddl += valueRows.join(',\n') + ';\n';
    } else {
      ddl += `\n-- ${rows.length} rows (INSERT statements omitted for large datasets)\n`;
    }

    return ddl;
  }

  function inferSqlType(v) {
    if (v === null || v === undefined) return 'TEXT';
    if (typeof v === 'boolean') return 'BOOLEAN';
    if (typeof v === 'number') return Number.isInteger(v) ? 'INTEGER' : 'REAL';
    if (typeof v === 'string') {
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return 'TIMESTAMP';
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'DATE';
      if (v.length > 255) return 'TEXT';
      return 'VARCHAR(255)';
    }
    if (Array.isArray(v) || typeof v === 'object') return 'JSONB';
    return 'TEXT';
  }

  function mergeSqlTypes(a, b) {
    if (a === b) return a;
    const rank = { BOOLEAN: 1, INTEGER: 2, REAL: 3, DATE: 4, TIMESTAMP: 5, 'VARCHAR(255)': 6, TEXT: 7, JSONB: 8 };
    return (rank[a] || 99) >= (rank[b] || 99) ? a : b;
  }

  function sqlIdent(name) {
    return /^[a-zA-Z_]\w*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
  }

  function sqlLiteral(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
    return `'${String(v).replace(/'/g, "''")}'`;
  }

  const generators = {
    typescript: { label: 'TypeScript', fn: toTypeScript, ext: 'ts' },
    python: { label: 'Python', fn: toPython, ext: 'py' },
    csharp: { label: 'C#', fn: toCSharp, ext: 'cs' },
    go: { label: 'Go', fn: toGo, ext: 'go' },
    rust: { label: 'Rust', fn: toRust, ext: 'rs' },
    java: { label: 'Java', fn: toJava, ext: 'java' },
    powerfx: { label: 'Power Fx', fn: toPowerFx, ext: 'fx' },
    sql: { label: 'SQL DDL', fn: toSQL, ext: 'sql' },
  };

  // Aliases for short tab IDs
  const aliases = { ts: 'typescript' };

  function generate(lang, val, name) {
    const key = aliases[lang] || lang;
    const gen = generators[key];
    if (!gen) return '';
    return gen.fn(val, name || 'Root');
  }

  function getLanguages() {
    return Object.entries(generators).map(([id, g]) => ({ id, label: g.label }));
  }

  return { generate, getLanguages, generators };
})();
