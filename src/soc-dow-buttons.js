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
      inner.classList.toggle("sapMBtnDefault", !isSelected);
      btn.setAttribute("aria-pressed", String(isSelected));
    });
  }

  function toggleDay(bar, code) {
    if (selectedDays.has(code)) selectedDays.delete(code);
    else selectedDays.add(code);
    applyButtonState(bar);
  }

  function ensureLabel(bar) {
    const label = bar.querySelector('[id$="::FilterField::DoW-label"] bdi');
    if (label && label.textContent === "Day of the Week") label.textContent = "Days of the Week";
  }

  function ensureButtons(bar) {
    ensureLabel(bar);
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
      const button = window.__tssregShared.nativeButton(
        "sapMBtnBase sapMBtn tssreg-dow-btn",
        "sapMBtnDefault",
        short
      );
      button.dataset.day = code;
      button.title = label;
      button.addEventListener("click", () => toggleDay(bar, code));
      row.appendChild(button);
    });
    controlEl.appendChild(row);
    applyButtonState(bar);
  }

  function matchingModuleIds(year, term, ids) {
    const dayClause = [...selectedDays].map((d) => "DoW eq '" + d + "'").join(" or ");
    return window.__tssregShared.moduleIdSet(
      "YUCSD_CON_MODULE_SCHED",
      ids,
      (idClause) =>
        "AcYear eq '" + year + "' and Acsess eq '" + term + "' and (" + idClause + ") and (" + dayClause + ")"
    );
  }

  window.__tssregShared.registerModuleFilter({
    isActive: () => selectedDays.size > 0,
    matchingIds: ({ year, term, ids }) => matchingModuleIds(year, term, ids),
  });

  window.__tssregShared.onScheduleTick(ensureButtons);
})();
