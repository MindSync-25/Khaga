# Commerce implementation verification

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

**Not performed:** AWS provisioning/deployment, production Supabase migration, the deployed-Lambda read-only Razorpay authentication check, a hosted Razorpay Test transaction, production DNS changes, Live activation or real charges. Account/region/profile, secure secret provisioning and deployment approval were requested once and remain outstanding. Reviewed pricing/capacity, shipping/tax settings and customer policies also remain prerequisites. The local results do not resolve the known Hostinger 401 versus local 200 discrepancy.

Follow [the deployment and acceptance runbook](commerce-deployment.md) to finish hosted acceptance. Keep this PR in draft until those results are recorded. Production Hostinger remains unchanged.
