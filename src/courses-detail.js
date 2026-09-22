(() => {
  const coursesPage = window.__tssregShared.coursesPage;
  const { DAY_FROM_DOW, fullRangeLabel, meetingLabel } = coursesPage;
  const MODEL = "detailView";
  const ROOM_LABEL = "Location / Room";
  const TIMES_LABEL = "Meeting Times";
  const ROOM_PREFIX = /^Room\s*\S*\s*-?\s*/i;
  const SPAN_SELECTOR = "[class*='sapUiRespGridSpan']";
  const LABEL_SELECTOR = ".sapMLabel .sapMLabelTextWrapper > bdi";
  const DATE_FORMAT = { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" };

  function minutesOf(time) {
    return time && typeof time.ms === "number" ? Math.round(time.ms / 60000) : null;
  }

  function roomLabel(short, stext) {
    if (!short) return "";
    const suffix = String(stext || "").replace(ROOM_PREFIX, "").trim();
    return suffix ? short + " - " + suffix : short;
  }

  function occurrenceRows(schedule) {
    return (schedule && schedule.results) || [];
  }

  function isRecurring(row) {
    return !String(row.MeetingTypeText || row.MeetingType || "").trim();
  }

  function weeklyMeetings(rows) {
    const seen = {};
    const out = [];
    rows.filter(isRecurring).forEach((row) => {
      const day = DAY_FROM_DOW[String(row.DayNumber)];
      const startMin = minutesOf(row.StartTime);
      const endMin = minutesOf(row.EndTime);
      if (!day || startMin == null || endMin == null || endMin <= startMin) return;
      const key = day + "|" + startMin + "|" + endMin;
      if (seen[key]) return;
      seen[key] = true;
      out.push({ day, startMin, endMin });
    });
    return out;
  }

  function sessionDate(value) {
    const date = value instanceof Date ? value : value && typeof value.ms === "number" ? new Date(value.ms) : null;
    return date && !isNaN(date.getTime()) ? date : null;
  }

  function specialSessions(rows) {
    const seen = {};
    const out = [];
    rows.filter((row) => !isRecurring(row)).forEach((row) => {
      const startMin = minutesOf(row.StartTime);
      const endMin = minutesOf(row.EndTime);
      const date = sessionDate(row.EventDate);
      if (startMin == null || endMin == null || !date) return;
      const name = String(row.MeetingTypeText || row.MeetingType).trim();
      const key = name + "|" + date.getTime() + "|" + startMin;
      if (seen[key]) return;
      seen[key] = true;
      out.push({ name, date, startMin, endMin });
    });
    return out.sort((a, b) => a.date - b.date);
  }

  function scheduleLabel(schedule) {
    const rows = occurrenceRows(schedule);
    const weekly = meetingLabel(weeklyMeetings(rows));
    const special = specialSessions(rows).map(
      (session) =>
        session.name +
        " " +
        session.date.toLocaleDateString("en-US", DATE_FORMAT) +
        " " +
        fullRangeLabel(session.startMin, session.endMin)
    );
    return [weekly].concat(special).filter(Boolean).join("\n");
  }

  function labelCells(text) {
    const out = [];
    document.querySelectorAll(LABEL_SELECTOR).forEach((bdi) => {
      if (bdi.textContent.trim() !== text) return;
      const cell = bdi.closest(SPAN_SELECTOR);
      const value = cell && cell.nextElementSibling;
      if (value) out.push(value);
    });
    return out;
  }

  function controlIn(element) {
    const core = sap.ui.getCore();
    const candidates = [element].concat([].slice.call(element.querySelectorAll("[id]")));
    for (let i = 0; i < candidates.length; i += 1) {
      const found = candidates[i].id && core.byId(candidates[i].id);
      if (found && found.getMetadata) return found;
    }
    return null;
  }

  function applyRoom(control) {
    if (control.__tssregRoom || !control.bindText) return;
    control.__tssregRoom = true;
    const original = control.getText();
    control.bindText({
      parts: [{ path: MODEL + ">RoomShort" }, { path: MODEL + ">RoomStext" }],
      formatter: (short, stext) => roomLabel(short, stext) || original,
    });
  }

  function applyTimes(control) {
    if (control.__tssregTimes || !control.getItems) return;
    const items = control.getItems();
    const first = items[0];
    if (!first || !first.bindText) return;
    const context = first.getBindingContext(MODEL);
    const event = context && context.getObject();
    if (!event || !scheduleLabel(event.EventSchedule)) return;
    control.__tssregTimes = true;
    const original = first.getText();
    first.setWrapping(true);
    first.bindText({
      path: MODEL + ">EventSchedule",
      formatter: (schedule) => scheduleLabel(schedule) || original,
    });
    items.slice(1).forEach((item) => {
      if (item.setVisible && item.getMetadata().getName() === "sap.m.Text") item.setVisible(false);
    });
  }

  function apply() {
    if (!coursesPage.isDetailRoute() || !window.sap || !sap.ui) return;
    labelCells(ROOM_LABEL).forEach((cell) => {
      const control = controlIn(cell);
      if (control) applyRoom(control);
    });
    labelCells(TIMES_LABEL).forEach((cell) => {
      const control = controlIn(cell);
      if (control) applyTimes(control);
    });
  }

  window.__tssregShared.courseDetail = {
    roomLabel,
    weeklyMeetings,
    specialSessions,
    scheduleLabel,
  };

  window.__tssregShared.onUiUpdated(apply);
})();
