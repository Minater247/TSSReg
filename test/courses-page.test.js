const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src", "courses-page.js");

function loadPage() {
  const src = fs.readFileSync(SRC, "utf8");
  const body = src.replace(/^\(\(\) => \{\r?\n/, "").replace(/\}\)\(\);\s*$/, "");
  const win = {
    __tssregShared: {
      odataLiteral: (value) => "'" + String(value).replace(/'/g, "''") + "'",
    },
  };
  new Function("window", "sap", "document", "location", body)(win, null, null, { hash: "" });
  return win.__tssregShared.coursesPage;
}

const page = loadPage();

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else failures.push(name + "\n    expected " + e + "\n    actual   " + a);
}

function meeting(day, startMin, endMin) {
  return { day, startMin, endMin };
}

// ---------- clock labels ----------
check("midnight reads as twelve", page.clockLabel(0), "12:00");
check("noon reads as twelve", page.clockLabel(720), "12:00");
check("minutes keep two digits", page.clockLabel(545), "9:05");
check("morning carries AM", page.meridiemLabel(545), "9:05 AM");
check("noon carries PM", page.meridiemLabel(720), "12:00 PM");
check("the last minute before noon is AM", page.meridiemLabel(719), "11:59 AM");
check("a bare range drops the meridiem", page.rangeLabel(540, 590), "9:00 – 9:50");
check("a full range carries both", page.fullRangeLabel(540, 770), "9:00 AM – 12:50 PM");

// ---------- day lists ----------
check("day codes become names", page.dayListLabel("MO/WE/FR"), "Mon/Wed/Fri");
check("an unknown code is left alone", page.dayListLabel("MO/XX"), "Mon/XX");
check("an empty day string stays empty", page.dayListLabel(""), "");
check("a missing day string stays empty", page.dayListLabel(null), "");

// ---------- meeting labels ----------
check(
  "days that share a time collapse onto one line",
  page.meetingLabel([meeting("WE", 600, 650), meeting("MO", 600, 650), meeting("FR", 600, 650)]),
  "Mon/Wed/Fri 10:00 AM – 10:50 AM"
);
check(
  "days are ordered by the week, not by arrival",
  page.meetingLabel([meeting("TH", 540, 590), meeting("TU", 540, 590)]),
  "Tue/Thu 9:00 AM – 9:50 AM"
);
check(
  "different times get their own line, earliest first",
  page.meetingLabel([meeting("FR", 900, 950), meeting("MO", 600, 650)]),
  "Mon 10:00 AM – 10:50 AM\nFri 3:00 PM – 3:50 PM"
);
check("no meetings means no label", page.meetingLabel([]), "");
check("a missing meetings list means no label", page.meetingLabel(undefined), "");

// ---------- course route ----------
check(
  "a course route carries year, term and module",
  page.courseRoute("2026", "2", "10491"),
  "#YSchedule-view&/YUCSD_CON_MODULE(AcademicYear='2026',AcademicPeriod='2',ModuleID='10491')?layout=TwoColumnsMidExpanded"
);
check("a term-less route falls back to the search page", page.courseRoute("", "2", "10491"), "#YSchedule-view");
check("a year-less route falls back to the search page", page.courseRoute("2026", "", "10491"), "#YSchedule-view");

console.log(passed + " passed, " + failures.length + " failed");
failures.forEach((line) => console.log("  FAIL " + line));
process.exit(failures.length ? 1 : 0);
