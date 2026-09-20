(() => {
  const IDENTITY_CARD = "card08";
  const BAND_ID = "tssreg-top-band";
  const GRID_ID = "tssreg-quicklinks";

  const PRIMARY = [
    "Schedule of Classes",
    "Canvas",
    "Degree Audit",
    "Academic History",
    "TritonPay",
    "Financial Aid",
  ];

  let modules = null;

  sap.ui.require(["sap/m/VBox", "sap/m/Image", "sap/m/Text"], (VBox, Image, Text) => {
    modules = { VBox, Image, Text };
  });

  function isOverviewRoute() {
    return /^#YStudent-Overview(?:[?&]|$)/.test(location.hash || "");
  }

  function navigate(link) {
    if (link.url.charAt(0) === "#") {
      location.hash = link.url;
      return;
    }
    if (link.newWindow) {
      window.open(link.url, "_blank", "noopener");
      return;
    }
    location.href = link.url;
  }

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
    box.attachBrowserEvent("click", () => navigate(link));
    box.attachBrowserEvent("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      navigate(link);
    });
    box.addEventDelegate({
      onAfterRendering: () => {
        const dom = box.getDomRef();
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
      inner.insertBefore(band, inner.firstChild);
    }
    band.appendChild(cardWrapper);
    let host = band.querySelector(".tssreg-quicklinks-host");
    if (!host) {
      host = document.createElement("div");
      host.className = "tssreg-quicklinks-host";
      band.appendChild(host);
    }
    return host;
  }

  function apply() {
    if (!isOverviewRoute() || !modules) return;
    if (document.getElementById(GRID_ID)) return;

    const inner = document.querySelector(".sapUshellEasyScanLayoutInner");
    const cardWrapper = inner && inner.querySelector('[id$="--' + IDENTITY_CARD + '"]');
    if (!inner || !cardWrapper) return;

    const links = PRIMARY.map((text) => window.__tssregShared.overviewLinkByText(text)).filter(Boolean);
    if (links.length !== PRIMARY.length) return;

    const grid = sap.ui.getCore().byId(GRID_ID) || buildGrid(links);
    grid.placeAt(mountBand(inner, cardWrapper));
  }

  window.__tssregShared.onUiUpdated(apply);
})();
