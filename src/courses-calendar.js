(() => {
  const ROOT_ID = "tssreg-courses-calendar";
  const LOADING_ID = "tssreg-courses-loading";
  const POPOVER_ID = "tssreg-courses-detail";
  const PAGE_SELECTOR = '[id$="--mymodulesPage"]';
  const LIST_SUFFIX = /--mymodList$/;
  const HIDDEN_CLASS = "tssreg-native-list-hidden";
  const FILTER_ICON = "sap-icon://filter";
  const DETAIL_ROUTE = "#ZUSModule-display?TileType=MYMOD&sap-app-origin-hint=&/Detail/MyModules/";
  const DAY_NAMES = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" };
  const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR"];
  const DAY_ORDER = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
  const STATUS_LABEL = { enrolled: "Enrolled", waitlisted: "Waitlisted", other: "" };
  const LEGEND_ORDER = ["enrolled", "waitlisted", "other"];
  const MIN_BLOCK_HEIGHT = 66;
  const BREATHING_ROOM = 14;
  const TRACK_SLACK = 12;
  const THEME_VARS = [
    ["--tssreg-border", "sapUiListBorderColor", "#e5e5e5"],
    ["--tssreg-line", "sapUiGroupContentBorderColor", "#f0f0f0"],
    ["--tssreg-bg", "sapUiListBackground", "#ffffff"],
    ["--tssreg-text", "sapUiBaseText", "#131e29"],
    ["--tssreg-muted", "sapUiContentLabelColor", "#556b82"],
  ];

  let modules = null;
  const eventsByPackage = {};
  const pending = {};
  let rendered = null;
  let layout = null;
  let openBlockKey = null;

  sap.ui.require(
    [
      "sap/ui/core/theming/Parameters",
      "sap/m/Text",
      "sap/m/Label",
      "sap/m/VBox",
      "sap/m/HBox",
      "sap/m/Button",
      "sap/m/Popover",
      "sap/m/Toolbar",
      "sap/m/ToolbarSpacer",
      "sap/m/ProgressIndicator",
      "sap/ui/core/HTML",
    ],
    (Parameters, Text, Label, VBox, HBox, Button, Popover, Toolbar, ToolbarSpacer, ProgressIndicator, HTML) => {
      modules = { Parameters, Text, Label, VBox, HBox, Button, Popover, Toolbar, ToolbarSpacer, ProgressIndicator, HTML };
    }
  );

  function isCoursesRoute() {
    const hash = location.hash || "";
    return /\/MyModules$/.test(hash) && hash.indexOf("/Detail/") === -1;
  }

  function pageControl() {
    const el = document.querySelector(PAGE_SELECTOR);
    const page = el ? sap.ui.getCore().byId(el.id) : null;
    return page && page.getContent ? page : null;
  }

  function listControl(page) {
    return page.getContent().filter((control) => LIST_SUFFIX.test(control.getId()))[0] || null;
  }

  function moduleEntries(list) {
    const binding = list.getBinding && list.getBinding("items");
    if (!binding || !binding.getCurrentContexts) return null;
    const model = binding.getModel();
    const entries = binding
      .getCurrentContexts()
      .map((context) => ({ path: context.getPath(), row: context.getObject(), model }))
      .filter((entry) => entry.row && entry.row.EventPackageId);
    return entries.length ? entries : null;
  }

  function toolbarControls(list) {
    const toolbar = list.getHeaderToolbar && list.getHeaderToolbar();
    return toolbar ? toolbar.getContent() : [];
  }

  function setNativeListHidden(list, hidden) {
    if (list.hasStyleClass(HIDDEN_CLASS) !== hidden) {
      if (hidden) list.addStyleClass(HIDDEN_CLASS);
      else list.removeStyleClass(HIDDEN_CLASS);
    }
    toolbarControls(list).forEach((control) => {
      const isSearch = control.isA && control.isA("sap.m.SearchField");
      const isFilter = control.getIcon && control.getIcon() === FILTER_ICON;
      if (!isSearch && !isFilter) return;
      if (control.getVisible() === !hidden) return;
      control.setVisible(!hidden);
    });
  }

  function ensureEvents(entries) {
    entries.forEach(({ path, row, model }) => {
      const pkg = row.EventPackageId;
      if (eventsByPackage[pkg] || pending[pkg]) return;
      pending[pkg] = true;
      model.read(path + "/Event", {
        success: (data) => {
          delete pending[pkg];
          eventsByPackage[pkg] = data.results || (data.EventId ? [data] : []);
          apply();
        },
        error: () => {
          delete pending[pkg];
          eventsByPackage[pkg] = [];
          apply();
        },
      });
    });
  }

  function statusOf(row) {
    const text = ((row.SmStatusText || "") + " " + (row.SmStatus || "")).toLowerCase();
    if (text.indexOf("wait") !== -1) return "waitlisted";
    if (text.indexOf("book") !== -1 || text.indexOf("enrol") !== -1) return "enrolled";
    return "other";
  }

  function minutesOf(time) {
    return time && typeof time.ms === "number" ? Math.round(time.ms / 60000) : null;
  }

  function clockLabel(minutes) {
    const hours = Math.floor(minutes / 60);
    return (hours % 12 || 12) + ":" + String(minutes % 60).padStart(2, "0");
  }

  function rangeLabel(startMin, endMin) {
    return clockLabel(startMin) + " – " + clockLabel(endMin);
  }

  function meridiemLabel(minutes) {
    return clockLabel(minutes) + (minutes >= 720 ? " PM" : " AM");
  }

  function fullRangeLabel(startMin, endMin) {
    return meridiemLabel(startMin) + " – " + meridiemLabel(endMin);
  }

  function dayListLabel(scheduleDays) {
    return String(scheduleDays || "")
      .split("/")
      .filter(Boolean)
      .map((day) => DAY_NAMES[day] || day)
      .join("/");
  }

  function roomLabel(event) {
    if (!event.RoomShort) return "";
    const suffix = String(event.RoomStext || "").replace(/^Room\s*\S*\s*-?\s*/i, "").trim();
    return suffix ? event.RoomShort + " - " + suffix : event.RoomShort;
  }

  function parseDate(value) {
    const parts = String(value).split("/");
    if (parts.length !== 3) return null;
    const date = new Date(Number(parts[2]), Number(parts[0]) - 1, Number(parts[1]));
    return isNaN(date.getTime()) ? null : date;
  }

  function dateRangeLabel(scheduleText) {
    const match = String(scheduleText || "").match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/);
    if (!match) return "";
    const start = parseDate(match[1]);
    const end = parseDate(match[2]);
    if (!start || !end) return "";
    const format = (date) =>
      date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    return format(start) + " – " + format(end);
  }

  function detailRoute(row) {
    return (
      DETAIL_ROUTE +
      [
        row.SmOtype,
        row.SmObjid,
        row.ScObjid,
        row.AssignedCg || row.ScObjid,
        row.AssignedCgTop || row.AssignedCg || row.ScObjid,
        "0",
        row.ModregId,
        row.EventPackageId,
        row.AcademicYear,
        row.AcademicSession,
      ].join("/")
    );
  }

  function creditsLabel(row) {
    if (!row.Credits) return "";
    const value = parseFloat(row.Credits);
    return (isNaN(value) ? row.Credits : String(value)) + (row.CreditUnit ? " " + row.CreditUnit : "");
  }

  function scheduleItems(entries) {
    const items = [];
    entries.forEach(({ row }) => {
      const events = eventsByPackage[row.EventPackageId];
      if (!events) return;
      const status = statusOf(row);
      events.forEach((event) => {
        const startMin = minutesOf(event.StartTime);
        const endMin = minutesOf(event.EndTime);
        if (startMin == null || endMin == null || endMin <= startMin) return;
        String(event.EventScheduleDays || "")
          .split("/")
          .filter((day) => DAY_NAMES[day])
          .forEach((day) => {
            items.push({
              key: row.EventPackageId + "|" + event.EventId,
              day,
              startMin,
              endMin,
              status,
              courseCode: row.SmShort || "",
              courseTitle: row.SmStext || "",
              section: event.EventStext || "",
              method: event.MethodText || event.Method || "",
              room: event.RoomShort || "",
              instructor: event.InstrText || "",
              event,
              row,
            });
          });
      });
    });
    return items;
  }

  function layoutDay(dayItems) {
    const sorted = dayItems.slice().sort((a, b) => a.startMin - b.startMin);
    const columnEnds = [];
    sorted.forEach((item) => {
      const free = columnEnds.findIndex((end) => end <= item.startMin);
      if (free === -1) {
        item.column = columnEnds.length;
        columnEnds.push(item.endMin);
        return;
      }
      columnEnds[free] = item.endMin;
      item.column = free;
    });
    sorted.forEach((item) => {
      item.columns = columnEnds.length;
    });
    sorted.forEach((a, index) => {
      sorted.slice(index + 1).forEach((b) => {
        if (a.startMin < b.endMin && b.startMin < a.endMin) {
          a.conflict = true;
          b.conflict = true;
        }
      });
    });
    return sorted;
  }

  function timeRange(items) {
    if (!items.length) return { startMin: 8 * 60, endMin: 17 * 60 };
    const startMin = Math.min(...items.map((item) => item.startMin));
    const endMin = Math.max(...items.map((item) => item.endMin));
    return { startMin: Math.floor(startMin / 60) * 60, endMin: Math.ceil(endMin / 60) * 60 };
  }

  function daysToShow(items) {
    const present = {};
    items.forEach((item) => {
      present[item.day] = true;
    });
    return DAY_ORDER.filter((day) => WEEKDAYS.indexOf(day) !== -1 || present[day]);
  }

  function labelled(text, styleClass, textAlign) {
    const control = new modules.Text({ text, wrapping: true, textAlign: textAlign || "Begin" });
    control.addStyleClass(styleClass);
    return control;
  }

  function detailRow(label, value, route) {
    if (!value) return null;
    const row = new modules.VBox({ renderType: "Bare" });
    row.addStyleClass("tssreg-detail-row");
    const caption = new modules.Label({ text: label });
    caption.addStyleClass("tssreg-detail-label");
    row.addItem(caption);
    const text = labelled(value, "tssreg-detail-value");
    if (!route) {
      row.addItem(text);
      return row;
    }
    const link = new modules.HBox({
      renderType: "Bare",
      alignItems: "Center",
      justifyContent: "SpaceBetween",
      items: [
        text,
        new modules.Button({
          icon: "sap-icon://slim-arrow-right",
          type: "Transparent",
          tooltip: "Change on the detail page",
          press: () => {
            closePopover();
            location.hash = route;
          },
        }),
      ],
    });
    link.addStyleClass("tssreg-detail-value-link");
    row.addItem(link);
    return row;
  }

  function meetingTimesValue(item) {
    const event = item.event;
    const times = [fullRangeLabel(item.startMin, item.endMin), dayListLabel(event.EventScheduleDays)]
      .filter(Boolean)
      .join("   ");
    const dates = dateRangeLabel(event.ScheduleText);
    return [times, dates].filter(Boolean).join("\n");
  }

  function detailContent(item) {
    const event = item.event;
    const row = item.row;
    const route = detailRoute(row);
    const content = [];

    content.push(detailRow("Meeting Times", meetingTimesValue(item)));
    content.push(detailRow("Location / Room", roomLabel(event)));
    content.push(detailRow("Delivery Mode", event.DeliveryModeText));
    content.push(detailRow("Instructor", event.InstrText));
    content.push(detailRow("Modality", String(event.CategoryText || event.Category || "").trim()));
    content.push(detailRow("Event Text", String(event.EventNotes || "").trim()));

    const divider = new modules.VBox({ renderType: "Bare" });
    divider.addStyleClass("tssreg-detail-divider");
    content.push(divider);

    content.push(detailRow("Credits", creditsLabel(row), row.IsCreditsUpdateable ? route : null));
    content.push(detailRow("Status", row.SmStatusText));
    content.push(detailRow("Grading Option", row.TemplateText, row.IsTemplateUpdateable ? route : null));
    content.push(
      detailRow("Academic Year & Session", [row.AcademicYearText, row.AcademicSessionText].filter(Boolean).join(" - "))
    );
    content.push(detailRow("Event Package Name", row.EventPackageName));

    const box = new modules.VBox({ renderType: "Bare", items: content.filter(Boolean) });
    box.addStyleClass("tssreg-detail");
    return box;
  }

  function canWithdraw(item) {
    return !!item.event.WithdrawBtnEnable && !item.row.CancelNotAllowed && !item.row.Lockflag;
  }

  function detailFooter(item) {
    const route = detailRoute(item.row);
    const go = () => {
      closePopover();
      location.hash = route;
    };
    const content = [
      new modules.ToolbarSpacer(),
      new modules.Button({ text: "View in TSS", tooltip: "Open this course on the TSS detail page.", press: go }),
    ];
    if (canWithdraw(item)) {
      content.push(
        new modules.Button({ text: "Drop", type: "Reject", tooltip: "Open the TSS detail page to withdraw from this course.", press: go })
      );
    }
    return new modules.Toolbar({ content });
  }

  function closePopover() {
    const popover = sap.ui.getCore().byId(POPOVER_ID);
    if (popover) popover.destroy();
    openBlockKey = null;
  }

  function openPopover(item, control) {
    const blockKey = item.key + "|" + item.day;
    if (openBlockKey === blockKey) return void closePopover();
    closePopover();
    const popover = new modules.Popover(POPOVER_ID, {
      title: item.courseTitle + (item.courseCode ? " (" + item.courseCode + ")" : ""),
      placement: "Auto",
      contentWidth: "24rem",
      content: [detailContent(item)],
      footer: detailFooter(item),
      afterClose: () => {
        openBlockKey = null;
        popover.destroy();
      },
    });
    popover.addStyleClass("tssreg-detail-popover");
    openBlockKey = blockKey;
    popover.openBy(control);
  }

  function blockControl(item) {
    const meta = [item.method, item.room].filter(Boolean).join(" / ");
    const topRow = new modules.HBox({
      renderType: "Bare",
      justifyContent: "SpaceBetween",
      items: [
        labelled(rangeLabel(item.startMin, item.endMin), "tssreg-cal-block-time"),
        labelled(STATUS_LABEL[item.status] || "", "tssreg-cal-block-status"),
      ],
    });
    topRow.addStyleClass("tssreg-cal-block-toprow");
    const block = new modules.VBox({
      renderType: "Bare",
      items: [
        topRow,
        labelled(item.courseCode || item.courseTitle, "tssreg-cal-block-title", "Center"),
        meta && labelled(meta, "tssreg-cal-block-sub", "Center"),
        item.instructor && labelled(item.instructor, "tssreg-cal-block-instructor", "Center"),
      ].filter(Boolean),
    });
    block.addStyleClass("tssreg-cal-block");
    block.addStyleClass("tssreg-cal-status-" + item.status);
    if (item.conflict) block.addStyleClass("tssreg-cal-conflict");
    block.setTooltip([item.courseTitle, item.section, roomLabel(item.event), item.instructor].filter(Boolean).join("\n"));
    const open = () => openPopover(item, block);
    block.addEventDelegate({
      onclick: open,
      onsapselect: open,
      onAfterRendering: () => {
        const dom = block.getDomRef();
        if (!dom) return;
        dom.setAttribute("role", "button");
        dom.setAttribute("tabindex", "0");
      },
    });
    return block;
  }

  function swatch(styleClass) {
    return new modules.HTML({ content: '<span class="tssreg-cal-swatch ' + styleClass + '"></span>' });
  }

  function legendEntry(styleClass, text) {
    const entry = new modules.HBox({
      renderType: "Bare",
      alignItems: "Center",
      items: [swatch(styleClass), labelled(text, "tssreg-cal-legend-text")],
    });
    entry.addStyleClass("tssreg-cal-legend-item");
    return entry;
  }

  function legendControl(items) {
    const present = {};
    let conflict = false;
    items.forEach((item) => {
      present[item.status] = true;
      if (item.conflict) conflict = true;
    });
    const row = new modules.HBox({ renderType: "Bare", alignItems: "Center", wrap: "Wrap" });
    row.addStyleClass("tssreg-cal-legend");
    LEGEND_ORDER.filter((status) => present[status] && STATUS_LABEL[status]).forEach((status) =>
      row.addItem(legendEntry("tssreg-cal-status-" + status, STATUS_LABEL[status]))
    );
    if (conflict) row.addItem(legendEntry("tssreg-cal-swatch-conflict", "Time conflict"));
    return row;
  }

  function hourMarks(range) {
    const marks = [];
    for (let minute = range.startMin; minute <= range.endMin; minute += 60) marks.push(minute);
    return marks;
  }

  function buildCalendar(items) {
    const range = timeRange(items);
    const days = daysToShow(items);
    const placed = [];
    const labels = [];
    const tracks = [];

    const axis = new modules.VBox({ renderType: "Bare" });
    axis.addStyleClass("tssreg-cal-timeaxis");
    hourMarks(range).forEach((minute) => {
      const label = labelled(meridiemLabel(minute), "tssreg-cal-timeaxis-label", "End");
      labels.push({ control: label, minute });
      axis.addItem(label);
    });

    const dayRow = new modules.HBox({ renderType: "Bare" });
    dayRow.addStyleClass("tssreg-cal-days");
    days.forEach((day) => {
      const track = new modules.VBox({ renderType: "Bare" });
      track.addStyleClass("tssreg-cal-day-track");
      tracks.push(track);
      layoutDay(items.filter((item) => item.day === day)).forEach((item) => {
        const control = blockControl(item);
        placed.push({ control, item });
        track.addItem(control);
      });
      const header = labelled(DAY_NAMES[day], "tssreg-cal-day-header", "Center");
      const column = new modules.VBox({ renderType: "Bare", items: [header, track] });
      column.addStyleClass("tssreg-cal-day");
      dayRow.addItem(column);
    });

    const body = new modules.HBox({ renderType: "Bare", items: [axis, dayRow] });
    body.addStyleClass("tssreg-cal-body");

    const root = new modules.VBox(ROOT_ID, { renderType: "Bare", items: [legendControl(items), body] });
    root.addStyleClass("tssreg-cal");
    layout = { range, placed, labels, tracks, axis, root };
    root.addEventDelegate({ onAfterRendering: applyGeometry });
    return root;
  }

  function applyThemeVars(dom) {
    THEME_VARS.forEach(([name, parameter, fallback]) => {
      dom.style.setProperty(name, modules.Parameters.get({ name: parameter }) || fallback);
    });
  }

  function applyGeometry() {
    if (!layout) return;
    const rootDom = layout.root.getDomRef();
    if (!rootDom) return;
    applyThemeVars(rootDom);

    const { range, placed, labels, tracks } = layout;
    const totalMin = range.endMin - range.startMin;

    placed.forEach(({ control, item }) => {
      const dom = control.getDomRef();
      if (!dom) return;
      const width = 100 / item.columns;
      dom.style.left = item.column * width + "%";
      dom.style.width = width - 1 + "%";
      dom.style.height = "";
    });

    let contentHeight = MIN_BLOCK_HEIGHT;
    let shortest = totalMin;
    placed.forEach(({ control, item }) => {
      const dom = control.getDomRef();
      if (dom) contentHeight = Math.max(contentHeight, dom.offsetHeight);
      shortest = Math.min(shortest, item.endMin - item.startMin);
    });

    const pxPerMin = Math.max(1, (contentHeight + BREATHING_ROOM) / Math.max(shortest, 1));
    const trackHeight = totalMin * pxPerMin + TRACK_SLACK;

    placed.forEach(({ control, item }) => {
      const dom = control.getDomRef();
      if (!dom) return;
      dom.style.top = (item.startMin - range.startMin) * pxPerMin + "px";
      dom.style.height = Math.max((item.endMin - item.startMin) * pxPerMin - 2, 14) + "px";
    });

    tracks.forEach((track) => {
      const dom = track.getDomRef();
      if (dom) dom.style.height = trackHeight + "px";
    });

    const headerDom = rootDom.querySelector(".tssreg-cal-day-header");
    const headerHeight = headerDom ? headerDom.offsetHeight : 0;
    rootDom.style.setProperty("--tssreg-hour-px", 60 * pxPerMin + "px");

    const axisDom = layout.axis.getDomRef();
    if (axisDom) axisDom.style.height = trackHeight + headerHeight + "px";
    labels.forEach(({ control, minute }) => {
      const dom = control.getDomRef();
      if (dom) dom.style.top = (minute - range.startMin) * pxPerMin + headerHeight + "px";
    });
  }

  function signatureOf(items) {
    return JSON.stringify(
      items.map((item) => [
        item.key,
        item.day,
        item.startMin,
        item.endMin,
        item.status,
        item.courseCode,
        item.method,
        item.room,
        item.instructor,
      ])
    );
  }

  function mountAfterList(page, list, control) {
    const target = page.indexOfContent(list) + 1;
    if (page.indexOfContent(control) !== target) page.insertContent(control, target);
  }

  function removeLoading() {
    const loading = sap.ui.getCore().byId(LOADING_ID);
    if (loading) loading.destroy();
  }

  function showLoading(page, list, loaded, total) {
    const text = "Loading meeting times — " + loaded + " of " + total + " course" + (total === 1 ? "" : "s");
    let box = sap.ui.getCore().byId(LOADING_ID);
    if (!box) {
      box = new modules.VBox(LOADING_ID, {
        renderType: "Bare",
        items: [
          labelled(text, "tssreg-cal-loading-text"),
          new modules.ProgressIndicator({ percentValue: 0, showValue: false, height: "6px" }),
        ],
      });
      box.addStyleClass("tssreg-cal-loading");
    } else {
      box.getItems()[0].setText(text);
    }
    box.getItems()[1].setPercentValue(total ? Math.round((loaded / total) * 100) : 0);
    mountAfterList(page, list, box);
  }

  function teardown() {
    closePopover();
    removeLoading();
    const existing = sap.ui.getCore().byId(ROOT_ID);
    if (existing) existing.destroy();
    const page = pageControl();
    const list = page && listControl(page);
    if (list) setNativeListHidden(list, false);
    layout = null;
    rendered = null;
  }

  function apply() {
    if (!modules) return;
    if (!isCoursesRoute()) return void teardown();

    const page = pageControl();
    const list = page && listControl(page);
    if (!list) return;

    const entries = moduleEntries(list);
    if (!entries) return;

    setNativeListHidden(list, true);
    ensureEvents(entries);

    const loaded = entries.filter(({ row }) => eventsByPackage[row.EventPackageId]).length;
    if (loaded < entries.length) return void showLoading(page, list, loaded, entries.length);
    removeLoading();

    const items = scheduleItems(entries);
    if (!items.length) {
      setNativeListHidden(list, false);
      return;
    }

    const signature = signatureOf(items);
    let root = sap.ui.getCore().byId(ROOT_ID);
    if (signature !== rendered || !root) {
      closePopover();
      if (root) root.destroy();
      root = buildCalendar(items);
      rendered = signature;
    }
    mountAfterList(page, list, root);
  }

  window.__tssregShared.onUiUpdated(apply);
})();
