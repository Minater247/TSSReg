(() => {
  const shared = window.__tssregShared;
  const MODULE_KEY = /YUCSD_CON_MODULE\(AcademicYear='([^']+)',AcademicPeriod='([^']+)'/;
  const SCHEDULE_TEXT = "[id*='--socEventSchedText-']";
  const PLACE = /@\s*(.+)$/;
  const halls = {};

  function scope() {
    const match = MODULE_KEY.exec(location.hash || "");
    return match ? { year: match[1], term: match[2], key: match[1] + "|" + match[2] } : null;
  }

  function known(place) {
    const entry = halls[place.key];
    return entry && entry.map ? entry.map : null;
  }

  function request(place) {
    if (halls[place.key]) return;
    const catalog = shared.catalog;
    if (!catalog) return;
    halls[place.key] = { map: null };
    catalog
      .loadBuildings(place.year, place.term)
      .then((map) => {
        halls[place.key].map = map;
        apply();
      })
      .catch(() => {});
  }

  function placeLabel(text, map) {
    const parts = shared.catalog.roomParts(text, map);
    return parts && parts.coded ? parts.code + " " + parts.number : String(text || "").trim();
  }

  function scheduleWithCodes(text) {
    const place = scope();
    const map = (place && known(place)) || {};
    return String(text || "")
      .split("\n")
      .map((line) => {
        const match = PLACE.exec(line);
        return match ? line.slice(0, match.index) + "@ " + placeLabel(match[1], map) : line;
      })
      .join("\n");
  }

  function applyCodes(control) {
    if (control.__tssregRooms || !control.bindText) return;
    const info = control.getBindingInfo("text");
    const part = info && info.parts && info.parts[0];
    if (!part || !part.path) return;
    control.__tssregRooms = true;
    control.bindText({
      path: (part.model ? part.model + ">" : "") + part.path,
      formatter: scheduleWithCodes,
    });
  }

  function apply() {
    const place = scope();
    if (!place) return;
    if (!known(place)) return void request(place);
    if (!window.sap || !sap.ui) return;
    document.querySelectorAll(SCHEDULE_TEXT).forEach((element) => {
      const control = sap.ui.getCore().byId(element.id);
      if (control) applyCodes(control);
    });
  }

  shared.socRooms = { scheduleWithCodes };

  shared.onUiUpdated(apply);
})();
