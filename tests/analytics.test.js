"use strict";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function createStorage() {
  const data = Object.create(null);
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem: function (key, value) {
      data[key] = String(value);
    },
    removeItem: function (key) {
      delete data[key];
    },
    clear: function () {
      Object.keys(data).forEach(function (key) {
        delete data[key];
      });
    }
  };
}

function installGlobals(options) {
  const opts = options || {};
  const storage = createStorage();
  global.MOMENTRO_ANALYTICS_TEST = true;
  global.window = global;
  global.window.MOMENTRO_ANALYTICS = {
    posthogProjectKey: "",
    posthogApiHost: "https://eu.i.posthog.com",
    debug: false
  };
  global.sessionStorage = storage;
  global.location = {
    search: opts.search || "",
    pathname: opts.pathname || "/",
    hostname: "momentro.me",
    href: "https://momentro.me/" + (opts.search || "")
  };
  global.document = {
    referrer: opts.referrer || "",
    body: {
      getAttribute: function (name) {
        return name === "data-analytics-page" ? opts.page || "landing" : "";
      }
    },
    documentElement: {
      getAttribute: function (name) {
        return name === "data-analytics-page" ? opts.page || "landing" : "";
      }
    },
    addEventListener: function () {},
    createElement: function () {
      return {};
    },
    head: { appendChild: function () {} }
  };
  global.navigator = {
    userAgent: opts.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
  };
  return storage;
}

installGlobals();
const analytics = require("../assets/analytics.js");

beforeEach(function () {
  analytics.resetForTests();
  global.sessionStorage.clear();
  global.location.search = "";
  global.location.pathname = "/";
  global.location.href = "https://momentro.me/";
  global.document.referrer = "";
  global.document.documentElement.getAttribute = function (name) {
    return name === "data-analytics-page" ? "landing" : "";
  };
  global.window.MOMENTRO_ANALYTICS.posthogProjectKey = "";
  global.window.posthog = undefined;
  global.navigator.sendBeacon = undefined;
});

test("parseUtm keeps only allowlisted keys and drops email/token", function () {
  const parsed = analytics.parseUtm(
    "?utm_source=instagram&utm_medium=organic_social&utm_campaign=launch_01&utm_content=launch01_product_02&utm_term=memories&email=a@b.c&token=secret&platform=mac"
  );
  assert.deepEqual(parsed, {
    utm_source: "instagram",
    utm_medium: "organic_social",
    utm_campaign: "launch_01",
    utm_content: "launch01_product_02",
    utm_term: "memories"
  });
  assert.equal("email" in parsed, false);
  assert.equal("token" in parsed, false);
  assert.equal("platform" in parsed, false);
});

test("parseUtm accepts empty and malformed input", function () {
  assert.deepEqual(analytics.parseUtm(""), {});
  assert.deepEqual(analytics.parseUtm("utm_source=youtube"), { utm_source: "youtube" });
});

test("referrerDomain ignores same-site and empty referrers", function () {
  assert.equal(analytics.referrerDomain("", "momentro.me"), "");
  assert.equal(analytics.referrerDomain("https://momentro.me/pricing/", "momentro.me"), "");
  assert.equal(analytics.referrerDomain("https://www.momentro.me/", "momentro.me"), "");
  assert.equal(analytics.referrerDomain("https://l.instagram.com/", "momentro.me"), "l.instagram.com");
});

test("landingPath normalizes index.html, trailing slashes, and buy.html", function () {
  assert.equal(analytics.landingPath("/"), "/");
  assert.equal(analytics.landingPath("/index.html"), "/");
  assert.equal(analytics.landingPath("/pricing/"), "/pricing");
  assert.equal(analytics.landingPath("/pricing/index.html"), "/pricing");
  assert.equal(analytics.landingPath("/buy/"), "/buy");
  assert.equal(analytics.landingPath("/buy.html"), "/buy");
  assert.equal(analytics.landingPath("/refund/"), "/refund");
});

test("first-touch is sticky and last-touch updates when UTM changes", function () {
  global.location.search = "?utm_source=instagram&utm_medium=organic_social&utm_campaign=launch_01&utm_content=launch01_product_02";
  global.location.pathname = "/";
  global.document.referrer = "https://l.instagram.com/";
  const first = analytics.upsertAttribution();
  assert.equal(first.first.utm_source, "instagram");
  assert.equal(first.last.utm_content, "launch01_product_02");

  global.location.search = "?utm_source=youtube&utm_medium=organic_social&utm_campaign=launch_01&utm_content=launch01_emotional_01";
  const second = analytics.upsertAttribution();
  assert.equal(second.first.utm_source, "instagram");
  assert.equal(second.first.utm_content, "launch01_product_02");
  assert.equal(second.last.utm_source, "youtube");
  assert.equal(second.last.utm_content, "launch01_emotional_01");
});

test("reload without UTM keeps first-touch and last-touch UTM", function () {
  global.location.search = "?utm_source=facebook&utm_campaign=launch_01&utm_content=launch01_schematic_01";
  analytics.upsertAttribution();
  global.location.search = "";
  global.location.pathname = "/pricing/";
  const after = analytics.upsertAttribution();
  assert.equal(after.first.utm_source, "facebook");
  assert.equal(after.last.utm_source, "facebook");
  assert.equal(after.last.landing_path, "/pricing");
});

test("buildPayload exposes default UTM plus first and last prefixes", function () {
  global.location.search = "?utm_source=instagram&utm_campaign=launch_01&utm_content=hero_a";
  analytics.upsertAttribution();
  global.location.search = "?utm_source=youtube&utm_campaign=launch_01&utm_content=hero_b";
  const payload = analytics.buildPayload({ cta_placement: "hero", platform: "macos" });
  assert.equal(payload.utm_source, "youtube");
  assert.equal(payload.utm_content, "hero_b");
  assert.equal(payload.ft_utm_source, "instagram");
  assert.equal(payload.ft_utm_content, "hero_a");
  assert.equal(payload.lt_utm_source, "youtube");
  assert.equal(payload.cta_placement, "hero");
  assert.equal(payload.platform, "macos");
  assert.equal("email" in payload, false);
});

test("landing_view is sent once per document lifetime", function () {
  const events = [];
  global.window.posthog = {
    capture: function (name, props) {
      events.push({ name: name, props: props });
    }
  };
  assert.equal(analytics.trackLandingView(), true);
  assert.equal(analytics.trackLandingView(), false);
  assert.equal(events.length, 1);
  assert.equal(events[0].name, "landing_view");
  assert.equal(events[0].props.landing_path, "/");
  assert.equal(events[0].props.current_path, "/");
});

test("landing_view fires on direct entry to pricing, buy, and refund", function () {
  ["pricing", "buy", "refund"].forEach(function (page) {
    analytics.resetForTests();
    global.sessionStorage.clear();
    global.location.pathname = "/" + page + "/";
    global.document.documentElement.getAttribute = function (name) {
      return name === "data-analytics-page" ? page : "";
    };
    const events = [];
    global.window.posthog = {
      capture: function (name, props) {
        events.push({ name: name, props: props });
      }
    };
    assert.equal(analytics.trackLandingView(), true, page + " should send landing_view");
    assert.equal(analytics.trackLandingView(), false, page + " should not duplicate");
    assert.equal(events.length, 1);
    assert.equal(events[0].name, "landing_view");
    assert.equal(events[0].props.landing_path, "/" + page);
    assert.equal(events[0].props.current_path, "/" + page);
  });
});

test("landing_view is not sent on privacy or terms", function () {
  ["privacy", "terms"].forEach(function (page) {
    analytics.resetForTests();
    global.document.documentElement.getAttribute = function (name) {
      return name === "data-analytics-page" ? page : "";
    };
    const events = [];
    global.window.posthog = {
      capture: function (name) {
        events.push(name);
      }
    };
    assert.equal(analytics.trackLandingView(), false);
    assert.deepEqual(events, []);
  });
});

test("direct pricing entry keeps landing_path when later opening buy in the same tab", function () {
  global.location.search = "?utm_source=instagram&utm_campaign=launch_01&utm_content=launch01_product_02";
  global.location.pathname = "/pricing/";
  analytics.upsertAttribution();
  global.location.search = "";
  global.location.pathname = "/buy/";
  const payload = analytics.buildPayload();
  assert.equal(payload.landing_path, "/pricing");
  assert.equal(payload.current_path, "/buy");
  assert.equal(payload.ft_utm_source, "instagram");
});

test("missing provider queues events and does not throw", function () {
  assert.doesNotThrow(function () {
    analytics.trackStartFreeClick("header", "windows");
    analytics.trackDownloadStarted("header", "windows", "https://download.momentro.me/windows/latest");
  });
  const queued = analytics._internal.queued();
  assert.equal(queued.length, 2);
  assert.equal(queued[0].event, "start_free_click");
  assert.equal(queued[1].event, "download_started");
});

test("raw sendBeacon is not treated as a successful cookieless capture", function () {
  const beacons = [];
  global.window.MOMENTRO_ANALYTICS.posthogProjectKey = "phc_local_test_not_a_real_key";
  global.navigator.sendBeacon = function (url, body) {
    beacons.push({ url: url, body: body });
    return true;
  };
  assert.equal(analytics.trackLandingView(), true);
  analytics.trackStartFreeClick("hero", "windows");
  assert.deepEqual(beacons, []);
  const queued = analytics._internal.queued();
  assert.equal(queued.length, 2);
  assert.equal(queued[0].event, "landing_view");
  assert.equal(queued[1].event, "start_free_click");
});

test("CTA click fires start_free_click then download_started and delays navigation", function () {
  const events = [];
  const timers = [];
  const originalSetTimeout = global.setTimeout;
  global.window.posthog = {
    capture: function (name, props) {
      events.push({ name: name, props: props });
    }
  };
  global.setTimeout = function (fn, ms) {
    timers.push({ fn: fn, ms: ms });
    return timers.length;
  };
  const listeners = [];
  const fakeDoc = {
    addEventListener: function (type, fn) {
      listeners.push({ type: type, fn: fn });
    }
  };
  try {
    analytics.bindCtas(fakeDoc);
    const link = {
      href: "https://download.momentro.me/macos/latest",
      getAttribute: function (name) {
        if (name === "data-cta-placement") return "hero";
        if (name === "data-platform") return "mac";
        if (name === "href") return "https://download.momentro.me/macos/latest";
        return "";
      },
      closest: function () {
        return link;
      }
    };
    let prevented = false;
    const pointerdown = listeners.find(function (item) {
      return item.type === "pointerdown";
    });
    const click = listeners.find(function (item) {
      return item.type === "click";
    });
    assert.ok(pointerdown);
    assert.ok(click);
    pointerdown.fn({
      type: "pointerdown",
      button: 0,
      target: link,
      preventDefault: function () {
        prevented = true;
      },
      stopPropagation: function () {
        prevented = true;
      }
    });
    assert.equal(prevented, false);
    assert.equal(events.length, 2);
    assert.equal(timers.length, 0);
    click.fn({
      type: "click",
      button: 0,
      target: link,
      preventDefault: function () {
        prevented = true;
      },
      stopPropagation: function () {
        prevented = true;
      }
    });
    assert.equal(prevented, true);
    assert.equal(events.length, 2);
    assert.equal(events[0].name, "start_free_click");
    assert.equal(events[1].name, "download_started");
    assert.equal(events[0].props.cta_placement, "hero");
    assert.equal(events[0].props.platform, "macos");
    assert.equal(events[1].props.download_host, "download.momentro.me");
    assert.equal(timers.length, 1);
    assert.equal(timers[0].ms, 180);
    assert.equal(global.location.href.indexOf("download.momentro.me"), -1);
    timers[0].fn();
    assert.equal(global.location.href, "https://download.momentro.me/macos/latest");
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});

test("CTA events use the SDK sendBeacon transport, not the raw capture API", function () {
  const calls = [];
  global.window.posthog = {
    capture: function (name, props, opts) {
      calls.push({ name: name, props: props, opts: opts || {} });
    }
  };
  analytics.trackStartFreeClick("hero", "windows");
  analytics.trackDownloadStarted(
    "hero",
    "windows",
    "https://download.momentro.me/windows/latest"
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0].opts.send_instantly, true);
  assert.equal(calls[0].opts.transport, "sendBeacon");
  assert.equal(calls[1].opts.transport, "sendBeacon");
  const source = fs.readFileSync(path.join(__dirname, "../assets/analytics.js"), "utf8");
  assert.match(source, /unloadSafe:\s*true/);
  assert.match(source, /Always queue until the SDK can send/);
  assert.equal(source.includes("/i/v0/e/"), false);
});

test("CTA placement comes from data attributes, not button text", function () {
  const events = [];
  global.window.posthog = {
    capture: function (name, props) {
      events.push({ name: name, props: props });
    }
  };
  analytics.trackStartFreeClick("final_cta", "windows");
  assert.equal(events[0].props.cta_placement, "final_cta");
  assert.equal(JSON.stringify(events[0].props).indexOf("Download for Windows"), -1);
});

test("platform and download URL helpers", function () {
  assert.equal(analytics.platformFromHref("https://download.momentro.me/windows/latest"), "windows");
  assert.equal(analytics.platformFromHref("https://download.momentro.me/macos/latest"), "macos");
  assert.equal(analytics.isDownloadUrl("https://download.momentro.me/windows/latest"), true);
  assert.equal(analytics.isDownloadUrl("https://momentro.me/pricing/"), false);
});

test("ua_os uses the same coarse UA classes as the existing Mac-first script", function () {
  assert.equal(analytics.detectUaOs("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), "macos");
  assert.equal(analytics.detectUaOs("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)"), "ios");
  assert.equal(analytics.detectUaOs("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "windows");
});

test("HTML CTAs expose stable analytics ids and expected placements", function () {
  const root = path.join(__dirname, "..");
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const pricing = fs.readFileSync(path.join(root, "pricing/index.html"), "utf8");
  const buy = fs.readFileSync(path.join(root, "buy/index.html"), "utf8");
  const buyLegacy = fs.readFileSync(path.join(root, "buy.html"), "utf8");
  const refund = fs.readFileSync(path.join(root, "refund/index.html"), "utf8");

  function count(html, needle) {
    return html.split(needle).length - 1;
  }

  assert.match(index, /data-analytics-page="landing"/);
  assert.match(pricing, /data-analytics-page="pricing"/);
  assert.match(buy, /data-analytics-page="buy"/);
  assert.match(refund, /data-analytics-page="refund"/);
  assert.equal(count(index, 'data-analytics-id="start-free"'), 8);
  assert.equal(count(index, 'data-cta-placement="header"'), 2);
  assert.equal(count(index, 'data-cta-placement="hero"'), 2);
  assert.equal(count(index, 'data-cta-placement="how_it_works"'), 2);
  assert.equal(count(index, 'data-cta-placement="final_cta"'), 2);
  assert.match(index, /assets\/analytics\.js/);

  assert.equal(count(pricing, 'data-analytics-id="start-free"'), 4);
  assert.equal(count(pricing, 'data-cta-placement="pricing_free"'), 2);
  assert.equal(count(pricing, 'data-cta-placement="pricing_paid"'), 2);

  assert.equal(count(buy, 'data-analytics-id="start-free"'), 4);
  assert.equal(count(buy, 'data-cta-placement="buy_free"'), 2);
  assert.equal(count(buy, 'data-cta-placement="buy_paid"'), 2);
  assert.equal(count(buyLegacy, 'data-analytics-id="start-free"'), 4);

  assert.equal(count(refund, 'data-analytics-id="start-free"'), 1);
  assert.match(refund, /data-cta-placement="refund"/);
});

test("privacy scrub keeps cookieless hash ingredients and drops email/profile writes", function () {
  const kept = analytics._internal.scrubPrivacyProperties({
    email: "a@b.c",
    $set: { email: "a@b.c" },
    $set_once: { name: "x" },
    $raw_user_agent: "Mozilla/5.0",
    $ip: "203.0.113.10",
    $host: "momentro.me",
    $current_url: "https://momentro.me/",
    utm_source: "instagram",
    landing_path: "/"
  });
  assert.equal("email" in kept, false);
  assert.equal("$set" in kept, false);
  assert.equal("$set_once" in kept, false);
  assert.equal(kept.$raw_user_agent, "Mozilla/5.0");
  assert.equal(kept.$ip, "203.0.113.10");
  assert.equal(kept.$host, "momentro.me");
  assert.equal(kept.$current_url, "https://momentro.me/");
  assert.equal(kept.utm_source, "instagram");
  const event = analytics._internal.beforeSend({
    event: "landing_view",
    properties: { email: "hidden@x.y", $raw_user_agent: "Mozilla/5.0", $host: "momentro.me" }
  });
  assert.equal(event.event, "landing_view");
  assert.equal("email" in event.properties, false);
  assert.equal(event.properties.$raw_user_agent, "Mozilla/5.0");
  assert.equal(event.properties.$host, "momentro.me");
});

test("PostHog identity config is cookieless EU and does not strip hash ingredients", function () {
  const source = fs.readFileSync(path.join(__dirname, "../assets/analytics.js"), "utf8");
  assert.match(source, /cookieless_mode:\s*"always"/);
  assert.match(source, /person_profiles:\s*"never"/);
  assert.match(source, /before_send:\s*beforeSend/);
  assert.equal(source.includes("sanitize_properties"), false);
  assert.equal(source.includes("delete props.$raw_user_agent"), false);
  assert.equal(source.includes("delete props.$ip"), false);
  assert.equal(source.includes("delete props.$host"), false);
  assert.match(source, /api_host:\s*EU_API_HOST/);
  const cfg = fs.readFileSync(path.join(__dirname, "../assets/analytics-config.js"), "utf8");
  assert.match(cfg, /posthogApiHost:\s*"https:\/\/eu\.i\.posthog\.com"/);
  assert.match(cfg, /posthogProjectKey:\s*"phc_/);
});

test("three product events keep names and are the only Momentro funnel captures", function () {
  const events = [];
  global.window.posthog = {
    capture: function (name, props) {
      events.push({ name: name, props: props });
    }
  };
  analytics.trackLandingView();
  analytics.trackStartFreeClick("hero", "macos");
  analytics.trackDownloadStarted("hero", "macos", "https://download.momentro.me/macos/latest");
  assert.deepEqual(
    events.map(function (item) {
      return item.name;
    }),
    ["landing_view", "start_free_click", "download_started"]
  );
  assert.equal(analytics.EVENTS.LANDING_VIEW, "landing_view");
  assert.equal(analytics.EVENTS.START_FREE_CLICK, "start_free_click");
  assert.equal(analytics.EVENTS.DOWNLOAD_STARTED, "download_started");
});

test("PostHog ingest host is pinned to Cloud EU", function () {
  assert.equal(analytics.EU_API_HOST, "https://eu.i.posthog.com");
  assert.equal(analytics.EU_ASSETS_HOST, "https://eu-assets.i.posthog.com");
  assert.equal(analytics._internal.resolveApiHost("https://us.i.posthog.com"), "https://eu.i.posthog.com");
  assert.equal(analytics._internal.resolveApiHost("https://app.posthog.com"), "https://eu.i.posthog.com");
  assert.equal(analytics._internal.resolveApiHost(""), "https://eu.i.posthog.com");
  const source = fs.readFileSync(path.join(__dirname, "../assets/analytics.js"), "utf8");
  assert.match(source, /cookieless_mode:\s*"always"/);
  assert.match(source, /person_profiles:\s*"never"/);
  assert.match(source, /autocapture:\s*false/);
  assert.match(source, /capture_pageview:\s*false/);
  assert.match(source, /disable_session_recording:\s*true/);
  assert.equal(source.includes("us.i.posthog.com"), false);
});

test("client files do not contain personal or secret keys", function () {
  const clientFiles = [
    path.join(__dirname, "../assets/analytics.js"),
    path.join(__dirname, "../assets/analytics-config.js"),
    path.join(__dirname, "../index.html"),
    path.join(__dirname, "../pricing/index.html"),
    path.join(__dirname, "../buy/index.html"),
    path.join(__dirname, "../buy.html"),
    path.join(__dirname, "../refund/index.html")
  ];
  const forbidden = /sk_live|api_secret|PERSONAL_API_KEY|phx_[A-Za-z0-9]+|phs_[A-Za-z0-9]+/;
  clientFiles.forEach(function (file) {
    const text = fs.readFileSync(file, "utf8");
    assert.equal(forbidden.test(text), false, path.basename(file) + " must not contain secrets");
  });
  const runtime = fs.readFileSync(path.join(__dirname, "../assets/analytics.js"), "utf8");
  assert.equal(/phc_[A-Za-z0-9]{8,}/.test(runtime), false);
});
