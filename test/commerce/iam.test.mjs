import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const base=new URL('../../infra/iam/',import.meta.url);
const policy=name=>JSON.parse(readFileSync(new URL(name,base),'utf8'));
const execution=policy('cloudformation-execution.template.json');
const deployer=policy('deployer-additions.template.json');
const boundary=policy('runtime-boundary.template.json');
const arr=x=>Array.isArray(x)?x:[x];
test('only bounded runtime roles can read the exact Prod secret',()=>{
 for(const p of [execution,deployer])assert.ok(p.Statement.every(s=>!arr(s.Action).includes('secretsmanager:GetSecretValue')));
 const read=boundary.Statement.find(s=>arr(s.Action).includes('secretsmanager:GetSecretValue'));
 assert.equal(read.Resource,'REPLACE_WITH_PROD_SECRET_ARN');
 const create=execution.Statement.find(s=>arr(s.Action).includes('iam:CreateRole'));
 assert.equal(create.Condition.ArnEquals['iam:PermissionsBoundary'],'arn:aws:iam::521199095818:policy/khaga-prod-runtime-boundary');
 for(const s of execution.Statement)assert.ok(!arr(s.Action).some(a=>['iam:DeleteRolePermissionsBoundary','iam:PutRolePermissionsBoundary','iam:CreatePolicyVersion','iam:UpdateAssumeRolePolicy'].includes(a)));
});
test('PassRole cannot target Sairn roles or arbitrary services',()=>{
 for(const [p,service] of [[deployer,'cloudformation.amazonaws.com'],[execution,'lambda.amazonaws.com']]){
  const s=p.Statement.find(s=>arr(s.Action).includes('iam:PassRole'));
  assert.equal(s.Condition.StringEquals['iam:PassedToService'],service);
  for(const r of arr(s.Resource))assert.match(r,/^arn:aws:iam::521199095818:role\/khaga-(?:prod-cloudformation|commerce-prod-(?:Purchase|ConfirmPurchase)Role-\*)$/);
 }
});
test('no broad API grants, secret writes, Route53, user grants, or wildcard actions',()=>{
 for(const p of [execution,deployer,boundary])for(const s of p.Statement){
  for(const a of arr(s.Action)){
   assert.ok(!a.includes('*'));
   assert.ok(!/^(route53:|secretsmanager:(?:Put|Create|Update)|iam:(?:AttachUser|PutUser|CreateUser))/.test(a));
   if(a.startsWith('apigateway:'))for(const r of arr(s.Resource)){assert.ok(r.includes('REPLACE_WITH_PROD_API_ID'));assert.ok(!r.includes('*'));}
  }
  if(s.Resource==='*')assert.deepEqual(s.Action,['logs:DescribeLogGroups']);
 }
});
test('change-set preparation must pass the exact CloudFormation role',()=>{
 const s=deployer.Statement.find(s=>s.Sid==='PrepareProdChangeSet');
 assert.equal(s.Condition.ArnEquals['cloudformation:RoleArn'],'arn:aws:iam::521199095818:role/khaga-prod-cloudformation');
 assert.equal(s.Resource,'arn:aws:cloudformation:ap-south-1:521199095818:stack/khaga-commerce-prod/*');
});
test('reference renderer rejects wrong account, region, secret name and API input',()=>{
 const dir=mkdtempSync(join(tmpdir(),'khaga-iam-prod-'));
 const arn='arn:aws:secretsmanager:ap-south-1:521199095818:secret:khaga/prod/commerce-Abc123';
 const render=(secret,api='abcdefghij')=>spawnSync('python3',['scripts/render-prod-iam.py','--secret-arn',secret,'--api-id',api,'--output',dir],{encoding:'utf8'});
 try{
  assert.equal(render(arn).status,0);
  const result=readFileSync(join(dir,'runtime-boundary.json'),'utf8');assert.ok(result.includes(arn));assert.ok(!result.includes('REPLACE_WITH_'));
  for(const wrong of [arn.replace('521199095818','111111111111'),arn.replace('ap-south-1','us-east-1'),arn.replace('/prod/','/test/'),arn.replace('-Abc123','-*')])assert.notEqual(render(wrong).status,0);
  assert.notEqual(render(arn,'*').status,0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('production resource bundle contains no alternative environment dependency',()=>{
 const template=readFileSync(new URL('../../infra/template.yaml',import.meta.url),'utf8');
 const samconfig=readFileSync(new URL('../../infra/samconfig.toml',import.meta.url),'utf8');
 const bootstrap=readFileSync(new URL('bootstrap-api.yaml',base),'utf8');
 for(const content of [template,samconfig,bootstrap,JSON.stringify(execution),JSON.stringify(deployer),JSON.stringify(boundary)])assert.doesNotMatch(content,/TestSecretArn|LiveSecretArn|IsLive|khaga-(?:commerce|purchase|confirm-purchase)-(?:test|live|staging|acceptance)|khaga\/test\/commerce/);
 assert.match(template,/AllowedValues: \[prod\]/);assert.match(template,/AllowedValues: \[live\]/);
 assert.match(template,/LiveApiApproved:[\s\S]*?Default: 'false'/);assert.match(template,/PurchasesEnabled:[\s\S]*?Default: 'false'/);
 assert.match(samconfig,/\[prod.deploy.parameters\]/);assert.doesNotMatch(samconfig,/\[(?:test|live|staging|acceptance)\./);
});
test('execution role can process only the regional SAM transform, not arbitrary stacks or transforms',()=>{
 const statements=execution.Statement.filter(s=>arr(s.Action).some(a=>a.startsWith('cloudformation:')));
 assert.deepEqual(statements,[{Sid:'UseSamTransform',Effect:'Allow',Action:['cloudformation:CreateChangeSet'],Resource:'arn:aws:cloudformation:ap-south-1:aws:transform/Serverless-2016-10-31'}]);
 const summary=deployer.Statement.find(s=>s.Sid==='ReviewAndExecuteProdChangeSet');
 assert.ok(summary.Action.includes('cloudformation:GetTemplateSummary'));
 assert.equal(summary.Resource,'arn:aws:cloudformation:ap-south-1:521199095818:stack/khaga-commerce-prod/*');
});
