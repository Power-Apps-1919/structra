/**
 * Power Platform expression generation — Power Automate & Power Fx (Canvas Apps)
 */
window.App = window.App || {};
window.App.powerPlatform = (() => {
  const { exprRow } = window.App.dom;
  const { capitalize } = window.App.format;
  const { buildPAPath, tokenizePath, buildFxPathFull, getLastKey } = window.App.path;
  const { typeFlags } = window.App.typeHelpers;

  // =====================================================
  //  Power Automate expressions
  // =====================================================

  function generatePA(path, value) {
    const { isArr, isObj, isStr, isNum, isBool, isNull } = typeFlags(value);

    const paPath = buildPAPath(path);
    let html = exprRow('Access value', paPath);

    if (isArr) {
      html += exprRow('Count (length)', `length(${paPath})`);
      html += exprRow('First item', `first(${paPath})`);
      html += exprRow('Last item', `last(${paPath})`);
      html += exprRow('Get item [0]', `${paPath}[0]`);
      html += exprRow('Is empty?', `equals(length(${paPath}), 0)`);
      html += exprRow('Is not empty?', `greater(length(${paPath}), 0)`);
      html += exprRow('Apply to each', `${paPath}`);
      html += exprRow('Current item', `items('Apply_to_each')`);
      html += exprRow('Take first 5', `take(${paPath}, 5)`);
      html += exprRow('Skip first 5', `skip(${paPath}, 5)`);
      html += exprRow('Reverse', `reverse(${paPath})`);
      html += exprRow('Chunk (groups of 10)', `chunk(${paPath}, 10)`);
      html += exprRow('Union with another', `union(${paPath}, variables('otherArray'))`);
      html += exprRow('Intersection', `intersection(${paPath}, variables('otherArray'))`);
      html += exprRow('To JSON string', `string(${paPath})`);
      html += exprRow('Create array', `createArray(${paPath}[0], ${paPath}[1])`);
      if (value.length > 0 && typeof value[0] === 'object') {
        const keys = Object.keys(value[0]);
        if (keys[0]) {
          html += exprRow(`[0].${keys[0]}`, `${paPath}[0]?['${keys[0]}']`);
          html += exprRow(`Current .${keys[0]}`, `items('Apply_to_each')?['${keys[0]}']`);
          html += exprRow(`Sort asc`, `sort(${paPath}, '${keys[0]}')`);
          html += exprRow(`Sort desc`, `reverse(sort(${paPath}, '${keys[0]}'))`);
          html += exprRow(`Filter (action From)`, `${paPath}`);
          html += exprRow(`Filter (Where cond.)`, `not(equals(item()?['${keys[0]}'], null))`);
          html += exprRow(`Select (action From)`, `${paPath}`);
          html += exprRow(`Select (Map to)`, `item()?['${keys[0]}']`);
        }
        if (keys[1]) {
          html += exprRow(`[0].${keys[1]}`, `${paPath}[0]?['${keys[1]}']`);
          html += exprRow(`Current .${keys[1]}`, `items('Apply_to_each')?['${keys[1]}']`);
        }
      } else if (value.length > 0 && typeof value[0] === 'string') {
        html += exprRow('Item [0]', `${paPath}[0]`);
        html += exprRow('Contains value', `contains(${paPath}, 'searchValue')`);
        html += exprRow('Join all', `join(${paPath}, ',')`);
        html += exprRow('Join with newline', `join(${paPath}, decodeUriComponent('%0A'))`);
        html += exprRow('Join semicolon', `join(${paPath}, ';')`);
        html += exprRow('Sort alpha', `sort(${paPath})`);
      } else if (value.length > 0 && typeof value[0] === 'number') {
        html += exprRow('Item [0]', `${paPath}[0]`);
        html += exprRow('Min value', `min(${paPath})`);
        html += exprRow('Max value', `max(${paPath})`);
        html += exprRow('Sort numeric', `sort(${paPath})`);
      }
    } else if (isObj) {
      const keys = Object.keys(value);
      html += exprRow('To JSON string', `string(${paPath})`);
      html += exprRow('Add property', `addProperty(${paPath}, 'newKey', 'newValue')`);
      html += exprRow('Remove property', `removeProperty(${paPath}, '${keys[0] || 'key'}')`);
      html += exprRow('Set property', `setProperty(${paPath}, '${keys[0] || 'key'}', 'newValue')`);
      html += exprRow('Key count', `length(string(${paPath}))`);
      for (const k of keys.slice(0, 10)) {
        const v = value[k];
        if (Array.isArray(v)) {
          html += exprRow(`${k} (length)`, `length(${paPath}?['${k}'])`);
          html += exprRow(`${k}[0]`, `${paPath}?['${k}'][0]`);
          html += exprRow(`${k} first`, `first(${paPath}?['${k}'])`);
        } else if (v && typeof v === 'object') {
          html += exprRow(`${k} (object)`, `${paPath}?['${k}']`);
        } else if (typeof v === 'string') {
          html += exprRow(k, `${paPath}?['${k}']`);
        } else if (typeof v === 'number') {
          if (Number.isInteger(v)) html += exprRow(`${k} (int)`, `int(${paPath}?['${k}'])`);
          else html += exprRow(`${k} (float)`, `float(${paPath}?['${k}'])`);
        } else if (typeof v === 'boolean') {
          html += exprRow(`${k} (bool)`, `${paPath}?['${k}']`);
          html += exprRow(`${k} check`, `equals(${paPath}?['${k}'], true)`);
        } else if (v === null) {
          html += exprRow(`${k} (null)`, `${paPath}?['${k}']`);
          html += exprRow(`${k} coalesce`, `coalesce(${paPath}?['${k}'], 'default')`);
        } else {
          html += exprRow(k, `${paPath}?['${k}']`);
        }
      }
    } else if (isStr) {
      html += exprRow('String value', paPath);
      html += exprRow('To upper', `toUpper(${paPath})`);
      html += exprRow('To lower', `toLower(${paPath})`);
      html += exprRow('Length', `length(${paPath})`);
      html += exprRow('Trim', `trim(${paPath})`);
      html += exprRow('Contains', `contains(${paPath}, 'searchText')`);
      html += exprRow('StartsWith', `startsWith(${paPath}, 'prefix')`);
      html += exprRow('EndsWith', `endsWith(${paPath}, 'suffix')`);
      html += exprRow('Replace', `replace(${paPath}, 'oldText', 'newText')`);
      html += exprRow('Split', `split(${paPath}, ',')`);
      html += exprRow('Substring', `substring(${paPath}, 0, 10)`);
      html += exprRow('Slice', `slice(${paPath}, 0, 10)`);
      html += exprRow('IndexOf', `indexOf(${paPath}, 'search')`);
      html += exprRow('LastIndexOf', `lastIndexOf(${paPath}, 'search')`);
      html += exprRow('NthIndexOf', `nthIndexOf(${paPath}, 'search', 2)`);
      html += exprRow('Chunk (split every N)', `chunk(${paPath}, 50)`);
      html += exprRow('If empty', `if(empty(${paPath}), 'default', ${paPath})`);
      html += exprRow('Null coalesce', `coalesce(${paPath}, 'fallback')`);
      html += exprRow('Concat', `concat(${paPath}, ' ', 'suffix')`);
      html += exprRow('Base64 encode', `base64(${paPath})`);
      html += exprRow('Base64 decode', `base64ToString(${paPath})`);
      html += exprRow('URI encode', `encodeUriComponent(${paPath})`);
      html += exprRow('URI decode', `decodeUriComponent(${paPath})`);
      html += exprRow('Parse as JSON', `json(${paPath})`);
      html += exprRow('Data URI', `dataUri(${paPath})`);
      if (value && (value.match(/\d{4}-\d{2}-\d{2}/) || value.match(/\d{2}\/\d{2}\/\d{4}/))) {
        html += exprRow('Format date', `formatDateTime(${paPath}, 'dd/MM/yyyy')`);
        html += exprRow('Format datetime', `formatDateTime(${paPath}, 'yyyy-MM-ddTHH:mm:ss')`);
        html += exprRow('Add 1 day', `addDays(${paPath}, 1)`);
        html += exprRow('Add 1 hour', `addHours(${paPath}, 1)`);
        html += exprRow('Convert timezone', `convertTimeZone(${paPath}, 'UTC', 'AUS Eastern Standard Time')`);
        html += exprRow('Ticks', `ticks(${paPath})`);
        html += exprRow('Day of week', `dayOfWeek(${paPath})`);
        html += exprRow('Start of day', `startOfDay(${paPath})`);
        html += exprRow('Start of month', `startOfMonth(${paPath})`);
      }
      if (value && value.match(/^https?:\/\//i)) {
        html += exprRow('URI host', `uriHost(${paPath})`);
        html += exprRow('URI path', `uriPath(${paPath})`);
        html += exprRow('URI query', `uriQuery(${paPath})`);
        html += exprRow('URI port', `uriPort(${paPath})`);
        html += exprRow('URI scheme', `uriScheme(${paPath})`);
      }
      if (value && value.match(/^[0-9a-f]{8}-[0-9a-f]{4}-/i)) {
        html += exprRow('As GUID', `guid(${paPath})`);
      }
    } else if (isNum) {
      html += exprRow('Number value', paPath);
      html += exprRow('As integer', `int(${paPath})`);
      html += exprRow('As float', `float(${paPath})`);
      html += exprRow('As decimal', `decimal(string(${paPath}))`);
      html += exprRow('To string', `string(${paPath})`);
      html += exprRow('Add 1', `add(${paPath}, 1)`);
      html += exprRow('Subtract 1', `sub(${paPath}, 1)`);
      html += exprRow('Multiply', `mul(${paPath}, 2)`);
      html += exprRow('Divide', `div(${paPath}, 2)`);
      html += exprRow('Modulo', `mod(${paPath}, 2)`);
      html += exprRow('Greater than 0', `greater(${paPath}, 0)`);
      html += exprRow('Greater or equal', `greaterOrEquals(${paPath}, 0)`);
      html += exprRow('Less than', `less(${paPath}, 100)`);
      html += exprRow('Less or equal', `lessOrEquals(${paPath}, 100)`);
      html += exprRow('Equals 0', `equals(${paPath}, 0)`);
      html += exprRow('Format number', `formatNumber(${paPath}, 'N2')`);
      html += exprRow('Format currency', `formatNumber(${paPath}, 'C2')`);
      html += exprRow('Format percent', `formatNumber(div(${paPath}, 100), 'P2')`);
      html += exprRow('Random 1-N', `rand(1, add(${paPath}, 1))`);
      html += exprRow('Range from 0', `range(0, ${paPath})`);
      html += exprRow('Is integer?', `isInt(string(${paPath}))`);
      html += exprRow('Is float?', `isFloat(string(${paPath}))`);
      html += exprRow('Bool (0=false)', `bool(${paPath})`);
    } else if (isBool) {
      html += exprRow('Boolean value', paPath);
      html += exprRow('Negate', `not(${paPath})`);
      html += exprRow('Is true?', `equals(${paPath}, true)`);
      html += exprRow('Is false?', `equals(${paPath}, false)`);
      html += exprRow('If/else', `if(equals(${paPath}, true), 'Yes', 'No')`);
      html += exprRow('AND logic', `and(${paPath}, equals(1, 1))`);
      html += exprRow('OR logic', `or(${paPath}, equals(1, 1))`);
      html += exprRow('To string', `string(${paPath})`);
      html += exprRow('To int (1/0)', `if(equals(${paPath}, true), 1, 0)`);
    } else if (isNull) {
      html += exprRow('Is null?', `equals(${paPath}, null)`);
      html += exprRow('Is not null?', `not(equals(${paPath}, null))`);
      html += exprRow('Coalesce string', `coalesce(${paPath}, 'fallback')`);
      html += exprRow('Coalesce number', `coalesce(${paPath}, 0)`);
      html += exprRow('If null', `if(equals(${paPath}, null), 'N/A', ${paPath})`);
      html += exprRow('Empty check', `empty(${paPath})`);
    }

    return html;
  }

  // =====================================================
  //  Power Fx (Canvas App) expressions
  // =====================================================

  function generateFx(path, value) {
    const { isArr, isObj, isStr, isNum, isBool, isNull } = typeFlags(value);

    const fxPath = buildFxPathFull(tokenizePath(path));
    let html = exprRow('Access (ParseJSON)', fxPath);

    if (isArr) {
      html += exprRow('As Table', `ForAll(${fxPath}, ThisRecord)`);
      html += exprRow('Count', `CountRows(ForAll(${fxPath}, ThisRecord))`);
      html += exprRow('First item', `Index(${fxPath}, 1)`);
      html += exprRow('Last item', `Last(ForAll(${fxPath}, ThisRecord))`);
      html += exprRow('FirstN (5)', `FirstN(ForAll(${fxPath}, ThisRecord), 5)`);
      html += exprRow('LastN (5)', `LastN(ForAll(${fxPath}, ThisRecord), 5)`);
      html += exprRow('IsEmpty', `IsEmpty(ForAll(${fxPath}, ThisRecord))`);
      html += exprRow('Shuffle', `Shuffle(ForAll(${fxPath}, ThisRecord))`);
      html += exprRow('Gallery.Items', `ForAll(${fxPath}, ThisRecord)`);
      html += exprRow('ClearCollect', `ClearCollect(colData, ForAll(${fxPath}, ThisRecord))`);
      html += exprRow('JSON export', `JSON(ForAll(${fxPath}, ThisRecord))`);
      if (value.length > 0 && typeof value[0] === 'object') {
        const keys = Object.keys(value[0]);
        if (keys[0]) {
          html += exprRow(`[1].${keys[0]} Text`, `Text(Index(${fxPath}, 1).${keys[0]})`);
          html += exprRow(`[1].${keys[0]} Number`, `Value(Index(${fxPath}, 1).${keys[0]})`);
          html += exprRow(`Gallery column`, `Text(ThisItem.${keys[0]})`);
          html += exprRow(`Filter (not blank)`, `Filter(ForAll(${fxPath}, {val: Text(ThisRecord.${keys[0]})}), !IsBlank(val))`);
          html += exprRow(`Filter (equals)`, `Filter(ForAll(${fxPath}, {${keys[0]}: Text(ThisRecord.${keys[0]})}), ${keys[0]} = "value")`);
          html += exprRow(`Sort ascending`, `SortByColumns(ForAll(${fxPath}, {${keys[0]}: Text(ThisRecord.${keys[0]})}), "${keys[0]}", SortOrder.Ascending)`);
          html += exprRow(`Sort descending`, `SortByColumns(ForAll(${fxPath}, {${keys[0]}: Text(ThisRecord.${keys[0]})}), "${keys[0]}", SortOrder.Descending)`);
          html += exprRow(`LookUp`, `LookUp(ForAll(${fxPath}, {${keys[0]}: Text(ThisRecord.${keys[0]})}), ${keys[0]} = "value")`);
          html += exprRow(`CountIf`, `CountIf(ForAll(${fxPath}, {${keys[0]}: Text(ThisRecord.${keys[0]})}), !IsBlank(${keys[0]}))`);
          html += exprRow(`Distinct`, `Distinct(ForAll(${fxPath}, {${keys[0]}: Text(ThisRecord.${keys[0]})}), ${keys[0]})`);
          html += exprRow(`Search`, `Search(ForAll(${fxPath}, {${keys[0]}: Text(ThisRecord.${keys[0]})}), txtSearch.Text, "${keys[0]}")`);
          html += exprRow(`AddColumns`, `AddColumns(ForAll(${fxPath}, {${keys[0]}: Text(ThisRecord.${keys[0]})}), "Extra", "value")`);
        }
        if (keys[1]) {
          html += exprRow(`[1].${keys[1]} Text`, `Text(Index(${fxPath}, 1).${keys[1]})`);
          html += exprRow(`Gallery .${keys[1]}`, `Text(ThisItem.${keys[1]})`);
        }
        if (keys.length > 0) {
          const cols = keys.slice(0, 5).map(k => `${k}: Text(ThisRecord.${k})`).join(', ');
          html += exprRow(`Typed Table`, `ForAll(${fxPath}, {${cols}})`);
          if (keys.length >= 2) {
            html += exprRow(`GroupBy`, `GroupBy(ForAll(${fxPath}, {${keys[0]}: Text(ThisRecord.${keys[0]}), ${keys[1]}: Text(ThisRecord.${keys[1]})}), "${keys[0]}", "Items")`);
          }
        }
      } else if (value.length > 0 && typeof value[0] === 'string') {
        html += exprRow('First (Text)', `Text(Index(${fxPath}, 1))`);
        html += exprRow('Concat all', `Concat(ForAll(${fxPath}, {Value: Text(ThisRecord)}), Value, ", ")`);
        html += exprRow('Concat newline', `Concat(ForAll(${fxPath}, {Value: Text(ThisRecord)}), Value, Char(10))`);
        html += exprRow('Gallery display', `Text(ThisItem.Value)`);
        html += exprRow('Filter contains', `Filter(ForAll(${fxPath}, {Value: Text(ThisRecord)}), txtSearch.Text in Value)`);
        html += exprRow('Distinct values', `Distinct(ForAll(${fxPath}, {Value: Text(ThisRecord)}), Value)`);
      } else if (value.length > 0 && typeof value[0] === 'number') {
        html += exprRow('First (Number)', `Value(Index(${fxPath}, 1))`);
        html += exprRow('Sum all', `Sum(ForAll(${fxPath}, {Value: Value(ThisRecord)}), Value)`);
        html += exprRow('Average', `Average(ForAll(${fxPath}, {Value: Value(ThisRecord)}), Value)`);
        html += exprRow('Max', `Max(ForAll(${fxPath}, {Value: Value(ThisRecord)}), Value)`);
        html += exprRow('Min', `Min(ForAll(${fxPath}, {Value: Value(ThisRecord)}), Value)`);
        html += exprRow('StdevP', `StdevP(ForAll(${fxPath}, {Value: Value(ThisRecord)}), Value)`);
        html += exprRow('VarP', `VarP(ForAll(${fxPath}, {Value: Value(ThisRecord)}), Value)`);
      }
    } else if (isObj) {
      html += exprRow('Store in variable', `Set(var${capitalize(getLastKey(path))}, ${fxPath})`);
      html += exprRow('UpdateContext', `UpdateContext({loc${capitalize(getLastKey(path))}: ${fxPath}})`);
      html += exprRow('To JSON string', `JSON(${fxPath})`);
      html += exprRow('ColumnNames', `ColumnNames(${fxPath})`);
      html += exprRow('With (scope)', `With({rec: ${fxPath}}, Text(rec.${Object.keys(value)[0] || 'key'}))`);
      for (const k of Object.keys(value).slice(0, 10)) {
        const v = value[k];
        if (Array.isArray(v)) {
          html += exprRow(`${k} (Table)`, `ForAll(${fxPath}.${k}, ThisRecord)`);
          html += exprRow(`${k} Count`, `CountRows(ForAll(${fxPath}.${k}, ThisRecord))`);
          html += exprRow(`${k} First`, `Index(${fxPath}.${k}, 1)`);
        } else if (v && typeof v === 'object') {
          html += exprRow(`${k} (Record)`, `${fxPath}.${k}`);
        } else if (typeof v === 'string') {
          html += exprRow(`${k} (Text)`, `Text(${fxPath}.${k})`);
        } else if (typeof v === 'number') {
          html += exprRow(`${k} (Number)`, `Value(${fxPath}.${k})`);
        } else if (typeof v === 'boolean') {
          html += exprRow(`${k} (Boolean)`, `Boolean(${fxPath}.${k})`);
        } else if (v === null) {
          html += exprRow(`${k} (null safe)`, `If(IsBlank(${fxPath}.${k}), "N/A", Text(${fxPath}.${k}))`);
        } else {
          html += exprRow(k, `Text(${fxPath}.${k})`);
        }
      }
    } else if (isStr) {
      html += exprRow('As Text', `Text(${fxPath})`);
      html += exprRow('Upper', `Upper(Text(${fxPath}))`);
      html += exprRow('Lower', `Lower(Text(${fxPath}))`);
      html += exprRow('Proper', `Proper(Text(${fxPath}))`);
      html += exprRow('Length', `Len(Text(${fxPath}))`);
      html += exprRow('Trim', `Trim(Text(${fxPath}))`);
      html += exprRow('TrimEnds', `TrimEnds(Text(${fxPath}))`);
      html += exprRow('Left 10 chars', `Left(Text(${fxPath}), 10)`);
      html += exprRow('Right 10 chars', `Right(Text(${fxPath}), 10)`);
      html += exprRow('Mid (5, 10)', `Mid(Text(${fxPath}), 5, 10)`);
      html += exprRow('Find position', `Find("search", Text(${fxPath}))`);
      html += exprRow('Contains', `"searchText" in Text(${fxPath})`);
      html += exprRow('StartsWith', `StartsWith(Text(${fxPath}), "prefix")`);
      html += exprRow('EndsWith', `EndsWith(Text(${fxPath}), "suffix")`);
      html += exprRow('IsBlank check', `IsBlank(Text(${fxPath}))`);
      html += exprRow('If blank', `If(IsBlank(Text(${fxPath})), "default", Text(${fxPath}))`);
      html += exprRow('Coalesce', `Coalesce(Text(${fxPath}), "fallback")`);
      html += exprRow('Substitute', `Substitute(Text(${fxPath}), "old", "new")`);
      html += exprRow('Replace (pos)', `Replace(Text(${fxPath}), 1, 3, "new")`);
      html += exprRow('Split to table', `Split(Text(${fxPath}), ",")`);
      html += exprRow('IsMatch (email)', `IsMatch(Text(${fxPath}), Match.Email)`);
      html += exprRow('Match (regex)', `Match(Text(${fxPath}), "\\\\d+")`);
      html += exprRow('MatchAll', `MatchAll(Text(${fxPath}), "\\\\d+")`);
      html += exprRow('IsNumeric', `IsNumeric(Text(${fxPath}))`);
      html += exprRow('Char(10) newline', `Substitute(Text(${fxPath}), Char(10), " ")`);
      html += exprRow('EncodeUrl', `EncodeUrl(Text(${fxPath}))`);
      html += exprRow('PlainText (HTML)', `PlainText(Text(${fxPath}))`);
      html += exprRow('HashTags', `HashTags(Text(${fxPath}))`);
      html += exprRow('Copy to clipboard', `Copy(Text(${fxPath}))`);
      html += exprRow('Label.Text', `Text(${fxPath})`);
      if (value && (value.match(/\d{4}-\d{2}-\d{2}/) || value.match(/\d{2}\/\d{2}\/\d{4}/))) {
        html += exprRow('DateTimeValue', `DateTimeValue(Text(${fxPath}))`);
        html += exprRow('DateValue', `DateValue(Text(${fxPath}))`);
        html += exprRow('Format date', `Text(DateTimeValue(Text(${fxPath})), "dd/mm/yyyy")`);
        html += exprRow('DateAdd +1 day', `DateAdd(DateTimeValue(Text(${fxPath})), 1, TimeUnit.Days)`);
        html += exprRow('DateDiff', `DateDiff(DateTimeValue(Text(${fxPath})), Now(), TimeUnit.Days)`);
        html += exprRow('Year', `Year(DateTimeValue(Text(${fxPath})))`);
        html += exprRow('Month', `Month(DateTimeValue(Text(${fxPath})))`);
        html += exprRow('Day', `Day(DateTimeValue(Text(${fxPath})))`);
        html += exprRow('IsToday', `IsToday(DateTimeValue(Text(${fxPath})))`);
      }
      if (value && value.match(/^https?:\/\//i)) {
        html += exprRow('Launch URL', `Launch(Text(${fxPath}))`);
        html += exprRow('Download', `Download(Text(${fxPath}))`);
      }
      if (value && value.match(/^[0-9a-f]{8}-[0-9a-f]{4}-/i)) {
        html += exprRow('As GUID', `GUID(Text(${fxPath}))`);
      }
    } else if (isNum) {
      html += exprRow('As Number', `Value(${fxPath})`);
      html += exprRow('As Text', `Text(Value(${fxPath}))`);
      html += exprRow('Formatted #,##0', `Text(Value(${fxPath}), "#,##0.00")`);
      html += exprRow('Currency', `Text(Value(${fxPath}), "$#,##0.00")`);
      html += exprRow('Percent', `Text(Value(${fxPath}) / 100, "0.00%")`);
      html += exprRow('Round', `Round(Value(${fxPath}), 2)`);
      html += exprRow('RoundUp', `RoundUp(Value(${fxPath}), 0)`);
      html += exprRow('RoundDown', `RoundDown(Value(${fxPath}), 0)`);
      html += exprRow('Trunc', `Trunc(Value(${fxPath}))`);
      html += exprRow('Int', `Int(Value(${fxPath}))`);
      html += exprRow('Abs', `Abs(Value(${fxPath}))`);
      html += exprRow('Sign', `Sign(Value(${fxPath}))`);
      html += exprRow('Sqrt', `Sqrt(Value(${fxPath}))`);
      html += exprRow('Power ^2', `Power(Value(${fxPath}), 2)`);
      html += exprRow('Mod', `Mod(Value(${fxPath}), 2)`);
      html += exprRow('Ln (natural log)', `Ln(Value(${fxPath}))`);
      html += exprRow('Log (base 10)', `Log(Value(${fxPath}), 10)`);
      html += exprRow('Exp', `Exp(Value(${fxPath}))`);
      html += exprRow('Greater than 0', `Value(${fxPath}) > 0`);
      html += exprRow('Less or equal', `Value(${fxPath}) <= 100`);
      html += exprRow('Equals 0', `Value(${fxPath}) = 0`);
      html += exprRow('Between range', `And(Value(${fxPath}) >= 0, Value(${fxPath}) <= 100)`);
      html += exprRow('Rand (0 to N)', `RandBetween(0, Value(${fxPath}))`);
      html += exprRow('Sequence', `Sequence(Value(${fxPath}))`);
      html += exprRow('Label.Text', `Text(Value(${fxPath}), "#,##0")`);
    } else if (isBool) {
      html += exprRow('As Boolean', `Boolean(${fxPath})`);
      html += exprRow('Negate', `!Boolean(${fxPath})`);
      html += exprRow('If true/false', `If(Boolean(${fxPath}), "Yes", "No")`);
      html += exprRow('AND', `And(Boolean(${fxPath}), true)`);
      html += exprRow('OR', `Or(Boolean(${fxPath}), false)`);
      html += exprRow('To number (1/0)', `If(Boolean(${fxPath}), 1, 0)`);
      html += exprRow('Visible prop', `Boolean(${fxPath})`);
      html += exprRow('Toggle.Value', `Boolean(${fxPath})`);
      html += exprRow('Switch pattern', `Switch(Boolean(${fxPath}), true, "Active", false, "Inactive")`);
    } else if (isNull) {
      html += exprRow('IsBlank', `IsBlank(${fxPath})`);
      html += exprRow('Coalesce Text', `Coalesce(Text(${fxPath}), "N/A")`);
      html += exprRow('Coalesce Num', `Coalesce(Value(${fxPath}), 0)`);
      html += exprRow('If blank', `If(IsBlank(${fxPath}), "fallback", Text(${fxPath}))`);
      html += exprRow('IfError', `IfError(Text(${fxPath}), "error fallback")`);
    }

    return html;
  }

  return { generatePA, generateFx };
})();

// Backward-compatible aliases
window.App.expressionsPA = { generate: window.App.powerPlatform.generatePA };
window.App.expressionsFx = { generate: window.App.powerPlatform.generateFx };
