# KHAGA single production administrator handoff

**This replaces the old Test-scoped bundle. Do not apply that bundle. No Test, Acceptance, Staging or separate Live stack is required.**

Account **521199095818**, region **ap-south-1**, existing IAM user/profile **sairn-deployer**. This is an additive KHAGA-only grant. Keep the existing Sairn policies and profile defaults unchanged. Do not attach AdministratorAccess. The denied deployer must not run these administrator steps.

No permission has been applied by this agent. No infrastructure was provisioned by this agent under the old bundle. JSON templates must be rendered with the real secret ARN and API ID before attachment. These policies are scoped to this template, not a general SAM deployment account. Organisation SCPs, an existing user boundary, or explicit denies can still block them. The administrator should review IAM console validation findings; AWS deployment validation remains pending.

## Documents and separation

| File | Applied to / purpose |
| --- | --- |
| `cloudformation-trust.json` | Trust on role `khaga-prod-cloudformation`; only CloudFormation service may assume it |
| `cloudformation-execution.template.json` | Role inline policy `khaga-prod-resources`; exactly two functions, generated roles, two log groups, one API/default stage, artifact reads |
| `runtime-boundary.template.json` | Customer managed policy `khaga-prod-runtime-boundary`; maximum effective permissions of the two Lambda roles |
| `deployer-additions.template.json` | Customer managed policy `khaga-prod-deploy`; attach only to existing user `sairn-deployer` |
| `artifact-bucket-policy.json` | TLS-only policy on dedicated private artifact bucket |
| `bootstrap-api.yaml` | Administrator creates the empty API in the SAME stack, to obtain its ID before granting API management |

`iam:PassRole` is restricted to the one CloudFormation role for the deployer, and to the two stack-generated Lambda role name prefixes for CloudFormation, each with the corresponding service condition. The random role suffixes are assigned by CloudFormation; no Sairn role prefix matches. Creation requires the exact administrator-owned boundary, and the execution policy cannot remove/change that boundary or edit its managed policy. SAM's basic logging policy is bounded to the two log streams; the roles cannot create other log groups. CloudFormation creates the two declared groups.

Only the Lambda roles can retrieve the exact supplied production secret ARN. Neither the deployer nor the CloudFormation role receives `GetSecretValue`, `PutSecretValue`, secret creation, or KMS grants. Use AWS-managed `aws/secretsmanager`, not a customer KMS key. These additive documents do not revoke any pre-existing permissions; the administrator should check effective access without modifying Sairn grants.

The sole unrestricted-resource permission in the execution policy is `logs:DescribeLogGroups`, a read-only listing action scoped to Mumbai because it does not support individual group resources. No Route 53 permission is included. API permissions contain the actual API ID, never `/apis/*`. Tag endpoints include only that API and its `$default` stage. Stage creation is limited to that API's stages collection; AWS does not let its collection ARN restrict the new stage name. No general API creation permission is given to the deployment role.

AWS references: [CloudFormation service roles](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-iam-servicerole.html), [PassRole](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_passrole.html), [SAM PermissionsBoundary](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-resource-function.html), [API Gateway resource scoping](https://docs.aws.amazon.com/service-authorization/latest/reference/list_apigatewayv2.html), [CloudFormation IAM actions](https://docs.aws.amazon.com/service-authorization/latest/reference/list_cloudformation.html).

The execution role also needs `cloudformation:CreateChangeSet` on exactly `arn:aws:cloudformation:ap-south-1:aws:transform/Serverless-2016-10-31` to process SAM. `UseSamTransform` in the source execution policy includes this grant. The administrator applied its equivalent as the separate inline policy `khaga-prod-sam-transform`, leaving the existing resources and trust policies unchanged; either arrangement gives the same transform-only permission. No additional stack or wildcard transform permission is required. The deployer separately needs `GetTemplateSummary` on the existing production stack, now included in its source policy. Do not modify AWS IAM from the deployment session.

## Administrator console steps

1. Sign in using your existing authorised administrator identity in account **521199095818**. Select **Asia Pacific (Mumbai), ap-south-1**. Inspect CloudFormation for an existing `khaga-commerce-prod` stack and Secrets Manager for `khaga/prod/commerce`. Earlier AccessDenied results do not prove absence. If either exists, inspect ownership and reuse only the approved KHAGA resource; do not overwrite an unknown resource or recreate existing secrets.
2. Have the owner provision the production secret using the private steps below. A Live-key pair and explicit Live API access approval are still outstanding; infrastructure approval does not authorise provider requests or charges. Record only its complete ARN, including AWS's six-character suffix.
3. S3 → Create bucket → General purpose → name `khaga-prod-artifacts-521199095818-ap-south-1`, Mumbai. Keep **Block all public access ON**, **Object ownership: Bucket owner enforced**, **SSE-S3 encryption**. No public ACL, website hosting or bucket bootstrap stack. Create it only if absent; if already present verify account/ownership/settings. Permissions → Bucket policy → paste `artifact-bucket-policy.json`. The deployer can upload/read only `khaga-commerce-prod/`. Do not add an expiry rule that could remove artifacts needed for rollback.
4. If the production stack is absent: CloudFormation → Create stack → With new resources → Choose existing template → Upload `bootstrap-api.yaml` → stack name **khaga-commerce-prod** → no service role yet (use your authorised administrator identity) → review → Create stack. Do not create another bootstrap stack. This creates only an empty production HTTP API: no routes, Lambda, secret access or payment request. Wait for `CREATE_COMPLETE`; record Outputs → `ProdApiId`. If the stack exists, use Resources → **CommerceApi** → physical ID instead; verify it is this stack's HTTP API. Do not bootstrap over an existing stack. This one-time step makes the API ID available so subsequent role permissions can exclude all other APIs.
5. Render the policy documents locally with the two non-sensitive references:

   ```sh
   python3 scripts/render-prod-iam.py \
     --secret-arn 'ACTUAL_PROD_SECRET_ARN' \
     --api-id 'ACTUAL_PROD_API_ID' \
     --output /private/tmp/khaga-prod-iam-rendered
   ```

   The renderer rejects the wrong account, region, secret name, or unresolved values. ARN and API ID are references, not credentials. Never attach placeholder templates.
6. IAM → Policies → Create policy → JSON → paste rendered `runtime-boundary.json` → name **khaga-prod-runtime-boundary** → Create. ARN must be `arn:aws:iam::521199095818:policy/khaga-prod-runtime-boundary`. Do not attach this policy to the deployer; the SAM template uses it as the Lambda roles' boundary.
7. IAM → Roles → Create role → **Custom trust policy** → paste `cloudformation-trust.json` → no broad managed policy → role name **khaga-prod-cloudformation** → Create. Role → Permissions → Add permissions → Create inline policy → JSON → paste rendered `cloudformation-execution.json` → name **khaga-prod-resources**. The trust deliberately trusts only the CloudFormation service, with caller access constrained by `PassRole` and the stack-scoped deploy policy. Do not add an unverified `aws:SourceArn` trust condition that the stack service may not supply.
8. IAM → Policies → Create policy → JSON → rendered `deployer-additions.json` → name **khaga-prod-deploy**. IAM → Users → **sairn-deployer** → Permissions → Add permissions → Attach policies directly → select **only khaga-prod-deploy** → Add. Preserve every existing Sairn policy, group and boundary. Do not attach the execution policy to the user. Review any existing principals with write access to this stack: a CloudFormation service role remains associated with the stack after deployment.
9. Return only: setup completed, secret ARN, production API ID, and any non-sensitive IAM validation/denial details. No credentials, secret JSON, keys or credential files. The agent will recheck STS and stack/secret metadata, build this branch, review the SAM change set and deploy through the role. If the change set replaces `CommerceApi` instead of updating it in place, stop and investigate; do not broaden API permissions to compensate. The bootstrap uses inline OpenAPI `Body`, like SAM's transformed API, to preserve its logical/physical identity.

There are no IAM permissions to alter the existing user, grant policies, create buckets, create certificates, create domains, change DNS or provision secrets in the deployer additions. Administrator-owned supporting resources are created through the explicit console steps here. Template deployments manage the existing stack through SAM change sets; direct stack deletion and arbitrary API replacement are not granted. Administrator involvement is required for an intentional API replacement or stack recovery needing permissions beyond this deployment path.

## Private production secret provisioning

AWS console → **ap-south-1** → Secrets Manager → Store a new secret → Other type of secret → Key/value pairs. Use **aws/secretsmanager** encryption and name **khaga/prod/commerce**. Leave automatic rotation off. Reuse the existing KHAGA Supabase project/server settings. Enter these seven strings privately:

| Field | Required production value |
| --- | --- |
| `mode` | `live` (payment mode, not infrastructure label `prod`) |
| `keyId` | Owner-supplied Razorpay **Live** key ID, beginning `rzp_live_` |
| `keySecret` | The matching Live key secret |
| `webhookSecret` | Independent production webhook secret |
| `sessionSecret` | Independent production signed-session secret |
| `supabaseURL` | Existing KHAGA `https://PROJECT.supabase.co` URL |
| `secretKey` | Existing KHAGA Supabase server credential, never the browser/anon key |

The Test pair validated on the Mac is not valid for this deployment. Obtain the matching Live pair privately from the owner's activated Razorpay account / secure credential store. Do not regenerate or overwrite a working pair as an authentication experiment. If Live keys/API access are not available or authorised, stop before provider verification; do not substitute Test keys. [Razorpay API key guidance](https://razorpay.com/docs/payments/dashboard/account-settings/api-keys/).

Generate independent production webhook/session values locally when provisioning, without displaying them:

```sh
python3 scripts/prepare-prod-secrets.py
# The command prints only a fresh private directory path. Use that exact path below.
python3 scripts/prepare-prod-secrets.py --directory /private/tmp/khaga-prod-secrets-EXACT --copy webhookSecret
# Paste privately into the matching AWS field; then clear the clipboard:
pbcopy < /dev/null
python3 scripts/prepare-prod-secrets.py --directory /private/tmp/khaga-prod-secrets-EXACT --copy sessionSecret
# Paste privately into the matching AWS field; then:
pbcopy < /dev/null
```

The helper uses cryptographic randomness (32 bytes each), directory `0700` and files `0600`, outside Git. Save both values privately in the owner's password manager before temporary files are cleaned. Do not reuse the earlier Test webhook/session files or the payment key secret. Do not run generation repeatedly after registering the webhook. Use the same production webhook secret in Razorpay's Live webhook configuration. Store the AWS secret, then share **only its ARN** from secret details, including its AWS suffix. Never send key values, secret JSON, credential files or screenshots of values in chat.

## Production certificate and existing-provider DNS

1. ACM → Mumbai → Request public certificate → **commerce.slavant.com** only → DNS validation → RSA 2048 → export disabled. Record the certificate ARN and validation CNAME name/value. This is administrator-owned; the deployer gets no broad ACM creation rights.
2. Add only ACM's validation CNAME at the existing DNS provider; do not double the zone suffix. Do not create a hosted zone or request Route 53 permissions. Wait for ACM **Issued**.
3. After the production API/default stage exists: API Gateway → Custom domain names → Create → **commerce.slavant.com** → Regional → issued certificate → TLS 1.2. The authorised administrator handles any first-use API Gateway service-linked-role prerequisite. API mappings → exact production API ID → `$default` → empty mapping path.
4. At the existing provider, add **commerce** CNAME pointing to the generated Regional API Gateway target (DNS-only if proxying is offered). Inspect existing records first; do not overwrite an unrelated endpoint. Preserve `khaga.slavant.com` and the main Slavant site.
5. Supply only certificate ARN and generated DNS names/targets for verification. Keep public checkout entry disabled on Hostinger until launch approval; DNS creation alone does not enable purchases.

## Immediate setup and remaining blockers

The immediate step is owner-private creation of **khaga/prod/commerce** with the Live pair and existing KHAGA Supabase settings, followed by the authorised administrator's steps above. Return the **secret ARN**, **production API ID**, and confirmation that this production IAM bundle was applied. Do not apply the superseded Test bundle, grant yourself access, attach AdministratorAccess, change Sairn policies, or select another profile.

Outstanding items are collected here:

- Administrator resource/IAM setup and exact secret ARN/API ID. Existing `sairn-deployer` deployment access was denied; no alternative profile is confirmed.
- Owner confirmation that Razorpay Live access is available and authorised for the deployed **read-only** authentication check. This is distinct from purchase/public-launch approval. No Live API access is assumed from the stack's name or a key prefix.
- Existing KHAGA Supabase target verification and approval/access to apply additive migration 003 if absent. Preserve current catalogue/admin data, legacy test records, and mode namespaces; never relabel test orders as live.
- Existing-provider DNS/ACM/domain setup and KHAGA-only hosting configuration/access for the eventual controlled verification window.
- Before sales: genuine production sample approval and sellable variant capacity, dispatch promises, shipping charges/threshold, tax rate/treatment/shipping-tax/wording and customer policies. No simulated zero shipping/tax or local fixture prices may be promoted. The earlier Origin Tee proposal was only a Test proposal; its prior unapproved/unavailable/zero-capacity state cannot be silently changed.
- Separate explicit confirmation for any real-money validation purchase (product, quantity, actual total, payer and fulfilment handling) and separate public checkout activation. Neither is authorised now.

Deployment, safe verification sequence and approval gates: [production deployment guide](../../docs/commerce-deployment.md). No extra diagnostic app or AWS testing environment is required.

## API v2 tag failure review and lifecycle cross-check (2026-10-06)

The previous executed update (11:40:06–11:41:19 UTC) produced 37 stack events. The complete paginated event review found exactly one failed resource: `CommerceApi`, `UPDATE_FAILED`, with `AccessDeniedException` for `apigateway:POST` on:

```text
arn:aws:apigateway:ap-south-1::/tags/arn%3Aaws%3Aapigateway%3Aap-south-1%3A%3A%2Fv2%2Fapis%2F1ssp74gnt2
```

There were **zero** “resource creation cancelled” events and no other independent failures. Six resources (two functions, roles and log groups) completed creation and were automatically deleted during successful rollback. That cleanup is not a separate access denial. API `1ssp74gnt2` survived; terminal stack state was `UPDATE_ROLLBACK_COMPLETE`.

`TagOnlyProdApiAndStage` now includes raw and encoded `/v2/apis/REPLACE_WITH_PROD_API_ID` and its `/stages/$default` tag-resource variants, in addition to the original `/apis/` variants. The administrator applied the equivalent as `khaga-prod-api-v2-tags`; no AWS IAM changes are made by this branch. Regression assertions use the actual denied ARN, its default-stage ARN, raw equivalents, original variants, and negative cases for another API/stage/region. These assertions check source grants only; they are not AWS IAM simulation or evidence of effective access. [API Gateway tagging operations](https://docs.aws.amazon.com/apigatewayv2/latest/api-reference/tags-resource-arn.html), [IAM resource/action reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_apigatewayv2.html).

Cross-check against the processed SAM template (15 resources) and current source policies:

| Actor / resources | Lifecycle, tagging and scope reviewed |
| --- | --- |
| Deployer | Stack-scoped summary/describe/template/change-set create/review/execute; exact CloudFormation role PassRole condition; regional SAM transform; S3 uploads/reads limited to the production bucket/prefix. These operations succeeded in the previous attempt after administrator corrections. |
| CloudFormation / SAM | Exact regional transform permission plus read access to the packaged artifact. No deployment-stack wildcard or account-wide transform grant. |
| Two Lambda functions | Create/read/update-code/update-configuration/delete, tag/untag/list-tags and pass only the two bounded runtime roles to Lambda. Function creation and rollback deletion previously succeeded. No versions, aliases, layers, concurrency configuration, VPC or event-source-mapping resources occur in this template. |
| Two IAM roles | Creation requires the exact runtime boundary; role read/delete, inline-policy put/get/delete, basic-logging managed-policy attach/detach, role tags/untags and policy listing are scoped to generated production role prefixes. Creation and rollback succeeded. The unchanged trust/boundary does not require trust-policy or boundary mutation grants for this change set. |
| Two log groups | Create/read-metadata, retention set/delete, tag/untag/list-tags and delete on the two production groups. Creation and rollback succeeded. Runtime only creates streams/writes events inside those groups; it cannot create arbitrary groups. |
| Existing HTTP API | GET/PATCH/PUT/POST/DELETE on the exact API; OpenAPI reimport manages its routes/integrations inline. No separate route/integration CloudFormation resources or API Gateway integration role exist. Tag GET/POST/DELETE includes the actual raw/encoded v2 ARN variants. API replacement remains forbidden by change-set review. |
| Default stage | Collection GET/POST on this API, stage GET/PATCH/DELETE on `$default`, plus stage tag variants. SAM adds `httpapi:createdBy`; auto-deploy needs no separate deployment resource. This stage was not reached in the failed update, so its effective access is not yet established. |
| Seven Lambda invocation permissions | AddPermission/RemovePermission/GetPolicy limited to the two function ARNs. These resources were not reached in the failed update; success must be checked during execution. |
| Runtime roles | Generated inline policy reads only the production secret ARN; basic logging is intersected with the administrator-owned boundary limiting streams/events to two groups. The runtime grants neither resource provisioning nor cross-secret access. Secret retrieval/runtime invocation are not tested during this closed deployment; no payment request is authorised. |

No additional concrete omission was identified for this planned update after the exact v2-tag correction. This is not a guarantee about future template changes, SCPs, policy versions, service behaviour or effective AWS permissions. Fresh change-set creation/execution and actual stack events are the deployment evidence. Preserve both false flags; do not add speculative permissions or treat cancellations as new policy requirements.

### Actual retry outcome: stage tag-on-create denial

The retry of commit `3c76e49b9ffd487101113ab385a04e40ed1b1a23` successfully updated API `1ssp74gnt2` with the corrected v2 tag variants, but the stage's create-with-tags path required a distinct IAM action. On 2026-10-06 at 11:55:52 UTC, CloudFormation reported:

```text
Principal: arn:aws:sts::521199095818:assumed-role/khaga-prod-cloudformation/AWSCloudFormation
Action: apigateway:TagResource
Resource: arn:aws:apigateway:ap-south-1::/apis/1ssp74gnt2/stages
Error: no identity-based policy allows the apigateway:TagResource action
Service: ApiGatewayV2; HTTP 403; HandlerErrorCode: AccessDenied
Request ID: d66f2609-a077-47ef-88e2-032046f13fae
```

All eight failed events were reviewed: one independent AccessDenied on `CommerceApiApiGatewayDefaultStage`, and seven dependent `Resource creation cancelled` events on the seven Lambda invocation-permission resources. Cancellation is not evidence that AddPermission is missing. No other independent denial was found in this retry.

This is the additional concrete omission discovered by AWS execution: tag-on-create on this API's stage collection. The preceding source lifecycle review did not establish that effective permission; the existing tag endpoint verbs did not cover it. No speculative grants or automatic IAM/source-permission expansion have been made. The administrator must review this exact action/resource before another retry.

Final stack state: `UPDATE_ROLLBACK_COMPLETE`; original API `1ssp74gnt2` preserved. Both production functions were created then automatically removed by rollback; GetFunctionConfiguration returned ResourceNotFound for both. Both approval flags remained false. No secret values, keys, database migration, payment request, DNS/Hostinger change or public activation occurred. PR #5 remains a draft. The next deployment must review a fresh change set on the same stack.
