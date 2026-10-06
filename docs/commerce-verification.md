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


## Test administrator IAM handoff (2026-10-06)

- Added CloudFormation trust/execution documents, an enforced Test Lambda permissions boundary, additive deployer permissions, TLS-only artifact bucket policy, exact-reference renderer, and administrator console runbook. The initial empty HTTP API is administrator-owned bootstrap in the same Test stack, so subsequent permissions use an exact API ID. No application checkout logic changed.
- 210 local Node tests pass, including five IAM scope/reference rejection checks. The first full-suite attempt could not bind loopback sockets in the sandbox; the rerun with local listener permission passed.
- SAM lint and build pass. Offline SAM transformation confirms exactly two Lambda functions, two generated runtime roles with the boundary, seven invocation permissions, one inline-OpenAPI HTTP API/default stage and two log groups.
- Independent webhook/session secrets generated outside Git; local checks verified private directory/file permissions, format and distinctness without outputting values. No Razorpay/Supabase credentials were regenerated or read.
- These are local/static checks, not AWS effective-permission validation. Administrator application, exact AWS secret ARN/API ID, deployed-Lambda authentication and hosted payment/webhook/persistence acceptance remain pending. No AWS/IAM provisioning, migration, DNS, Hostinger or Live activation was performed.
