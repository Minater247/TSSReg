(() => {
  const STORAGE_KEY = "tssreg-course-events";
  const CHANGE_EVENT = "tssreg:events-changed";
  const NAME_MAX = 20;
  const LOCATION_MAX = 20;
  const DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

  let state = [];

  function trimmed(value, limit) {
    return String(value == null ? "" : value).trim().slice(0, limit);
  }

  function pickDays(days) {
    const wanted = Array.isArray(days) ? days : [];
    return DAYS.filter((day) => wanted.indexOf(day) !== -1);
  }

  function minutesOf(value) {
    if (value == null || value === "") return null;
    const number = Math.round(Number(value));
    return isFinite(number) && number >= 0 && number < 1440 ? number : null;
  }

  function sanitize(record) {
    if (!record || !record.id) return null;
    const name = trimmed(record.name, NAME_MAX);
    const days = pickDays(record.days);
    const startMin = minutesOf(record.startMin);
    const endMin = minutesOf(record.endMin);
    if (!name || !days.length || startMin == null || endMin == null || endMin <= startMin) return null;
    return {
      id: String(record.id),
      planId: record.planId ? String(record.planId) : null,
      name,
      location: trimmed(record.location, LOCATION_MAX),
      days,
      startMin,
      endMin,
    };
  }

  function validate(draft) {
    const name = trimmed(draft && draft.name, NAME_MAX + 1);
    if (!name) return "Event name is required.";
    if (name.length > NAME_MAX) return "Event name cannot exceed " + NAME_MAX + " characters.";
    if (trimmed(draft && draft.location, LOCATION_MAX + 1).length > LOCATION_MAX) {
      return "Location cannot exceed " + LOCATION_MAX + " characters.";
    }
    if (!pickDays(draft && draft.days).length) return "Choose at least one day.";
    const startMin = minutesOf(draft && draft.startMin);
    const endMin = minutesOf(draft && draft.endMin);
    if (startMin == null || endMin == null) return "A start time and an end time are required.";
    if (endMin <= startMin) return "The start time must be before the end time.";
    return "";
  }

  function load() {
    let saved = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      saved = raw ? JSON.parse(raw) : null;
    } catch {
      saved = null;
    }
    if (!Array.isArray(saved)) return;
    state = saved.map(sanitize).filter(Boolean);
  }

  function persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      return;
    }
  }

  function announce() {
    persist();
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }

  function makeId() {
    return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function list() {
    return state;
  }

  function forPlan(planId) {
    const id = planId ? String(planId) : null;
    return state.filter((record) => !record.planId || record.planId === id);
  }

  function ownedBy(planId) {
    const id = planId ? String(planId) : null;
    return id ? state.filter((record) => record.planId === id) : [];
  }

  function removeOwnedBy(planId) {
    const owned = ownedBy(planId);
    if (!owned.length) return;
    state = state.filter((record) => owned.indexOf(record) === -1);
    announce();
  }

  function copyOwnedBy(fromPlanId, toPlanId) {
    const to = toPlanId ? String(toPlanId) : null;
    const owned = ownedBy(fromPlanId);
    if (!to || !owned.length) return;
    owned.forEach((record) => state.push(Object.assign({}, record, { id: makeId(), planId: to })));
    announce();
  }

  function add(draft) {
    const problem = validate(draft);
    if (problem) return problem;
    state.push(sanitize(Object.assign({ id: makeId() }, draft)));
    announce();
    return "";
  }

  function update(id, draft) {
    const problem = validate(draft);
    if (problem) return problem;
    const index = state.findIndex((record) => record.id === String(id));
    if (index === -1) return "That event is no longer on your schedule.";
    state[index] = sanitize(Object.assign({}, draft, { id: String(id) }));
    announce();
    return "";
  }

  function remove(id) {
    const before = state.length;
    state = state.filter((record) => record.id !== String(id));
    if (state.length !== before) announce();
  }

  function signature() {
    return JSON.stringify(state);
  }

  load();

  window.__tssregShared.events = {
    CHANGE_EVENT,
    DAYS,
    NAME_MAX,
    LOCATION_MAX,
    list,
    forPlan,
    ownedBy,
    add,
    update,
    remove,
    removeOwnedBy,
    copyOwnedBy,
    validate,
    signature,
  };
})();
