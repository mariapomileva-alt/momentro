/**
 * Momentro landing analytics layer.
 *
 * Sends three product events through PostHog Cloud EU (cookieless).
 * Download CTAs still go to the same installer URLs. Capture errors are
 * swallowed. On a download click we briefly delay navigation so the events
 * can flush, then assign the original href. If this file fails to load,
 * the native <a href> still starts the download.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.MomentroAnalytics = api;
  if (typeof document !== "undefined" && !root.MOMENTRO_ANALYTICS_TEST) {
    api.autoInit();
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  var EVENTS = {
    LANDING_VIEW: "landing_view",
    START_FREE_CLICK: "start_free_click",
    DOWNLOAD_STARTED: "download_started"
  };

  var UTM_KEYS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term"
  ];

  var STORAGE_KEY = "momentro_ft_attribution_v1";
  var CTA_SELECTOR = '[data-analytics-id="start-free"]';
  var MAX_VALUE_LENGTH = 200;
  var DOWNLOAD_HOST = "download.momentro.me";
  var EU_API_HOST = "https://eu.i.posthog.com";
  var EU_ASSETS_HOST = "https://eu-assets.i.posthog.com";
  var EU_UI_HOST = "https://eu.posthog.com";
  var TRACKED_PAGES = {
    landing: true,
    pricing: true,
    buy: true,
    refund: true
  };

  var landingViewSent = false;
  var ctaBound = false;
  var providerReady = false;
  var providerFailed = false;
  var queued = [];
  var initState = { done: false };
  var lastCtaKey = "";
  var lastCtaAt = 0;
  var pendingNavTimer = null;
  var NAV_DELAY_MS = 180;
  var SDK_WAIT_MS = 800;

  function resolveApiHost(raw) {
    var host = String(raw || EU_API_HOST).replace(/\/$/, "");
    if (host !== EU_API_HOST) return EU_API_HOST;
    return EU_API_HOST;
  }

  function globalRoot() {
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    if (g.MOMENTRO_ANALYTICS) return g;
    if (typeof window !== "undefined") return window;
    return g;
  }

  function config() {
    var raw = globalRoot().MOMENTRO_ANALYTICS || {};
    return {
      posthogProjectKey: String(raw.posthogProjectKey || "").trim(),
      posthogApiHost: resolveApiHost(raw.posthogApiHost),
      debug: Boolean(raw.debug) || isDebugQuery()
    };
  }

  function isDebugQuery() {
    try {
      return (
        typeof location !== "undefined" &&
        /(?:^|[?&])analytics_debug=1(?:&|$)/.test(location.search)
      );
    } catch (err) {
      return false;
    }
  }

  function debugEnabled() {
    return config().debug;
  }

  function debugLog(message, payload) {
    if (!debugEnabled()) return;
    try {
      if (typeof console !== "undefined" && console.info) {
        console.info("[momentro-analytics]", message, payload || "");
      }
    } catch (err) {
      /* ignore */
    }
  }

  function clip(value) {
    if (value == null) return "";
    var text = String(value).replace(/[\u0000-\u001f]/g, "").trim();
    if (text.length > MAX_VALUE_LENGTH) text = text.slice(0, MAX_VALUE_LENGTH);
    return text;
  }

  function readSearchParams(search) {
    var source = search == null
      ? (typeof location !== "undefined" ? location.search : "")
      : search;
    if (source.charAt(0) === "?") source = source.slice(1);
    try {
      return new URLSearchParams(source);
    } catch (err) {
      return {
        get: function () {
          return null;
        }
      };
    }
  }

  /**
   * Keep only the five UTM keys. Never persist the rest of the query string
   * (tokens, emails, platform display flags, etc.).
   */
  function parseUtm(search) {
    var params = readSearchParams(search);
    var out = {};
    for (var i = 0; i < UTM_KEYS.length; i++) {
      var key = UTM_KEYS[i];
      var value = clip(params.get(key));
      if (value) out[key] = value;
    }
    return out;
  }

  function referrerDomain(referrer, currentHost) {
    var raw = referrer == null
      ? (typeof document !== "undefined" ? document.referrer : "")
      : referrer;
    if (!raw) return "";
    try {
      var host = new URL(raw).hostname.replace(/^www\./, "");
      var self = (currentHost || (typeof location !== "undefined" ? location.hostname : "")).replace(/^www\./, "");
      if (!host || host === self) return "";
      return clip(host);
    } catch (err) {
      return "";
    }
  }

  function landingPath(pathname) {
    var path = pathname == null
      ? (typeof location !== "undefined" ? location.pathname : "/")
      : pathname;
    if (!path || path === "/index.html") return "/";
    if (path.length > 1 && path.slice(-1) === "/") path = path.slice(0, -1);
    if (path.slice(-11) === "/index.html") path = path.slice(0, -11) || "/";
    if (path === "/buy.html") return "/buy";
    return clip(path || "/");
  }

  function hasUtm(slice) {
    if (!slice) return false;
    for (var i = 0; i < UTM_KEYS.length; i++) {
      if (slice[UTM_KEYS[i]]) return true;
    }
    return false;
  }

  function currentSlice(overrides) {
    var opts = overrides || {};
    var utm = parseUtm(opts.search);
    var slice = {};
    for (var i = 0; i < UTM_KEYS.length; i++) {
      if (utm[UTM_KEYS[i]]) slice[UTM_KEYS[i]] = utm[UTM_KEYS[i]];
    }
    var ref = referrerDomain(opts.referrer, opts.hostname);
    if (ref) slice.referrer_domain = ref;
    slice.landing_path = landingPath(opts.pathname);
    return slice;
  }

  function storage() {
    try {
      if (typeof sessionStorage !== "undefined") return sessionStorage;
    } catch (err) {
      /* private mode / blocked */
    }
    return null;
  }

  function readStoredAttribution() {
    var store = storage();
    if (!store) return null;
    try {
      var raw = store.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch (err) {
      return null;
    }
  }

  function writeStoredAttribution(state) {
    var store = storage();
    if (!store) return;
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      /* quota / blocked */
    }
  }

  function copySlice(slice) {
    var out = {};
    if (!slice) return out;
    for (var key in slice) {
      if (Object.prototype.hasOwnProperty.call(slice, key) && slice[key]) {
        out[key] = slice[key];
      }
    }
    return out;
  }

  /**
   * First-touch: first page/UTM/referrer seen in this tab only (sessionStorage).
   * Last-touch: most recent UTM on the URL; otherwise the previous last-touch.
   * v1 limit: a new tab starts a new first-touch. No persistent visitor id.
   */
  function upsertAttribution(overrides) {
    var now = currentSlice(overrides);
    var stored = readStoredAttribution() || {};
    if (!stored.first) {
      stored.first = copySlice(now);
    }
    if (hasUtm(now)) {
      stored.last = copySlice(now);
    } else if (!stored.last) {
      stored.last = copySlice(now);
    } else {
      stored.last.landing_path = now.landing_path;
    }
    writeStoredAttribution(stored);
    return stored;
  }

  function detectUaOs(userAgent) {
    var ua = userAgent == null
      ? (typeof navigator !== "undefined" ? navigator.userAgent : "")
      : userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
    if (/Android/i.test(ua)) return "android";
    if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
    if (/Windows/i.test(ua)) return "windows";
    if (/Linux/i.test(ua)) return "linux";
    return "other";
  }

  function platformFromHref(href) {
    var url = String(href || "");
    if (/\/windows\//i.test(url)) return "windows";
    if (/\/macos\//i.test(url) || /\/mac\//i.test(url)) return "macos";
    return "";
  }

  function isDownloadUrl(href) {
    if (!href) return false;
    try {
      var url = new URL(href, typeof location !== "undefined" ? location.href : "https://momentro.me/");
      return url.hostname.replace(/^www\./, "") === DOWNLOAD_HOST;
    } catch (err) {
      return /download\.momentro\.me/i.test(String(href));
    }
  }

  function analyticsPage(root) {
    var node = root;
    if (!node && typeof document !== "undefined") {
      node = document.documentElement || document.body;
    }
    if (!node || !node.getAttribute) return "";
    return clip(node.getAttribute("data-analytics-page") || "");
  }

  function prefixSlice(slice, prefix) {
    var out = {};
    if (!slice) return out;
    UTM_KEYS.forEach(function (key) {
      if (slice[key]) out[prefix + key] = slice[key];
    });
    if (slice.referrer_domain) out[prefix + "referrer_domain"] = slice.referrer_domain;
    if (slice.landing_path) out[prefix + "landing_path"] = slice.landing_path;
    return out;
  }

  function buildPayload(extra) {
    var attr = upsertAttribution();
    var payload = {};
    var current = currentSlice();
    var primary = hasUtm(attr.last) ? attr.last : attr.first;
    var i;
    var key;
    for (i = 0; i < UTM_KEYS.length; i++) {
      key = UTM_KEYS[i];
      if (primary && primary[key]) payload[key] = primary[key];
    }
    if (attr.first && attr.first.referrer_domain) {
      payload.referrer_domain = attr.first.referrer_domain;
    } else if (current.referrer_domain) {
      payload.referrer_domain = current.referrer_domain;
    }
    if (current.landing_path) payload.current_path = current.landing_path;
    if (attr.first && attr.first.landing_path) {
      payload.landing_path = attr.first.landing_path;
    } else if (current.landing_path) {
      payload.landing_path = current.landing_path;
    }
    var first = prefixSlice(attr.first, "ft_");
    var last = prefixSlice(attr.last, "lt_");
    for (key in first) payload[key] = first[key];
    for (key in last) payload[key] = last[key];
    payload.ua_os = detectUaOs();
    if (extra) {
      for (key in extra) {
        if (extra[key]) payload[key] = extra[key];
      }
    }
    return payload;
  }

  function getPosthog() {
    try {
      var g = globalRoot();
      return g.posthog || (typeof window !== "undefined" ? window.posthog : null);
    } catch (err) {
      return null;
    }
  }

  function sdkAvailable() {
    var ph = getPosthog();
    return Boolean(ph && typeof ph.capture === "function");
  }

  /**
   * Strip only personal/profile fields. Never delete cookieless hash
   * ingredients ($raw_user_agent, $ip, $host) — PostHog drops sentinel
   * `$posthog_cookieless` events when those are missing.
   */
  function scrubPrivacyProperties(props) {
    if (!props) return props;
    delete props.email;
    delete props.$set;
    delete props.$set_once;
    return props;
  }

  function beforeSend(event) {
    if (event && event.properties) {
      scrubPrivacyProperties(event.properties);
    }
    return event;
  }

  function captureViaSdk(eventName, payload, transport) {
    try {
      var ph = getPosthog();
      if (ph && typeof ph.capture === "function") {
        var opts = { send_instantly: true };
        if (transport) opts.transport = transport;
        ph.capture(eventName, payload, opts);
        return true;
      }
    } catch (err) {
      debugLog("provider capture failed", { event: eventName });
    }
    return false;
  }

  /**
   * Cookieless PostHog accepts the official SDK and drops raw Capture API
   * beacons. Always queue until the SDK can send.
   */
  function capture(eventName, properties, options) {
    var payload = properties || {};
    var unloadSafe = Boolean(options && options.unloadSafe);
    debugLog(eventName, payload);
    if (captureViaSdk(eventName, payload, unloadSafe ? "sendBeacon" : null)) {
      return true;
    }
    queued.push({
      event: eventName,
      properties: payload,
      unloadSafe: unloadSafe
    });
    return false;
  }

  function flushQueue() {
    if (!queued.length) return;
    var pending = queued.slice();
    queued = [];
    pending.forEach(function (item) {
      capture(item.event, item.properties, { unloadSafe: item.unloadSafe });
    });
  }

  function loadPosthog(done) {
    var cfg = config();
    if (!cfg.posthogProjectKey) {
      debugLog("provider skipped: empty project key");
      providerFailed = true;
      if (done) done(new Error("missing-key"));
      return;
    }
    if (typeof window === "undefined" || typeof document === "undefined") {
      if (done) done(new Error("no-document"));
      return;
    }
    if (window.posthog && typeof window.posthog.init === "function" && window.posthog.__loaded) {
      providerReady = true;
      flushQueue();
      if (done) done();
      return;
    }

    var assetsHost = EU_ASSETS_HOST;
    var script = document.createElement("script");
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = assetsHost + "/static/array.js";
    script.onerror = function () {
      providerFailed = true;
      debugLog("provider script blocked or failed");
      if (done) done(new Error("blocked"));
    };
    script.onload = function () {
      try {
        if (!window.posthog || typeof window.posthog.init !== "function") {
          throw new Error("missing-init");
        }
        window.posthog.init(cfg.posthogProjectKey, {
          api_host: EU_API_HOST,
          ui_host: EU_UI_HOST,
          defaults: "2025-11-30",
          cookieless_mode: "always",
          person_profiles: "never",
          persistence: "memory",
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          disable_session_recording: true,
          disable_surveys: true,
          request_batching: false,
          before_send: beforeSend
        });
        providerReady = true;
        flushQueue();
        debugLog("provider ready");
        if (done) done();
      } catch (err) {
        providerFailed = true;
        debugLog("provider init failed");
        if (done) done(err);
      }
    };
    document.head.appendChild(script);
  }

  function isTrackedPage(page) {
    var name = page == null ? analyticsPage() : page;
    return Boolean(TRACKED_PAGES[name]);
  }

  function trackLandingView() {
    if (landingViewSent) return false;
    if (!isTrackedPage()) return false;
    landingViewSent = true;
    capture(EVENTS.LANDING_VIEW, buildPayload());
    return true;
  }

  function trackStartFreeClick(placement, platform) {
    capture(
      EVENTS.START_FREE_CLICK,
      buildPayload({
        cta_placement: clip(placement || "unknown"),
        platform: clip(platform || "")
      }),
      { unloadSafe: true }
    );
  }

  function trackDownloadStarted(placement, platform, href) {
    var host = "";
    try {
      host = new URL(href, typeof location !== "undefined" ? location.href : "https://momentro.me/").hostname;
    } catch (err) {
      host = DOWNLOAD_HOST;
    }
    capture(
      EVENTS.DOWNLOAD_STARTED,
      buildPayload({
        cta_placement: clip(placement || "unknown"),
        platform: clip(platform || ""),
        download_host: clip(host)
      }),
      { unloadSafe: true }
    );
  }

  function ctaContext(link) {
    var placement = clip(link.getAttribute("data-cta-placement") || "unknown");
    var platform =
      clip(link.getAttribute("data-platform") || "") ||
      platformFromHref(link.getAttribute("href"));
    if (platform === "mac") platform = "macos";
    return { placement: placement, platform: platform, href: link.href };
  }

  function isModifiedClick(event) {
    return Boolean(
      event && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    );
  }

  function goToHref(href) {
    try {
      globalRoot().location.href = href;
    } catch (err) {
      /* ignore */
    }
  }

  function scheduleDownload(href) {
    if (!href) return;
    var run = function () {
      pendingNavTimer = null;
      goToHref(href);
    };
    var delay = sdkAvailable() || providerFailed ? NAV_DELAY_MS : SDK_WAIT_MS;
    try {
      if (typeof setTimeout === "function") {
        if (pendingNavTimer) {
          try {
            clearTimeout(pendingNavTimer);
          } catch (err) {
            /* ignore */
          }
        }
        pendingNavTimer = setTimeout(run, delay);
        return;
      }
    } catch (err) {
      /* ignore */
    }
    run();
  }

  function trackCta(ctx) {
    var sig = String(ctx.href || "") + "|" + ctx.placement + "|" + ctx.platform;
    var now = Date.now();
    if (sig === lastCtaKey && now - lastCtaAt < 1500) return;
    lastCtaKey = sig;
    lastCtaAt = now;
    trackStartFreeClick(ctx.placement, ctx.platform);
    if (isDownloadUrl(ctx.href)) {
      trackDownloadStarted(ctx.placement, ctx.platform, ctx.href);
    }
  }

  function onDocumentClick(event) {
    var href = "";
    var isDownload = false;
    var isClick = false;
    try {
      if (event && event.button != null && event.button !== 0) return;
      var target = event && event.target;
      if (target && target.nodeType === 3) target = target.parentElement;
      if (!target || !target.closest) return;
      var link = target.closest(CTA_SELECTOR);
      if (!link) return;
      var ctx = ctaContext(link);
      href = ctx.href;
      isDownload = isDownloadUrl(href);
      isClick = !event.type || event.type === "click";
      trackCta(ctx);
      if (isDownload && isClick && !isModifiedClick(event)) {
        if (event && typeof event.preventDefault === "function") {
          event.preventDefault();
        }
        scheduleDownload(href);
      }
    } catch (err) {
      debugLog("cta handler failed");
      if (isDownload && isClick && href) scheduleDownload(href);
    }
  }

  function bindCtas(doc) {
    var root = doc || (typeof document !== "undefined" ? document : null);
    if (!root || ctaBound) return;
    ctaBound = true;
    root.addEventListener("pointerdown", onDocumentClick, true);
    root.addEventListener("mousedown", onDocumentClick, true);
    root.addEventListener("click", onDocumentClick, true);
  }

  function onPageShow(event) {
    if (event && event.persisted) return;
    trackLandingView();
  }

  function autoInit() {
    if (initState.done) return;
    initState.done = true;
    try {
      upsertAttribution();
      bindCtas();
      loadPosthog();
      if (typeof window !== "undefined") {
        window.addEventListener("pageshow", onPageShow);
      }
      trackLandingView();
    } catch (err) {
      debugLog("init failed");
    }
  }

  function resetForTests() {
    landingViewSent = false;
    ctaBound = false;
    providerReady = false;
    providerFailed = false;
    queued = [];
    initState.done = false;
    lastCtaKey = "";
    lastCtaAt = 0;
    pendingNavTimer = null;
  }

  return {
    EVENTS: EVENTS,
    UTM_KEYS: UTM_KEYS,
    EU_API_HOST: EU_API_HOST,
    EU_ASSETS_HOST: EU_ASSETS_HOST,
    TRACKED_PAGES: TRACKED_PAGES,
    parseUtm: parseUtm,
    referrerDomain: referrerDomain,
    landingPath: landingPath,
    currentSlice: currentSlice,
    upsertAttribution: upsertAttribution,
    detectUaOs: detectUaOs,
    platformFromHref: platformFromHref,
    isDownloadUrl: isDownloadUrl,
    isTrackedPage: isTrackedPage,
    buildPayload: buildPayload,
    trackLandingView: trackLandingView,
    trackStartFreeClick: trackStartFreeClick,
    trackDownloadStarted: trackDownloadStarted,
    bindCtas: bindCtas,
    autoInit: autoInit,
    capture: capture,
    resetForTests: resetForTests,
    _internal: {
      hasUtm: hasUtm,
      analyticsPage: analyticsPage,
      resolveApiHost: resolveApiHost,
      scrubPrivacyProperties: scrubPrivacyProperties,
      beforeSend: beforeSend,
      isLandingViewSent: function () {
        return landingViewSent;
      },
      queued: function () {
        return queued.slice();
      },
      providerState: function () {
        return { ready: providerReady, failed: providerFailed };
      }
    }
  };
});
