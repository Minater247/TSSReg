(() => {
  const HOME = "#YStudent-Overview";
  const HOME_ALIAS = HOME + "?sap-app-origin-hint=";
  const LOGO = "#shell-header-icon";

  function openHome(event) {
    if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!event.target.closest?.(LOGO)) return;

    // Handle the logo before the shell can open its configured launcher.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (location.hash !== HOME) location.hash = HOME;
  }

  function normalizeHome() {
    if (location.hash === HOME_ALIAS) location.replace(HOME);
  }

  document.addEventListener("click", openHome, true);
  window.addEventListener("hashchange", normalizeHome);
  normalizeHome();
})();
