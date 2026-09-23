const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src");

function evaluate(file, win, location) {
  const src = fs.readFileSync(path.join(SRC, file), "utf8");
  const body = src.replace(/^\(\(\) => \{\r?\n/, "").replace(/\}\)\(\);\s*$/, "");
  new Function("window", "sap", "document", "location", "fetch", body)(win, null, null, location, () =>
    Promise.resolve({ ok: false })
  );
}

const BUILDINGS = {
  "Computer Science and Engineering Buildin": "EBU3B",
  "Medical Education and Telemedicine Cente": "MET",
  "Center Hall": "CENTR",
  "Galbraith Hall": "GH",
  "The Jeannie": "JEANN",
};

const location = { hash: "" };
const win = {
  __tssregShared: {
    chunk: (arr) => [arr],
    serviceUrl: (name) => "/svc/" + name,
    odataLiteral: (value) => "'" + value + "'",
    CLIENT: "sap-client=500",
    ROW_LIMIT: 5000,
    ID_CHUNK_SIZE: 40,
    onUiUpdated: (fn) => (tick = fn),
    whenSapReady: (fn) => fn(),
  },
};

let tick = () => {};
let requested = [];

evaluate("courses-page.js", win, location);
evaluate("courses-catalog.js", win, location);
win.__tssregShared.catalog.loadBuildings = (year, term) => {
  requested.push(year + "|" + term);
  return Promise.resolve(BUILDINGS);
};
evaluate("soc-rooms.js", win, location);

const socRooms = win.__tssregShared.socRooms;

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else failures.push(name + "\n    expected " + e + "\n    actual   " + a);
}

function settle() {
  return new Promise((resolve) => setImmediate(resolve));
}

const COURSE = "#YSchedule-view&/YUCSD_CON_MODULE(AcademicYear='2026',AcademicPeriod='2',ModuleID='9273')?layout=TwoColumnsMidExpanded";

async function run() {
  // ---------- before the building codes arrive ----------
  location.hash = COURSE;
  check(
    "TSS's own text stands until the codes are loaded",
    socRooms.scheduleWithCodes("Tu, Th 08:00 AM - 09:20 AM In Person @ Center Hall Room 105"),
    "Tu, Th 08:00 AM - 09:20 AM In Person @ Center Hall Room 105"
  );

  tick();
  await settle();
  check("the term on screen is the one looked up", requested, ["2026|2"]);

  // ---------- a name TSS cuts off mid-word ----------
  check(
    "the truncated building name becomes its code",
    socRooms.scheduleWithCodes(
      "M, W, F 09:00 AM - 09:50 AM In Person @ Computer Science and Engineering Buildin Room B270"
    ),
    "M, W, F 09:00 AM - 09:50 AM In Person @ EBU3B B270"
  );
  check(
    "a second cut-off name reads the same way",
    socRooms.scheduleWithCodes("Tu 02:00 PM - 03:20 PM In Person @ Medical Education and Telemedicine Cente Room 315"),
    "Tu 02:00 PM - 03:20 PM In Person @ MET 315"
  );

  // ---------- names that were never cut off ----------
  check(
    "a short building name is still shortened to its code",
    socRooms.scheduleWithCodes("M 05:00 PM - 05:50 PM In Person @ Galbraith Hall Room 242"),
    "M 05:00 PM - 05:50 PM In Person @ GH 242"
  );
  check(
    "a lettered room keeps its letter",
    socRooms.scheduleWithCodes("F 10:00 AM - 10:50 AM In Person @ The Jeannie Room AUD"),
    "F 10:00 AM - 10:50 AM In Person @ JEANN AUD"
  );

  // ---------- every line of the schedule ----------
  check(
    "the final exam line is rewritten alongside the meeting line",
    socRooms.scheduleWithCodes(
      "M, W, F 09:00 AM - 09:50 AM In Person @ Center Hall Room 105\n" +
        "Final Examination 12/09/2026 08:00 AM - 10:59 AM In Person @ Galbraith Hall Room 242"
    ),
    "M, W, F 09:00 AM - 09:50 AM In Person @ CENTR 105\n" +
      "Final Examination 12/09/2026 08:00 AM - 10:59 AM In Person @ GH 242"
  );

  // ---------- schedules with no room at all ----------
  check(
    "a remote section is left alone",
    socRooms.scheduleWithCodes("Tu, Th 11:00 AM - 12:20 PM Live Online"),
    "Tu, Th 11:00 AM - 12:20 PM Live Online"
  );
  check("an undefined schedule is left alone", socRooms.scheduleWithCodes("Schedule Not Defined"), "Schedule Not Defined");
  check("no schedule text yields none", socRooms.scheduleWithCodes(""), "");

  // ---------- a building the term never listed ----------
  check(
    "an unknown building keeps the name TSS gave it",
    socRooms.scheduleWithCodes("W 01:00 PM - 01:50 PM In Person @ Somewhere New Room 12"),
    "W 01:00 PM - 01:50 PM In Person @ Somewhere New Room 12"
  );

  // ---------- away from a course ----------
  location.hash = "#YSchedule-view";
  check(
    "off the course page the text is untouched",
    socRooms.scheduleWithCodes("M 09:00 AM - 09:50 AM In Person @ Center Hall Room 105"),
    "M 09:00 AM - 09:50 AM In Person @ Center Hall Room 105"
  );

  // ---------- returning to a course already looked up ----------
  location.hash = COURSE;
  tick();
  await settle();
  check("the term is not looked up twice", requested, ["2026|2"]);
  check(
    "the codes are still in hand",
    socRooms.scheduleWithCodes("M 09:00 AM - 09:50 AM In Person @ Center Hall Room 105"),
    "M 09:00 AM - 09:50 AM In Person @ CENTR 105"
  );

  console.log(passed + " passed, " + failures.length + " failed");
  failures.forEach((line) => console.log("  FAIL " + line));
  process.exit(failures.length ? 1 : 0);
}

run();
