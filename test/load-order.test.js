const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.join(__dirname, "..", "src");
const manifest = JSON.parse(fs.readFileSync(path.join(SRC, "manifest.json"), "utf8"));
const scripts = manifest.content_scripts.filter((entry) => entry.world === "MAIN" && entry.js.length > 1)[0].js;

function stubControl() {
  const control = {
    addStyleClass: () => control,
    removeStyleClass: () => control,
    hasStyleClass: () => false,
    getId: () => "stub",
    getContent: () => [],
    getItems: () => [],
    getDomRef: () => null,
    attachBrowserEvent: () => control,
    setText: () => control,
    getText: () => "",
  };
  return control;
}

function sandbox() {
  const listeners = {};
  const element = {
    id: "stub",
    className: "",
    style: { setProperty() {} },
    classList: { toggle() {}, add() {}, remove() {} },
    children: [],
    firstChild: null,
    parentElement: null,
    setAttribute() {},
    getAttribute: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild: (node) => node,
    insertBefore: (node) => node,
    remove() {},
  };
  const win = {
    addEventListener: (type, fn) => ((listeners[type] = listeners[type] || []).push(fn)),
    removeEventListener() {},
    dispatchEvent: () => true,
    open() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    XMLHttpRequest: function () {},
    fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
    location: { hash: "", href: "" },
  };
  win.window = win;
  win.XMLHttpRequest.prototype = { open() {}, send() {}, setRequestHeader() {} };
  return {
    win,
    context: {
      window: win,
      document: {
        body: element,
        createElement: () => Object.assign({}, element),
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {},
        fonts: { ready: Promise.resolve() },
      },
      location: win.location,
      localStorage: win.localStorage,
      fetch: win.fetch,
      XMLHttpRequest: win.XMLHttpRequest,
      MutationObserver: function () {
        return { observe() {}, disconnect() {} };
      },
      requestAnimationFrame: () => 0,
      setTimeout: () => 0,
      clearTimeout() {},
      CustomEvent: function (type) {
        this.type = type;
      },
      URL: { createObjectURL: () => "blob:stub", revokeObjectURL() {} },
      console,
      sap: {
        ui: {
          require: () => undefined,
          getCore: () => ({ byId: () => null, attachThemeChanged() {}, applyTheme() {} }),
        },
      },
    },
  };
}

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else failures.push(name + "\n    expected " + e + "\n    actual   " + a);
}

const { win, context } = sandbox();
vm.createContext(context);

scripts.forEach((file) => {
  let error = "";
  try {
    vm.runInContext(fs.readFileSync(path.join(SRC, file), "utf8"), context, { filename: file });
  } catch (err) {
    error = err.message;
  }
  check(file + " loads without throwing", error, "");
});

const shared = win.__tssregShared || {};

check(
  "every script is registered in the manifest",
  fs.readdirSync(SRC).filter((f) => /\.js$/.test(f) && !scripts.includes(f)),
  ["soc-search-normalize.js", "timezone-fix.js"]
);
check("the shared namespaces are all attached", ["catalog", "coursesPage", "plans", "schedule", "scheduleExport"].filter((key) => !shared[key]), []);
check("the page helpers survive load", typeof shared.coursesPage.meetingLabel, "function");
check("the catalog reuses the shared service root", shared.serviceUrl("X").endsWith("/0001/X"), true);
check("the export renderer is ready", typeof shared.scheduleExport.download, "function");

console.log(passed + " passed, " + failures.length + " failed");
failures.forEach((line) => console.log("  FAIL " + line));
process.exit(failures.length ? 1 : 0);
