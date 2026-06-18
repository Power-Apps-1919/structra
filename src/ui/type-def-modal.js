/**
 * Type Definition Modal — shows generated type definitions in multiple languages.
 */
window.App = window.App || {};
window.App.typeDefModal = (() => {
  const { $, toast } = window.App.dom;

  function show(jsonData) {
    if (!jsonData) return;
    $('typeDefModal').classList.add('show');
    generate('ts', jsonData);
  }

  function hide() {
    $('typeDefModal').classList.remove('show');
  }

  function generate(lang, jsonData) {
    $('typeDefBody').textContent = window.App.codeGen.generate(lang, jsonData);
  }

  function init(getJsonData) {
    $('btnTypeDef').addEventListener('click', () => show(getJsonData()));
    $('typeDefClose').addEventListener('click', hide);
    $('typeDefModal').querySelectorAll('.modal-tabs button').forEach(btn => {
      btn.addEventListener('click', () => {
        $('typeDefModal').querySelectorAll('.modal-tabs button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        generate(btn.dataset.td, getJsonData());
      });
    });
    $('typeDefCopy').addEventListener('click', () => {
      navigator.clipboard.writeText($('typeDefBody').textContent);
      toast('Type definition copied!');
    });
  }

  function isVisible() { return $('typeDefModal').classList.contains('show'); }

  return { init, show, hide, isVisible };
})();
