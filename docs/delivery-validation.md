# Launch delivery validation

This change is based on merged PR #5 (`bbcf9917948492d6ac23482fa909e0f73b6fda8a`). It uses the existing guest checkout, Purchase Lambda and shared commerce service. No new environment, Lambda, IAM permission, database migration or credential is required. Purchases remain closed; this PR does not authorise deployment or payments.

## Rules and customer experience

Browsing and the bag are unchanged. No regional homepage banner or product marketing label is added. Checkout uses the copy “Free shipping to eligible delivery addresses.”

Both `POST /checkout/quote` and `POST /purchase` require `customer`, including delivery country, state and PIN. The backend validates address/contact syntax, checks the complete six-digit PIN against postal records, compares the supplied state with the returned state, and accepts only India / Karnataka. `KA` is accepted as an explicit alias for Karnataka. No PIN-prefix heuristic, IP, GPS, billing address or client eligibility flag is used.

Unsupported countries and consistent addresses in other states return HTTP 422 `DELIVERY_UNSUPPORTED`. Checkout displays exactly:

> We’re currently unable to deliver to this address.
> Please choose another delivery address.

Malformed addresses, unknown PINs and inconsistent state/PIN combinations return `INVALID_ADDRESS` with correction guidance. Timeouts, rate limits, non-contract responses and ambiguous PIN/state records return HTTP 503 `DELIVERY_LOOKUP_UNAVAILABLE`, inviting a later manual retry. These are not labelled unsupported destinations. The current form and bag remain intact; no payment window opens.

The initial checkout no longer requests a payable quote before an address exists. Editing details clears the reviewed quote, including when an older quote response arrives after the edit. The backend binds the quote hash to all normalised delivery fields and re-runs the lookup before creating an order, reserving capacity or calling Razorpay. Client-supplied hashes and eligibility claims cannot bypass validation.

Existing-order confirmation, signed webhooks and recovery do not use this gate. Already paid orders, including historical out-of-region orders, can still be verified and persisted. No historical order is rewritten.

## PIN lookup source and operational behaviour

- Provider: [Pincode API V1 documentation](https://pincodeapi.in/docs/).
- Endpoint: `GET https://api.pincodeapi.in/api/v1/pincode/{PIN}`; only the PIN is sent. No name, contact details, street address, key or customer identifier leaves KHAGA for this lookup.
- [Data provenance and limitations](https://pincodeapi.in/data/): independent directory prepared from India Post, Open Government Data and other public government sources. It is not an official government service. Postal records verify the PIN/state association, not the physical existence of a building or a courier's service promise. District is not treated as city.
- [Response contract](https://pincodeapi.in/docs/responses/) and [error codes](https://pincodeapi.in/docs/errors/): require a successful V1 response, matching PIN in the envelope and every record, a complete count and one unambiguous state across all records. A specific `404 PINCODE_NOT_FOUND` is an invalid address; generic 404s are lookup failures.
- HTTPS validation remains enabled; redirects are rejected. Each lookup has a five-second timeout. There is no automatic retry loop or stale-success fallback. Each quote/create validates afresh, so an outage between review and creation fails closed.
- [Provider terms](https://pincodeapi.in/api-terms/) permit commercial use, with a documented public limit of six calls per ten seconds per IP and no SLA. Rate limits produce the retryable checkout error. Capacity/availability must be considered before sales activation; no new paid service or credential is configured here.
- A public, non-customer lookup of `560001` on 2026-10-07 matched the documented contract and Karnataka; the response reported dataset version `2026-06-27`, release `20260627-0d584ba5d757`. Automated tests use deterministic fixtures and do not depend on this external service.

## Free shipping and remaining production prerequisite

The existing database independently recomputes shipping and tax from `commerce_policy`. The service therefore requires `shippingPaise: 0` in the existing approved policy before returning any new quote. Missing/nonzero shipping fails closed as `DELIVERY_POLICY_REQUIRED`; no paid shipping quote is offered. Tax calculations, product prices, stock and sample approvals are unchanged. A missing or unapproved complete policy still blocks checkout; this PR never fabricates one.

The production policy is not available through current authorised public access, so its shipping value remains unverified. Before a separately approved activation, the owner must confirm that the existing Live policy has zero shipping and otherwise approved business/tax settings. This PR performs no production policy write or migration. Local fixtures alone use zero shipping for the approved delivery-rule tests; their tax values are explicitly simulated, not production policy or a GST-exemption claim.

## Local verification

- `npm run check`: **233 tests passed**, plus the complete storefront build.
- `npm run test:commerce:db`: **11 integration tests passed** against disposable PostgreSQL, with actual order/reservation counts unchanged after unsupported, foreign, mismatched, unknown-PIN, lookup-outage and stale-address requests. Existing payment, idempotency, persistence and signed-webhook tests use simulated providers.
- `test/commerce/browser-qa.py`: **15 checks passed** in Chromium against the existing local HTTPS harness. Verifies exact unsupported text, correction/outage messages, entered-details/bag retention, no SDK/payment opening on rejected delivery, edited-address review, normal bag controls, guest cookies/CORS, protected admin and existing payment/recovery regressions. Self-signed TLS is limited to this existing local harness; it is not hosted TLS evidence.

`node scripts/build-commerce.mjs` also passed, packaging the new module in the existing source-only Lambda artifact. `git diff --check` passed.

No hosted checkout/payment acceptance or deployment is claimed by these tests.
