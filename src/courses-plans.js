(() => {
  const STORAGE_KEY = "tssreg-course-plans";
  const CHANGE_EVENT = "tssreg:plans-changed";

  let state = { currentPlanId: null, list: [] };

  function sanitizeMeeting(meeting) {
    if (!meeting || typeof meeting.startMin !== "number" || typeof meeting.endMin !== "number") return null;
    if (!meeting.day || meeting.endMin <= meeting.startMin) return null;
    return { day: meeting.day, startMin: meeting.startMin, endMin: meeting.endMin };
  }

  function sanitizeComponent(component) {
    if (!component) return null;
    const meetings = (component.meetings || []).map(sanitizeMeeting).filter(Boolean);
    return {
      abbr: String(component.abbr || ""),
      type: String(component.type || ""),
      instructor: String(component.instructor || ""),
      location: String(component.location || ""),
      meetings,
    };
  }

  function sanitizeSection(section) {
    if (!section || !section.moduleId || !section.pkgId) return null;
    const components = (section.components || []).map(sanitizeComponent).filter(Boolean);
    return {
      moduleId: String(section.moduleId),
      pkgId: String(section.pkgId),
      year: section.year ? String(section.year) : "",
      term: section.term ? String(section.term) : "",
      courseCode: String(section.courseCode || ""),
      title: String(section.title || ""),
      credits: section.credits == null ? "" : String(section.credits),
      components,
    };
  }

  function sanitizePlan(plan) {
    if (!plan || !plan.id) return null;
    return {
      id: String(plan.id),
      name: String(plan.name || "Schedule"),
      sections: (plan.sections || []).map(sanitizeSection).filter(Boolean),
    };
  }

  function load() {
    let saved = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      saved = raw ? JSON.parse(raw) : null;
    } catch (e) {
      saved = null;
    }
    if (!saved || !Array.isArray(saved.list)) return;
    const list = saved.list.map(sanitizePlan).filter(Boolean);
    const currentPlanId = list.some((plan) => plan.id === saved.currentPlanId)
      ? saved.currentPlanId
      : (list[0] && list[0].id) || null;
    state = { currentPlanId, list };
  }

  function persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      return;
    }
  }

  function announce() {
    persist();
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }

  function makeId() {
    return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function list() {
    return state.list;
  }

  function current() {
    if (!state.list.length) return null;
    return state.list.filter((plan) => plan.id === state.currentPlanId)[0] || state.list[0];
  }

  function defaultName() {
    return "Schedule " + (state.list.length + 1);
  }

  function select(id) {
    if (state.currentPlanId === id) return;
    state.currentPlanId = id;
    announce();
  }

  function create(name) {
    const plan = { id: makeId(), name: String(name || defaultName()), sections: [] };
    state.list.push(plan);
    state.currentPlanId = plan.id;
    announce();
    return plan;
  }

  function duplicate(plan, name) {
    if (!plan) return null;
    const copy = {
      id: makeId(),
      name: String(name || plan.name + " copy"),
      sections: JSON.parse(JSON.stringify(plan.sections)),
    };
    state.list.push(copy);
    state.currentPlanId = copy.id;
    announce();
    return copy;
  }

  function rename(plan, name) {
    if (!plan || !name || plan.name === name) return;
    plan.name = String(name);
    announce();
  }

  function remove(plan) {
    if (!plan) return;
    state.list = state.list.filter((entry) => entry.id !== plan.id);
    state.currentPlanId = (state.list[0] || {}).id || null;
    announce();
  }

  function sameSection(section, moduleId, pkgId) {
    return section.moduleId === String(moduleId) && section.pkgId === String(pkgId);
  }

  function hasSection(moduleId, pkgId) {
    const plan = current();
    return !!(plan && plan.sections.some((section) => sameSection(section, moduleId, pkgId)));
  }

  function addSection(rawSection) {
    const section = sanitizeSection(rawSection);
    if (!section) return null;
    let plan = current();
    if (!plan) plan = create(defaultName());
    if (plan.sections.some((entry) => sameSection(entry, section.moduleId, section.pkgId))) return plan;
    plan.sections.push(section);
    announce();
    return plan;
  }

  function removeSection(moduleId, pkgId) {
    const plan = current();
    if (!plan) return;
    const before = plan.sections.length;
    plan.sections = plan.sections.filter((section) => !sameSection(section, moduleId, pkgId));
    if (plan.sections.length !== before) announce();
  }

  function toggleSection(section) {
    if (section && hasSection(section.moduleId, section.pkgId)) {
      removeSection(section.moduleId, section.pkgId);
      return false;
    }
    addSection(section);
    return true;
  }

  function signature() {
    return JSON.stringify([state.currentPlanId, state.list.map((plan) => [plan.id, plan.name, plan.sections])]);
  }

  load();

  window.__tssregShared.plans = {
    CHANGE_EVENT,
    list,
    current,
    select,
    create,
    duplicate,
    rename,
    remove,
    hasSection,
    addSection,
    removeSection,
    toggleSection,
    defaultName,
    signature,
  };
})();
