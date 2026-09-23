const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src");

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else failures.push(name + "\n    expected " + e + "\n    actual   " + a);
}

function control(id, props) {
  return Object.assign({ getId: () => id, destroyed: false }, props || {});
}

function harness() {
  const registry = {};
  const reloads = [];
  const location = { reload: () => reloads.push(1) };

  function register(id, instance) {
    registry[id] = instance;
    return instance;
  }

  function Text(id, props) {
    return register(id, control(id, { text: props.text }));
  }

  function Button(id, props) {
    return register(id, control(id, { text: props.text, type: props.type, press: props.press }));
  }

  const sap = {
    ui: {
      require: (names, cb) => cb(Text, Button),
      getCore: () => ({ byId: (id) => registry[id] || null }),
    },
  };

  function dialog(contentIds) {
    const state = {
      content: contentIds.map((id) => register(id, control(id))),
      buttons: [register("SAMLDialogClose", control("SAMLDialogClose", { text: "Close" }))],
      title: "Authentication Information",
      valueState: "None",
      width: "600px",
      height: "400px",
      classes: [],
    };
    return register(
      "SAMLDialog",
      control("SAMLDialog", {
        state,
        getContent: () => state.content,
        getButtons: () => state.buttons,
        destroyContent: () => {
          state.content.forEach((item) => {
            item.destroyed = true;
            delete registry[item.getId()];
          });
          state.content = [];
        },
        addContent: (item) => state.content.push(item),
        insertButton: (item, index) => state.buttons.splice(index, 0, item),
        setTitle: (value) => (state.title = value),
        setState: (value) => (state.valueState = value),
        setContentWidth: (value) => (state.width = value),
        setContentHeight: (value) => (state.height = value),
        addStyleClass: (name) => {
          if (!state.classes.includes(name)) state.classes.push(name);
        },
      })
    );
  }

  const callbacks = [];
  const win = {
    __tssregShared: {
      whenSapReady: (fn) => fn(),
      onUiUpdated: (fn) => callbacks.push(fn),
    },
  };
  const src = fs.readFileSync(path.join(SRC, "shell-session.js"), "utf8");
  const body = src.replace(/^\(\(\) => \{\r?\n/, "").replace(/\}\)\(\);\s*$/, "");
  new Function("window", "sap", "document", "location", body)(win, sap, null, location);

  return {
    registry,
    reloads,
    dialog,
    tick: () => callbacks.forEach((fn) => fn()),
  };
}

// ---------- a blocked re-auth dialog ----------
const blocked = harness();
const samlDialog = blocked.dialog(["SAMLDialogFrame"]);
const frame = blocked.registry.SAMLDialogFrame;
blocked.tick();

check("the frame the identity provider refuses to serve is destroyed", frame.destroyed, true);
check(
  "nothing is left in the dialog but the explanation",
  samlDialog.state.content.map((item) => item.getId()),
  ["tssreg-session-message"]
);
check(
  "the explanation says the session expired and a reload is needed",
  /session has expired[\s\S]*Reload the page/.test(blocked.registry["tssreg-session-message"].text),
  true
);
check("the vague native title is replaced", samlDialog.state.title, "Session Expired");
check("the dialog is marked as a warning", samlDialog.state.valueState, "Warning");
check(
  "the dialog no longer holds the size the frame needed",
  [samlDialog.state.width, samlDialog.state.height],
  [null, null]
);
check(
  "a reload button leads the dialog's own close button",
  samlDialog.state.buttons.map((item) => item.text),
  ["Reload", "Close"]
);
check(
  "the explanation is not flush against the dialog edge",
  samlDialog.state.classes,
  ["sapUiContentPadding"]
);

blocked.registry["tssreg-session-reload"].press();
check("pressing reload reloads the page", blocked.reloads.length, 1);

// ---------- repeated render cycles ----------
blocked.tick();
blocked.tick();
check(
  "later render cycles do not stack up reload buttons",
  samlDialog.state.buttons.map((item) => item.text),
  ["Reload", "Close"]
);
check(
  "later render cycles do not stack up explanations",
  samlDialog.state.content.map((item) => item.getId()),
  ["tssreg-session-message"]
);
check("later render cycles do not stack up padding", samlDialog.state.classes, ["sapUiContentPadding"]);

// ---------- a re-auth dialog that comes back ----------
const reopened = harness();
const first = reopened.dialog(["SAMLDialogFrame"]);
reopened.tick();
first.state.content = [reopened.registry.SAMLDialogFrame || { getId: () => "SAMLDialogFrame" }];
reopened.registry.SAMLDialogFrame = first.state.content[0];
reopened.tick();
check(
  "a dialog that reopens with its frame restored is patched again",
  first.state.content.map((item) => item.getId()),
  ["tssreg-session-message"]
);
check(
  "patching it again still leaves one reload button",
  first.state.buttons.map((item) => item.text),
  ["Reload", "Close"]
);

// ---------- a dialog with no blocked frame ----------
const other = harness();
const plain = other.dialog(["someOtherContent"]);
other.tick();
check(
  "the dialog is left untouched when no blocked frame is present",
  [plain.state.title, plain.state.content.map((item) => item.getId()).join(",")],
  ["Authentication Information", "someOtherContent"]
);

console.log(passed + " passed, " + failures.length + " failed");
failures.forEach((line) => console.log("  FAIL " + line));
process.exit(failures.length ? 1 : 0);
