(() => {
  let expanded = false;

  function applyExpanded(bar, button) {
    if (bar.classList.contains("tssreg-expanded") === expanded) return;
    bar.classList.toggle("tssreg-expanded", expanded);
    button.querySelector("bdi").textContent = expanded ? "Fewer Filters" : "More Filters";
  }

  function ensureSeparator(bar) {
    if (bar.querySelector("#tssreg-soc-separator")) return;
    const layout = bar.querySelector(".sapUiAFLayout");
    if (!layout) return;

    const hr = document.createElement("hr");
    hr.id = "tssreg-soc-separator";
    layout.appendChild(hr);
  }

  function ensureToggle(bar) {
    ensureSeparator(bar);
    const existing = bar.querySelector("#tssreg-more-filters");
    if (existing) {
      applyExpanded(bar, existing);
      return existing;
    }
    const adapt = bar.querySelector('[id$="-btnAdapt"]');
    if (!adapt) return null;

    const button = window.__tssregShared.nativeButton(
      "sapMBtnBase sapMBtn",
      "sapMBtnTransparent",
      "More Filters"
    );
    button.id = "tssreg-more-filters";
    button.addEventListener("click", () => {
      expanded = !expanded;
      applyExpanded(bar, button);
    });

    const wrapper = document.createElement("div");
    wrapper.className = "sapUiHLayoutChildWrapper";
    wrapper.appendChild(button);
    adapt.parentElement.insertAdjacentElement("afterend", wrapper);

    applyExpanded(bar, button);
    return button;
  }

  window.__tssregShared.onScheduleTick(ensureToggle);
})();
