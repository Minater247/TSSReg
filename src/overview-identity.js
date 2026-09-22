(() => {
  const shared = window.__tssregShared;
  const CARD = "card08";
  const COURSES_CARD = "card05";
  const ELEMENT_ID = "tssreg-course-count";
  const PAGE_HEADER = "Role";
  const FALLBACK_ID = "tssreg-identity-fallback";
  const DETAILS_URL = "/sap/opu/odata/ited/BC_OVP_PERSONAL_DETAILS_SRV/PersonalDetailsSet";
  const PHOTO_ROOT = "/sap/opu/odata/ited/BC_OVP_PERSONAL_DETAILS_SRV/PhotoSet";
  const PHOTO_FALLBACK = "sap-icon://person-placeholder";
  const ID_PREFIX = "TSN ";
  const MY_COURSES = "#ZUSModule-display?TileType=MYMOD&sap-app-origin-hint=&/MyModules";

  let modules = null;
  let identity = null;
  let identityState = null;
  const calmedNavs = new WeakSet();

  window.__tssregShared.whenSapReady(() => {
    sap.ui.require(
      ["sap/m/QuickViewPage", "sap/m/QuickViewGroup", "sap/m/QuickViewGroupElement"],
      (QuickViewPage, QuickViewGroup, QuickViewGroupElement) => {
        modules = { QuickViewPage, QuickViewGroup, QuickViewGroupElement };
      }
    );
  });

  function courseCount() {
    const cardEl = shared.cardElement(COURSES_CARD);
    const listEl = cardEl && cardEl.querySelector(".sapMList");
    const list = listEl && sap.ui.getCore().byId(listEl.id);
    if (!list) return 0;
    const binding = list.getBinding("items");
    return binding ? binding.getLength() : list.getItems().length;
  }

  function hideEmptyRows(group) {
    group.getElements().forEach((element) => {
      if (element.getType() !== "text" || String(element.getValue() || "").trim()) return;
      if (element.getVisible()) element.setVisible(false);
    });
  }

  function dropLabels(group) {
    group.getElements().forEach((element) => {
      if (element.getVisible() && element.getLabel()) element.setLabel("");
    });
  }

  function applyIdNumber(page) {
    const description = String(page.getDescription() || "");
    if (!description || description.startsWith(ID_PREFIX)) return;
    page.setDescription(ID_PREFIX + description);
  }

  function pageById(quickView, wanted) {
    return quickView.getPages().filter((entry) => (entry.getId() === FALLBACK_ID) === wanted)[0] || null;
  }

  function usable(info) {
    return info && (info.name || info.id) ? info : null;
  }

  function shellIdentity() {
    try {
      const user = sap.ushell.Container.getUser();
      return {
        name: String(user.getFullName() || "").trim(),
        id: String(user.getId() || "").trim(),
        email: String(user.getEmail() || "").trim(),
        photo: photoFor(String(user.getId() || "").trim()),
      };
    } catch {
      return null;
    }
  }

  function serviceIdentity(row) {
    return {
      name: String(row.Name || "").trim(),
      id: String(row.StudentNumber || "").trim(),
      email: String(row.UniversityEmail || "").trim(),
      photo: String(row.PhotoUri || "").trim() || photoFor(String(row.StudentNumber || "").trim()),
    };
  }

  function loadIdentity(quickView) {
    if (identityState) return;
    const model = quickView.getModel && quickView.getModel();
    if (model && model.hasPendingRequests && model.hasPendingRequests()) return;
    identityState = "loading";
    fetch(DETAILS_URL, { credentials: "include", headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const rows = (data && data.d && data.d.results) || [];
        identity = usable(rows.length ? serviceIdentity(rows[0]) : null) || usable(shellIdentity());
      })
      .catch(() => {
        identity = usable(shellIdentity());
      })
      .then(() => {
        identityState = "done";
        apply();
      });
  }

  function photoFor(id) {
    return id ? PHOTO_ROOT + "('" + encodeURIComponent(id) + "')/$value" : "";
  }

  function fallbackPage(info) {
    const elements = info.email
      ? [new modules.QuickViewGroupElement({ label: "", value: info.email, type: "email" })]
      : [];
    return new modules.QuickViewPage(FALLBACK_ID, {
      header: PAGE_HEADER,
      title: info.name,
      description: info.id,
      icon: info.photo || PHOTO_FALLBACK,
      fallbackIcon: PHOTO_FALLBACK,
      groups: [new modules.QuickViewGroup({ elements })],
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
    if (!shared.isOverviewRoute() || !modules) return;

    const cardEl = shared.cardElement(CARD);
    if (cardEl) calmNavContainer(cardEl);
    const quickViewEl = cardEl && cardEl.querySelector('[id$="quickViewCard"]');
    const quickView = quickViewEl && sap.ui.getCore().byId(quickViewEl.id);
    if (!quickView) return;

    const native = pageById(quickView, false);
    const mine = pageById(quickView, true);
    if (native && mine) {
      quickView.removePage(mine);
      mine.destroy();
    }

    let page = native || mine;
    if (!page) {
      loadIdentity(quickView);
      if (!identity) return;
      page = fallbackPage(identity);
      quickView.addPage(page);
    }
    const group = page.getGroups()[0];
    if (!group) return;

    if (page.getHeader() !== PAGE_HEADER) page.setHeader(PAGE_HEADER);
    applyIdNumber(page);
    hideEmptyRows(group);
    dropLabels(group);

    const count = courseCount();
    if (!count) return;
    const text = count + (count === 1 ? " course" : " courses") + " this term";

    const existing = sap.ui.getCore().byId(ELEMENT_ID);
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
