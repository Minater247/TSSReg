(() => {
  const tickCallbacks = [];

  function filterBarElement() {
    return document.querySelector(".sapUiMdcFilterBarBase");
  }

  function onScheduleTick(fn) {
    tickCallbacks.push(fn);
  }

  function check() {
    if (!/^#YSchedule-view(?:[?&]|$)/.test(location.hash || "")) return;
    const bar = filterBarElement();
    if (!bar) return;
    tickCallbacks.forEach((fn) => fn(bar));
  }

  window.__tssregShared = { filterBarElement, onScheduleTick };

  sap.ui.require(["sap/ui/core/Rendering"], (Rendering) => {
    Rendering.attachUIUpdated(check);
    window.addEventListener("hashchange", check);
    check();
  });
})();
