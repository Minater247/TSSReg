const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src");

function evaluate(file, win) {
  const src = fs.readFileSync(path.join(SRC, file), "utf8");
  const body = src.replace(/^\(\(\) => \{\r?\n/, "").replace(/\}\)\(\);\s*$/, "");
  new Function("window", "sap", "document", "location", "fetch", body)(win, null, null, { hash: "" }, () =>
    Promise.resolve({ ok: false })
  );
}

const win = {
  __tssregShared: {
    chunk: (arr, size) => {
      const out = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    },
    serviceUrl: (path) => "/svc/" + path,
    odataLiteral: (value) => "'" + String(value).replace(/'/g, "''") + "'",
    CLIENT: "sap-client=500",
    ROW_LIMIT: 5000,
    ID_CHUNK_SIZE: 40,
    onUiUpdated() {},
    whenSapReady: (fn) => fn(),
  },
};
evaluate("courses-page.js", win);
evaluate("courses-catalog.js", win);
const catalog = win.__tssregShared.catalog;

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else failures.push(name + "\n    expected " + e + "\n    actual   " + a);
}

function sched(final) {
  return "Tu, Th 05:00 PM - 06:20 PM In Person @ Center Hall Room 105" + (final ? "\n" + final : "");
}

// ---------- reading a final out of the schedule text ----------
const morning = catalog.finalFromSched(
  sched("Final Examination 12/11/2026 08:00 AM - 10:59 AM In Person @ Center Hall Room 115")
);
check(
  "a morning exam is read off the schedule text",
  [morning.date.toISOString().slice(0, 10), morning.startMin, morning.endMin, morning.room],
  ["2026-12-11", 480, 659, "Center Hall Room 115"]
);

const evening = catalog.finalFromSched(
  sched("Final Examination 12/11/2026 07:00 PM - 09:59 PM In Person @ Center Hall Room 105")
);
check(
  "an evening exam is not read as a morning one",
  [evening.startMin, evening.endMin],
  [1140, 1319]
);

// ---------- the hours that wrap ----------
check(
  "noon reads as midday rather than midnight",
  catalog.finalFromSched(sched("Final Examination 12/11/2026 12:00 PM - 01:30 PM In Person @ Center Hall Room 1")).startMin,
  720
);
check(
  "midnight reads as the start of the day rather than midday",
  catalog.finalFromSched(sched("Final Examination 12/11/2026 12:15 AM - 01:30 AM In Person @ Center Hall Room 1")).startMin,
  15
);

// ---------- exams with no room published ----------
check(
  "an exam with no room still yields its time",
  (() => {
    const found = catalog.finalFromSched(sched("Final Examination 12/11/2026 08:00 AM - 10:59 AM In Person"));
    return [found.startMin, found.room];
  })(),
  [480, ""]
);

// ---------- text with no usable exam ----------
check("a course with no final yields nothing", catalog.finalFromSched(sched("")), null);
check("empty schedule text yields nothing", catalog.finalFromSched(""), null);
check(
  "an exam line with no times is dropped rather than guessed at",
  catalog.finalFromSched(sched("Final Examination 12/11/2026 TBA In Person @ Center Hall Room 115")),
  null
);
check(
  "an exam that ends before it starts is dropped",
  catalog.finalFromSched(sched("Final Examination 12/11/2026 10:59 AM - 08:00 AM In Person @ Center Hall Room 115")),
  null
);

check(
  "an exam line with no date is dropped",
  catalog.finalFromSched(sched("Final Examination 08:00 AM - 10:59 AM In Person @ Center Hall Room 115")),
  null
);

// ---------- the lecture line is not mistaken for the exam ----------
check(
  "the weekly meeting line is never read as the exam",
  catalog.finalFromSched("Tu, Th 05:00 PM - 06:20 PM In Person @ Center Hall Room 105"),
  null
);

// ---------- gathering finals across a package ----------
function eventRow(fields) {
  return Object.assign(
    {
      ModuleID: "0009462",
      EventObjid: "00200001",
      EventPkgObjid: "00154645",
      EventAbbr: "001-000-LE",
      InstructorName: "Alex Snoeren",
      Sched: sched("Final Examination 12/11/2026 08:00 AM - 10:59 AM In Person @ Center Hall Room 115"),
    },
    fields
  );
}

const gathered = catalog.finalsFromEvents([eventRow({})]);
check(
  "a final is filed under its module and package",
  gathered.map((entry) => entry.moduleId + "|" + entry.pkgId),
  ["9462|154645"]
);
check(
  "the section and instructor come from the row that holds the exam",
  [gathered[0].abbr, gathered[0].instructor],
  ["001-000-LE", "Alex Snoeren"]
);
check(
  "a discussion with no exam line adds nothing",
  catalog.finalsFromEvents([eventRow({ EventAbbr: "001-001-DI", EventObjid: "00200002", Sched: sched("") })]).length,
  0
);
check(
  "one package yields one exam even when several rows repeat it",
  catalog.finalsFromEvents([eventRow({}), eventRow({ EventObjid: "00200002", EventAbbr: "001-001-DI" })]).length,
  1
);
check(
  "a package of its own is kept apart",
  catalog
    .finalsFromEvents([eventRow({}), eventRow({ EventPkgObjid: "00154646" })])
    .map((entry) => entry.pkgId),
  ["154645", "154646"]
);
check(
  "a row with no package of its own falls back to its event id",
  catalog.finalsFromEvents([eventRow({ EventPkgObjid: "" })]).map((entry) => entry.pkgId),
  ["200001"]
);

console.log(passed + " passed, " + failures.length + " failed");
failures.forEach((line) => console.log("  FAIL " + line));
process.exit(failures.length ? 1 : 0);
