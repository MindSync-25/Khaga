> Current Test handoff: [administrator IAM bundle, private secret provisioning, DNS steps and purchase-only choices](../infra/iam/README.md). Account `521199095818`, profile `sairn-deployer`, region `ap-south-1` are confirmed. Administrator permissions and the exact Test secret ARN remain outstanding. Infrastructure/authentication precede any database or business-policy changes.

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

1. **After the deployed-Lambda authentication check and database approval**, review `migrations/003_commerce.sql`, then apply it through the existing Supabase SQL editor as database owner after migrations 001/002. It is additive and re-runnable. Preserve `test_orders`, `test_payment_events`, catalogue/admin data and ambiguous legacy records. No data is migrated or deleted. Private tables have RLS and public execution is revoked; only `service_role` can invoke the commerce RPC.
2. For the approved Test deployment, create only the encrypted Test JSON secret in AWS Secrets Manager. A separate Live secret is required only after future Live approval. Use the AWS console/SSO or an approved secure input channel, never raw secrets in chat, shell arguments, repository files, CI output or browser bundles. The schema is: `mode`, `keyId`, `keySecret`, `webhookSecret`, `sessionSecret`, `supabaseURL`, `secretKey`. Use separate random webhook and session secrets (at least 24 and 32 characters respectively); they must differ from each other and the Razorpay secret. Use the existing Supabase server credential. Only each environment's selected secret ARN is granted to its Lambda execution roles. The default Secrets Manager encryption key works without additional KMS grants; a customer-managed key needs a separately reviewed, scoped decrypt grant.
3. Insert a reviewed policy row into `khaga_private.commerce_policy`. No policy is seeded by the production migration. `settings` fields are `mode` (`test`/`live`), `enabled` (boolean), `version` (increment on edits), `shippingPaise` (integer), `freeShippingAt` (integer or null), `taxBps` (0–10000), `taxTreatment` (`inclusive`/`exclusive`), `taxShipping` (boolean), `taxNote` (approved text). Missing settings fail closed. Tax rounds once at order level; ensure that is the approved business rule.
4. Review published products in existing admin: prices in paise, `sampleApproved=true`, sellable `stock`/`preorder` variants, quantity/capacity and preorder dispatch range. Unavailable/unapproved variants cannot be purchased.

## Test deployment (scope approved; administrator setup pending)

Complete the [administrator handoff](../infra/iam/README.md), then use `infra/samconfig.toml` and deploy the built template. Parameters contain references, never secrets:

```sh
sam deploy --template-file .aws-sam/build/template.yaml \
  --config-file "$PWD/infra/samconfig.toml" --config-env test \
  --profile sairn-deployer --region ap-south-1 \
  --parameter-overrides Environment=test LiveApproved=false \
    TestSecretArn=YOUR_TEST_SECRET_ARN FrontendOrigins=https://khaga.slavant.com
```

Review the change set before execution. Live does not need to be provisioned to deploy Test. Outputs are `ApiUrl`, `WebhookUrl`, `PurchaseFunction` and `ConfirmFunction`. HTTP routes:

| Function | Routes |
| --- | --- |
| Purchase | POST `/checkout/session`, POST `/checkout/quote`, POST `/purchase` |
| ConfirmPurchase | POST `/confirm-purchase`, POST `/payments/razorpay/webhook`, GET `/orders/{id}`, POST `/orders/{id}/reconcile` |

### Resolve the known 200-local / 401-Hostinger issue early

The FIRST payment check after provisioning must be this IAM-only check from the deployed Purchase Lambda. Reuse the matching Test-key pair that already passed on the owner’s Mac; do not regenerate it. After the Test stack and securely stored Test secret exist, invoke the deployed purchase function directly with IAM authorization (not an HTTP route). This performs only `GET /v1/orders?count=1` and returns safe success/error/status codes and the AWS request ID:

```sh
aws lambda invoke --profile sairn-deployer --region ap-south-1 \
  --function-name khaga-purchase-test --cli-binary-format raw-in-base64-out \
  --payload '{"operatorAction":"razorpay-auth-check"}' /tmp/khaga-auth-result.json
```

Inspect only that safe result. Do not print secret contents or provider responses. A 401/400 authentication error is not evidence Lambda fixes the existing issue: verify account/region/function environment, selected secret ARN/version, Test mode/key prefix, exact matching pair and request construction. Check that the intended deployment is invoked and permit the one-minute secret cache to refresh. Compare the Hostinger configuration source without copying secrets to logs. Do not repeatedly rotate or regenerate shared credentials.

## API subdomain, certificate and browser security

Prefer `commerce-test.slavant.com` for Test and `commerce.slavant.com` for Live. The execution API URL is suitable for the initial IAM auth check/webhook testing, but is cross-site to slavant.com. The signed cookie deliberately uses `SameSite=Lax`; **do not launch the browser flow against an execute-api domain** or loosen it to work around third-party-cookie restrictions.

After DNS/cost approval:

1. Request an ACM public certificate in the same region as the HTTP API, for the exact selected API subdomain. Add its DNS validation CNAME in the existing DNS provider only after approval.
2. Create a Regional API Gateway custom domain with that ACM ARN and TLS 1.2; map its empty API path to this HTTP API's `$default` stage. No additional Lambda is required.
3. Add the API Gateway target CNAME/alias for that subdomain in the existing DNS provider only after approval. Do not change the existing `khaga.slavant.com` storefront record or the main Slavant website.
4. Set `FrontendOrigins=https://khaga.slavant.com` exactly. This is the existing KHAGA storefront; do not add the main Slavant site or a www origin. Wildcards are forbidden. Browser requests use `credentials: include`; the API independently requires the signed guest cookie, exact Origin and CSRF for mutations. Admin cookies are not used by Lambda.
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


## Hosted Test approval scope (prepared 2026-10-06; not deployed)

The storefront origin is exactly `https://khaga.slavant.com`. The main Slavant website is outside this deployment. PR #5 remains a draft.

Access inventory: AWS CLI 2.36.44 is installed; SAM CLI 1.166.2 is available in the existing uv environment, not directly on PATH. Use `SAM_CLI_TELEMETRY=0 uv run --offline --no-project --with playwright --with aws-sam-cli sam ...` for the installed SAM environment. The only configured profile is `sairn-deployer` with configured region `us-east-1`. The owner selected `sairn-deployer` for KHAGA. STS verified account `521199095818` and IAM user `arn:aws:iam::521199095818:user/sairn-deployer` (not an assumed role). Authentication is valid; no login is needed. This establishes identity, not deployment permissions. No credentials or credential files were printed. Confirmed KHAGA region: `ap-south-1` (Mumbai). No profile defaults are changed.

The read-only identity check completed successfully using `sairn-deployer` and `us-east-1`. Before future deployment sessions, recheck the selected identity:

```sh
aws sts get-caller-identity --profile SELECTED_PROFILE --region SELECTED_REGION --no-cli-pager
```

If that reports missing/expired authentication, provide the specific login step for the selected profile's authentication method. Do not request access keys or session tokens in chat or assume an SSO login command applies to an unknown profile type.

Approval covers a dedicated `khaga-commerce-test` SAM stack: two 256 MB ARM64 Node.js 22 functions (`khaga-purchase-test`, `khaga-confirm-purchase-test`), their execution roles and scoped policies, HTTP API/default stage and seven route integrations with Lambda invocation permissions, and two CloudWatch log groups with 14-day retention. Supporting setup includes one Test Secrets Manager secret, an administrator-created private S3 artifact bucket with the fixed Test prefix (no SAM-managed bucket/bootstrap stack), a Regional API Gateway custom domain/API mapping and one non-exportable public ACM certificate. No Live stack, VPC, NAT, EC2, database replacement, new hosted zone or provisioned concurrency is proposed.

Low-volume planning allowance: **US$1–3/month**, before tax and without relying on free-tier credits, for 10,000 API/Lambda requests per month, average 2 seconds at 256 MB, one secret, at most 0.5 GB log ingestion and 0.1 GB deployment artifacts. This is an estimate, not a spending cap; regional rates, retries, traffic and logs affect the bill. Existing Supabase/Hostinger charges are excluded. Secrets Manager lists $0.40/secret/month plus request charges; public non-exportable ACM certificates integrated with API Gateway have no certificate charge. No DNS hosting charge is assumed because records will be added at the existing DNS provider. Sources checked: [API Gateway](https://aws.amazon.com/api-gateway/pricing/), [Lambda](https://aws.amazon.com/lambda/pricing/), [Secrets Manager](https://aws.amazon.com/secrets-manager/pricing/), [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/), [S3](https://aws.amazon.com/s3/pricing/), [ACM](https://aws.amazon.com/certificate-manager/pricing/).

Proposed secret name: `khaga/test/commerce`, encrypted with the AWS-managed Secrets Manager key. After approval, use the authenticated AWS console to enter `mode=test`, the existing matching Razorpay Test key pair that passed on the Mac, existing Supabase URL/server key, and newly generated independent webhook/session secrets. Do not rotate the existing Razorpay or Supabase credentials. Keep all values out of chat, CLI arguments, logs and Git; share only the resulting secret ARN. The Lambda roles receive access only to that ARN. The console is the proposed provisioning method unless an already-approved secure transfer method is selected.

Proposed API hostname remains `commerce-test.slavant.com`. Add only ACM's generated validation CNAME and the API hostname CNAME/alias targeting the Regional API Gateway domain, plus its empty-path mapping to this Test API. Exact generated record names/targets will be reviewed after certificate/domain creation. Preserve both the `khaga.slavant.com` storefront record and all main Slavant records. The certificate must be in the approved API region.

Account/profile/region and Secrets Manager provisioning are now confirmed. Remaining purchase-only choices, including the public catalogue proposal and shared sample/capacity constraints, are collected in the [administrator handoff](../infra/iam/README.md#deployment-order-and-purchase-only-choices). They do not block infrastructure or the IAM-only authentication check.

Execution order after scope approval: provision Test infrastructure and securely provision its Test secret; **FIRST payment check: invoke `operatorAction=razorpay-auth-check` through IAM on deployed Purchase**; investigate any failure in that deployed configuration without regenerating the known matching keys; then apply the approved additive Supabase migration/policy, configure the approved certificate/DNS/webhook, and deploy the branch's KHAGA frontend with the exact API base. Run the guest product → bag → quote → hosted Test payment → verified saved order → protected admin flow, the missed-callback/webhook flow, then redeploy and recheck persistence. Report deployed AWS/Supabase/Razorpay evidence separately from the existing local/mocked results. Live activation needs separate approval after hosted acceptance passes.


## Approved deployment attempt: access blockers

The owner approved the proposed Test scope and instructed execution. No further scope approval is required for that Test setup. Deployment preflight in `ap-south-1`, using the selected `sairn-deployer` profile, verified account `521199095818` again but received the following AWS authorization failures:

| Read-only operation | Result |
| --- | --- |
| `sts:GetCallerIdentity` | Success: IAM user `sairn-deployer`; authentication is valid |
| `cloudformation:DescribeStacks` for `khaga-commerce-test` | AccessDenied: no identity-based policy allows the action |
| `secretsmanager:DescribeSecret` for `khaga/test/commerce` | AccessDenied: no identity-based policy allows the action |
| `acm:ListCertificates` | AccessDenied: no identity-based policy allows the action |
| `route53:ListHostedZonesByName` | AccessDenied: no identity-based policy allows the action |

These denials do not establish whether a KHAGA stack or secret already exists. An expired login is not the issue; do not rotate credentials or repeat login as a remedy. The deployment cannot safely proceed until an account administrator supplies a deployment-capable role/profile or grants appropriately scoped KHAGA Test permissions. No attempt was made to grant privileges to the existing Sairn identity.

The earlier broad access request is replaced by the [exact administrator IAM bundle](../infra/iam/README.md). Use the existing `sairn-deployer` identity, a dedicated CloudFormation role, bounded Lambda roles, and an explicit artifact bucket. The administrator provisions the supporting secret/certificate/domain and first empty API; rendered policies scope subsequent deployment to its actual API ID and secret ARN. No alternative profile, self-grant, AdministratorAccess, existing Sairn policy changes, or Route 53 access is requested.

Public DNS currently delegates `slavant.com` to `ns1.dns-parking.com` and `ns2.dns-parking.com`; no A or CNAME answer was returned for `commerce-test.slavant.com`. The Test records need access to the existing DNS provider, not a new Route 53 hosted zone. Route 53 access is therefore unnecessary if DNS is managed through the current provider. Only the ACM validation record and Test API hostname record are in scope.

No relevant Razorpay, Supabase or Hostinger variables were present in the deployment process environment, and no private `.env` file existed in the KHAGA workspace. No credential files or secret values were printed. The owner will enter the existing matching Test pair and Supabase configuration privately in Secrets Manager and supply only its ARN; no local payment-secret file is requested. Business policy values still need explicit Test settings; a general deployment approval does not invent shipping, tax, retail price or capacity values.

Local SAM validation/build completed; AWS resource creation, production Supabase migration, DNS changes, Hostinger update and payment checks have not begun. The next step remains permission/secure-input resolution, followed by provisioning. The first payment check remains the deployed Purchase Lambda IAM-only authentication check; no local Razorpay request was made during this attempt. Hosted acceptance remains pending and must be reported separately from local fixture results.
