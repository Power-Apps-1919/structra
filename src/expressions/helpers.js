/**
 * Power Platform Helpers section (patterns, date/time, workflow, data manipulation)
 */
window.App = window.App || {};
window.App.helpers = (() => {
  const { $, esc, toast } = window.App.dom;
  const { buildPAPath, buildFxPathFull, tokenizePath, resolvePath } = window.App.path;
  const { findAllArrays } = window.App.traverse;

  function detectConnectorShape(obj) {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const keys = Object.keys(obj);
      if (keys.includes('value') && Array.isArray(obj.value)) return 'OData / SharePoint / Dataverse list response (body.value[])';
      if (keys.includes('body') && obj.body && typeof obj.body === 'object') return 'HTTP action response with body wrapper';
      if (keys.includes('d') && obj.d && typeof obj.d === 'object') return 'Legacy OData v2 response (d.results[])';
      if (keys.includes('results') && Array.isArray(obj.results)) return 'Search / results-style response';
      if (keys.includes('@odata.context')) return 'OData v4 response';
    }
    if (Array.isArray(obj)) return 'Direct array response (no wrapper)';
    return 'Custom/unknown JSON shape';
  }

  function render(jsonData) {
    const arrays = findAllArrays(jsonData);
    let html = '';

    // Apply to Each detector
    if (arrays.length > 0) {
      html += `<div style="font-size:9px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">&#128260; Apply to Each (Power Automate)</div>`;
      for (const a of arrays) {
        const paExpr = buildPAPath(a.path);
        html += `<div class="expr-row"><span class="elabel">${esc(a.path)}</span><div class="ecode">${paExpr}</div></div>`;
        const resolvedArr = resolvePath(jsonData, a.path === '(root)' ? '' : a.path);
        if (resolvedArr && resolvedArr.length > 0 && typeof resolvedArr[0] === 'object') {
          const childKeys = Object.keys(resolvedArr[0]).slice(0, 3);
          for (const ck of childKeys) {
            html += `<div class="expr-row"><span class="elabel" style="padding-left:12px">.${ck}</span><div class="ecode">items('Apply_to_each')?['${ck}']</div></div>`;
          }
        }
      }
      html += `<div style="margin:10px 0;border-top:1px solid var(--border)"></div>`;
    }

    // Compose / Initialize Variable
    html += `<div style="font-size:9px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">&#9997; Compose / Initialize Variable</div>`;
    html += `<div class="expr-row"><span class="elabel">Compose (full output)</span><div class="ecode">body('Parse_JSON')</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Init String var</span><div class="ecode">body('Parse_JSON')?['keyName']</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Init Array var</span><div class="ecode">body('Parse_JSON')?['arrayName']</div></div>`;
    html += `<div class="expr-row"><span class="elabel">JSON string</span><div class="ecode">string(body('Parse_JSON'))</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Outputs ref</span><div class="ecode">outputs('Compose')</div></div>`;

    // Gallery Items expression (Canvas App)
    if (arrays.length > 0) {
      html += `<div style="margin:10px 0;border-top:1px solid var(--border)"></div>`;
      html += `<div style="font-size:9px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">&#127912; Gallery / DataTable Items (Canvas App)</div>`;
      for (const a of arrays) {
        const fxPath = buildFxPathFull(tokenizePath(a.path === '(root)' ? '' : a.path));
        html += `<div class="expr-row"><span class="elabel">${esc(a.path)}</span><div class="ecode">ForAll(${fxPath}, ThisRecord)</div></div>`;
        const resolvedArr = resolvePath(jsonData, a.path === '(root)' ? '' : a.path);
        if (resolvedArr && resolvedArr.length > 0 && typeof resolvedArr[0] === 'object') {
          const childKeys = Object.keys(resolvedArr[0]).slice(0, 4);
          if (childKeys.length > 0) {
            const cols = childKeys.map(k => `${k}: Text(ThisRecord.${k})`).join(', ');
            html += `<div class="expr-row"><span class="elabel" style="padding-left:12px">Typed</span><div class="ecode">ForAll(${fxPath}, {${cols}})</div></div>`;
          }
        }
      }
    }

    // Common Patterns
    html += `<div style="margin:10px 0;border-top:1px solid var(--border)"></div>`;
    html += `<div style="font-size:9px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">&#128736; Common Patterns</div>`;
    html += `<div class="expr-row"><span class="elabel">PA: Condition (is null)</span><div class="ecode">equals(body('Parse_JSON')?['key'], null)</div></div>`;
    html += `<div class="expr-row"><span class="elabel">PA: Condition (not empty)</span><div class="ecode">greater(length(body('Parse_JSON')?['arr']), 0)</div></div>`;
    html += `<div class="expr-row"><span class="elabel">PA: Empty string check</span><div class="ecode">empty(body('Parse_JSON')?['key'])</div></div>`;
    html += `<div class="expr-row"><span class="elabel">PA: Ternary if</span><div class="ecode">if(equals(body('Parse_JSON')?['status'], 'active'), 'Yes', 'No')</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Fx: Set from JSON</span><div class="ecode">Set(varData, ParseJSON(jsonText))</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Fx: ClearCollect</span><div class="ecode">ClearCollect(colData, ForAll(ParseJSON(jsonText), ThisRecord))</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Fx: Notify on load</span><div class="ecode">If(IsEmpty(ForAll(ParseJSON(jsonText), ThisRecord)), Notify("No data found", NotificationType.Warning))</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Fx: Navigate with context</span><div class="ecode">Navigate(scrDetail, ScreenTransition.None, {selectedItem: ThisItem})</div></div>`;

    // Date/Time Patterns
    html += `<div style="margin:10px 0;border-top:1px solid var(--border)"></div>`;
    html += `<div style="font-size:9px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">&#128197; Date/Time Patterns</div>`;
    html += `<div class="expr-row"><span class="elabel">PA: Current UTC</span><div class="ecode">utcNow()</div></div>`;
    html += `<div class="expr-row"><span class="elabel">PA: Format date</span><div class="ecode">formatDateTime(utcNow(), 'yyyy-MM-dd')</div></div>`;
    html += `<div class="expr-row"><span class="elabel">PA: Format time</span><div class="ecode">formatDateTime(utcNow(), 'HH:mm:ss')</div></div>`;
    html += `<div class="expr-row"><span class="elabel">PA: Format full</span><div class="ecode">formatDateTime(utcNow(), 'yyyy-MM-ddTHH:mm:ssZ')</div></div>`;
    html += `<div class="expr-row"><span class="elabel">PA: Add days</span><div class="ecode">addDays(utcNow(), 7)</div></div>`;
    html += `<div class="expr-row"><span class="elabel">PA: Add hours</span><div class="ecode">addHours(utcNow(), 2)</div></div>`;
    html += `<div class="expr-row"><span class="elabel">PA: Add minutes</span><div class="ecode">addMinutes(utcNow(), 30)</div></div>`;
    html += `<div class="expr-row"><span class="elabel">PA: Convert timezone</span><div class="ecode">convertTimeZone(utcNow(), 'UTC', 'Eastern Standard Time')</div></div>`;
    html += `<div class="expr-row"><span class="elabel">PA: Start of day</span><div class="ecode">startOfDay(utcNow())</div></div>`;
    html += `<div class="expr-row"><span class="elabel">PA: Start of month</span><div class="ecode">startOfMonth(utcNow())</div></div>`;
    html += `<div class="expr-row"><span class="elabel">PA: Day of week</span><div class="ecode">dayOfWeek(utcNow())</div></div>`;
    html += `<div class="expr-row"><span class="elabel">PA: Ticks (compare)</span><div class="ecode">ticks(utcNow())</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Fx: Now()</span><div class="ecode">Now()</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Fx: Today()</span><div class="ecode">Today()</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Fx: Format date</span><div class="ecode">Text(Now(), "yyyy-mm-dd hh:mm:ss")</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Fx: DateAdd days</span><div class="ecode">DateAdd(Now(), 7, TimeUnit.Days)</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Fx: DateDiff</span><div class="ecode">DateDiff(Today(), DateValue("2025-12-31"), TimeUnit.Days)</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Fx: IsToday</span><div class="ecode">IsToday(DateTimeValue("2025-01-01"))</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Fx: Calendar.MonthsLong</span><div class="ecode">Calendar.MonthsLong()</div></div>`;

    // Workflow / Trigger Functions
    html += `<div style="margin:10px 0;border-top:1px solid var(--border)"></div>`;
    html += `<div style="font-size:9px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">&#9889; Workflow / Trigger Functions (PA)</div>`;
    html += `<div class="expr-row"><span class="elabel">Trigger body</span><div class="ecode">triggerBody()</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Trigger outputs</span><div class="ecode">triggerOutputs()</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Trigger headers</span><div class="ecode">triggerOutputs()['headers']</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Action output</span><div class="ecode">outputs('Action_Name')</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Action body</span><div class="ecode">body('Action_Name')</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Action status</span><div class="ecode">result('Scope_Name')?[0]?['status']</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Variables</span><div class="ecode">variables('varName')</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Workflow run ID</span><div class="ecode">workflow().run.name</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Workflow name</span><div class="ecode">workflow().tags.flowDisplayName</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Parameters</span><div class="ecode">parameters('paramName')</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Null coalesce</span><div class="ecode">coalesce(triggerBody()?['optionalKey'], 'default')</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Error message</span><div class="ecode">result('Scope_Name')?[0]?['error']?['message']</div></div>`;

    // Data Manipulation (PA)
    html += `<div style="margin:10px 0;border-top:1px solid var(--border)"></div>`;
    html += `<div style="font-size:9px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">&#128295; Data Manipulation (PA)</div>`;
    html += `<div class="expr-row"><span class="elabel">To JSON string</span><div class="ecode">string(body('Parse_JSON'))</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Parse JSON string</span><div class="ecode">json(variables('jsonString'))</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Create object</span><div class="ecode">json(concat('{"key":"', variables('val'), '"}'))</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Set property</span><div class="ecode">setProperty(body('Parse_JSON'), 'newKey', 'newValue')</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Add property</span><div class="ecode">addProperty(body('Parse_JSON'), 'extraKey', 'extraValue')</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Remove property</span><div class="ecode">removeProperty(body('Parse_JSON'), 'unwantedKey')</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Chain set props</span><div class="ecode">setProperty(setProperty(body('Parse_JSON'), 'a', 1), 'b', 2)</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Union arrays</span><div class="ecode">union(body('Parse_JSON')?['arr1'], body('Parse_JSON')?['arr2'])</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Intersection</span><div class="ecode">intersection(body('Parse_JSON')?['arr1'], body('Parse_JSON')?['arr2'])</div></div>`;
    html += `<div class="expr-row"><span class="elabel">XML from JSON</span><div class="ecode">xml(json(concat('{"root":', string(body('Parse_JSON')), '}')))</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Base64 encode</span><div class="ecode">base64(string(body('Parse_JSON')))</div></div>`;
    html += `<div class="expr-row"><span class="elabel">Base64 decode</span><div class="ecode">base64ToString(body('Parse_JSON')?['encoded'])</div></div>`;

    // Connector hint
    html += `<div style="margin:10px 0;border-top:1px solid var(--border)"></div>`;
    html += `<div style="font-size:9px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">&#128268; Likely Connector Shape</div>`;
    const shape = detectConnectorShape(jsonData);
    html += `<div style="font-size:10px;color:var(--text-sec);padding:4px 0">${shape}</div>`;

    $('helpersBody').innerHTML = html;
    // Delegation: single click listener (set once, avoids re-binding per render)
    if (!$('helpersBody')._delegated) {
      $('helpersBody')._delegated = true;
      $('helpersBody').addEventListener('click', e => {
        const el = e.target.closest('.ecode');
        if (el) { navigator.clipboard.writeText(el.textContent); toast('Copied!'); }
      });
    }
  }

  return { render, detectConnectorShape };
})();
