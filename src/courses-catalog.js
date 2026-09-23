(() => {
  const shared = window.__tssregShared;
  const { chunk, serviceUrl, odataLiteral: literal, CLIENT, ROW_LIMIT, ID_CHUNK_SIZE } = shared;
  const RESULT_LIMIT = 200;
  const TIME_MIN = 360;
  const TIME_MAX = 1320;
  const UNITS_MIN = 0;
  const UNITS_MAX = 20;
  const DAY_FROM_DOW = window.__tssregShared.coursesPage.DAY_FROM_DOW;
  const DAY_ORDER = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
  const TYPE_ORDER = { LE: 0, SE: 1, DI: 2, LA: 3, FI: 4 };

  const termsCache = {};
  const creditRangeCache = {};
  const valueHelpCache = {};
  const instructorCache = {};

  function getRows(path) {
    return fetch(serviceUrl(path), { headers: { Accept: "application/json" } })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((data) => (data && data.value) || []);
  }

  function byText(a, b) {
    return a.text.localeCompare(b.text);
  }

  function normalizeCode(raw) {
    const match = /^([A-Za-z]{2,4})\s*-?\s*(\d{1,3})([A-Za-z]{0,2})$/.exec(String(raw || "").trim());
    if (!match) return "";
    return match[1].toUpperCase() + "-" + match[2].padStart(3, "0") + (match[3] || "").toUpperCase();
  }

  function normalizeSectionId(raw) {
    const text = String(raw || "").trim();
    return /^\d+$/.test(text) ? "E " + text.padStart(8, "0") : text.toUpperCase();
  }

  function toMinutes(value) {
    const text = String(value || "");
    const iso = /^PT(\d+)H(\d+)M/.exec(text);
    if (iso) return Number(iso[1]) * 60 + Number(iso[2]);
    const clock = /^(\d{1,2}):(\d{2})/.exec(text);
    return clock ? Number(clock[1]) * 60 + Number(clock[2]) : null;
  }

  function roomFrom(schedule) {
    const match = /@\s*([^\n]+)/.exec(String(schedule || ""));
    return match ? match[1].trim() : "";
  }

  function roomParts(text, buildings) {
    const raw = String(text || "").trim();
    if (!raw) return null;
    const match = /^(.*?)\s+Room\s+(.+)$/i.exec(raw);
    if (!match) return { code: raw, number: "", coded: false };
    const name = match[1].trim();
    const code = buildings && buildings[name];
    return { code: code || name, number: match[2].trim(), coded: !!code };
  }

  function packageLabel(text) {
    const match = /\(([^)]+)\)\s*$/.exec(String(text || ""));
    return match ? match[1] : "";
  }

  function pickDefault(rows, key) {
    return (rows.filter((row) => row.DefaultValue === "X")[0] || rows[0] || {})[key] || "";
  }

  function loadTerms() {
    if (termsCache.promise) return termsCache.promise;
    termsCache.promise = Promise.all([
      getRows("YUCSD_I_PERYRT_SOC?" + CLIENT + "&$top=20").catch(() => []),
      getRows("YUCSD_I_PERIDT_SOC?" + CLIENT + "&$top=20").catch(() => []),
    ]).then(([years, terms]) => ({
      years: years.filter((row) => row.Peryr).map((row) => ({ key: row.Peryr, text: row.Peryt || row.Peryr })),
      terms: terms.filter((row) => row.Perid).map((row) => ({ key: row.Perid, text: row.Perit || row.Perid })),
      defaultYear: pickDefault(years, "Peryr"),
      defaultTerm: pickDefault(terms, "Perid"),
    }));
    return termsCache.promise;
  }

  function grouped(entity, scope, fields) {
    const apply = (scope ? "filter(" + scope + ")/" : "") + "groupby((" + fields.join(",") + "))";
    return getRows(entity + "?" + CLIENT + "&$top=" + ROW_LIMIT + "&$apply=" + encodeURIComponent(apply));
  }

  function moduleScope(year, term) {
    return "AcademicYear eq " + literal(year) + " and AcademicPeriod eq " + literal(term);
  }

  function sessionScope(year, term) {
    return "AcYear eq " + literal(year) + " and AcSess eq " + literal(term);
  }

  function options(rows, keyField, textField) {
    const seen = {};
    const out = [];
    rows.forEach((row) => {
      const key = row[keyField];
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push({ key: String(key), text: String(row[textField] || key) });
    });
    return out.sort(byText);
  }

  function loadValueHelps(year, term) {
    const cacheKey = year + "|" + term;
    if (valueHelpCache[cacheKey]) return valueHelpCache[cacheKey];
    valueHelpCache[cacheKey] = Promise.all([
      grouped("YUCSD_CON_MODULE", moduleScope(year, term), ["DepartmentAbbr", "DepartmentText"]).catch(() => []),
      grouped("YUCSD_CON_MODULE_BLDG", sessionScope(year, term), ["BuildingID", "BuildingText"]).catch(() => []),
      grouped("YUCSD_CON_MODULE_MODALITY", sessionScope(year, term), ["DeliveryMode", "DeliveryModeText"]).catch(() => []),
    ]).then(([departments, buildings, modalities]) => ({
      departments: options(departments, "DepartmentAbbr", "DepartmentText"),
      buildings: options(buildings, "BuildingText", "BuildingText"),
      modalities: options(modalities, "DeliveryModeText", "DeliveryModeText"),
    }));
    return valueHelpCache[cacheKey];
  }

  function loadCreditRange(year, term) {
    const cacheKey = year + "|" + term;
    if (creditRangeCache[cacheKey]) return creditRangeCache[cacheKey];
    const path =
      "YUCSD_I_MINMAXUNITS(Peryr=" + literal(year) + ",Perid=" + literal(term) + ")?" + CLIENT;
    creditRangeCache[cacheKey] = fetch(serviceUrl(path), { headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const min = Number(data && data.minCredits);
        const max = Number(data && data.maxCredits);
        if (!isFinite(min) || !isFinite(max) || max <= min) return { min: UNITS_MIN, max: UNITS_MAX };
        return { min, max };
      })
      .catch(() => ({ min: UNITS_MIN, max: UNITS_MAX }));
    return creditRangeCache[cacheKey];
  }

  function loadInstructors(year, term) {
    const cacheKey = year + "|" + term;
    if (instructorCache[cacheKey]) return instructorCache[cacheKey];
    instructorCache[cacheKey] = grouped("YUCSD_CON_MODULE_INSTR", sessionScope(year, term), ["InstructorName"])
      .then((rows) => options(rows, "InstructorName", "InstructorName"))
      .catch(() => []);
    return instructorCache[cacheKey];
  }

  function picked(map) {
    return Object.keys(map || {}).filter((key) => map[key]);
  }

  function anyOf(field, values) {
    if (!values.length) return "";
    return "(" + values.map((value) => field + " eq " + literal(value)).join(" or ") + ")";
  }

  function searchText(filters) {
    return normalizeCode(filters.q) || String(filters.q || "").replace(/"/g, " ").trim();
  }

  function searchPath(filters, year, term) {
    const clauses = [];
    if (year) clauses.push("AcademicYear eq " + literal(year));
    if (term) clauses.push("AcademicPeriod eq " + literal(term));
    if (filters.dept) clauses.push("DepartmentAbbr eq " + literal(String(filters.dept).toUpperCase()));
    if (filters.instructor) clauses.push("Instructor eq " + literal(filters.instructor));
    if (filters.modality) clauses.push("DeliveryMode eq " + literal(filters.modality));
    if (filters.sectionId) clauses.push("EventID eq " + literal(normalizeSectionId(filters.sectionId)));
    if (filters.wishlisted) clauses.push("wishlisted eq " + literal(filters.wishlisted));
    [anyOf("AcademicLevel2", picked(filters.levels)), anyOf("Building", picked(filters.buildings))]
      .filter(Boolean)
      .forEach((clause) => clauses.push(clause));

    let path = "YUCSD_CON_MODULE?" + CLIENT + "&$top=" + RESULT_LIMIT;
    if (clauses.length) path += "&$filter=" + encodeURIComponent(clauses.join(" and "));
    const text = searchText(filters);
    if (text) path += "&$search=" + encodeURIComponent('"' + text + '"');
    return path;
  }

  function toCourse(row) {
    return {
      moduleId: String(row.ModuleID),
      code: row.CourseAbbr || "",
      title: row.CourseTitle || "",
      credits: row.CreditsDisplay || "",
      maxCredits: row.MaximumCredits,
      department: row.DepartmentText || "",
      level: row.AcademicLevel || "",
    };
  }

  function search(filters, year, term) {
    const code = normalizeCode(filters.q);
    return getRows(searchPath(filters, year, term)).then((rows) =>
      rows
        .filter((row) => row.ModuleID && row.CourseAbbr)
        .filter((row) => !code || String(row.CourseAbbr).toUpperCase() === code)
        .map(toCourse)
    );
  }

  function byMeeting(a, b) {
    const dayDelta = DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
    return dayDelta || a.startMin - b.startMin;
  }

  function byType(a, b) {
    const left = TYPE_ORDER[a.methodCode];
    const right = TYPE_ORDER[b.methodCode];
    return (left === undefined ? 9 : left) - (right === undefined ? 9 : right);
  }

  function stripPad(value) {
    return String(value == null ? "" : value).replace(/^0+(?=\d)/, "");
  }

  function scheduleKey(year, term, moduleId, sectionId) {
    return [stripPad(year), stripPad(term), stripPad(moduleId), stripPad(sectionId)].join("|");
  }

  function schedScope(year, term) {
    return "AcYear eq " + literal(year) + " and Acsess eq " + literal(term);
  }

  function eventScope(year, term) {
    return "AcYear eq " + literal(year) + " and AcPeriod eq " + literal(term);
  }

  function meetingsByModule(rows) {
    const out = {};
    rows.forEach((row) => {
      const day = DAY_FROM_DOW[String(row.DoW)];
      const startMin = toMinutes(row.BeginTime);
      const endMin = toMinutes(row.EndTime);
      if (!day || startMin == null || endMin == null || endMin <= startMin) return;
      const key = scheduleKey(row.AcYear, row.Acsess, row.ModuleID, row.SectionId);
      const list = out[key] || (out[key] = []);
      const duplicate = list.some((entry) => entry.day === day && entry.startMin === startMin && entry.endMin === endMin);
      if (!duplicate) list.push({ day, startMin, endMin });
    });
    Object.keys(out).forEach((key) => out[key].sort(byMeeting));
    return out;
  }

  function buildingsByModule(rows) {
    const out = {};
    rows.forEach((row) => {
      if (!out[row.ModuleID]) out[row.ModuleID] = row.BuildingText || row.BuildingID || "";
    });
    return out;
  }

  function buildSections(ids, schedule, events, buildings, year, term) {
    const meetings = meetingsByModule(schedule);
    const building = buildingsByModule(buildings);
    const out = {};
    ids.forEach((id) => {
      const packages = {};
      const order = [];
      events
        .filter((row) => String(row.ModuleID) === String(id))
        .forEach((row) => {
          const packageId = String(row.EventPkgObjid || row.EventObjid);
          if (!packages[packageId]) {
            packages[packageId] = {
              moduleId: String(id),
              pkgId: packageId,
              label: packageLabel(row.EventPkgText) || packageId,
              seats: row.EventPkgSeatsAvailable,
              capacity: row.EventPkgLimit,
              waitlist: row.EventPkgNumOnWaitl,
              statusText: row.EventPkgStatusText || "",
              components: [],
            };
            order.push(packageId);
          }
          packages[packageId].components.push({
            sectionId: String(row.EventObjid),
            abbr: row.EventAbbr || "",
            type: row.TeachingMethod_Text || row.TeachingMethod || "",
            methodCode: row.TeachingMethod || "",
            instructor: row.InstructorName || "",
            location: roomFrom(row.Sched) || building[id] || "",
            meetings: meetings[scheduleKey(year, term, id, row.EventObjid)] || [],
          });
        });
      order.forEach((packageId) => packages[packageId].components.sort(byType));
      out[id] = order.map((packageId) => packages[packageId]);
    });
    return out;
  }

  function idClause(ids) {
    return "(" + ids.map((id) => "ModuleID eq " + literal(id)).join(" or ") + ")";
  }

  function fetchEntity(entity, ids, scope) {
    return Promise.all(
      chunk(ids, ID_CHUNK_SIZE).map((part) =>
        getRows(
          entity +
            "?" +
            CLIENT +
            "&$top=" +
            ROW_LIMIT +
            "&$filter=" +
            encodeURIComponent(scope ? idClause(part) + " and " + scope : idClause(part))
        )
      )
    ).then((results) => [].concat.apply([], results));
  }

  function loadMeetings(ids, year, term) {
    const wanted = ids.map(stripPad).filter(Boolean);
    if (!wanted.length) return Promise.resolve({});
    return fetchEntity("YUCSD_CON_MODULE_SCHED", wanted, schedScope(year, term)).then(meetingsByModule);
  }

  function clockMinutes(text) {
    const match = /^(\d{1,2}):(\d{2})\s*([AP])M$/i.exec(String(text || "").trim());
    if (!match) return null;
    const hour = Number(match[1]) % 12;
    return (hour + (match[3].toUpperCase() === "P" ? 12 : 0)) * 60 + Number(match[2]);
  }

  function finalFromSched(text) {
    const line = String(text || "")
      .split("\n")
      .map((entry) => entry.trim())
      .filter((entry) => /^Final Examination\b/.test(entry))[0];
    const dated = line && /^Final Examination\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(.*)$/.exec(line);
    if (!dated) return null;
    const at = dated[4].indexOf("@");
    const span = /^(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/i.exec(
      (at === -1 ? dated[4] : dated[4].slice(0, at)).trim()
    );
    const startMin = span && clockMinutes(span[1]);
    const endMin = span && clockMinutes(span[2]);
    if (startMin == null || endMin == null || endMin <= startMin) return null;
    return {
      date: new Date(Date.UTC(+dated[3], +dated[1] - 1, +dated[2])),
      startMin,
      endMin,
      room: at === -1 ? "" : dated[4].slice(at + 1).trim(),
    };
  }

  function finalsFromEvents(rows) {
    const out = [];
    const seen = {};
    rows.forEach((row) => {
      const final = finalFromSched(row.Sched);
      if (!final) return;
      const moduleId = stripPad(row.ModuleID);
      const pkgId = stripPad(row.EventPkgObjid || row.EventObjid);
      const key = moduleId + "|" + pkgId;
      if (seen[key]) return;
      seen[key] = true;
      out.push({
        moduleId,
        pkgId,
        date: final.date,
        startMin: final.startMin,
        endMin: final.endMin,
        room: final.room,
        abbr: String(row.EventAbbr || ""),
        instructor: String(row.InstructorName || ""),
      });
    });
    return out;
  }

  function loadBuildings(year, term) {
    const apply = "filter(" + sessionScope(year, term) + ")/groupby((BuildingID,BuildingText))";
    return getRows("YUCSD_CON_MODULE_BLDG?" + CLIENT + "&$apply=" + encodeURIComponent(apply)).then((rows) => {
      const out = {};
      rows.forEach((row) => {
        const text = String(row.BuildingText || "").trim();
        const id = String(row.BuildingID || "").trim();
        if (text && id) out[text] = id;
      });
      return out;
    });
  }

  function loadFinals(ids, year, term) {
    const wanted = ids.map(stripPad).filter(Boolean);
    if (!wanted.length) return Promise.resolve([]);
    return fetchEntity("YUCSD_CON_EVENTS", wanted, eventScope(year, term)).then(finalsFromEvents);
  }

  function fetchSections(ids, year, term) {
    if (!ids.length) return Promise.resolve({});
    return Promise.all([
      fetchEntity("YUCSD_CON_MODULE_SCHED", ids, schedScope(year, term)),
      fetchEntity("YUCSD_CON_EVENTS", ids, eventScope(year, term)),
      fetchEntity("YUCSD_CON_MODULE_BLDG", ids, sessionScope(year, term)),
    ]).then(([schedule, events, buildings]) => buildSections(ids, schedule, events, buildings, year, term));
  }

  function packageDays(pkg) {
    const present = {};
    pkg.components.forEach((component) => component.meetings.forEach((meeting) => (present[meeting.day] = true)));
    return DAY_ORDER.filter((day) => present[day]);
  }

  const match = {
    days(pkg, wanted) {
      if (!wanted.length) return true;
      const present = packageDays(pkg);
      return wanted.every((day) => present.indexOf(day) !== -1);
    },
    seats(pkg, mode) {
      if (!mode) return true;
      const open = parseInt(pkg.seats, 10);
      if (mode === "open") return !isNaN(open) && open > 0;
      if (mode === "openwl") return (!isNaN(open) && open > 0) || parseInt(pkg.waitlist, 10) >= 0;
      return true;
    },
    timeRange(pkg, lo, hi) {
      if (lo <= TIME_MIN && hi >= TIME_MAX) return true;
      return pkg.components.every((component) =>
        component.meetings.every((meeting) => meeting.startMin >= lo && meeting.endMin <= hi)
      );
    },
    units(course, lo, hi, bounds) {
      if (lo <= (bounds ? bounds.min : UNITS_MIN) && hi >= (bounds ? bounds.max : UNITS_MAX)) return true;
      const units = parseFloat(course.credits || course.maxCredits);
      return isNaN(units) || (units >= lo && units <= hi);
    },
  };

  function conflicts(pkg, busy) {
    if (!busy) return false;
    return pkg.components.some((component) =>
      component.meetings.some((meeting) =>
        (busy[meeting.day] || []).some(
          (entry) =>
            entry.pkgId !== pkg.pkgId && meeting.startMin < entry.endMin && entry.startMin < meeting.endMin
        )
      )
    );
  }

  function toSection(course, pkg, year, term) {
    return {
      moduleId: pkg.moduleId,
      pkgId: pkg.pkgId,
      year,
      term,
      courseCode: course.code,
      title: course.title,
      credits: course.credits,
      components: pkg.components.map((component) => ({
        abbr: component.abbr,
        type: component.type,
        instructor: component.instructor,
        location: component.location,
        meetings: component.meetings,
      })),
    };
  }

  window.__tssregShared.catalog = {
    TIME_MIN,
    TIME_MAX,
    UNITS_MIN,
    UNITS_MAX,
    loadTerms,
    loadValueHelps,
    loadInstructors,
    loadCreditRange,
    loadMeetings,
    loadFinals,
    finalFromSched,
    finalsFromEvents,
    loadBuildings,
    roomParts,
    scheduleKey,
    plainId: stripPad,
    search,
    fetchSections,
    match,
    conflicts,
    toSection,
    picked,
  };
})();
