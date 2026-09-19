(() => {
  const DAYS = [
    ["1", "Monday", "M"],
    ["2", "Tuesday", "Tu"],
    ["3", "Wednesday", "W"],
    ["4", "Thursday", "Th"],
    ["5", "Friday", "F"],
    ["6", "Saturday", "Sa"],
    ["7", "Sunday", "Su"],
  ];
  const SCHED_URL =
    "/sap/opu/odata4/sap/yucsd_con_module_sb/srvd/sap/yucsd_con_module_servicedef/0001/YUCSD_CON_MODULE_SCHED";
  const ID_CHUNK_SIZE = 40;

  let selectedDays = new Set();

  function dowField(bar) {
    const el = bar.querySelector('[id$="::FilterField::DoW"]');
    return el ? sap.ui.getCore().byId(el.id) : null;
  }

  function applyButtonState(bar) {
    const row = bar.querySelector(".tssreg-dow-row");
    if (!row) return;
    const signature = [...selectedDays].sort().join(",");
    if (row.__tssDowSignature === signature) return;
    row.__tssDowSignature = signature;
    row.querySelectorAll(".tssreg-dow-btn").forEach((btn) => {
      const inner = btn.querySelector(".sapMBtnInner");
      const isSelected = selectedDays.has(btn.dataset.day);
      inner.classList.toggle("sapMBtnEmphasized", isSelected);
      inner.classList.toggle("sapMBtnTransparent", !isSelected);
      btn.setAttribute("aria-pressed", String(isSelected));
    });
  }

  function toggleDay(bar, code) {
    if (selectedDays.has(code)) selectedDays.delete(code);
    else selectedDays.add(code);
    applyButtonState(bar);
  }

  function ensureButtons(bar) {
    const controlEl = bar.querySelector('[id$="::FilterField::DoW"]');
    if (!controlEl) return;
    if (controlEl.querySelector(".tssreg-dow-row")) {
      applyButtonState(bar);
      return;
    }

    const field = dowField(bar);
    if (field && field.getConditions().length) field.setConditions([]);

    const row = document.createElement("div");
    row.className = "tssreg-dow-row";
    DAYS.forEach(([code, label, short]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sapMBtnBase sapMBtn tssreg-dow-btn";
      button.dataset.day = code;
      button.title = label;
      button.innerHTML =
        '<span class="sapMBtnInner sapMBtnHoverable sapMFocusable sapMBtnText sapMBtnTransparent">' +
        '<span class="sapMBtnContent"><bdi>' + short + "</bdi></span></span>";
      button.addEventListener("click", () => toggleDay(bar, code));
      row.appendChild(button);
    });
    controlEl.appendChild(row);
    applyButtonState(bar);
  }

  function matchingModuleIds(year, term, ids) {
    if (!ids.length) return Promise.resolve(new Set());
    const dayClause = [...selectedDays].map((d) => "DoW eq '" + d + "'").join(" or ");
    const urls = window.__tssregShared.chunk(ids, ID_CHUNK_SIZE).map((idChunk) => {
      const idClause = idChunk.map((id) => "ModuleID eq '" + id + "'").join(" or ");
      const filter =
        "AcYear eq '" + year + "' and Acsess eq '" + term + "' and (" + idClause + ") and (" + dayClause + ")";
      return SCHED_URL + "?sap-client=500&$top=5000&$select=ModuleID&$filter=" + encodeURIComponent(filter);
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
    isActive: () => selectedDays.size > 0,
    matchingIds: ({ year, term, ids }) => matchingModuleIds(year, term, ids),
  });

  window.__tssregShared.onScheduleTick(ensureButtons);
})();
