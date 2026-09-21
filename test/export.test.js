const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src", "courses-export.js");

function fakeContext(record) {
  const ctx = {
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    textAlign: "left",
    measureText: (text) => ({ width: String(text).length * 6 }),
    scale() {},
    save() {},
    restore() {},
    clip() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    setLineDash() {},
    fillRect() {},
    rect: (x, y, w, h) => record.rects.push({ x: round(x), y: round(y), w: round(w), h: round(h) }),
    fillText: (text, x, y) =>
      record.texts.push({ text, x: round(x), y: round(y), align: ctx.textAlign, font: ctx.font }),
  };
  return ctx;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function loadExport(record) {
  const src = fs.readFileSync(SRC, "utf8");
  const body = src.replace(/^\(\(\) => \{\r?\n/, "").replace(/\}\)\(\);\s*$/, "");
  const exposed = body + "\n;return window.__tssregShared.scheduleExport;";
  const win = { __tssregShared: {} };
  const doc = {
    fonts: null,
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => fakeContext(record),
      toBlob: (cb) => cb(null),
    }),
  };
  return new Function("window", "document", "URL", "setTimeout", exposed)(win, doc, {}, () => {});
}

const record = { rects: [], texts: [] };
const ex = loadExport(record);

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else failures.push(name + "\n    expected " + e + "\n    actual   " + a);
}

// ---------- block height follows the on-screen composition ----------
check("a bare block is time plus title", ex.blockHeight({}), 41);
check("a meta line adds one row", ex.blockHeight({ meta: "Lecture / CENTR 115" }), 53);
check("meta and instructor add two rows", ex.blockHeight({ meta: "LE", instructor: "Ada" }), 65);

// ---------- the vertical scale mirrors applyGeometry ----------
check(
  "the shortest block gets room for its text",
  ex.pxPerMinute([{ startMin: 540, endMin: 590, meta: "LE", instructor: "Ada" }], { startMin: 480, endMin: 1020 }),
  1.6
);
check(
  "long blocks never squeeze below one pixel a minute",
  ex.pxPerMinute([{ startMin: 540, endMin: 660 }], { startMin: 480, endMin: 1020 }),
  1
);
check(
  "an empty schedule still scales off the minimum block",
  ex.pxPerMinute([], { startMin: 480, endMin: 1020 }),
  1
);

// ---------- canvas size ----------
const range = { startMin: 540, endMin: 660 };
const days = [
  { key: "MO", label: "Mon" },
  { key: "TU", label: "Tue" },
];
const size = ex.measure({ range, days, items: [] });
check("width is padding, axis and one column per day", size.width, 24 * 2 + 54 + 180 * 2);
check("the grid starts after the time axis", size.gridLeft, 78);
check("tracks start below the heading and the day row", size.trackTop, 24 + 48 + 26);
check("the track covers the whole range plus slack", size.trackHeight, 120 * size.perMinute + 12);
check("height stacks heading, days, track and legend", size.height, 24 * 2 + 48 + 26 + size.trackHeight + 34);
check(
  "a wider week is a wider canvas",
  ex.measure({ range, days: days.concat([{ key: "WE", label: "Wed" }]), items: [] }).width - size.width,
  180
);

// ---------- file name ----------
const day = new Date(2026, 8, 21);
check("the plan name becomes the file name", ex.fileName({ planName: "Schedule 1" }, day), "schedule-1-2026-09-21.png");
check("punctuation is stripped", ex.fileName({ planName: "Fall '26 (draft)" }, day), "fall-26-draft-2026-09-21.png");
check("an unnamed plan falls back", ex.fileName({ planName: "" }, day), "my-schedule-2026-09-21.png");
check("a name with nothing usable falls back", ex.fileName({ planName: "***" }, day), "my-schedule-2026-09-21.png");
check("the plan name leads the subtitle", ex.subtitle({ planName: "Schedule 1" }, day).indexOf("Schedule 1 | Exported"), 0);
check("no plan means no separator", ex.subtitle({ planName: "" }, day).indexOf("Exported"), 0);

// ---------- rendered geometry ----------
const model = {
  planName: "Schedule 1",
  range: { startMin: 540, endMin: 660 },
  days: [
    { key: "MO", label: "Mon" },
    { key: "TU", label: "Tue" },
  ],
  hours: [
    { minute: 540, label: "9 AM" },
    { minute: 600, label: "10 AM" },
    { minute: 660, label: "11 AM" },
  ],
  legend: [
    { status: "enrolled", label: "Enrolled" },
    { status: "conflict", label: "Time conflict" },
  ],
  items: [
    { day: "MO", startMin: 540, endMin: 590, column: 0, columns: 2, conflict: true, status: "enrolled",
      timeLabel: "9:00", statusLabel: "Enrolled", title: "CSE-123", meta: "LE / CENTR 115", instructor: "Ada" },
    { day: "MO", startMin: 570, endMin: 620, column: 1, columns: 2, conflict: true, status: "planned",
      timeLabel: "9:30", statusLabel: "Planned", title: "CSE-141", meta: "LE / FAH 1301", instructor: "Grace" },
    { day: "TU", startMin: 600, endMin: 650, column: 0, columns: 1, conflict: false, status: "enrolled",
      timeLabel: "10:00", statusLabel: "Enrolled", title: "CSE-167", meta: "", instructor: "" },
    { day: "SA", startMin: 600, endMin: 650, column: 0, columns: 1, conflict: false, status: "other",
      timeLabel: "10:00", statusLabel: "", title: "GONE", meta: "", instructor: "" },
  ],
};

record.rects.length = 0;
record.texts.length = 0;
const canvas = ex.render(model);
const perMinute = ex.measure(model).perMinute;
const trackTop = ex.measure(model).trackTop;

check("the canvas is drawn at two times scale", [canvas.width, canvas.height], [
  Math.round(ex.measure(model).width * 2),
  Math.round(ex.measure(model).height * 2),
]);

const blocks = record.rects.filter((r) => r.w > 40 && r.w < 180);
check(
  "conflicting blocks split their day, the solo block keeps it",
  blocks.filter((r, i) => i % 2 === 0).map((r) => [r.x, r.w]),
  [
    [79, 88],
    [169, 88],
    [259, 178],
  ]
);
check(
  "blocks are placed by start time",
  blocks.filter((r, i) => i % 2 === 0).map((r) => round(r.y - trackTop)),
  [0, round(30 * perMinute), round(60 * perMinute)]
);
check(
  "a day outside the week is not drawn",
  record.texts.some((t) => t.text === "GONE"),
  false
);
check(
  "every block prints its code and instructor",
  record.texts.filter((t) => ["CSE-123", "CSE-141", "CSE-167", "Ada", "Grace"].indexOf(t.text) !== -1).length,
  5
);
check(
  "text too wide for a split column is ellipsized",
  record.texts.filter((t) => /^LE \/ CENTR 1\u2026$/.test(t.text)).length,
  1
);
check(
  "the heading carries the plan name",
  record.texts.filter((t) => t.text === "My Schedule").length + record.texts.filter((t) => /^Schedule 1 \| Exported/.test(t.text)).length,
  2
);
check(
  "day headers and hour labels are drawn once each",
  [
    record.texts.filter((t) => t.text === "Mon" || t.text === "Tue").length,
    record.texts.filter((t) => /^\d+ [AP]M$/.test(t.text)).length,
  ],
  [2, 3]
);
check(
  "the legend is drawn under the track",
  record.texts
    .filter((t) => t.text === "Enrolled" && t.y > trackTop + 120 * perMinute)
    .map((t) => t.text),
  ["Enrolled"]
);
check(
  "the conflict swatch is 12 by 12",
  record.rects.filter((r) => r.w === 12 && r.h === 12).length,
  2
);

// ---------- huge schedules stay within canvas limits ----------
const huge = {
  planName: "",
  range: { startMin: 0, endMin: 1440 },
  days: model.days,
  hours: [],
  legend: [],
  items: [{ day: "MO", startMin: 540, endMin: 545, column: 0, columns: 1, conflict: false, status: "other",
    timeLabel: "9:00", statusLabel: "", title: "TINY", meta: "x", instructor: "y" }],
};
const hugeCanvas = ex.render(huge);
check("an oversized render is scaled down instead of overflowing", hugeCanvas.height <= 8000, true);

console.log(passed + " passed, " + failures.length + " failed");
failures.forEach((line) => console.log("  FAIL " + line));
process.exit(failures.length ? 1 : 0);
