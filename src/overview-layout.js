(() => {
  const DES_CARD_TYPE = "0002";
  const LINK_CARDS = ["card01", "card02", "card03"];
  const MODEL_NAME = "tssreg";

  const GROUP_BY_TEXT = {
    "Schedule of Classes": "Enrollment",
    "My Appointment Times": "Enrollment",
    "My Holds": "Enrollment",
    "Triton Enrollment Authorization": "Enrollment",
    "TGPT-Class Planner": "Enrollment",
    Canvas: "Academics",
    "Academic History": "Academics",
    "Degree Audit": "Academics",
    "Order Transcripts": "Academics",
    TritonPay: "Finances",
    "Financial Aid": "Finances",
    "Triton Cash Account": "Finances",
    "My Bank Accounts": "Finances",
    "My Personal Details": "Profile & Privacy",
    "My Privacy Details": "Profile & Privacy",
    "Virtual Advising Center": "Support",
    "U.S. Citizens Register to Vote": "Support",
  };

  const CARD_GROUPS = {
    card01: { title: "Enrollment & Academics", groups: ["Enrollment", "Academics"] },
    card03: { title: "Finances & Services", groups: ["Finances", "Profile & Privacy", "Support", "More"] },
  };

  let cache = null;
  let modules = null;

  sap.ui.require(
    ["sap/ui/model/json/JSONModel", "sap/ui/model/Sorter", "sap/m/StandardListItem"],
    (JSONModel, Sorter, StandardListItem) => {
      modules = { JSONModel, Sorter, StandardListItem };
    }
  );

  function isOverviewRoute() {
    return /^#YStudent-Overview(?:[?&]|$)/.test(location.hash || "");
  }

  function cardElement(card) {
    return document.querySelector('[id*="--' + card + 'Original"]');
  }

  function listControl(card) {
    const cardEl = cardElement(card);
    const listEl = cardEl && cardEl.querySelector(".sapMList");
    return listEl ? sap.ui.getCore().byId(listEl.id) : null;
  }

  function boundEntitySet(list) {
    const info = list && list.getBindingInfo("items");
    const path = info && info.path;
    return /^\/Link\d+Set$/.test(path || "") ? path : null;
  }

  function harvest() {
    if (cache) return true;
    const links = [];
    for (let i = 0; i < LINK_CARDS.length; i++) {
      const list = listControl(LINK_CARDS[i]);
      if (!list || !boundEntitySet(list) || !list.getItems().length) return false;
      list.getItems().forEach((item) => {
        const context = item.getBindingContext();
        const data = context && context.getObject();
        if (!data || !data.Url) return;
        links.push({
          text: data.Text,
          url: data.Url,
          icon: data.ImageUrl,
          newWindow: !!data.NewWindow,
          cardType: data.CardType,
        });
      });
    }
    if (!links.length) return false;

    const primaryUrls = new Set(links.filter((l) => l.cardType !== DES_CARD_TYPE).map((l) => l.url));
    cache = {
      primaryUrls,
      main: links
        .filter((l) => l.cardType !== DES_CARD_TYPE)
        .map((l) => Object.assign({}, l, { group: GROUP_BY_TEXT[l.text] || "More" })),
    };
    window.__tssregShared.setOverviewLinks(cache.main);
    return true;
  }

  function hideDuplicateLinks() {
    const list = listControl("card02");
    if (!list || !boundEntitySet(list)) return;
    list.getItems().forEach((item) => {
      const context = item.getBindingContext();
      const data = context && context.getObject();
      if (!data || !data.Url || !item.getVisible()) return;
      if (cache.primaryUrls.has(data.Url)) item.setVisible(false);
    });
  }

  function navigate(link) {
    if (!link || !link.url) return;
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

  function applyGroupedList(card) {
    const config = CARD_GROUPS[card];
    const list = listControl(card);
    if (!config || !list) return;

    const info = list.getBindingInfo("items");
    if (info && info.path === "/links") return;

    const rows = cache.main
      .filter((link) => config.groups.indexOf(link.group) !== -1)
      .map((link) => Object.assign({}, link, { groupIndex: config.groups.indexOf(link.group) }));
    if (!rows.length) return;

    list.unbindItems();
    list.setModel(new modules.JSONModel({ links: rows }), MODEL_NAME);
    list.bindItems({
      path: MODEL_NAME + ">/links",
      sorter: new modules.Sorter("groupIndex", false, (context) => ({
        key: context.getProperty("group"),
      })),
      template: new modules.StandardListItem({
        title: "{" + MODEL_NAME + ">text}",
        icon: "{" + MODEL_NAME + ">icon}",
        type: "Navigation",
        press: (event) => {
          const context = event.getSource().getBindingContext(MODEL_NAME);
          navigate(context && context.getObject());
        },
      }),
    });
  }

  function applyCardTitle(card, title) {
    const cardEl = cardElement(card);
    const titleEl = cardEl && cardEl.querySelector('[id$="ovpHeaderTitle"]');
    const control = titleEl && sap.ui.getCore().byId(titleEl.id);
    if (control && control.getText && control.getText() !== title) control.setText(title);
  }

  function disableDragAndDrop() {
    const layoutEl = document.querySelector(".sapUshellEasyScanLayout");
    const layout = layoutEl && sap.ui.getCore().byId(layoutEl.id);
    if (!layout || !layout.getDragAndDropEnabled || !layout.getDragAndDropEnabled()) return;
    layout.setProperty("dragAndDropEnabled", false, true);
    if (layout.layoutDragAndDrop) {
      layout.layoutDragAndDrop.destroy();
      delete layout.layoutDragAndDrop;
    }
  }

  function apply() {
    if (!isOverviewRoute() || !modules) return;
    disableDragAndDrop();
    if (!harvest()) return;
    hideDuplicateLinks();
    Object.keys(CARD_GROUPS).forEach((card) => {
      applyGroupedList(card);
      applyCardTitle(card, CARD_GROUPS[card].title);
    });
  }

  window.__tssregShared.onUiUpdated(apply);
})();
