const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class XHR extends EventTarget {
  open() { this.readyState = 1; }
  send() {}
  get responseText() { return this.body; }
  get response() { return this.body; }
  finish(body) {
    this.body = body;
    this.readyState = 4;
    this.status = 200;
    this.dispatchEvent(new Event("readystatechange"));
    this.dispatchEvent(new Event("load"));
    this.loadHandler?.(new Event("load"));
  }
  get onload() { return this.loadHandler || null; }
  set onload(handler) { this.loadHandler = handler; }
}

const sap = { ui: { require() {} } };
const window = { sap };
const fetches = [];
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/soc-shared.js"), "utf8"), {
  window, sap, XMLHttpRequest: XHR, URLSearchParams,
  fetch: () => new Promise((resolve) => fetches.push(() => resolve({
    ok: true,
    json: () => ({ value: [{ ModuleID: "1", CourseAbbr: "CSE-101" }, { ModuleID: "2", CourseAbbr: "CSE-102" }] }),
  }))),
});

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function run() {
  const plain = new XHR();
  let calls = 0;
  function listener(event) {
    assert.equal(this, plain);
    assert.equal(event.type, "load");
    calls++;
  }
  plain.addEventListener("load", listener);
  plain.addEventListener("load", listener);
  plain.finish("plain");
  assert.equal(calls, 1);
  plain.removeEventListener("load", listener);
  plain.finish("plain");
  assert.equal(calls, 1);

  plain.addEventListener("load", listener, true);
  plain.addEventListener("load", listener, { capture: false, once: true });
  plain.removeEventListener("load", listener, { capture: true });
  plain.finish("plain");
  plain.finish("plain");
  assert.equal(calls, 2);
  plain.addEventListener("load", listener, { once: true });
  plain.finish("plain");
  assert.equal(calls, 3);

  const controller = new AbortController();
  plain.addEventListener("load", listener, { signal: controller.signal });
  controller.abort();
  plain.addEventListener("load", listener, { once: true });
  plain.finish("plain");
  assert.equal(calls, 4);

  window.__tssregShared.registerModuleFilter({ isActive: () => true, matchingIds: () => new Set(["2"]) });
  const body = "--response\r\nHTTP/1.1 200 OK\r\n\r\n" +
    '{"value":[{"ModuleID":"1","CourseAbbr":"CSE-101"}]}\r\n--response--';
  const query = "GET YUCSD_CON_MODULE?$filter=" + encodeURIComponent("AcademicYear eq '2026' and AcademicPeriod eq '02'");
  const xhr = new XHR();
  const results = [];
  const removed = () => assert.fail("removed listener received a deferred event");
  const replaced = () => assert.fail("replaced handler received a deferred event");
  xhr.addEventListener("load", removed);
  xhr.onload = replaced;
  assert.equal(xhr.onload, replaced);
  xhr.addEventListener("readystatechange", () => results.push(xhr.responseText), { once: true });
  xhr.open("POST", "/service/$batch");
  xhr.send(query);
  xhr.finish(body);
  xhr.removeEventListener("load", removed);
  xhr.onload = null;
  assert.equal(xhr.onload, null);
  await nextTurn();
  assert.equal(fetches.length, 1);
  fetches.shift()();
  await nextTurn();
  assert.equal(results.length, 1);
  assert.match(results[0], /CSE-102/);
  assert.equal(xhr.response, results[0]);

  xhr.open("POST", "/service/$batch");
  xhr.send(query);
  xhr.addEventListener("load", () => results.push(xhr.responseText));
  let onceCalls = 0;
  const once = () => onceCalls++;
  xhr.addEventListener("load", once, { once: true });
  xhr.finish(body);
  await nextTurn();
  assert.equal(fetches.length, 1);
  xhr.open("GET", "/other");
  xhr.addEventListener("load", once, { once: true });
  xhr.finish("next request");
  fetches.shift()();
  await nextTurn();
  assert.equal(results.length, 2);
  assert.equal(results[1], "next request");
  assert.equal(onceCalls, 1);
  assert.equal(xhr.responseText, "next request");
  console.log("XHR listener and request lifecycle checks passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
