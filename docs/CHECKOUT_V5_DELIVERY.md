# KHAGA v5 checkout update — upload instructions

## Status
The checkout implementation is prepared locally. GitHub blocked a publishing tool
request before a release commit or PR was created. Main remains at
53bfa6e5810fe1121ea178a7a82e0fa25dd009f0. This package is the manual review/upload
fallback; it has NOT been deployed.

## This is an UPDATE, not a standalone website
Overlay ALL files and folders from this ZIP at the ROOT of the existing
MindSync-25/Khaga repository. Preserve all other files. Do not delete the repository,
replace it with only this subset, or create an additional enclosing directory.
Existing server.mjs, management diagnostics, base assets and logo are deliberately
not included: they remain from the current main branch.

Use one commit for the entire update. A review branch/PR is preferred. If your
GitHub upload targets main, committing may trigger Hostinger deployment.

## Keep payments off during this upload
Do not add CHECKOUT_MODE, CATALOG_DRIVER or ADMIN_ENABLED yet. Keep the existing
saved credentials private in Hostinger. Uploading this update alone does not enable
checkout, connect the database, run SQL, modify product data or charge anyone.
Keep the same Hostinger Node/Other/build/server.mjs settings. No DNS changes.

A deployed default preview reports version 0.5.0 at /health. This proves only the
new server is running, NOT that payment integration or order persistence works.

## Before the private payment test
The remaining Supabase embedded-whitespace/key-authentication issue must be resolved
and the existing KHAGA_SETUP_CHECK must pass. Then apply the included migration
002_test_checkout.sql in the dedicated KHAGA database. Follow CHECKOUT_V5.md for
activating the owner-only TEST flow and running a full payment/persistence test.
The SQL migration has not been run against a real PostgreSQL/Supabase instance here.

Only the signed-in owner may test checkout in this release. Real customer checkout,
live keys and real-money transactions remain disabled. This is not a launch-ready
live store. Do not merely swap to live keys or remove the mode guard.

## Validation scope
112 local Node tests passed (84 available v4 storefront/admin tests + 28 new checkout
tests); build passed. Relevant latest-main dependencies were verified by Git blob
hash before use. Later diagnostic test files from main were not all present in the
local v4 archive and their full suite was NOT rerun. Preserve those files on upload.
15 offline Chromium layout/interaction checks passed. Provider calls, browser
storage/fetch and the payment widget were mocked. Native network/cookie/CSP behavior,
real Razorpay Test-mode transactions, live Supabase grants/RPCs, Hostinger and
physical-device checks remain unverified. No credentials were accessed.

The screenshot assets are local test previews, not evidence of a hosted deployment.
