const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../src/personal-details-navigation.js"), "utf8");
const navClass = "tssreg-section-navigation";

class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.listeners = {};
  }

  append(...nodes) {
    for (const node of nodes) {
      node.remove();
      this.children.push(node);
      node.parent = this;
    }
  }

  remove() {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }

  before(node) {
    node.remove();
    const siblings = this.parent.children;
    siblings.splice(siblings.indexOf(this), 0, node);
    node.parent = this.parent;
  }

  get previousElementSibling() {
    const siblings = this.parent.children;
    return siblings[siblings.indexOf(this) - 1] || null;
  }

  querySelectorAll(selector) {
    assert.equal(selector, "nav." + navClass);
    const matches = this.tag === "nav" && this.className === navClass ? [this] : [];
    return matches.concat(this.children.flatMap((child) => child.querySelectorAll(selector)));
  }

  setAttribute() {}
  addEventListener(name, callback) { this.listeners[name] = callback; }
  getBoundingClientRect() { return { height: 31.5 }; }
}

let apply;
let focused = false;
const page = new Element("div");
let content = new Element("div");
page.querySelector = () => content;
const heading = { setAttribute() {}, focus: () => { focused = true; } };
let sections = [{
  getId: () => "addresses",
  getTitle: () => "Addresses",
  getVisible: () => true,
  getDomRef: () => ({ querySelector: () => heading }),
}];
const jumps = [];
const layout = {
  getSections: () => sections,
  scrollToSection: (...args) => { jumps.push(args); },
  getToggleHeaderOnTitleClick: () => false,
  getHeaderContentPinnable: () => false,
  getShowAnchorBar: () => false,
};
vm.runInNewContext(source, {
  window: { __tssregShared: { onUiUpdated: (callback) => { apply = callback; } } },
  document: { querySelector: () => page, createElement: (tag) => new Element(tag) },
  location: { hash: "#YStudent-myPersonalDetails" },
  sap: { ui: { getCore: () => ({ byId: () => layout }) } },
});

const scroll = new Element("div");
page.append(scroll);
scroll.append(content);
apply();
const bar = content.previousElementSibling;
const bars = () => page.querySelectorAll("nav." + navClass);
assert.deepEqual(bars(), [bar]);

content.before(new Element("div"));
apply();
assert.equal(bars().length, 1, "inserting a sibling does not leave two bars");
assert.equal(content.previousElementSibling, bar, "move the existing bar when SAP inserts a sibling");

const duplicate = new Element("nav");
duplicate.className = navClass;
page.append(duplicate);
scroll.remove();
content = new Element("div");
const replacementScroll = new Element("div");
page.append(replacementScroll);
replacementScroll.append(content);
apply();
assert.equal(content.previousElementSibling, bar, "reuse the bar after a scroll container replacement");
assert.deepEqual(bars(), [bar], "remove stray copies elsewhere in the page");

sections = [{ ...sections[0], getTitle: () => "Related Persons" }];
apply();
const refreshedBar = content.previousElementSibling;
assert.notEqual(refreshedBar, bar, "rebuild when the sections change");
assert.deepEqual(bars(), [refreshedBar]);
const [, links, select] = refreshedBar.children;
assert.equal(links.children[0].textContent, "Related Persons");
links.children[0].listeners.click({ preventDefault() {} });
select.value = "addresses";
select.listeners.change();
assert.equal(select.value, "");
assert.equal(focused, true);
assert.deepEqual(jumps, [["addresses", 0, -32], ["addresses", 0, -32]]);

console.log("Personal Details navigation rerender checks passed");
