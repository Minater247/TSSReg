(() => {
  const MODULE_PATH_MARKER = "YUCSD_CON_MODULE?";
  const MODULE_URL =
    "/sap/opu/odata4/sap/yucsd_con_module_sb/srvd/sap/yucsd_con_module_servicedef/0001/YUCSD_CON_MODULE";
  const FULL_IDS_TOP = 5000;
  const tickCallbacks = [];
  const uiCallbacks = [];
  const moduleFilters = [];
  const OVERVIEW_LAYOUT = ".sapUshellEasyScanLayoutInner";
  let overviewPrimary = null;
  let dashboardObserver = null;
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
    params.set("$top", String(FULL_IDS_TOP));
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
      } catch (e) {
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

  function performRewrite(xhr, originalText, activeFilters) {
    const found = findModulePart(originalText);
    if (!found || !found.json.value.length) return Promise.resolve();
    const query = extractModuleQuery(xhr.__tssRequestBody);
    if (!query) return Promise.resolve();
    const { year, term } = extractYearTerm(query);
    if (!year || !term) return Promise.resolve();
    return fetchJson(buildFullQueryUrl(query)).then((data) => {
      const allRows = (data && data.value) || [];
      if (!allRows.length) return;
      const allIds = allRows.map((r) => r.ModuleID).filter(Boolean);
      return Promise.all(activeFilters.map((f) => f.matchingIds({ year, term, ids: allIds }))).then((sets) => {
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
        xhr.__tssOverrideText = found.segments.join(found.boundary);
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
    const responseTextDescriptor = findDescriptor(proto, "responseText");
    const responseDescriptor = findDescriptor(proto, "response");
    const onloadDescriptor = findDescriptor(proto, "onload");
    const onreadystatechangeDescriptor = findDescriptor(proto, "onreadystatechange");

    proto.open = function (method, url) {
      this.__tssUrl = url;
      this.__tssIntercept = false;
      return origOpen.apply(this, arguments);
    };

    proto.send = function (body) {
      const activeFilters = moduleFilters.filter((f) => f.isActive());
      if (activeFilters.length && this.__tssUrl && String(this.__tssUrl).includes("$batch") && body) {
        const text = String(body);
        if (text.indexOf(MODULE_PATH_MARKER) !== -1) {
          this.__tssIntercept = true;
          this.__tssRequestBody = text;
          this.__tssActiveFilters = activeFilters;
        }
      }
      return origSend.apply(this, arguments);
    };

    function guard(xhr, fn) {
      return function () {
        const self = this;
        const args = arguments;
        if (!xhr.__tssIntercept || xhr.readyState !== 4 || xhr.status === 0) {
          return fn.apply(self, args);
        }
        if (!xhr.__tssRewritePromise) {
          const originalText = responseTextDescriptor.get.call(xhr);
          xhr.__tssRewritePromise = performRewrite(xhr, originalText, xhr.__tssActiveFilters).catch(() => {});
        }
        xhr.__tssRewritePromise.then(() => fn.apply(self, args));
      };
    }

    proto.addEventListener = function (type, listener, options) {
      if ((type === "load" || type === "readystatechange") && typeof listener === "function") {
        return origAddEventListener.call(this, type, guard(this, listener), options);
      }
      return origAddEventListener.apply(this, arguments);
    };

    if (onloadDescriptor && onloadDescriptor.set) {
      Object.defineProperty(proto, "onload", {
        configurable: true,
        get() {
          return this.__tssOnload;
        },
        set(fn) {
          this.__tssOnload = fn;
          onloadDescriptor.set.call(this, typeof fn === "function" ? guard(this, fn) : fn);
        },
      });
    }

    if (onreadystatechangeDescriptor && onreadystatechangeDescriptor.set) {
      Object.defineProperty(proto, "onreadystatechange", {
        configurable: true,
        get() {
          return this.__tssOnreadystatechange;
        },
        set(fn) {
          this.__tssOnreadystatechange = fn;
          onreadystatechangeDescriptor.set.call(this, typeof fn === "function" ? guard(this, fn) : fn);
        },
      });
    }

    if (responseTextDescriptor && responseTextDescriptor.get) {
      Object.defineProperty(proto, "responseText", {
        configurable: true,
        get() {
          if (this.__tssIntercept && this.__tssOverrideText != null) return this.__tssOverrideText;
          return responseTextDescriptor.get.call(this);
        },
      });
    }

    if (responseDescriptor && responseDescriptor.get) {
      Object.defineProperty(proto, "response", {
        configurable: true,
        get() {
          if (this.__tssIntercept && this.__tssOverrideText != null) return this.__tssOverrideText;
          return responseDescriptor.get.call(this);
        },
      });
    }
  }

  function check() {
    uiCallbacks.forEach((fn) => fn());
    if (!/^#YSchedule-view(?:[?&]|$)/.test(location.hash || "")) return;
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
    if (/^#YStudent-Overview(?:[?&]|$)/.test(location.hash || "")) {
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
    filterBarElement,
    onScheduleTick,
    onUiUpdated,
    registerModuleFilter,
    setOverviewPrimary,
    overviewPrimaryLinks,
    chunk,
    fetchJson,
  };

  patchNetwork();
  sap.ui.require(["sap/ui/core/Rendering"], (Rendering) => {
    Rendering.attachUIUpdated(check);
    window.addEventListener("hashchange", () => {
      syncDashboardObserver();
      check();
    });
    syncDashboardObserver();
    check();
  });
})();
