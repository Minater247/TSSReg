(() => {
  const DAYS = [
    ["1", "Monday", "M"],
    ["2", "Tuesday", "Tu"],
    ["3", "Wednesday", "W"],
    ["4", "Thursday", "Th"],
    ["5", "Friday", "F"],
    ["6", "Saturday", "Sa"],
    ["7", "Sunday", "Su"],
  ];
  const SCHED_URL =
    "/sap/opu/odata4/sap/yucsd_con_module_sb/srvd/sap/yucsd_con_module_servicedef/0001/YUCSD_CON_MODULE_SCHED";
  const MODULE_PATH_MARKER = "YUCSD_CON_MODULE?";
  const ID_CHUNK_SIZE = 40;

  let selectedDays = new Set();

  function dowField(bar) {
    const el = bar.querySelector('[id$="::FilterField::DoW"]');
    return el ? sap.ui.getCore().byId(el.id) : null;
  }

  function applyButtonState(bar) {
    const signature = [...selectedDays].sort().join(",");
    if (bar.__tssDowSignature === signature) return;
    bar.__tssDowSignature = signature;
    bar.querySelectorAll(".tssreg-dow-btn").forEach((btn) => {
      const inner = btn.querySelector(".sapMBtnInner");
      const isSelected = selectedDays.has(btn.dataset.day);
      inner.classList.toggle("sapMBtnEmphasized", isSelected);
      inner.classList.toggle("sapMBtnTransparent", !isSelected);
      btn.setAttribute("aria-pressed", String(isSelected));
    });
  }

  function toggleDay(bar, code) {
    if (selectedDays.has(code)) selectedDays.delete(code);
    else selectedDays.add(code);
    applyButtonState(bar);
  }

  function ensureButtons(bar) {
    const labelEl = bar.querySelector('[id$="::FilterField::DoW-label"]');
    if (!labelEl) return;
    const cell = labelEl.closest(".sapUiAFLayoutItem");
    if (!cell) return;
    if (cell.querySelector(".tssreg-dow-row")) {
      applyButtonState(bar);
      return;
    }

    const field = dowField(bar);
    if (field && field.getConditions().length) field.setConditions([]);

    const row = document.createElement("div");
    row.className = "tssreg-dow-row";
    DAYS.forEach(([code, label, short]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sapMBtnBase sapMBtn tssreg-dow-btn";
      button.dataset.day = code;
      button.title = label;
      button.innerHTML =
        '<span class="sapMBtnInner sapMBtnHoverable sapMFocusable sapMBtnText sapMBtnTransparent">' +
        '<span class="sapMBtnContent"><bdi>' + short + "</bdi></span></span>";
      button.addEventListener("click", () => toggleDay(bar, code));
      row.appendChild(button);
    });
    cell.appendChild(row);
    applyButtonState(bar);
  }

  function fetchJson(url) {
    return fetch(url, { headers: { Accept: "application/json" } }).then((r) => (r.ok ? r.json() : null));
  }

  function extractYearTerm(requestBody) {
    const idx = requestBody.indexOf(MODULE_PATH_MARKER);
    if (idx === -1) return {};
    const after = requestBody.slice(idx + MODULE_PATH_MARKER.length);
    const end = after.search(/\sHTTP\/|\r|\n/);
    const query = end === -1 ? after : after.slice(0, end);
    const decoded = decodeURIComponent(query);
    const yearMatch = /AcademicYear eq '([^']+)'/.exec(decoded);
    const termMatch = /AcademicPeriod eq '([^']+)'/.exec(decoded);
    const year = yearMatch ? yearMatch[1] : null;
    const termRaw = termMatch ? termMatch[1] : null;
    const term = termRaw ? String(parseInt(termRaw, 10)) : null;
    return { year, term };
  }

  function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  function matchingModuleIds(year, term, ids) {
    if (!year || !term || !ids.length) return Promise.resolve(new Set());
    const dayClause = [...selectedDays].map((d) => "DoW eq '" + d + "'").join(" or ");
    const urls = chunk(ids, ID_CHUNK_SIZE).map((idChunk) => {
      const idClause = idChunk.map((id) => "ModuleID eq '" + id + "'").join(" or ");
      const filter =
        "AcYear eq '" + year + "' and Acsess eq '" + term + "' and (" + idClause + ") and (" + dayClause + ")";
      return SCHED_URL + "?sap-client=500&$top=5000&$select=ModuleID&$filter=" + encodeURIComponent(filter);
    });
    return Promise.all(urls.map(fetchJson)).then((results) => {
      const matched = new Set();
      results.forEach((data) => {
        ((data && data.value) || []).forEach((r) => matched.add(r.ModuleID));
      });
      return matched;
    });
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

  function performRewrite(xhr, originalText) {
    const found = findModulePart(originalText);
    if (!found || !found.json.value.length) return Promise.resolve();
    const { year, term } = extractYearTerm(xhr.__tssRequestBody);
    if (!year || !term) return Promise.resolve();
    const ids = found.json.value.map((r) => r.ModuleID).filter(Boolean);
    return matchingModuleIds(year, term, ids).then((matchedSet) => {
      const filteredValue = found.json.value.filter((row) => matchedSet.has(row.ModuleID));
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
    if (window.__tssregDowPatched) return;
    window.__tssregDowPatched = true;

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
      if (selectedDays.size && this.__tssUrl && String(this.__tssUrl).includes("$batch") && body) {
        const text = String(body);
        if (text.indexOf(MODULE_PATH_MARKER) !== -1) {
          this.__tssIntercept = true;
          this.__tssRequestBody = text;
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
          xhr.__tssRewritePromise = performRewrite(xhr, originalText).catch(() => {});
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

  patchNetwork();
  window.__tssregShared.onScheduleTick(ensureButtons);
})();
