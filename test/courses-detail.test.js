const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src");

function evaluate(file, win) {
  const src = fs.readFileSync(path.join(SRC, file), "utf8");
  const body = src.replace(/^\(\(\) => \{\r?\n/, "").replace(/\}\)\(\);\s*$/, "");
  new Function("window", "sap", "document", "location", body)(win, null, null, { hash: "" });
}

const win = {
  __tssregShared: {
    odataLiteral: (value) => "'" + String(value) + "'",
    onUiUpdated() {},
  },
};
evaluate("courses-page.js", win);
evaluate("courses-detail.js", win);
const detail = win.__tssregShared.courseDetail;

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else failures.push(name + "\n    expected " + e + "\n    actual   " + a);
}

function time(minutes) {
  return { ms: minutes * 60000, __edmType: "Edm.Time" };
}

function occurrence(dayNumber, dayName, startMin, endMin, meetingTypeText, date) {
  return {
    DayNumber: String(dayNumber),
    DayName: dayName,
    StartTime: time(startMin),
    EndTime: time(endMin),
    MeetingType: meetingTypeText ? "FI" : "",
    MeetingTypeText: meetingTypeText || "",
    EventDate: date === undefined ? new Date(Date.UTC(2026, 8, 25)) : date,
    Modality: "REG",
  };
}

// ---------- weekly pattern ----------
const lecture = { results: [] };
for (let i = 0; i < 10; i++) lecture.results.push(occurrence(5, "Friday", 960, 1010));
for (let i = 0; i < 10; i++) lecture.results.push(occurrence(1, "Monday", 960, 1010));
for (let i = 0; i < 9; i++) lecture.results.push(occurrence(3, "Wednesday", 960, 1010));
lecture.results.push(occurrence(2, "Tuesday", 900, 1079, "Final Examination", new Date(Date.UTC(2026, 11, 8))));

check(
  "the weekly pattern drops the one-off final that EventScheduleDays includes",
  detail.weeklyMeetings(lecture.results).map((m) => m.day),
  ["FR", "MO", "WE"]
);
check(
  "repeated occurrences of one day collapse to a single meeting",
  detail.weeklyMeetings(lecture.results).length,
  3
);
check(
  "the recurring days read in week order on one line",
  detail.scheduleLabel(lecture).split("\n")[0],
  "Mon/Wed/Fri 4:00 PM – 4:50 PM"
);
check(
  "the final exam is kept, named and dated on its own line",
  detail.scheduleLabel(lecture).split("\n")[1],
  "Final Examination Tue, Dec 8 3:00 PM – 5:59 PM"
);
check("a lecture yields exactly two lines", detail.scheduleLabel(lecture).split("\n").length, 2);

// ---------- single-day sections ----------
const lab = { results: [] };
for (let i = 0; i < 10; i++) lab.results.push(occurrence(4, "Thursday", 600, 770));
check("a single-day section reads as one line", detail.scheduleLabel(lab), "Thu 10:00 AM – 12:50 PM");
check("a single-day section has no special sessions", detail.specialSessions(lab.results), []);

// ---------- unusable input ----------
check("no schedule yields no label", detail.scheduleLabel(undefined), "");
check("an empty result set yields no label", detail.scheduleLabel({ results: [] }), "");
check(
  "an unknown day number is dropped",
  detail.weeklyMeetings([occurrence(9, "Someday", 600, 650)]),
  []
);
check(
  "a zero-length meeting is dropped",
  detail.weeklyMeetings([occurrence(1, "Monday", 600, 600)]),
  []
);
check(
  "a row with no usable time is dropped",
  detail.weeklyMeetings([{ DayNumber: "1", StartTime: null, EndTime: null, MeetingType: "" }]),
  []
);
check(
  "a special session with no date is dropped",
  detail.specialSessions([occurrence(2, "Tuesday", 900, 960, "Final Examination", null)]),
  []
);

// ---------- room labels ----------
check("the building code leads the room label", detail.roomLabel("CTL 0125", "Room 0125 - Lecture Hall"), "CTL 0125 - Lecture Hall");
check("a department space reads the same way", detail.roomLabel("EBU3B B270", "Room B270 - Department Space"), "EBU3B B270 - Department Space");
check("a bare code needs no suffix", detail.roomLabel("PETER 110", ""), "PETER 110");
check("a suffix that is only the room number collapses", detail.roomLabel("PETER 110", "Room 110"), "PETER 110");
check("no building code means no label, so TSS's own text stands", detail.roomLabel("", "Room 0125 - Lecture Hall"), "");

console.log(passed + " passed, " + failures.length + " failed");
failures.forEach((line) => console.log("  FAIL " + line));
process.exit(failures.length ? 1 : 0);
