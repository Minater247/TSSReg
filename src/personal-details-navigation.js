(() => {
  const shared = window.__tssregShared;
  const ROUTE = /^#YStudent-myPersonalDetails(?:[?&]|$)/;
  const PAGE = '.sapUxAPObjectPageLayout[id$="--ObjectPageLayout"]';
  const NAV_CLASS = "tssreg-section-navigation";
  const navigationByLayout = new WeakMap();

  function jump(layout, section, nav) {
    const heading = section.getDomRef()?.querySelector(".sapUxAPObjectPageSectionTitle");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
    layout.scrollToSection(section.getId(), 0, -Math.ceil(nav.getBoundingClientRect().height));
  }

  function buildNavigation(layout, sections) {
    const nav = document.createElement("nav");
    nav.className = NAV_CLASS;
    nav.setAttribute("aria-label", "Jump to section");

    const caption = document.createElement("span");
    caption.textContent = "Jump to section";
    const links = document.createElement("div");
    links.className = "tssreg-section-links";
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Jump to section");
    function addOption(text, value) {
      const option = document.createElement("option");
      option.textContent = text;
      option.value = value;
      select.append(option);
    }
    addOption("Jump to section", "");
    sections.forEach((section) => {
      const link = document.createElement("a");
      link.href = "#" + section.getId();
      link.textContent = section.getTitle();
      link.addEventListener("click", (event) => {
        event.preventDefault();
        jump(layout, section, nav);
      });
      links.append(link);
      addOption(section.getTitle(), section.getId());
    });
    select.addEventListener("change", () => {
      const section = sections.find((entry) => entry.getId() === select.value);
      select.value = "";
      if (section) jump(layout, section, nav);
    });
    nav.append(caption, links, select);
    return nav;
  }

  function apply() {
    if (!ROUTE.test(location.hash)) return;
    const page = document.querySelector(PAGE);
    const content = page?.querySelector(".sapUxAPObjectPageScroll > .sapUxAPObjectPageContainer");
    if (!content) return;
    const layout = sap.ui.getCore().byId(page.id);
    if (!layout?.scrollToSection) return;
    if (layout.getToggleHeaderOnTitleClick()) layout.setToggleHeaderOnTitleClick(false);
    if (layout.getHeaderContentPinnable()) layout.setHeaderContentPinnable(false);
    const sections = layout.getSections().filter((section) => section.getVisible() && section.getTitle() && section.getDomRef());
    if (!sections.length) return;

    /* SAP moves its anchor bar into the title when scrolling. Mount the
       shortcuts beside it so CSS can keep them in the scroll container. */
    if (layout.getShowAnchorBar()) layout.setShowAnchorBar(false);
    const signature = JSON.stringify(sections.map((section) => [section.getId(), section.getTitle()]));
    let entry = navigationByLayout.get(layout);
    if (!entry || entry.signature !== signature || sections.some((section, i) => section !== entry.sections[i])) {
      entry = { signature, sections, nav: buildNavigation(layout, sections) };
      navigationByLayout.set(layout, entry);
    }
    
    page.querySelectorAll("nav." + NAV_CLASS).forEach((nav) => {
      if (nav !== entry.nav) nav.remove();
    });
    if (content.previousElementSibling !== entry.nav) content.before(entry.nav);
  }

  shared.onUiUpdated(apply);
})();
