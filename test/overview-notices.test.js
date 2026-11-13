const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const src = fs.readFileSync(path.join(__dirname, "../src/overview-notices.js"), "utf8");
const period = { academicYear: "2026", academicSession: "002", holdLevel: "H", programType: "UG" };
const window = {
  __tssregShared: {
    onUiUpdated() {},
    whenSapReady() {},
    academicTerms: {
      key: (year, term) => year + "|" + term,
      openPeriod: () => period,
      windowsFor: (row, appointments) => appointments.times,
      isOpen: (pass) => pass.timelimitStatus === "A",
      appointmentTerm: (row) => ({ year: row.academicYear, term: row.academicSession }),
      coursesFor: (bookings) => bookings,
    },
  },
};
vm.runInNewContext(src.replace(/\}\)\(\);\s*$/, "window.notices = (fixture) => { data = fixture; return computeNotices(); }; })();"), { window });

function notices(label, status) {
  return window.notices({
    appointments: { periods: [period], times: [{
      timelimit_Text: label, timelimitStatus: status, timelimit: "01", waitlists: "Allowed",
      beginTimestamp: "2099-01-01T00:00:00Z", endTimestamp: "2099-02-01T00:00:00Z",
    }] },
    bookings: [{ Credits: "4" }],
    maxUnits: [{ ProgType: "UG", Perid: "002", Timelimit: "01", MaxUnits: "20" }],
  });
}

for (const [label, expected] of [
  ["Instruction Session Enrollment", "Instruction Session Enrollment"],
  ["ENROLLMENT PASS", "ENROLLMENT PASS"],
  ["Second Enrollment pass", "Second Enrollment pass"],
  ["First Pass", "First Pass enrollment"],
  [null, "enrollment"],
]) {
  assert.equal(notices(label, "A")[1].text, `Your ${expected} is open`);
  assert.equal(notices(label, "U")[1].text, `Your ${expected} hasn't opened yet`);
}
const [hold, open] = notices("First Pass", "A");
assert.equal(hold.text, "A hold is blocking your enrollment");
assert.equal(open.actionLabel, "Open");
assert.deepEqual(Array.from(open.meta), ["4 units enrolled", "20 unit cap", "Waitlists allowed"]);
assert.equal(notices("First Pass", "U")[1].actionLabel, "Details");
console.log("Enrollment notice wording checks passed");
