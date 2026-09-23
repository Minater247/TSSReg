(() => {
  const ROOT_ID = "tssreg-courses-calendar";
  const LOADING_ID = "tssreg-courses-loading";
  const POPOVER_ID = "tssreg-courses-detail";
  const FINDER_ID = "tssreg-courses-finder";
  const MODE_SCHEDULE = "schedule";
  const MODE_FINALS = "finals";
  const DAY_MS = 86400000;
  const HIDDEN_CLASS = "tssreg-native-list-hidden";
  const DETAIL_ROUTE = "#ZUSModule-display?TileType=MYMOD&sap-app-origin-hint=&/Detail/MyModules/";
  const ITEMS_EVENT = "tssreg:schedule-items";
  const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR"];
  const STATUS_LABEL = { enrolled: "Enrolled", waitlisted: "Waitlisted", planned: "Planned", other: "" };
  const LEGEND_ORDER = ["enrolled", "waitlisted", "planned", "other"];
  const THEME_VARS = [
    ["--tssreg-border", "sapUiListBorderColor", "#e5e5e5"],
    ["--tssreg-line", "sapUiGroupContentBorderColor", "#f0f0f0"],
    ["--tssreg-bg", "sapUiListBackground", "#ffffff"],
    ["--tssreg-text", "sapUiBaseText", "#131e29"],
    ["--tssreg-muted", "sapUiContentLabelColor", "#556b82"],
  ];

  const plans = window.__tssregShared.plans;
  const catalog = window.__tssregShared.catalog;
  const coursesPage = window.__tssregShared.coursesPage;
  const { MIN_BLOCK_HEIGHT, BREATHING_ROOM, TRACK_SLACK } = window.__tssregShared.scheduleExport;
  const { DAY_NAMES, DAY_ORDER, DAY_FROM_DOW, isCoursesRoute, pageControl, listControl } = coursesPage;
  const { rangeLabel, meridiemLabel, fullRangeLabel, dayListLabel } = coursesPage;
  let modules = null;
  const eventsByPackage = {};
  const meetingsBySection = {};
  const finalsByPackage = {};
  const buildings = {};
  const inFlight = [];
  const retired = [];
  const modulesLoaded = {};
  const pending = {};
  const pendingModules = {};
  let rendered = null;
  let layout = null;
  let openBlockKey = null;
  let publishedItems = null;
  let publishedSignature = null;
  let mode = MODE_SCHEDULE;
  let dayDates = null;
  let readEpoch = 0;

  window.__tssregShared.whenSapReady(() => {
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
        "sap/m/MenuButton",
        "sap/m/Menu",
        "sap/m/MenuItem",
        "sap/m/Dialog",
        "sap/m/Input",
        "sap/m/MessageBox",
        "sap/m/IconTabHeader",
        "sap/m/IconTabFilter",
        "sap/ui/core/HTML",
      ],
      (Parameters, Text, Label, VBox, HBox, Button, Popover, Toolbar, ToolbarSpacer, ProgressIndicator, MenuButton, Menu, MenuItem, Dialog, Input, MessageBox, IconTabHeader, IconTabFilter, HTML) => {
        modules = { Parameters, Text, Label, VBox, HBox, Button, Popover, Toolbar, ToolbarSpacer, ProgressIndicator, MenuButton, Menu, MenuItem, Dialog, Input, MessageBox, IconTabHeader, IconTabFilter, HTML };
      }
    );
  });

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

  function dropRead(entry) {
    const index = inFlight.indexOf(entry);
    if (index !== -1) inFlight.splice(index, 1);
  }

  function abortReads() {
    readEpoch += 1;
    inFlight.splice(0).forEach((entry) => {
      if (entry.handle && entry.handle.abort) entry.handle.abort();
    });
    Object.keys(pending).forEach((key) => delete pending[key]);
  }

  function ensureEvents(entries) {
    entries.forEach(({ path, row, model }) => {
      const pkg = row.EventPackageId;
      if (eventsByPackage[pkg] || pending[pkg]) return;
      pending[pkg] = true;
      const entry = { epoch: readEpoch };
      inFlight.push(entry);
      entry.handle = model.read(path + "/Event", {
        success: (data) => {
          dropRead(entry);
          if (entry.epoch !== readEpoch) return;
          delete pending[pkg];
          eventsByPackage[pkg] = data.results || (data.EventId ? [data] : []);
          apply();
        },
        error: () => {
          dropRead(entry);
          if (entry.epoch !== readEpoch) return;
          delete pending[pkg];
          eventsByPackage[pkg] = [];
          apply();
        },
      });
    });
  }

  function moduleKey(row) {
    return catalog.scheduleKey(row.AcademicYear, row.AcademicSession, row.SmObjid, "");
  }

  function planSections() {
    const plan = plans.current();
    return plan ? plan.sections.filter((section) => section.year && section.term) : [];
  }

  function planModuleKey(section) {
    return catalog.scheduleKey(section.year, section.term, section.moduleId, "");
  }

  function collect(groups, year, term, moduleId, key) {
    const id = catalog.plainId(moduleId);
    if (!id || modulesLoaded[key] || pendingModules[key]) return;
    const name = year + "|" + term;
    const group = groups[name] || (groups[name] = { year, term, ids: [], keys: [] });
    if (group.ids.indexOf(id) === -1) group.ids.push(id);
    if (group.keys.indexOf(key) === -1) group.keys.push(key);
  }

  function ensureMeetings(entries) {
    const groups = {};
    entries.forEach(({ row }) =>
      collect(groups, row.AcademicYear, row.AcademicSession, row.SmObjid, moduleKey(row))
    );
    planSections().forEach((section) =>
      collect(groups, section.year, section.term, section.moduleId, planModuleKey(section))
    );
    Object.keys(groups).forEach((name) => {
      const group = groups[name];
      group.keys.forEach((key) => (pendingModules[key] = true));
      Promise.all([
        catalog.loadMeetings(group.ids, group.year, group.term).catch(() => ({})),
        catalog.loadFinals(group.ids, group.year, group.term).catch(() => []),
        catalog.loadBuildings(group.year, group.term).catch(() => ({})),
      ])
        .then(([found, finals, halls]) => {
          Object.keys(found).forEach((key) => (meetingsBySection[key] = found[key]));
          finals.forEach((final) => {
            finalsByPackage[final.moduleId + "|" + final.pkgId] = final;
          });
          Object.keys(halls).forEach((key) => (buildings[key] = halls[key]));
          group.keys.forEach((key) => {
            delete pendingModules[key];
            modulesLoaded[key] = true;
          });
          apply();
        });
    });
  }

  function meetingsFor(row, event) {
    const found = meetingsBySection[catalog.scheduleKey(row.AcademicYear, row.AcademicSession, row.SmObjid, event.EventId)];
    if (found && found.length) return found;
    const startMin = minutesOf(event.StartTime);
    const endMin = minutesOf(event.EndTime);
    if (startMin == null || endMin == null || endMin <= startMin) return [];
    return String(event.EventScheduleDays || "")
      .split("/")
      .filter((day) => DAY_NAMES[day])
      .map((day) => ({ day, startMin, endMin }));
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
        meetingsFor(row, event).forEach(({ day, startMin, endMin }) => {
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

  function roomLabels(text) {
    const raw = String(text || "").trim();
    if (!raw) return null;
    const match = /^(.*?)\s+Room\s+(.+)$/i.exec(raw);
    if (!match) return { short: raw, full: raw };
    const code = buildings[match[1].trim()] || match[1].trim();
    return { short: code + " " + match[2].trim(), full: code + " - " + match[2].trim() };
  }

  function finalItem(final, key, status, courseCode, courseTitle, extra) {
    const labels = roomLabels(final.room);
    return Object.assign(
      {
        key,
        day: dateKey(final.date),
        startMin: final.startMin,
        endMin: final.endMin,
        status,
        date: final.date,
        courseCode,
        courseTitle,
        section: final.abbr,
        method: "Final Exam",
        room: labels ? labels.short : "Room TBA",
        roomFull: labels ? labels.full : "Room not posted yet",
        instructor: final.instructor,
        final: true,
      },
      extra
    );
  }

  function finalsItems(entries) {
    const items = [];
    entries.forEach(({ row }) => {
      const final = finalsByPackage[catalog.plainId(row.SmObjid) + "|" + catalog.plainId(row.EventPackageId)];
      if (!final) return;
      items.push(
        finalItem(final, "final|" + row.EventPackageId, statusOf(row), row.SmShort || "", row.SmStext || "", { row })
      );
    });
    return items;
  }

  function monthDay(date) {
    return date.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
  }

  function dateKey(date) {
    return (
      date.getUTCFullYear() +
      "-" +
      String(date.getUTCMonth() + 1).padStart(2, "0") +
      "-" +
      String(date.getUTCDate()).padStart(2, "0")
    );
  }

  function weekdayOf(date) {
    return DAY_FROM_DOW[((date.getUTCDay() + 6) % 7) + 1];
  }

  function finalsWeek(items) {
    if (!items.length) return [];
    const earliest = new Date(Math.min.apply(null, items.map((item) => item.date.getTime())));
    const saturday = new Date(earliest.getTime() - ((earliest.getUTCDay() + 1) % 7) * DAY_MS);
    const week = [];
    for (let offset = 0; offset <= 7; offset++) week.push(new Date(saturday.getTime() + offset * DAY_MS));
    return week;
  }

  function finalsDayDates(items) {
    const out = {};
    finalsWeek(items).forEach((date) => {
      out[dateKey(date)] = DAY_NAMES[weekdayOf(date)] + " " + monthDay(date);
    });
    return out;
  }

  function dayLabel(day) {
    return (dayDates && dayDates[day]) || DAY_NAMES[day];
  }

  function plannedItems() {
    const plan = plans.current();
    if (!plan) return [];
    const items = [];
    plan.sections.forEach((section) => {
      section.components.forEach((component, index) => {
        const labels = roomLabels(component.location);
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
            room: labels ? labels.short : "",
            roomFull: labels ? labels.full : "",
            instructor: component.instructor,
            planned: { section, component },
          });
        });
      });
    });
    return items;
  }

  function plannedFinalsItems() {
    const items = [];
    planSections().forEach((section) => {
      const final = finalsByPackage[catalog.plainId(section.moduleId) + "|" + catalog.plainId(section.pkgId)];
      if (!final) return;
      items.push(
        finalItem(final, "planfinal|" + section.moduleId + "|" + section.pkgId, "planned", section.courseCode, section.title, {
          planned: { section, component: section.components[0] || null },
        })
      );
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

  function examDateLabel(date) {
    return date.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
  }

  function finalContent(item) {
    const content = [];
    content.push(detailRow("Exam Date", examDateLabel(item.date)));
    content.push(detailRow("Exam Time", fullRangeLabel(item.startMin, item.endMin)));
    content.push(detailRow("Location", item.roomFull));
    content.push(detailRow("Instructor", item.instructor));
    content.push(detailRow("Status", item.planned ? "Planned" : (item.row && item.row.SmStatusText) || ""));
    return detailBox(content);
  }

  function plannedContent(item) {
    const section = item.planned.section;
    const component = item.planned.component;
    const content = [];
    content.push(detailRow("Meeting Times", coursesPage.meetingLabel(component.meetings)));
    content.push(detailRow("Location", component.location));
    content.push(detailRow("Instructor", component.instructor));
    if (section.components.length > 1) {
      const types = section.components.map((entry) => entry.type).filter(Boolean).join(", ");
      content.push(detailRow("Includes", types || section.components.length + " meetings"));
    }
    content.push(detailRow("Credits", section.credits));
    content.push(detailRow("Status", "Planned"));
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
    if (item.final) return finalContent(item);
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
          tooltip: "Open this course in the Schedule of Classes",
          press: () => {
            closePopover();
            location.hash = coursesPage.courseRoute(section.year, section.term, section.moduleId);
          },
        }),
        new modules.Button({
          text: "Unplan",
          type: "Reject",
          tooltip:
            section.components.length > 1
              ? "Unplans the whole class" + (types ? " (" + types + ")" : "")
              : "Unplans this class",
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
      new modules.Button({ text: "View in TSS", tooltip: "Open this course on the TSS detail page", press: go }),
    ];
    if (canWithdraw(item)) {
      content.push(
        new modules.Button({ text: "Drop", type: "Reject", tooltip: "Open the TSS detail page to withdraw", press: go })
      );
    }
    return new modules.Toolbar({ content });
  }

  function finalFooter(item) {
    return new modules.Toolbar({
      content: [
        new modules.ToolbarSpacer(),
        new modules.Button({
          text: "View in TSS",
          tooltip: "Open this course on the TSS detail page",
          press: () => {
            closePopover();
            location.hash = detailRoute(item.row);
          },
        }),
      ],
    });
  }

  function detailFooter(item) {
    if (item.planned) return plannedFooter(item);
    return item.final ? finalFooter(item) : enrolledFooter(item);
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

  function legendModel(items) {
    const present = {};
    let conflict = false;
    items.forEach((item) => {
      present[item.status] = true;
      if (item.conflict) conflict = true;
    });
    const entries = LEGEND_ORDER.filter((status) => present[status] && STATUS_LABEL[status]).map((status) => ({
      status,
      label: STATUS_LABEL[status],
    }));
    if (conflict) entries.push({ status: "conflict", label: "Time conflict" });
    return entries;
  }

  function legendControl(items) {
    const row = new modules.HBox({ renderType: "Bare", alignItems: "Center", wrap: "Wrap" });
    row.addStyleClass("tssreg-cal-legend");
    legendModel(items).forEach((entry) =>
      row.addItem(
        legendEntry(
          entry.status === "conflict" ? "tssreg-cal-swatch-conflict" : "tssreg-cal-status-" + entry.status,
          entry.label
        )
      )
    );
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

  function planLabel(plan) {
    return plan.name + " (" + plan.sections.length + ")";
  }

  function planMenu(plan, all) {
    const items = all.map(
      (entry) =>
        new modules.MenuItem({
          text: planLabel(entry),
          icon: plan && entry.id === plan.id ? "sap-icon://accept" : "",
          press: () => plans.select(entry.id),
        })
    );
    items.push(
      new modules.MenuItem({
        text: "New schedule",
        icon: "sap-icon://add",
        startsSection: items.length > 0,
        press: () => promptFor("New Schedule", "Name", plans.defaultName(), "Create", (name) => plans.create(name)),
      })
    );
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
    const picker = new modules.MenuButton({
      text: plan ? planLabel(plan) : "No schedule yet",
      tooltip: "Choose a schedule",
      width: "12rem",
      buttonMode: "Regular",
      menu: planMenu(plan, plans.list()),
    });
    picker.addStyleClass("tssreg-cal-plan-select");
    return picker;
  }

  function exportTitle() {
    if (mode === MODE_FINALS) return "Final Exams";
    const plan = plans.current();
    return plan ? plan.name : "";
  }

  function exportModel() {
    if (!layout) return null;
    const items = layout.placed.map(({ item }) => ({
      day: item.day,
      startMin: item.startMin,
      endMin: item.endMin,
      column: item.column,
      columns: item.columns,
      conflict: !!item.conflict,
      status: item.status,
      timeLabel: rangeLabel(item.startMin, item.endMin),
      statusLabel: STATUS_LABEL[item.status] || "",
      title: item.courseCode || item.courseTitle,
      meta: [item.method, item.room].filter(Boolean).join(" / "),
      instructor: item.instructor || "",
    }));
    return {
      planName: exportTitle(),
      range: layout.range,
      days: layout.days.map((day) => ({ key: day, label: dayLabel(day) })),
      hours: hourMarks(layout.range).map((minute) => ({ minute, label: meridiemLabel(minute) })),
      legend: legendModel(items),
      items,
    };
  }

  function exportButton() {
    const button = new modules.Button({
      text: "Export Schedule",
      icon: "sap-icon://download",
      tooltip: "Saves a PNG image",
      press: () => window.__tssregShared.scheduleExport.download(exportModel()),
    });
    button.addStyleClass("tssreg-cal-export");
    return button;
  }

  function buildChrome(items) {
    const bar = new modules.HBox({ renderType: "Bare", alignItems: "Center", wrap: "Wrap" });
    bar.addStyleClass("tssreg-cal-toolbar");
    bar.addItem(buildTabs());
    bar.addItem(planControls());
    bar.addItem(legendControl(items));
    if (items.length) bar.addItem(exportButton());
    return bar;
  }

  function hourMarks(range) {
    const marks = [];
    for (let minute = range.startMin; minute <= range.endMin; minute += 60) marks.push(minute);
    return marks;
  }

  function buildCalendar(items) {
    const range = timeRange(items);
    const days = mode === MODE_FINALS ? finalsWeek(items).map(dateKey) : daysToShow(items);
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
      const header = labelled(dayLabel(day), "tssreg-cal-day-header", "Center");
      const column = new modules.VBox({ renderType: "Bare", items: [header, track] });
      column.addStyleClass("tssreg-cal-day");
      dayRow.addItem(column);
    });

    const body = new modules.HBox({ renderType: "Bare", items: [axis, dayRow] });
    body.addStyleClass("tssreg-cal-body");

    layout = { range, days, placed, labels, tracks, axis, root: calendarRoot() };
    return [buildChrome(items), body];
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
      mode,
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

  function removeLoading() {
    const loading = sap.ui.getCore().byId(LOADING_ID);
    if (loading) loading.destroy();
  }

  function showLoading(page, list, loaded, total) {
    const text = "Loading meeting times: " + loaded + " of " + total + " course" + (total === 1 ? "" : "s");
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
    coursesPage.mountAfterList(page, list, box, FINDER_ID);
  }

  function buildTabs() {
    const header = new modules.IconTabHeader({
      selectedKey: mode,
      backgroundDesign: "Transparent",
      items: [
        new modules.IconTabFilter({ key: MODE_SCHEDULE, text: "Schedule" }),
        new modules.IconTabFilter({ key: MODE_FINALS, text: "Finals" }),
      ],
      select: (event) => {
        const key = event.getParameter("key");
        if (key === mode) return;
        mode = key;
        closePopover();
        apply();
      },
    });
    header.addStyleClass("tssreg-cal-tabs");
    return header;
  }

  function buildEmpty() {
    const text = new modules.Text({ text: "No final exams are scheduled for your courses yet." });
    text.addStyleClass("tssreg-cal-empty");
    layout = null;
    return [buildChrome([]), text];
  }

  function onRootRendered() {
    retired.splice(0).forEach((control) => control.destroy());
    applyGeometry();
  }

  function calendarRoot() {
    const existing = sap.ui.getCore().byId(ROOT_ID);
    if (existing) return existing;
    const root = new modules.VBox(ROOT_ID, { renderType: "Bare" });
    root.addStyleClass("tssreg-cal");
    root.addEventDelegate({ onAfterRendering: onRootRendered });
    return root;
  }

  function swapContent(root, items) {
    root.removeAllItems().forEach((control) => retired.push(control));
    items.forEach((item) => root.addItem(item));
  }

  function destroyCalendar() {
    closePopover();
    retired.splice(0).forEach((control) => control.destroy());
    const existing = sap.ui.getCore().byId(ROOT_ID);
    if (existing) existing.destroy();
    layout = null;
    rendered = null;
  }

  function teardown() {
    abortReads();
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
      ensureMeetings(entries);
      const planned = planSections();
      const total = entries.length + planned.length;
      const loaded =
        entries.filter(({ row }) => eventsByPackage[row.EventPackageId] && modulesLoaded[moduleKey(row)]).length +
        planned.filter((section) => modulesLoaded[planModuleKey(section)]).length;
      if (loaded < total) {
        setNativeListHidden(list, true);
        publishItems(null);
        return void showLoading(page, list, loaded, total);
      }
    }
    removeLoading();

    const scheduled = scheduleItems(entries).concat(plannedItems());
    publishItems(scheduled);
    if (!scheduled.length) {
      setNativeListHidden(list, false);
      destroyCalendar();
      return;
    }
    setNativeListHidden(list, true);

    const showing = mode === MODE_FINALS ? finalsItems(entries).concat(plannedFinalsItems()) : scheduled;
    dayDates = mode === MODE_FINALS && showing.length ? finalsDayDates(showing) : null;

    const signature = signatureOf(showing);
    const root = calendarRoot();
    if (signature !== rendered || !root.getItems().length) {
      closePopover();
      swapContent(root, showing.length ? buildCalendar(showing) : buildEmpty());
      rendered = signature;
    }
    coursesPage.mountAfterList(page, list, root, FINDER_ID);
  }

  window.__tssregShared.schedule = { ITEMS_EVENT, items: () => publishedItems, busyIntervals };

  window.__tssregShared.onUiUpdated(apply);
  window.addEventListener(plans.CHANGE_EVENT, apply);
  window.addEventListener("hashchange", () => {
    if (!isCoursesRoute()) abortReads();
  });
})();
