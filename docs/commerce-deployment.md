# Single production commerce deployment

> Current status (2026-10-07): production stack and read-only Live authentication succeeded. The owner reports migration 003, certificate/domain/DNS and enabled Live webhook setup complete; do not rerun or recreate them. Hosted DNS/TLS/CORS/session and closed-purchase checks now pass. See [actual evidence](commerce-verification.md#hosted-connectivity-2026-10-07) and [frontend release preparation](commerce-frontend-release.md). `LiveApiApproved=true`, `PurchasesEnabled=false`; no new payment request or frontend activation is authorised by this status. The setup sections below are reference instructions, not remaining work to repeat.

**Current scope supersedes all earlier Test-stack deployment instructions. Do not apply the old Test administrator bundle.** Continue draft PR #5 and the implemented guest checkout. Deploy one stack only; local tests retain Test/Live fixtures but do not require any additional AWS environment.

| Setting | Production target |
| --- | --- |
| AWS account / region / profile | `521199095818` / `ap-south-1` / existing `sairn-deployer` |
| Stack | `khaga-commerce-prod` |
| Functions | `khaga-purchase-prod`, `khaga-confirm-purchase-prod` |
| Frontend origin | Exactly `https://khaga.slavant.com` |
| API domain | `commerce.slavant.com` |
| Secret | `khaga/prod/commerce` |
| Supabase | Existing KHAGA project; preserve data |
| Artifact bucket / prefix | `khaga-prod-artifacts-521199095818-ap-south-1` / `khaga-commerce-prod/` |
| CloudFormation role / runtime boundary | `khaga-prod-cloudformation` / `khaga-prod-runtime-boundary` |

The two existing native handlers, guest sessions, verified payments, raw-byte signed webhooks, idempotency, immutable order snapshots, recovery and protected admin remain. Hostinger serves the existing frontend/admin. The main Slavant website is unchanged. Merge does not deploy or open checkout.

## Administrator handoff

Apply only the [production IAM bundle and console steps](../infra/iam/README.md). The administrator creates the empty API **inside khaga-commerce-prod itself**, the private artifact bucket, production secret, runtime boundary, CloudFormation role and additive deployment policy. Its generated API ID and exact secret ARN are rendered into the policies using `scripts/render-prod-iam.py`. No separate bootstrap stack or SAM-managed bucket stack is needed. IAM PassRole is limited to required roles/services; only runtime roles read the exact production secret. No AdministratorAccess, Sairn permission changes, self-grants or Route 53 permissions.

Certificate/domain creation is administrator-owned. DNS stays at the existing provider: ACM validation CNAME plus `commerce.slavant.com` CNAME to the Regional API Gateway domain, with an empty API mapping to the production `$default` stage. Do not modify unrelated DNS/Hostinger sites.

Billable resources: two ARM64 256 MB Node.js 22 Lambda functions, HTTP API/default stage, two 14-day log groups, one Secrets Manager secret, private artifact storage and Regional API custom domain with non-exportable public ACM certificate. No VPC/NAT, EC2, extra database, provisioned concurrency or additional AWS test environment.

## Separate infrastructure, API access and purchases

| Control | Setup value | Meaning |
| --- | --- | --- |
| `Environment` / `COMMERCE_ENVIRONMENT` | `prod` | Resource naming only; the template allows only this environment |
| `PaymentMode` / `COMMERCE_MODE` | `live` | Payment/order namespace; the production template allows only Live |
| `CommerceSecretArn` | Exact production ARN | The only secret reference; no TestSecretArn or Test stack dependency |
| `LiveApiApproved` / `LIVE_API_APPROVED` | `false` | Requires explicit owner approval before any Razorpay Live API use |
| `PurchasesEnabled` / `PURCHASES_ENABLED` | `false` | New quote/order creation disabled; no new payment window offered by recovery |
| Database Live policy | Disabled until approved | Independently reviewed real shipping/tax/capacity policy |
| Hostinger `COMMERCE_API_BASE_URL` | Unset during setup | Existing guest checkout entry stays off until public activation is approved |

The runtime rejects mismatched secret mode/key prefix, incomplete credentials, production/Test mismatch, and unauthorised Live API use. Merely supplying Live keys or deploying `prod` is not API approval. After API approval, authentication, confirmation, signed webhooks and existing-order status/reconciliation remain available with purchases disabled. Disabling purchases does not discard in-flight orders or stop payment confirmation. Missing/false purchase flags fail closed before product reads, reservations or provider order creation. Enabling purchases also requires API approval in the CloudFormation rule.

The IAM deployment grant permits changing this stack's parameters; owner approvals are an operational requirement, not something IAM infers from a boolean. Do not set either approval gate automatically.

## Local validation and build

From the repository root:

```sh
npm test
npm run build
node scripts/build-commerce.mjs
sam validate --lint --template-file infra/template.yaml --region ap-south-1
sam validate --lint --template-file infra/iam/bootstrap-api.yaml --region ap-south-1
sam build --template-file infra/template.yaml --build-dir .aws-sam/build
```

On this Mac SAM is available in the installed uv environment: prefix each `sam ...` with `SAM_CLI_TELEMETRY=0 uv run --offline --no-project --with playwright --with aws-sam-cli`. AWS CLI is installed. Use explicit account/profile/region; do not change the profile's default region or inspect credential files.

The artifact allowlist contains only `src/` and the generated package manifest, with AWS SDK supplied by Lambda. No separate handoff ZIP or diagnostic application is produced. Local DB tests use disposable localhost PostgreSQL only:

```sh
initdb -D /tmp/khaga-commerce-pg -A trust --no-locale -E UTF8
pg_ctl -D /tmp/khaga-commerce-pg -l /tmp/khaga-commerce-pg.log -o '-p 55439 -h 127.0.0.1 -k /tmp' start
npm run test:commerce:db
```

Reuse an already-running disposable fixture instead of reinitialising it. Never point these fixtures at Supabase. Existing browser regression fixture: real HTTPS `shop.khaga.test:55440` and `api.khaga.test:55441`, local PostgreSQL and simulated Razorpay via `test/commerce/browser-server.mjs` and `test/commerce/browser-qa.py`. Local fixture amounts, taxes and Test keys are not production settings.

## Prepare the single stack with purchases off

After the administrator provides the production IAM setup, exact ARN and API ID:

1. Verify `aws sts get-caller-identity --profile sairn-deployer --region ap-south-1`; require account `521199095818`. Inspect stack and secret metadata only, never secret values. Missing permissions require administrator correction, not credential regeneration/self-grant.
2. Build this branch. Prepare the SAM change set without executing it:

   ```sh
   sam deploy --template-file .aws-sam/build/template.yaml \
     --config-file "$PWD/infra/samconfig.toml" --config-env prod \
     --profile sairn-deployer --region ap-south-1 \
     --no-execute-changeset \
     --parameter-overrides Environment=prod PaymentMode=live \
       LiveApiApproved=false PurchasesEnabled=false \
       CommerceSecretArn=ACTUAL_PRODUCTION_SECRET_ARN \
       FrontendOrigins=https://khaga.slavant.com
   ```

3. Review additions/updates and gates. The existing bootstrap `CommerceApi` must update in place, not be replaced. Exactly two functions must use production names and the mandatory production boundary. No Test/Acceptance/Staging/extra Live stack, unrelated resources, database operations or frontend activation. Execute the reviewed change-set ARN with `aws cloudformation execute-change-set --stack-name khaga-commerce-prod --change-set-name ACTUAL_CHANGE_SET_ARN --profile sairn-deployer --region ap-south-1`; wait for `stack-update-complete` and record outputs.
4. Keep `PurchasesEnabled=false` in every setup/redeployment command, and leave Hostinger guest entry off. Infrastructure preparation does not authorise provider requests.

## Deployed verification without a charge

**First payment call: the existing IAM-only read-only authentication check from deployed Purchase.** Before invoking it, obtain explicit owner confirmation for Live API access and set only `LiveApiApproved=true` through another reviewed change set. Keep `PurchasesEnabled=false`, `PaymentMode=live` and the same production ARN/origin. No product, shipping/tax policy or migration is needed for this check.

```sh
aws lambda invoke --profile sairn-deployer --region ap-south-1 \
  --function-name khaga-purchase-prod --cli-binary-format raw-in-base64-out \
  --payload '{"operatorAction":"razorpay-auth-check"}' /tmp/khaga-prod-auth-result.json
```

Inspect only the safe status/error/request ID. It performs `GET /v1/orders?count=1`; it creates no payment/order and makes no charge. Require the returned mode to be `live`. The earlier Mac Test-pair result is not evidence for these Live credentials, and moving to Lambda is not a fix for authentication. On failure check the intended function, non-sensitive configuration references and privately entered matching Live pair; never dump secret/provider responses or rotate working keys speculatively.

After authentication passes and Supabase migration approval is available:

1. Verify existing migrations and take the existing project's normal recovery snapshot/backup before applying additive `migrations/003_commerce.sql` if absent, using the owner SQL editor. Preserve catalogue/admin data, legacy test orders, commerce Test orders/events and all payment mode values. Do not drop/reseed tables or relabel records. Do not insert fixture policies/products. Existing migrations 001/002 are prerequisites, not permission to reset the project.
2. With purchases still disabled, verify the public quote/create path cannot reserve stock or create gateway orders. Keep the frontend entry off; use the existing API routes for controlled checks, not a new diagnostic app.
3. Register the **Live** webhook `https://commerce.slavant.com/payments/razorpay/webhook` using the production `webhookSecret`, for `payment.captured`, `payment.authorized`, `payment.failed`, `order.paid`, `refund.processed`. Verify invalid signatures return rejection and produce no event/order transition. Verify an authentic provider delivery or replay of a known KHAGA event where available, including duplicate delivery idempotency. Do not fabricate captured Live payments or send Test-mode payloads as evidence of Live acceptance.
4. Read an existing compatible KHAGA commerce order if one exists, verify mode/amount/status and protected admin visibility, redeploy with purchases disabled, and verify the same persisted order/event references afterwards. Historical Test records remain Test and may support historical-data retention evidence only. No compatible Live order/event currently supplied means actual Live payment persistence/reconciliation evidence remains pending; report that limitation.
5. A privately signed, clearly labelled non-payment event may verify signature transport and event persistence if separately authorised, but cannot prove a captured Live order. No such probe is sent automatically. Full new-purchase/paid-order acceptance requires an explicitly approved real-money transaction if there is no suitable existing event/order.

A real-money validation purchase needs the owner's explicit confirmation of product/variant, quantity, actual payable amount, payer and fulfilment handling before any payment attempt. Arrange an owner-only access window before temporarily enabling purchases; do not expose public checkout or insert simulated production tax/shipping settings. No validation charge or automatic refund is authorised. Public activation remains a separate approval after the evidence is reviewed.

## Production policy and safe rollout

Only approved, real production settings belong in the `live` row of `khaga_private.commerce_policy`: `mode`, `enabled`, `version`, `shippingPaise`, `freeShippingAt`, `taxBps`, `taxTreatment`, `taxShipping`, `taxNote`. Confirm sample approvals, genuine finite stock/preorder capacity, dispatch promises, and published retail prices in existing admin. Reservations count against capacity; do not subtract sold units twice. No settings are silently invented or seeded by migration 003.

After the owner's separate launch approval, enable the reviewed Live policy, update the two functions through the production change set with `PurchasesEnabled=true`, and configure only KHAGA's frontend with `COMMERCE_API_BASE_URL=https://commerce.slavant.com`. Verify exact-origin cookies/CSRF, guest checkout, verified payment, protected admin visibility, webhook recovery and persistence. The launch steps are documented, not executed by this handoff.

To close new sales, set `PurchasesEnabled=false` and turn off KHAGA guest entry. Keep Live API approval and confirmation/webhook/recovery running for outstanding orders. Do not delete stacks, drop migration 003, restore stale database snapshots, remove historical records or replace production with old archives. Redeploy the last reviewed code through the same stack.

## Remaining blockers and evidence

All genuine owner/admin prerequisites are collected in the [administrator handoff](../infra/iam/README.md#immediate-setup-and-remaining-blockers). No Test product/fixture approval or additional AWS environment is required. Report local automated results separately from deployed authentication, webhook and order-persistence evidence. Real-money verification and public activation always require their own explicit approvals. PR #5 remains a draft pending hosted acceptance.
