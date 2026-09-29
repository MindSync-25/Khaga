# KHAGA: setup checks in Runtime Logs, without a shell

This small follow-up to PR #1 makes the existing read-only diagnostic usable when
Hostinger offers a Redeploy button but no terminal or editable build command.

## Operator workflow

1. Merge this change and deploy the new GitHub commit using the existing entry
   (`server.mjs`) and build settings. No ZIP, SQL, passwords or new variables.
2. Keep `CATALOG_DRIVER` and `ADMIN_ENABLED` absent (or preview/false). Leave the
   previously staged Supabase URL/key and owner settings in Hostinger only.
3. Open KHAGA's Runtime Logs and include Info entries, not only Errors. Look for
   `KHAGA_SETUP_CHECK`. The final event has `state` passed, failed or skipped.
4. Review the final redacted event. Do not export all environment values or share
   credentials. A failed check identifies the field or schema/media stage to fix.
   After correcting staged values, a process restart runs the check again.
5. A passed check is not activation. Leave the switches unchanged until operator
   approval of the next stage: enable management, owner login, import, draft /
   publish and persistence acceptance. Payments remain disabled.

Example event labels (not evidence of a production pass):

```json
{"event":"KHAGA_SETUP_CHECK","state":"running","scope":"configuration-schema-private-bucket","readOnly":true}
```

A completed check produces a passed or failed event. If no Supabase URL/key has
been staged, a skipped event explains that there are no staged Supabase settings.

## What the check does

- Starts only AFTER a healthy preview is ready; never blocks `app.ready` or the
  HTTP listener. Managed, maintenance and already-closed servers are skipped.
- Runs at most once per server instance. No interval, request-triggered endpoint,
  automatic retry, migration, product read/write, seed, publish or upload.
- Uses the existing configuration parser, schema-status RPC and private-bucket
  metadata GET. The schema RPC is a read-only SQL function even though the HTTP
  method is POST. The existing provider request timeouts remain in effect.
- Validates a COPY of the staged configuration. Does not change `process.env`,
  activate admin, switch the storefront catalogue or change health responses.
- Writes redacted results to operator Runtime Logs only. No new public route,
  provider response body, secret, hash, owner email or stack trace is returned.
- Failure stays a diagnostic failure: the working preview still serves and the
  locked checkout/admin gates remain as before. Managed-storage failures still
  follow PR #1's maintenance behavior, never a hidden fallback to seed products.

This is automatically attempted on a successful preview startup whenever a
non-empty SUPABASE_URL or SUPABASE_SECRET_KEY is already staged. Deploying/merging
this patch therefore authorizes those read-only provider requests using the
existing server credentials. Remove BOTH staged URL/key entries to opt out, or
use the CLI instead in an operator-controlled terminal. Do not change the
working site's mode just to run diagnostics.

## Validation

Based on main `c07fa210f9a0a41c225f6277b8731879677f68f7`.
`npm run check`: 122 tests passed (109 existing + 13 new); build passed locally.
New tests cover readiness gating, once-per-instance behavior, no-settings skip,
managed/maintenance/shutdown skip, config errors, read-only provider request
allowlist, private-bucket/auth failures, redaction, logger failures, and actual
local HTTP availability while the diagnostic is pending and after failure.
A successful simulated check also leaves admin off and preview catalogue intact.

Provider responses are stubs; no real Hostinger secrets or production Supabase
were accessed. No production pass, browser/device QA, or write-permission check
is claimed. Logo, artwork, browser scripts, CSS, migration and catalogue remain
unchanged. Only server entry wiring, the diagnostic scheduler, tests and this
operator document are part of the follow-up.
