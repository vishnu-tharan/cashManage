# CashManage

A responsive React / Vite cashbook app with an Express / SQLite account server. The original database is preserved. The old unauthenticated transaction routes are no longer exposed.

## Run

Use Node 22.14 or newer (a maintained Node LTS release is recommended).

```powershell
cd client
npm install
npm run build
cd ../server
npm install
$env:APP_ORIGIN='http://localhost:3000'
npm start
```

Open http://localhost:3000. For development, run `npm run dev` in both folders; use http://localhost:5173 and leave APP_ORIGIN unset (or set it to that URL). Vite proxies /api to port 3000.

On this machine the npm PowerShell wrapper points to a missing file. If `npm` fails, substitute `node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js'` for `npm`.

## Features

- Unique case-insensitive usernames, sign-in, guest workspace and editable display name/default currency.
- AES-256-GCM encrypted account vaults and backups, PBKDF2-SHA256 with 600,000 iterations, separately derived authentication proof, server-side scrypt hashing.
- HttpOnly SameSite cookies, 24-hour server sessions, configurable local inactivity lock, list/revoke all online sessions, remove local copies.
- Personal, shopping, savings, borrowed and lent cashbooks, independent currencies and monthly expense budgets.
- Income in green; expenses in red. Edit/delete entries, categories, description, people and due dates.
- Currency-separated balances, cash flow bars, category spending, search and type/cashbook/date filters.
- Month, year, all-time and custom date reports. For another month/year, use custom start/end dates. PDF / print uses the browser's Save as PDF destination. CSV export respects the same filters.
- Encrypted download/restore and Google Drive app-data backups.
- Indicative Frankfurter rates with dated offline cache; missing currencies produce a clear error instead of an invented rate.
- Responsive light/dark design and installable PWA shell. This is a mobile web app, not an Android/iOS store binary.

## Offline and syncing

Load the production build online once so the service worker can cache its shell. Sign in online once to save an encrypted account copy on that device. Later choose Offline unlock using the same username/password. Account edits save encrypted on the device; press Sync when connected. Sync is explicit, not automatic background syncing. Guest data is only in memory and disappears on reload or lock: export a password-protected backup before leaving.

Revisions prevent silent overwrites when two devices edit the account. If Sync reports a conflict, first export the device backup. Then remove the local vault, sign in online to load the current server copy and reconcile your changes. Restore replaces the whole vault; there is no automatic transaction merge.

Offline device copies cannot be remotely erased or revoked. Signing out all sessions revokes server access. A user with the password and an existing offline copy can still decrypt it. No password reset/recovery or password rotation UI is implemented; keep passwords and backups safe.

## Google Drive setup

1. Create a Google Cloud project, enable the Google Drive API, configure the OAuth consent screen and add test users if the app is in testing.
2. Create an OAuth client of type Web application. Add the exact app origin (e.g. http://localhost:3000 and your HTTPS production origin) as an authorized JavaScript origin.
3. Copy `client/.env.example` to `client/.env`, set VITE_GOOGLE_CLIENT_ID, then rebuild the client.
4. Settings → Back up to Google Drive opens Google's consent flow. Only the `drive.appdata` scope is requested. Tokens stay in memory and are not persisted. Each backup creates a new encrypted file. Restore selects the latest app-data backup, which requires its original encryption password.

Live OAuth upload/restore requires your configured Google project and consent; it has not been tested against a real account here.

References: https://developers.google.com/workspace/drive/api/guides/appdata and https://frankfurter.dev/.

## Deploy online

Build client/dist, run the server behind an HTTPS reverse proxy and mount persistent storage for SQLite. Set NODE_ENV=production and APP_ORIGIN to your exact HTTPS origin; optionally set PORT and DB_PATH. The server serves the client and API from the same origin. Configure the proxy to reject direct external access to the Node port. The app does not trust forwarded IP headers by default; configure proxy trust narrowly before using proxy-derived client IP rate limits. In the default setup users behind one proxy share its authentication rate limit.

HTTPS is required for secure production cookies, Web Crypto and install/offline support (localhost is allowed for development). Do not deploy SQLite on ephemeral storage or use several independently replicated SQLite instances. Back up the database using a consistent SQLite backup process. The app is not yet hosted and no cloud resources have been created.

## Existing data

The original `server/cashmanage.db` and its transactions table are kept intact. Existing rows were shared and have no reliable owner. They are deliberately not assigned to a newly registered user. Export them locally with `node export-legacy.js ../legacy-transactions.json` from server; this creates a plaintext JSON archive, so store it privately. Import/reconciliation of these legacy records into a private cashbook is not automated.

## Verification and boundaries

```powershell
cd client
npm run build
npm run lint
npm test
cd ../server
npm test
npm audit
```

Security tests use an in-memory database and cover unauthenticated access, cross-origin rejection, duplicate names, wrong credentials, account isolation, malformed vaults, stale revision rejection and session revocation. Crypto tests cover roundtrip restore, wrong passwords and ciphertext tampering. Dependency audit reports zero known vulnerabilities at implementation time; this is not a security certification or penetration test.

Keep browser extensions and devices trusted: encryption protects stored data, not data displayed in an unlocked browser. Printed/CSV reports are plaintext. Account registration is open and rate limits are in-memory; add production monitoring, durable rate limiting and an account lifecycle policy before a public rollout. No bank connections, recurring posting, transfers, MFA, immutable audit ledger, password recovery, native store packaging or automatic conflict merge is claimed.

Browser smoke checks also verified guest transaction totals, the dark mobile layout, and reopening the cached app shell with the server stopped. Offline encrypted editing is covered at the crypto/storage level; real-device installation and live Google OAuth still require end-to-end testing.
