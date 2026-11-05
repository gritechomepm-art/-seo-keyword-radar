# SEO Radar 2.0

A buildless keyword research workspace on the existing GitHub Pages URL:
https://gritechomepm-art.github.io/-seo-keyword-radar/

## What is included

- Warm white and sage UI, actionable overview, readable keyword tables, mobile cards and mobile navigation.
- Independent research pools with target country and language. Pools have separate keywords, competitors and reviews.
- Google Autocomplete collection from 1–5 seeds, adjustable modifiers, a 60-query cap, real progress, cancellation, partial failure reporting and preview before saving.
- Case/whitespace-normalized deduplication within each pool; the same term may belong to different pools.
- Manual candidate and competitor entry, review detail drawer, save-and-next and explicit review conflict resolution.
- Local `.xlsx` generation without a remote spreadsheet library. Exports include typed metrics, blank unknowns, provenance, reviews and a metadata sheet. JSON backup retains all local pools and pending edits.
- Existing Google Identity Services token flow and direct Sheets API access. No new OAuth client or origin is required when using the same deployed hostname.

No DataForSEO requests, automatic CPC/volume queries, automatic trend claims, automatic DR estimates, AI inference, paid API calls, or scheduled Sitemap collection are included in this release. Autocomplete suggestions are research leads, not verified search volume. Existing source metrics remain visibly unverified without provenance.

## Existing data and migration

The `seo_radar_v14_config` browser key remains unchanged. The previous `seo_radar_v14_cache` is read once into the national-parks pool; old storage is not deleted. This preserves existing cached data and pending reviews. Workspaces are namespaced by the two configured workbook IDs, so switching connections does not mix pending writes.

The national-parks pool continues to read original official rows from `Untitled`, using the existing park prefixes; its original candidate, competitor and review tabs are retained. `03_国家公园_正式关键词` is a formula result and is never written by this app.

New entries go into the selected pool's candidate sheet. Approving a candidate includes it in the app's official-keyword view; it does not append to or alter the formula result sheet.

## New pools and cloud schema

Click `＋` beside the pool selector, name the pool (for example `Power Bank — US`), select its market and language, then create it. Offline creation is local first. Upon Google connection, the app creates and registers three separate tabs in the configured keyword workbook:

- `词池_<generated-id>_关键词`
- `词池_<generated-id>_竞品`
- `词池_<generated-id>_审核`

`05_关键词词池` stores the registry, enabling discovery from another browser after authorization. The workbook IDs themselves are entered by the user and are never embedded in this repository.

Keyword rows retain the original A–N layout. O–V add market, language, metric provenance/date, monthly values, trend and DR provenance/date. When an existing candidate sheet has only 14 columns, the app expands its column count on the first user-initiated candidate save, adds O–V headers, and preserves A–N. If O–V contain conflicting custom headers, it stops the write and retains the local queue.

All values are written using `RAW`; formulas are not injected. Before writing reviews, cloud timestamps are compared with the original local base timestamp. Conflicts remain queued until the user explicitly selects a version. Failed writes remain queued and are never presented as completed cloud writes.

## Power Bank workflow

1. Create `Power Bank — US`, country `US`, language `en`.
2. Open `采集关键词`; enter `power bank`, `portable charger`, or `laptop power bank`, one seed per line.
3. Choose a modifier preset or edit it. Start collection and inspect returned suggestions.
4. Select relevant results and save to the candidate pool. Unknown volume, CPC, Ads and DR remain blank; trend remains `待核验`.
5. Connect Google to sync, inspect each keyword in the review drawer, and record evidence and decisions.
6. Export the selected pool or current filtered results to Excel. Use JSON for local recovery, including pending writes.

Collection uses a JSONP callback supported by the public Google suggestion endpoint. No Apps Script bridge or server-side credential is required. Service availability depends on the user's network and Google's response. Errors, timeouts and partial runs are shown separately from successful empty responses. This endpoint is not a guaranteed keyword-metrics service.

## OAuth setup

Reuse the existing Web application OAuth client. Enable Google Sheets API in its Google Cloud project, add `https://gritechomepm-art.github.io` as an authorized JavaScript origin (no repository path), and include the user's Google account as a test user when the app is in Testing.

On `连接与备份`, save the Client ID and the existing keyword and national-parks competitor workbook IDs. The token scope is `https://www.googleapis.com/auth/spreadsheets`. Tokens are held in page memory only. Reopening the page or expiration requires another `连接 Google` action. No client secret, access token, or private workbook data belongs in source control.

## Verification

```text
node --check app.js
node --check radar-core.js
node --check radar-sheets.js
node --check xlsx-export.js
node --test tests/research.test.cjs
python tests/excel-roundtrip.py
```

The Python round-trip check requires `openpyxl==3.1.5`. Source CI runs these checks without uploading any GitHub artifacts. Browser QA uses the managed preview workflow, after `python scripts/prepare-preview.py`; the generated `dist/` and `.openai/` files are not committed.

See `docs/QA_V2.md` for the scope and limits of validation. The UI screenshot contains only an isolated local test pool and public suggestions, not private Sheets data.


## Plugin keyword import

In `采集关键词`, paste SiteData/AITDK Top Keywords and supply the competitor URL and collection date. The selected pool supplies market and language; match these to the plugin's filters. Labelled inline or multiline records and tab-separated tables with named headers are supported. Unlabelled numeric layouts are warned about rather than guessed. Limits: 100,000 characters / 500 parsed records.

Click `解析预览` before `确认导入所选新词`. Preview does not write candidates. Changing inputs, connection or pool invalidates the preview. Existing and within-batch duplicate keywords are skipped without overwriting research. The existing pending queue syncs confirmed candidates using RAW Sheets writes; offline items are explicitly local until synchronization succeeds. Sources, dates and metrics use the existing A–V schema.

K/M values are expanded, missing values remain blank, and explicit zero stays zero. Imported metrics remain labelled as plugin estimates. DR stays blank and trend stays `待核验`. Commercial screening uses Volume >= 1,000 AND (CPC >= $0.30 OR Ads >= 1). Missing required metrics produce `指标待补齐`; a pass is a research lead, never automatic approval. The keyword library offers a commercial-pass filter. Use the review drawer's market SERP and Trends links, then record the top-five competitor URLs, minimum DR with tool/date, trend period/source, search intent and content gaps in the existing evidence field.

Validation for this change: 13 Node data/parser/Sheets mock tests, JavaScript syntax checks and Excel round-trip passed. A real browser run could not start because this environment has no installed Chromium executable. Private Google authorization and live Sheets writes were not exercised.

## Affiliate promotions (November 2026)

The **推广链接配置** view is separate from keyword discovery. It stores the source/competitor evidence URL, existing PARKMEMOIR landing page, product brand/model, official merchant URL, actual PartnerBoost tracking URL, channel-specific UID, known commission, verification date, expiration and status. These are deliberately different fields.

- The `06_推广链接配置` tab in the existing keyword workbook is the sync target; initial seed rows are RIVONOVA 20L cooler backpack, Anker SOLIX C1000 Gen 2 and Vantrue N4 Pro S.
- The prior confirmed RIVONOVA URL is `https://pboost.me/I6puEkFE?uid=pm_winter_gear_cooler`; it must **not** be shown as a 12V compressor vehicle refrigerator.
- Anker and Vantrue have brand enrollment approval, but product-level tracking URLs and commission eligibility still require authenticated verification in PartnerBoost. Official merchant URLs are deliberately **not** tracked links.
- Users can paste an existing PB product-specific tracking URL and append the campaign UID; the result remains **待验证** until the destination and eligible SKU are checked. UID mismatch prevents saving a tracked-link row.
- Rows are local-first and preserved in full JSON backups. Google sync writes RAW cells. Cloud timestamps prevent silent overwrite from another browser; conflicting edits remain pending. CSV export is available.
- No paid Ads, new landing page, API secrets or auto-publication are introduced.

Validation includes six promotion tests plus the existing keyword/Sheets and Excel checks; GitHub Actions does not upload an artifact on success. Browser OAuth, real deep-link commission attribution and production deployment are separate acceptance gates.
