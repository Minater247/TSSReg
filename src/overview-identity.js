(() => {
  const CARD = "card08";
  const COURSES_CARD = "card05";
  const ELEMENT_ID = "tssreg-course-count";
  const PAGE_HEADER = "Role";
  const ID_PREFIX = "TSN ";
  const MY_COURSES = "#ZUSModule-display?TileType=MYMOD&sap-app-origin-hint=&/MyModules";

  let modules = null;

  sap.ui.require(["sap/m/QuickViewGroupElement"], (QuickViewGroupElement) => {
    modules = { QuickViewGroupElement };
  });

  function isOverviewRoute() {
    return /^#YStudent-Overview(?:[?&]|$)/.test(location.hash || "");
  }

  function cardElement(card) {
    return document.querySelector('[id*="--' + card + 'Original"]');
  }

  function courseCount() {
    const cardEl = cardElement(COURSES_CARD);
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

  function apply() {
    if (!isOverviewRoute() || !modules) return;

    const cardEl = cardElement(CARD);
    const quickViewEl = cardEl && cardEl.querySelector('[id$="quickViewCard"]');
    const quickView = quickViewEl && sap.ui.getCore().byId(quickViewEl.id);
    const page = quickView && quickView.getPages()[0];
    const group = page && page.getGroups()[0];
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

  window.__tssregShared.onUiUpdated(apply);
})();
