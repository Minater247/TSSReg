(() => {
  const shared = window.__tssregShared;
  const IDENTITY_CARD = "card08";
  const BAND_ID = "tssreg-top-band";
  const GRID_ID = "tssreg-quicklinks";

  let modules = null;
  let renderedLinks = null;

  window.__tssregShared.whenSapReady(() => {
    sap.ui.require(["sap/m/VBox", "sap/m/Image", "sap/m/Text"], (VBox, Image, Text) => {
      modules = { VBox, Image, Text };
      apply();
    });
  });

  function tile(link) {
    const box = new modules.VBox({
      alignItems: "Center",
      justifyContent: "Center",
      items: [
        new modules.Image({ src: link.icon, decorative: true }).addStyleClass("tssreg-tile-icon"),
        new modules.Text({ text: link.text, textAlign: "Center", wrapping: true }).addStyleClass("tssreg-tile-label"),
      ],
    });
    box.addStyleClass("tssreg-tile");
    box.attachBrowserEvent("click", () => shared.navigate(link));
    box.attachBrowserEvent("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      shared.navigate(link);
    });
    box.addEventDelegate({
      onAfterRendering: () => {
        const dom = box.getDomRef();
        if (!dom) return;
        dom.setAttribute("role", "link");
        dom.setAttribute("tabindex", "0");
      },
    });
    return box;
  }

  function buildGrid(links) {
    const grid = new modules.VBox(GRID_ID, { renderType: "Bare" });
    grid.addStyleClass("tssreg-quicklinks-grid");
    links.forEach((link) => grid.addItem(tile(link)));
    return grid;
  }

  function mountBand(inner, cardWrapper) {
    let band = document.getElementById(BAND_ID);
    if (!band) {
      band = document.createElement("div");
      band.id = BAND_ID;
      band.className = "tssreg-top-band";
    }
    if (band.parentElement !== inner) inner.insertBefore(band, inner.firstChild);
    let host = band.querySelector(".tssreg-quicklinks-host");
    if (!host) {
      host = document.createElement("div");
      host.className = "tssreg-quicklinks-host";
    }
    if (band.firstChild !== cardWrapper) band.insertBefore(cardWrapper, band.firstChild);
    if (cardWrapper.nextSibling !== host) band.insertBefore(host, cardWrapper.nextSibling);
    return host;
  }

  function apply() {
    if (!shared.isOverviewRoute() || !modules) return;

    const inner = document.querySelector(".sapUshellEasyScanLayoutInner");
    const cardWrapper = inner && inner.querySelector('[id$="--' + IDENTITY_CARD + '"]');
    if (!inner || !cardWrapper) return;

    const host = mountBand(inner, cardWrapper);
    const links = shared.overviewPrimaryLinks() || [];
    host.hidden = links.length === 0;
    if (!links.length) return;

    const signature = JSON.stringify(links);
    let grid = sap.ui.getCore().byId(GRID_ID);
    if (grid && signature !== renderedLinks) {
      grid.destroyItems();
      links.forEach((link) => grid.addItem(tile(link)));
    }
    if (!grid) grid = buildGrid(links);
    renderedLinks = signature;
    if (grid.getDomRef()?.parentElement !== host) grid.placeAt(host);
  }

  shared.onUiUpdated(apply);
})();
