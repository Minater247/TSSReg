(() => {
  const MINMAXUNITS_URL =
    "/sap/opu/odata4/sap/yucsd_con_module_sb/srvd/sap/yucsd_con_module_servicedef/0001/YUCSD_I_MINMAXUNITS";
  const STEP = 1;

  let current = null;
  let fetchingKey = null;
  let fallbackFetched = false;

  function fieldControl(bar, name) {
    const el = bar.querySelector('[id$="::FilterField::' + name + '"]');
    return el ? sap.ui.getCore().byId(el.id) : null;
  }

  function sliderControl(bar) {
    const el = bar.querySelector('[id$="--idCreditsRangeSlider"]');
    return el ? sap.ui.getCore().byId(el.id) : null;
  }

  function conditionKey(field) {
    const conditions = field.getConditions();
    return conditions.length ? conditions[0].values[0] : null;
  }

  function reapplyRange(bar) {
    if (!current) return;
    const slider = sliderControl(bar);
    if (!slider) return;
    if (slider.getMin() === current.min && slider.getMax() === current.max && slider.getStep() === STEP) return;
    slider.setMin(current.min);
    slider.setMax(current.max);
    slider.setStep(STEP);
    slider.setRange([current.min, current.max]);
  }

  function applyResult(bar, year, term, min, max) {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;
    current = { year, term, min, max };
    reapplyRange(bar);
  }

  function fetchRange(bar, year, term) {
    const key = year + "|" + term;
    if (fetchingKey === key) return;
    fetchingKey = key;
    const url =
      MINMAXUNITS_URL +
      "(Peryr='" + encodeURIComponent(year) + "',Perid='" + encodeURIComponent(term) + "')" +
      "?sap-client=500";
    fetch(url, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        fetchingKey = null;
        if (!data) return;
        applyResult(bar, year, term, Number(data.minCredits), Number(data.maxCredits));
      })
      .catch(() => {
        fetchingKey = null;
      });
  }

  function fetchFallback(bar) {
    if (fallbackFetched || current) return;
    fallbackFetched = true;
    const sinceYear = new Date().getFullYear() - 1;
    const url =
      MINMAXUNITS_URL + "?$filter=Peryr ge '" + sinceYear + "'&$top=1000&sap-client=500";
    fetch(url, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const rows = data && data.value;
        if (!rows || !rows.length || current) return;
        let min = Infinity;
        let max = -Infinity;
        rows.forEach((row) => {
          const rowMin = Number(row.minCredits);
          const rowMax = Number(row.maxCredits);
          if (Number.isFinite(rowMin)) min = Math.min(min, rowMin);
          if (Number.isFinite(rowMax)) max = Math.max(max, rowMax);
        });
        applyResult(bar, null, null, min, max);
      })
      .catch(() => {});
  }

  function check(bar) {
    reapplyRange(bar);

    const yearField = fieldControl(bar, "AcademicYear");
    const termField = fieldControl(bar, "AcademicPeriod");
    if (!yearField || !termField) return;
    const year = conditionKey(yearField);
    const term = conditionKey(termField);
    if (!year || !term) {
      fetchFallback(bar);
      return;
    }
    if (current && current.year === year && current.term === term) return;
    fetchRange(bar, year, term);
  }

  window.__tssregShared.onScheduleTick(check);
})();
