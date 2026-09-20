(() => {
  const EVENTS_URL =
    "/sap/opu/odata4/sap/yucsd_con_module_sb/srvd/sap/yucsd_con_module_servicedef/0001/YUCSD_CON_EVENTS";
  const ID_CHUNK_SIZE = 40;
  const MODES = [
    ["any", "Any"],
    ["open", "Open"],
    ["openwl", "Open or Waitlist"],
  ];

  let mode = "any";

  function seatsField(bar) {
    const el = bar.querySelector('[id$="::FilterField::seatsAvailable"]');
    return el ? sap.ui.getCore().byId(el.id) : null;
  }

  function applyNativeCondition(bar) {
    const field = seatsField(bar);
    if (!field) return;
    const hasNativeCondition = field.getConditions().length > 0;
    if (mode === "open") {
      if (!hasNativeCondition) field.setConditions([{ operator: "EQ", values: ["Y"] }]);
    } else if (hasNativeCondition) {
      field.setConditions([]);
    }
  }

  function applyButtonState(bar) {
    const row = bar.querySelector(".tssreg-avail-row");
    if (!row) return;
    if (row.__tssAvailSignature === mode) return;
    row.__tssAvailSignature = mode;
    row.querySelectorAll(".tssreg-avail-btn").forEach((btn) => {
      const inner = btn.querySelector(".sapMBtnInner");
      const isSelected = btn.dataset.mode === mode;
      inner.classList.toggle("sapMBtnEmphasized", isSelected);
      inner.classList.toggle("sapMBtnDefault", !isSelected);
      btn.setAttribute("aria-pressed", String(isSelected));
    });
  }

  function setMode(bar, next) {
    mode = next;
    applyNativeCondition(bar);
    applyButtonState(bar);
  }

  function ensureButtons(bar) {
    const controlEl = bar.querySelector('[id$="::FilterField::seatsAvailable"]');
    if (!controlEl) return;
    if (controlEl.querySelector(".tssreg-avail-row")) {
      applyButtonState(bar);
      return;
    }

    const row = document.createElement("div");
    row.className = "tssreg-avail-row";
    MODES.forEach(([code, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sapMBtnBase sapMBtn tssreg-avail-btn";
      button.dataset.mode = code;
      button.title = label;
      button.innerHTML =
        '<span class="sapMBtnInner sapMBtnHoverable sapMFocusable sapMBtnText sapMBtnDefault">' +
        '<span class="sapMBtnContent"><bdi>' + label + "</bdi></span></span>";
      button.addEventListener("click", () => setMode(bar, code));
      row.appendChild(button);
    });
    controlEl.appendChild(row);
    applyButtonState(bar);
  }

  function matchingModuleIds(year, term, ids) {
    if (!ids.length) return Promise.resolve(new Set());
    const urls = window.__tssregShared.chunk(ids, ID_CHUNK_SIZE).map((idChunk) => {
      const idClause = idChunk.map((id) => "ModuleID eq '" + id + "'").join(" or ");
      const filter =
        "AcYear eq '" + year + "' and AcPeriod eq '" + term + "' and (" + idClause + ")" +
        " and (EventPkgSeatsAvailable gt 0 or EventPkgNumOnWaitl gt 0)";
      return EVENTS_URL + "?sap-client=500&$top=5000&$select=ModuleID&$filter=" + encodeURIComponent(filter);
    });
    return Promise.all(urls.map(window.__tssregShared.fetchJson)).then((results) => {
      const matched = new Set();
      results.forEach((data) => {
        ((data && data.value) || []).forEach((r) => matched.add(r.ModuleID));
      });
      return matched;
    });
  }

  window.__tssregShared.registerModuleFilter({
    isActive: () => mode === "openwl",
    matchingIds: ({ year, term, ids }) => matchingModuleIds(year, term, ids),
  });

  window.__tssregShared.onScheduleTick(ensureButtons);
})();
