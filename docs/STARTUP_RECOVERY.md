# KHAGA startup recovery patch (on v0.4.0)

## Why this patch
The reported crashes occurred before any database request: the original configuration parser required exact values and conflated missing/malformed/provider-key types. Independently, server startup awaited all admin and storage checks before binding a port. A database SQL status query cannot diagnose those original errors.

## Changes
- Trim outer whitespace in settings. Normalize the case of driver and boolean flags. Unknown values still fail with field-specific, value-free guidance; they are never silently changed into preview mode.
- Report independent configuration problems together, with separate missing-key, wrong-key-type, malformed-key and owner-hash diagnostics. Provider tokens stay server-only and are validated by the provider; a plausible token format is not proof of a valid key.
- Bind the HTTP listener before management initialization. If only owner login settings fail but persistent storage is healthy, serve the actual published catalogue with admin disabled. Do not seed or import products automatically.
- If persistent storage or its connection configuration fails, return controlled HTTP 503 maintenance responses, not a crash loop or a fake seeded catalogue. `/health` reports degraded in this state.
- Preserve optional preview authentication in maintenance responses. No secrets, hashes, provider response bodies or stack traces are returned to visitors. Checkout remains 403 and private originals are not served from maintenance mode.
- Add `npm run admin:check`: validates the staged owner/storage configuration and performs the existing schema-status RPC and private-bucket GET. This does not toggle application flags, run migrations, write records, upload images or publish anything. The command must run in a trusted operator environment with the same securely supplied variables as Hostinger, not with secrets passed as arguments or posted in chat. It reports sanitized failures even when the live site remains in preview. A pass is not proof of login, write permissions, backups or persistence across redeployment.
- Provider failures distinguish HTTP 401, 403, 404, 429, network errors, schema checks and bucket checks without logging the raw key or response payload.

## Validation actually completed
`npm run check`: 109 Node tests passed and build passed. This includes the existing 84 tests and 25 new configuration/startup/HTTP regression tests. New tests cover whitespace, invalid settings, multi-field errors, redaction, staged read-only preflight, Supabase error classification, private bucket checks, recovery authentication, actual local HTTP responses and pending startup.

Supabase responses in the new tests are controlled stubs; healthy published-catalogue startup tests use a fake empty repository. Existing suite tests use local SQLite. No real Hostinger variables or production Supabase secrets were accessed, and no production database checks were executed. No new browser or real-device tests were performed for this backend-only patch.

All product artwork, master logo, CSS, views and generated browser bundle are byte-for-byte unchanged from the v4 baseline. No DNS, hosting plan, existing Slavant site or database content is changed by the patch.

## Release precautions
Prepare as a separate branch/PR; do not update main or trigger production deployment during preparation. Keep CATALOG_DRIVER and ADMIN_ENABLED absent on the currently restored preview until this patch is reviewed and readiness is checked. Existing Hostinger entry/build settings remain the same; version remains 0.4.0 and responses include `X-KHAGA-Startup-Patch: 1` for identification. Use the actual deployed commit as the authoritative patch identity.

An unavailable database cannot supply current products. Maintenance is deliberate in that case: this patch does not substitute draft, stale or seed data for unavailable managed data. If a dependency fails during initial setup, correct configuration and restart/redeploy; this patch does not add an automatic startup retry scheduler. Existing handlers retain their runtime dependency error handling after successful initialization.

Before enabling admin: run the read-only readiness check from the securely configured hosting/runtime environment; then verify owner login, import the seven concepts exactly once, save a draft, publish, and verify a subsequent server restart retains the data. Do not enable payments in this release.
