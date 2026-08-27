# Website analytics

Momentro’s public site is static HTML on GitHub Pages. This layer records three product events through **PostHog Cloud EU** in cookieless mode. It does not change how download buttons look or behave.

There is no build step and no cookie banner. If PostHog is blocked, missing, or misconfigured, visitors can still click through to `https://download.momentro.me/...`.

## Events

| Event | When it fires | Notes |
| --- | --- | --- |
| `landing_view` | Direct load of `/`, `/pricing/`, `/buy/`, or `/refund/` | Once per document. Reload sends a new view. Back/forward from bfcache does not. Privacy and terms do not send this event. |
| `start_free_click` | Any `[data-analytics-id="start-free"]` control is clicked | Placement comes from `data-cta-placement`, not from the visible label. Homepage labels currently say “Download for Windows/Mac”, not “Start free”. |
| `download_started` | The same click targets `download.momentro.me` | Fired immediately after `start_free_click`, **before** the browser follows the link. Events go only through the PostHog JS SDK (cookieless). Download clicks are held ~180ms if the SDK is ready, or up to ~800ms if it is still loading, then the page is sent to the same installer URL. This is the last action we can observe. It is **not** proof that the file finished downloading. |

On the current site every Start-free equivalent is a direct installer link, so a successful click produces both events in this order:

```text
start_free_click
download_started
```

### `cta_placement` values

| Value | Where |
| --- | --- |
| `header` | Homepage header Windows / Mac |
| `hero` | Homepage hero |
| `how_it_works` | Homepage “3 steps” CTA |
| `final_cta` | Homepage closing band |
| `pricing_free` / `pricing_paid` | `/pricing/` plan cards |
| `buy_free` / `buy_paid` | `/buy/` plan cards |
| `refund` | “Try Momentro free” on `/refund/` |

`platform` is `windows` or `macos` from `data-platform` or the installer URL path.

### Shared properties

Sent when present. Empty values are omitted. The full query string is never stored.

| Property | Meaning |
| --- | --- |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` | Last-touch UTM (falls back to first-touch) |
| `ft_utm_*`, `ft_referrer_domain`, `ft_landing_path` | First-touch (this tab session) |
| `lt_utm_*`, `lt_referrer_domain`, `lt_landing_path` | Last-touch |
| `referrer_domain` | First inbound host, excluding `momentro.me` |
| `landing_path` | First path in **this tab** (`/` not `/index.html`; `/buy.html` → `/buy`) |
| `current_path` | Path of the document that sent the event |
| `ua_os` | Coarse OS from UA: `windows` / `macos` / `ios` / `android` / `linux` / `other` |
| `download_host` | Host of the installer URL (`download.momentro.me` only) |

Timestamp is assigned by PostHog (UTC). We do not send names, emails, IP, file contents, or installer filenames.

## Attribution

Publisher already appends UTM to `https://momentro.me/`:

```text
utm_source=instagram|facebook|youtube
utm_medium=organic_social
utm_campaign=launch_01
utm_content=<content id>
```

On first page load **in a tab**, UTM values (plus referrer host and path) are stored in `sessionStorage` under `momentro_ft_attribution_v1`. That is campaign context for this tab only, not a visitor ID.

**v1 limitation:** first-touch does not survive a new tab, a closed tab, or another browser. Reloads and in-site navigation **in the same tab** keep first-touch. A later URL with new UTM updates last-touch only.

If `sessionStorage` is blocked, attribution falls back to the current URL.

## Privacy model

- Provider: PostHog Cloud EU (`https://eu.i.posthog.com`).
- `cookieless_mode: 'always'` — no PostHog cookies, no localStorage identity. The JS SDK sends distinct ID `$posthog_cookieless`; PostHog replaces it server-side with a daily hash of IP + user agent + host. Live events showing `$posthog_cookieless` is expected. Historical Events / HogQL must show hashed ids, not the sentinel.
- Do not strip `$raw_user_agent`, `$ip`, or `$host` in `before_send`. Those are cookieless hash ingredients; deleting them drops the event after Live.
- No autocapture, session replay, surveys, or default pageviews.
- Client config contains only the **public** project API key (`phc_…`).
- Personal/admin API keys stay in the Analytics Agent (content-studio), never in this repo.

This matches the site privacy copy: privacy-respecting analytics, no advertising pixels, legitimate interest for basic analytics. No consent banner is added because tracking is cookieless and does not use a persistent client identifier.

## Enable in PostHog (required before data appears)

1. Create a project at [eu.posthog.com](https://eu.posthog.com) (EU cloud, not US). Project name: `Momentro Website`.
2. Project settings → **Project API Key**. Paste the public `phc_…` value into `assets/analytics-config.js` as `posthogProjectKey` (the empty quotes on that property). Do not paste a Personal API Key.
3. Enable **Cookieless server hash mode** for the project (Project settings → Web analytics). Until this is on, SDK events with distinct ID `$posthog_cookieless` appear in **Live** and are **dropped before historical Events / HogQL**, with no ingestion warning.
4. Keep **session replay** and **autocapture** off. This site also sets `capture_pageview: false`.
5. Leave IP capture at the EU default (off).
6. Ingest host is hardcoded to `https://eu.i.posthog.com`. US hosts in config are ignored. Do not change GitHub Pages or DNS for this step.

No other environment variables exist: this site has no bundler and no CI injection.

## Local preview

Do not deploy. From the repo root:

```bash
python3 -m http.server 4173
```

Open:

- http://127.0.0.1:4173/?analytics_debug=1
- http://127.0.0.1:4173/pricing/?analytics_debug=1
- http://127.0.0.1:4173/buy/?analytics_debug=1
- http://127.0.0.1:4173/refund/?analytics_debug=1

## PostHog Live Events check

Use the EU dashboard: [https://eu.posthog.com](https://eu.posthog.com) → project **Momentro Website** → **Activity** → **Live events**.

1. Confirm the project is EU (URL is `eu.posthog.com`, not `us.posthog.com` / `app.posthog.com`).
2. Keep Live events open.
3. Load `http://127.0.0.1:4173/?analytics_debug=1` once. Expect **one** `landing_view` with `landing_path` `/`. Reload: a second `landing_view` (new document).
4. In a **new** tab, open `http://127.0.0.1:4173/pricing/?utm_source=instagram&utm_medium=organic_social&utm_campaign=launch_01&utm_content=launch01_product_02&analytics_debug=1`. Expect one `landing_view` with `landing_path` `/pricing` and those UTM properties.
5. Repeat in new tabs for `/buy/` (`landing_path` `/buy`) and `/refund/` (`landing_path` `/refund`).
6. On the homepage, click a hero download button. Expect `start_free_click` then `download_started` with `cta_placement=hero` and `platform` `windows` or `macos`. Repeat for header / how_it_works / final_cta.
7. On `/pricing/`, click a Free and a Paid download button (`pricing_free` / `pricing_paid`).
8. DevTools → Network request blocking → `eu.i.posthog.com` and `eu-assets.i.posthog.com`. Reload and click a download button: the installer still starts; Live events will not get that click.

Localhost traffic is accepted by PostHog. If nothing appears, check cookieless server hash mode and that `posthogProjectKey` is a non-empty `phc_…` in `assets/analytics-config.js`.

## Dashboard: three-step funnel

1. Data management → **Insights** → New insight → **Funnel**.
2. Steps, in order:
   1. `landing_view`
   2. `start_free_click`
   3. `download_started`
3. Conversion window: 1 hour is enough for this click-to-download path.
4. Breakdowns that matter for launch reporting: `utm_source`, `utm_content`, `platform`, `cta_placement`.

Until the public key is filled in, events are only queued locally. Add `?analytics_debug=1` to a local URL to log event names and properties in the browser console (still without raw query strings).

## Manual checks

Serve the folder locally (any static server). Production GitHub Pages has no build.

```bash
npx --yes serve -p 4173
```

Then:

1. `http://127.0.0.1:4173/?analytics_debug=1` → one `landing_view` (`landing_path` `/`).
2. `http://127.0.0.1:4173/pricing/?analytics_debug=1` → one `landing_view` (`landing_path` `/pricing`). Same for `/buy/` and `/refund/`.
3. Reload a tracked page → a second `landing_view`. Console should not log two events from a single load.
4. `http://127.0.0.1:4173/?utm_source=instagram&utm_medium=organic_social&utm_campaign=launch_01&utm_content=launch01_product_02&analytics_debug=1` → properties include those UTM keys and not extra query params.
5. Repeat with `utm_source=facebook` and `utm_source=youtube`.
6. Click header, hero, how-it-works, and final CTA (Windows and Mac). Each click logs `start_free_click` then `download_started`.
7. Open `/pricing/` and `/buy/` plan buttons, and `/refund/` “Try Momentro free”.
8. After an Instagram landing **in the same tab**, go to `/pricing/` without UTM, then click download → first-touch UTM should still be Instagram. A **new tab** starts a new first-touch (v1 limit).
9. Disable `eu.i.posthog.com` / `eu-assets.i.posthog.com` in DevTools request blocking and click a CTA. The installer download still starts.
10. Desktop and a ~390px viewport: same events; header/hero buttons remain clickable.

## Tests

The site has no existing test runner. Node’s built-in runner covers the analytics module:

```bash
node --test tests/analytics.test.js
```

## Analytics Agent (`momentro-content-studio`)

Today `website_attribution` is `source_not_configured`. After this site is sending events, the agent still needs a **separate** change (not in this repo):

1. Store a PostHog **personal** API key only in content-studio credentials (never here).
2. Query PostHog HogQL / the query API for event counts grouped by `utm_source`, `utm_content`, and `platform`.
3. Map `landing_view` → sessions/visits, `start_free_click` → Start free, `download_started` → download initiated.
4. Treat `download_started` as “download initiated”, not “install completed”.

Example HogQL (run on the EU instance, with the server-side key):

```sql
SELECT
  event,
  properties.utm_source,
  properties.utm_content,
  properties.platform,
  count() AS n
FROM events
WHERE event IN ('landing_view', 'start_free_click', 'download_started')
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY 1, 2, 3, 4
```

## Known limits

- First-touch in `sessionStorage` is **tab-scoped** (v1). A new tab does not inherit the previous tab’s UTM.
- Cross-origin installer responses are not readable (CORS). `download_started` means “browser was sent to the installer URL”, not “bytes reached disk”.
- Cookieless mode stitches visitors with a daily server-side hash. Funnels work for a visit; they are not a durable user graph.
- Ad blockers that block PostHog will hide traffic; they must not break downloads. Download clicks delay briefly then assign the original installer URL. If analytics.js fails to load, the native `href` still starts the download.
- Raw Capture API beacons (`/i/v0/e/`) are not used. This cookieless project drops them, which is why early tests produced only SDK `landing_view` events.
- Empty `posthogProjectKey` means production will not receive events until you add the public key and enable cookieless mode in the PostHog project.
- Funnels and the query API live on PostHog’s free cloud tier for a site this size. Switching to Plausible would need their Business plan for funnels, custom properties, and the Stats API.
