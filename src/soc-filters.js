(() => {
  function filterBar() {
    return (
      [...document.querySelectorAll('[id*="--fe::FilterBar::"]')].find((e) =>
        /--fe::FilterBar::[^:]+$/.test(e.id)
      ) || null
    );
  }

  function setExpanded(bar, button, expanded) {
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
    if (bar.querySelector("#tssreg-more-filters")) return;
    const adapt = bar.querySelector('[id$="-btnAdapt"]');
    if (!adapt) return;

    const button = document.createElement("button");
    button.id = "tssreg-more-filters";
    button.type = "button";
    button.className = "sapMBtnBase sapMBtn";
    button.innerHTML =
      '<span class="sapMBtnInner sapMBtnHoverable sapMFocusable sapMBtnText sapMBtnTransparent">' +
      '<span class="sapMBtnContent"><bdi>More Filters</bdi></span></span>';
    button.addEventListener("click", () => {
      setExpanded(bar, button, !bar.classList.contains("tssreg-expanded"));
    });

    const wrapper = document.createElement("div");
    wrapper.className = "sapUiHLayoutChildWrapper";
    wrapper.appendChild(button);
    adapt.parentElement.insertAdjacentElement("afterend", wrapper);

    setExpanded(bar, button, false);
  }

  function sync() {
    if (!/^#YSchedule-view(?:[?&]|$)/.test(location.hash || "")) return;
    const bar = filterBar();
    if (bar) ensureToggle(bar);
  }

  new MutationObserver(sync).observe(document.body, { childList: true, subtree: true });
  window.addEventListener("hashchange", sync);
  sync();
})();
