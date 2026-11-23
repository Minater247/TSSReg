(() => {
  const ROOT_ID = "tssreg-courses-finder";
  const DAY_PILLS = [
    ["MO", "M", "Monday"],
    ["TU", "Tu", "Tuesday"],
    ["WE", "W", "Wednesday"],
    ["TH", "Th", "Thursday"],
    ["FR", "F", "Friday"],
    ["SA", "Sa", "Saturday"],
    ["SU", "Su", "Sunday"],
  ];
  const TIME_STEP = 30;
  const PAGE_SIZE = 10;
  const LOW_SEAT_LIMIT = 3;
  const LONG_WAITLIST_MIN = 10;
  const LEVELS = [
    ["Lower Division", "Lower Division"],
    ["Upper Division", "Upper Division"],
    ["Graduate", "Graduate"],
  ];
  const AVAILABILITY = [
    ["", "Any"],
    ["open", "Open"],
    ["openwl", "Open or Waitlist"],
  ];
  const WISHLISTED = [
    ["", "Any"],
    ["Y", "Wishlisted"],
    ["N", "Not wishlisted"],
  ];

  const catalog = window.__tssregShared.catalog;
  const coursesPage = window.__tssregShared.coursesPage;
  const { isCoursesRoute, pageControl, listControl, meridiemLabel } = coursesPage;
  const plans = window.__tssregShared.plans;
  const schedule = window.__tssregShared.schedule;

  const sectionsByModule = {};
  const fetching = {};
  const expandedCourses = new Set();
  const revealedConflicts = new Set();

  const state = {
    open: true,
    advanced: false,
    loading: false,
    ready: false,
    catalogError: "",
    searched: false,
    busy: false,
    error: "",
    results: [],
    page: 1,
    year: "",
    term: "",
    years: [],
    terms: [],
    help: { departments: [], buildings: [], modalities: [] },
    credits: { min: catalog.UNITS_MIN, max: catalog.UNITS_MAX },
    instructors: null,
    instructorsPending: false,
    f: {
      q: "",
      dept: "",
      instructor: "",
      days: {},
      levels: {},
      buildings: {},
      modality: "",
      avail: "",
      sectionId: "",
      wishlisted: "",
      unitsMin: catalog.UNITS_MIN,
      unitsMax: catalog.UNITS_MAX,
      timeMin: catalog.TIME_MIN,
      timeMax: catalog.TIME_MAX,
      conflictMode: "collapse",
    },
  };

  let modules = null;
  let ui = null;
  let searchToken = 0;
  let termToken = 0;
  let refreshPending = false;

  window.__tssregShared.whenSapReady(() => {
    sap.ui.require(
      [
        "sap/m/Panel",
        "sap/m/Toolbar",
        "sap/m/ToolbarSeparator",
        "sap/m/Text",
        "sap/m/Label",
        "sap/m/VBox",
        "sap/m/HBox",
        "sap/m/Button",
        "sap/m/SearchField",
        "sap/m/Input",
        "sap/m/Select",
        "sap/m/ComboBox",
        "sap/m/MultiComboBox",
        "sap/m/RangeSlider",
        "sap/m/Table",
        "sap/m/Column",
        "sap/m/ColumnListItem",
        "sap/m/ObjectStatus",
        "sap/m/BusyIndicator",
        "sap/ui/layout/AlignedFlowLayout",
        "sap/ui/layout/VerticalLayout",
        "sap/ui/core/HTML",
        "sap/ui/core/Item",
      ],
      function () {
        const names = [
          "Panel", "Toolbar", "ToolbarSeparator", "Text", "Label", "VBox", "HBox", "Button",
          "SearchField", "Input", "Select", "ComboBox", "MultiComboBox", "RangeSlider", "Table", "Column",
          "ColumnListItem", "ObjectStatus", "BusyIndicator", "AlignedFlowLayout", "VerticalLayout", "HTML", "Item",
        ];
        const loaded = {};
        names.forEach((name, index) => (loaded[name] = arguments[index]));
        modules = loaded;
        apply();
      }
    );
  });

  function text(value, styleClass) {
    const control = new modules.Text({ text: value, wrapping: true });
    if (styleClass) control.addStyleClass(styleClass);
    return control;
  }

  function captionLabel(value, tooltip, required) {
    const caption = new modules.Label({
      text: value,
      showColon: !!String(value).trim(),
      required: !!required,
      width: "100%",
    });
    if (tooltip) caption.setTooltip(tooltip);
    return caption;
  }

  function fieldWith(caption, control, extra) {
    caption.setLabelFor(control);
    const box = new modules.VerticalLayout({ width: "100%", content: [caption, control].concat(extra || []) });
    box.addStyleClass("tssreg-find-field");
    return box;
  }

  function field(caption, control, tooltip, required) {
    return fieldWith(captionLabel(caption, tooltip, required), control);
  }

  function choiceRow(options, selected, onSelect) {
    const row = new modules.HBox({ renderType: "Bare", wrap: "Wrap" });
    row.addStyleClass("tssreg-find-pills");
    const buttons = [];
    options.forEach(([key, caption]) => {
      const button = new modules.Button({
        text: caption,
        type: pillType(selected === key),
        press: () => {
          buttons.forEach((entry) => entry.button.setType(pillType(entry.key === key)));
          onSelect(key);
        },
      });
      button.addStyleClass("tssreg-find-pill");
      buttons.push({ key, button });
      row.addItem(button);
    });
    return row;
  }

  function rangeField(caption, tooltip, config) {
    const label = captionLabel(caption, tooltip);
    const readout = config.format ? new modules.Text({ text: config.format() }) : null;
    if (readout) readout.addStyleClass("tssreg-find-readout");
    const slider = new modules.RangeSlider({
      width: "100%",
      min: config.min,
      max: config.max,
      step: config.step,
      range: config.range,
      enableTickmarks: true,
      liveChange: (event) => {
        config.apply(event.getParameter("range"));
        if (readout) readout.setText(config.format());
      },
      change: resetResultsPage,
    });
    const box = fieldWith(label, slider, readout ? [readout] : []);
    box.addStyleClass("tssreg-find-slider");
    return box;
  }

  function selectItems(pairs) {
    return pairs.map(([key, value]) => new modules.Item({ key, text: value }));
  }

  function optionItems(rows, placeholder) {
    const items = placeholder ? [new modules.Item({ key: "", text: placeholder })] : [];
    return items.concat(rows.map((row) => new modules.Item({ key: row.key, text: row.text })));
  }

  function pillType(on) {
    return on ? "Emphasized" : "Default";
  }

  function pillRow(pills, selected, onToggle) {
    const row = new modules.HBox({ renderType: "Bare", wrap: "Wrap" });
    row.addStyleClass("tssreg-find-pills");
    pills.forEach(([key, caption, tooltip]) => {
      const button = new modules.Button({
        text: caption,
        tooltip,
        type: pillType(selected[key]),
        press: () => {
          const on = !selected[key];
          button.setType(pillType(on));
          onToggle(key, on);
        },
      });
      button.addStyleClass("tssreg-find-pill");
      row.addItem(button);
    });
    return row;
  }

  function ensureSections(ids) {
    const token = termToken;
    const missing = ids.filter((id) => id && !sectionsByModule[id] && !fetching[id]);
    if (!missing.length) return;
    missing.forEach((id) => (fetching[id] = true));
    catalog
      .fetchSections(missing, state.year, state.term)
      .then((byModule) => {
        if (token !== termToken) return;
        missing.forEach((id) => (sectionsByModule[id] = byModule[id] || []));
      })
      .catch(() => {
        if (token !== termToken) return;
        missing.forEach((id) => (sectionsByModule[id] = []));
      })
      .then(() => {
        if (token !== termToken) return;
        missing.forEach((id) => delete fetching[id]);
        refreshResults();
      });
  }

  function runSearch() {
    if (!state.ready) return;
    state.f.q = ui.query.getValue();
    state.busy = true;
    state.error = "";
    state.searched = true;
    resetResultsPage();
    const token = ++searchToken;
    catalog
      .search(state.f, state.year, state.term)
      .then((rows) => {
        if (token !== searchToken) return;
        state.busy = false;
        state.results = rows;
        refreshResults();
        ensureSections(rows.map((row) => row.moduleId));
      })
      .catch((error) => {
        if (token !== searchToken) return;
        state.busy = false;
        state.results = [];
        state.error = "Search failed (" + error.message + ").";
        refreshResults();
      });
  }

  function researchIfShowing() {
    if (state.searched) runSearch();
    else refreshResults();
  }

  function message(value, error) {
    const control = new modules.Text({ text: value, wrapping: true });
    control.addStyleClass("tssreg-find-message");
    if (error) control.addStyleClass("tssreg-find-message-error");
    return control;
  }

  function busyBox(value) {
    const box = new modules.HBox({
      renderType: "Bare",
      alignItems: "Center",
      items: [new modules.BusyIndicator({ size: "1rem" }), message(value)],
    });
    box.addStyleClass("tssreg-find-busy");
    return box;
  }

  function sectionTable(course, packages) {
    const columns = [
      ["Section", "5rem", "High"],
      ["Type", "6rem", "Medium"],
      ["Days & time", "13rem", "High"],
      ["Location", "7rem", "Low"],
      ["Instructor", "9rem", "Low"],
      ["Seats", "8rem", "Medium"],
      ["Actions", "10rem", "Medium"],
    ];
    const table = new modules.Table({
      showSeparators: "All",
      contextualWidth: "Auto",
      autoPopinMode: true,
      popinLayout: "GridSmall",
      columns: columns.map(([caption, width, importance]) =>
        new modules.Column({ header: text(caption), width, importance })
      ),
      items: packages.flatMap((entry, index) => sectionRows(course, entry, index !== 0)),
    });
    table.addStyleClass("tssreg-find-table sapUiSizeCompact");
    return table;
  }

  function seatsStatus(pkg) {
    const open = parseInt(pkg.seats, 10);
    const capacity = parseInt(pkg.capacity, 10);
    const waiting = parseInt(pkg.waitlist, 10);
    if (isNaN(open)) return new modules.ObjectStatus({ text: pkg.statusText || "-" });
    if (open > 0) {
      return new modules.ObjectStatus({
        text: open + " of " + (isNaN(capacity) ? "?" : capacity) + " open",
        state: "Success",
      });
    }
    return new modules.ObjectStatus({
      text: "Full" + (!isNaN(waiting) && waiting > 0 ? " | " + waiting + " waiting" : ""),
      state: !isNaN(waiting) && waiting > 0 ? "Warning" : "Error",
    });
  }

  function planButton(course, pkg) {
    const added = plans.hasSection(pkg.moduleId, pkg.pkgId, state.year, state.term);
    return new modules.Button({
      text: added ? "Unplan" : "Plan",
      type: added ? "Transparent" : "Emphasized",
      tooltip: added
        ? "Unplans this class"
        : "Plans this class without enrolling",
      press: () => {
        plans.toggleSection(catalog.toSection(course, pkg, state.year, state.term));
        refreshResults();
      },
    });
  }

  function enrollmentButton(pkg, dropRoute) {
    return new modules.Button({
      text: dropRoute ? "Drop" : "Enroll",
      tooltip: dropRoute ? "Open the TSS detail page to withdraw" : "Open this section in TSS booking",
      press: () => {
        location.hash = dropRoute || coursesPage.bookingRoute(state.year, state.term, pkg.moduleId, pkg.pkgId);
      },
    });
  }

  function conflictToggle(key, hidden) {
    return new modules.Button({
      text: hidden ? "Show anyway" : "Hide",
      type: "Transparent",
      press: () => {
        if (hidden) revealedConflicts.add(key);
        else revealedConflicts.delete(key);
        refreshResults();
      },
    });
  }

  function sectionRows(course, { pkg, dropRoute, conflicting }, separate) {
    const key = pkg.moduleId + "|" + pkg.pkgId;
    const collapsible = conflicting && state.f.conflictMode === "collapse";
    const hidden = collapsible && !revealedConflicts.has(key);
    const label = pkg.label || pkg.pkgId;
    const components = hidden || !pkg.components.length ? [{}] : pkg.components;

    return components.map((component, index) => {
      const details = hidden ? ["", "", "", ""] : [
        component.type || "-",
        coursesPage.meetingLabel(component.meetings) || "TBA",
        component.location || "-",
        component.instructor || "-",
      ];
      const cells = [component.abbr || component.sectionId || label, ...details].map((value) => text(value));
      if (index === 0) {
        const statuses = hidden ? [] : [seatsStatus(pkg)];
        if (conflicting) statuses.push(new modules.ObjectStatus({
          text: hidden ? "Conflicts with your schedule" : "Conflicts",
          state: "Warning",
          tooltip: "Overlaps something already on your schedule",
        }));
        const actions = collapsible ? [conflictToggle(key, hidden)] : [];
        if (!hidden) actions.push(planButton(course, pkg), enrollmentButton(pkg, dropRoute));
        cells.push(
          new modules.VBox({ renderType: "Bare", items: statuses }),
          new modules.HBox({ renderType: "Bare", wrap: "Wrap", items: actions }).addStyleClass("tssreg-find-section-actions")
        );
      }
      const row = new modules.ColumnListItem({ vAlign: "Middle", cells });
      if (separate && index === 0) row.addStyleClass("tssreg-find-section-start");
      return row;
    });
  }

  function visiblePackages(course) {
    const f = state.f;
    const days = catalog.picked(f.days);
    return (sectionsByModule[course.moduleId] || []).filter((pkg) => {
      if (!catalog.match.days(pkg, days)) return false;
      if (!catalog.match.seats(pkg, f.avail)) return false;
      if (!catalog.match.timeRange(pkg, f.timeMin, f.timeMax)) return false;
      return true;
    });
  }

  function matchingPackages(course, busy) {
    return visiblePackages(course).map((pkg) => {
      const dropRoute = schedule.enrolledRoute(state.year, state.term, pkg.moduleId, pkg.pkgId);
      return { pkg, dropRoute, conflicting: !dropRoute && catalog.conflicts(pkg, busy) };
    }).filter(({ conflicting }) => state.f.conflictMode !== "hide" || !conflicting);
  }

  function waitlistStatus(pkg) {
    const status = (pkg.statusText || "").trim().toLowerCase();
    const count = parseInt(pkg.waitlist, 10);
    /* TSS can report students still waiting after the waitlist stops accepting additions. */
    if (status === "waitlist inactive") return "closed";
    if (count >= LONG_WAITLIST_MIN) return "long";
    if (status === "waitlist active" || count >= 0) return "open";
    return count < 0 ? "closed" : "unknown";
  }

  function courseWarning(packages) {
    if (!packages.length) return null;
    const compatible = packages.filter(({ conflicting }) => !conflicting);
    /* Check all sections for a full course when every section conflicts. */
    const options = compatible.length ? compatible : packages;
    const seats = options.map(({ pkg }) => parseInt(pkg.seats, 10));
    const full = seats.every((count) => count <= 0);
    const waitlists = full ? options.map(({ pkg }) => waitlistStatus(pkg)) : [];
    if (full && waitlists.every((status) => status === "closed")) {
      return { text: "Full, no waitlist", state: "Error" };
    }
    if (!compatible.length) return { text: "Conflicts with your schedule", state: "Error" };
    if (full) {
      if (waitlists.every((status) => status === "long" || status === "closed")) {
        return { text: "Full, long waitlist", state: "Error" };
      }
      if (waitlists.includes("open") || waitlists.includes("long")) {
        return { text: "Full, waitlist available", state: "Error" };
      }
      return { text: "Full", state: "Error" };
    }
    /* Packages can share seats, so use the best compatible option's count. */
    if (seats.every((count) => count <= LOW_SEAT_LIMIT)) return { text: "Almost full", state: "Warning" };
    return null;
  }

  function coursePanel(course, packages) {
    const code = course.code.replace(/^([A-Z]+)[ -]+0*(\d+[A-Z]*)$/i, "$1 $2");
    const unitLabel = Number(course.credits) === 1 ? " unit" : " units";
    const units = course.credits && "(" + course.credits + unitLabel + ")";
    const title = [course.title, units].filter(Boolean).join(" ");
    const warning = courseWarning(packages);
    const items = [text(title)];
    if (warning) items.push(new modules.ObjectStatus(warning));
    const details = new modules.HBox({
      renderType: "Bare",
      alignItems: "Center",
      wrap: "Wrap",
      items,
    }).addStyleClass("tssreg-find-course-details");
    /* The default panel toolbar applies SAP's bold font to both text labels. */
    const header = new modules.Toolbar({
      design: "Solid",
      height: "auto",
      content: [
        text(code, "tssreg-find-course-code"),
        new modules.ToolbarSeparator(),
        details,
      ],
    }).addStyleClass("tssreg-find-course-head");
    const expanded = expandedCourses.has(course.moduleId);
    const panel = new modules.Panel({
      headerToolbar: header,
      expandable: true,
      expanded,
      expandAnimation: false,
      content: expanded ? [sectionTable(course, packages)] : [],
      expand: (event) => {
        if (event.getParameter("expand")) {
          expandedCourses.add(course.moduleId);
          if (!panel.getContent().length) panel.addContent(sectionTable(course, packages));
        } else {
          expandedCourses.delete(course.moduleId);
        }
      },
    });
    header.attachBrowserEvent("click", () => panel.setExpanded(!panel.getExpanded()));
    panel.addStyleClass("sapUiNoContentPadding");
    panel.addStyleClass("tssreg-find-course");
    return panel;
  }

  function resultsContent() {
    if (state.error) return { items: [message(state.error, true)] };
    if (state.busy) return { items: [busyBox("Searching...")] };
    if (!state.searched) return { items: [] };
    if (!state.results.length) return { items: [message("No courses match those filters.")] };

    const pending = state.results.filter((course) => !sectionsByModule[course.moduleId]).length;
    if (pending) {
      const total = state.results.length;
      const loaded = total - pending;
      return {
        items: [busyBox(
          "Loading section times - " + loaded + " of " + total + " course" + (total === 1 ? "" : "s")
        )],
      };
    }

    const busy = state.f.conflictMode ? schedule.busyIntervals(state.year, state.term) : null;
    if (state.f.conflictMode && !busy) return { items: [busyBox("Waiting for your enrolled courses...")] };

    const courses = state.results
      .filter((course) => catalog.match.units(course, state.f.unitsMin, state.f.unitsMax, state.credits))
      .map((course) => ({ course, packages: matchingPackages(course, busy) }))
      .filter(({ packages }) => packages.length);
    const total = courses.length;
    if (!total) {
      state.page = 1;
      return { items: [message("No sections match those filters.")] };
    }
    state.page = Math.max(1, Math.min(state.page, Math.ceil(total / PAGE_SIZE)));
    const start = (state.page - 1) * PAGE_SIZE;
    const items = courses.slice(start, start + PAGE_SIZE).map(({ course, packages }) => coursePanel(course, packages));
    return { items, total, start };
  }

  function renderResults() {
    if (!ui || !ui.results) return;
    ui.resultsContainer.setVisible(state.searched);
    const { items, total = 0, start } = resultsContent();
    const pages = Math.ceil(total / PAGE_SIZE);
    ui.pagination.setVisible(pages > 1);
    if (pages > 1) {
      ui.pageRange.setText((start + 1) + "-" + (start + items.length) + " of " + total + " courses");
      ui.previousPage.setEnabled(state.page > 1);
      ui.nextPage.setEnabled(state.page < pages);
    }
    ui.results.destroyItems();
    items.forEach((item) => ui.results.addItem(item));
  }

  function resetResultsPage() {
    state.page = 1;
    refreshResults();
  }

  function refreshResults() {
    if (refreshPending) return;
    refreshPending = true;
    Promise.resolve().then(() => {
      refreshPending = false;
      renderResults();
    });
  }

  function buildPagination() {
    ui.pageRange = new modules.Text();
    ui.previousPage = new modules.Button({
      icon: "sap-icon://navigation-left-arrow",
      tooltip: "Previous page of courses",
      type: "Transparent",
      press: () => {
        state.page -= 1;
        renderResults();
      },
    });
    ui.nextPage = new modules.Button({
      icon: "sap-icon://navigation-right-arrow",
      tooltip: "Next page of courses",
      type: "Transparent",
      press: () => {
        state.page += 1;
        renderResults();
      },
    });
    return new modules.Toolbar({
      visible: false,
      content: [ui.previousPage, ui.pageRange, ui.nextPage],
    }).addStyleClass("tssreg-find-pagination");
  }

  function basicFields() {
    ui.query = new modules.SearchField({
      width: "100%",
      value: state.f.q,
      placeholder: "CSE 167, or graphics",
      search: runSearch,
      liveChange: (event) => {
        state.f.q = event.getParameter("newValue");
      },
    });

    ui.year = new modules.Select({
      width: "100%",
      items: optionItems(state.years),
      selectedKey: state.year,
      change: (event) => {
        schedule.selectTerm({ year: event.getParameter("selectedItem").getKey(), term: state.term });
      },
    });

    ui.term = new modules.Select({
      width: "100%",
      items: optionItems(state.terms),
      selectedKey: state.term,
      change: (event) => {
        schedule.selectTerm({ year: state.year, term: event.getParameter("selectedItem").getKey() });
      },
    });

    ui.dept = new modules.ComboBox({
      width: "100%",
      placeholder: "Any department",
      items: optionItems(state.help.departments),
      selectedKey: state.f.dept,
      change: () => {
        state.f.dept = ui.dept.getSelectedKey();
        researchIfShowing();
      },
    });

    ui.instructor = new modules.ComboBox({
      width: "100%",
      placeholder: instructorPlaceholder(),
      items: optionItems(state.instructors || []),
      selectedKey: state.f.instructor,
      change: () => {
        state.f.instructor = ui.instructor.getSelectedKey();
        researchIfShowing();
      },
    });
    loadInstructors();

    return [
      field(" ", ui.query, "Subject and number, or part of a title"),
      field("Academic Year", ui.year, null, true),
      field("Term", ui.term, null, true),
      field("Department", ui.dept, "Department that owns the course"),
      field("Instructor", ui.instructor, "Instructors teaching this term"),
      daysField(),
    ];
  }

  function daysField() {
    const days = fieldWith(
      captionLabel("Days of the Week", "Sections that meet on every chosen day"),
      pillRow(DAY_PILLS, state.f.days, (key, pressed) => {
        state.f.days[key] = pressed;
        resetResultsPage();
      })
    );
    const toggle = new modules.Button({
      text: "Hide Conflicts",
      type: pillType(state.f.conflictMode === "hide"),
      press: () => {
        const on = state.f.conflictMode !== "hide";
        state.f.conflictMode = on ? "hide" : "collapse";
        toggle.setType(pillType(on));
        resetResultsPage();
      },
    });
    toggle.addStyleClass("tssreg-find-pill");
    const conflicts = fieldWith(
      captionLabel("Conflicts", "Overlaps something already on your schedule"),
      toggle
    );
    days.setWidth("auto");
    conflicts.setWidth("auto");
    const pair = new modules.HBox({ renderType: "Bare", alignItems: "Start", items: [days, conflicts] });
    pair.addStyleClass("tssreg-find-pair");
    return pair;
  }

  function instructorPlaceholder() {
    return state.instructors ? "Any instructor" : "Loading\u2026";
  }

  function loadInstructors() {
    if (state.instructors || state.instructorsPending || !state.year || !state.term) return;
    const token = termToken;
    state.instructorsPending = true;
    catalog.loadInstructors(state.year, state.term).then((rows) => {
      if (token !== termToken) return;
      state.instructorsPending = false;
      state.instructors = rows;
      if (!ui || !ui.instructor) return;
      ui.instructor.destroyItems();
      optionItems(state.instructors).forEach((item) => ui.instructor.addItem(item));
      ui.instructor.setPlaceholder(instructorPlaceholder());
      ui.instructor.setSelectedKey(state.f.instructor);
    });
  }

  function advancedFields() {
    const levels = new modules.MultiComboBox({
      width: "100%",
      placeholder: "Any level",
      items: LEVELS.map(([key, caption]) => new modules.Item({ key, text: caption })),
      selectedKeys: catalog.picked(state.f.levels),
      selectionFinish: (event) => {
        state.f.levels = {};
        event.getParameter("selectedItems").forEach((item) => (state.f.levels[item.getKey()] = true));
        researchIfShowing();
      },
    });

    const buildings = new modules.MultiComboBox({
      width: "100%",
      placeholder: "Any building",
      items: optionItems(state.help.buildings),
      selectedKeys: catalog.picked(state.f.buildings),
      selectionFinish: (event) => {
        state.f.buildings = {};
        event.getParameter("selectedItems").forEach((item) => (state.f.buildings[item.getKey()] = true));
        researchIfShowing();
      },
    });

    const modality = new modules.Select({
      width: "100%",
      items: optionItems(state.help.modalities, "Any"),
      selectedKey: state.f.modality,
      change: (event) => {
        state.f.modality = event.getParameter("selectedItem").getKey();
        researchIfShowing();
      },
    });

    const sectionId = new modules.Input({
      width: "100%",
      value: state.f.sectionId,
      change: (event) => {
        state.f.sectionId = event.getParameter("value");
        researchIfShowing();
      },
    });

    const availability = choiceRow(AVAILABILITY, state.f.avail, (key) => {
      state.f.avail = key;
      resetResultsPage();
    });

    const wishlisted = new modules.Select({
      width: "100%",
      items: selectItems(WISHLISTED),
      selectedKey: state.f.wishlisted,
      change: (event) => {
        state.f.wishlisted = event.getParameter("selectedItem").getKey();
        researchIfShowing();
      },
    });

    const credits = rangeField("Credits", null, {
      min: state.credits.min,
      max: state.credits.max,
      step: 1,
      range: [state.f.unitsMin, state.f.unitsMax],
      apply: (range) => {
        state.f.unitsMin = range[0];
        state.f.unitsMax = range[1];
      },
    });

    const time = rangeField("Time of Day", "Sections that fit entirely in this window", {
      min: catalog.TIME_MIN,
      max: catalog.TIME_MAX,
      step: TIME_STEP,
      range: [state.f.timeMin, state.f.timeMax],
      apply: (range) => {
        state.f.timeMin = range[0];
        state.f.timeMax = range[1];
      },
      format: () => meridiemLabel(state.f.timeMin) + " \u2013 " + meridiemLabel(state.f.timeMax),
    });

    return [
      field("Academic Level", levels, null),
      field("Building", buildings, "Building where the section meets"),
      field("Modality", modality, "In person, remote, or hybrid"),
      field("Section ID", sectionId, "Exact class number"),
      field("Seats Available", availability, "Open seats reported by TSS"),
      field("Wishlisted", wishlisted, "Courses on your TSS wishlist"),
      credits,
      time,
    ];
  }

  function moreFiltersText() {
    return state.advanced ? "Fewer Filters" : "More Filters";
  }

  function setAdvanced(on) {
    state.advanced = on;
    if (ui.bar) ui.bar.toggleStyleClass("tssreg-expanded", on);
    if (ui.more) ui.more.setText(moreFiltersText());
  }

  function buildForm() {
    const layout = new modules.AlignedFlowLayout();
    layout.addStyleClass("tssreg-find-bar");
    ui.bar = layout;
    basicFields().forEach((item) => layout.addContent(item));
    layout.addContent(new modules.HTML({ content: '<hr id="tssreg-find-separator" class="tssreg-find-advanced">' }));
    advancedFields().forEach((item) => {
      item.addStyleClass("tssreg-find-advanced");
      layout.addContent(item);
    });
    ui.more = new modules.Button({
      text: moreFiltersText(),
      type: "Transparent",
      press: () => setAdvanced(!state.advanced),
    });
    layout.addEndContent(new modules.Button({ text: "Search", type: "Emphasized", press: runSearch }));
    layout.addEndContent(ui.more);
    setAdvanced(state.advanced);
    return layout;
  }

  function onTermChanged() {
    const scope = schedule.term();
    if (!scope || (state.year === scope.year && state.term === scope.term)) return;
    state.year = scope.year;
    state.term = scope.term;
    termToken += 1;
    searchToken += 1;
    state.loading = false;
    state.busy = false;
    state.ready = false;
    state.instructors = null;
    state.instructorsPending = false;
    state.f.dept = "";
    state.f.instructor = "";
    state.f.buildings = {};
    state.f.modality = "";
    state.results = [];
    state.page = 1;
    state.searched = false;
    Object.keys(sectionsByModule).forEach((id) => delete sectionsByModule[id]);
    Object.keys(fetching).forEach((id) => delete fetching[id]);
    expandedCourses.clear();
    revealedConflicts.clear();
    if (ui && state.open) loadCatalog();
  }

  function loadCatalog() {
    if (state.loading) return;
    state.loading = true;
    state.catalogError = "";
    renderPanel();
    const token = termToken;
    catalog.loadTerms()
      .then((terms) => {
        if (token !== termToken) return;
        state.years = terms.years;
        state.terms = terms.terms;
        if (!state.year || !state.term) {
          state.loading = false;
          if (!terms.years.length || !terms.terms.length) {
            state.catalogError = "Could not load academic quarters.";
            renderPanel();
          }
          return;
        }
        if (!state.years.some((item) => item.key === state.year)) {
          state.years = state.years.concat({ key: state.year, text: state.year });
        }
        if (!state.terms.some((item) => item.key === state.term)) {
          state.terms = state.terms.concat({ key: state.term, text: schedule.term().name || state.term });
        }
        return Promise.all([
          catalog.loadValueHelps(state.year, state.term),
          catalog.loadCreditRange(state.year, state.term),
        ]);
      })
      .then((loaded) => {
        if (token !== termToken || !loaded) return;
        const [help, credits] = loaded;
        state.help = help;
        state.f.unitsMin = credits.min;
        state.f.unitsMax = credits.max;
        state.credits = credits;
        state.loading = false;
        state.ready = true;
        renderPanel();
      })
      .catch((error) => {
        if (token !== termToken) return;
        state.loading = false;
        state.catalogError = "Could not load the course catalog (" + error.message + ").";
        renderPanel();
      });
  }

  function renderPanel() {
    if (!ui || !ui.panel) return;
    ui.panel.destroyContent();
    ui.results = null;
    if (state.catalogError) return void ui.panel.addContent(message(state.catalogError, true));
    if (!state.ready) return void ui.panel.addContent(busyBox("Loading the course catalog..."));

    ui.pagination = buildPagination();
    ui.results = new modules.VBox({ renderType: "Bare" });
    ui.panel.addContent(buildForm());
    ui.resultsContainer = new modules.VBox({
      renderType: "Bare",
      visible: state.searched,
      items: [ui.pagination, ui.results],
    }).addStyleClass("tssreg-find-list");
    ui.panel.addContent(ui.resultsContainer);
    refreshResults();
  }

  function buildRoot() {
    ui = {};
    ui.panel = new modules.Panel(ROOT_ID, {
      headerText: "Find Classes",
      expandable: true,
      expanded: state.open,
      expand: (event) => {
        state.open = event.getParameter("expand");
        if (state.open && !state.ready && !state.loading) loadCatalog();
      },
    });
    ui.panel.addStyleClass("tssreg-find");
    if (state.open && !state.ready && !state.loading) loadCatalog();
    else if (state.open) renderPanel();
    return ui.panel;
  }

  function teardown() {
    const existing = sap.ui.getCore().byId(ROOT_ID);
    if (existing) existing.destroy();
    ui = null;
  }

  function apply() {
    if (!modules) return;
    if (!isCoursesRoute()) return void teardown();

    const page = pageControl();
    const list = page && listControl(page);
    if (!list) return;
    onTermChanged();

    let root = sap.ui.getCore().byId(ROOT_ID);
    if (!root || !ui) {
      if (root) root.destroy();
      root = buildRoot();
    }
    coursesPage.mountAfterList(page, list, root);
  }

  window.__tssregShared.onUiUpdated(apply);
  window.addEventListener(plans.CHANGE_EVENT, refreshResults);
  window.addEventListener(schedule.ITEMS_EVENT, refreshResults);
  window.addEventListener(schedule.TERM_EVENT, onTermChanged);
})();
