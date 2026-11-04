# SEO Radar 2.0 verification

## Automated checks

- JavaScript syntax checks: app, core, Sheets adapter and XLSX writer.
- Ten Node tests: v1 cache migration; independent pool reviews; normalized duplicate handling; zero versus missing metrics; original park filtering; idempotent pool registration; candidate-only writes and protected formula output; conflict retention; partial write failures; unauthorized retry stop; custom-column preservation; market parameters and query limits; lost-acknowledgement review retry.
- Real XLSX bytes reopened with openpyxl: worksheets, headers, numbers, unknown blanks, Unicode, literal formula-like text, styles, frozen header and filter range.

## Browser checks on isolated local preview

- New Power Bank / US / English pool creation without cloud credentials.
- Actual Google Autocomplete request for `power bank`: 10 suggestions returned; progress finished 1/1 with no failures.
- Unselected two irrelevant suggestions; saved the remaining eight as local candidates.
- All unknown volume/CPC/DR values remained blank and displayed as em dashes, with no invented trend.
- Opened camping keyword details, recorded a test-only review, saved and continued to the next keyword.
- Switched to national-parks pool: no Power Bank records appeared there.
- Switched back and refreshed: eight candidates and the pending review survived (nine queued operations).
- 390px iframe viewport (375px content width after scrollbar): no document-level horizontal overflow; compact keyword cards and the mobile connection-settings entry worked.
- Excel export click reached the expected UI completion message. The cloud browser's download event did not yield a file path; download completion in that browser is not claimed. XLSX file structure and contents were independently verified by the automated round-trip test.

## Limits

The preview browser was not signed in to the user's Google account. Live OAuth and real private Sheets writes were not performed during QA. Those paths are covered by the mock Sheets integration tests; existing user-side OAuth settings, origin and scope are preserved. No private workbook data or credentials were published. No paid API was called.
