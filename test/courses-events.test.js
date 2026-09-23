const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src", "courses-events.js");

function store() {
  const cells = {};
  return {
    cells,
    getItem: (key) => (key in cells ? cells[key] : null),
    setItem: (key, value) => {
      cells[key] = String(value);
    },
    removeItem: (key) => delete cells[key],
  };
}

function load(localStorage) {
  const src = fs.readFileSync(SRC, "utf8");
  const body = src.replace(/^\(\(\) => \{\r?\n/, "").replace(/\}\)\(\);\s*$/, "");
  const announced = [];
  const win = {
    __tssregShared: {},
    localStorage,
    dispatchEvent: (event) => announced.push(event.type),
  };
  new Function("window", "CustomEvent", body)(win, function (type) {
    this.type = type;
  });
  return { events: win.__tssregShared.events, announced };
}

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else failures.push(name + "\n    expected " + e + "\n    actual   " + a);
}

function draft(fields) {
  return Object.assign({ name: "Work", location: "Geisel", days: ["MO", "WE"], startMin: 900, endMin: 1080 }, fields);
}

function shape(record) {
  return [record.name, record.location, record.days, record.startMin, record.endMin];
}

// ---------- adding an event ----------
const fresh = load(store());
check("a new schedule starts with no events", fresh.events.list(), []);
check("a valid event is accepted", fresh.events.add(draft()), "");
check("the event keeps what was entered", fresh.events.list().map(shape), [["Work", "Geisel", ["MO", "WE"], 900, 1080]]);
check("adding an event announces the change", fresh.announced, ["tssreg:events-changed"]);
check("each event gets an id of its own", new Set(fresh.events.list().map((r) => r.id)).size, 1);

fresh.events.add(draft({ name: "Gym" }));
check("a second event joins the first", fresh.events.list().map((r) => r.name), ["Work", "Gym"]);
check("two events do not share an id", new Set(fresh.events.list().map((r) => r.id)).size, 2);

// ---------- days are kept in week order ----------
const ordered = load(store());
ordered.events.add(draft({ days: ["FR", "MO", "SU", "WE"] }));
check("the stored days read Monday first", ordered.events.list()[0].days, ["MO", "WE", "FR", "SU"]);

const bogus = load(store());
bogus.events.add(draft({ days: ["MO", "XX", "MO"] }));
check("an unknown day is dropped and a repeat counted once", bogus.events.list()[0].days, ["MO"]);

// ---------- what a valid event needs ----------
const blank = load(store());
check("an event with no name is refused", blank.events.add(draft({ name: "   " })), "Event name is required.");
check(
  "an over-long name is refused",
  blank.events.add(draft({ name: "x".repeat(21) })),
  "Event name cannot exceed 20 characters."
);
check(
  "an over-long location is refused",
  blank.events.add(draft({ location: "y".repeat(21) })),
  "Location cannot exceed 20 characters."
);
check("an event on no day is refused", blank.events.add(draft({ days: [] })), "Choose at least one day.");
check(
  "an event with no start time is refused",
  blank.events.add(draft({ startMin: null })),
  "A start time and an end time are required."
);
check(
  "an event that ends before it starts is refused",
  blank.events.add(draft({ startMin: 1080, endMin: 900 })),
  "The start time must be before the end time."
);
check(
  "an event that ends when it starts is refused",
  blank.events.add(draft({ startMin: 900, endMin: 900 })),
  "The start time must be before the end time."
);
check("nothing refused was stored", blank.events.list(), []);
check("nothing refused was announced", blank.announced, []);

// ---------- editing an event ----------
const edited = load(store());
edited.events.add(draft());
const target = edited.events.list()[0].id;
check("an edit is accepted", edited.events.update(target, draft({ name: "Shift", days: ["TU"] })), "");
check("the edit replaces the old values", edited.events.list().map(shape), [["Shift", "Geisel", ["TU"], 900, 1080]]);
check("the event keeps its id across an edit", edited.events.list()[0].id, target);
check(
  "an invalid edit is refused and changes nothing",
  [edited.events.update(target, draft({ name: "" })), edited.events.list()[0].name],
  ["Event name is required.", "Shift"]
);
check(
  "editing an event that is gone is refused",
  edited.events.update("nosuchevent", draft()),
  "That event is no longer on your schedule."
);

// ---------- removing an event ----------
const removed = load(store());
removed.events.add(draft({ name: "Work" }));
removed.events.add(draft({ name: "Gym" }));
removed.events.remove(removed.events.list()[0].id);
check("removing an event leaves the others", removed.events.list().map((r) => r.name), ["Gym"]);
const quiet = removed.announced.length;
removed.events.remove("nosuchevent");
check("removing nothing announces nothing", removed.announced.length, quiet);

// ---------- what survives a reload ----------
const cells = store();
const first = load(cells);
first.events.add(draft({ name: "Work" }));
first.events.add(draft({ name: "Gym", days: ["TU", "TH"], startMin: 420, endMin: 480 }));
const second = load(cells);
check(
  "events come back after a reload",
  second.events.list().map(shape),
  [
    ["Work", "Geisel", ["MO", "WE"], 900, 1080],
    ["Gym", "Geisel", ["TU", "TH"], 420, 480],
  ]
);
check("reloading announces nothing", second.announced, []);

const corrupt = store();
corrupt.setItem("tssreg-course-events", "{not json");
check("unreadable storage reads as no events", load(corrupt).events.list(), []);

const halfBad = store();
halfBad.setItem(
  "tssreg-course-events",
  JSON.stringify([
    { id: "a", name: "Work", location: "", days: ["MO"], startMin: 900, endMin: 1080 },
    { id: "b", name: "", location: "", days: ["MO"], startMin: 900, endMin: 1080 },
    { id: "c", name: "Gym", location: "", days: [], startMin: 900, endMin: 1080 },
    { id: "d", name: "Late", location: "", days: ["MO"], startMin: 1080, endMin: 900 },
  ])
);
check("a stored event that is no longer usable is dropped", load(halfBad).events.list().map((r) => r.id), ["a"]);

// ---------- events that belong to one schedule ----------
const scoped = load(store());
scoped.events.add(draft({ name: "Everywhere" }));
scoped.events.add(draft({ name: "Plan A only", planId: "planA" }));
scoped.events.add(draft({ name: "Plan B only", planId: "planB" }));

check(
  "a schedule sees the global events and its own",
  scoped.events.forPlan("planA").map((r) => r.name),
  ["Everywhere", "Plan A only"]
);
check(
  "another schedule sees the global events and its own instead",
  scoped.events.forPlan("planB").map((r) => r.name),
  ["Everywhere", "Plan B only"]
);
check(
  "with no schedule chosen only the global events show",
  scoped.events.forPlan(null).map((r) => r.name),
  ["Everywhere"]
);
check(
  "an event belongs to a schedule only when it says so",
  scoped.events.ownedBy("planA").map((r) => r.name),
  ["Plan A only"]
);
check("a global event belongs to no schedule", scoped.events.ownedBy(null), []);

// ---------- moving an event between schedules ----------
const moved = load(store());
moved.events.add(draft({ name: "Work", planId: "planA" }));
const movedId = moved.events.list()[0].id;
moved.events.update(movedId, draft({ name: "Work", planId: null }));
check(
  "an event can be promoted to every schedule",
  [moved.events.forPlan("planB").length, moved.events.ownedBy("planA").length],
  [1, 0]
);
moved.events.update(movedId, draft({ name: "Work", planId: "planB" }));
check(
  "a global event can be narrowed to one schedule",
  [moved.events.forPlan("planA").map((r) => r.name), moved.events.forPlan("planB").map((r) => r.name)],
  [[], ["Work"]]
);

// ---------- a schedule that goes away ----------
const dropped = load(store());
dropped.events.add(draft({ name: "Everywhere" }));
dropped.events.add(draft({ name: "Plan A only", planId: "planA" }));
dropped.events.add(draft({ name: "Plan B only", planId: "planB" }));
dropped.events.removeOwnedBy("planA");
check(
  "deleting a schedule takes its own events and leaves the rest",
  dropped.events.list().map((r) => r.name),
  ["Everywhere", "Plan B only"]
);
const settled = dropped.announced.length;
dropped.events.removeOwnedBy("planA");
check("a schedule with no events of its own announces nothing", dropped.announced.length, settled);
dropped.events.removeOwnedBy(null);
check("clearing a missing schedule never touches the global events", dropped.events.list().length, 2);

// ---------- duplicating a schedule ----------
const copied = load(store());
copied.events.add(draft({ name: "Everywhere" }));
copied.events.add(draft({ name: "Work", planId: "planA" }));
copied.events.copyOwnedBy("planA", "planB");
check(
  "the copy gets its own version of the original's events",
  copied.events.forPlan("planB").map((r) => r.name),
  ["Everywhere", "Work"]
);
check("the original keeps its events", copied.events.forPlan("planA").map((r) => r.name), ["Everywhere", "Work"]);
check(
  "the copied event is a separate record",
  new Set(copied.events.list().map((r) => r.id)).size,
  3
);
check(
  "editing the copy leaves the original alone",
  (() => {
    const copy = copied.events.ownedBy("planB")[0];
    copied.events.update(copy.id, draft({ name: "Later shift", planId: "planB" }));
    return [copied.events.ownedBy("planA")[0].name, copied.events.ownedBy("planB")[0].name];
  })(),
  ["Work", "Later shift"]
);
const quietCopy = copied.announced.length;
copied.events.copyOwnedBy("planA", null);
check("copying into no schedule does nothing", copied.announced.length, quietCopy);

// ---------- what survives a reload ----------
const scopedCells = store();
const before = load(scopedCells);
before.events.add(draft({ name: "Work", planId: "planA" }));
check("an event remembers its schedule after a reload", load(scopedCells).events.list()[0].planId, "planA");

// ---------- the signature tracks every change ----------
const watched = load(store());
const empty = watched.events.signature();
watched.events.add(draft());
const added = watched.events.signature();
watched.events.update(watched.events.list()[0].id, draft({ name: "Shift" }));
const renamed = watched.events.signature();
watched.events.remove(watched.events.list()[0].id);
check(
  "adding, editing and removing each move the signature",
  [empty !== added, added !== renamed, renamed !== watched.events.signature(), empty === watched.events.signature()],
  [true, true, true, true]
);

console.log(passed + " passed, " + failures.length + " failed");
failures.forEach((line) => console.log("  FAIL " + line));
process.exit(failures.length ? 1 : 0);
