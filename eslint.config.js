const browser = [
  "window", "document", "location", "navigator", "console", "performance",
  "fetch", "Headers", "Request", "Response", "XMLHttpRequest", "URL", "URLSearchParams",
  "Blob", "FormData", "FileReader", "Image", "CustomEvent", "Event", "NodeFilter",
  "MutationObserver", "IntersectionObserver", "ResizeObserver",
  "requestAnimationFrame", "cancelAnimationFrame",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "localStorage", "sessionStorage", "getComputedStyle", "crypto", "btoa", "atob",
];

const globals = {};
browser.forEach((name) => (globals[name] = "readonly"));
globals.sap = "readonly";
globals.chrome = "readonly";

module.exports = [
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals,
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { args: "none" }],
      "no-redeclare": "error",
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-unreachable": "error",
      "no-cond-assign": "error",
      "no-constant-condition": "error",
      "no-self-compare": "error",
      "no-implied-eval": "error",
      "no-eval": "error",
    },
  },
];
