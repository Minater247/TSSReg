(() => {
  const TIME_MIN = 360;
  const TIME_MAX = 1320;
  const STEP = 30;

  let lo = TIME_MIN;
  let hi = TIME_MAX;

  function formatTime(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const h12 = h % 12 || 12;
    const mm = m < 10 ? "0" + m : String(m);
    return h12 + ":" + mm + " " + (h >= 12 ? "PM" : "AM");
  }

  function minutesToTimeLiteral(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return (h < 10 ? "0" + h : h) + ":" + (m < 10 ? "0" + m : m) + ":00";
  }

  function updateCaption() {
    const item = document.getElementById("tssreg-timeofday-item");
    const caption = item ? item.querySelector(".tssreg-time-caption") : null;
    if (caption) caption.textContent = formatTime(lo) + " – " + formatTime(hi);
  }

  function onRangeChange(event) {
    const range = event.getParameter("range");
    lo = range[0];
    hi = range[1];
    updateCaption();
  }

  function ensureItem(bar) {
    const layout = bar.querySelector(".sapUiAFLayout");
    if (!layout) return;
    if (layout.querySelector("#tssreg-timeofday-item")) return;

    const { item, cell } = window.__tssregShared.filterFieldItem("tssreg-timeofday-item", "Time of Day");
    const field = document.createElement("div");
    field.className = "sapUiMdcFieldBase";
    const mount = document.createElement("div");
    mount.className = "tssreg-time-mount";
    const caption = document.createElement("span");
    caption.className = "sapMText tssreg-time-caption";
    field.appendChild(mount);
    field.appendChild(caption);
    cell.appendChild(field);
    layout.appendChild(item);

    let slider = sap.ui.getCore().byId("tssreg-timeofday-slider");
    if (!slider) {
      slider = new sap.m.RangeSlider("tssreg-timeofday-slider", {
        min: TIME_MIN,
        max: TIME_MAX,
        step: STEP,
        range: [TIME_MIN, TIME_MAX],
        width: "100%",
        showHandleTooltip: false,
        showAdvancedTooltip: false,
        inputsAsTooltips: false,
        enableTickmarks: true,
        liveChange: onRangeChange,
        change: onRangeChange,
      });
    }
    slider.setRange([lo, hi]);
    slider.placeAt(item.querySelector(".tssreg-time-mount"));
    sap.ui.getCore().applyChanges();
    updateCaption();
  }

  function matchingModuleIds(year, term, ids) {
    const loLiteral = minutesToTimeLiteral(lo);
    const hiLiteral = minutesToTimeLiteral(hi);
    return window.__tssregShared
      .moduleIdSet(
        "YUCSD_CON_MODULE_SCHED",
        ids,
        (idClause) =>
          "AcYear eq '" + year + "' and Acsess eq '" + term + "' and (" + idClause + ")" +
          " and (BeginTime lt " + loLiteral + " or EndTime gt " + hiLiteral + ")"
      )
      .then((violating) => new Set(ids.filter((id) => !violating.has(id))));
  }

  window.__tssregShared.registerModuleFilter({
    isActive: () => lo > TIME_MIN || hi < TIME_MAX,
    matchingIds: ({ year, term, ids }) => matchingModuleIds(year, term, ids),
  });

  window.__tssregShared.onScheduleTick(ensureItem);
})();
