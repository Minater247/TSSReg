(() => {
  const odataLiteral = window.__tssregShared.odataLiteral;
  const PAGE_SELECTOR = '[id$="--mymodulesPage"]';
  const LIST_SUFFIX = /--mymodList$/;
  const SOC_ROUTE = "#YSchedule-view";
  const DAY_NAMES = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" };
  const DAY_ORDER = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
  const DAY_FROM_DOW = { 1: "MO", 2: "TU", 3: "WE", 4: "TH", 5: "FR", 6: "SA", 7: "SU" };

  function isCoursesRoute() {
    const hash = location.hash || "";
    return /\/MyModules$/.test(hash) && hash.indexOf("/Detail/") === -1;
  }

  function isDetailRoute() {
    const hash = location.hash || "";
    return hash.indexOf("#ZUSModule-display") === 0 && hash.indexOf("/Detail/") !== -1;
  }

  function pageControl() {
    const el = document.querySelector(PAGE_SELECTOR);
    const page = el ? sap.ui.getCore().byId(el.id) : null;
    return page && page.getContent ? page : null;
  }

  function listControl(page) {
    return page.getContent().filter((control) => LIST_SUFFIX.test(control.getId()))[0] || null;
  }

  function mountAfterList(page, list, control, anchorId) {
    const anchor = anchorId && sap.ui.getCore().byId(anchorId);
    const after = anchor && page.indexOfContent(anchor) !== -1 ? anchor : list;
    const target = page.indexOfContent(after) + 1;
    if (page.indexOfContent(control) !== target) page.insertContent(control, target);
  }

  function courseRoute(year, term, moduleId) {
    if (!year || !term) return SOC_ROUTE;
    return (
      SOC_ROUTE +
      "&/YUCSD_CON_MODULE(AcademicYear=" +
      odataLiteral(year) +
      ",AcademicPeriod=" +
      odataLiteral(term) +
      ",ModuleID=" +
      odataLiteral(moduleId) +
      ")?layout=TwoColumnsMidExpanded"
    );
  }

  function clockLabel(minutes) {
    const hours = Math.floor(minutes / 60);
    return (hours % 12 || 12) + ":" + String(minutes % 60).padStart(2, "0");
  }

  function meridiemLabel(minutes) {
    return clockLabel(minutes) + (minutes >= 720 ? " PM" : " AM");
  }

  function rangeLabel(startMin, endMin) {
    return clockLabel(startMin) + " – " + clockLabel(endMin);
  }

  function fullRangeLabel(startMin, endMin) {
    return meridiemLabel(startMin) + " – " + meridiemLabel(endMin);
  }

  function dayListLabel(scheduleDays) {
    return String(scheduleDays || "")
      .split("/")
      .filter(Boolean)
      .map((day) => DAY_NAMES[day] || day)
      .join("/");
  }

  function meetingLabel(meetings) {
    const groups = {};
    (meetings || []).forEach((meeting) => {
      const key = meeting.startMin + "-" + meeting.endMin;
      if (!groups[key]) groups[key] = { startMin: meeting.startMin, endMin: meeting.endMin, days: [] };
      groups[key].days.push(meeting.day);
    });
    return Object.keys(groups)
      .map((key) => groups[key])
      .sort((a, b) => a.startMin - b.startMin)
      .map((group) => {
        const days = DAY_ORDER.filter((day) => group.days.indexOf(day) !== -1)
          .map((day) => DAY_NAMES[day])
          .join("/");
        return [days, fullRangeLabel(group.startMin, group.endMin)].filter(Boolean).join(" ");
      })
      .join("\n");
  }

  window.__tssregShared.coursesPage = {
    DAY_NAMES,
    DAY_ORDER,
    DAY_FROM_DOW,
    isCoursesRoute,
    isDetailRoute,
    pageControl,
    listControl,
    mountAfterList,
    courseRoute,
    clockLabel,
    meridiemLabel,
    rangeLabel,
    fullRangeLabel,
    dayListLabel,
    meetingLabel,
  };
})();
