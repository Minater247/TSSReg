(() => {
  const { overviewNavigation } = window.__tssregShared;
  const TRIGGER = "#shellAppTitle.sapUshellAppTitleClickable";
  const MENU_ID = "tssreg-shell-navigation";
  let trigger;
  let menu;
  let groups;
  let groupsSignature;

  function element(tag, text) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  }

  function linkTo(item) {
    const link = element("a", item.text);
    link.href = item.url;
    if (item.newWindow) {
      link.target = "_blank";
      link.rel = "noopener";
    }
    return link;
  }

  function close(restoreFocus) {
    if (!menu) return;
    menu.remove();
    menu = null;
    trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) trigger.focus();
  }

  function groupElement({ label, items }) {
    const group = element("details");
    const summary = element("summary", label);
    const links = element("div");
    links.className = "tssreg-nav-links";
    items.forEach((item) => links.append(linkTo(item)));
    group.append(summary, links);
    group.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "mouse" && window.matchMedia("(min-width: 42rem)").matches) group.open = true;
    });
    group.addEventListener("toggle", () => {
      if (group.open) {
        Array.from(group.parentElement?.children || []).forEach((other) => {
          if (other !== group) other.open = false;
        });
      }
    });
    return group;
  }

  function renderGroups(container, groups) {
    const open = container.querySelector("details[open] summary")?.textContent;
    container.replaceChildren(...groups.map((group) => {
      const entry = groupElement(group);
      if (group.label === open) entry.open = true;
      return entry;
    }));
  }

  function refreshGroups(updated) {
    if (!menu || groups.contains(document.activeElement)) return;
    const signature = JSON.stringify(updated);
    if (groupsSignature === signature) return;
    renderGroups(groups, updated);
    groupsSignature = signature;
  }

  function open(title) {
    trigger = title.querySelector('button, [role="button"]') || title;
    const panel = element("nav");
    menu = panel;
    panel.id = MENU_ID;
    panel.setAttribute("aria-label", "Student navigation");
    const bounds = trigger.getBoundingClientRect();
    panel.style.setProperty("--tssreg-nav-left", bounds.left + "px");
    panel.style.setProperty("--tssreg-nav-top", bounds.bottom + 6 + "px");
    const home = linkTo({ text: "Home", url: "#YStudent-Overview" });
    groups = element("div");
    groupsSignature = null;
    groups.className = "tssreg-nav-groups";
    panel.append(home, groups);
    refreshGroups(overviewNavigation.shellGroups());
    panel.addEventListener("click", (event) => {
      if (event.target.closest("a")) close(true);
    });
    document.body.append(panel);
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-controls", MENU_ID);
    home.focus();

    overviewNavigation.loadShellGroups().then(refreshGroups);
  }

  function toggle(event, title) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (menu) close(true);
    else open(title);
  }

  document.addEventListener("click", (event) => {
    const title = event.target.closest?.(TRIGGER);
    if (title) toggle(event, title);
    else if (!menu?.contains(event.target)) close(false);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu) {
      event.preventDefault();
      event.stopImmediatePropagation();
      close(true);
      return;
    }
    const title = event.target.closest?.(TRIGGER);
    if (title && (event.key === "Enter" || event.key === " ") && !event.repeat) toggle(event, title);
  }, true);

  document.addEventListener("focusin", (event) => {
    if (menu && !menu.contains(event.target) && !trigger.contains(event.target)) close(false);
  });
  window.addEventListener("hashchange", () => close(false));
  window.addEventListener("resize", () => close(false));
  window.__tssregShared.onUiUpdated(() => {
    if (menu) refreshGroups(overviewNavigation.shellGroups());
  });
})();
