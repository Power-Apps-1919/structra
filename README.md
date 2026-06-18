# Structra

A JSON explorer and analyzer that runs entirely in your browser. Nothing to install, no backend, no sign-up. Just open it and start exploring.

**[Try it live](https://power-apps-1919.github.io/structra/)**

---

## What can it do?

### Load your JSON
- Upload a file or drag and drop it
- Paste JSON directly (also detects YAML automatically)
- Import CSV or TSV data
- Fetch from any API with full REST support (GET, POST, PUT, PATCH, DELETE), authentication (Bearer token, Basic auth, API key), custom headers, and request body
- It also detects JSON on your clipboard when you open the app

Large files work fine. Parsing happens in a background thread so the UI stays responsive, even with 200k+ items.

### Multiple ways to view your data
- **Tree view** (`Ctrl+1`): collapsible, syntax-highlighted, with lazy loading for huge arrays
- **Table view** (`Ctrl+2`): sortable columns, search, filter, reorder, and hide columns
- **Schema view** (`Ctrl+3`): shows the shape and types of your data
- **Graph view** (`Ctrl+4`): interactive SVG visualization you can pan and zoom
- **Editor** (`Ctrl+E`): edit the raw JSON with line numbers, formatting, and apply changes

### Search and filter
- **Find** (`Ctrl+F`): search keys and values with match count and navigation
- **Find and Replace** (`Ctrl+H`): replace one or all, with regex support
- **Universal Filter** (`Ctrl+Shift+F`): filter by path, JSONPath (`$..name`), regex, or JavaScript expressions
- **Null Finder** (`Ctrl+Shift+N`): highlights all null values, empty strings, and empty arrays or objects
- **Table filters**: filter columns by value checkboxes or conditions like contains, starts with, greater than, date range, regex, and more

### Transform your data
- **Transform panel** (`Ctrl+T`): run map, filter, sort, groupBy, flat, unique, reverse, reduce, slice, and other operations with a live preview
- Sort keys alphabetically (`Ctrl+Shift+S`)
- Flatten nested objects to dot notation or unflatten them back (`Ctrl+Shift+L`)
- Minify or pretty-print (`Ctrl+Shift+M`)
- Repair broken JSON (`Alt+R`)
- Undo and redo any change (`Ctrl+Z` / `Ctrl+Y`)

### Analyze your data
- **Stats panel**: key count, nesting depth, type breakdown, and missing key detection
- **Size heatmap** (`Ctrl+Shift+H`): colors each node by how much space it takes
- **Data profiler** (`Alt+P`): shows coverage, null percentage, min/max/average, unique values, and a data quality score for each field
- **Charts** (`Alt+C`): sparklines and bar charts for numeric arrays
- **Minimap** (`Alt+M`): a small overview of the entire tree you can click to navigate
- **Pivot table** (`Alt+V`): group by a field and aggregate with count, sum, average, min, or max
- Detects duplicate keys in your JSON

### Export and share
- Download as CSV (`Ctrl+Shift+E`)
- Convert to YAML or XML (`Ctrl+Shift+C`)
- Export the view as an image (`Ctrl+Shift+I`)
- Generate a shareable URL (`Ctrl+Shift+U`)
- Save your entire workspace (theme, bookmarks, tabs, snippets) to a file and load it back later

### Generate code
Create type definitions from your JSON in TypeScript, C#, Go, Python, Rust, Java, SQL, and Power Fx. Right-click any value to copy it as code in any of these languages.

### Compare JSON
Side-by-side diff view that highlights what changed. You can load the second JSON from another tab or paste it in. Also lets you export the changes as an RFC 6902 JSON Patch.

### Smart content detection
The app recognizes common value types and shows visual hints next to them: color swatches, image previews, clickable URLs with favicons, decoded JWT tokens, dates shown as relative time, country flags, HTTP status meanings, and many more.

### Power Platform support
Built-in help for Power Automate and Canvas Apps:
- Select any path and get ready-to-use Power Automate expressions (access, count, filter, sort, apply-to-each, and more)
- Get Power Fx expressions for Canvas Apps (ParseJSON, ForAll, Gallery items)
- Detects connector shapes like OData, SharePoint, Dataverse, and HTTP responses
- Generate a Parse JSON schema you can copy directly into your flow

### More tools
- **Schema validator**: check your JSON against a JSON Schema
- **Snippet library**: save and reuse pieces of JSON
- **Mask sensitive data**: automatically find and anonymize emails, phone numbers, IPs, and credit card numbers
- **Mock data generator**: right-click any value to generate realistic fake data that matches the structure
- **Multi-tab**: work with up to 8 JSON documents at once
- **Command palette** (`Ctrl+K`): quickly find any command by typing
- **Dark and light theme** (`Alt+T`)
- **Customizable toolbar**: right-click buttons to pin or hide them

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+F` | Find |
| `Ctrl+H` | Find and Replace |
| `Ctrl+T` | Transform |
| `Ctrl+E` | Edit JSON |
| `Ctrl+K` | Command Palette |
| `Ctrl+B` | Bookmark |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Ctrl+1` / `2` / `3` | Tree / Table / Schema view |
| `Ctrl+Shift+F` | Universal Filter |
| `Alt+T` | Toggle theme |
| `?` | Show all shortcuts |

---

## How it works

Structra is built with plain HTML, CSS, and JavaScript. There is no build step, no framework, and no backend server. A few libraries are loaded from CDN when you first use the features that need them: jsonrepair, jsonpath-plus, js-yaml, jsondiffpatch, Ajv, html2canvas, PapaParse, and Lucide Icons.

---

## Run it locally

Open `index.html` in your browser. That's it.

```bash
# Or use any static file server
npx serve .
```
