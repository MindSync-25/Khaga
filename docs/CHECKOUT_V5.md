# KHAGA 0.5.0 — private guest-checkout testing

## What this delivery is (and is not)

A real implementation of the Razorpay Orders API, checkout signature verification,
server-side payment lookup and persisted **test** order flow, not a Pay-button mock.
Provider calls are real when deployed with the operator's Test keys. Local QA uses
explicit provider fixtures. No live provider calls were made by the assistant.

Defaults keep the customer storefront unchanged and sales closed. No customer's
account is required by the eventual guest-order design; **during this test release**
the owner must first sign in to `/admin`. Unauthenticated visitors cannot enter the
test flow or obtain a test checkout link. Live mode / `rzp_live_` keys are rejected.
No real-money purchases are supported by this release. Do not advertise it as open
for customer purchases.

### Implemented

- Product/colour/size bag -> test delivery/contact form -> explicit review of the
  server-calculated INR amount -> Razorpay Standard Checkout -> verified result.
- Published catalogue is the price authority. Browser price/total fields are never
  accepted as the payable amount. A changed quote requires another review.
- Persistent test order and contact/address snapshot before creating a provider
  order. Unique guest/idempotency keys and provider/payment references.
- The request is replay-safe. A provider-order creation timeout is deliberately
  `creation_unknown`; it never silently retries a possibly successful create.
  The saved reference stays available for operator review. Receipt-based automated
  recovery of ambiguous gateway creation is not implemented.
- Callback HMAC uses the stored provider order ID, followed by an authenticated
  payment lookup. Only captured, matching amount/currency/order is marked paid.
  Authorization alone is pending, not success. Bag contents are retained on cancel,
  failure and pending verification. Completed items are removed only after a
  verified result; local storage is never proof of payment.
- On-demand payment reconciliation handles a missed callback. Signed webhooks can
  reconcile when the browser closes (requires separate webhook setup below).
  Raw-body HMAC uses a separate secret; payload digests and transactional updates
  de-duplicate events. Failed notifications do not regress paid state. Refunded
  payments enter `refund_review`; no refund is initiated by this app.
- `/admin/orders` displays private test orders with pagination, contact/address,
  line items and payment status. `/checkout/orders/<uuid>` resumes a guest's saved
  result in the same necessary-cookie session. It cannot be accessed using order
  ID alone or from another guest session. Clearing the cookie loses guest lookup;
  the owner can still view the record in the Orders page.
- Test checkout and records are owner-only, no-store, CSRF/same-origin checked;
  guest cookies are host-only, HttpOnly, Secure on HTTPS and SameSite=Strict.
  No gateway or Supabase secret is returned to the browser. Only Razorpay Key ID
  and provider order ID are supplied to Checkout. External SDK is loaded only
  after review on the isolated checkout page, not every storefront navigation.

## Deployment boundary

Prepared against main `53bfa6e5810fe1121ea178a7a82e0fa25dd009f0`. A GitHub source
upload was blocked before a release commit, branch or pull request could be
published. Main was rechecked and remains unchanged. This delivery is a changed-file
overlay ZIP, not a standalone project; retain all existing repository files. No
Hostinger settings, provider account settings, SQL or saved credentials were changed.

Keep `CATALOG_DRIVER` and `ADMIN_ENABLED` absent on the restored preview, and leave
`CHECKOUT_MODE` absent until storage/owner setup is verified. Saving Razorpay keys
alone does not enable any payment flow. Existing default preview regression tests
still pass. Logo, artwork, product pricing and colours are not redesigned.

Current prerequisite from the operator's last logs: `SUPABASE_SECRET_KEY` contained
embedded whitespace. Its correction/provider authentication has not been confirmed.
The existing `KHAGA_SETUP_CHECK` remains the way to verify it; this release neither
bypasses that validation nor changes the key.

## Enable private Test mode only, after readiness

1. Confirm the existing startup/setup check passes with the saved Supabase and
   owner settings. Fix the key at its source; never put it in a PR or chat.
2. Run `migrations/002_test_checkout.sql` once in the dedicated KHAGA Supabase SQL
   editor after migration 001. It is transaction-wrapped and rerunnable, adds only
   separate test tables/functions, enables RLS and restricts functions to
   `service_role`. Do not expose the private schema or add anon grants.
3. Keep the matching `RAZORPAY_KEY_ID` (`rzp_test_...`) and `RAZORPAY_KEY_SECRET` in
   the KHAGA server environment. When readiness is confirmed, set together:

   ```text
   CATALOG_DRIVER=supabase
   ADMIN_ENABLED=true
   CHECKOUT_MODE=test
   ```

   All previously configured origin, database and owner variables are still needed.
   Misconfigured checkout stays disabled without stopping a healthy catalogue.
   A managed-database failure still uses the existing honest maintenance response;
   this implementation never silently falls back to seed products.
4. Deploy the new commit. Health version is `0.5.0`. Sign in at `/admin`, import the
   seven known concepts if needed, add a product/colour/size to the bag, and select
   **Continue to test checkout**. The link appears only for the signed-in owner.
   `/checkout` is deliberately a separate page with a narrow payment-specific CSP;
   existing product colour changes and storefront navigation remain client-side.
5. Use Razorpay's documented Test-mode payment methods and fictional contact and
   address details. Check the provider is configured to capture test payments;
   authorized-only payments remain pending until actually captured.
6. Verify the confirmation and `/admin/orders`, then restart/redeploy and verify
   the same test order persists. Test failure, cancel, retry, lost callback,
   mismatched signatures and logged-out access too.

### Optional for first callback test; required before live reliability acceptance

Choose a separate random webhook secret (24+ characters). Store it privately as
`RAZORPAY_WEBHOOK_SECRET` and set the same secret for the Test-mode Razorpay webhook:

`https://khaga.slavant.com/api/payments/razorpay/webhook`

Subscribe to `payment.captured`, `order.paid` and `refund.processed`. The webhook is
not the Checkout callback URL. This route alone bypasses optional sitewide preview
Basic Auth, and requires the raw-body HMAC on every request. Without a configured
webhook secret it returns 503 and processes nothing. Do not reuse the API secret.
No webhook/account settings have been created automatically. Verify actual delivery
and repeated notifications; a successful callback does not test webhook setup.

## Explicit limitations before a live release

The flow is test-only and requires another reviewed live-readiness change before
live keys can be accepted. No automatic inventory reservations/decrements, real
shipping/tax rules, real order emails, bank reconciliation, refund execution,
customer account/recovery, or unbounded order creation retries are included.
Zero shipping and shown prices are labelled simulation values, not live policy.
Test orders do not imply stock availability; unavailable/sample-unapproved
published concepts can be used ONLY in this owner-only test environment.

Final live release needs configured/approved retail information and checkout
policies, live-account capability, real order/availability controls, and successful
end-to-end provider/storage/security tests. Never simply remove the live-mode guard.
Database/media backups and retention remain operator responsibilities. No automatic
purge of test PII is implemented: use fictional data and deliberately clean it up
through an authorised retention process, not arbitrary table deletion.

## Verification actually performed

- 112 local Node tests passed: the 84 base storefront/admin tests available in the
  supplied v4 source plus 28 new checkout tests. Relevant integration sources were
  pinned against current-main blob hashes before editing. This is NOT a claim that
  every later startup/diagnostic test from main was rerun in the local archive.
- `npm run build` passed, including script syntax and all product views.
- Additional actual-entry HTTP smoke: current-main server.mjs/preview-check hashes
  were restored and verified; a dummy staged key with internal whitespace still
  leaves the default homepage HTTP 200 and health at version 0.5.0. No provider
  network request or real credentials were used in this smoke check.
- Real local HTTP + SQLite tests: quote tampering, private drafts, invalid variants,
  CSRF/Origin/cookies, ownership, concurrent idempotency, ambiguous provider create,
  invalid callbacks, captured-vs-authorized, persistence across reopen, webhook
  HMAC/raw bytes, duplicate delivery, failed/refunded ordering and private Orders.
- Razorpay HTTP contract tests use stubbed responses at the API boundary, and
  Supabase order RPCs use explicit stubs. New PostgreSQL migration has NOT been
  executed against a real Supabase project in this environment.
- 15 offline Chromium checks passed at 360, 390, 768 and 1440px. Real HTML/JS/CSS;
  fetch/storage/Razorpay are simulated. The native Chromium network is blocked,
  so native cookie/CSP/redirect behavior, Safari, physical phones and hosted
  Razorpay Checkout still need testing. No live-payment or real provider Test-mode
  transaction is claimed. Screenshots are offline QA, not deployed screenshots.

Run server tests with `npm test`. For the documented offline browser harness, run
`node test/checkout/browser-fixture.mjs`, then `python test/checkout/browser-qa.py`
with Playwright, system Chromium and requests available. The fixture uses only a
localhost temporary database and dummy keys; it is never the production entry.

## Official integration references

- https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
- https://razorpay.com/docs/api/orders/create/
- https://razorpay.com/docs/api/payments/fetch-with-id/
- https://razorpay.com/docs/api/orders/fetch-payments/
- https://razorpay.com/docs/webhooks/validate-test/

No live release was published. The earlier partial Git tree is not attached to main
or a release branch. No actual customer order, provider order, capture, refund or
migration was performed. Read docs/CHECKOUT_V5_DELIVERY.md before uploading.
