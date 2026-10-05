import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {Script} from 'node:vm';
import {createApp} from '../../src/app.mjs';
import {startApplication} from '../../src/bootstrap.mjs';
import {SQLiteRepository} from '../../src/management/repository.mjs';
import {managementService} from '../../src/management/http.mjs';
import {hashPassword} from '../../src/management/security.mjs';
import {seedCatalogue,publishedSnapshot} from '../../src/management/catalogue.mjs';
import {checkoutConfig,quoteItems,customerInput,validSignature,sha,paymentUpdate} from '../../src/checkout/core.mjs';
import {SQLiteOrderStore,SupabaseOrderStore} from '../../src/checkout/store.mjs';
import {checkoutHTTP,initializeCheckout,checkoutHeaders} from '../../src/checkout/http.mjs';
import {checkoutService} from '../../src/checkout/service.mjs';
import {RazorpayProvider} from '../../src/checkout/provider.mjs';
const password='local-fixture-password-not-for-deployment';
const passwordHash=await hashPassword(password);
const customer={name:'Test Buyer',email:'buyer@example.test',phone:'9000000000',line1:'123 Test Street',line2:'',city:'Test City',state:'Karnataka',postalCode:'560001',country:'IN'};
const bag=[{product:'origin-tee',colour:'ivory',size:'M',quantity:1}];
const keySecret='fixture-razorpay-test-secret-only';
const webhookSecret='fixture-webhook-secret-not-for-deployment';
const env={CHECKOUT_MODE:'test',RAZORPAY_KEY_ID:'rzp_test_fixture123',RAZORPAY_KEY_SECRET:keySecret,RAZORPAY_WEBHOOK_SECRET:webhookSecret};
const sign=(message,secret=keySecret)=>createHmac('sha256',secret).update(message).digest('hex');
class Provider {
 constructor(){this.created=0;this.rows=new Map();this.paymentsById=new Map();}
 async create(order){this.created++;this.rows.set('order_test'+this.created,order);return 'order_test'+this.created;}
 async payment(id){if(!this.paymentsById.has(id))throw Error('not found');return this.paymentsById.get(id);}
 async payments(id){return [...this.paymentsById.values()].filter(p=>p.order_id===id);}
 paid(id,pay='pay_test1',status='captured'){const order=this.rows.get(id);const payment={id:pay,order_id:id,status,captured:status==='captured',amount:order.body.quote.total,currency:'INR',amount_refunded:0,notes:{khaga_order_id:order.id}};this.paymentsById.set(pay,payment);return payment;}
}
async function fixture(fn,{basic=false}={}){
 const dir=mkdtempSync(join(tmpdir(),'khaga-checkout-'));const repo=await SQLiteRepository.open(dir);await seedCatalogue(repo);
 const adminConfig={driver:'sqlite',enabled:true,secure:false,email:'owner@example.test',passwordHash,origin:'http://127.0.0.1',sessionHours:8};
 const management=managementService(repo,adminConfig);const config=checkoutConfig(env,management);const store=new SQLiteOrderStore(repo);const provider=new Provider();
 const commerce=checkoutHTTP({management,config,store,provider});
 const server=createApp({username:basic?'qa':'',password:basic?'fixture-basic':'',management,commerce});server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;adminConfig.origin=base;config.origin=base;
 const basicHeader=basic?{Authorization:'Basic '+Buffer.from('qa:fixture-basic').toString('base64')}:{};
 const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...basicHeader},body:JSON.stringify({email:adminConfig.email,password})});assert.equal(login.status,200);const ownerCookie=login.headers.get('set-cookie').split(';')[0];
 const s=await fetch(base+'/api/checkout/session',{headers:{Cookie:ownerCookie,...basicHeader}});assert.equal(s.status,200);const session=await s.json(),guestCookie=s.headers.get('set-cookie').split(';')[0];
 const headers={Cookie:ownerCookie+'; '+guestCookie,Origin:base,'X-CSRF-Token':session.csrf,...basicHeader};
 const get=async(path,extra={})=>fetch(base+path,{headers:{...headers,...extra}});
 const post=async(path,data,extra={})=>fetch(base+path,{method:'POST',headers:{...headers,'Content-Type':'application/json',...extra},body:JSON.stringify(data)});
 const intent=async(requestKey=randomBytes(32).toString('hex'))=>({items:bag,customer,requestKey,quoteHash:(await(await post('/api/checkout/quote',{items:bag})).json()).hash});
 const create=async(input)=>{const r=await post('/api/checkout/orders',input||await intent());assert.ok([200,202].includes(r.status),await r.clone().text());return r.json();};
 try{await fn({repo,store,provider,config,commerce,base,headers,ownerCookie,guestCookie,session,get,post,intent,create,dir});}finally{await new Promise(r=>server.close(r));await repo.close();rmSync(dir,{recursive:true,force:true});}
}
test('Payment keys alone never enable checkout; live mode and live keys are rejected',()=>{
 assert.equal(checkoutConfig({RAZORPAY_KEY_ID:'rzp_live_abc'},null),null);
 assert.throws(()=>checkoutConfig({...env,CHECKOUT_MODE:'live'},null),e=>e.code==='CHECKOUT_MODE_INVALID');
 const m={config:{enabled:true,secure:true,origin:'https://khaga.example'},repo:{}};
 assert.throws(()=>checkoutConfig({...env,RAZORPAY_KEY_ID:'rzp_live_test'},m),e=>e.code==='RAZORPAY_TEST_KEY_REQUIRED');
 assert.throws(()=>checkoutConfig(env,{config:{enabled:false}}),e=>e.code==='CHECKOUT_STORE_REQUIRED');
 assert.equal(checkoutConfig(env,m).mode,'test');
});
test('Missing/malformed checkout configuration stays closed without exposing secrets',async()=>{
 const logs=[];const result=await initializeCheckout(null,env,line=>logs.push(line));assert.equal(result,null);assert.ok(logs[0].includes('disabled'));assert.ok(!logs[0].includes(keySecret));
});
test('New checkout setting failure does not stop standalone preview startup',async()=>{
 const logs=[];const app=await startApplication({env:{CHECKOUT_MODE:'live'},port:0,host:'127.0.0.1',log:s=>logs.push(s)});try{
  assert.equal((await app.ready).state,'ready');const base='http://127.0.0.1:'+app.server.address().port;assert.equal((await fetch(base+'/')).status,200);assert.equal((await fetch(base+'/api/checkout',{method:'POST'})).status,403);
 }finally{await app.close();}
});
test('Contact normalization and validation; no non-IN address or control character accepted',()=>{
 const c=customerInput(customer);assert.equal(c.phone,'+919000000000');assert.equal(c.email,'buyer@example.test');
 for(const patch of [{name:'x'},{country:'US'},{email:'invalid'},{postalCode:'000000'},{phone:'123'},{line1:'address\nheader'}])assert.throws(()=>customerInput({...customer,...patch}));
});
test('Quotes use published prices, never client totals, tax values or draft prices',async()=>fixture(async f=>{
 const record=await f.repo.get('product','origin-tee');record.body.draft.price=100;await f.repo.cas('product',record.id,record.version,record.body);
 const r=await f.post('/api/checkout/quote',{items:[{...bag[0],price:1,total:1}],total:1,tax:0});assert.equal(r.status,200);const q=await r.json();assert.equal(q.total,299000);assert.equal(q.shipping,0);assert.equal(q.mode,'test');
}));
test('Unknown, unpublished, invalid-size variants and oversized merged quantities rejected',async()=>fixture(async f=>{
 for(const items of [[],[{...bag[0],product:'missing'}],[{...bag[0],colour:'missing'}],[{...bag[0],size:'XXXS'}],[{...bag[0],quantity:0}],[{...bag[0],quantity:1.1}],[{...bag[0],quantity:9},{...bag[0],quantity:2}]]){const r=await f.post('/api/checkout/quote',{items});assert.ok([409,422].includes(r.status));}
 const r=await f.repo.get('product','origin-tee');await f.repo.cas('product',r.id,r.version,{...r.body,published:null});assert.equal((await f.post('/api/checkout/quote',{items:bag})).status,409);
}));
test('Private test checkout requires owner login; public visitors cannot create or read orders',async()=>fixture(async f=>{
 for(const path of ['/checkout','/admin/orders','/api/checkout/session','/api/admin/orders'])assert.equal((await fetch(f.base+path)).status,401);
 const r=await fetch(f.base+'/api/checkout/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,401);assert.equal(f.provider.created,0);
}));
test('Owner sees checkout in bag snapshot; public visitor does not',async()=>fixture(async f=>{
 const owner=await(await f.get('/api/catalog')).json();assert.equal(owner.checkout.mode,'test');
 const publicData=await(await fetch(f.base+'/api/catalog')).json();assert.equal(publicData.checkout,undefined);
 assert.ok((await(await f.get('/')).text()).includes('checkout-launcher.js'));
}));
test('Guest cookies are HttpOnly; CSRF and sibling-origin requests rejected before payment creation',async()=>fixture(async f=>{
 const r=await fetch(f.base+'/api/checkout/session',{headers:{Cookie:f.ownerCookie}});assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);assert.ok(!r.headers.get('set-cookie').includes('Domain='));
 const input=await f.intent();for(const extra of [{'X-CSRF-Token':''},{Origin:'https://slavant.com'},{'Sec-Fetch-Site':'same-site'},{Cookie:f.ownerCookie}]){const res=await f.post('/api/checkout/orders',input,extra);assert.ok([401,403].includes(res.status));}assert.equal(f.provider.created,0);
}));
test('Create saves customer, variant and server total before gateway order; replay is idempotent',async()=>fixture(async f=>{
 const input=await f.intent();const a=await f.create(input),b=await f.create(input);assert.equal(a.order.id,b.order.id);assert.equal(f.provider.created,1);assert.equal(a.order.quote.total,299000);assert.equal(a.order.status,'payment_pending');assert.ok(a.payment.orderId.startsWith('order_'));assert.ok(!JSON.stringify(a).includes(keySecret));
 const saved=await f.store.get(a.order.id);assert.equal(saved.body.customer.phone,'+919000000000');assert.equal(saved.guest_hash,sha(f.guestCookie.split('=')[1]));
}));
test('Concurrent duplicate submissions call provider once, including pending replies',async()=>fixture(async f=>{
 const input=await f.intent();const rows=await Promise.all(Array.from({length:6},()=>f.create(input)));assert.equal(new Set(rows.map(r=>r.order.id)).size,1);assert.equal(f.provider.created,1);
}));
test('Same idempotency key with different delivery details is rejected',async()=>fixture(async f=>{
 const input=await f.intent();await f.create(input);const r=await f.post('/api/checkout/orders',{...input,customer:{...customer,name:'Different Buyer'}});assert.equal(r.status,409);assert.equal((await r.json()).error,'IDEMPOTENCY_CONFLICT');assert.equal(f.provider.created,1);
}));
test('Changed published total requires another explicit review; no gateway order created',async()=>fixture(async f=>{
 const input=await f.intent();const r=await f.repo.get('product','origin-tee');r.body.published.price+=10000;await f.repo.cas('product',r.id,r.version,r.body);
 const response=await f.post('/api/checkout/orders',input);assert.equal(response.status,409);assert.equal((await response.json()).error,'QUOTE_CHANGED');assert.equal(f.provider.created,0);
}));
test('Gateway timeout retains uncertain order; repeated submit does not reissue a create',async()=>fixture(async f=>{
 f.provider.create=async()=>{f.provider.created++;throw new Error('Provider timed out with private secret '+keySecret);};
 const input=await f.intent();const a=await f.create(input),b=await f.create(input);assert.equal(a.order.status,'creation_unknown');assert.equal(b.order.id,a.order.id);assert.equal(f.provider.created,1);assert.equal(a.payment,null);assert.ok(!JSON.stringify(a).includes(keySecret));
}));
test('Browser success is not trusted: bad HMAC, foreign order and amount mismatch rejected',async()=>fixture(async f=>{
 const o=await f.create();const payment=f.provider.paid(o.payment.orderId);const correct={razorpay_order_id:o.payment.orderId,razorpay_payment_id:payment.id,razorpay_signature:sign(o.payment.orderId+'|'+payment.id)};
 assert.equal((await f.post('/api/checkout/orders/'+o.order.id+'/verify',{...correct,razorpay_signature:'0'.repeat(64)})).status,400);
 assert.equal((await f.post('/api/checkout/orders/'+o.order.id+'/verify',{...correct,razorpay_order_id:'order_other'})).status,409);
 payment.amount=1;assert.equal((await f.post('/api/checkout/orders/'+o.order.id+'/verify',correct)).status,409);assert.equal((await f.store.get(o.order.id)).status,'payment_pending');
}));
test('Authorization alone remains pending; captured payment verifies then survives repository reopen',async()=>fixture(async f=>{
 const o=await f.create();const p=f.provider.paid(o.payment.orderId,'pay_authorized','authorized');const data={razorpay_order_id:o.payment.orderId,razorpay_payment_id:p.id,razorpay_signature:sign(o.payment.orderId+'|'+p.id)};
 let r=await f.post('/api/checkout/orders/'+o.order.id+'/verify',data);assert.equal((await r.json()).order.status,'payment_pending');p.status='captured';p.captured=true;
 r=await f.post('/api/checkout/orders/'+o.order.id+'/verify',data);assert.equal((await r.json()).order.status,'paid');
 const reopened=await SQLiteRepository.open(f.dir);try{assert.equal((await new SQLiteOrderStore(reopened).get(o.order.id)).status,'paid');}finally{await reopened.close();}
 assert.equal((await(await f.post('/api/checkout/orders/'+o.order.id+'/verify',data)).json()).order.status,'paid');
}));
test('Other guest session cannot read, verify or reconcile an order even with the same owner login',async()=>fixture(async f=>{
 const o=await f.create();const other=await fetch(f.base+'/api/checkout/session',{headers:{Cookie:f.ownerCookie}});const s=await other.json(),cookie=other.headers.get('set-cookie').split(';')[0];
 const headers={Cookie:f.ownerCookie+'; '+cookie,'X-CSRF-Token':s.csrf};assert.equal((await f.get('/api/checkout/orders/'+o.order.id,headers)).status,404);assert.equal((await f.post('/api/checkout/orders/'+o.order.id+'/reconcile',{},headers)).status,404);
}));
test('Reconciliation recovers captured payment when browser callback never arrives',async()=>fixture(async f=>{
 const o=await f.create();f.provider.paid(o.payment.orderId);const r=await f.post('/api/checkout/orders/'+o.order.id+'/reconcile',{});assert.equal((await r.json()).order.status,'paid');
}));
test('Webhook verifies raw bytes, uses distinct secret, and de-duplicates persisted transitions',async()=>fixture(async f=>{
 const o=await f.create();const p=f.provider.paid(o.payment.orderId);const raw=JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:p.id}}}})+'\n';
 const send=signature=>fetch(f.base+'/api/payments/razorpay/webhook',{method:'POST',headers:{'Content-Type':'application/json','x-razorpay-signature':signature},body:raw});
 assert.equal((await send(sign(raw))).status,400);assert.equal((await send(sign(raw,webhookSecret))).status,200);assert.equal((await send(sign(raw,webhookSecret))).status,200);
 assert.equal((await f.store.get(o.order.id)).status,'paid');assert.equal(f.repo.db.prepare('SELECT count(*) AS n FROM test_payment_events').get().n,1);
 const mutated=await fetch(f.base+'/api/payments/razorpay/webhook',{method:'POST',headers:{'Content-Type':'application/json','x-razorpay-signature':sign(raw,webhookSecret)},body:raw.trim()});assert.equal(mutated.status,400);
}));
test('Signed webhook alone bypasses site Basic Auth; bad signature remains rejected',async()=>fixture(async f=>{
 const o=await f.create();const p=f.provider.paid(o.payment.orderId);const raw=JSON.stringify({event:'order.paid',payload:{payment:{entity:{id:p.id}}}});
 const r=await fetch(f.base+'/api/payments/razorpay/webhook',{method:'POST',headers:{'Content-Type':'application/json','x-razorpay-signature':sign(raw,webhookSecret)},body:raw});assert.equal(r.status,200);assert.equal((await fetch(f.base+'/api/admin/orders')).status,401);
},{basic:true}));
test('Failed events cannot regress paid; refund review cannot regress on a late capture notification',async()=>fixture(async f=>{
 const o=await f.create();const p=f.provider.paid(o.payment.orderId);await f.post('/api/checkout/orders/'+o.order.id+'/reconcile',{});
 const raw=JSON.stringify({event:'payment.failed',payload:{payment:{entity:{id:p.id}}}});await fetch(f.base+'/api/payments/razorpay/webhook',{method:'POST',headers:{'Content-Type':'application/json','x-razorpay-signature':sign(raw,webhookSecret)},body:raw});assert.equal((await f.store.get(o.order.id)).status,'paid');
 p.amount_refunded=p.amount;p.status='refunded';let r=await f.post('/api/checkout/orders/'+o.order.id+'/reconcile',{});assert.equal((await r.json()).order.status,'refund_review');p.amount_refunded=0;p.status='captured';r=await f.post('/api/checkout/orders/'+o.order.id+'/reconcile',{});assert.equal((await r.json()).order.status,'refund_review');
}));
test('Saved Orders are owner-only, private/no-store and exclude credential or guest-token fields',async()=>fixture(async f=>{
 const o=await f.create();const r=await f.get('/api/admin/orders');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');const text=await r.text();assert.ok(text.includes(o.order.id));for(const bad of ['guest_hash','request_key',keySecret,webhookSecret,passwordHash])assert.ok(!text.includes(bad));
 assert.equal((await f.get('/admin/orders')).status,200);assert.equal((await f.get('/api/admin/orders?offset=-1')).status,422);
}));
test('Stored hostile address is escaped by Orders UI and never embedded into checkout HTML',async()=>fixture(async f=>{
 const o=await f.create({...await f.intent(),customer:{...customer,name:'<img src=x onerror=alert(1)>'}});const html=await(await f.get('/checkout/orders/'+o.order.id)).text();assert.ok(!html.includes('<img src=x'));
 const source=readFileSync(new URL('../../public/orders.js',import.meta.url),'utf8');assert.ok(source.includes('esc(o.customer.name)'));assert.ok(source.includes('esc(o.customer.email)'));
}));
test('Checkout pages have narrow provider CSP, no secrets, safe HEAD semantics',async()=>fixture(async f=>{
 const r=await f.get('/checkout');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');const csp=r.headers.get('content-security-policy');assert.ok(csp.includes('https://checkout.razorpay.com'));assert.ok(!csp.includes('unsafe-eval'));assert.ok(!csp.includes('https:;'));const html=await r.text();assert.ok(!html.includes(keySecret));assert.ok(html.includes('NO REAL MONEY'));assert.ok(html.includes('checkout.js?v=0.5.0'));
 const h=await fetch(f.base+'/checkout',{method:'HEAD',headers:f.headers});assert.equal(h.status,200);assert.equal(await h.text(),'');
}));
test('Provider creates correct immutable amount/order binding, uses server auth, never retries POST',async()=>{
 const calls=[];const order={id:randomUUID(),body:{quote:{total:300000}}};const p=new RazorpayProvider({...env,keyId:env.RAZORPAY_KEY_ID,keySecret},async(url,options)=>{calls.push({url,options});return Response.json({id:'order_fixture',amount:300000,currency:'INR',receipt:order.id});});
 assert.equal(await p.create(order),'order_fixture');assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.razorpay.com/v1/orders');assert.equal(calls[0].options.redirect,'error');const body=JSON.parse(calls[0].options.body);assert.equal(body.partial_payment,false);assert.equal(body.amount,300000);assert.ok(!('customer' in body));assert.ok(calls[0].options.headers.Authorization.startsWith('Basic '));
 const failed=new RazorpayProvider({keyId:env.RAZORPAY_KEY_ID,keySecret},async()=>{throw Error(keySecret);});await assert.rejects(failed.create(order),e=>e.code==='PAYMENT_UNAVAILABLE'&&!e.message.includes(keySecret));
});
test('Supabase order adapter uses exact service-only RPCs and requires checkout schema',async()=>{
 const calls=[];const s=new SupabaseOrderStore({rpc:async(name,args)=>{calls.push({name,args});return {schema:1,mode:'test'};}});await s.ready();await s.get('id');assert.equal(calls[0].name,'checkout_status');assert.equal(calls[1].name,'checkout_get');assert.equal(calls[1].args.p_id,'id');
 await assert.rejects(new SupabaseOrderStore({rpc:async()=>({schema:0})}).ready(),e=>e.code==='CHECKOUT_SCHEMA_REQUIRED');
});
test('Migration contains separate test-only storage, RLS and revoked public/anon RPC grants',()=>{
 const sql=readFileSync(new URL('../../migrations/002_test_checkout.sql',import.meta.url),'utf8');assert.ok(sql.includes(`body @> '{"mode":"test"}'::jsonb`));assert.ok(sql.includes('UNIQUE(guest_hash,request_key)'));assert.ok(sql.includes('FOR UPDATE'));assert.ok(sql.includes('test_orders ENABLE ROW LEVEL SECURITY'));
 const names=[...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(khaga_checkout_[a-z]+)/g)].map(m=>m[1]);for(const name of names)assert.ok(new RegExp('REVOKE ALL ON FUNCTION public\\.'+name+'\\([^;]+FROM PUBLIC,anon,authenticated').test(sql),name);
});
test('Checkout/Orders scripts parse without eval and do not store card details',()=>{
 for(const path of ['checkout.js','orders.js','checkout-launcher.js']){const text=readFileSync(new URL('../../public/'+path,import.meta.url),'utf8');assert.doesNotThrow(()=>new Script(text));assert.ok(!text.includes('eval('));assert.ok(!text.includes('RAZORPAY_KEY_SECRET'));assert.ok(!text.includes('SUPABASE_SECRET_KEY'));}
});
