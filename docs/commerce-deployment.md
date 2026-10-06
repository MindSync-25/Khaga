# Guest commerce deployment and acceptance

This change adds guest checkout using exactly two native Lambda handlers per environment. Hostinger continues serving catalogue, artwork, checkout HTML and protected management. Only customer commerce API calls move to AWS. Nothing deploys from a merge automatically.

## Required owner settings (collect together)

- AWS account ID, region and SSO/profile; preferred secure Secrets Manager provisioning method; approval for the Test stack's paid resources.
- Reviewed retail prices and published variant quantities/capacities, sample approval, and the intended meaning of those capacities. New reservations count against cumulative capacity; do not subtract sold units again in admin. Test reservations are separate from Live.
- Shipping charge in paise and optional free-shipping threshold; tax rate in basis points, inclusive/exclusive treatment, whether shipping is taxable, and approved customer-facing tax wording. These settings currently apply to India only. Approve Test fixture settings separately; no simulated policy is promoted to Live.
- Exact storefront origin(s), API subdomain, and approved delivery/returns/privacy/terms/support wording before opening customer sales. Existing preview help pages are not approved customer policy.

No customer account or owner login is required. All-order lists still require the existing Hostinger admin session. The API uses its own seven-day signed HttpOnly guest cookie. Losing/clearing that cookie requires support; an order UUID grants no access.

## Build and review locally

```sh
npm test
npm run build
node scripts/build-commerce.mjs
sam validate --lint --template-file infra/template.yaml --region YOUR_REGION
sam build --template-file infra/template.yaml --build-dir .aws-sam/build
```

The artifact allowlist contains only `src/` and a generated package manifest; no `.env`, Git metadata, browser fixtures or credentials. AWS SDK v3 is supplied by the Node.js 22 Lambda runtime. `infra/template.yaml` defines only `Purchase` and `ConfirmPurchase` Lambda resources. Function names are `khaga-purchase-test`/`khaga-confirm-purchase-test`, with separate `-live` names for the Live environment. No VPC or NAT is created.

Database test reproduction (disposable localhost PostgreSQL ONLY, fixed port 55439):

```sh
initdb -D /tmp/khaga-commerce-pg -A trust --no-locale -E UTF8
pg_ctl -D /tmp/khaga-commerce-pg -l /tmp/khaga-commerce-pg.log -o '-p 55439 -h 127.0.0.1 -k /tmp' start
npm run test:commerce:db
```

The fixture creates Supabase role/storage stubs and applies all three migrations locally. It never connects to the production database. Unit/regression tests use `npm test`; DB tests are explicitly separate.

Real browser reproduction: install Playwright with Chromium, generate one-day localhost TLS files at `/tmp/khaga-commerce-key.pem` and `/tmp/khaga-commerce-cert.pem`, run `node test/commerce/browser-server.mjs`, then `python test/commerce/browser-qa.py`. The browser maps `shop.khaga.test` and `api.khaga.test` to loopback and makes actual HTTPS requests. Only Razorpay is simulated. Screenshot/report are written under `/tmp/khaga-commerce-browser`.

## Secrets and database setup

1. Review `migrations/003_commerce.sql`, then apply it through the existing Supabase SQL editor as database owner after migrations 001/002. It is additive and re-runnable. Preserve `test_orders`, `test_payment_events`, catalogue/admin data and ambiguous legacy records. No data is migrated or deleted. Private tables have RLS and public execution is revoked; only `service_role` can invoke the commerce RPC.
2. In AWS Secrets Manager, create separate encrypted JSON secrets for Test and Live. Use the AWS console/SSO or an approved secure input channel, never raw secrets in chat, shell arguments, repository files, CI output or browser bundles. The schema is: `mode`, `keyId`, `keySecret`, `webhookSecret`, `sessionSecret`, `supabaseURL`, `secretKey`. Use separate random webhook and session secrets (at least 24 and 32 characters respectively); they must differ from each other and the Razorpay secret. Use the existing Supabase server credential. Only each environment's selected secret ARN is granted to its Lambda execution roles. The default Secrets Manager encryption key works without additional KMS grants; a customer-managed key needs a separately reviewed, scoped decrypt grant.
3. Insert a reviewed policy row into `khaga_private.commerce_policy`. No policy is seeded by the production migration. `settings` fields are `mode` (`test`/`live`), `enabled` (boolean), `version` (increment on edits), `shippingPaise` (integer), `freeShippingAt` (integer or null), `taxBps` (0–10000), `taxTreatment` (`inclusive`/`exclusive`), `taxShipping` (boolean), `taxNote` (approved text). Missing settings fail closed. Tax rounds once at order level; ensure that is the approved business rule.
4. Review published products in existing admin: prices in paise, `sampleApproved=true`, sellable `stock`/`preorder` variants, quantity/capacity and preorder dispatch range. Unavailable/unapproved variants cannot be purchased.

## Test deployment (requires approval)

After account/profile and cost approval, use `infra/samconfig.toml` and deploy the built template. Parameters contain references, never secrets:

```sh
sam deploy --template-file .aws-sam/build/template.yaml \
  --config-file infra/samconfig.toml --config-env test \
  --profile YOUR_PROFILE --region YOUR_REGION \
  --parameter-overrides Environment=test LiveApproved=false \
    TestSecretArn=YOUR_TEST_SECRET_ARN FrontendOrigins=https://slavant.com
```

Review the change set before execution. Live does not need to be provisioned to deploy Test. Outputs are `ApiUrl`, `WebhookUrl`, `PurchaseFunction` and `ConfirmFunction`. HTTP routes:

| Function | Routes |
| --- | --- |
| Purchase | POST `/checkout/session`, POST `/checkout/quote`, POST `/purchase` |
| ConfirmPurchase | POST `/confirm-purchase`, POST `/payments/razorpay/webhook`, GET `/orders/{id}`, POST `/orders/{id}/reconcile` |

### Resolve the known 200-local / 401-Hostinger issue early

After the Test stack and securely stored Test secret exist, invoke the deployed purchase function directly with IAM authorization (not an HTTP route). This performs only `GET /v1/orders?count=1` and returns safe success/error/status codes and the AWS request ID:

```sh
aws lambda invoke --profile YOUR_PROFILE --region YOUR_REGION \
  --function-name khaga-purchase-test --cli-binary-format raw-in-base64-out \
  --payload '{"operatorAction":"razorpay-auth-check"}' /tmp/khaga-auth-result.json
```

Inspect only that safe result. Do not print secret contents or provider responses. A 401/400 authentication error is not evidence Lambda fixes the existing issue: verify account/region/function environment, selected secret ARN/version, Test mode/key prefix, exact matching pair and request construction. Check that the intended deployment is invoked and permit the one-minute secret cache to refresh. Compare the Hostinger configuration source without copying secrets to logs. Do not repeatedly rotate or regenerate shared credentials.

## API subdomain, certificate and browser security

Prefer `commerce-test.slavant.com` for Test and `commerce.slavant.com` for Live. The execution API URL is suitable for the initial IAM auth check/webhook testing, but is cross-site to slavant.com. The signed cookie deliberately uses `SameSite=Lax`; **do not launch the browser flow against an execute-api domain** or loosen it to work around third-party-cookie restrictions.

After DNS/cost approval:

1. Request an ACM public certificate in the same region as the HTTP API, for the exact selected API subdomain. Add its DNS validation CNAME in the existing DNS provider only after approval.
2. Create a Regional API Gateway custom domain with that ACM ARN and TLS 1.2; map its empty API path to this HTTP API's `$default` stage. No additional Lambda is required.
3. Add the API Gateway target CNAME/alias for that subdomain in the existing DNS provider only after approval. Do not change Hostinger's storefront DNS.
4. Set exact `FrontendOrigins`, including `https://www.slavant.com` only if actually served. Wildcards are forbidden. Browser requests use `credentials: include`; the API independently requires the signed guest cookie, exact Origin and CSRF for mutations. Admin cookies are not used by Lambda.
5. Set **one** Hostinger setting, `COMMERCE_API_BASE_URL=https://commerce-test.slavant.com`, only after API verification. This exposes guest checkout and injects that exact origin into checkout CSP `connect-src`; Razorpay scripts/frames retain their narrowly scoped hosts. Until this setting is supplied the current site and legacy owner Test checkout remain available.

## Webhook and hosted Test acceptance checklist

- Configure the **Test-mode** Razorpay webhook to the deployed `/payments/razorpay/webhook`, with the separate Test webhook secret. Subscribe to `payment.captured`, `payment.authorized`, `payment.failed`, `order.paid`, `refund.processed`. Do not reuse the payment key secret.
- Confirm Razorpay capture settings; authorized is never treated as paid. The implementation does not initiate refunds.
- Complete a real hosted Razorpay Test transaction from a guest desktop/mobile browser. Verify the saved amount, provider association, paid status, bag clearing and Test label in protected Orders.
- Close the browser before its handler callback; verify webhook persistence and reopening the saved order. Deliver duplicate webhooks and verify a single order/payment state. Confirm invalid signature and other-guest UUID requests fail.
- Cancel a payment and refresh/return from the mobile payment flow: the bag remains and status reconciliation reuses the existing provider order.
- Redeploy the same Test stack and verify order persistence and admin visibility. The database outlives both Lambdas.
- Test Live code with fixtures only until explicit Live approval. Live deployment requires `Environment=live`, a distinct Live secret ARN, `LiveApproved=true` and an approved enabled Live database policy. Keep Test credentials/webhook/API and records separate. No real charges without approval.

## Recovery, reservations and rollback

A definite received gateway rejection closes that intent and releases its reservation; the customer sees a new-checkout action. Network timeout, invalid response, Lambda termination or database bind failure retain the reservation. Customer reconciliation searches provider orders using the receipt and verifies exact receipt, amount, currency and mode notes; it never issues another provider POST. The webhook can recover a lost binding from the provider's saved order notes.

Zero matches are not proof no order was created. For an unresolved `creating`/`creation_unknown` intent, investigate the selected account and provider support evidence. Only a database owner, after confirming no provider order/payment exists, can call `khaga_private.close_uncreated_order(order_uuid, evidence_text)` after the one-hour guard. This retains the order/audit evidence, releases capacity and exposes the customer's new-checkout action. The function is not granted to the app role or exposed over HTTP. Never close an ambiguous attempt merely because lookup is empty.

Reservations include pending, captured and refund-review orders. They deliberately do not auto-expire while a gateway payment remains possible; no automated restock/refund policy is invented. Investigate abandoned payable orders with the provider before any manual inventory adjustment. Capacity updates through admin share the database lock with purchases; historical item/address/price snapshots remain immutable through the API. Additional captured payments are flagged for operator review and never automatically refunded.

Rollback: unset `COMMERCE_API_BASE_URL` to stop new guest entry, disable the affected policy's `enabled` flag to stop new quotes/purchases, and deploy the last reviewed Lambda artifact through a reviewed SAM change set. Keep confirmation/reconciliation and webhook routes running for outstanding orders. Do not delete stacks while payments are in flight, drop migration 003, delete test records, roll back database snapshots or replace production with old ZIPs. Existing order status/confirmation continue when new-purchase policy is disabled.

## Verification scope

Local Node regression/unit tests, local real PostgreSQL transactions and Chromium HTTPS behavior are evidence for the code only. Actual AWS deployment, Supabase migration, deployed-Lambda auth check and a hosted Razorpay Test transaction require the owner's account/configuration and approval and must be reported separately.

Provider contracts: [Razorpay server integration](https://razorpay.com/docs/payments/server-integration/nodejs/integration-steps/), [webhook validation](https://razorpay.com/docs/webhooks/validate-test/), [documented order receipt filter](https://github.com/razorpay/razorpay-php/blob/master/documents/order.md), [AWS HTTP API v2 payload/cookies](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html).
