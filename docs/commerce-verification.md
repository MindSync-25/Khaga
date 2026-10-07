# Commerce implementation verification

## Hosted connectivity (2026-10-07)

Actual requests used `https://commerce.slavant.com` at **2026-10-07 04:31 UTC** (10:01 IST), with the system trust store and TLS hostname verification enabled. No insecure TLS option was used. The deployed Purchase artifact SHA-256 still matches the successfully deployed PR source `30d8dbf503204bc4e926a11bc50fd5d0175556d8`; metadata confirmed `LiveApiApproved=true`, `PurchasesEnabled=false`, exact frontend origin `https://khaga.slavant.com`. No code, IAM, secret, DNS, Hostinger or configuration update was made in this check.

| Hosted check | Actual result |
| --- | --- |
| DNS | PASS: `commerce.slavant.com` CNAME resolves to `d-96s9cyiik4.execute-api.ap-south-1.amazonaws.com`; A records resolved |
| HTTPS | PASS: trusted chain and hostname validated, TLS 1.3; certificate expiry 2027-04-22 23:59:59 GMT |
| CORS | PASS: POST preflight returned 204; exact origin and credential allowance; requested content-type/CSRF headers allowed. Actual responses allow only `https://khaga.slavant.com`; requests from main `https://slavant.com` and an unrelated origin returned 403 `ORIGIN_DENIED` with no allow-origin header |
| Guest session / database access | PASS: POST `/checkout/session` with `{}` returned 200, mode `live`, signed Secure/HttpOnly guest cookie and CSRF token present, recent-order list read completed. This invokes the existing Supabase commerce-list RPC and rate-limit path. No cookies, token values, order contents or customer data were printed or stored in the report |
| Purchases disabled | PASS: same-session, valid-CSRF empty POSTs to `/checkout/quote` and `/purchase` each returned 503 `PURCHASES_DISABLED`. The application gate executes before catalogue/policy reads, reservations or provider order creation |
| Webhook signature rejection | PASS: unsigned empty JSON POST `/payments/razorpay/webhook` returned 400 `INVALID_SIGNATURE`; no payment success or event transition. No signed/fabricated captured-payment event was sent |

The rejection statuses above are expected protections, not technical failures. No failure occurred in the six requested API checks. This is hosted HTTP protocol evidence, not a completed browser checkout, actual signed Razorpay delivery, verified paid order, fulfilment acceptance or paid-order persistence across redeployment. Authentic Razorpay delivery remains unverified until a suitable real event is available.

The owner reports migration 003 succeeded in the existing Supabase project, ACM is Issued, the Regional domain/empty-path mapping and CNAME are configured, and the Live Razorpay webhook is enabled with its matching secret and the five required event types. Migration was **not rerun**. TLS/route/session behavior corroborates connectivity; webhook dashboard configuration and authenticity of a real provider delivery were not independently established by the unsigned request.

The earlier deployed-Lambda read-only authentication result remains `ok=true`, `mode=live`, request ID `5b857269-0b2c-44a7-8af3-9bf0e19dbc19`; no Razorpay authentication or other payment request was repeated here.

### Frontend readiness versus Hostinger reality

Public `https://khaga.slavant.com/api/catalog` returned the existing managed catalogue without a checkout-advertisement field. GET `/checkout` returned **HTTP 401** and did not serve the PR's guest API integration. This is the exact outstanding storefront observation, not an API connectivity failure. The running Hostinger source revision is not verified. Do not infer that unmerged PR #5 is deployed.

The existing branch's `npm run check` passed **217 local tests and the storefront build**. Direct local rendering of the existing frontend confirmed its disabled default, production-origin meta tag/CSP and anonymous admin rejection. Those checks make no hosted provider call and do not substitute for a later approved Hostinger release. Release configuration and commands are prepared in [commerce-frontend-release.md](commerce-frontend-release.md); the example API base remains empty.

### Business settings observed and remaining

Public catalogue: 7 products / 115 variants; all `sampleApproved=false`, all variants `mode=unavailable`, all quantities `0`. Origin Tee remains ₹2,990; ivory/M is unavailable and has no dispatch range. No catalogue values were modified or invented.

The live shipping/tax/policy row is not exposed by current public guest routes and cannot be read with the existing unauthenticated storefront access; no authorised local Supabase connection is present and no broader secret/IAM access was requested. Its values are **unverified**, not assumed absent. Consolidated business inputs and an owner-run read-only policy query are in the [frontend release handoff](commerce-frontend-release.md#business-values-still-needed-in-one-place). No simulated zero shipping/tax policy may be promoted to production.

## Historical single production preparation (2026-10-06)

PR #5 now prepares only `khaga-commerce-prod` in account `521199095818`, region `ap-south-1`, profile `sairn-deployer`. The administrator bundle is [infra/iam/README.md](../infra/iam/README.md). Earlier Test-stack proposals are superseded, not deployments to carry out.

- 214 local Node tests pass; storefront build passes. Includes strict production/Live matching, separate Live API approval, purchases closed by default, no catalogue/storage/provider effects on blocked creation, and the existing IAM-only read-only authentication path with purchases disabled.
- 10 real local PostgreSQL integration groups pass. The added case closes purchases and verifies signed webhook replay, browser confirmation, persisted payment state across store instances, no new provider order, no payment-window offer, and Test/Live namespace separation. Provider responses are simulated.
- 12 existing Chromium checks pass over separate local HTTPS origins with real local PostgreSQL; Razorpay SDK/provider calls remain simulated. Guest checkout, admin protection, recovery and signed-webhook persistence are preserved.
- Production SAM and same-stack bootstrap templates pass local lint; SAM build passes. No Test secret dependency or alternative deployment environment remains. Runtime permissions boundaries apply to both production functions.
- Deployed AWS effective permissions/authentication, production Supabase migration, authentic Live webhook delivery, Live order persistence across deployed code updates and any real-money transaction remain **unverified**. No AWS/IAM provisioning, DNS or Hostinger changes, public checkout activation or charge was performed.
- No migration/data rewrite: existing sample/capacity/price fields, policies and historical Test records are unchanged. Both `LiveApiApproved` and `PurchasesEnabled` default false. Live API use, any charge and public activation require their respective owner approvals.

## Earlier implementation evidence (historical)

Local validation on 2026-10-06, branch `feat/guest-commerce-lambda`, based on `main` at `c309847`.

| Check | Result | Actual systems used |
| --- | --- | --- |
| `npm run check` | 205 tests pass; storefront build passes | Node 24; original 201 regression tests plus 4 commerce test groups |
| `npm run test:commerce:db` | 9 integration groups pass | Disposable PostgreSQL on localhost; production SQL migration/RPC; simulated payment provider |
| `test/commerce/browser-qa.py` | 12 checks pass | Chromium, 390×844 viewport, separate real HTTPS origins, native Lambda handler adapter, actual PostgreSQL; Razorpay SDK/provider fixtures |
| `sam validate --lint` | Pass | Local SAM/CloudFormation lint; exactly two commerce Lambda resources |
| `sam build` | Pass | Local Node.js 22 ARM64 Lambda artifacts, source-only packaging |

Database coverage: repeatable additive migrations, revoked anonymous privileges, concurrent idempotency, stock oversell rejection, stale-price rejection, immutable snapshots, conflicting request keys, signatures/guest ownership, authorized versus captured payments, browser/webhook races, duplicate events, failed-event monotonicity, Test/Live separation, definitive rejection, lost create response, webhook recovery of lost binding, persistence across service instances, operator-evidenced closure, and webhook persistence failure/replay.

Browser coverage: existing colour/size controls and bag launcher, no admin login, actual API-host Secure/HttpOnly cookie, protected admin route, quote review before provider creation, real CORS preflight and CSRF rejection, cancellation preserves bag, refresh/resume reuses provider order, authorized payment stays pending, closed-browser webhook and return confirmation, and denial of another guest's order. The mobile-width confirmation was visually inspected. No frontend `fetch` mocks are used in this new browser suite.

**Not performed:** AWS provisioning/deployment, production Supabase migration, the deployed-Lambda read-only Razorpay authentication check, a hosted Razorpay Test transaction, production DNS changes, Live activation or real charges. At that earlier checkpoint the account/profile/region and deployment approvals were outstanding; the current production scope and remaining prerequisites supersede those historical notes. Reviewed pricing/capacity, shipping/tax settings and customer policies also remain prerequisites. The local results do not resolve the known Hostinger 401 versus local 200 discrepancy.

Follow [the deployment and acceptance runbook](commerce-deployment.md) to finish hosted acceptance. Keep this PR in draft until those results are recorded. Production Hostinger remains unchanged.


## Superseded Test administrator IAM handoff (2026-10-06)

Historical evidence only. Do not apply that bundle; current documents target one production stack.

- Added CloudFormation trust/execution documents, an enforced Test Lambda permissions boundary, additive deployer permissions, TLS-only artifact bucket policy, exact-reference renderer, and administrator console runbook. The initial empty HTTP API is administrator-owned bootstrap in the same Test stack, so subsequent permissions use an exact API ID. No application checkout logic changed.
- 210 local Node tests pass, including five IAM scope/reference rejection checks. The first full-suite attempt could not bind loopback sockets in the sandbox; the rerun with local listener permission passed.
- SAM lint and build pass. Offline SAM transformation confirms exactly two Lambda functions, two generated runtime roles with the boundary, seven invocation permissions, one inline-OpenAPI HTTP API/default stage and two log groups.
- Independent webhook/session secrets generated outside Git; local checks verified private directory/file permissions, format and distinctness without outputting values. No Razorpay/Supabase credentials were regenerated or read.
- These are local/static checks, not AWS effective-permission validation. Administrator application, exact AWS secret ARN/API ID, deployed-Lambda authentication and hosted payment/webhook/persistence acceptance remain pending. No AWS/IAM provisioning, migration, DNS, Hostinger or Live activation was performed.
