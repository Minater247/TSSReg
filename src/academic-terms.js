(() => {
  const shared = window.__tssregShared;
  const APPT_ROOT = "/sap/opu/odata4/sap/ysb_appttime/srvd/sap/ysd_appttimes/0001/";
  const BOOKINGS_URL = "/sap/opu/odata/ITUS/PR_MY_MODULES_V2_SRV/ModuleHeaderSet";
  const CAMPUS_MONTH = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "numeric",
  });
  let appointments;
  let appointmentsLoadedAt = 0;
  let bookings;

  /** Identifies an academic year and session across TSS services. Returns an empty key for an incomplete pair. */
  function key(year, term) {
    const session = sessionCode(term);
    return year && session ? String(year) + "|" + session : "";
  }

  function sessionCode(term) {
    return String(term ?? "").trim().replace(/^0+(?=\d)/, "");
  }

  function courseTerm(row) {
    return { year: row.AcademicYear, term: row.AcademicSession, name: row.AcademicSessionText };
  }

  function appointmentTerm(period) {
    return { year: period.academicYear, term: period.academicSession, name: period.academicSession_Text };
  }

  async function appointmentRows(path) {
    const data = await shared.fetchJson(path);
    if (!data) return [];
    const rows = data.value || [];
    const next = data["@odata.nextLink"];
    return next ? rows.concat(await appointmentRows(next)) : rows;
  }

  function loadAppointments() {
    if (!appointments || Date.now() - appointmentsLoadedAt >= 60000) {
      appointmentsLoadedAt = Date.now();
      const get = (name) => appointmentRows(APPT_ROOT + name).catch(() => []);
      appointments = Promise.all([get("apptPeriods"), get("apptTimes")]).then(([periods, times]) => ({ periods, times }));
    }
    return appointments;
  }

  function loadUnitCaps() {
    return appointmentRows(APPT_ROOT + "maxUnits").catch(() => []);
  }

  async function bookingRows(url) {
    const data = await shared.fetchJson(url);
    if (!data || !data.d) return null;
    const rows = data.d.results || [];
    if (!data.d.__next) return rows;
    const rest = await bookingRows(data.d.__next);
    return rest && rows.concat(rest);
  }

  function loadBookings() {
    if (bookings) return bookings;
    const query = "&$format=json&$select=AcademicYear,AcademicSession,Credits";
    bookings = bookingRows(BOOKINGS_URL + "?" + shared.CLIENT + query).catch(() => null);
    const pending = bookings;
    pending.then(() => {
      if (bookings === pending) bookings = null;
    });
    return bookings;
  }

  function coursesFor(rows, scope) {
    const selected = scope && key(scope.year, scope.term);
    return selected ? rows.filter((row) => key(row.AcademicYear, row.AcademicSession) === selected) : [];
  }

  function appliesTo(pass, period) {
    return (
      pass.calendarId === period.calendarId &&
      (pass.bkgWindow === period.bkgWindow || pass.bkgWindow === "") &&
      (!pass.academicYear || String(pass.academicYear) === String(period.academicYear)) &&
      (!pass.academicSession || sessionCode(pass.academicSession) === sessionCode(period.academicSession))
    );
  }

  /** Returns booking windows that can be attributed to a single academic session in the supplied periods. */
  function windowsFor(period, { periods, times }) {
    const scope = key(period.academicYear, period.academicSession);
    return times.filter((pass) => appliesTo(pass, period) && periods.every((other) =>
      other === period || !appliesTo(pass, other) || key(other.academicYear, other.academicSession) === scope
    ));
  }

  function isOpen(pass, now = Date.now()) {
    const begin = Date.parse(pass.beginTimestamp);
    const end = Date.parse(pass.endTimestamp);
    return pass.timelimitStatus === "A" && (!Number.isFinite(begin) || begin <= now) && (!Number.isFinite(end) || now < end);
  }

  function termName(scope, catalog) {
    const match = catalog.terms.find((item) => key(scope.year, item.key) === key(scope.year, scope.term));
    return (match && match.text !== match.key && match.text) || scope.name || "Session " + scope.term;
  }

  /* TSS uses the starting year for the academic year. Season names from the
     catalog put Winter and Spring in the following calendar year. */
  function termMonth(scope, catalog) {
    const name = termName(scope, catalog);
    const year = Number(scope.year);
    if (/fall/i.test(name)) return year * 12 + 8;
    if (/winter/i.test(name)) return year * 12 + 12;
    if (/spring/i.test(name)) return year * 12 + 15;
    if (/summer/i.test(name)) return year * 12 + (/\b(?:II|2)\b/i.test(name) ? 19 : 18);
    return null;
  }

  function label(scope, catalog) {
    const name = termName(scope, catalog);
    const month = termMonth(scope, catalog);
    return name + " " + (month == null ? scope.year : Math.floor(month / 12));
  }

  function campusMonth(now) {
    const date = CAMPUS_MONTH.formatToParts(now);
    return Number(date.find((part) => part.type === "year").value) * 12 +
      Number(date.find((part) => part.type === "month").value) - 1;
  }

  function currentTerm(catalog, now = Date.now()) {
    const month = campusMonth(now);
    const year = Math.floor((month - 8) / 12);
    const season = month % 12 >= 8 ? /fall/i : month % 12 < 3 ? /winter/i : month % 12 < 6 ? /spring/i : /summer/i;
    const found = catalog.terms.filter((entry) => season.test(entry.text))
      .map((entry) => ({ year: String(year), term: entry.key }))
      .filter((scope) => termMonth(scope, catalog) <= month)
      .sort((a, b) => compare(b, a, catalog))[0];
    return found || null;
  }

  function compare(a, b, catalog) {
    const first = termMonth(a, catalog) ?? (Number(a.year) * 12 + 8);
    const second = termMonth(b, catalog) ?? (Number(b.year) * 12 + 8);
    return first - second ||
      String(a.term).localeCompare(String(b.term), "en", { numeric: true });
  }

  /** Returns the period for the nearest upcoming term with an open booking window, or the latest active period. */
  function openPeriod(data, catalog, now = Date.now()) {
    const month = campusMonth(now);
    const active = data.periods.filter((period) => key(period.academicYear, period.academicSession) &&
      windowsFor(period, data).some((pass) => isOpen(pass, now)));
    const current = currentTerm(catalog, now);
    const upcoming = active.filter((period) => {
      const scope = appointmentTerm(period);
      const start = termMonth(scope, catalog);
      return start == null ? current && compare(scope, current, catalog) > 0 : start > month;
    });
    return upcoming.sort((a, b) => compare(appointmentTerm(a), appointmentTerm(b), catalog))[0] ||
      active.sort((a, b) => compare(appointmentTerm(b), appointmentTerm(a), catalog))[0] || null;
  }

  shared.academicTerms = {
    key, label, compare, courseTerm, appointmentTerm, currentTerm, openPeriod, windowsFor, isOpen, coursesFor,
    loadAppointments, loadUnitCaps, loadBookings,
  };
})();
