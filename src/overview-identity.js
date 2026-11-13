(() => {
  const shared = window.__tssregShared;
  const terms = shared.academicTerms;
  const CARD = "card08";
  const ELEMENT_ID = "tssreg-course-count";
  const PAGE_HEADER = "Role";
  const FALLBACK_ID = "tssreg-identity-fallback";
  const FALLBACK_MESSAGE = "TSS did not load the identity card";
  const MY_COURSES = "#ZUSModule-display?TileType=MYMOD&sap-app-origin-hint=&/MyModules";

  let modules = null;
  let courseRequest = null;
  let courseCount = null;
  const calmedNavs = new WeakSet();

  window.__tssregShared.whenSapReady(() => {
    sap.ui.require(
      ["sap/m/QuickViewPage", "sap/m/QuickViewGroupElement"],
      (QuickViewPage, QuickViewGroupElement) => {
        modules = { QuickViewPage, QuickViewGroupElement };
        apply();
      }
    );
  });

  function loadCourseCount() {
    if (courseRequest) return;
    const pending = Promise.all([terms.loadBookings(), shared.catalog.loadTerms()]);
    courseRequest = pending;
    pending.then(([bookings, catalog]) => {
      if (courseRequest !== pending) return;
      const scope = terms.currentTerm(catalog);
      courseCount = bookings && scope ? terms.coursesFor(bookings, scope).length : null;
      apply();
    });
  }

  function dropLabels(group) {
    group.getElements().forEach((element) => {
      if (element.getVisible() && element.getLabel()) element.setLabel("");
    });
  }

  function calmNavContainer(cardEl) {
    const navEl = cardEl.querySelector(".sapMNav");
    const nav = navEl && sap.ui.getCore().byId(navEl.id);
    if (!nav || !nav.getAutoFocus) return;
    if (nav.getAutoFocus()) nav.setProperty("autoFocus", false, true);
    if (calmedNavs.has(nav)) return;
    calmedNavs.add(nav);
    const active = document.activeElement;
    if (active && navEl.contains(active)) active.blur();
  }

  function apply() {
    if (!shared.isOverviewRoute()) {
      courseRequest = null;
      courseCount = null;
      return;
    }
    if (!modules || !shared.catalog) return;
    loadCourseCount();

    const cardEl = shared.cardElement(CARD);
    if (cardEl) calmNavContainer(cardEl);
    const quickViewEl = cardEl && cardEl.querySelector('[id$="quickViewCard"]');
    const quickView = quickViewEl && sap.ui.getCore().byId(quickViewEl.id);
    if (!quickView) return;

    const pages = quickView.getPages();
    const page = pages.find((entry) => entry.getId() !== FALLBACK_ID);
    const fallback = pages.find((entry) => entry.getId() === FALLBACK_ID);
    if (!page) {
      if (!fallback && !quickView.getModel()?.hasPendingRequests?.()) {
        quickView.addPage(new modules.QuickViewPage(FALLBACK_ID, { title: FALLBACK_MESSAGE }));
      }
      return;
    }
    if (fallback) {
      quickView.removePage(fallback);
      fallback.destroy();
    }
    const group = page.getGroups()[0];
    if (!group) return;

    if (page.getHeader() !== PAGE_HEADER) page.setHeader(PAGE_HEADER);
    dropLabels(group);

    const existing = sap.ui.getCore().byId(ELEMENT_ID);
    if (courseCount == null) {
      if (existing) existing.destroy();
      return;
    }
    const text = courseCount + (courseCount === 1 ? " course" : " courses") + " this term";
    if (existing) {
      if (existing.getValue() !== text) existing.setValue(text);
      return;
    }
    group.addElement(
      new modules.QuickViewGroupElement(ELEMENT_ID, {
        label: "",
        value: text,
        type: "link",
        url: MY_COURSES,
      })
    );
  }

  shared.onUiUpdated(apply);
})();
