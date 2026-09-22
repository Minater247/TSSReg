(() => {
  const shared = window.__tssregShared;
  const CARD = "card12";
  const CARD_TITLE = "My Schedule";
  const STRIP_ID = "tssreg-week-strip";
  const MY_COURSES = "#ZUSModule-display?TileType=MYMOD&sap-app-origin-hint=&/MyModules";
  const CLASS_EVENT_TYPE = "01";
  const EVENTS_URL =
    "/sap/opu/odata/ited/EVENT_TIMETABLE_SRV/EventListSet?$filter=" +
    encodeURIComponent("(EventDate ge datetime'2025-01-01T00:00:00' and EventDate le datetime'2027-12-30T00:00:00')");
  const TYPES_URL = "/sap/opu/odata/ited/EVENT_TIMETABLE_SRV/EventTypeSet";
  const THEME_VARS = [
    ["--tssreg-border", "sapUiListBorderColor", "#e5e5e5"],
    ["--tssreg-bg", "sapUiListBackground", "#ffffff"],
    ["--tssreg-accent", "sapUiHighlight", "#0a6ed1"],
    ["--tssreg-text", "sapUiBaseText", "#131e29"],
    ["--tssreg-muted", "sapUiContentLabelColor", "#556b82"],
    ["--tssreg-event-bg", "sapUiListSelectionBackgroundColor", "#f2f7fa"],
  ];

  let modules = null;
  let byDay = null;
  let legend = [];
  let fetchStarted = false;
  let weekOffset = 0;

  window.__tssregShared.whenSapReady(() => {
    sap.ui.require(
      [
        "sap/ui/core/theming/Parameters",
        "sap/ui/layout/cssgrid/CSSGrid",
        "sap/m/Text",
        "sap/m/VBox",
        "sap/m/HBox",
        "sap/m/Toolbar",
        "sap/m/ToolbarSpacer",
        "sap/m/Button",
        "sap/m/Title",
        "sap/m/Link",
        "sap/ui/core/HTML",
      ],
      (Parameters, CSSGrid, Text, VBox, HBox, Toolbar, ToolbarSpacer, Button, Title, Link, HTML) => {
        modules = { Parameters, CSSGrid, Text, VBox, HBox, Toolbar, ToolbarSpacer, Button, Title, Link, HTML };
      }
    );
  });

  function safeColor(value) {
    return /^#[0-9a-fA-F]{3,8}$/.test(String(value || "")) ? value : "#999999";
  }

  function parseDuration(value) {
    const match = /PT(\d+)H(\d+)M(\d+)S/.exec(String(value));
    return match ? { hours: +match[1], minutes: +match[2] } : { hours: 0, minutes: 0 };
  }

  function parseDate(value) {
    const match = /\/Date\((-?\d+)\)\//.exec(String(value));
    return match ? new Date(+match[1]) : null;
  }

  function clockTime(time) {
    return (((time.hours + 11) % 12) + 1) + ":" + String(time.minutes).padStart(2, "0");
  }

  function meridiem(time) {
    return time.hours < 12 ? "AM" : "PM";
  }

  function formatRange(start, end) {
    if (meridiem(start) === meridiem(end)) {
      return clockTime(start) + " – " + clockTime(end) + " " + meridiem(end);
    }
    return clockTime(start) + " " + meridiem(start) + " – " + clockTime(end) + " " + meridiem(end);
  }

  function dayKey(year, month, date) {
    return year + "-" + String(month + 1).padStart(2, "0") + "-" + String(date).padStart(2, "0");
  }

  function localKey(date) {
    return dayKey(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function groupByDay(rows) {
    const grouped = {};
    rows.forEach((row) => {
      const day = parseDate(row.EventDate);
      if (!day) return;
      const key = dayKey(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
      const start = parseDuration(row.StartTime);
      const end = parseDuration(row.EndTime);
      const isClass = row.EventType === CLASS_EVENT_TYPE;
      (grouped[key] = grouped[key] || []).push({
        isClass,
        sortMinutes: start.hours * 60 + start.minutes,
        time: isClass ? formatRange(start, end) : "",
        name: row.CourseName || row.EventName,
        room: (row.Room || "").split(" - ")[0].trim(),
        color: safeColor(row.EventCssColor),
      });
    });
    Object.keys(grouped).forEach((key) => grouped[key].sort((a, b) => a.sortMinutes - b.sortMinutes));
    return grouped;
  }

  function ensureData() {
    if (fetchStarted) return;
    fetchStarted = true;
    const options = { credentials: "include", headers: { Accept: "application/json" } };
    fetch(TYPES_URL, options)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        legend = ((data && data.d && data.d.results) || []).map((type) => ({
          label: type.EventTypeText,
          color: safeColor(type.EventCssColor),
        }));
      })
      .catch(() => {
        legend = [];
      });
    fetch(EVENTS_URL, options)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        byDay = groupByDay((data && data.d && data.d.results) || []);
      })
      .catch(() => {
        byDay = {};
      });
  }

  function weekDays(offset) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - start.getDay() + offset * 7);
    return [...Array(7)].map((_, index) => {
      const day = new Date(start);
      day.setDate(day.getDate() + index);
      return day;
    });
  }

  function rangeLabel(days) {
    return (
      days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " – " +
      days[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    );
  }


  function labelled(text, styleClass, textAlign) {
    const box = new modules.VBox({
      renderType: "Bare",
      items: [new modules.Text({ text, wrapping: true, textAlign: textAlign || "Begin" })],
    });
    box.addStyleClass(styleClass);
    return box;
  }

  function applyThemeVars(strip) {
    const dom = strip.getDomRef();
    if (!dom) return;
    THEME_VARS.forEach(([name, param, fallback]) => {
      const value = modules.Parameters.get({ name: param }) || fallback;
      dom.style.setProperty(name, value);
    });
  }
  function eventBox(event) {
    if (!event.isClass) {
      const badge = labelled(event.name, "tssreg-week-badge", "Center");
      badge.addEventDelegate({
        onAfterRendering: () => {
          badge.getDomRef().style.background = event.color;
        },
      });
      return badge;
    }
    const box = new modules.VBox({
      renderType: "Bare",
      items: [
        event.time && labelled(event.time, "tssreg-week-time"),
        labelled(event.name, "tssreg-week-name"),
        event.room && labelled(event.room, "tssreg-week-room"),
      ].filter(Boolean),
    });
    box.addStyleClass("tssreg-week-event");
    return box;
  }

  function dayBox(day, today) {
    const box = new modules.VBox({ renderType: "Bare" });
    box.addStyleClass("tssreg-week-day");
    if (localKey(day) === today) box.addStyleClass("tssreg-is-today");
    box.addItem(
      labelled(
        day.toLocaleDateString("en-US", { weekday: "short" }) + " " + day.getDate(),
        "tssreg-week-dayname",
        "Center"
      )
    );
    (byDay[localKey(day)] || []).forEach((event) => box.addItem(eventBox(event)));
    return box;
  }

  function buildLegend() {
    const row = new modules.HBox({ renderType: "Bare", alignItems: "Center" });
    row.addStyleClass("tssreg-week-legend");
    legend.forEach((entry) => {
      const item = new modules.HBox({
        renderType: "Bare",
        alignItems: "Center",
        items: [
          new modules.HTML({
            content: '<span class="tssreg-week-swatch" style="background:' + entry.color + '"></span>',
          }),
          new modules.Text({ text: entry.label }).addStyleClass("sapUiTinyMarginBegin"),
        ],
      });
      item.addStyleClass("sapUiSmallMarginEnd");
      row.addItem(item);
    });
    return row;
  }

  function renderStrip(strip) {
    strip.destroyItems();
    const days = weekDays(weekOffset);
    const today = localKey(new Date());

    const nav = new modules.HBox({ renderType: "Bare" });
    nav.addStyleClass("tssreg-week-nav");
    nav.addItem(
      new modules.Button({
        icon: "sap-icon://navigation-left-arrow",
        tooltip: "Previous week",
        press: () => {
          weekOffset -= 1;
          renderStrip(strip);
        },
      })
    );
    const title = new modules.VBox({ items: [new modules.Title({ text: rangeLabel(days) })] });
    title.addStyleClass("tssreg-week-nav-title");
    nav.addItem(title);
    nav.addItem(
      new modules.Button({
        icon: "sap-icon://navigation-right-arrow",
        tooltip: "Next week",
        press: () => {
          weekOffset += 1;
          renderStrip(strip);
        },
      })
    );
    nav.addItem(
      new modules.Button({
        text: "Today",
        press: () => {
          weekOffset = 0;
          renderStrip(strip);
        },
      })
    );
    strip.addItem(nav);

    const grid = new modules.CSSGrid({
      gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
      gridGap: "8px",
    });
    days.forEach((day) => grid.addItem(dayBox(day, today)));
    const scroll = new modules.VBox({ renderType: "Bare", items: [grid] });
    scroll.addStyleClass("tssreg-week-scroll");
    strip.addItem(scroll);

    const footer = new modules.HBox({ renderType: "Bare" });
    footer.addStyleClass("tssreg-week-foot");
    footer.addItem(buildLegend());
    footer.addItem(new modules.Link({ text: "View My Courses \u203a", href: MY_COURSES }));
    strip.addItem(footer);
  }

  function hideStaleContent(container, strip) {
    container.getItems().forEach((item) => {
      if (item !== strip && item.setVisible) item.setVisible(false);
    });
    const counter = [...cardElement().querySelectorAll(".sapMText, .sapMLabel")].find((el) =>
      /^\d+\s+classes$/.test(el.textContent.trim())
    );
    const control = counter && sap.ui.getCore().byId(counter.id);
    if (control && control.getVisible && control.getVisible()) control.setVisible(false);
  }

  function applyCardTitle() {
    const titleEl = shared.cardElement(CARD).querySelector('[id$="ovpHeaderTitle"]');
    const control = titleEl && sap.ui.getCore().byId(titleEl.id);
    if (control && control.getText && control.getText() !== CARD_TITLE) control.setText(CARD_TITLE);
  }

  function apply() {
    if (!shared.isOverviewRoute() || !modules) return;
    ensureData();
    if (!byDay) return;

    const cardEl = shared.cardElement(CARD);
    const contentEl = cardEl && cardEl.querySelector('[id$="ovpCardContentContainer"]');
    const container = contentEl && sap.ui.getCore().byId(contentEl.id);
    if (!container || !container.getItems) return;

    let strip = sap.ui.getCore().byId(STRIP_ID);
    if (!strip) {
      strip = new modules.VBox(STRIP_ID, { width: "100%" });
      strip.addEventDelegate({
        onAfterRendering: () => applyThemeVars(strip),
      });
      renderStrip(strip);
    }
    if (container.indexOfItem(strip) === -1) container.addItem(strip);
    hideStaleContent(container, strip);
    applyCardTitle();
  }

  shared.onUiUpdated(apply);
})();
