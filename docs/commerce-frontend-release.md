# KHAGA frontend release preparation

Prepared 2026-10-07 for the existing PR #5 implementation. This is a release handoff, not authorisation to deploy, merge, change Hostinger settings or open sales. No new ZIP, environment or diagnostic application is required.

## Verified hosted backend / current storefront

`https://commerce.slavant.com` passed certificate-chain/hostname validation, exact-origin CORS, guest-session creation and commerce-list access in Supabase. Authenticated empty quote/purchase requests returned `503 PURCHASES_DISABLED`; the unsigned webhook returned `400 INVALID_SIGNATURE`. See [hosted evidence](commerce-verification.md#hosted-connectivity-2026-10-07).

The existing Hostinger storefront serves a managed catalogue, but GET `/checkout` currently returns **401**, and its public catalogue does not advertise remote commerce. This does not identify its source commit; do not assume Hostinger has unmerged PR #5 or its guest integration. The source release candidate remains this branch. Merely adding an API URL to older Hostinger code is not a release.

## Existing integration to release

No checkout rewrite is needed. The branch already contains:

- `server.mjs`, `src/bootstrap.mjs`, `src/app.mjs` and the existing management configuration to serve KHAGA and keep admin access protected.
- `src/commerce/frontend.mjs`, which renders checkout with the exact API-origin meta tag and checkout-specific CSP; the protected order views retain separate Live, commerce Test and legacy Test records.
- `public/checkout.js`, `public/checkout-launcher.js` and the existing checkout styles/assets. The browser uses `credentials: include`, POST `/checkout/session`, CSRF for mutations, quote review and the existing payment/recovery routes. The normal storefront remains the same.
- The normal `npm run build` output, including generated `public/site.js`. Release the reviewed application source plus its normal public assets; never use a legacy archive or deploy only the checkout JavaScript.

Hostinger's existing Node app settings: entry `server.mjs`, root `/`, Node 22, build script `build`, and normal `npm start`/`prestart`. Preserve its assigned `PORT`; preserve existing KHAGA Supabase project/server configuration, admin settings, artwork and storage references. Do not run seed, migration or catalogue reset commands. Existing persistent data stays in Supabase, outside the deployment directory.

## Configuration and release gates

| Setting | Prepared value / rule |
| --- | --- |
| `COMMERCE_API_BASE_URL` | Already configured by the owner as `https://commerce.slavant.com`. Preserve it during the approved closed release. |
| Supabase / admin credentials | Preserve existing Hostinger settings privately; no new credentials or secrets in browser bundles. No secrets are supplied by this handoff. |
| Lambda `LIVE_API_APPROVED` | Currently `true` after the authorised read-only check; this is not permission for a new provider request during frontend preparation. |
| Lambda `PURCHASES_ENABLED` | Must remain `false` throughout this preparation and any separately approved closed release verification. |
| Live policy / catalogue | Read and approve genuine business settings before the first purchase; no fixture values or sample approvals may be copied into production. |

Local build/render checks establish readiness of the branch, not Hostinger deployment. The `.env.example` remains disabled and contains only a commented future API URL. It is documentation, not an automatically loaded Hostinger configuration file.

When the owner separately approves a frontend release: identify and pin the reviewed PR source commit, record the currently deployed KHAGA commit for rollback, deploy through the existing KHAGA application workflow, and keep guest entry unset until its intended controlled window is approved. Do not merge automatically. Do not change the main Slavant site. For a controlled guest verification window, use the existing preview protection if needed, coordinated with the owner; do not silently change existing access controls.

After the approved integration is deployed/configured, verify `/checkout` renders the production API meta tag and CSP, the API request carries cookies, the session works, disabled purchases still return `PURCHASES_DISABLED`, and anonymous admin/order access is rejected. Do not load a payment attempt or submit customer data as part of the closed connectivity check. A later paid-order test and public sales activation require separate confirmation; this checklist does neither.

If the frontend release fails, restore the previously reviewed **KHAGA code** or unset its API entry setting. Do not roll back Supabase data, remove historical orders, disable processing of genuine in-flight payment events, or modify the AWS stack as a frontend rollback shortcut.

## Business values still needed, in one place

Public catalogue read on 2026-10-07: seven products, 115 variants, zero sample-approved products, every variant `unavailable` with quantity `0`. Origin Tee is published at **299000 paise (₹2,990)**; ivory/M has no dispatch range. This is observed catalogue data, not an approved first-purchase selection or final payable total.

Confirm together:

1. The first product, colour, size and quantity; genuine sample approval; `stock` versus `preorder`; actual finite availability/capacity; dispatch range if preorder. Do not mark a sample approved just to pass checkout.
2. The intended current published unit price and final payable total after approved shipping/tax. Existing observed prices: Origin Tee ₹2,990; Solar Tee ₹3,290; Flight Tee ₹3,490; Eclipse Tee ₹3,990; Ascent Tee ₹4,490; Form Shirt ₹5,990; Nocturne Shirt ₹6,990. Re-read before the first purchase; do not silently change them.
3. Shipping is already approved: `shippingPaise=0`, `freeShippingAt=null`, for verified Karnataka delivery. No reconfirmation is needed.
4. Tax rate (`taxBps`), inclusive/exclusive treatment (`taxTreatment`), whether shipping is taxable (`taxShipping`), and customer-facing `taxNote`. No simulated zero values may be substituted.
5. Live policy enabled/version state and approved delivery/returns/cancellation/refund/support promises. Any paid validation purchase needs an agreed payer and fulfilment handling plus explicit charge approval; public activation is a separate decision.

The owner reports their last SQL query found **no Live commerce_policy row**. Do not describe a complete approved existing policy as confirmed. KHAGA is currently not GST-registered according to the owner; do not label garments GST-exempt or promote simulated tax values. The remaining policy fields are taxBps, taxTreatment, taxShipping, truthful taxNote, and version/enabled state. This closed release does not create a policy or enable purchases.

Current release configuration: the owner confirms `COMMERCE_API_BASE_URL=https://commerce.slavant.com` is already set in KHAGA. Preserve it. If Hostinger access is unavailable, the remaining frontend release step is the existing **Redeploy** button after merge; do not ask the owner to configure this variable again. AWS deployment and Hostinger deployment must be reported separately.
