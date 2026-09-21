(() => {
  const BAND_ID = "tssreg-notice-band";
  const LIST_ID = "tssreg-notices";
  const COURSES_CARD = "card05";
  const APPT_ROOT = "/sap/opu/odata4/sap/ysb_appttime/srvd/sap/ysd_appttimes/0001/";
  const MY_COURSES = "#ZUSModule-display?TileType=MYMOD&sap-app-origin-hint=&/MyModules";
  const MY_HOLDS = "#YStudent-myHolds";
  const APPT_TIMES = "#YStudent-apptTimes";
  const GAUGE_SIZE = 72;
  const GAUGE_STROKE = 7;

  let modules = null;
  let data = null;
  let fetchStarted = false;
  let rendered = null;

  sap.ui.require(["sap/m/VBox", "sap/m/HBox", "sap/m/Text", "sap/m/Link", "sap/ui/core/HTML"], (VBox, HBox, Text, Link, HTML) => {
    modules = { VBox, HBox, Text, Link, HTML };
  });

  function isOverviewRoute() {
    return /^#YStudent-Overview(?:[?&]|$)/.test(location.hash || "");
  }

  function ensureData() {
    if (fetchStarted) return;
    fetchStarted = true;
    const get = (name) =>
      fetch(APPT_ROOT + name, { credentials: "include", headers: { Accept: "application/json" } })
        .then((response) => (response.ok ? response.json() : null))
        .then((json) => (json && json.value) || []);
    Promise.all([get("apptPeriods"), get("apptTimes"), get("maxUnits")])
      .then(([periods, times, maxUnits]) => {
        data = { period: periods[0] || null, times, maxUnits };
      })
      .catch(() => {
        data = { period: null, times: [], maxUnits: [] };
      });
  }

  function bookedModules() {
    const cardEl = document.querySelector('[id*="--' + COURSES_CARD + 'Original"]');
    const listEl = cardEl && cardEl.querySelector(".sapMList");
    const list = listEl && sap.ui.getCore().byId(listEl.id);
    if (!list) return [];
    const info = list.getBindingInfo("items");
    return list
      .getItems()
      .map((item) => {
        const context = item.getBindingContext(info && info.model);
        return context ? context.getObject() : null;
      })
      .filter(Boolean);
  }

  function enrolledUnits() {
    return bookedModules().reduce((sum, row) => {
      const credits = parseFloat(row.Credits);
      return sum + (isNaN(credits) ? 0 : credits);
    }, 0);
  }

  function applicableWindows() {
    const period = data.period;
    if (!period) return [];
    return data.times.filter(
      (row) => row.calendarId === period.calendarId && (row.bkgWindow === period.bkgWindow || row.bkgWindow === "")
    );
  }

  function maxUnitsFor(timelimit) {
    const period = data.period;
    if (!period) return null;
    const row = data.maxUnits.filter(
      (entry) =>
        entry.ProgType === period.programType && entry.Perid === period.academicSession && entry.Timelimit === timelimit
    )[0];
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
    const period = data.period;

    if (period && period.holdLevel) {
      notices.push({
        kind: "blocked",
        text: "A hold is blocking your enrollment",
        meta: [],
        actionLabel: "View holds",
        actionHref: MY_HOLDS,
      });
    }

    const windows = applicableWindows();
    const open = windows
      .filter((row) => row.timelimitStatus === "A")
      .sort((a, b) => String(a.endTimestamp).localeCompare(String(b.endTimestamp)))[0];

    if (open) {
      const meta = [];
      const cap = maxUnitsFor(open.timelimit);
      if (cap != null) meta.push(enrolledUnits() + " of " + cap + " units");
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

    const next = windows
      .filter((row) => row.timelimitStatus === "U")
      .sort((a, b) => String(a.beginTimestamp).localeCompare(String(b.beginTimestamp)))[0];

    if (next) {
      const meta = [];
      const cap = maxUnitsFor(next.timelimit);
      if (cap != null) meta.push("Up to " + cap + " units");
      notices.push({
        kind: "info",
        text: "Your " + (next.timelimit_Text || "enrollment") + " enrollment hasn't opened yet",
        meta,
        gauge: {
          value: countdownTo(next.beginTimestamp) || "—",
          fraction: null,
          href: APPT_TIMES,
          title: "Opens " + formatInstant(next.beginTimestamp),
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
    if (!isOverviewRoute() || !modules) return;
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

  window.__tssregShared.onUiUpdated(apply);
})();
