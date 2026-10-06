# KHAGA Test administrator handoff

Account **521199095818**, region **ap-south-1**, existing IAM user/profile **sairn-deployer**. This is an additive KHAGA-only grant. Keep the existing Sairn policies and profile defaults unchanged. Do not attach AdministratorAccess. The denied deployer must not run these administrator steps.

No permission has been applied. JSON templates must be rendered with the real secret ARN and API ID before attachment. These policies are scoped to this template, not a general SAM deployment account. Organisation SCPs, an existing user boundary, or explicit denies can still block them. The administrator should review IAM console validation findings; AWS deployment validation remains pending.

## Documents and separation

| File | Applied to / purpose |
| --- | --- |
| `cloudformation-trust.json` | Trust on role `khaga-test-cloudformation`; only CloudFormation service may assume it |
| `cloudformation-execution.template.json` | Role inline policy `khaga-test-resources`; exactly two functions, generated roles, two log groups, one API/default stage, artifact reads |
| `runtime-boundary.template.json` | Customer managed policy `khaga-test-runtime-boundary`; maximum effective permissions of the two Lambda roles |
| `deployer-additions.template.json` | Customer managed policy `khaga-test-deploy`; attach only to existing user `sairn-deployer` |
| `artifact-bucket-policy.json` | TLS-only policy on dedicated private artifact bucket |
| `bootstrap-api.yaml` | Administrator creates the empty API in the SAME stack, to obtain its ID before granting API management |

`iam:PassRole` is restricted to the one CloudFormation role for the deployer, and to the two stack-generated Lambda role name prefixes for CloudFormation, each with the corresponding service condition. The random role suffixes are assigned by CloudFormation; no Sairn role prefix matches. Creation requires the exact administrator-owned boundary, and the execution policy cannot remove/change that boundary or edit its managed policy. SAM's basic logging policy is bounded to the two log streams; the roles cannot create other log groups. CloudFormation creates the two declared groups.

Only the Lambda roles can retrieve the exact supplied Test secret ARN. Neither the deployer nor the CloudFormation role receives `GetSecretValue`, `PutSecretValue`, secret creation, or KMS grants. Use AWS-managed `aws/secretsmanager`, not a customer KMS key. These additive documents do not revoke any pre-existing permissions; the administrator should check effective access without modifying Sairn grants.

The sole unrestricted-resource permission in the execution policy is `logs:DescribeLogGroups`, a read-only listing action scoped to Mumbai because it does not support individual group resources. No Route 53 permission is included. API permissions contain the actual API ID, never `/apis/*`. Tag endpoints include only that API and its `$default` stage. Stage creation is limited to that API's stages collection; AWS does not let its collection ARN restrict the new stage name. No general API creation permission is given to the deployment role.

AWS references: [CloudFormation service roles](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-iam-servicerole.html), [PassRole](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_passrole.html), [SAM PermissionsBoundary](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-resource-function.html), [API Gateway resource scoping](https://docs.aws.amazon.com/service-authorization/latest/reference/list_apigatewayv2.html), [CloudFormation IAM actions](https://docs.aws.amazon.com/service-authorization/latest/reference/list_cloudformation.html).

## Administrator console steps

1. Sign in using your existing authorised administrator identity in account **521199095818**. Select **Asia Pacific (Mumbai), ap-south-1**. Inspect CloudFormation for an existing `khaga-commerce-test` stack and Secrets Manager for `khaga/test/commerce`. Earlier AccessDenied results do not prove absence. If either exists, inspect ownership and reuse only the approved KHAGA resource; do not overwrite an unknown resource or recreate existing secrets.
2. Have the owner provision the Test secret using the private steps below. Record only its complete ARN, including AWS's six-character suffix.
3. S3 → Create bucket → General purpose → name `khaga-test-artifacts-521199095818-ap-south-1`, Mumbai. Keep **Block all public access ON**, **Object ownership: Bucket owner enforced**, **SSE-S3 encryption**. No public ACL, website hosting or bucket bootstrap stack. Create it only if absent; if already present verify account/ownership/settings. Permissions → Bucket policy → paste `artifact-bucket-policy.json`. The deployer can upload/read only `khaga-commerce-test/`. Do not add an expiry rule that could remove artifacts needed for rollback.
4. If the Test stack is absent: CloudFormation → Create stack → With new resources → Choose existing template → Upload `bootstrap-api.yaml` → stack name **khaga-commerce-test** → no service role yet (use your authorised administrator identity) → review → Create stack. This creates only an empty HTTP API: no routes, Lambda, secret access or payment request. Wait for `CREATE_COMPLETE`; record Outputs → `TestApiId`. If the stack exists, use Resources → **CommerceApi** → physical ID instead; verify it is this stack's HTTP API. Do not bootstrap over an existing stack. This one-time step makes the API ID available so subsequent role permissions can exclude all other APIs.
5. Render the policy documents locally with the two non-sensitive references:

   ```sh
   python3 scripts/render-test-iam.py \
     --secret-arn 'ACTUAL_TEST_SECRET_ARN' \
     --api-id 'ACTUAL_TEST_API_ID' \
     --output /private/tmp/khaga-test-iam-rendered
   ```

   The renderer rejects the wrong account, region, secret name, or unresolved values. ARN and API ID are references, not credentials. Never attach placeholder templates.
6. IAM → Policies → Create policy → JSON → paste rendered `runtime-boundary.json` → name **khaga-test-runtime-boundary** → Create. ARN must be `arn:aws:iam::521199095818:policy/khaga-test-runtime-boundary`. Do not attach this policy to the deployer; the SAM template uses it as the Lambda roles' boundary.
7. IAM → Roles → Create role → **Custom trust policy** → paste `cloudformation-trust.json` → no broad managed policy → role name **khaga-test-cloudformation** → Create. Role → Permissions → Add permissions → Create inline policy → JSON → paste rendered `cloudformation-execution.json` → name **khaga-test-resources**. The trust deliberately trusts only the CloudFormation service, with caller access constrained by `PassRole` and the stack-scoped deploy policy. Do not add an unverified `aws:SourceArn` trust condition that the stack service may not supply.
8. IAM → Policies → Create policy → JSON → rendered `deployer-additions.json` → name **khaga-test-deploy**. IAM → Users → **sairn-deployer** → Permissions → Add permissions → Attach policies directly → select **only khaga-test-deploy** → Add. Preserve every existing Sairn policy, group and boundary. Do not attach the execution policy to the user. Review any existing principals with write access to this stack: a CloudFormation service role remains associated with the stack after deployment.
9. Return only: setup completed, secret ARN, Test API ID, and any non-sensitive IAM validation/denial details. No credentials, secret JSON, keys or credential files. The agent will recheck STS and stack/secret metadata, build this branch, review the SAM change set and deploy through the role. If the change set replaces `CommerceApi` instead of updating it in place, stop and investigate; do not broaden API permissions to compensate. The bootstrap uses inline OpenAPI `Body`, like SAM's transformed API, to preserve its logical/physical identity.

There are no IAM permissions to alter the existing user, grant policies, create buckets, create certificates, create domains, change DNS or provision secrets in the deployer additions. Administrator-owned supporting resources are created through the explicit console steps here. Template deployments manage the existing stack through SAM change sets; direct stack deletion and arbitrary API replacement are not granted. Administrator involvement is required for an intentional API replacement or stack recovery needing permissions beyond this deployment path.

## Private Test secret provisioning

Independent random webhook/session secrets have been generated locally in a private temporary directory; see the handoff message for its path. Directory mode is `0700`; each file is `0600`; each value contains 32 bytes of cryptographic randomness encoded as 64 hex characters. No existing payment or Supabase credentials were read or regenerated. Temporary files are not durable: transfer them privately to your password manager and AWS before cleanup. Running the generator again creates a different pair; use the already-generated pair for this setup.

1. AWS console → Mumbai → Secrets Manager → Store a new secret → **Other type of secret** → Key/value pairs. Enter exactly these seven string fields privately:

   | Field | Value source |
   | --- | --- |
   | `mode` | `test` |
   | `keyId` | Existing `rzp_test_…` ID that passed on the Mac |
   | `keySecret` | Its existing matching Test secret; do not regenerate |
   | `webhookSecret` | Generated private `webhookSecret.txt` |
   | `sessionSecret` | Generated private `sessionSecret.txt`, independent of the webhook secret |
   | `supabaseURL` | Existing working `https://PROJECT.supabase.co` URL |
   | `secretKey` | Existing working Supabase server credential; never an anon/browser key |

2. To copy one generated value without displaying it, run locally (replace the directory with the provided path):

   ```sh
   python3 scripts/prepare-test-secrets.py --directory /private/tmp/khaga-test-secrets-EXACT --copy webhookSecret
   # Paste privately into the matching console value field, then:
   pbcopy < /dev/null
   python3 scripts/prepare-test-secrets.py --directory /private/tmp/khaga-test-secrets-EXACT --copy sessionSecret
   # Paste privately into the matching console value field, then:
   pbcopy < /dev/null
   ```

3. Encryption key: **aws/secretsmanager**. Next → Secret name **khaga/test/commerce** → no resource sharing policy → automatic rotation OFF → Store. Preserve the matching payment pair byte-for-byte; do not introduce quotes or whitespace around values. Do not paste the secret JSON into chat or Git.
4. Open secret details → copy **Secret ARN**, not Retrieve secret value. Provide only that ARN. Use the same `webhookSecret` privately when registering the later Razorpay **Test** webhook.

## Certificate and DNS: existing provider only

These administrator console steps can follow the Lambda authentication check; they are not prerequisites for it.

1. ACM in **ap-south-1** → Request certificate → Public → domain **commerce-test.slavant.com** only → DNS validation → RSA 2048 → export disabled → Request. No wildcard certificate. Record its ARN and ACM validation CNAME name/value.
2. At the existing DNS provider, add only ACM's supplied validation CNAME; avoid doubling `slavant.com` if the DNS editor appends the zone. Do not use “Create records in Route 53”. Wait for ACM **Issued**.
3. API Gateway in Mumbai → Custom domain names → Create → **commerce-test.slavant.com** → Regional → select the issued certificate → TLS 1.2 → Create. The authorised administrator handles any first-use `AWSServiceRoleForAPIGateway` prerequisite. API mappings → select the exact KHAGA Test API ID → `$default` stage → empty mapping path → Save.
4. Copy the generated API Gateway regional domain target. At the existing provider add **commerce-test** CNAME → that target (DNS-only, if proxying is offered). Preserve `khaga.slavant.com` and all main Slavant records. Verify HTTPS and then use API base `https://commerce-test.slavant.com`; `FrontendOrigins` stays exactly `https://khaga.slavant.com`.

Certificate/domain creation is administrator-owned to avoid giving the deployer account-wide ACM/API domain creation privileges. Share only the certificate ARN and generated DNS records/target for verification. No hosted zone or Route 53 access is needed.

## Deployment order and purchase-only choices

Use the Test configuration in `infra/samconfig.toml`: explicit bucket/prefix and role, Mumbai and the existing profile. After `node scripts/build-commerce.mjs`, build with the documented installed SAM command and `sam build --template-file infra/template.yaml`. Deploy `.aws-sam/build/template.yaml` with `--config-file "$PWD/infra/samconfig.toml" --config-env test` (use an absolute config path from the repository root), exact secret ARN, `Environment=test LiveApproved=false FrontendOrigins=https://khaga.slavant.com`. Review the change set before execution. No SAM-managed artifact stack is needed.

**FIRST payment check after provisioning:**

```sh
aws lambda invoke --profile sairn-deployer --region ap-south-1 \
  --function-name khaga-purchase-test --cli-binary-format raw-in-base64-out \
  --payload '{"operatorAction":"razorpay-auth-check"}' /tmp/khaga-auth-result.json
```

Inspect only the implementation's safe status/error/request-ID result. This is the deployed Purchase Lambda's read-only Razorpay authentication check. It needs no sellable product, database migration, shipping policy, tax policy, custom domain or webhook. Use the matching Test pair already validated on the Mac. Moving to Lambda does not establish that authentication works; report its actual outcome and investigate any failure without rotating that pair.

Subsequent purchase proposal, based on the public catalogue read on 2026-10-06: **Origin Tee (`origin-tee`), ivory, M, quantity 1, published unit price ₹2,990 (299000 paise)**. Re-read the published price before purchase; do not rewrite it. Proposed **SIMULATED TEST ONLY** shipping ₹0 and tax ₹0, total ₹2,990. These are not Live prices, tax advice or a Live fulfilment policy.

All purchase-only choices still requiring confirmation are collected here; none blocks infrastructure/authentication:

| Item | Current evidence / approval needed |
| --- | --- |
| Product sample approval | `sampleApproved=false`; do not mark approved without a genuine authorised sample decision |
| Ivory/M availability | `mode=unavailable`, `qty=0`; owner must approve actual finite stock/capacity and sale mode before enabling |
| Dispatch window | `dispatchMin=null`, `dispatchMax=null`; provide truthful values if selecting preorder |
| Catalogue isolation | Product/sample/capacity fields are shared catalogue fields, not segregated by Test/Live. Approve any genuine changes explicitly, or choose an isolated Test catalogue/database strategy; do not simulate approval in the shared catalogue |
| Test policy | Approve a Test-only policy with zero shipping, no free-shipping threshold, zero tax, exclusive treatment, no shipping tax, and wording “SIMULATED TEST ONLY — zero shipping and zero tax; not a Live policy.” Keep the Live policy unchanged |
| Database / hosted acceptance | Confirm the migration target and approval for additive migration 003, plus the KHAGA-only frontend acceptance window/access; no migration or Hostinger update is performed as part of this handoff |

After authentication passes and those choices are resolved: configure the approved Test policy/catalogue, hosted frontend and Test webhook; verify guest purchase → verified stored order → protected admin → webhook recovery → persistence after redeployment. Record real hosted results separately from local/mocked tests. **Live remains disabled and requires later explicit activation approval.**
