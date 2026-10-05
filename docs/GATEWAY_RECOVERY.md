# KHAGA v5: recover an unconfirmed gateway-order attempt

## Observed failure and confirmed code defects
The owner's checkout reached its review and saved-order screen, then showed
`creation_unknown` / "gateway-order response was incomplete". That screen does
not prove a Razorpay order was never created or that payment succeeded.

The previous provider adapter discarded every HTTP/API/parse failure. The service
also caught gateway creation and saving the provider reference together without
reporting the stage. Its reconcile operation did nothing when provider_id was
missing. These code defects are confirmed; the original production provider
response is not available, so the underlying account/network/storage cause is
not asserted as known.

## Changed behavior
- Classify HTTP authentication (including documented HTTP 400 authentication
  responses), access, request rejection, rate limiting, transport and invalid
  responses using fixed error messages. Never log raw bodies, keys, addresses,
  email, authentication headers or stack traces.
- Keep the original immutable price, receipt and idempotent local order. Creation
  remains a single POST; this patch never retries that POST automatically.
- Show the safe cause on a new failed attempt; record a value-free
  KHAGA_CHECKOUT_FAILURE event with stage and public short reference.
- "Check payment status" can now find the existing provider order using a GET
  filtered by the saved receipt. It independently verifies the exact receipt,
  unique match, ID, amount, currency, order entity, test mode and KHAGA notes.
  Conflicting, truncated or mismatched results are not linked. A zero-result
  lookup is not permission to create another order.
- Attach the verified reference using the existing conflict-safe database RPC,
  then reconcile payment status. Paid is still server-verified capture, never
  a browser message or a gateway order merely being present.
- A still-running creator is not raced. Concurrent recoveries cannot create a
  second provider order. A lost database-bind response can be recovered.
- Resume checks the existing order first. Authorized/processing payments or paid
  gateway orders without complete payment details do not offer a new payment.
- Replace "We're checking" with an honest manual-review state; no implied polling.

No SQL migrations, environment changes, new credentials or logo/design changes.
The Test-only and owner-session restrictions remain. Nothing enables live orders,
initiates refunds, or creates a provider order by merely viewing/checking status.
The status check may persist a validated recovered binding/payment state locally.

## Operator action after merging and deployment
Keep the existing settings unchanged. Stay signed in using the same browser
session. Refresh the saved checkout page and click "Check payment status" once.
Do not clear cookies, delete the old order or begin a fresh checkout to bypass it.
A matching created order can offer "Resume this test payment". A captured payment
shows the verified result. Otherwise the page shows the specific safe error.
No matching gateway order still needs operator review, not a blind create retry.

If the page still uses the old sentence, refresh the checkout document after the
new commit deploys so its separately cached checkout.js is revalidated.

## Validation performed
- 144 local Node tests passed: the available 112-test v5 storefront/admin/checkout
  set plus 32 new gateway/recovery tests. Actual local HTTP and file-backed SQLite
  are used; Razorpay and Supabase HTTP responses are fixtures, not live accounts.
- Build passed. Latest configuration/diagnostic/repository runtime dependency
  copies were hash-checked against GitHub. Later unchanged diagnostic test files
  from main were not present in the archive; that full additional suite was not
  rerun. The PR preserves those tests and all other existing files.
- 21 offline Chromium interaction/layout checks passed, including uncertain
  creation, inline authentication/no-match errors, same-order recovery, resumption,
  cancellation, bag preservation and verified completion. Browser API/storage and
  Razorpay widget responses are simulated; no live cookie/CSP/provider verification.
- No production keys, provider payments, hosted database writes or live-money
  transactions were accessed by the assistant. Hostinger acceptance remains open.

## Primary API references
- https://github.com/razorpay/markdown-docs/blob/master/api/orders/create.md
- https://github.com/razorpay/markdown-docs/blob/master/api/orders/fetch-all.md
- https://github.com/razorpay/razorpay-node/blob/master/documents/order.md
