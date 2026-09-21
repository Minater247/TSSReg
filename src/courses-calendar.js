(() => {
  const ROOT_ID = "tssreg-courses-calendar";
  const LOADING_ID = "tssreg-courses-loading";
  const POPOVER_ID = "tssreg-courses-detail";
  const FINDER_ID = "tssreg-courses-finder";
  const PAGE_SELECTOR = '[id$="--mymodulesPage"]';
  const LIST_SUFFIX = /--mymodList$/;
  const HIDDEN_CLASS = "tssreg-native-list-hidden";
  const DETAIL_ROUTE = "#ZUSModule-display?TileType=MYMOD&sap-app-origin-hint=&/Detail/MyModules/";
  const SOC_ROUTE = "#YSchedule-view";
  const ITEMS_EVENT = "tssreg:schedule-items";
  const DAY_NAMES = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" };
  const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR"];
  const DAY_ORDER = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
  const STATUS_LABEL = { enrolled: "Enrolled", waitlisted: "Waitlisted", planned: "Planned", other: "" };
  const LEGEND_ORDER = ["enrolled", "waitlisted", "planned", "other"];
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

  const plans = window.__tssregShared.plans;
  let modules = null;
  const eventsByPackage = {};
  const pending = {};
  let rendered = null;
  let layout = null;
  let openBlockKey = null;
  let publishedItems = null;
  let publishedSignature = null;

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
      "sap/m/Select",
      "sap/m/MenuButton",
      "sap/m/Menu",
      "sap/m/MenuItem",
      "sap/m/Dialog",
      "sap/m/Input",
      "sap/m/MessageBox",
      "sap/ui/core/Item",
      "sap/ui/core/HTML",
    ],
    (Parameters, Text, Label, VBox, HBox, Button, Popover, Toolbar, ToolbarSpacer, ProgressIndicator, Select, MenuButton, Menu, MenuItem, Dialog, Input, MessageBox, Item, HTML) => {
      modules = { Parameters, Text, Label, VBox, HBox, Button, Popover, Toolbar, ToolbarSpacer, ProgressIndicator, Select, MenuButton, Menu, MenuItem, Dialog, Input, MessageBox, Item, HTML };
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
    if (binding.isLengthFinal && !binding.isLengthFinal()) return null;
    const model = binding.getModel();
    return binding
      .getCurrentContexts()
      .map((context) => ({ path: context.getPath(), row: context.getObject(), model }))
      .filter((entry) => entry.row && entry.row.EventPackageId);
  }

  function setNativeListHidden(list, hidden) {
    if (list.hasStyleClass(HIDDEN_CLASS) !== hidden) {
      if (hidden) list.addStyleClass(HIDDEN_CLASS);
      else list.removeStyleClass(HIDDEN_CLASS);
    }
    const toolbar = list.getHeaderToolbar && list.getHeaderToolbar();
    if (toolbar && toolbar.getVisible() === hidden) toolbar.setVisible(!hidden);
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
              roomFull: roomLabel(event),
              instructor: event.InstrText || "",
              event,
              row,
            });
          });
      });
    });
    return items;
  }

  function odataLiteral(value) {
    return "'" + String(value).replace(/'/g, "''") + "'";
  }

  function courseRoute(section) {
    if (!section.year || !section.term) return SOC_ROUTE;
    return (
      SOC_ROUTE +
      "&/YUCSD_CON_MODULE(AcademicYear=" +
      odataLiteral(section.year) +
      ",AcademicPeriod=" +
      odataLiteral(section.term) +
      ",ModuleID=" +
      odataLiteral(section.moduleId) +
      ")?layout=TwoColumnsMidExpanded"
    );
  }

  function plannedMeetingLabel(component) {
    const groups = {};
    (component.meetings || []).forEach((meeting) => {
      const key = meeting.startMin + "-" + meeting.endMin;
      if (!groups[key]) groups[key] = { startMin: meeting.startMin, endMin: meeting.endMin, days: [] };
      groups[key].days.push(meeting.day);
    });
    return Object.keys(groups)
      .map((key) => groups[key])
      .sort((a, b) => a.startMin - b.startMin)
      .map((group) => {
        const days = DAY_ORDER.filter((day) => group.days.indexOf(day) !== -1)
          .map((day) => DAY_NAMES[day])
          .join("/");
        return [days, fullRangeLabel(group.startMin, group.endMin)].filter(Boolean).join(" ");
      })
      .join("\n");
  }

  function plannedItems() {
    const plan = plans.current();
    if (!plan) return [];
    const items = [];
    plan.sections.forEach((section) => {
      section.components.forEach((component, index) => {
        component.meetings.forEach((meeting) => {
          items.push({
            key: "plan|" + section.moduleId + "|" + section.pkgId + "|" + index,
            day: meeting.day,
            startMin: meeting.startMin,
            endMin: meeting.endMin,
            status: "planned",
            courseCode: section.courseCode,
            courseTitle: section.title,
            section: component.abbr,
            method: component.type,
            room: component.location,
            roomFull: component.location,
            instructor: component.instructor,
            planned: { section, component },
          });
        });
      });
    });
    return items;
  }

  function overlapClusters(sorted) {
    const clusters = [];
    let current = null;
    let clusterEnd = -1;
    sorted.forEach((item) => {
      if (!current || item.startMin >= clusterEnd) {
        current = [];
        clusters.push(current);
        clusterEnd = item.endMin;
      } else if (item.endMin > clusterEnd) {
        clusterEnd = item.endMin;
      }
      current.push(item);
    });
    return clusters;
  }

  function layoutCluster(cluster) {
    const columnEnds = [];
    cluster.forEach((item) => {
      const free = columnEnds.findIndex((end) => end <= item.startMin);
      if (free === -1) {
        item.column = columnEnds.length;
        columnEnds.push(item.endMin);
        return;
      }
      columnEnds[free] = item.endMin;
      item.column = free;
    });
    cluster.forEach((item) => {
      item.columns = columnEnds.length;
    });
    cluster.forEach((a, index) => {
      cluster.slice(index + 1).forEach((b) => {
        if (a.startMin < b.endMin && b.startMin < a.endMin) {
          a.conflict = true;
          b.conflict = true;
        }
      });
    });
  }

  function layoutDay(dayItems) {
    const sorted = dayItems.slice().sort((a, b) => a.startMin - b.startMin);
    overlapClusters(sorted).forEach(layoutCluster);
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

  function detailBox(content) {
    const box = new modules.VBox({ renderType: "Bare", items: content.filter(Boolean) });
    box.addStyleClass("tssreg-detail");
    return box;
  }

  function plannedContent(item) {
    const section = item.planned.section;
    const component = item.planned.component;
    const content = [];
    content.push(detailRow("Meeting Times", plannedMeetingLabel(component)));
    content.push(detailRow("Location", component.location));
    content.push(detailRow("Instructor", component.instructor));
    if (section.components.length > 1) {
      const types = section.components.map((entry) => entry.type).filter(Boolean).join(", ");
      content.push(
        detailRow("Package", section.components.length + " components" + (types ? " (" + types + ")" : ""))
      );
    }
    content.push(detailRow("Credits", section.credits));
    content.push(detailRow("Status", "Planned \u2014 not enrolled"));
    return detailBox(content);
  }

  function enrolledContent(item) {
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

    return detailBox(content);
  }

  function detailContent(item) {
    return item.planned ? plannedContent(item) : enrolledContent(item);
  }

  function canWithdraw(item) {
    return !!item.event.WithdrawBtnEnable && !item.row.CancelNotAllowed && !item.row.Lockflag;
  }

  function plannedFooter(item) {
    const section = item.planned.section;
    const types = section.components.map((entry) => entry.type).filter(Boolean).join(", ");
    return new modules.Toolbar({
      content: [
        new modules.ToolbarSpacer(),
        new modules.Button({
          text: "Enroll",
          type: "Emphasized",
          tooltip: "Open this course in the Schedule of Classes to enroll.",
          press: () => {
            closePopover();
            location.hash = courseRoute(section);
          },
        }),
        new modules.Button({
          text: "Remove",
          type: "Reject",
          tooltip:
            section.components.length > 1
              ? "Removes the whole package" + (types ? " (" + types + ")" : "") + ", not just this meeting."
              : "Remove this course from the schedule.",
          press: () => {
            closePopover();
            plans.removeSection(section.moduleId, section.pkgId);
          },
        }),
      ],
    });
  }

  function enrolledFooter(item) {
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

  function detailFooter(item) {
    return item.planned ? plannedFooter(item) : enrolledFooter(item);
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
    block.setTooltip([item.courseTitle, item.section, item.roomFull, item.instructor].filter(Boolean).join("\n"));
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

  function promptFor(title, label, initial, confirmText, onConfirm) {
    const input = new modules.Input({ value: initial, width: "100%" });
    const submit = () => {
      const value = input.getValue().trim();
      if (!value) return;
      dialog.close();
      onConfirm(value);
    };
    const caption = new modules.Label({ text: label, labelFor: input });
    const dialog = new modules.Dialog({
      title,
      contentWidth: "20rem",
      content: [new modules.VBox({ renderType: "Bare", items: [caption, input] }).addStyleClass("tssreg-plan-dialog")],
      beginButton: new modules.Button({ text: confirmText, type: "Emphasized", press: submit }),
      endButton: new modules.Button({ text: "Cancel", press: () => dialog.close() }),
      afterClose: () => dialog.destroy(),
    });
    input.attachSubmit(submit);
    dialog.open();
  }

  function confirmDelete(plan) {
    modules.MessageBox.confirm("Delete the schedule \u201c" + plan.name + "\u201d?", {
      title: "Delete Schedule",
      actions: [modules.MessageBox.Action.DELETE, modules.MessageBox.Action.CANCEL],
      emphasizedAction: modules.MessageBox.Action.DELETE,
      onClose: (action) => {
        if (action === modules.MessageBox.Action.DELETE) plans.remove(plan);
      },
    });
  }

  function planMenu(plan) {
    const items = [
      new modules.MenuItem({
        text: "New schedule",
        icon: "sap-icon://add",
        press: () => promptFor("New Schedule", "Name", plans.defaultName(), "Create", (name) => plans.create(name)),
      }),
    ];
    if (plan) {
      items.push(
        new modules.MenuItem({
          text: "Duplicate",
          icon: "sap-icon://copy",
          press: () => promptFor("Duplicate Schedule", "Name", plan.name + " copy", "Duplicate", (name) => plans.duplicate(plan, name)),
        }),
        new modules.MenuItem({
          text: "Rename",
          icon: "sap-icon://edit",
          press: () => promptFor("Rename Schedule", "Name", plan.name, "Rename", (name) => plans.rename(plan, name)),
        }),
        new modules.MenuItem({
          text: "Delete",
          icon: "sap-icon://delete",
          press: () => confirmDelete(plan),
        })
      );
    }
    return new modules.Menu({ items });
  }

  function planControls() {
    const plan = plans.current();
    const all = plans.list();
    const caption = new modules.Label({ text: "My Schedule:" });
    caption.addStyleClass("tssreg-cal-plan-label");
    const select = new modules.Select({
      width: "12rem",
      items: all.length
        ? all.map((entry) => new modules.Item({ key: entry.id, text: entry.name + " (" + entry.sections.length + ")" }))
        : [new modules.Item({ key: "", text: "No schedule yet" })],
      selectedKey: plan ? plan.id : "",
      enabled: all.length > 0,
      change: (event) => {
        const selected = event.getParameter("selectedItem");
        const key = selected && selected.getKey();
        if (key) plans.select(key);
      },
    });
    select.addStyleClass("tssreg-cal-plan-select");
    const actions = new modules.MenuButton({
      icon: "sap-icon://overflow",
      tooltip: "Schedule actions",
      buttonMode: "Regular",
      menu: planMenu(plan),
    });
    const box = new modules.HBox({ renderType: "Bare", alignItems: "Center", items: [caption, select, actions] });
    box.addStyleClass("tssreg-cal-plan");
    return box;
  }

  function buildChrome(items) {
    const bar = new modules.HBox({ renderType: "Bare", alignItems: "Center", wrap: "Wrap" });
    bar.addStyleClass("tssreg-cal-toolbar");
    bar.addItem(planControls());
    bar.addItem(legendControl(items));
    return bar;
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

    const root = new modules.VBox(ROOT_ID, { renderType: "Bare", items: [buildChrome(items), body] });
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

  function publishItems(items) {
    const signature = items && JSON.stringify(items.map((item) => [item.day, item.startMin, item.endMin, item.key]));
    if (signature === publishedSignature) return;
    publishedSignature = signature;
    publishedItems = items;
    window.dispatchEvent(new CustomEvent(ITEMS_EVENT));
  }

  function busyIntervals() {
    if (!publishedItems) return null;
    const byDay = {};
    publishedItems.forEach((item) => {
      const list = byDay[item.day] || (byDay[item.day] = []);
      list.push({
        startMin: item.startMin,
        endMin: item.endMin,
        pkgId: item.planned ? item.planned.section.pkgId : null,
      });
    });
    return byDay;
  }

  function signatureOf(items) {
    return JSON.stringify([
      plans.signature(),
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
      ]),
    ]);
  }

  function mountAfterList(page, list, control) {
    const finder = sap.ui.getCore().byId(FINDER_ID);
    const anchor = finder && page.indexOfContent(finder) !== -1 ? finder : list;
    const target = page.indexOfContent(anchor) + 1;
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

  function destroyCalendar() {
    closePopover();
    const existing = sap.ui.getCore().byId(ROOT_ID);
    if (existing) existing.destroy();
    layout = null;
    rendered = null;
  }

  function teardown() {
    publishItems(null);
    removeLoading();
    destroyCalendar();
    const page = pageControl();
    const list = page && listControl(page);
    if (list) setNativeListHidden(list, false);
  }

  function apply() {
    if (!modules) return;
    if (!isCoursesRoute()) return void teardown();

    const page = pageControl();
    const list = page && listControl(page);
    if (!list) return;

    const entries = moduleEntries(list);
    if (!entries) return void publishItems(null);

    if (entries.length) {
      ensureEvents(entries);
      const loaded = entries.filter(({ row }) => eventsByPackage[row.EventPackageId]).length;
      if (loaded < entries.length) {
        setNativeListHidden(list, true);
        publishItems(null);
        return void showLoading(page, list, loaded, entries.length);
      }
    }
    removeLoading();

    const items = scheduleItems(entries).concat(plannedItems());
    publishItems(items);
    if (!items.length) {
      setNativeListHidden(list, false);
      destroyCalendar();
      return;
    }
    setNativeListHidden(list, true);

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

  window.__tssregShared.schedule = { ITEMS_EVENT, items: () => publishedItems, busyIntervals };

  window.__tssregShared.onUiUpdated(apply);
  window.addEventListener(plans.CHANGE_EVENT, apply);
})();
