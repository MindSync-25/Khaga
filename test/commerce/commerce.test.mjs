import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {price} from '../../src/commerce/model.mjs';
import {handlerFor} from '../../src/commerce/http.mjs';
import {validateConfig} from '../../src/commerce/runtime.mjs';
import {commerceService} from '../../src/commerce/service.mjs';
import {policy} from './local-postgres.mjs';
const snapshot={managed:true,colours:{ivory:{name:'Ivory'}},sizes:['M'],products:[{id:'tee',name:'Tee',price:100000,colours:['ivory'],sizes:['M'],sampleApproved:true,variants:[{colour:'ivory',size:'M',mode:'stock',quantity:3,dispatchMin:null,dispatchMax:null}]}]};
const items=[{product:'tee',colour:'ivory',size:'M',quantity:1,unitPrice:1}];
const config={purchasesEnabled:true,mode:'test',origins:['https://khaga.test'],keyId:'rzp_test_fixture',keySecret:'fixture-secret',webhookSecret:'w'.repeat(32),sessionSecret:'s'.repeat(32),supabaseURL:'https://fixture.supabase.co',secretKey:'x'.repeat(32)};
const event=(path,method='POST',body={})=>({version:'2.0',rawPath:path,headers:{origin:'https://khaga.test','content-type':'application/json'},requestContext:{http:{method,sourceIp:'127.0.0.1'}},body:JSON.stringify(body)});
test('authoritative prices, integer taxes, shipping threshold and mode',()=>{
 const q=price(items,snapshot,policy,'test');assert.equal(q.total,110000);assert.equal(q.tax,16780);assert.equal(q.items[0].unitPrice,100000);
 assert.equal(price([{...items[0],quantity:2}],snapshot,policy,'test').shipping,0);
 assert.equal(price(items,snapshot,{...policy,taxTreatment:'exclusive'},'test').total,129800);
 assert.equal(price(items,snapshot,{...policy,mode:'live'},'live').mode,'live');
 for(const quantity of [0,-1,1.5,11,'1'])assert.throws(()=>price([{...items[0],quantity}],snapshot,policy,'test'));
 assert.throws(()=>price(items,snapshot,null,'test'));assert.throws(()=>price(items,snapshot,{...policy,enabled:false},'test'));
 assert.throws(()=>price(items,{...snapshot,products:[{...snapshot.products[0],sampleApproved:false}]},policy,'test'));
 assert.throws(()=>price(items,{...snapshot,products:[{...snapshot.products[0],variants:[]}]},policy,'test'));
});
test('Live requires matching keys, explicit approval and complete secrets',()=>{
 const env={COMMERCE_MODE:'test',FRONTEND_ORIGINS:'https://khaga.test'};assert.equal(validateConfig(config,env).mode,'test');
 assert.throws(()=>validateConfig({...config,keyId:'rzp_live_fixture'},env));assert.throws(()=>validateConfig(config,{...env,FRONTEND_ORIGINS:'*'}));
 const live={...config,mode:'live',keyId:'rzp_live_fixture'};assert.throws(()=>validateConfig(live,{...env,COMMERCE_MODE:'live'}));
 assert.equal(validateConfig(live,{...env,COMMERCE_MODE:'live',LIVE_API_APPROVED:'true'}).mode,'live');
});
test('HTTP v2 signed guest cookies, CSRF, origin and method isolation',async()=>{
 const runtime={config,repo:{takeRate:async()=>true},store:{list:async()=>[]},service:{quote:async()=>({total:100}),publicOrder:x=>x}};
 const handler=handlerFor('purchase',async()=>runtime);
 const session=await handler(event('/checkout/session'));assert.equal(session.statusCode,200);assert.match(session.cookies[0],/Secure; HttpOnly; SameSite=Lax/);
 const e=event('/checkout/quote');e.cookies=[session.cookies[0].split(';')[0]];assert.equal((await handler(e)).statusCode,403);
 e.headers['x-csrf-token']=JSON.parse(session.body).csrf;assert.equal((await handler(e)).statusCode,200);
 e.headers.origin='https://evil.test';assert.equal((await handler(e)).statusCode,403);
 e.headers.origin='https://khaga.test';e.cookies=[e.cookies[0]+'bad'];assert.equal((await handler(e)).statusCode,401);
 assert.equal((await handler(event('/confirm-purchase'))).statusCode,401);
 const direct=await handler({...event('/purchase'),operatorAction:'razorpay-auth-check'});assert.equal(direct.statusCode,401);
});
test('base64 webhook keeps exact bytes, bypasses guest cookies, awaits persistence',async()=>{
 const raw=Buffer.from('{ "event":"unrelated", "note":"नमस्ते" }\n');let saved=0;
 const store={call:async()=>{saved++;}};const service=commerceService({store,config});
 const handler=handlerFor('confirm',async()=>({config,service}));
 const e=event('/payments/razorpay/webhook');e.headers={'x-razorpay-signature':createHmac('sha256',config.webhookSecret).update(raw).digest('hex')};e.body=raw.toString('base64');e.isBase64Encoded=true;
 assert.equal((await handler(e)).statusCode,200);assert.equal(saved,1);
 store.call=async()=>{throw Error('database down')};assert.equal((await handler(e)).statusCode,503);
 e.body=Buffer.from(raw.toString().trim()).toString('base64');assert.equal((await handler(e)).statusCode,400);
});
test('production needs Live mode and separate API approval; purchases default closed',()=>{
 const live={...config,mode:'live',keyId:'rzp_live_fixture'};
 const env={COMMERCE_ENVIRONMENT:'prod',COMMERCE_MODE:'live',FRONTEND_ORIGINS:'https://khaga.slavant.com'};
 assert.throws(()=>validateConfig(live,env));
 assert.throws(()=>validateConfig(config,{...env,COMMERCE_MODE:'test',LIVE_API_APPROVED:'true'}));
 assert.throws(()=>validateConfig({...live,keyId:'rzp_test_fixture'},{...env,LIVE_API_APPROVED:'true'}));
 const approved={...env,LIVE_API_APPROVED:'true'};
 assert.equal(validateConfig(live,approved).purchasesEnabled,false);
 for(const flag of ['false','TRUE','1',''])assert.equal(validateConfig(live,{...approved,PURCHASES_ENABLED:flag}).purchasesEnabled,false);
 assert.equal(validateConfig(live,{...approved,PURCHASES_ENABLED:'true'}).purchasesEnabled,true);
});
test('closed purchases fail before catalogue, storage or gateway access',async()=>{
 const forbidden=new Proxy({}, {get(){throw new Error('Unexpected side effect');}});
 for(const enabled of [false,undefined]){
  const service=commerceService({repo:forbidden,store:forbidden,provider:forbidden,config:{...config,purchasesEnabled:enabled}});
  await assert.rejects(service.quote(items),{code:'PURCHASES_DISABLED'});
  await assert.rejects(service.create({},'guest'),{code:'PURCHASES_DISABLED'});
 }
});
test('IAM-only deployed auth path works with purchases disabled and makes only a read',async()=>{
 const cfg={...config,mode:'live',purchasesEnabled:false};let reads=0;
 const forbidden=new Proxy({}, {get(){throw new Error('Unexpected storage/purchase access');}});
 const handler=handlerFor('purchase',async()=>({config:cfg,repo:forbidden,store:forbidden,service:forbidden,provider:{request:async path=>{assert.equal(path,'/orders?count=1');reads++;}}}));
 const result=await handler({operatorAction:'razorpay-auth-check'},{awsRequestId:'local-fixture'});
 assert.equal(result.ok,true);assert.equal(result.mode,'live');assert.equal(reads,1);
});
