const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src", "courses-calendar.js");
const PAGE_SRC = path.join(__dirname, "..", "src", "courses-page.js");
const EXPORT_SRC = path.join(__dirname, "..", "src", "courses-export.js");
const EVENTS_SRC = path.join(__dirname, "..", "src", "courses-events.js");

function evaluate(file, win) {
  const src = fs.readFileSync(file, "utf8");
  const body = src.replace(/^\(\(\) => \{\r?\n/, "").replace(/\}\)\(\);\s*$/, "");
  new Function("window", "sap", "document", "location", "URL", "setTimeout", body)(
    win,
    null,
    { createElement: () => ({ getContext: () => null }), fonts: null },
    { hash: "" },
    {},
    () => {}
  );
}

let currentPlan = null;
let allPlans = [];

function loadCalendar() {
  const src = fs.readFileSync(SRC, "utf8");
  const body = src.replace(/^\(\(\) => \{\r?\n/, "").replace(/\}\)\(\);\s*$/, "");
  const exposed =
    body +
    "\n;return { layoutDay, overlapClusters, timeRange, daysToShow, statusOf, minutesOf, busyIntervals, publishItems, legendModel, meetingsFor, meetingsBySection, coursesPage, swapContent, onRootRendered, finalsItems, plannedItems, eventsByPackage, buildings, roomLabels, finalsWeek, finalsDayDates, dateKey, plannedFinalsItems, finalsByPackage, eventItems, events, scopeOptions, scopeLabel };";

  const plain = (value) => String(value == null ? "" : value).replace(/^0+(?=\d)/, "");
  const win = {
    __tssregShared: {
      plans: {
        CHANGE_EVENT: "tssreg:plans-changed",
        current: () => currentPlan,
        list: () => allPlans,
        signature: () => "[]",
      },
      catalog: {
        plainId: plain,
        scheduleKey: (year, term, moduleId, sectionId) => [plain(year), plain(term), plain(moduleId), plain(sectionId)].join("|"),
        loadMeetings: () => Promise.resolve({}),
      },
      onUiUpdated() {},
      whenSapReady: (fn) => fn(),
      odataLiteral: (value) => "'" + String(value).replace(/'/g, "''") + "'",
    },
    addEventListener() {},
    dispatchEvent() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };
  evaluate(PAGE_SRC, win);
  evaluate(EXPORT_SRC, win);
  evaluate(EVENTS_SRC, win);
  const sap = { ui: { require() {}, getCore: () => ({ byId: () => null }) } };
  const doc = { querySelector: () => null };
  const CustomEvent = function (type) {
    this.type = type;
  };
  return new Function("window", "sap", "document", "location", "CustomEvent", exposed)(
    win,
    sap,
    doc,
    { hash: "" },
    CustomEvent
  );
}

const cal = loadCalendar();

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else failures.push(name + "\n    expected " + e + "\n    actual   " + a);
}

let nextKey = 0;
function block(startMin, endMin, label) {
  return { key: label || "b" + nextKey++, day: "MO", startMin, endMin };
}

function layoutOf(items) {
  return cal.layoutDay(items).map((item) => ({
    key: item.key,
    col: item.column,
    cols: item.columns,
    conflict: !!item.conflict,
  }));
}

function clustersOf(items) {
  const sorted = items.slice().sort((a, b) => a.startMin - b.startMin);
  return cal.overlapClusters(sorted).map((cluster) => cluster.map((item) => item.key));
}

const reported = [block(540, 600, "a"), block(570, 660, "b"), block(780, 840, "far")];
check(
  "an unrelated block is not narrowed by someone else's conflict",
  layoutOf(reported),
  [
    { key: "a", col: 0, cols: 2, conflict: true },
    { key: "b", col: 1, cols: 2, conflict: true },
    { key: "far", col: 0, cols: 1, conflict: false },
  ]
);
check("the conflict and the loner are separate clusters", clustersOf(reported), [["a", "b"], ["far"]]);

check("a lone block is full width", layoutOf([block(540, 600, "only")]), [
  { key: "only", col: 0, cols: 1, conflict: false },
]);
check("an empty day", layoutOf([]), []);
check("no clusters for an empty day", clustersOf([]), []);

check(
  "several non-overlapping blocks all stay full width",
  layoutOf([block(540, 590, "x"), block(600, 650, "y"), block(660, 710, "z")]),
  [
    { key: "x", col: 0, cols: 1, conflict: false },
    { key: "y", col: 0, cols: 1, conflict: false },
    { key: "z", col: 0, cols: 1, conflict: false },
  ]
);
check(
  "each non-overlapping block is its own cluster",
  clustersOf([block(540, 590, "x"), block(600, 650, "y"), block(660, 710, "z")]),
  [["x"], ["y"], ["z"]]
);

check(
  "blocks that touch do not conflict",
  layoutOf([block(600, 660, "before"), block(660, 720, "after")]),
  [
    { key: "before", col: 0, cols: 1, conflict: false },
    { key: "after", col: 0, cols: 1, conflict: false },
  ]
);

check(
  "two overlapping blocks split the track",
  layoutOf([block(540, 600, "a"), block(570, 630, "b")]),
  [
    { key: "a", col: 0, cols: 2, conflict: true },
    { key: "b", col: 1, cols: 2, conflict: true },
  ]
);

check(
  "three overlapping blocks split three ways",
  layoutOf([block(540, 660, "a"), block(550, 660, "b"), block(560, 660, "c")]),
  [
    { key: "a", col: 0, cols: 3, conflict: true },
    { key: "b", col: 1, cols: 3, conflict: true },
    { key: "c", col: 2, cols: 3, conflict: true },
  ]
);

check(
  "identical times split evenly",
  layoutOf([block(540, 600, "a"), block(540, 600, "b")]),
  [
    { key: "a", col: 0, cols: 2, conflict: true },
    { key: "b", col: 1, cols: 2, conflict: true },
  ]
);

const chained = [block(540, 600, "a"), block(570, 660, "b"), block(630, 690, "c")];
check("a chain of overlaps is one cluster", clustersOf(chained), [["a", "b", "c"]]);
check(
  "a chain reuses the first column and every member is marked",
  layoutOf(chained),
  [
    { key: "a", col: 0, cols: 2, conflict: true },
    { key: "b", col: 1, cols: 2, conflict: true },
    { key: "c", col: 0, cols: 2, conflict: true },
  ]
);

const swallow = [block(540, 780, "long"), block(570, 600, "s1"), block(660, 700, "s2")];
check("a long block keeps short ones in its cluster", clustersOf(swallow), [["long", "s1", "s2"]]);
check(
  "shorts share the second column beside a long block",
  layoutOf(swallow),
  [
    { key: "long", col: 0, cols: 2, conflict: true },
    { key: "s1", col: 1, cols: 2, conflict: true },
    { key: "s2", col: 1, cols: 2, conflict: true },
  ]
);

const twoPairs = [
  block(540, 600, "m1"), block(570, 630, "m2"),
  block(780, 840, "a1"), block(800, 860, "a2"),
];
check("two separate conflicts stay separate clusters", clustersOf(twoPairs), [["m1", "m2"], ["a1", "a2"]]);
check(
  "each conflict is sized on its own",
  layoutOf(twoPairs),
  [
    { key: "m1", col: 0, cols: 2, conflict: true },
    { key: "m2", col: 1, cols: 2, conflict: true },
    { key: "a1", col: 0, cols: 2, conflict: true },
    { key: "a2", col: 1, cols: 2, conflict: true },
  ]
);

const mixed = [
  block(540, 660, "t1"), block(550, 660, "t2"), block(560, 660, "t3"),
  block(700, 760, "solo"),
  block(800, 860, "p1"), block(810, 870, "p2"),
];
check("clusters of three, one and two", clustersOf(mixed), [["t1", "t2", "t3"], ["solo"], ["p1", "p2"]]);
check(
  "column counts follow the cluster, not the day",
  cal.layoutDay(mixed).map((item) => item.key + ":" + item.columns),
  ["t1:3", "t2:3", "t3:3", "solo:1", "p1:2", "p2:2"]
);

const shuffled = [block(780, 840, "far"), block(570, 660, "b"), block(540, 600, "a")];
check("results are sorted by start time regardless of input order", layoutOf(shuffled), [
  { key: "a", col: 0, cols: 2, conflict: true },
  { key: "b", col: 1, cols: 2, conflict: true },
  { key: "far", col: 0, cols: 1, conflict: false },
]);

check(
  "the caller's array is not reordered",
  (() => {
    const items = [block(780, 840, "far"), block(540, 600, "a")];
    cal.layoutDay(items);
    return items.map((item) => item.key);
  })(),
  ["far", "a"]
);

check("time range rounds out to whole hours", cal.timeRange([block(545, 605, "a")]), {
  startMin: 540,
  endMin: 660,
});
check("time range has a default", cal.timeRange([]), { startMin: 480, endMin: 1020 });
check("weekdays always show", cal.daysToShow([]), ["MO", "TU", "WE", "TH", "FR"]);
check(
  "a saturday block adds saturday",
  cal.daysToShow([{ day: "SA", startMin: 540, endMin: 600 }]),
  ["MO", "TU", "WE", "TH", "FR", "SA"]
);
check("status: booked", cal.statusOf({ SmStatusText: "Booked" }), "enrolled");
check("status: waitlisted", cal.statusOf({ SmStatusText: "On Waitlist" }), "waitlisted");
check("status: other", cal.statusOf({ SmStatusText: "Something else" }), "other");
check("edm time to minutes", cal.minutesOf({ ms: 54000000 }), 900);
check("missing time", cal.minutesOf(null), null);

check("busy is unknown before anything is published", cal.busyIntervals(), null);
cal.publishItems([
  { key: "e1", day: "MO", startMin: 540, endMin: 600 },
  { key: "p1", day: "MO", startMin: 780, endMin: 840, planned: { section: { pkgId: "154795" } } },
  { key: "e2", day: "WE", startMin: 540, endMin: 600 },
]);
check("busy groups by day and carries the planned package id", cal.busyIntervals(), {
  MO: [
    { startMin: 540, endMin: 600, pkgId: null },
    { startMin: 780, endMin: 840, pkgId: "154795" },
  ],
  WE: [{ startMin: 540, endMin: 600, pkgId: null }],
});
cal.publishItems([]);
check("an empty schedule is known, not unknown", cal.busyIntervals(), {});
cal.publishItems(null);
check("loading resets busy to unknown", cal.busyIntervals(), null);

check(
  "the legend lists only the statuses on the calendar",
  cal.legendModel([{ status: "enrolled" }, { status: "planned" }, { status: "other" }]),
  [
    { status: "enrolled", label: "Enrolled" },
    { status: "planned", label: "Planned" },
  ]
);
check(
  "a conflict adds its own legend entry last",
  cal.legendModel([{ status: "enrolled", conflict: true }]),
  [
    { status: "enrolled", label: "Enrolled" },
    { status: "conflict", label: "Time conflict" },
  ]
);
check("an empty calendar has no legend", cal.legendModel([]), []);

const enrolled = { SmObjid: "00010491", AcademicYear: "2026", AcademicSession: "2" };
const lecture = { EventId: "00001000", EventScheduleDays: "TU/TH/FR", StartTime: { ms: 61200000 }, EndTime: { ms: 66000000 } };

check(
  "with no weekly pattern loaded the event's own days are used",
  cal.meetingsFor(enrolled, lecture),
  [
    { day: "TU", startMin: 1020, endMin: 1100 },
    { day: "TH", startMin: 1020, endMin: 1100 },
    { day: "FR", startMin: 1020, endMin: 1100 },
  ]
);

cal.meetingsBySection["2026|2|10491|1000"] = [
  { day: "TU", startMin: 1020, endMin: 1100 },
  { day: "TH", startMin: 1020, endMin: 1100 },
];

check(
  "the weekly pattern wins over the event's day string",
  cal.meetingsFor(enrolled, lecture),
  [
    { day: "TU", startMin: 1020, endMin: 1100 },
    { day: "TH", startMin: 1020, endMin: 1100 },
  ]
);
check(
  "padded ids on either side still join",
  cal.meetingsFor({ SmObjid: "10491", AcademicYear: "2026", AcademicSession: "2" }, { EventId: "1000", EventScheduleDays: "MO" }).length,
  2
);
check(
  "the same section in another term does not borrow this term's pattern",
  cal.meetingsFor(
    { SmObjid: "00010491", AcademicYear: "2026", AcademicSession: "3" },
    { EventId: "00001000", EventScheduleDays: "MO", StartTime: { ms: 36000000 }, EndTime: { ms: 39000000 } }
  ),
  [{ day: "MO", startMin: 600, endMin: 650 }]
);
check(
  "a section with no pattern rows still falls back",
  cal.meetingsFor(enrolled, { EventId: "00004003", EventScheduleDays: "FR", StartTime: { ms: 54000000 }, EndTime: { ms: 57000000 } }),
  [{ day: "FR", startMin: 900, endMin: 950 }]
);
check(
  "an event with no usable time and no pattern has no meetings",
  cal.meetingsFor(enrolled, { EventId: "00009999", EventScheduleDays: "MO" }),
  []
);
check(
  "unknown day codes in the fallback are dropped",
  cal.meetingsFor(enrolled, { EventId: "00009999", EventScheduleDays: "MO/XX", StartTime: { ms: 54000000 }, EndTime: { ms: 57000000 } }),
  [{ day: "MO", startMin: 900, endMin: 950 }]
);

// ---------- final exams ----------
cal.buildings["Center Hall"] = "CENTR";
cal.buildings["Franklin Antonio Hall"] = "FAH";

function enrolledRow(fields) {
  return Object.assign(
    {
      EventPackageId: "00154645",
      SmObjid: "0009462",
      SmShort: "CSE-123",
      SmStext: "Computer Networks",
      SmStatusText: "Booked",
    },
    fields
  );
}

function finalRecord(fields) {
  return Object.assign(
    {
      moduleId: "9462",
      pkgId: "154645",
      date: new Date(Date.UTC(2026, 11, 11)),
      startMin: 1140,
      endMin: 1379,
      room: "Center Hall Room 115",
      abbr: "001-000-LE",
      instructor: "Alex Snoeren",
    },
    fields
  );
}

cal.finalsByPackage["9462|154645"] = finalRecord({});
const withFinal = cal.finalsItems([{ row: enrolledRow({}) }]);

check("an enrolled course with an exam is drawn once", withFinal.length, 1);
check(
  "the exam lands in the column for its own date",
  [withFinal[0].day, withFinal[0].startMin, withFinal[0].endMin],
  ["2026-12-11", 1140, 1379]
);
check("the block names the session in the space it has", withFinal[0].method, "Final Exam");
check("a published room keeps its number behind a short building code", withFinal[0].room, "CENTR 115");
check("the full room keeps the number for the detail", withFinal[0].roomFull, "CENTR - 115");
check(
  "the section and instructor come from the exam itself",
  [withFinal[0].section, withFinal[0].instructor],
  ["001-000-LE", "Alex Snoeren"]
);
check("each exam gets a key of its own", withFinal[0].key, "final|00154645");
check("the course status rides along", withFinal[0].status, "enrolled");
check("the block is marked as an exam so it reads its own detail", withFinal[0].final, true);

check(
  "a course whose exam is not published yet is left out rather than guessed at",
  cal.finalsItems([{ row: enrolledRow({ EventPackageId: "00159999" }) }]).length,
  0
);
check(
  "an exam is matched on both its course and its section, not one of them",
  cal.finalsItems([{ row: enrolledRow({ SmObjid: "0009999" }) }]).length,
  0
);

// ---------- exam rooms ----------
cal.finalsByPackage["9462|154646"] = finalRecord({ pkgId: "154646", room: "" });
const noRoom = cal.finalsItems([{ row: enrolledRow({ EventPackageId: "00154646" }) }]);
check("an unpublished room says so on the block", noRoom[0].room, "Room TBA");
check("an unpublished room says so in the detail", noRoom[0].roomFull, "Room not posted yet");

// ---------- the finals week ----------
const midweek = [{ date: new Date(Date.UTC(2026, 11, 9)) }];
check(
  "the week runs Saturday to Saturday around a midweek exam",
  cal.finalsWeek(midweek).map(cal.dateKey),
  [
    "2026-12-05",
    "2026-12-06",
    "2026-12-07",
    "2026-12-08",
    "2026-12-09",
    "2026-12-10",
    "2026-12-11",
    "2026-12-12",
  ]
);
check(
  "an exam on the opening Saturday does not push the week back a day",
  cal.finalsWeek([{ date: new Date(Date.UTC(2026, 11, 5)) }]).map(cal.dateKey).slice(0, 1),
  ["2026-12-05"]
);
check(
  "an exam on the closing Saturday still falls inside the week",
  cal.finalsWeek([{ date: new Date(Date.UTC(2026, 11, 5)) }, { date: new Date(Date.UTC(2026, 11, 12)) }])
    .map(cal.dateKey)
    .slice(-1),
  ["2026-12-12"]
);
check("no exams means no week to draw", cal.finalsWeek([]), []);
check(
  "every day of the week is labelled, exam or not",
  cal.finalsDayDates(midweek),
  {
    "2026-12-05": "Sat Dec 5",
    "2026-12-06": "Sun Dec 6",
    "2026-12-07": "Mon Dec 7",
    "2026-12-08": "Tue Dec 8",
    "2026-12-09": "Wed Dec 9",
    "2026-12-10": "Thu Dec 10",
    "2026-12-11": "Fri Dec 11",
    "2026-12-12": "Sat Dec 12",
  }
);

// ---------- room wording ----------
check(
  "a long building name becomes its campus code",
  cal.roomLabels("Franklin Antonio Hall Room 1301"),
  { short: "FAH 1301", full: "FAH - 1301" }
);
check(
  "a building missing from the directory keeps its full name rather than guessing",
  cal.roomLabels("Some New Hall Room 12"),
  { short: "Some New Hall 12", full: "Some New Hall - 12" }
);
check(
  "room text in an unexpected shape is passed through untouched",
  cal.roomLabels("Remote"),
  { short: "Remote", full: "Remote" }
);
check("no room text yields no labels", cal.roomLabels(""), null);

// ---------- final exams for planned courses ----------
cal.finalsByPackage["9604|154999"] = {
  moduleId: "9604",
  pkgId: "154999",
  date: new Date(Date.UTC(2026, 11, 10)),
  startMin: 480,
  endMin: 659,
  room: "Franklin Antonio Hall Room 1301",
  abbr: "001-000-LE",
  instructor: "Patrick Pannuto",
};

currentPlan = {
  sections: [
    {
      moduleId: "0009604",
      pkgId: "154999",
      year: "2026",
      term: "2",
      courseCode: "CSE-141",
      title: "Computer Architecture",
      components: [{ abbr: "001-000-LE", type: "Lecture", instructor: "Staff", location: "", meetings: [] }],
    },
    {
      moduleId: "0009999",
      pkgId: "111111",
      year: "2026",
      term: "2",
      courseCode: "CSE-999",
      title: "Course With No Final",
      components: [{ abbr: "001-000-LE", type: "Lecture", instructor: "Staff", location: "", meetings: [] }],
    },
  ],
};

const plannedFinals = cal.plannedFinalsItems();
check("only planned courses that actually hold a final are drawn", plannedFinals.length, 1);
check(
  "a planned final lands on its own date at its own time",
  [plannedFinals[0].day, plannedFinals[0].startMin, plannedFinals[0].endMin],
  ["2026-12-10", 480, 659]
);
check(
  "a planned final is marked planned so it reads differently from an enrolled one",
  plannedFinals[0].status,
  "planned"
);
check("a planned final shortens its room like any other", plannedFinals[0].room, "FAH 1301");
check(
  "a planned final carries the course it belongs to",
  [plannedFinals[0].courseCode, plannedFinals[0].section],
  ["CSE-141", "001-000-LE"]
);
check(
  "a planned final names the instructor holding the exam, not the one on the plan",
  plannedFinals[0].instructor,
  "Patrick Pannuto"
);
check(
  "an enrolled and a planned exam read from the same record alike",
  [plannedFinals[0].method, plannedFinals[0].final],
  ["Final Exam", true]
);
check(
  "a planned final cannot collide with an enrolled one",
  plannedFinals[0].key,
  "planfinal|0009604|154999"
);

currentPlan = null;
check("with no schedule chosen there are no planned finals", cal.plannedFinalsItems(), []);

// ---------- rooms on planned classes ----------
currentPlan = {
  sections: [
    {
      moduleId: "0009604",
      pkgId: "154999",
      year: "2026",
      term: "2",
      courseCode: "CSE-141",
      title: "Computer Architecture",
      components: [
        {
          abbr: "001-000-LE",
          type: "Lecture",
          instructor: "Patrick Pannuto",
          location: "Franklin Antonio Hall Room 1301",
          meetings: [{ day: "MO", startMin: 480, endMin: 530 }],
        },
      ],
    },
  ],
};

const plannedClass = cal.plannedItems();
check("a planned class shortens its room like an enrolled one", plannedClass[0].room, "FAH 1301");
check("the planned room keeps its number for the detail", plannedClass[0].roomFull, "FAH - 1301");

currentPlan = null;

// ---------- replacing the calendar contents ----------
function stubItem(name) {
  return { name, destroyed: false, destroy() { this.destroyed = true; } };
}

function stubRoot(items) {
  return {
    items: items.slice(),
    getItems() { return this.items; },
    removeAllItems() { return this.items.splice(0, this.items.length); },
    addItem(item) { this.items.push(item); },
  };
}

const oldChrome = stubItem("chrome");
const oldBody = stubItem("body");
const root = stubRoot([oldChrome, oldBody]);
const newChrome = stubItem("chrome2");
const newBody = stubItem("body2");
cal.swapContent(root, [newChrome, newBody]);

check(
  "the replacement contents take the root's place",
  root.getItems().map((item) => item.name),
  ["chrome2", "body2"]
);
check(
  "the outgoing contents survive until the replacement has rendered",
  [oldChrome.destroyed, oldBody.destroyed],
  [false, false]
);

cal.onRootRendered();
check(
  "the outgoing contents are released once the replacement has rendered",
  [oldChrome.destroyed, oldBody.destroyed],
  [true, true]
);
check(
  "releasing the outgoing contents leaves the replacement alone",
  [newChrome.destroyed, newBody.destroyed],
  [false, false]
);

cal.onRootRendered();
check(
  "a later render has nothing left to release",
  root.getItems().map((item) => item.name),
  ["chrome2", "body2"]
);

// ---------- weekly events on the calendar ----------
cal.events.add({ name: "Work", location: "Geisel", days: ["MO", "WE", "FR"], startMin: 900, endMin: 1080 });

check(
  "an event draws one block on each of its days",
  cal.eventItems().map((item) => [item.day, item.startMin, item.endMin]),
  [
    ["MO", 900, 1080],
    ["WE", 900, 1080],
    ["FR", 900, 1080],
  ]
);
check(
  "an event block carries its name and location",
  cal.eventItems().map((item) => [item.courseCode, item.room, item.method, item.status]),
  [
    ["Work", "Geisel", "", "event"],
    ["Work", "Geisel", "", "event"],
    ["Work", "Geisel", "", "event"],
  ]
);
check(
  "every block of one event shares a key so they open the same detail",
  new Set(cal.eventItems().map((item) => item.key)).size,
  1
);

cal.events.add({ name: "Gym", days: ["TU"], startMin: 420, endMin: 480 });
check(
  "a second event adds its own blocks",
  cal.eventItems().filter((item) => item.day === "TU").map((item) => item.courseCode),
  ["Gym"]
);
check(
  "an event with no location shows none",
  cal.eventItems().filter((item) => item.courseCode === "Gym").map((item) => item.room),
  [""]
);

check(
  "an event shares a day track with a class it overlaps",
  layoutOf([
    { key: "class", day: "MO", startMin: 960, endMin: 1020 },
    cal.eventItems().filter((item) => item.day === "MO")[0],
  ]).map((entry) => [entry.col, entry.cols, entry.conflict]),
  [
    [0, 2, true],
    [1, 2, true],
  ]
);

cal.publishItems(cal.eventItems().filter((item) => item.day === "TU"));
check("an event counts as busy time when searching for classes", cal.busyIntervals(), {
  TU: [{ startMin: 420, endMin: 480, pkgId: null }],
});

check(
  "the legend names events alongside classes",
  cal.legendModel([{ status: "enrolled" }, { status: "event" }]),
  [
    { status: "enrolled", label: "Enrolled" },
    { status: "event", label: "Event" },
  ]
);

// ---------- events that belong to one schedule ----------
cal.events.list().slice().forEach((record) => cal.events.remove(record.id));
cal.events.add({ name: "Everywhere", days: ["MO"], startMin: 600, endMin: 660 });
cal.events.add({ name: "Plan A only", days: ["MO"], startMin: 700, endMin: 760, planId: "planA" });

currentPlan = { id: "planA", name: "Schedule A", sections: [] };
check(
  "the calendar shows the global events and the current schedule's own",
  cal.eventItems().map((item) => item.courseCode),
  ["Everywhere", "Plan A only"]
);

currentPlan = { id: "planB", name: "Schedule B", sections: [] };
check(
  "switching schedules drops the other schedule's events",
  cal.eventItems().map((item) => item.courseCode),
  ["Everywhere"]
);

currentPlan = null;
check(
  "with no schedule at all only the global events draw",
  cal.eventItems().map((item) => item.courseCode),
  ["Everywhere"]
);

// ---------- choosing what an event applies to ----------
allPlans = [];
for (let n = 1; n <= 50; n++) allPlans.push({ id: "p" + n, name: "Schedule " + n, sections: [] });
currentPlan = allPlans[7];

check(
  "the choice is between every schedule and the one in front of you",
  cal.scopeOptions(),
  [
    { key: "", text: "Every schedule" },
    { key: "p8", text: "Schedule 8 only" },
  ]
);

currentPlan = null;
check(
  "with no schedule there is nothing to narrow to",
  cal.scopeOptions(),
  [{ key: "", text: "Every schedule" }]
);

currentPlan = allPlans[7];
check(
  "the detail names the schedule an event is tied to",
  [cal.scopeLabel(null), cal.scopeLabel("p8"), cal.scopeLabel("p50")],
  ["Every schedule", "Schedule 8 only", "Schedule 50 only"]
);

allPlans = [];
currentPlan = null;
cal.events.list().slice().forEach((record) => cal.events.remove(record.id));
check("removing every event clears the calendar of them", cal.eventItems(), []);

console.log(passed + " passed, " + failures.length + " failed");
failures.forEach((line) => console.log("  FAIL " + line));
process.exit(failures.length ? 1 : 0);
