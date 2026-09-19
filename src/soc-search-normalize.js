(() => {
  const SEARCH_FIELD_MARKER = "BasicSearchField";

  function onRoute() {
    return /^#YSchedule-view(?:[?&]|$)/.test(location.hash || "");
  }

  function isSearchField(el) {
    return !!(el && el.id && String(el.id).indexOf(SEARCH_FIELD_MARKER) !== -1);
  }

  function normalizeCourseCode(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    const m = /^([A-Za-z]{2,4})\s*-?\s*(\d{1,3})([A-Za-z]{0,2})$/.exec(s);
    if (!m) return "";
    let num = m[2];
    while (num.length < 3) num = "0" + num;
    return m[1].toUpperCase() + "-" + num + (m[3] || "").toUpperCase();
  }

  function maybeNormalize(el) {
    if (!onRoute() || !isSearchField(el)) return;
    const normalized = normalizeCourseCode(el.value);
    if (!normalized || normalized === el.value) return;
    el.value = normalized;
  }

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Enter") maybeNormalize(e.target);
    },
    true
  );

  document.addEventListener(
    "search",
    (e) => {
      maybeNormalize(e.target);
    },
    true
  );
})();
