(() => {
  const shared = window.__tssregShared;
  const terms = shared.academicTerms;
  const BAND_ID = "tssreg-notice-band";
  const LIST_ID = "tssreg-notices";
  const MY_COURSES = "#ZUSModule-display?TileType=MYMOD&sap-app-origin-hint=&/MyModules";
  const MY_HOLDS = "#YStudent-myHolds";
  const APPT_TIMES = "#YStudent-apptTimes";
  const GAUGE_SIZE = 72;
  const GAUGE_STROKE = 7;

  let modules = null;
  let data = null;
  let request = null;
  let rendered = null;

  window.__tssregShared.whenSapReady(() => {
    sap.ui.require(["sap/m/VBox", "sap/m/HBox", "sap/m/Text", "sap/m/Link", "sap/ui/core/HTML"], (VBox, HBox, Text, Link, HTML) => {
      modules = { VBox, HBox, Text, Link, HTML };
    });
  });

  function ensureData() {
    if (request) return;
    request = Promise.all([terms.loadAppointments(), terms.loadUnitCaps(), shared.catalog.loadTerms(), terms.loadBookings()]);
    const pending = request;
    pending.then(([appointments, maxUnits, catalog, bookings]) => {
      if (request !== pending) return;
      data = { appointments, maxUnits, catalog, bookings };
      apply();
    });
  }

  function enrolledUnits(bookings, scope) {
    return terms.coursesFor(bookings, scope).reduce((sum, row) => {
      const credits = parseFloat(row.Credits);
      return sum + (isNaN(credits) ? 0 : credits);
    }, 0);
  }

  function maxUnitsFor(period, timelimit) {
    const row = data.maxUnits.find(
      (entry) =>
        entry.ProgType === period.programType && entry.Timelimit === timelimit &&
        terms.key(period.academicYear, entry.Perid) === terms.key(period.academicYear, period.academicSession) &&
        (!entry.Peryr || String(entry.Peryr) === String(period.academicYear))
    );
    return row ? row.MaxUnits : null;
  }

  function formatInstant(iso) {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function countdownTo(iso) {
    const target = new Date(iso).getTime();
    if (isNaN(target)) return "";
    const ms = target - Date.now();
    if (ms <= 0) return "";
    const totalMinutes = Math.floor(ms / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return days + "d " + hours + "h";
    if (hours > 0) return hours + "h " + minutes + "m";
    return minutes + "m";
  }

  function remainingFraction(beginIso, endIso) {
    const begin = new Date(beginIso).getTime();
    const end = new Date(endIso).getTime();
    if (isNaN(begin) || isNaN(end) || end <= begin) return null;
    return Math.max(0, Math.min(1, (end - Date.now()) / (end - begin)));
  }

  function computeNotices() {
    const notices = [];
    const { appointments, catalog, bookings } = data;
    const now = Date.now();
    const period = terms.openPeriod(appointments, catalog, now) ||
      (appointments.periods.length === 1 ? appointments.periods[0] : null);

    if (period ? period.holdLevel : appointments.periods.some((row) => row.holdLevel)) {
      notices.push({
        kind: "blocked",
        text: "A hold is blocking your enrollment",
        meta: [],
        actionLabel: "View holds",
        actionHref: MY_HOLDS,
      });
    }

    const open = period && terms.windowsFor(period, appointments)
      .filter((row) => terms.isOpen(row, now))
      .sort((a, b) => Date.parse(a.endTimestamp) - Date.parse(b.endTimestamp))[0];

    if (open) {
      const meta = [];
      const cap = maxUnitsFor(period, open.timelimit);
      const scope = terms.appointmentTerm(period);
      if (bookings && terms.key(scope.year, scope.term)) meta.push(enrolledUnits(bookings, scope) + " units enrolled");
      if (cap != null) meta.push(cap + " unit cap");
      if (open.waitlists) meta.push("Waitlists " + String(open.waitlists).toLowerCase());
      notices.push({
        kind: "open",
        text: "Your " + (open.timelimit_Text || "enrollment") + " enrollment is open",
        meta,
        gauge: {
          value: countdownTo(open.endTimestamp) || "—",
          fraction: remainingFraction(open.beginTimestamp, open.endTimestamp),
          href: APPT_TIMES,
          title: "Closes " + formatInstant(open.endTimestamp),
        },
        actionLabel: "Open",
        actionHref: MY_COURSES,
      });
      return notices;
    }

    const next = appointments.periods.flatMap((period) => terms.windowsFor(period, appointments)
      .filter((pass) => pass.timelimitStatus === "U" && Date.parse(pass.beginTimestamp) > now)
      .map((pass) => ({ period, pass })))
      .sort((a, b) => Date.parse(a.pass.beginTimestamp) - Date.parse(b.pass.beginTimestamp))[0];

    if (next) {
      const { period, pass } = next;
      const meta = [];
      const cap = maxUnitsFor(period, pass.timelimit);
      if (cap != null) meta.push(cap + " unit cap");
      notices.push({
        kind: "info",
        text: "Your " + (pass.timelimit_Text || "enrollment") + " enrollment hasn't opened yet",
        meta,
        gauge: {
          value: countdownTo(pass.beginTimestamp) || "—",
          fraction: null,
          href: APPT_TIMES,
          title: "Opens " + formatInstant(pass.beginTimestamp),
        },
        actionLabel: "Details",
        actionHref: APPT_TIMES,
      });
    }
    return notices;
  }

  function escapeHtml(value) {
    return String(value).replace(
      /[&<>"']/g,
      (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]
    );
  }

  function gaugeHtml(gauge) {
    const mid = GAUGE_SIZE / 2;
    const radius = (GAUGE_SIZE - GAUGE_STROKE) / 2;
    const circumference = 2 * Math.PI * radius;
    const ring = (opacity, dashoffset) =>
      '<circle cx="' +
      mid +
      '" cy="' +
      mid +
      '" r="' +
      radius +
      '" fill="none" stroke="currentColor" stroke-width="' +
      GAUGE_STROKE +
      '" opacity="' +
      opacity +
      '"' +
      (dashoffset == null
        ? ""
        : ' stroke-linecap="round" stroke-dasharray="' +
          circumference.toFixed(1) +
          '" stroke-dashoffset="' +
          dashoffset.toFixed(1) +
          '" transform="rotate(-90 ' +
          mid +
          " " +
          mid +
          ')"') +
      "></circle>";

    const svg =
      '<svg viewBox="0 0 ' +
      GAUGE_SIZE +
      " " +
      GAUGE_SIZE +
      '" width="' +
      GAUGE_SIZE +
      '" height="' +
      GAUGE_SIZE +
      '">' +
      ring(0.2, null) +
      (gauge.fraction == null ? "" : ring(1, circumference * (1 - gauge.fraction))) +
      '<text x="' +
      mid +
      '" y="' +
      mid +
      '" text-anchor="middle" dominant-baseline="central" fill="currentColor" font-size="14" font-weight="600">' +
      escapeHtml(gauge.value) +
      "</text></svg>";

    return (
      '<a class="tssreg-notice-gauge" href="' +
      escapeHtml(gauge.href) +
      '" title="' +
      escapeHtml(gauge.title) +
      '">' +
      svg +
      "</a>"
    );
  }

  function noticeBox(notice) {
    const items = [];
    if (notice.gauge) items.push(new modules.HTML({ content: gaugeHtml(notice.gauge) }));

    const main = new modules.Text({ text: notice.text });
    main.addStyleClass("tssreg-notice-main");
    const textItems = [main];
    if (notice.meta.length) {
      const metaRow = new modules.HBox({ renderType: "Bare", items: notice.meta.map((entry) => new modules.Text({ text: entry })) });
      metaRow.addStyleClass("tssreg-notice-metarow");
      textItems.push(metaRow);
    }
    const textBox = new modules.VBox({ renderType: "Bare", items: textItems });
    textBox.addStyleClass("tssreg-notice-text");
    items.push(textBox);

    if (notice.actionLabel && notice.actionHref) {
      const action = new modules.Link({ text: notice.actionLabel, href: notice.actionHref });
      action.addStyleClass("tssreg-notice-action");
      items.push(action);
    }

    const box = new modules.HBox({ renderType: "Bare", alignItems: "Center", items });
    box.addStyleClass("tssreg-notice");
    box.addStyleClass("tssreg-notice-" + notice.kind);
    return box;
  }

  function buildList(notices) {
    const list = new modules.VBox(LIST_ID, { renderType: "Bare", items: notices.map(noticeBox) });
    list.addStyleClass("tssreg-notice-list");
    return list;
  }

  function mountBand(inner) {
    let band = document.getElementById(BAND_ID);
    if (!band) {
      band = document.createElement("div");
      band.id = BAND_ID;
      band.className = "tssreg-notice-band";
    }
    if (band.parentElement !== inner) inner.insertBefore(band, inner.firstChild);
    return band;
  }

  function signatureOf(notices) {
    return JSON.stringify(
      notices.map((notice) => [
        notice.kind,
        notice.text,
        notice.meta,
        notice.actionLabel,
        notice.actionHref,
        notice.gauge ? notice.gauge.value : null,
        notice.gauge ? notice.gauge.title : null,
      ])
    );
  }

  function apply() {
    if (!shared.isOverviewRoute()) {
      request = null;
      data = null;
      return;
    }
    if (!modules) return;
    ensureData();
    if (!data) return;

    const inner = document.querySelector(".sapUshellEasyScanLayoutInner");
    if (!inner) return;

    const notices = computeNotices();
    const signature = signatureOf(notices);
    if (signature === rendered && document.getElementById(LIST_ID)) return;

    if (signature !== rendered) {
      const stale = sap.ui.getCore().byId(LIST_ID);
      if (stale) stale.destroy();
      rendered = signature;
    }

    if (!notices.length) {
      const band = document.getElementById(BAND_ID);
      if (band) band.remove();
      return;
    }

    const list = sap.ui.getCore().byId(LIST_ID) || buildList(notices);
    list.placeAt(mountBand(inner));
  }

  shared.onUiUpdated(apply);
})();
