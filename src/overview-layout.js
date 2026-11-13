(() => {
  const shared = window.__tssregShared;
  const LINK_CARDS = ["card01", "card02", "card03"];
  const MODEL_NAME = "tssreg";
  const BAND_ID = "tssreg-more-band";
  const PANEL_ID = "tssreg-more-services";

  const PRIMARY = [
    "Schedule of Classes",
    "Canvas",
    "Degree Audit",
    "Academic History",
    "TritonPay",
    "Financial Aid",
  ];

  const SECONDARY = [
    {
      card: "card01",
      title: "Enrollment",
      texts: [
        "My Appointment Times",
        "Class Planner",
        "My Holds",
        "Course Catalog",
        "Triton Enrollment Authorization",
      ],
    },
    {
      card: "card02",
      title: "Records & Profile",
      texts: ["Order Transcripts", "My Personal Details"],
    },
    {
      card: "card03",
      title: "Money & Support",
      texts: ["Triton Cash Account", "Virtual Advising Center", "Financial Assistance", "My Bank Accounts"],
    },
  ];

  const GROUPS = [
    {
      label: "Registration & Enrollment",
      texts: [
        "Schedule of Classes",
        "My Appointment Times",
        "Triton Enrollment Authorization",
        "Course Catalog",
        "My Applications",
      ],
    },
    {
      label: "Academics",
      texts: [
        "Academic History",
        "Degree Audit",
        "Order Transcripts",
        "Class Planner",
        "Canvas",
        "Extended Studies Canvas",
      ],
    },
    {
      label: "Financial",
      texts: ["TritonPay", "Triton Cash Account", "Financial Aid", "Financial Assistance", "My Bank Accounts"],
    },
    {
      label: "Personal & Privacy",
      texts: ["My Personal Details", "My Privacy Details", "Legal Name Change", "My Holds"],
    },
    {
      label: "Support & Services",
      texts: [
        "Student Services Contact Information",
        "Disability Services",
        "Virtual Advising Center",
        "Veterans Education Benefits",
        "U.S. Citizens Register to Vote",
      ],
    },
  ];

  const sources = new Map();
  let cache = null;
  let renderedMore = null;
  let modules = null;

  window.__tssregShared.whenSapReady(() => {
    sap.ui.require(
      [
        "sap/ui/model/json/JSONModel",
        "sap/m/StandardListItem",
        "sap/m/List",
        "sap/m/Panel",
        "sap/m/VBox",
        "sap/m/Text",
        "sap/ui/layout/cssgrid/CSSGrid",
      ],
      (JSONModel, StandardListItem, List, Panel, VBox, Text, CSSGrid) => {
        modules = { JSONModel, StandardListItem, List, Panel, VBox, Text, CSSGrid };
        apply();
      }
    );
  });

  function listControl(card) {
    const cardEl = shared.cardElement(card);
    const listEl = cardEl && cardEl.querySelector(".sapMList");
    return listEl ? sap.ui.getCore().byId(listEl.id) : null;
  }

  function boundEntitySet(list) {
    const info = list && list.getBindingInfo("items");
    const path = info && info.path;
    return /^\/Link\d+Set$/.test(path || "") ? path : null;
  }

  function normalizeText(value) {
    const text = String(value || "")
      .replace(/[​-‍⁠﻿]/g, "")
      .trim();
    if (text === "My Academic History") return "Academic History";
    if (text === "TGPT-Class Planner") return "Class Planner";
    return text;
  }

  /** Collects available links as TSS finishes loading each card. */
  function harvest() {
    let changed = false;
    LINK_CARDS.forEach((card) => {
      const list = listControl(card);
      if (!boundEntitySet(list)) return;
      const model = list.getBindingInfo("items").model;
      const rows = list.getItems().flatMap((item) => {
        const context = item.getBindingContext(model);
        const data = context && context.getObject();
        if (!data || !data.Url) return [];
        return [{
          text: normalizeText(data.Text),
          url: data.Url,
          icon: data.ImageUrl,
          newWindow: !!data.NewWindow,
        }];
      });
      if (!rows.length) return;
      const signature = JSON.stringify(rows);
      if (sources.get(card)?.signature === signature) return;
      sources.set(card, { rows, signature });
      changed = true;
    });
    if (!changed) return !!cache;

    const links = [];
    const seen = new Set();
    LINK_CARDS.forEach((card) => sources.get(card)?.rows.forEach((link) => {
      const key = JSON.stringify([link.text, link.url]);
      if (seen.has(key)) return;
      seen.add(key);
      links.push(link);
    }));

    const byText = {};
    links.forEach((link) => {
      if (!byText[link.text]) byText[link.text] = link;
    });
    const primary = PRIMARY.map((text) => byText[text]).filter(Boolean);

    cache = { links, byText };
    shared.setOverviewPrimary(primary);
    return true;
  }

  function promotedTexts() {
    const promoted = {};
    PRIMARY.forEach((text) => {
      promoted[text] = true;
    });
    SECONDARY.forEach((group) => {
      group.texts.forEach((text) => {
        promoted[text] = true;
      });
    });
    return promoted;
  }

  function moreGroups() {
    const promoted = promotedTexts();
    const claimed = {};
    const groups = GROUPS.map((group) => {
      const items = [];
      group.texts.forEach((text) => {
        const link = cache.byText[text];
        if (!link) return;
        claimed[text] = true;
        if (!promoted[text]) items.push(link);
      });
      return { label: group.label, items };
    }).filter((group) => group.items.length);

    const leftover = cache.links.filter((link) => !claimed[link.text] && !promoted[link.text]);
    if (leftover.length) groups.push({ label: "More", items: leftover });
    return groups.sort((a, b) => b.items.length - a.items.length);
  }

  function linkTemplate() {
    return new modules.StandardListItem({
      title: "{" + MODEL_NAME + ">text}",
      icon: "{" + MODEL_NAME + ">icon}",
      wrapping: true,
      type: "Navigation",
      press: (event) => {
        const context = event.getSource().getBindingContext(MODEL_NAME);
        shared.navigate(context && context.getObject());
      },
    });
  }

  function bindLinks(list, rows) {
    list.unbindItems();
    list.setModel(new modules.JSONModel({ links: rows }), MODEL_NAME);
    list.bindItems({ path: MODEL_NAME + ">/links", template: linkTemplate() });
  }

  function applyCardTitle(card, title) {
    const cardEl = shared.cardElement(card);
    const titleEl = cardEl && cardEl.querySelector('[id$="ovpHeaderTitle"]');
    const control = titleEl && sap.ui.getCore().byId(titleEl.id);
    if (control && control.getText && control.getText() !== title) control.setText(title);
  }

  function applySecondary(config) {
    const list = listControl(config.card);
    if (!list) return;
    const rows = config.texts.map((text) => cache.byText[text]).filter(Boolean);
    if (!rows.length) return;
    const info = list.getBindingInfo("items");
    if (info?.model === MODEL_NAME && info.path === "/links") {
      const model = list.getModel(MODEL_NAME);
      if (JSON.stringify(model.getProperty("/links")) !== JSON.stringify(rows)) model.setProperty("/links", rows);
    } else if (list.getItems().length && boundEntitySet(list)) {
      bindLinks(list, rows);
    } else {
      return;
    }
    applyCardTitle(config.card, config.title);
  }

  function moreColumn(group) {
    const label = new modules.Text({ text: group.label });
    label.addStyleClass("tssreg-more-label");
    const list = new modules.List({ showSeparators: "None" });
    bindLinks(list, group.items);
    const column = new modules.VBox({ renderType: "Bare", items: [label, list] });
    column.addStyleClass("tssreg-more-column");
    return column;
  }

  function buildMorePanel(groups) {
    const grid = new modules.CSSGrid({
      gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
      gridGap: "18px",
    });
    groups.forEach((group) => grid.addItem(moreColumn(group)));
    const panel = new modules.Panel(PANEL_ID, {
      headerText: "More Services",
      expandable: true,
      expanded: false,
      width: "100%",
      content: [grid],
    });
    panel.addStyleClass("tssreg-more-panel");
    return panel;
  }

  function mountMoreBand(inner) {
    let band = document.getElementById(BAND_ID);
    if (!band) {
      band = document.createElement("div");
      band.id = BAND_ID;
      band.className = "tssreg-more-band";
    }
    if (band.parentElement !== inner) inner.appendChild(band);
    return band;
  }

  function applyMore(inner) {
    const groups = moreGroups();
    if (!groups.length) return;
    const signature = JSON.stringify(groups);
    let panel = sap.ui.getCore().byId(PANEL_ID);
    if (panel && renderedMore !== signature) {
      const expanded = panel.getExpanded();
      panel.destroy();
      panel = buildMorePanel(groups);
      panel.setExpanded(expanded);
    }
    if (!panel) panel = buildMorePanel(groups);
    renderedMore = signature;
    const host = mountMoreBand(inner);
    if (panel.getDomRef()?.parentElement !== host) panel.placeAt(host);
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
    if (!shared.isOverviewRoute() || !modules) return;
    disableDragAndDrop();
    if (!harvest()) return;
    SECONDARY.forEach(applySecondary);
    const inner = document.querySelector(".sapUshellEasyScanLayoutInner");
    if (inner) applyMore(inner);
  }

  shared.onUiUpdated(apply);
})();
