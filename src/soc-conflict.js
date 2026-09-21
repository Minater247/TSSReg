(() => {
  const MODULE_URL = window.__tssregShared.serviceUrl("YUCSD_CON_MODULE");
  const MYMODULES_URL = "/sap/opu/odata/ITUS/PR_MY_MODULES_V2_SRV/ModuleHeaderSet";

  let hideConflicts = false;

  function applyButtonState(item) {
    const btn = item.querySelector(".tssreg-conflict-btn");
    const inner = btn.querySelector(".sapMBtnInner");
    inner.classList.toggle("sapMBtnEmphasized", hideConflicts);
    inner.classList.toggle("sapMBtnDefault", !hideConflicts);
    btn.setAttribute("aria-pressed", String(hideConflicts));
  }

  function ensureItem(bar) {
    const host = bar.querySelector('.sapUiAFLayoutItem:has([id$="::FilterField::DoW-label"])');
    if (!host) return;
    const existing = bar.querySelector("#tssreg-conflict-item");
    if (existing) {
      if (existing.parentElement !== host) host.appendChild(existing);
      return;
    }

    const item = document.createElement("div");
    item.id = "tssreg-conflict-item";
    item.innerHTML =
      '<div class="sapUiVlt sapuiVlt">' +
      '<div class="sapUiVltCell sapuiVltCell">' +
      '<label class="sapMLabel sapUiSelectable sapMLabelMaxWidth sapUiMdcFilterBarBaseLabel" style="text-align: left;">' +
      '<div class="sapMLabelInner" style="justify-content: flex-start;">' +
      '<span class="sapMLabelTextWrapper"><bdi>Conflicts</bdi></span>' +
      '<span class="sapMLabelColonAndRequired" data-colon=":" aria-hidden="true"></span>' +
      "</div>" +
      "</label>" +
      "</div>" +
      '<div class="sapUiVltCell sapuiVltCell">' +
      '<button type="button" class="sapMBtnBase sapMBtn tssreg-conflict-btn">' +
      '<span class="sapMBtnInner sapMBtnHoverable sapMFocusable sapMBtnText sapMBtnDefault">' +
      '<span class="sapMBtnContent"><bdi>Hide Conflicts</bdi></span></span>' +
      "</button>" +
      "</div>" +
      "</div>";
    host.appendChild(item);

    item.querySelector(".tssreg-conflict-btn").addEventListener("click", () => {
      hideConflicts = !hideConflicts;
      applyButtonState(item);
    });
    applyButtonState(item);
  }

  function toMinutes(t) {
    return parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(3, 5), 10);
  }

  function fetchSchedRows(year, term, ids) {
    return window.__tssregShared.moduleRows(
      "YUCSD_CON_MODULE_SCHED",
      ids,
      "ModuleID,DoW,BeginTime,EndTime",
      (idClause) => "AcYear eq '" + year + "' and Acsess eq '" + term + "' and (" + idClause + ")"
    );
  }

  function fetchCommittedIds(year, term) {
    const modTerm = term.padStart(2, "0");
    const wishlistFilter =
      "AcademicYear eq '" + year + "' and AcademicPeriod eq '" + modTerm + "' and wishlisted eq 'Y'";
    const wishlistUrl =
      MODULE_URL + "?sap-client=500&$top=5000&$select=ModuleID&$filter=" + encodeURIComponent(wishlistFilter);

    const sessionTerm = term.padStart(3, "0");
    const enrolledFilter = "AcademicYear eq '" + year + "' and AcademicSession eq '" + sessionTerm + "'";
    const enrolledUrl =
      MYMODULES_URL + "?sap-client=500&$format=json&$select=SmObjid&$filter=" + encodeURIComponent(enrolledFilter);

    return Promise.all([
      window.__tssregShared.fetchJson(wishlistUrl),
      fetch(enrolledUrl, { headers: { Accept: "application/json" } }).then((r) => (r.ok ? r.json() : null)),
    ]).then(([wishlistData, enrolledData]) => {
      const ids = new Set();
      ((wishlistData && wishlistData.value) || []).forEach((r) => ids.add(r.ModuleID));
      ((enrolledData && enrolledData.d && enrolledData.d.results) || []).forEach((r) =>
        ids.add(String(parseInt(r.SmObjid, 10)))
      );
      return [...ids];
    });
  }

  function matchingModuleIds(year, term, ids) {
    if (!ids.length) return Promise.resolve(new Set());
    return fetchCommittedIds(year, term).then((committedIds) => {
      if (!committedIds.length) return new Set(ids);
      return fetchSchedRows(year, term, committedIds).then((busyRows) => {
        const busyByDay = {};
        busyRows.forEach((r) => {
          const list = busyByDay[r.DoW] || (busyByDay[r.DoW] = []);
          list.push({ start: toMinutes(r.BeginTime), end: toMinutes(r.EndTime), moduleId: r.ModuleID });
        });
        return fetchSchedRows(year, term, ids).then((candidateRows) => {
          const byModule = {};
          candidateRows.forEach((r) => {
            (byModule[r.ModuleID] || (byModule[r.ModuleID] = [])).push(r);
          });
          const matched = new Set();
          ids.forEach((id) => {
            const rows = byModule[id];
            if (!rows || !rows.length) {
              matched.add(id);
              return;
            }
            const conflicts = rows.some((r) => {
              const start = toMinutes(r.BeginTime);
              const end = toMinutes(r.EndTime);
              const busy = busyByDay[r.DoW] || [];
              return busy.some((b) => b.moduleId !== id && start < b.end && end > b.start);
            });
            if (!conflicts) matched.add(id);
          });
          return matched;
        });
      });
    });
  }

  window.__tssregShared.registerModuleFilter({
    isActive: () => hideConflicts,
    matchingIds: ({ year, term, ids }) => matchingModuleIds(year, term, ids),
  });

  window.__tssregShared.onScheduleTick(ensureItem);
})();
