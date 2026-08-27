/**
 * Public analytics config for the Momentro landing site.
 *
 * posthogProjectKey is the Project API Key (phc_…). It is designed to be public.
 * Never put a Personal API Key, admin key, or other secret here.
 *
 * The ingest host is pinned to PostHog Cloud EU in analytics.js. Do not change
 * posthogApiHost to a US endpoint; US hosts are ignored at runtime.
 */
window.MOMENTRO_ANALYTICS = {
  // Paste the public Project API Key (phc_…) between these quotes:
  posthogProjectKey: "phc_uRfPUZKMc7V76Y9VvcHHp6nR8fvieku2NbVKV4gAwBvK",
  posthogApiHost: "https://eu.i.posthog.com",
  debug: false
};
