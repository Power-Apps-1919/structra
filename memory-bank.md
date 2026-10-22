# Structra V1 Memory Bank

Reference notes on the V1 codebase (JSON Analyzer), written to support building V2.
Source of truth is the code. Re-verify file and line references before relying on them.

## 1. Snapshot

| Item | Value |
|---|---|
| Name | Structra (internal/legacy names: "JSON Path Explorer", "jpe", folder was `JsonAnalyzerExtension`) |
| Location | `C:\Users\228295\Personal Github Repos\structra-v1` |
| Remote | `https://github.com/Power-Apps-1919/structra.git` (live site: `https://power-apps-1919.github.io/structra/`) |
| Git HEAD when documented | `781427e` "fix: enhance JSON worker initialization and add logging for fallback scenarios" (25 commits, first 2026-06-18) |
| Stack | Plain HTML + CSS + vanilla JS. No build step, no framework, no bundler, no backend |
| Size | about 12k lines of JS and CSS across 53 source files, plus `index.html` (463 lines) and `src/css/styles.css` (862 lines) |
| Run | Open `index.html`, or `npx serve .`. Needs internet for Lucide icons and lazy CDN libs |
| Related | V2 lives in `C:\Users\228295\Personal Github Repos\structra-v2`. Workspace file: `structra-v2\Structra Development.code-workspace` |

Purpose: load JSON (file, paste, CSV, URL/API, clipboard), explore it in several views, filter and search it, transform it, generate code and schemas, and produce Power Automate and Power Fx expressions for any selected path.

## 2. Folder layout

```
index.html                 all static markup (overlays, toolbar, panels, modals); script loader
src/app.js                 orchestrator, app state, view switching, path evaluation, wiring
src/css/styles.css         all styling, CSS variables, light and dark theme
src/workers/json-parser.js Web Worker: JSON.parse off the main thread
src/utils/                 pure helpers and state stores (see section 5)
src/expressions/           Power Automate, Power Fx, helpers panel, Parse JSON schema generator
src/ui/                    feature modules, one file per feature (see section 6)
Tests/                     JSON fixtures only, no test runner (see section 9)
test-results/screenshots/  Playwright screenshots (gitignored)
icons/icon.svg             brand icon
```

## 3. Architecture

### 3.1 Module pattern
- Every file attaches itself to one global namespace: `window.App = window.App || {}; window.App.<name> = (() => { ... return {api}; })();`
- Dependencies are read from `window.App` at module load time, for example `const { $, esc } = window.App.dom;`. So script order matters.
- No ES modules, no imports, no bundler.

### 3.2 Script loading
- `index.html` ends with an inline script that builds a list of 49 script paths and injects each with `document.write('<script src="path?v='+Date.now()+'">')`. Order is a hand-maintained dependency order, ending with `src/app.js`.
- CSS and JS are cache-busted on every load with `Date.now()`. That defeats browser caching entirely.
- Lucide icons come from `https://unpkg.com/lucide@latest` (unpinned) and `lucide.createIcons()` runs once at load.

### 3.3 State
All app state is closure variables inside `src/app.js`:
`jsonData`, `rawJsonText`, `fileName`, `pathHistory`, `historyIndex`, `bookmarks`, `currentView` ('json' | 'table' | 'schema' | 'graph'), `allPaths`, `focusedLineIdx`.
Shared outward through:
- `window.App._jsonDataRef` (the live data object, read by lazy tree chunk rendering)
- `window.App._allPaths` (autocomplete index)
- `window.App.appActions` (switchView, undo, redo, enterEditor, navigateLines)
- Getter closures passed into modules (`toolbarActions.init(() => state)`, `universalFilter.init(() => jsonData)`).
- DOM `CustomEvent`s on `document`: `tab-switch`, `tab-renamed`, `tab-new`, `inline-edit`, `snippet-load`, `editor-enter`.

### 3.4 Main data flow
1. Input (`input-handler.js`) produces text, then `parseJsonAsync` in `app.js` sends it to the worker (strings over 1 MB are sent as a transferable `ArrayBuffer`). If the worker fails, it falls back to sync `JSON.parse`.
2. `onJsonLoaded(data, text, name)` then `startExplorer()`.
3. `startExplorer` is staged with cooperative yielding (`scheduler.yield()` or `setTimeout(0)`):
   - Critical path: collect all paths, build autocomplete index, render tree view.
   - Then: push initial undo snapshot, sync multi-tab, compute stats, helpers, Parse JSON schema, save to Recent, detect duplicate keys, auto-open the Universal Filter bar.
4. Clicking a node calls `onPathSelect(path)`, which calls `evaluatePath(path)`. That resolves the value, updates the breadcrumb and history, fills the "Path Result" panel, and generates the Power Automate and Power Fx expressions.
5. Mutating actions (sort keys, flatten, search and replace, transform, edit) replace `jsonData`, call `rerender()`, and push an undo snapshot.

### 3.5 Path model
- Paths are strings: `a.b[0].c`, `["key with dots"]`, and `[*]` wildcard. `path.js` has `tokenizePath` and `resolvePath` (wildcard flattens results), `buildPAPath` (`body('Parse_JSON')?['a'][0]`), `buildFxPathFull` (`ParseJSON(jsonText).a`, arrays use `Index(x, n+1)`), `setNestedValue`.
- The filter layer converts JSON Pointers (`/0/name`) from jsonpath-plus into this path format (`[0].name`).

## 4. Performance design (the part V2 should learn from)

Target: 150k to 200k record arrays stay responsive. Fixtures: `Tests/perf_100k.json` (39 MB), `Tests/perf_150k_complex.json` (92 MB).

| Technique | Where | Notes |
|---|---|---|
| Parse in Web Worker | `workers/json-parser.js`, `app.js` | Result comes back by structured clone, which still costs time and memory on the main thread |
| Transferable ArrayBuffer for text over 1 MB | `app.js parseJsonAsync` | Avoids cloning the string |
| Chunked lazy tree | `ui/json-view.js` | `CHUNK_SIZE=100` items. A "sentinel" line per big array; an IntersectionObserver (`rootMargin 400px`) loads the next chunk |
| DOM recycling | `json-view.js` | A second IntersectionObserver (`OFFSCREEN_MARGIN=3000px`) empties offscreen chunks and pins their height. They re-render from data when scrolled back. Only arrays over 100 items are recycled |
| Rehydration resolves by path | `json-view.js rehydrateChunk` | Calls `resolvePath(_jsonDataRef, chunkpath)` each time. Works, but adds string parsing per rehydrate |
| Pre-computed file line numbers | `json-view.js countFileLines` | Recursive. Recomputed per chunk advance |
| Virtual table | `ui/simple-table.js` | `CHUNK_SIZE=200` rows, same chunk, sentinel, recycle pattern, plus a scroll fallback listener |
| Data-level filtering, not DOM-level | `universal-filter.js`, `search.js`, `null-finder.js` | Filters compute a `Set` of matched paths on the data, then `jsonView.setHighlight(set)` applies it per chunk. Survives recycle and rehydrate |
| Abortable filter runs | `universal-filter.js run()` | `runGeneration` counter plus a `signal` object checked in loops |
| Yielding in long scans | `traverse.searchValues` | Yields every 10000 ops. Fast path for a root array of objects |
| JSONPath fast mode | `universal-filter.js` | `resultType:'pointer'` was about 40x faster than 'all' (150k rows in about 2 s) |
| Global loading spinner with ref count | `utils/dom.js showLoading/hideLoading` | Counter based, safe for nesting |
| Event delegation | everywhere | One listener per container instead of per element |
| Iterative traversal | `utils/traverse.js walk` | Stack based, `maxDepth` default 20, no recursion overflow |
| Large file storage | `utils/storage.js` | Over 500 KB goes to IndexedDB (`jpe_store` / `large_files`), small ones to localStorage |

## 5. `src/utils/` reference

| File | Exposes | Purpose |
|---|---|---|
| `primitives.js` | `window.App.primitives`, `format`, `typeHelpers`, `dateHelpers`, `csvExport` (several namespaces from one file) | formatSize, formatTime, relativeTime, typeFlags, date column detection and parsing, CSV download |
| `traverse.js` | `walk`, `collectPaths`, `findAllArrays`, `findArrays`, `findArrayOfObjects`, `searchValues` | Iterative traversal and discovery. `collectPaths` only descends into the first item of arrays (schema style) |
| `storage.js` | `get/set/remove`, theme, bookmarks, recent files, IDB helpers | Prefix `jpe_`, `MAX_RECENT=50`, 500 KB threshold |
| `undo-stack.js` | `push/undo/redo/canUndo/canRedo/clear/current` | Stores `JSON.stringify` snapshots, max 20. Expensive for big data |
| `dom.js` | `$, toast, esc, escCode, copyAndToast, exprRow, delegate, showLoading, hideLoading` | Shared DOM helpers |
| `json-utils.js` | `jsonLint` (duplicate key detection), `jsonOps` (sortKeys, sortArray, flatten, unflatten, searchReplace), `jsonPatch` (RFC 6902 diff, apply), plus `analyzeKeys`, `deepStr`, `profileKeys`, `wildcardMatch`, `findNullPaths` | Core data operations |
| `data-mask.js` | mask sensitive data | Finds and anonymizes emails, phones, IPs, card numbers |
| `code-gen.js` | `generate(lang, val, name)` | TypeScript, Python, C#, Go, Rust, Java, SQL DDL, Power Fx |
| `path.js` | see 3.5 | Path tokenizing and builders |
| `lib-loader.js` | `libLoader.require(name)` | Lazy CDN loader, see below |
| `mock-gen.js` | `generate(sample)` | Realistic fake data matching a structure |
| `format-convert.js` | YAML and XML conversion | Uses js-yaml |
| `transform-ops.js` | operation registry | Regex pattern plus exec per op (navigate, index, map, filter, sort, groupBy, flat, unique, reverse, reduce, slice) |
| `stats.js` | `renderStats`, `collectAllPaths` | Stats panel: key coverage, missing and empty objects popups, array drill-in and drill-up |

### CDN libraries (lazy, `lib-loader.js`)
jsonrepair 3.14.0, jsonpath-plus 10.4.0, js-yaml 4.2.0, jsondiffpatch 0.5.0, ajv 6.12.6, html2canvas 1.4.1, papaparse 5.5.3 (all via jsdelivr or unpkg). Lucide is loaded eagerly and unpinned. Each is fetched on first feature use and cached by promise.

## 6. `src/ui/` reference

| File | Feature |
|---|---|
| `json-view.js` (877 lines) | Tree view: syntax highlighting, collapse and expand, chunk and recycle, key occurrence highlighting (VS Code style), inline value editing (dblclick), bookmark highlights, data-level highlight sets |
| `simple-table.js` (663) | Table view: sticky header, global search with wildcards `*` `?`, column sort (date and number aware), hide and reorder columns, column context menu, per-column filters, expand nested column, copy column, export CSV, array selector |
| `table-filter.js` | Column filter panel: Values tab (checkboxes) and Conditions tab (contains, starts with, greater than, date range, regex, and, or) |
| `universal-filter.js` (720) | Filter bar with four modes: `path` (wildcard), `jsonpath`, `regex`, `js` (expression evaluated with `new Function('data', ...)`). Mode auto-detect, history in localStorage `jpe_filter_history`, results applied to both tree and table |
| `search.js` | Find and Replace (Ctrl+F, Ctrl+H) with regex and keys options, navigation between matches |
| `null-finder.js` | Highlights null, empty string, empty array, empty object |
| `views.js` | Schema skeleton view and Diff view (jsondiffpatch, with a basic fallback) |
| `graph-view.js` | SVG node graph, own layout code, pan and zoom, ellipsis nodes that expand on click |
| `stats-panel.js` | Right-hand stats accordion helpers |
| `content-preview.js` | Smart chips: colors, images, URLs and favicons, JWT decode, relative dates, country flags, HTTP status meanings |
| `json-editor.js` | Raw text editor with line numbers, format, minify, apply, undo |
| `transform-panel.js` | Ctrl+T transform with live preview |
| `validator.js` | JSON Schema validation (Ajv) |
| `data-viz.js`, `data-profiler.js`, `minimap.js`, `pivot-table.js` | Charts, per-field profile and quality score, tree minimap, pivot (count, sum, avg, min, max) |
| `multi-tab.js` | Up to 8 tabs. Session persisted: metadata in `localStorage jpe_tab_session`, per-tab raw text via `storage.set('tab_<id>')` (that is localStorage, not IDB, despite the comment) |
| `snippet-library.js` | Saved JSON snippets, emits `snippet-load` |
| `workspace-export.js` | Save and load whole workspace (theme, bookmarks, tabs, snippets) as a file |
| `toolbar-actions.js` (335) | Button handlers: expand and collapse, theme, sort, flatten, minify, convert, export, share URL, image export, repair, mask |
| `toolbar-pin.js` | Right-click to pin or hide toolbar buttons |
| `command-palette.js` + `command-registry.js` | Ctrl+K palette; registry registers all commands with category and shortcut |
| `shortcuts-handler.js` + `shortcuts-overlay.js` | All key bindings and the `?` overlay |
| `help-modal.js`, `type-def-modal.js`, `zoom.js`, `panel-resizer.js`, `autocomplete.js` | Help popups, type definition modal, zoom, resizable right panel, reusable autocomplete (`attach(input, {getItems, onSelect, maxResults, matchMode})`) |
| `input-handler.js` (471) | File, paste (also YAML detect), CSV and TSV via PapaParse, URL/API panel (GET, POST, PUT, PATCH, DELETE; Bearer, Basic, API key; custom headers; body json, text, form), clipboard JSON detection banner, Recent list, load from URL hash (share links) |

## 7. `src/expressions/`
- `power-platform.js`: `generatePA(path, value)` and `generateFx(path, value)` return HTML rows (`exprRow`) of ready-to-copy expressions, by value type. Arrays get length, first, last, take, skip, chunk, union, sort, filter, select and so on.
- `helpers.js`: Power Platform Helpers accordion. `detectConnectorShape` recognizes OData value[], HTTP body wrapper, legacy `d.results`, `results`, `@odata.context`, direct array. Also Apply to each snippets per array, date and time and workflow patterns.
- `schema-gen.js`: Parse JSON action schema. `generateJsonSchema` (single sample) and `generateSmartSchema` (scans all array items for nullable, required, mixed types). Copy button writes it to the clipboard.
- App.js destructures these as `window.App.expressionsPA.generate`, `expressionsFx.generate`, `helpers.render`, `schemaGen`.

## 8. UI layout (`index.html`)
- Input overlay (tabs: Upload File, Paste JSON, Import CSV, Load URL, Recent) shown until data is loaded.
- Toolbar: back and forward, path input with autocomplete, copy, bookmark, search, advanced filter, table view, grouped dropdowns (Views, Export and Share, Analyze, Tools), transform, sort keys, flatten, minify, clear, theme, command palette.
- Breadcrumb bar under the toolbar.
- Main split: left JSON panel (tree, graph, editor, table, schema share the same area; only one is shown) and a resizable right panel of accordions: Stats, Bookmarks, Path Result, Power Platform Expressions (Power Automate and Canvas App subtabs), Power Platform Helpers, Parse JSON Schema.
- Overlays: context menu (copy path, value, subtree, Copy As language, bookmark, mock data), diff overlay, convert modal, URL/API modal, type definition modal, toast, global loading spinner.
- Theming: CSS variables on `:root`, dark overrides under a theme selector. Key tokens: `--primary #2563eb`, `--bg #f8fafc`, `--surface`, `--border`, `--text*`, `--highlight*`, `--search-hl`, `--mono` (Cascadia Code, Fira Code, JetBrains Mono, Consolas). Theme stored under `jpe_theme`.

## 9. Keyboard shortcuts (from README)
Ctrl+F find, Ctrl+H replace, Ctrl+T transform, Ctrl+E editor, Ctrl+K palette, Ctrl+B bookmark, Ctrl+Z / Ctrl+Y undo and redo, Ctrl+1/2/3 tree, table, schema, Ctrl+4 graph, Ctrl+Shift+F universal filter, Ctrl+Shift+N null finder, Ctrl+Shift+S sort keys, Ctrl+Shift+L flatten, Ctrl+Shift+M minify, Ctrl+Shift+E export CSV, Ctrl+Shift+C convert, Ctrl+Shift+I image, Ctrl+Shift+U share URL, Ctrl+Shift+H heatmap, Alt+R repair, Alt+P profiler, Alt+C charts, Alt+M minimap, Alt+V pivot, Alt+T theme, Alt+Left and Alt+Right history, `?` overlay.

## 10. Tests and fixtures
- No automated test runner in the repo. `test-results/screenshots/` has numbered Playwright screenshots (01 to 35: path selection, search, sort, table, flatten, share URL, image export, schema, TypeScript types, diff, edit mode) from manual or scripted browser runs.
- `Tests/` holds fixtures: `edge_*.json` (big object, bool, chunk boundary, deep nest, null, number, odata, singles, special keys, string), `test_case1..12.json`, `test4_nested_arrays.json`, `test5_empties.json`, `jsonobject.json`, `perf_100k.json`, `perf_150k_complex.json`, generators `gen_edge.js` and `gen_odata.js`.
- Useful as a ready-made regression and performance corpus for V2.

## 11. Git history themes (what was hard)
Most commits (2026-06-18) are about large-data performance and filter correctness:
virtual scrolling for table, chunk and recycle for table, chunk cascade bug with active filter, filter state surviving view switch, data-level filter refactor, JSONPath speed (`resultType: pointer`), JSONPath path normalization (strip dot before bracket), unique top-level record count for filter info, global spinner, cache busting, JWT/API panel. Latest commit adds worker init logging and sync fallback logging.

## 12. Known weak spots and risks (for V2 design)
1. Global namespace plus `document.write` loader plus hand-ordered script list is fragile and blocks async or deferred loading.
2. `Date.now()` cache busting on every asset means no caching at all.
3. Hard dependency on CDN at runtime (Lucide eager and unpinned `@latest`; others lazy). No offline mode.
4. `new Function` is used for the JS filter mode (`universal-filter.js:537`) and transform ops (`transform-ops.js:17,22`). Transform ops guard with a keyword blocklist regex, which is not a real sandbox. The JS filter mode has no such guard in the lines inspected.
5. Undo stack stores full `JSON.stringify` snapshots (max 20). With 90 MB files this is heavy.
6. Whole dataset lives on the main thread after parse (worker returns a structured clone). JSONPath, regex scan, stats and collectPaths all run on the main thread, only softened by yielding.
7. `rehydrateChunk` and `loadNextChunk` rely on `resolvePath` string parsing and on `window.App._jsonDataRef`, so stale references are possible after edits.
8. `inline-edit` mutates the data in place before the undo snapshot is pushed (`setNestedValue` runs first; the pushed snapshot is taken after), so "undo" snapshot semantics need checking.
9. `multi-tab.saveSession` writes full raw text per tab through `storage.set` (localStorage), which silently fails above quota. The comment claims IDB.
10. Table view tags rows with `__origIdx` by mutating the user's data objects.
11. Duplicated confirm and spinner patterns across toolbar actions; `app.js` is a large orchestrator with many direct DOM ids (`$('...')`), so UI and logic are tightly coupled to `index.html` ids.
12. Storage key prefix `jpe_` is a leftover from the old product name.

## 13. Ideas worth carrying into V2
- Keep: data-level filtering with matched-path sets, chunk plus recycle virtualization, abortable runs with generation tokens, staged startup with yielding, worker parsing, path/expression generation for Power Automate and Power Fx, content chips, command palette, multi-tab workspaces, Power Platform focus.
- Replace: global namespace with ES modules, `document.write` loader with a module entry, `@latest` CDN with pinned or vendored libs, cache-busting with versioned assets, snapshot undo with patch-based undo, `new Function` filters with a safe evaluator or a worker sandbox.
- Consider moving heavy work (collectPaths, stats, search, JSONPath) into the worker and keeping only a view of results on the main thread.

## 14. How this file was produced
Read directly: `README.md`, `index.html`, `src/app.js`, `utils/{dom,path,lib-loader,storage}.js`, `utils/traverse.js` (first 200 lines), `workers/json-parser.js`, `ui/json-view.js` (first 330 lines), parts of `ui/universal-filter.js`, `ui/simple-table.js`, `ui/multi-tab.js`, `expressions/*` (heads), `utils/transform-ops.js` and `undo-stack.js` (heads), plus function listings of the other `ui/` and `utils/` files.
Not read in full: `json-view.js` after line 330, most of `simple-table.js`, `universal-filter.js` mode implementations other than JSONPath, `toolbar-actions.js`, `graph-view.js`, `data-viz`, `data-profiler`, `minimap`, `pivot-table`, `validator`, `transform-panel`, `workspace-export`, `command-registry`, `styles.css`. Descriptions of those come from README, file headers and function names, not from line-by-line reading.
