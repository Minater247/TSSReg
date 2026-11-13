(() => {
  const shared = window.__tssregShared;
  const terms = shared.academicTerms;
  const CARD = "card08";
  const ELEMENT_ID = "tssreg-course-count";
  const PAGE_HEADER = "Role";
  const FALLBACK_CLASS = "tssreg-identity-fallback";
  const FALLBACK_MESSAGE = "TSS did not load the identity card";
  const MY_COURSES = "#ZUSModule-display?TileType=MYMOD&sap-app-origin-hint=&/MyModules";

  let modules = null;
  let courseRequest = null;
  let courseCount = null;
  const calmedNavs = new WeakSet();

  window.__tssregShared.whenSapReady(() => {
    sap.ui.require(
      ["sap/m/QuickViewGroupElement"],
      (QuickViewGroupElement) => {
        modules = { QuickViewGroupElement };
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

  function showFallback(quickViewEl, show) {
    const current = quickViewEl.querySelector("." + FALLBACK_CLASS);
    if (!show) {
      current?.remove();
      return;
    }
    if (current) return;

    // UI5 reuses controls in the bound pages aggregation. Keep the message
    // outside that aggregation so TSS can create its own page when data arrives.
    const message = document.createElement("div");
    message.className = FALLBACK_CLASS;
    message.setAttribute("role", "status");
    message.textContent = FALLBACK_MESSAGE;
    quickViewEl.appendChild(message);
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

    const [page] = quickView.getPages();
    showFallback(quickViewEl, !page && !quickView.getBusy() && !quickView.getModel()?.hasPendingRequests?.());
    if (!page) return;
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
