import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {SQLiteRepository} from '../../src/management/repository.mjs';
import {seedCatalogue} from '../../src/management/catalogue.mjs';
import {SQLiteOrderStore} from '../../src/checkout/store.mjs';
import {checkoutService} from '../../src/checkout/service.mjs';
import {RazorpayProvider} from '../../src/checkout/provider.mjs';
import {GatewayError,gatewayDiagnostic} from '../../src/checkout/gateway-errors.mjs';
import {sha,safeCheckoutError} from '../../src/checkout/core.mjs';
import {checkoutHTTP} from '../../src/checkout/http.mjs';
import {createApp} from '../../src/app.mjs';

const config={keyId:'rzp_test_fixture',keySecret:'fixture-only-private-secret',mode:'test',secure:false,origin:'http://127.0.0.1'};
const localOrder={id:'12345678-1234-1234-1234-123456789abc',body:{quote:{total:299000}}};
const gatewayOrder=(order=localOrder)=>({id:'order_fixture',entity:'order',receipt:order.id,amount:order.body.quote.total,currency:'INR',status:'created',notes:{khaga_order_id:order.id,khaga_mode:'test'}});
const api=(fetcher)=>new RazorpayProvider(config,fetcher);
const noSecret=value=>assert.ok(!JSON.stringify(value).includes(config.keySecret));
for(const [status,description,code] of [[401,'echo '+config.keySecret,'PAYMENT_AUTH_FAILED'],[400,'Authentication failed','PAYMENT_AUTH_FAILED'],[400,'Invalid API key','PAYMENT_AUTH_FAILED'],[403,'','PAYMENT_ACCESS_DENIED'],[400,'receipt invalid '+config.keySecret,'PAYMENT_REQUEST_REJECTED'],[404,'','PAYMENT_REQUEST_REJECTED'],[429,'','PAYMENT_RATE_LIMITED'],[500,'','PAYMENT_UNAVAILABLE']]) {
 test(`Provider HTTP ${status}/${code} is classified without echoed secrets`,async()=>{
  let calls=0;const provider=api(async()=>{calls++;return Response.json({error:{description,metadata:config}},{status});});
  await assert.rejects(provider.create(localOrder),e=>{assert.equal(e.code,code);assert.equal(e.httpStatus,status);noSecret(e);noSecret(safeCheckoutError(e));return true;});assert.equal(calls,1);
 });
}
test('Non-JSON 401 still preserves authentication classification',async()=>{
 await assert.rejects(api(async()=>new Response(config.keySecret,{status:401})).create(localOrder),e=>e.code==='PAYMENT_AUTH_FAILED'&&!e.message.includes(config.keySecret));
});
test('Network exception remains uncertain, redacted and not retried',async()=>{
 let count=0;await assert.rejects(api(async()=>{count++;throw Error(config.keySecret);}).create(localOrder),e=>e.code==='PAYMENT_UNAVAILABLE'&&!e.message.includes(config.keySecret));assert.equal(count,1);
});
test('Non-JSON and oversized successful responses remain unresolved',async()=>{
 for(const body of [config.keySecret,'x'.repeat(262145)])await assert.rejects(api(async()=>new Response(body)).create(localOrder),e=>e.code==='PAYMENT_RESPONSE_INVALID'&&!e.message.includes(config.keySecret));
});
test('Gateway success still requires exact price, currency, receipt and ID',async()=>{
 for(const patch of [{amount:1},{currency:'USD'},{receipt:'another'},{id:'wrong'}])await assert.rejects(api(async()=>Response.json({...gatewayOrder(),...patch})).create(localOrder),e=>e.code==='PAYMENT_RESPONSE_INVALID');
});
test('Recovery uses a receipt-filtered GET and does not create a gateway order',async()=>{
 const calls=[];const provider=api(async(url,opts)=>{calls.push({url,opts});return Response.json({count:1,items:[gatewayOrder()]});});
 assert.equal((await provider.findOrder(localOrder)).id,'order_fixture');assert.equal(calls.length,1);assert.equal(calls[0].opts.method,'GET');assert.equal(calls[0].opts.body,undefined);assert.equal(new URL(calls[0].url).searchParams.get('receipt'),localOrder.id);assert.equal(new URL(calls[0].url).searchParams.get('count'),'100');
});
test('Substring receipt results cannot be attached',async()=>{
 const candidate={...gatewayOrder(),receipt:localOrder.id+'-other'};
 assert.equal(await api(async()=>Response.json({count:1,items:[candidate]})).findOrder(localOrder),null);
});
test('Recovery independently validates identity, amount, mode and notes',async()=>{
 for(const patch of [{amount:100},{currency:'USD'},{id:'bad'},{entity:'payment'},{status:'unknown'},{notes:{}},{notes:{khaga_order_id:'different',khaga_mode:'test'}},{notes:{khaga_order_id:localOrder.id,khaga_mode:'live'}}])await assert.rejects(api(async()=>Response.json({count:1,items:[{...gatewayOrder(),...patch}]})).findOrder(localOrder),e=>e.code==='PAYMENT_RECOVERY_CONFLICT');
});
test('Duplicates, truncated lists and malformed collections require review',async()=>{
 for(const data of [{count:2,items:[gatewayOrder(),gatewayOrder()]},{count:100,items:Array.from({length:100},()=>gatewayOrder())},{count:2,items:[gatewayOrder()]},{items:{}},{count:0}])await assert.rejects(api(async()=>Response.json(data)).findOrder(localOrder),e=>e.code==='PAYMENT_RECOVERY_CONFLICT');
});
test('Invalid payment collection is not mistaken for no payments',async()=>{
 await assert.rejects(api(async()=>Response.json({})).payments('order_fixture'),e=>e.code==='PAYMENT_RESPONSE_INVALID');
});
test('Unknown exceptions cannot print original text or uncontrolled stage values',()=>{
 const issue=gatewayDiagnostic(new Error(config.keySecret),config.keySecret);noSecret(issue);assert.equal(issue.stage,'gateway_create');assert.equal(issue.code,'PAYMENT_UNAVAILABLE');
});
async function fixture(fn){
 const dir=mkdtempSync(join(tmpdir(),'khaga-order-recovery-'));const repo=await SQLiteRepository.open(dir);await seedCatalogue(repo);const store=new SQLiteOrderStore(repo);
 const guest=randomBytes(32).toString('hex'),logs=[];const rows=new Map();let posts=0,finds=0,payments=[];
 const provider={
  create:async order=>{posts++;const result=gatewayOrder(order);rows.set(order.id,result);return result.id;},
  findOrder:async order=>{finds++;return rows.get(order.id)||null;},
  payments:async()=>payments,
  order:async order=>rows.get(order.id),
 };
 const log=m=>logs.push(m);const service=checkoutService({repo,store,provider,config,log});
 const items=[{product:'origin-tee',colour:'stone',size:'M',quantity:1}];
 const input={items,requestKey:randomBytes(32).toString('hex'),quoteHash:(await service.quote(items)).hash,customer:{name:'Test Buyer',email:'buyer@example.test',phone:'9000000000',line1:'123 Test Street',line2:'',city:'Test City',state:'Karnataka',postalCode:'560001',country:'IN'}};
 try{await fn({repo,store,provider,service,guest,input,logs,rows,log,dir,counts:()=>({posts,finds}),setPayments:p=>{payments=p;}});}finally{await repo.close();rmSync(dir,{recursive:true,force:true});}
}
test('Lost create response recovers the SAME saved order; no second POST',async()=>fixture(async f=>{
 const original=f.provider.create;f.provider.create=async o=>{await original(o);throw Error('Lost response '+config.keySecret);};
 const a=await f.service.create(f.input,f.guest);assert.equal(a.order.status,'creation_unknown');assert.equal(a.payment,null);noSecret(a);noSecret(f.logs);
 const b=await f.service.reconcile(a.order.id,f.guest);assert.equal(b.order.id,a.order.id);assert.equal(b.order.status,'payment_pending');assert.equal(b.payment.orderId,'order_fixture');assert.deepEqual(f.counts(),{posts:1,finds:1});
 await f.service.create(f.input,f.guest);assert.equal(f.counts().posts,1);
}));
test('Binding failure is distinguished and can be recovered without replacing the order',async()=>fixture(async f=>{
 const original=f.store.bind.bind(f.store);f.store.bind=async()=>{throw Error('Database '+config.keySecret);};
 const a=await f.service.create(f.input,f.guest);assert.equal(a.issue.code,'PAYMENT_BINDING_FAILED');assert.equal(a.issue.stage,'order_binding');noSecret(a);noSecret(f.logs);
 f.store.bind=original;const b=await f.service.reconcile(a.order.id,f.guest);assert.equal(b.order.status,'payment_pending');assert.equal(f.counts().posts,1);
}));
test('Authentication failure during create is directly reported, not mislabelled a lost response',async()=>fixture(async f=>{
 f.provider.create=async()=>{throw new GatewayError('PAYMENT_AUTH_FAILED',401);};
 const a=await f.service.create(f.input,f.guest);assert.equal(a.issue.code,'PAYMENT_AUTH_FAILED');assert.equal(a.issue.httpStatus,401);assert.equal(a.payment,null);noSecret(a);assert.equal(JSON.parse(f.logs[0]).event,'KHAGA_CHECKOUT_FAILURE');
}));
test('Old uncertain records with no gateway order remain blocked, never auto-recreated',async()=>fixture(async f=>{
 f.provider.create=async()=>{throw Error('offline');};const a=await f.service.create(f.input,f.guest);
 await assert.rejects(f.service.reconcile(a.order.id,f.guest),e=>e.code==='PAYMENT_ORDER_NOT_FOUND');assert.equal((await f.store.get(a.order.id)).provider_id,null);assert.equal((await f.store.get(a.order.id)).status,'creation_unknown');assert.equal(f.counts().posts,0);
}));
test('Reconcile rejects a foreign browser session before accessing provider',async()=>fixture(async f=>{
 f.provider.create=async()=>{throw Error('offline');};const a=await f.service.create(f.input,f.guest);
 await assert.rejects(f.service.reconcile(a.order.id,'foreign'),e=>e.status===404);assert.equal(f.counts().finds,0);
}));
test('Provider lookup authentication failure is actionable in an existing saved order',async()=>fixture(async f=>{
 f.provider.create=async()=>{throw Error('offline');};const a=await f.service.create(f.input,f.guest);f.provider.findOrder=async()=>{throw new GatewayError('PAYMENT_AUTH_FAILED',400);};
 await assert.rejects(f.service.reconcile(a.order.id,f.guest),e=>e.code==='PAYMENT_AUTH_FAILED');assert.equal(JSON.parse(f.logs.at(-1)).stage,'gateway_lookup');noSecret(f.logs);
}));
test('Concurrent recovery attaches one gateway order, with one original create',async()=>fixture(async f=>{
 const create=f.provider.create;f.provider.create=async o=>{await create(o);throw Error('lost');};const a=await f.service.create(f.input,f.guest);
 const results=await Promise.all(Array.from({length:4},()=>f.service.reconcile(a.order.id,f.guest)));assert.equal(new Set(results.map(r=>r.payment.orderId)).size,1);assert.equal(f.counts().posts,1);assert.equal((await f.store.list()).length,1);
}));
test('Recovery binding and captured payment survive reopening persistent local store',async()=>fixture(async f=>{
 const create=f.provider.create;f.provider.create=async o=>{await create(o);throw Error('lost');};const a=await f.service.create(f.input,f.guest);
 f.setPayments([{id:'pay_fixture',order_id:'order_fixture',amount:299000,currency:'INR',status:'captured',captured:true}]);
 const b=await f.service.reconcile(a.order.id,f.guest);assert.equal(b.order.status,'paid');assert.equal(b.payment,null);
 const second=await SQLiteRepository.open(f.dir);try{const row=await new SQLiteOrderStore(second).get(a.order.id);assert.equal(row.payment_id,'pay_fixture');assert.equal(row.status,'paid');assert.equal(row.provider_id,'order_fixture');}finally{await second.close();}
}));
test('Recovered authorized payments stay pending and cannot open another payment window',async()=>fixture(async f=>{
 const create=f.provider.create;f.provider.create=async o=>{await create(o);throw Error('lost');};const a=await f.service.create(f.input,f.guest);
 f.setPayments([{id:'pay_fixture',order_id:'order_fixture',amount:299000,currency:'INR',status:'authorized',captured:false}]);
 const b=await f.service.reconcile(a.order.id,f.guest);assert.equal(b.order.status,'payment_pending');assert.equal(b.payment,null);
}));
test('Recovered paid/attempted gateway with missing payment detail never offers another payment',async()=>fixture(async f=>{
 const create=f.provider.create;f.provider.create=async o=>{await create(o);throw Error('lost');};const a=await f.service.create(f.input,f.guest);f.rows.get(a.order.id).status='paid';
 const b=await f.service.reconcile(a.order.id,f.guest);assert.equal(b.payment,null);assert.notEqual(b.order.status,'paid');
 const again=await f.service.reconcile(a.order.id,f.guest);assert.equal(again.payment,null);
}));
test('A creator still in flight cannot race receipt recovery',async()=>fixture(async f=>{
 const row=await f.store.create({id:randomUUID(),guest_hash:sha(f.guest),request_key:f.input.requestKey,fingerprint:'f'.repeat(64),body:{mode:'test',quote:await f.service.quote(f.input.items),customer:f.input.customer}});
 const b=await f.service.reconcile(row.order.id,f.guest);assert.equal(b.order.status,'creating');assert.equal(f.counts().finds,0);
}));
test('Actual HTTP Check payment status returns the classified error and preserves the record',async()=>fixture(async f=>{
 f.provider.create=async()=>{throw Error('lost');};const a=await f.service.create(f.input,f.guest);f.provider.findOrder=async()=>{throw new GatewayError('PAYMENT_AUTH_FAILED',401);};
 const management={repo:f.repo,config:{enabled:true,origin:'http://127.0.0.1',secure:false},session:async req=>req.headers.cookie?.includes('owner=fixture')?{}:null,handle:async()=>false};
 const runtime={...config};const commerce=checkoutHTTP({management,config:runtime,provider:f.provider,store:f.store,log:f.log});const server=createApp({username:'',password:'',management,commerce});server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;runtime.origin=base;
 try{const res=await fetch(base+'/api/checkout/orders/'+a.order.id+'/reconcile',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,Cookie:'owner=fixture; khaga_checkout_local='+f.guest,'X-CSRF-Token':sha('khaga-checkout-csrf:'+f.guest)},body:'{}'});assert.equal(res.status,503);const json=await res.json();assert.equal(json.error,'PAYMENT_AUTH_FAILED');noSecret(json);assert.match(json.message,/matching pair/);assert.equal((await f.store.list()).length,1);}finally{await new Promise(r=>server.close(r));}
}));

test('Known order lookup cannot switch a saved record to another provider ID',async()=>{
 const row={...localOrder,provider_id:'order_fixture'};
 const provider=api(async()=>Response.json({...gatewayOrder(),id:'order_foreign'}));
 await assert.rejects(provider.order(row),e=>e.code==='PAYMENT_RECOVERY_CONFLICT');
});
test('Null database binding is classified instead of throwing outside the recovery catch',async()=>fixture(async f=>{
 f.store.bind=async()=>null;const a=await f.service.create(f.input,f.guest);
 assert.equal(a.order.status,'creation_unknown');assert.equal(a.issue.code,'PAYMENT_BINDING_FAILED');assert.equal(a.payment,null);
}));
