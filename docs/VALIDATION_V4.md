# KHAGA 0.4.0 validation — phase 1 only

Baseline: `MindSync-25/Khaga` main `0ff642e2b61f36a8e9492ebe65cdc315d1131416`.

## Actually executed

Environment: Node 22.16.0, npm 10.9.2; built-in experimental node:sqlite. No npm runtime dependencies added. Validation recorded 2026-09-27.

`npm run check`: **84 Node tests passed**, browser bundle syntax check passed, build validated the original seven concept products/colours/views and required local assets.

This includes actual local HTTP requests to the Node server and a real file-backed SQLite database. Tests cover owner login/logout, cookie attributes, password verification, CSRF/Origin/sibling-site rejection, credential rotation, persistent login limits, product validation, draft/public isolation, immutable ids, edit conflicts, publish/unpublish, restart/reopen persistence, image ownership, PNG validation/normalization, private/public media delivery, public rendering, original branding hashes and the server-side checkout lock.

Additional coverage:
- New unpublished IDs do not leak in public catalogue version data; draft-only edits do not alter that public version.
- Storage transactions reject conflicting published colour definitions, even below the service validation layer.
- Nonzero paise remain visible in storefront prices.
- The login form uses POST, not a password-bearing GET fallback, and remains disabled until its script initializes.
- Supabase adapter **mocked contract tests** check server-only apikey headers, fixed HTTPS destination behaviour, private bucket checks and storage errors.
- SQL grants/revokes are **static checks only**, not real PostgreSQL/RLS verification.

## Browser checks

Browser HTTP navigation is administratively blocked in this execution environment. It was not bypassed. Separate offline Chromium runs execute the actual built scripts and templates:

1. `scripts/browser-qa-v4.py`: **29 storefront interaction/layout checks passed**. Assets are embedded and same-origin History/storage adapters are simulated. Real local Node HTTP responses are fetched outside the browser to prepare fixtures. Navigation, filtering/sorting/search, colour/size/view retention, bag operations, image enlargement, menus, keyboard controls and widths 360/390/768/1440 were exercised.
2. `scripts/admin-browser-qa.py`: **22 admin UI checks passed** with explicit fake API fixtures and all real network blocked. Tested failed/successful login, catalogue/editor, draft save, publishing confirmation/cancel, actual browser canvas image normalization, gallery ordering, size/availability edits, conflict feedback, unsaved-change warning, unpublish, new draft, audit/logout and widths 390/768/1440. No unhandled browser exceptions.

An initial admin browser test found a global `top` name collision. It was fixed by isolating the script and renaming the function, then the complete run passed. A test harness navigation assumption was also corrected; the UI's Add product button is on the catalogue page.

Screenshots were inspected. They use **test fixtures**, not a configured Supabase deployment or real customer data.

## Preserved assets

Git blob hashes:
- `public/brand/khaga-master.svg`: `e34f7409f460673c43389bd4a67e15382f71a909`
- `src/artwork.mjs`: `f732b58e8a9d28125c997747a2316be15bf35e13`

No city/location, substitute logo or new garment design was introduced. Slavant hosting/DNS and production credentials were not modified.

## Not verified / not implemented

- No real Supabase database or bucket was created. The migration has not been executed against PostgreSQL here. Secret-key permissions, RLS, RPC concurrency and real Storage behaviour require the production checklist in ADMIN_V4.md.
- No Hostinger deployment, native HTTPS/session-cookie, Safari or physical-mobile test was completed here.
- No live payments, Razorpay test transaction, order database, customer notification, inventory reservation, tax engine or courier integration. These are later phases.
- No automated asset cleanup or backup/restore drill. Detaching does not delete originals. Old/failed uploads consume storage until reviewed cleanup.
- Availability fields are saved planning records, not purchase enforcement. The whole site is still a preview.

## Reproduce

```sh
npm ci
npm run check
# With a local preview server already running, Python requests/Playwright and Chromium:
KHAGA_TEST_URL=http://127.0.0.1:3000 KHAGA_QA_OUTPUT=/tmp/khaga-store-qa python scripts/browser-qa-v4.py
KHAGA_QA_OUTPUT=/tmp/khaga-admin-qa python scripts/admin-browser-qa.py
```

Python browser scripts are development diagnostics, not Hostinger build dependencies.
The production acceptance checklist is intentionally separate from these test results.

## Publication status of this delivery

The GitHub connector accepted some unreferenced tree objects, then blocked the admin JavaScript upload because it could not determine the request's safety status. No alternative write route was attempted after that block. No release commit or branch update was published. Main was rechecked and is still `0ff642e2b61f36a8e9492ebe65cdc315d1131416`.

The complete source is supplied as `KHAGA-website-v4-admin-catalogue.zip`; partial staging trees must not be deployed. Upload the complete project contents together, preserving folders. This package includes the generated browser bundle as a convenience; it is regenerated on build/start and ignored by Git.

Default deployment (`CATALOG_DRIVER=preview`, `ADMIN_ENABLED=false`) remains a read-only storefront. It is not proof of working management persistence. Configure and verify the external store before enabling the admin.
