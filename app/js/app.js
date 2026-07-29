/* ── LogScope: entry point ──────────────────────────────────── */
(function () {
  function init() { window.LS.ui.init(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
