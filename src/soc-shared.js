(() => {
  const MODULE_PATH_MARKER = "YUCSD_CON_MODULE?";
  const SERVICE_ROOT =
    "/sap/opu/odata4/sap/yucsd_con_module_sb/srvd/sap/yucsd_con_module_servicedef/0001/";
  const MODULE_URL = SERVICE_ROOT + "YUCSD_CON_MODULE";
  const CLIENT = "sap-client=500";
  const ROW_LIMIT = 5000;
  const ID_CHUNK_SIZE = 40;
  const OVERVIEW_ROUTE = /^#YStudent-Overview(?:[?&]|$)/;
  const SCHEDULE_ROUTE = /^#YSchedule-view(?:[?&]|$)/;
  const tickCallbacks = [];
  const uiCallbacks = [];
  const moduleFilters = [];
  const OVERVIEW_LAYOUT = ".sapUshellEasyScanLayoutInner";
  let overviewPrimary = null;
  let dashboardObserver = null;
  const sapWaiters = [];
  let sapObserver = null;
  let lastInner = null;
  let lastInnerCount = -1;
  let framePending = false;

  function filterBarElement() {
    return document.querySelector(".sapUiMdcFilterBarBase");
  }

  function onScheduleTick(fn) {
    tickCallbacks.push(fn);
  }

  function onUiUpdated(fn) {
    uiCallbacks.push(fn);
  }

  function setOverviewPrimary(links) {
    overviewPrimary = links;
  }

  function overviewPrimaryLinks() {
    return overviewPrimary;
  }

  function registerModuleFilter(filter) {
    moduleFilters.push(filter);
  }

  function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  function fetchJson(url) {
    return fetch(url, { headers: { Accept: "application/json" } }).then((r) => (r.ok ? r.json() : null));
  }

  function sapReady() {
    return !!(window.sap && window.sap.ui && typeof window.sap.ui.require === "function");
  }

  function flushSapWaiters() {
    if (!sapReady()) return;
    if (sapObserver) {
      sapObserver.disconnect();
      sapObserver = null;
    }
    window.removeEventListener("load", flushSapWaiters);
    sapWaiters.splice(0, sapWaiters.length).forEach((fn) => fn());
  }

  function whenSapReady(fn) {
    if (sapReady()) return void fn();
    sapWaiters.push(fn);
    if (sapObserver) return;
    const bootstrap = document.querySelector("#sap-ui-bootstrap, script[src*='sap-ui-core']");
    if (bootstrap) bootstrap.addEventListener("load", flushSapWaiters, { once: true });
    window.addEventListener("load", flushSapWaiters);
    sapObserver = new MutationObserver(flushSapWaiters);
    sapObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function serviceUrl(path) {
    return SERVICE_ROOT + path;
  }

  function odataLiteral(value) {
    return "'" + String(value).replace(/'/g, "''") + "'";
  }

  function moduleRows(entity, ids, select, filterFor) {
    if (!ids.length) return Promise.resolve([]);
    const urls = chunk(ids, ID_CHUNK_SIZE).map((part) => {
      const idClause = part.map((id) => "ModuleID eq '" + id + "'").join(" or ");
      return (
        serviceUrl(entity) +
        "?" + CLIENT +
        "&$top=" + ROW_LIMIT +
        "&$select=" + select +
        "&$filter=" + encodeURIComponent(filterFor(idClause))
      );
    });
    return Promise.all(urls.map(fetchJson)).then((results) => {
      const rows = [];
      results.forEach((data) => ((data && data.value) || []).forEach((row) => rows.push(row)));
      return rows;
    });
  }

  function moduleIdSet(entity, ids, filterFor) {
    return moduleRows(entity, ids, "ModuleID", filterFor).then((rows) => {
      const matched = new Set();
      rows.forEach((row) => matched.add(row.ModuleID));
      return matched;
    });
  }

  function nativeButton(className, variant, text) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    const inner = document.createElement("span");
    inner.className = "sapMBtnInner sapMBtnHoverable sapMFocusable sapMBtnText " + variant;
    const content = document.createElement("span");
    content.className = "sapMBtnContent";
    const bdi = document.createElement("bdi");
    bdi.textContent = text;
    content.appendChild(bdi);
    inner.appendChild(content);
    button.appendChild(inner);
    return button;
  }

  function filterFieldItem(id, labelText) {
    const item = document.createElement("div");
    item.id = id;
    const layout = document.createElement("div");
    layout.className = "sapUiVlt sapuiVlt";

    const labelCell = document.createElement("div");
    labelCell.className = "sapUiVltCell sapuiVltCell";
    const label = document.createElement("label");
    label.className = "sapMLabel sapUiSelectable sapMLabelMaxWidth sapUiMdcFilterBarBaseLabel";
    label.style.textAlign = "left";
    const labelInner = document.createElement("div");
    labelInner.className = "sapMLabelInner";
    labelInner.style.justifyContent = "flex-start";
    const wrapper = document.createElement("span");
    wrapper.className = "sapMLabelTextWrapper";
    const bdi = document.createElement("bdi");
    bdi.textContent = labelText;
    wrapper.appendChild(bdi);
    const colon = document.createElement("span");
    colon.className = "sapMLabelColonAndRequired";
    colon.setAttribute("data-colon", ":");
    colon.setAttribute("aria-hidden", "true");
    labelInner.appendChild(wrapper);
    labelInner.appendChild(colon);
    label.appendChild(labelInner);
    labelCell.appendChild(label);

    const cell = document.createElement("div");
    cell.className = "sapUiVltCell sapuiVltCell";

    layout.appendChild(labelCell);
    layout.appendChild(cell);
    item.appendChild(layout);
    return { item, cell };
  }

  function isOverviewRoute() {
    return OVERVIEW_ROUTE.test(location.hash || "");
  }

  function cardElement(card) {
    return document.querySelector('[id*="--' + card + 'Original"]');
  }

  function navigate(link) {
    if (!link || !link.url) return;
    if (link.url.charAt(0) === "#") {
      location.hash = link.url;
      return;
    }
    if (link.newWindow) {
      window.open(link.url, "_blank", "noopener");
      return;
    }
    location.href = link.url;
  }

  function extractModuleQuery(requestBody) {
    const idx = requestBody.indexOf(MODULE_PATH_MARKER);
    if (idx === -1) return null;
    const after = requestBody.slice(idx + MODULE_PATH_MARKER.length);
    const end = after.search(/\sHTTP\/|\r|\n/);
    return end === -1 ? after : after.slice(0, end);
  }

  function extractYearTerm(query) {
    const decoded = decodeURIComponent(query);
    const yearMatch = /AcademicYear eq '([^']+)'/.exec(decoded);
    const termMatch = /AcademicPeriod eq '([^']+)'/.exec(decoded);
    const year = yearMatch ? yearMatch[1] : null;
    const termRaw = termMatch ? termMatch[1] : null;
    const term = termRaw ? String(parseInt(termRaw, 10)) : null;
    return { year, term };
  }

  function buildFullQueryUrl(query) {
    const params = new URLSearchParams(query);
    params.set("$top", String(ROW_LIMIT));
    params.delete("$skip");
    return MODULE_URL + "?" + params.toString();
  }

  function isModuleJson(json) {
    if (!json || !Array.isArray(json.value)) return false;
    const ctx = json["@odata.context"];
    if (typeof ctx === "string" && /#YUCSD_CON_MODULE(?:[(/]|$)/.test(ctx)) return true;
    const first = json.value[0];
    return !!(
      first &&
      Object.prototype.hasOwnProperty.call(first, "ModuleID") &&
      Object.prototype.hasOwnProperty.call(first, "CourseAbbr")
    );
  }

  function findModulePart(rawText) {
    const boundaryMatch = rawText.match(/^--(\S+)/);
    if (!boundaryMatch) return null;
    const boundary = "--" + boundaryMatch[1];
    const segments = rawText.split(boundary);
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const httpIdx = seg.indexOf("HTTP/1.1");
      if (httpIdx === -1) continue;
      const afterStatus = seg.slice(httpIdx);
      const blankMatch = afterStatus.match(/\r?\n\r?\n/);
      if (!blankMatch) continue;
      const bodyStart = httpIdx + afterStatus.indexOf(blankMatch[0]) + blankMatch[0].length;
      const bodyRaw = seg.slice(bodyStart);
      const trimmed = bodyRaw.replace(/[\r\n]+$/, "");
      if (!trimmed) continue;
      let json;
      try {
        json = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (!isModuleJson(json)) continue;
      return { segments, segIndex: i, boundary, bodyStart, trimmedBodyLength: trimmed.length, json };
    }
    return null;
  }

  function updateContentLength(headerBlock, newBody) {
    if (!/Content-Length:/i.test(headerBlock)) return headerBlock;
    const byteLength = new Blob([newBody]).size;
    return headerBlock.replace(/Content-Length:\s*\d+/i, "Content-Length: " + byteLength);
  }

  function performRewrite(request, originalText) {
    const found = findModulePart(originalText);
    if (!found || !found.json.value.length) return Promise.resolve();
    const query = extractModuleQuery(request.body);
    if (!query) return Promise.resolve();
    const { year, term } = extractYearTerm(query);
    if (!year || !term) return Promise.resolve();
    return fetchJson(buildFullQueryUrl(query)).then((data) => {
      const allRows = (data && data.value) || [];
      if (!allRows.length) return;
      const allIds = allRows.map((r) => r.ModuleID).filter(Boolean);
      return Promise.all(request.filters.map((f) => f.matchingIds({ year, term, ids: allIds }))).then((sets) => {
        const filteredValue = allRows.filter((row) => sets.every((set) => set.has(row.ModuleID)));
        const newJson = Object.assign({}, found.json, { value: filteredValue });
        if (Object.prototype.hasOwnProperty.call(newJson, "@odata.count")) {
          newJson["@odata.count"] = filteredValue.length;
        }
        const newBodyText = JSON.stringify(newJson);
        const seg = found.segments[found.segIndex];
        const before = updateContentLength(seg.slice(0, found.bodyStart), newBodyText);
        const after = seg.slice(found.bodyStart + found.trimmedBodyLength);
        found.segments[found.segIndex] = before + newBodyText + after;
        request.overrideText = found.segments.join(found.boundary);
      });
    });
  }

  function findDescriptor(startProto, prop) {
    let p = startProto;
    while (p) {
      const d = Object.getOwnPropertyDescriptor(p, prop);
      if (d) return d;
      p = Object.getPrototypeOf(p);
    }
    return null;
  }

  function patchNetwork() {
    if (window.__tssregNetPatched) return;
    window.__tssregNetPatched = true;

    const proto = XMLHttpRequest.prototype;
    const origOpen = proto.open;
    const origSend = proto.send;
    const origAddEventListener = proto.addEventListener;
    const origRemoveEventListener = proto.removeEventListener;
    const requests = new WeakMap();
    const listeners = new WeakMap();
    const responseTextDescriptor = findDescriptor(proto, "responseText");
    const responseDescriptor = findDescriptor(proto, "response");
    const onloadDescriptor = findDescriptor(proto, "onload");
    const onreadystatechangeDescriptor = findDescriptor(proto, "onreadystatechange");

    proto.open = function (method, url) {
      requests.set(this, { url });
      return origOpen.apply(this, arguments);
    };

    proto.send = function (body) {
      const request = requests.get(this);
      const activeFilters = moduleFilters.filter((f) => f.isActive());
      if (activeFilters.length && request && String(request.url).includes("$batch") && body) {
        const text = String(body);
        if (text.indexOf(MODULE_PATH_MARKER) !== -1) {
          request.body = text;
          request.filters = activeFilters;
        }
      }
      return origSend.apply(this, arguments);
    };

    function afterRewrite(xhr, invoke) {
      const request = requests.get(xhr);
      if (!request?.filters || xhr.readyState !== 4 || xhr.status === 0) return invoke(true);
      if (!request.rewrite) {
        request.rewrite = Promise.resolve()
          .then(() => {
            if (requests.get(xhr) === request) return performRewrite(request, responseTextDescriptor.get.call(xhr));
          })
          .catch(() => {});
      }
      request.rewrite.then(() => invoke(requests.get(xhr) === request));
    }

    function captureOf(options) {
      return typeof options === "boolean" ? options : Boolean(options?.capture);
    }

    function listenerGroup(xhr, type, capture) {
      let groups = listeners.get(xhr);
      if (!groups) listeners.set(xhr, (groups = new Map()));
      const key = type + "|" + capture;
      if (!groups.has(key)) groups.set(key, new WeakMap());
      return groups.get(key);
    }

    function wrapsListener(type, listener) {
      return (type === "load" || type === "readystatechange") && typeof listener === "function";
    }

    proto.addEventListener = function (type, listener, options) {
      if (!wrapsListener(type, listener)) return origAddEventListener.apply(this, arguments);
      const capture = captureOf(options);
      const group = listenerGroup(this, type, capture);
      const existing = group.get(listener);
      if (existing && !existing.signal?.aborted &&
          (!existing.onceRequest || existing.onceRequest === requests.get(this))) return;

      const once = Boolean(options?.once);
      const signal = options?.signal;
      if (signal?.aborted) return;

      // Keep the original callback's identity for duplicate registration and removal.
      const registration = {
        signal,
        wrapped: (event) => {
          if (once) registration.onceRequest = requests.get(this);
          afterRewrite(this, (current) => {
            if (group.get(listener) !== registration || signal?.aborted) return;
            if (once) group.delete(listener);
            if (current) listener.call(this, event);
          });
        },
      };
      origAddEventListener.call(this, type, registration.wrapped, { capture, once, passive: options?.passive, signal });
      group.set(listener, registration);
    };

    proto.removeEventListener = function (type, listener, options) {
      if (!wrapsListener(type, listener)) return origRemoveEventListener.apply(this, arguments);
      const capture = captureOf(options);
      const group = listenerGroup(this, type, capture);
      const registration = group.get(listener);
      group.delete(listener);
      return origRemoveEventListener.call(this, type, registration?.wrapped || listener, capture);
    };

    function patchHandler(property, descriptor) {
      if (!descriptor?.set) return;
      const handlers = new WeakMap();
      Object.defineProperty(proto, property, {
        configurable: true,
        get() {
          return handlers.has(this) ? handlers.get(this).callback : descriptor.get.call(this);
        },
        set(fn) {
          const handler = { callback: typeof fn === "function" ? fn : null };
          handlers.set(this, handler);
          descriptor.set.call(this, handler.callback && ((event) => afterRewrite(this, (current) => {
            if (current && handlers.get(this) === handler) fn.call(this, event);
          })));
        },
      });
    }

    patchHandler("onload", onloadDescriptor);
    patchHandler("onreadystatechange", onreadystatechangeDescriptor);

    if (responseTextDescriptor && responseTextDescriptor.get) {
      Object.defineProperty(proto, "responseText", {
        configurable: true,
        get() {
          return requests.get(this)?.overrideText ?? responseTextDescriptor.get.call(this);
        },
      });
    }

    if (responseDescriptor && responseDescriptor.get) {
      Object.defineProperty(proto, "response", {
        configurable: true,
        get() {
          return requests.get(this)?.overrideText ?? responseDescriptor.get.call(this);
        },
      });
    }
  }

  function check() {
    uiCallbacks.forEach((fn) => fn());
    if (!SCHEDULE_ROUTE.test(location.hash || "")) return;
    const bar = filterBarElement();
    if (!bar) return;
    tickCallbacks.forEach((fn) => fn(bar));
  }

  function onDashboardMutated() {
    const inner = document.querySelector(OVERVIEW_LAYOUT);
    if (!inner) return;
    const count = inner.children.length;
    if (inner === lastInner && count === lastInnerCount) return;
    lastInner = inner;
    lastInnerCount = count;
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(() => {
      framePending = false;
      check();
    });
  }

  function syncDashboardObserver() {
    if (isOverviewRoute()) {
      if (dashboardObserver) return;
      dashboardObserver = new MutationObserver(onDashboardMutated);
      dashboardObserver.observe(document.body, { childList: true, subtree: true });
      return;
    }
    if (!dashboardObserver) return;
    dashboardObserver.disconnect();
    dashboardObserver = null;
    lastInner = null;
    lastInnerCount = -1;
  }

  window.__tssregShared = {
    whenSapReady,
    onScheduleTick,
    onUiUpdated,
    registerModuleFilter,
    setOverviewPrimary,
    overviewPrimaryLinks,
    nativeButton,
    filterFieldItem,
    isOverviewRoute,
    cardElement,
    navigate,
    chunk,
    fetchJson,
    serviceUrl,
    odataLiteral,
    moduleRows,
    moduleIdSet,
    CLIENT,
    ROW_LIMIT,
    ID_CHUNK_SIZE,
  };

  patchNetwork();
  whenSapReady(() => {
    sap.ui.require(["sap/ui/core/Rendering"], (Rendering) => {
      Rendering.attachUIUpdated(check);
      window.addEventListener("hashchange", () => {
        syncDashboardObserver();
        check();
      });
      syncDashboardObserver();
      check();
    });
  });
})();
