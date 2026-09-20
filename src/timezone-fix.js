(() => {
  const ZONE_ALIASES = {
    PST: "America/Los_Angeles",
    PDT: "America/Los_Angeles",
    CST: "America/Chicago",
    CDT: "America/Chicago",
    MDT: "America/Denver",
    EDT: "America/New_York",
  };

  function normalize(args) {
    const options = args[1];
    if (!options || !ZONE_ALIASES[options.timeZone]) return args;
    return [args[0], Object.assign({}, options, { timeZone: ZONE_ALIASES[options.timeZone] })];
  }

  const OrigDateTimeFormat = Intl.DateTimeFormat;
  Intl.DateTimeFormat = new Proxy(OrigDateTimeFormat, {
    construct: (target, args, newTarget) => Reflect.construct(target, normalize(args), newTarget),
    apply: (target, thisArg, args) => Reflect.apply(target, thisArg, normalize(args)),
  });

  ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"].forEach((name) => {
    const orig = Date.prototype[name];
    Date.prototype[name] = function (locales, options) {
      return orig.apply(this, normalize([locales, options]));
    };
  });
})();
