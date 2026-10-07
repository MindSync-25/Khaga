import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {setup,sql,literal,LocalRepository,seedProduct,seedPolicy} from './local-postgres.mjs';
import {CommerceStore} from '../../src/commerce/store.mjs';
import {commerceService} from '../../src/commerce/service.mjs';
import {GatewayError} from '../../src/checkout/gateway-errors.mjs';
import {sha} from '../../src/checkout/core.mjs';
const customer={name:'Fixture Buyer',email:'fixture@example.invalid',phone:'9876543210',line1:'123 Fixture Road',line2:'',city:'Mumbai',state:'Maharashtra',postalCode:'400001',country:'IN'};
await setup();await seedPolicy();await seedPolicy('live');
const repo=new LocalRepository();
function harness(mode='test'){
 const config={purchasesEnabled:true,mode,keyId:'rzp_'+mode+'_fixture',keySecret:'fixture-secret',webhookSecret:'w'.repeat(32)};
 const store=new CommerceStore(repo,mode);let creates=0,orders=new Map(),payments=[];
 const provider={async create(o){creates++;const id='order_'+o.id.replaceAll('-','');orders.set(id,{id,receipt:o.id,amount:o.body.quote.total,currency:'INR',status:'created',notes:{khaga_order_id:o.id,khaga_mode:mode}});return id;},async findOrder(o){return [...orders.values()].find(x=>x.receipt===o.id)||null;},async order(o){return orders.get(o.provider_id);},async payments(){return payments;},async payment(id){return payments.find(p=>p.id===id);},async request(path){return orders.get(path.split('/').pop());}};
 const service=commerceService({repo,store,provider,config});
 return {config,store,provider,service,get creates(){return creates;},set payments(p){payments=p;}};
}
async function input(h,capacity=3){const id='fixture-'+randomUUID();await seedProduct(id,capacity);const items=[{product:id,colour:'ivory',size:'M',quantity:1}];return {customer,items,quoteHash:(await h.service.quote(items)).hash,requestKey:sha(randomUUID())};}
test('migration reruns, legacy tables preserved, public RPC denied',async()=>{
 await setup();assert.equal(await sql("SELECT has_function_privilege('anon','public.khaga_commerce(text,text,jsonb)','EXECUTE')"),'f');
 assert.equal(await sql("SELECT has_function_privilege('service_role','khaga_private.close_uncreated_order(uuid,text)','EXECUTE')"),'f');
 assert.ok(await sql("SELECT to_regclass('khaga_private.test_orders')"));
});
test('concurrent retries create one intent/provider order/reservation; competing guest cannot oversell',async()=>{
 const h=harness(),body=await input(h,1),guest=randomUUID();
 const results=await Promise.all(Array.from({length:8},()=>h.service.create(body,guest)));
 assert.equal(new Set(results.map(r=>r.order.id)).size,1);assert.equal(h.creates,1);
 await assert.rejects(h.service.create({...body,requestKey:sha(randomUUID())},randomUUID()));
 assert.equal(await sql(`SELECT count(*) FROM khaga_private.commerce_reservations WHERE order_id=${literal(results[0].order.id)}`),'1');
});
test('captured browser/webhook race is atomic, failed and authorized are not paid, invalid signatures and ownership rejected',async()=>{
 const h=harness(),body=await input(h),guest=randomUUID(),r=await h.service.create(body,guest),id=r.order.id;
 let p={id:'pay_'+id.replaceAll('-',''),order_id:r.payment.orderId,amount:r.payment.amount,currency:'INR',status:'authorized',captured:false};h.payments=[p];
 assert.equal((await h.service.reconcile(id,guest)).order.status,'payment_pending');
 await assert.rejects(h.service.owned(id,'another-guest'));await assert.rejects(h.service.verify(id,guest,{razorpay_order_id:p.order_id,razorpay_payment_id:p.id,razorpay_signature:'0'.repeat(64)}));
 p={...p,status:'captured',captured:true};h.payments=[p];
 const callback={razorpay_order_id:p.order_id,razorpay_payment_id:p.id,razorpay_signature:createHmac('sha256',h.config.keySecret).update(p.order_id+'|'+p.id).digest('hex')};
 const raw=Buffer.from(JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:p.id}}}})),signature=createHmac('sha256',h.config.webhookSecret).update(raw).digest('hex');
 await Promise.all([h.service.verify(id,guest,callback),h.service.webhook(raw,signature,'evt-'+id),h.service.webhook(raw,signature,'evt-'+id)]);
 assert.equal((await h.store.get(id)).status,'paid');
 assert.equal(await sql(`SELECT count(*) FROM khaga_private.commerce_events WHERE order_id=${literal(id)}`),'1');
 h.payments=[{...p,status:'failed',captured:false}];assert.equal((await h.service.reconcile(id,guest)).order.status,'paid');
 h.payments=[{...p,amount:1}];await assert.rejects(h.service.reconcile(id,guest));
 assert.equal(await new CommerceStore(repo,'live').get(id),null);
});
test('definitive rejection releases stock; uncertain creation recovers with GET and no second POST',async()=>{
 const h=harness(),body=await input(h,1),guest=randomUUID();h.provider.create=async()=>{throw new GatewayError('PAYMENT_AUTH_FAILED',401)};
 const rejected=await h.service.create(body,guest);assert.equal(rejected.order.status,'creation_rejected');
 assert.equal(await sql(`SELECT count(*) FROM khaga_private.commerce_reservations WHERE order_id=${literal(rejected.order.id)}`),'0');
 const h2=harness(),body2=await input(h2),guest2=randomUUID(),create=h2.provider.create;
 h2.provider.create=async o=>{await create(o);throw new GatewayError('PAYMENT_UNAVAILABLE');};
 const unknown=await h2.service.create(body2,guest2);assert.equal(unknown.order.status,'creation_unknown');
 await sql(`UPDATE khaga_private.commerce_orders SET created_at=now()-interval '2 minutes' WHERE id=${literal(unknown.order.id)}`);
 assert.ok((await h2.service.reconcile(unknown.order.id,guest2)).payment);assert.equal(h2.creates,1);
});
test('lost binding is recovered by signed webhook; persistence survives new service instance',async()=>{
 const h=harness(),body=await input(h),guest=randomUUID(),bind=h.store.bind.bind(h.store);h.store.bind=async()=>{throw Error('lost database connection')};
 const r=await h.service.create(body,guest);h.store.bind=bind;
 const gateway=await h.provider.findOrder(await h.store.get(r.order.id));
 const p={id:'pay_'+r.order.id.replaceAll('-',''),order_id:gateway.id,amount:gateway.amount,currency:'INR',status:'captured',captured:true};h.payments=[p];
 const raw=Buffer.from(JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:p.id}}}}));
 await h.service.webhook(raw,createHmac('sha256',h.config.webhookSecret).update(raw).digest('hex'),'evt-lost-'+r.order.id);
 assert.equal((await harness().store.get(r.order.id)).status,'paid');
});
test('live pathway uses separate credentials, order namespace and reservation capacity',async()=>{
 const h=harness('live'),body=await input(h,1),r=await h.service.create(body,randomUUID());assert.equal(r.order.mode,'live');assert.match(r.payment.keyId,/rzp_live_/);
 assert.equal(await new CommerceStore(repo,'test').get(r.order.id),null);
});
test('database rejects stale authoritative prices and conflicting idempotency payloads',async()=>{
 const h=harness(),body=await input(h),guest=randomUUID(),r=await h.service.create(body,guest);
 await assert.rejects(h.service.create({...body,customer:{...customer,name:'Different Buyer'}},guest),{code:'IDEMPOTENCY_CONFLICT'});
 const q=await h.service.quote(body.items);
 await sql(`UPDATE khaga_private.documents SET body=jsonb_set(body,'{published,price}','200000') WHERE id=${literal(body.items[0].product)}`);
 await assert.rejects(h.store.create({id:randomUUID(),guest:sha(randomUUID()),key:sha(randomUUID()),fingerprint:sha('fixture'),body:{mode:'test',customer,quote:q}}));
 assert.equal((await h.store.get(r.order.id)).body.quote.total,110000);
});
test('operator-reviewed unknown closure retains record and allows a new attempt',async()=>{
 const h=harness(),body=await input(h,1),guest=randomUUID();h.provider.create=async()=>{throw new GatewayError('PAYMENT_UNAVAILABLE');};
 const r=await h.service.create(body,guest);
 await assert.rejects(sql(`SELECT khaga_private.close_uncreated_order(${literal(r.order.id)},'too short')`));
 await sql(`UPDATE khaga_private.commerce_orders SET created_at=now()-interval '2 hours' WHERE id=${literal(r.order.id)}`);
 await sql(`SELECT khaga_private.close_uncreated_order(${literal(r.order.id)},'Fixture provider investigation confirms no order or payment exists')`);
 assert.equal((await h.service.reconcile(r.order.id,guest)).order.status,'closed_unpaid');
 const next=harness();assert.ok((await next.service.create({...body,requestKey:sha(randomUUID())},guest)).payment);
 assert.equal((await h.store.get(r.order.id)).status,'closed_unpaid');
});
test('webhook database failure is not acknowledged, replay can complete after recovery',async()=>{
 const h=harness(),body=await input(h),r=await h.service.create(body,randomUUID());
 const p={id:'pay_'+r.order.id.replaceAll('-',''),order_id:r.payment.orderId,amount:r.payment.amount,currency:'INR',status:'captured',captured:true};h.payments=[p];
 const raw=Buffer.from(JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:p.id}}}})),signature=createHmac('sha256',h.config.webhookSecret).update(raw).digest('hex');
 const mark=h.store.mark.bind(h.store);h.store.mark=async()=>{throw Error('storage unavailable')};
 await assert.rejects(h.service.webhook(raw,signature,'evt-persist-'+r.order.id));assert.equal((await h.store.get(r.order.id)).status,'payment_pending');
 h.store.mark=mark;await h.service.webhook(raw,signature,'evt-persist-'+r.order.id);assert.equal((await h.store.get(r.order.id)).status,'paid');
});
test('closing new sales retains confirmation, signed webhook and persistence without offering payment',async()=>{
 const h=harness('live'),body=await input(h),guest=randomUUID(),r=await h.service.create(body,guest);
 const payment={id:'pay_'+r.order.id.replaceAll('-',''),order_id:r.payment.orderId,amount:r.payment.amount,currency:'INR',status:'captured',captured:true};
 h.config.purchasesEnabled=false;
 assert.equal((await h.service.reconcile(r.order.id,guest)).payment,null);
 await assert.rejects(h.service.create(body,guest),{code:'PURCHASES_DISABLED'});
 h.payments=[payment];
 const raw=Buffer.from(JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:payment.id}}}}));
 const signature=createHmac('sha256',h.config.webhookSecret).update(raw).digest('hex');
 await assert.rejects(h.service.webhook(raw,'bad','closed-'+r.order.id),{code:'INVALID_SIGNATURE'});
 await h.service.webhook(raw,signature,'closed-'+r.order.id);
 await h.service.webhook(raw,signature,'closed-'+r.order.id);
 const callback={razorpay_order_id:payment.order_id,razorpay_payment_id:payment.id,razorpay_signature:createHmac('sha256',h.config.keySecret).update(payment.order_id+'|'+payment.id).digest('hex')};
 assert.equal((await h.service.verify(r.order.id,guest,callback)).order.status,'paid');
 assert.equal((await new CommerceStore(repo,'live').get(r.order.id)).status,'paid');
 assert.equal(await new CommerceStore(repo,'test').get(r.order.id),null);
 assert.equal(h.creates,1);
 assert.equal(await sql(`SELECT count(*) FROM khaga_private.commerce_events WHERE order_id=${literal(r.order.id)}`),'1');
});
