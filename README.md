# CashManage

Private cashbooks for web and mobile, with encrypted offline storage and an Express/SQLite account server. The existing local database is preserved. No bank transactions or actual payments are executed by this app.

## Run locally

Use Node 22.14 or newer and a maintained Node LTS release for production.

```powershell
cd client
npm ci
npm run build
cd ../server
npm ci
$env:APP_ORIGIN='http://localhost:3000'
npm start
```

Open http://localhost:3000. For development run `npm run dev` in both folders and use http://localhost:5173, with APP_ORIGIN unset or set to that URL. Vite proxies /api to port 3000. The production server serves both the frontend and API.

On this machine the npm wrapper points to a missing file. If `npm` fails, replace it with `node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js'`.

## Workspace features

| Area | Features |
| --- | --- |
| Overview / Transactions | Currency-separated balances, income in green, expenses in red, descriptions/categories, people/due dates, cashbook/type/date/search filters, edit and delete |
| Cashbooks | Personal, shopping, savings, borrowed and lent purposes, fixed currency per book, monthly expense budget |
| Planning | Paired wallet transfers (including actual received amounts for different currencies), recurring schedules, debt principal and partial repayments, overdue balances, savings targets and contribution progress, budget alerts, monthly comparisons |
| Import & history | CSV bank statement import with column mapping and preview; legacy JSON import; duplicate checks; per-row validation; recent activity and transaction undo |
| Receipts | JPEG, PNG and PDF attachments stored inside the encrypted vault; download/remove; 300 KB each and 1 MB of active attachments total |
| Reports | Filtered downloadable multi-page PDF statements, browser Print / Save as PDF, CSV export, cash-flow bars and category spending |
| Shared | Separate encrypted shared books with owner/editor/viewer access enforced by the server |
| Settings | Editable profile, base currency preference, dark/light theme, inactivity timeout, sessions, MFA, recovery keys, password changes, backups, indicative currency rates |

Transfers affect cashbook balances but are excluded from income, spending, category totals and budget alerts. Deleting a transfer removes both sides. Linked debt entries are managed through Planning and can be undone through history, preserving consistency.

Recurring schedules support weekly, monthly and yearly dates. Month-end schedules keep their original anchor (January 31 → February 28/29 → March 31). Due entries post once while the unlocked app is running. The app checks every 10 seconds; it does not post in the background while closed. Paused schedules catch up from their next date when resumed. Catch-up batches are bounded.

Savings contributions earmark progress; they do not transfer or spend wallet cash. Budget alerts appear in-app at 80% and above; they are not push/email notifications. Debt repayments are cashbook records, not real payments.

History retains up to 200 events and trims older events to keep encrypted backups within storage limits. Undo refuses to overwrite a transaction changed later. Undo repayments before undoing their original debt. This is recoverable local history, not an immutable audit ledger. Attachments may reduce retained history due to storage limits. OCR extraction is not included.

## Offline, sync and conflicts

Load the production build online once, allowing the service worker to cache all application assets. Sign in online once to save an encrypted account copy. Later choose Offline unlock with the same username/password. Offline edits are encrypted locally. Guest data is memory-only and disappears on reload/lock: download an encrypted backup before leaving.

While unlocked and online, the app attempts synchronization every 10 seconds. The Sync button remains available. Revisions prevent silent last-write-wins overwrites. A stale revision opens a conflict review showing local and cloud differences. Export the device backup, select each version to keep, and save the resolution. Entries present on only one side are retained by default; deleted transactions require an explicit Delete selection. Both sides of a transfer and related debt entries must remain consistent. Validation occurs before changing the saved revision. A further remote edit causes another conflict instead of being overwritten.

Opening multiple tabs is detected: if another tab updates the local vault, this tab locks so it cannot keep editing stale data. Removing a saved local copy loses unsynced changes, so export or sync first.

Online session revocation cannot erase an existing offline copy. After a password change on another device, preserve an old offline copy with its original password before removing it and signing in again. Old backups stay encrypted with their original password.

## Security and recovery

- Account vaults and backups use AES-256-GCM with PBKDF2-SHA256 (600,000 iterations). Authentication uses a separate derived proof, hashed with server-side scrypt. Decryption keys are in memory while unlocked; raw keys are not stored unencrypted.
- HttpOnly SameSite cookies, 24-hour sessions, origin checks on mutations, security headers, body limits and authentication/security endpoint rate limiting are enabled.
- Settings → Account protection → Set up authenticator: add the displayed setup key to an authenticator app as a 6-digit, 30-second TOTP, then verify. Login requires a fresh code. Used codes cannot be replayed. Enabling MFA revokes other sessions. MFA protects online authentication, not password-based offline access.
- Generate a recovery-key file after signing in. A random 256-bit recovery key wraps the account encryption key; the server stores a hash of its proof and the encrypted wrapper. The key can decrypt the latest synced vault and reset the password/MFA. Keep the downloaded file offline and private.
- Recover account with recovery key is available from the login screen. Successful recovery rotates encryption/password credentials, revokes sessions, and clears MFA and the old recovery key. Re-enable MFA and generate a new key afterward.
- Changing a password requires the current password and MFA if enabled, requires a clean synced revision, re-encrypts the vault, revokes sessions and invalidates the recovery key. Generate a new recovery key afterward.
- MFA seeds are encrypted at rest using a randomly generated server key stored in `server/.mfa-key` (or MFA_KEY_PATH). Back up this key securely with the database and keep it out of Git. Losing it prevents verification of existing MFA seeds; recovery keys remain a separate recovery path.

Encryption protects stored data, not data displayed in an unlocked or compromised browser. Account registration is open; rate limits are process-local and reset on restart. Add durable abuse controls and deployment monitoring before a public rollout. Dependency audits and automated tests are not a penetration test or security certification.

## Shared cashbooks

Shared books are separate from private wallets. Create a shared book with a distinct passphrase, then add existing account usernames as viewer/editor. Owners manage membership; viewers can read but cannot write; editors can add entries. Updates use revisions to reject simultaneous overwrites. Reload/unlock the shared book after a conflict.

Share the passphrase with members through your own trusted channel. The application does not send invitations or messages. Book contents are encrypted; book names and membership metadata are visible to the server. Removing a member blocks future server access but cannot erase downloaded copies or make that member forget the passphrase. Choose the shared currency when creating the book. Shared books require an online session; they do not have private-vault offline editing or automatic key distribution.

## Imports and reports

CSV supports a single amount column (positive income/negative expense when direction is absent) and an optional direction column using income/credit/in or expense/outcome/debit/out. Date format is YYYY-MM-DD. Map bank-specific column headers in the preview. Separate debit/credit columns should first be combined into a signed amount column. Invalid rows are reported and skipped; review the preview before importing valid entries. Duplicate matching uses book/date/type/amount/description; identical legitimate entries need manual review.

For legacy data, run `node export-legacy.js ../legacy-transactions.json` from server. Import that file in Import & history and choose the destination currency/book. This export is plaintext: store it privately. Original shared records have no owner and are not automatically assigned to new accounts.

Reports use the selected cashbook, currency, direction, search and date range. For a previous month or year choose custom start/end dates. Direct PDF uses a built-in Latin font; for Sinhala, Tamil and other scripts use Print → Save as PDF to preserve browser-rendered text. CSV transfer rows are identified and cannot be imported as ordinary cash flow: recreate those through Planning. PDF/CSV exports are plaintext.

## Google Drive setup

1. Create a Google Cloud project; enable Drive API; configure the OAuth consent screen and test users as needed.
2. Create a Web application OAuth client. Add the exact app origin as an authorized JavaScript origin (e.g. http://localhost:3000 and the HTTPS production origin).
3. Copy client/.env.example to client/.env, set VITE_GOOGLE_CLIENT_ID and rebuild.
4. Settings → Back up to Google Drive requests only `drive.appdata`. Tokens stay in memory. Each backup is a separate encrypted file; restore selects the latest app-data backup and requires its original password.

Live Google authorization/upload/restore requires your configured Google project and consent. It has not been verified against a real Google account here. See https://developers.google.com/workspace/drive/api/guides/appdata. Currency rates come from https://frankfurter.dev/, with reference dates and cached offline results; rates may be delayed and some currencies unavailable.

## Deployment

Build client/dist and run the server behind HTTPS on the same origin. Set NODE_ENV=production, APP_ORIGIN to the exact HTTPS origin, and optionally PORT, DB_PATH and MFA_KEY_PATH. Persist the SQLite database and MFA encryption key. Use a consistent SQLite backup process; do not run independently replicated SQLite copies. Secure cookies, installation and offline support require HTTPS (localhost is allowed during development).

The server does not trust forwarded IP headers by default. Configure trusted proxies narrowly if deploying behind a reverse proxy; otherwise users share the proxy's authentication rate limit. Restrict direct external access to the Node port.

Mobile support is an installable responsive PWA, not an Android/iOS store binary. No cloud resources have been provisioned and the project is not publicly hosted. Device installation and live Google OAuth still need environment-specific testing.

## Verification

```powershell
cd client
npm run build
npm run lint
npm test
npm audit
cd ../server
npm test
npm audit
```

Tests cover encryption/tampering, currency precision, balanced transfers, recurrence idempotency/month-end behavior, repayment limits, undo conflicts, CSV errors/duplicates, merge selections, budgets, PDF pagination, private account isolation, TOTP reference vectors/replay protection, recovery/key rotation, session revocation and shared role enforcement. Server tests use isolated in-memory databases. Browser smoke checks exercise the guest UI; real multi-device installation and Google integration are separate deployment checks.
