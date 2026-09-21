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
  const expanded = {};

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
    year: "",
    term: "",
    years: [],
    terms: [],
    help: { departments: [], buildings: [], modalities: [] },
    credits: { min: catalog.UNITS_MIN, max: catalog.UNITS_MAX },
    instructors: null,
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
  let refreshPending = false;

  sap.ui.require(
    [
      "sap/m/Panel",
      "sap/m/Toolbar",
      "sap/m/ToolbarSpacer",
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
        "Panel", "Toolbar", "ToolbarSpacer", "Text", "Label", "VBox", "HBox", "Button",
        "SearchField", "Input", "Select", "ComboBox", "MultiComboBox", "RangeSlider", "Table", "Column",
        "ColumnListItem", "ObjectStatus", "BusyIndicator", "AlignedFlowLayout", "VerticalLayout", "HTML", "Item",
      ];
      const loaded = {};
      names.forEach((name, index) => (loaded[name] = arguments[index]));
      modules = loaded;
      apply();
    }
  );

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
      change: refreshResults,
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
    const missing = ids.filter((id) => id && !sectionsByModule[id] && !fetching[id]);
    if (!missing.length) return;
    missing.forEach((id) => (fetching[id] = true));
    catalog
      .fetchSections(missing, state.year, state.term)
      .then((byModule) => {
        missing.forEach((id) => (sectionsByModule[id] = byModule[id] || []));
      })
      .catch(() => {
        missing.forEach((id) => (sectionsByModule[id] = []));
      })
      .then(() => {
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
    refreshResults();
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

  function column(caption, tooltip) {
    const header = new modules.Text({ text: caption });
    if (tooltip) header.setTooltip(tooltip);
    return new modules.Column({ header });
  }

  function componentTable(course, pkg) {
    const table = new modules.Table({
      showSeparators: "Inner",
      columns: [
        column("Section"),
        column("Type", "Lecture, discussion, lab, and so on."),
        column("Days & time"),
        column("Location"),
        column("Instructor"),
      ],
      items: pkg.components.map(
        (component) =>
          new modules.ColumnListItem({
            cells: [
              text(component.abbr || component.sectionId),
              text(component.type || "—"),
              text(coursesPage.meetingLabel(component.meetings) || "TBA"),
              text(component.location || "—"),
              text(component.instructor || "—"),
            ],
          })
      ),
    });
    table.addStyleClass("tssreg-find-table");
    table.setTooltip(course.code + " " + pkg.label);
    return table;
  }

  function seatsStatus(pkg) {
    const open = parseInt(pkg.seats, 10);
    const capacity = parseInt(pkg.capacity, 10);
    const waiting = parseInt(pkg.waitlist, 10);
    if (isNaN(open)) return new modules.ObjectStatus({ text: pkg.statusText || "—" });
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
    const added = plans.hasSection(pkg.moduleId, pkg.pkgId);
    return new modules.Button({
      text: added ? "Remove" : "Add to schedule",
      type: added ? "Transparent" : "Emphasized",
      tooltip: added
        ? "Take this whole package out of the selected schedule."
        : "Add this whole package to the selected schedule and draw it on the calendar. Nothing is enrolled until you choose Enroll.",
      press: () => {
        plans.toggleSection(catalog.toSection(course, pkg, state.year, state.term));
        refreshResults();
      },
    });
  }

  function packageToolbar(course, pkg, conflicting) {
    const content = [text(pkg.label, "tssreg-find-pkg-label"), seatsStatus(pkg)];
    if (conflicting) {
      content.push(
        new modules.ObjectStatus({
          text: "Conflicts",
          state: "Warning",
          tooltip: "Overlaps a class you are already enrolled in or have added to this schedule.",
        })
      );
      if (state.f.conflictMode === "collapse") {
        content.push(
          new modules.Button({
            text: "Hide",
            type: "Transparent",
            press: () => {
              delete expanded[pkg.moduleId + "|" + pkg.pkgId];
              refreshResults();
            },
          })
        );
      }
    }
    content.push(new modules.ToolbarSpacer());
    content.push(planButton(course, pkg));
    content.push(
      new modules.Button({
        text: "Enroll",
        tooltip: "Open this course in the Schedule of Classes to enroll.",
        press: () => {
          location.hash = coursesPage.courseRoute(state.year, state.term, pkg.moduleId);
        },
      })
    );
    const toolbar = new modules.Toolbar({ content });
    toolbar.addStyleClass("tssreg-find-pkg-bar");
    return toolbar;
  }

  function collapsedPackage(pkg) {
    const toolbar = new modules.Toolbar({
      content: [
        text(pkg.label, "tssreg-find-pkg-label"),
        new modules.ObjectStatus({ text: "Conflicts with your schedule", state: "Warning" }),
        new modules.ToolbarSpacer(),
        new modules.Button({
          text: "Show anyway",
          type: "Transparent",
          press: () => {
            expanded[pkg.moduleId + "|" + pkg.pkgId] = true;
            refreshResults();
          },
        }),
      ],
    });
    toolbar.addStyleClass("tssreg-find-pkg-bar");
    return toolbar;
  }

  function courseHeader(course) {
    const meta = [course.credits ? course.credits + " units" : "", course.department].filter(Boolean).join(" | ");
    const row = new modules.HBox({ renderType: "Bare", alignItems: "Baseline", wrap: "Wrap" });
    row.addStyleClass("tssreg-find-course-head");
    row.addItem(text(course.code, "tssreg-find-course-code"));
    row.addItem(text(course.title, "tssreg-find-course-title"));
    if (meta) row.addItem(text(meta, "tssreg-find-course-meta"));
    return row;
  }

  function visiblePackages(course, busy) {
    const f = state.f;
    const days = catalog.picked(f.days);
    return (sectionsByModule[course.moduleId] || []).filter((pkg) => {
      if (!catalog.match.days(pkg, days)) return false;
      if (!catalog.match.seats(pkg, f.avail)) return false;
      if (!catalog.match.timeRange(pkg, f.timeMin, f.timeMax)) return false;
      if (f.conflictMode === "hide" && catalog.conflicts(pkg, busy)) return false;
      return true;
    });
  }

  function courseGroup(course, busy) {
    const packages = visiblePackages(course, busy);
    if (!packages.length) return null;
    const group = new modules.VBox({ renderType: "Bare", items: [courseHeader(course)] });
    group.addStyleClass("tssreg-find-course");
    packages.forEach((pkg) => {
      const conflicting = catalog.conflicts(pkg, busy);
      if (conflicting && state.f.conflictMode === "collapse" && !expanded[pkg.moduleId + "|" + pkg.pkgId]) {
        group.addItem(collapsedPackage(pkg));
        return;
      }
      group.addItem(packageToolbar(course, pkg, conflicting));
      group.addItem(componentTable(course, pkg));
    });
    return group;
  }

  function resultsContent() {
    if (state.error) return [message(state.error, true)];
    if (state.busy) return [busyBox("Searching…")];
    if (!state.searched) return [];
    if (!state.results.length) return [message("No courses match those filters.")];

    const pending = state.results.filter((course) => !sectionsByModule[course.moduleId]).length;
    if (pending) {
      const total = state.results.length;
      const loaded = total - pending;
      return [
        busyBox(
          "Loading section times — " + loaded + " of " + total + " course" + (total === 1 ? "" : "s")
        ),
      ];
    }

    const busy = state.f.conflictMode ? schedule.busyIntervals() : null;
    if (state.f.conflictMode && !busy) return [busyBox("Waiting for your enrolled courses…")];

    const groups = state.results
      .filter((course) => catalog.match.units(course, state.f.unitsMin, state.f.unitsMax, state.credits))
      .map((course) => courseGroup(course, busy))
      .filter(Boolean);
    if (!groups.length) return [message("No sections match those filters.")];
    return groups;
  }

  function renderResults() {
    if (!ui || !ui.results) return;
    ui.results.destroyItems();
    resultsContent().forEach((item) => ui.results.addItem(item));
  }

  function refreshResults() {
    if (refreshPending) return;
    refreshPending = true;
    Promise.resolve().then(() => {
      refreshPending = false;
      renderResults();
    });
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
        state.year = event.getParameter("selectedItem").getKey();
        onTermChanged();
      },
    });

    ui.term = new modules.Select({
      width: "100%",
      items: optionItems(state.terms),
      selectedKey: state.term,
      change: (event) => {
        state.term = event.getParameter("selectedItem").getKey();
        onTermChanged();
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
    ui.instructor.attachBrowserEvent("focusin", loadInstructors);

    return [
      field(" ", ui.query, "Subject and number, e.g. CSE 167 or CSE167. Or part of a title."),
      field("Academic Year", ui.year, null, true),
      field("Term", ui.term, null, true),
      field("Department", ui.dept, "The department that owns the course."),
      field("Instructor", ui.instructor, "Pick a name from this term's instructors."),
      daysField(),
    ];
  }

  function daysField() {
    const days = fieldWith(
      captionLabel("Days of the Week", "Show only sections that meet on every chosen day."),
      pillRow(DAY_PILLS, state.f.days, (key, pressed) => {
        state.f.days[key] = pressed;
        refreshResults();
      })
    );
    const toggle = new modules.Button({
      text: "Hide Conflicts",
      type: pillType(state.f.conflictMode === "hide"),
      press: () => {
        const on = state.f.conflictMode !== "hide";
        state.f.conflictMode = on ? "hide" : "collapse";
        toggle.setType(pillType(on));
        refreshResults();
      },
    });
    toggle.addStyleClass("tssreg-find-pill");
    const conflicts = fieldWith(
      captionLabel(
        "Conflicts",
        "Conflicting means overlapping a class you are enrolled in or have added to this schedule."
      ),
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
    if (state.instructors || !state.year || !state.term) return;
    catalog.loadInstructors(state.year, state.term).then((rows) => {
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
      refreshResults();
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

    const credits = rangeField("Credits", "Credit range.", {
      min: state.credits.min,
      max: state.credits.max,
      step: 1,
      range: [state.f.unitsMin, state.f.unitsMax],
      apply: (range) => {
        state.f.unitsMin = range[0];
        state.f.unitsMax = range[1];
      },
    });

    const time = rangeField("Time of Day", "Only show sections that meet entirely within this window.", {
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
      field("Academic Level", levels, "Pick as many as you want."),
      field("Building", buildings, "Where the section meets, e.g. Center Hall."),
      field("Modality", modality, "How the class is taught: in person, remote, or a mix."),
      field("Section ID", sectionId, "The exact class number, if you already know it."),
      field("Seats Available", availability, "Open seats reported by TSS for the package."),
      field("Wishlisted", wishlisted, "Courses already on your TSS wishlist."),
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
    state.ready = false;
    state.instructors = null;
    state.results = [];
    state.searched = false;
    Object.keys(sectionsByModule).forEach((id) => delete sectionsByModule[id]);
    Promise.resolve().then(loadCatalog);
  }

  function loadCatalog() {
    if (state.loading) return;
    state.loading = true;
    state.catalogError = "";
    renderPanel();
    const seed = state.year && state.term
      ? Promise.resolve({ years: state.years, terms: state.terms, defaultYear: state.year, defaultTerm: state.term })
      : catalog.loadTerms();
    seed
      .then((terms) => {
        state.years = terms.years;
        state.terms = terms.terms;
        if (!state.year) state.year = terms.defaultYear;
        if (!state.term) state.term = terms.defaultTerm;
        return Promise.all([
          catalog.loadValueHelps(state.year, state.term),
          catalog.loadCreditRange(state.year, state.term),
        ]);
      })
      .then(([help, credits]) => {
        state.help = help;
        if (state.f.unitsMin === state.credits.min && state.f.unitsMax === state.credits.max) {
          state.f.unitsMin = credits.min;
          state.f.unitsMax = credits.max;
        }
        state.credits = credits;
        state.loading = false;
        state.ready = true;
        renderPanel();
      })
      .catch((error) => {
        state.loading = false;
        state.catalogError = "Could not load the course catalog (" + error.message + ").";
        renderPanel();
      });
  }

  function renderPanel() {
    if (!ui || !ui.panel) return;
    ui.panel.destroyContent();
    if (state.catalogError) return void ui.panel.addContent(message(state.catalogError, true));
    if (!state.ready) return void ui.panel.addContent(busyBox("Loading the course catalog…"));

    ui.results = new modules.VBox({ renderType: "Bare" });
    ui.results.addStyleClass("tssreg-find-results");
    ui.panel.addContent(buildForm());
    ui.panel.addContent(ui.results);
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
})();
