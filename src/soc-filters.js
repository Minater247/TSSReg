(() => {
  let expanded = false;

  function filterBarElement() {
    return (
      [...document.querySelectorAll('[id*="--fe::FilterBar::"]')].find((e) =>
        /--fe::FilterBar::[^:]+$/.test(e.id)
      ) || null
    );
  }

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

    const button = document.createElement("button");
    button.id = "tssreg-more-filters";
    button.type = "button";
    button.className = "sapMBtnBase sapMBtn";
    button.innerHTML =
      '<span class="sapMBtnInner sapMBtnHoverable sapMFocusable sapMBtnText sapMBtnTransparent">' +
      '<span class="sapMBtnContent"><bdi>More Filters</bdi></span></span>';
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

  function check() {
    if (!/^#YSchedule-view(?:[?&]|$)/.test(location.hash || "")) return;
    const bar = filterBarElement();
    if (bar) ensureToggle(bar);
  }

  sap.ui.require(["sap/ui/core/Rendering"], (Rendering) => {
    Rendering.attachUIUpdated(check);
    window.addEventListener("hashchange", check);
    check();
  });
})();
