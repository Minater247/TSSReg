(() => {
  const SCHED_URL =
    "/sap/opu/odata4/sap/yucsd_con_module_sb/srvd/sap/yucsd_con_module_servicedef/0001/YUCSD_CON_MODULE_SCHED";
  const ID_CHUNK_SIZE = 40;
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

    const item = document.createElement("div");
    item.id = "tssreg-timeofday-item";
    item.innerHTML =
      '<div class="sapUiVlt sapuiVlt">' +
      '<div class="sapUiVltCell sapuiVltCell">' +
      '<label class="sapMLabel sapUiSelectable sapMLabelMaxWidth sapUiMdcFilterBarBaseLabel" style="text-align: left;">' +
      '<div class="sapMLabelInner" style="justify-content: flex-start;">' +
      '<span class="sapMLabelTextWrapper"><bdi>Time of Day</bdi></span>' +
      '<span class="sapMLabelColonAndRequired" data-colon=":" aria-hidden="true"></span>' +
      "</div>" +
      "</label>" +
      "</div>" +
      '<div class="sapUiVltCell sapuiVltCell">' +
      '<div class="sapUiMdcFieldBase">' +
      '<div class="tssreg-time-mount"></div>' +
      '<span class="sapMText tssreg-time-caption"></span>' +
      "</div>" +
      "</div>" +
      "</div>";
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
    if (!ids.length) return Promise.resolve(new Set());
    const loLiteral = minutesToTimeLiteral(lo);
    const hiLiteral = minutesToTimeLiteral(hi);
    const urls = window.__tssregShared.chunk(ids, ID_CHUNK_SIZE).map((idChunk) => {
      const idClause = idChunk.map((id) => "ModuleID eq '" + id + "'").join(" or ");
      const filter =
        "AcYear eq '" + year + "' and Acsess eq '" + term + "' and (" + idClause + ")" +
        " and (BeginTime lt " + loLiteral + " or EndTime gt " + hiLiteral + ")";
      return SCHED_URL + "?sap-client=500&$top=5000&$select=ModuleID&$filter=" + encodeURIComponent(filter);
    });
    return Promise.all(urls.map(window.__tssregShared.fetchJson)).then((results) => {
      const violating = new Set();
      results.forEach((data) => {
        ((data && data.value) || []).forEach((r) => violating.add(r.ModuleID));
      });
      return new Set(ids.filter((id) => !violating.has(id)));
    });
  }

  window.__tssregShared.registerModuleFilter({
    isActive: () => lo > TIME_MIN || hi < TIME_MAX,
    matchingIds: ({ year, term, ids }) => matchingModuleIds(year, term, ids),
  });

  window.__tssregShared.onScheduleTick(ensureItem);
})();
