# Momentro Guides Publishing Notes

This folder is the publishing foundation for Momentro Guides.

## Current live-safe structure

- Hub page: `/guides/index.html`
- Reusable article scaffold: `/guides/_template/index.html`

## Approved public initial set (2026-10-08)

The approved public launch set is exactly:

- `https://momentro.me/guides/`
- `https://momentro.me/guides/organize-family-videos/`
- `https://momentro.me/guides/family-vacation-video-from-phone-clips/`
- `https://momentro.me/guides/travel-footage-to-film-without-pro-editing/`
- `https://momentro.me/guides/family-video-people-rewatch/`

## How to publish a new guide safely

1. Create a new folder under `/guides/` using a simple slug, for example `/guides/organize-family-footage/`.
2. Copy `/guides/_template/index.html` into that folder as `index.html`.
3. Replace **all** placeholders like `[ARTICLE_TITLE]`, `[ARTICLE_SLUG]`, `[ARTICLE_META_DESCRIPTION]`, `[YYYY-MM-DD]`, and `[CLUSTER_NAME]`.
4. In the article body, keep the internal-link pattern:
   - one link back to `/guides/`
   - one link to a same-cluster guide
   - one link to a different cluster guide
5. Use only claims that are true for Momentro today. Do not add invented stats, fabricated reviews, or unsupported product features.
6. Keep download links unchanged:
   - `https://download.momentro.me/windows/latest`
   - `https://download.momentro.me/macos/latest`

## Add guides to sitemap at launch

Only the approved public set above may appear in `/sitemap.xml`.

For all other draft articles, keep `<meta name="robots" content="noindex, nofollow" />` in the article `<head>`. Do not add any future guide URLs to `/sitemap.xml` before explicit approval.

1. Open `/sitemap.xml`.
2. Add one `<url>` entry for `/guides/` and one for each published article URL.
3. Keep only URLs that actually exist in the repo.
4. Update `<lastmod>` for the changed pages.

## Quick local checks (no server needed)

- Validate HTML parse:
  - `python3 -c "from html.parser import HTMLParser; HTMLParser().feed(open('guides/index.html', encoding='utf-8').read()); HTMLParser().feed(open('guides/_template/index.html', encoding='utf-8').read())"`
- Validate sitemap XML:
  - `python3 -c "import xml.etree.ElementTree as ET; ET.parse('sitemap.xml')"`

## Launch checklist (final pre-publish pass)

1. Final editorial review
   - Confirm all claims are accurate for current product behavior.
   - Keep language realistic about desktop processing time and review steps.
2. Noindex removal only for launch-approved pages
   - Keep drafts as `noindex, nofollow`.
   - Remove noindex only for pages explicitly approved to go live now.
3. Sitemap entries must be real public URLs only
   - Add only guide URLs that exist and are intended to be publicly indexable.
   - Do not include draft URLs or placeholder slugs.
4. Technical QA before publishing
   - Verify title, meta description, canonical, internal links, and HTTP status behavior.
   - Confirm links point to valid pages and expected download URLs.
5. Structured data validation
   - Validate `Article` and `BreadcrumbList` JSON-LD for each approved page.
   - Ensure visible page content matches structured data fields.
6. Search Console submission and monitoring
   - Submit updated sitemap after launch deployment.
   - Monitor impressions, clicks, and query patterns by page cluster.

## SEO policy reminder

- Do **not** add meta keywords tags. Google ignores meta keywords, and adding them provides no ranking benefit.
