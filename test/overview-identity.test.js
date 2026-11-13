const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../src/overview-identity.js"), "utf8");

async function testIdentityCard() {
  let render;
  let init;
  let busy = true;
  let pending = false;
  let fallback;
  const pages = [];
  const messages = [];
  const quickViewEl = {
    id: "native-quickViewCard",
    querySelector: (selector) => selector === ".tssreg-identity-fallback" ? fallback : null,
    appendChild: (node) => { fallback = node; },
  };
  const quickView = {
    getBusy: () => busy,
    getModel: () => ({ hasPendingRequests: () => pending }),
    getPages: () => pages,
    addPage: (page) => pages.push(page),
  };
  const card = { querySelector: (selector) => selector === '[id$="quickViewCard"]' ? quickViewEl : null };
  const controls = new Map([[quickViewEl.id, quickView]]);
  const document = {
    createElement: () => ({ setAttribute() {}, remove: () => { fallback = undefined; } }),
  };
  class QuickViewPage {
    constructor(id) { this.id = id; }
    getId() { return this.id; }
  }
  class QuickViewGroupElement {
    constructor(id, settings) {
      Object.assign(this, settings);
      controls.set(id, this);
    }
    getLabel() { return this.label; }
    getVisible() { return true; }
    getValue() { return this.value; }
  }
  const shared = {
    academicTerms: {
      loadBookings: async () => [{}],
      currentTerm: () => ({ year: "2026" }),
      coursesFor: (bookings) => bookings,
    },
    catalog: { loadTerms: async () => [] },
    cardElement: () => card,
    isOverviewRoute: () => true,
    whenSapReady: (callback) => { init = callback; },
    onUiUpdated: (callback) => { render = callback; },
  };
  vm.runInNewContext(source, {
    window: { __tssregShared: shared },
    document,
    sap: { ui: {
      require: (names, callback) => {
        const modules = { QuickViewGroupElement, QuickViewPage };
        callback(...names.map((name) => modules[name.split("/").pop()]));
      },
      getCore: () => ({ byId: (id) => controls.get(id) }),
    } },
  });

  init();
  assert.equal(fallback, undefined, "wait while the native card is busy");
  busy = false;
  pending = true;
  render();
  assert.equal(fallback, undefined, "wait while TSS has requests in flight");
  pending = false;
  render();
  assert.equal(pages.length, 0, "leave the bound aggregation empty so SAP can insert a page");
  assert.equal(fallback.textContent, "TSS did not load the identity card");
  const originalMessage = fallback;
  render();
  assert.equal(fallback, originalMessage, "reuse the message across repeated UI updates");

  pages.push({
    getId: () => "native-page",
    getHeader: () => "Role",
    getGroups: () => [{ getElements: () => messages, addElement: (element) => messages.push(element) }],
  });
  render();
  assert.equal(fallback, undefined, "remove the message when TSS renders its own page");
  await new Promise(setImmediate);
  assert.equal(messages[0].getValue(), "1 course this term");
}

testIdentityCard().then(() => console.log("Identity card loading and recovery checks passed")).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
