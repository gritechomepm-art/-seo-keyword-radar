# SEO Keyword Radar · Deployment status

Updated: 2026-11-04

## Verified
- Repository: https://github.com/gritechomepm-art/-seo-keyword-radar
- Branch: `main`
- Files committed and read back: `index.html`, `app.js`, `styles.css`, `README.md`, `.nojekyll`, `.gitignore`
- Data stored in GitHub: **application code only**, no private Sheets data, tokens or credentials
- GitHub repository visibility: **PRIVATE** (last verified 2026-11-04)
- Frontend uses Google Identity Services + Google Sheets API, not Apps Script HTML Service
- Previous build mock tests: code syntax, mock sync and mock writes passed

## Not completed
- Pages publishing source has not been enabled/verified in repository settings.
- Private-repository GitHub Pages eligibility depends on the GitHub plan; on GitHub Free, the repository must be **Public**.
- OAuth Web Client ID, authorized JS origin and Google Sheets API setup not verified.
- Actual browser OAuth and live Sheets read/write verification not complete.
- Live Pages URL is not yet confirmed.

## Required operator steps
1. If on GitHub Free, review files and change repository to Public at Settings > General > Danger Zone > Change visibility.
2. Enable GitHub Pages at Settings > Pages > Deploy from branch > `main` > `/(root)`.
3. In Google Cloud enable Sheets API; create an OAuth web client; set origin `https://gritechomepm-art.github.io`, and configure test users if applicable.
4. Open the actual Pages URL shown in GitHub settings, enter OAuth Client ID and both private Spreadsheet IDs, and grant access.
5. Verify 16 official keywords, 9 candidates, 3 competitors; add one test candidate and one review; ensure Sheets reflects both changes.
