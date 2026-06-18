/**
 * Lazy CDN library loader — loads external scripts on first use
 */
window.App = window.App || {};
window.App.libLoader = (() => {
  const loaded = {};

  function load(name, url) {
    if (loaded[name]) return loaded[name];
    loaded[name] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ${name}`));
      document.head.appendChild(s);
    });
    return loaded[name];
  }

  const LIBS = {
    jsonrepair: 'https://cdn.jsdelivr.net/npm/jsonrepair@3.14.0/lib/umd/jsonrepair.min.js',
    jsonpath: 'https://unpkg.com/jsonpath-plus@10.4.0/dist/index-browser-umd.cjs',
    jsyaml: 'https://cdn.jsdelivr.net/npm/js-yaml@4.2.0/dist/js-yaml.min.js',
    jsondiffpatch: 'https://cdn.jsdelivr.net/npm/jsondiffpatch@0.5.0/dist/jsondiffpatch.umd.min.js',
    ajv: 'https://cdn.jsdelivr.net/npm/ajv@6.12.6/dist/ajv.min.js',
    html2canvas: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
    papaparse: 'https://cdn.jsdelivr.net/npm/papaparse@5.5.3/papaparse.min.js',
  };

  async function require(name) {
    if (!LIBS[name]) throw new Error(`Unknown lib: ${name}`);
    await load(name, LIBS[name]);
  }

  return { require, LIBS };
})();
