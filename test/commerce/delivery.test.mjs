import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {deliveryCustomer,lookupPin,unsupportedDelivery} from '../../src/commerce/delivery.mjs';
import {commerceService} from '../../src/commerce/service.mjs';
import {handlerFor} from '../../src/commerce/http.mjs';
import {sha} from '../../src/checkout/core.mjs';
import {deliveryPolicy} from './local-postgres.mjs';

const customer={name:'Fixture Buyer',email:'fixture@example.invalid',phone:'9876543210',line1:'123 Fixture Road',line2:'',city:'Bengaluru',state:'Karnataka',postalCode:'560001',country:'IN'};
const items=[{product:'tee',colour:'ivory',size:'M',quantity:1}];
const lookup=async pin=>pin==='560001'?{state:'Karnataka'}:pin==='400001'?{state:'Maharashtra'}:null;
const config={mode:'test',purchasesEnabled:true,keyId:'rzp_test_fixture',keySecret:'fixture-secret',webhookSecret:'w'.repeat(32),sessionSecret:'s'.repeat(32),origins:['https://khaga.test']};
const product={id:'tee',number:'01',name:'Tee',price:100000,colours:['ivory'],sizes:['M'],palette:{ivory:{name:'Ivory'}},media:{ivory:{}},sampleApproved:true,variants:[{colour:'ivory',size:'M',mode:'stock',quantity:3}]};
function harness(pinLookup=lookup,policy=deliveryPolicy){
 const effects={catalogue:0,reservations:0,orders:0,provider:0,lookups:0};
 const repo={takeRate:async()=>true,list:async()=>{effects.catalogue++;return [{body:{published:product}}];}};
 const store={policy:async()=>policy,list:async()=>[],create:async()=>{effects.orders++;effects.reservations++;throw Error('Unexpected create');}};
 const provider={create:async()=>{effects.provider++;throw Error('Unexpected provider');}};
 const service=commerceService({repo,store,provider,config,pinLookup:async pin=>{effects.lookups++;return pinLookup(pin);}});
 return {effects,repo,store,provider,config,service};
}
const body=c=>({items,customer:c,requestKey:'a'.repeat(64),quoteHash:'forged'});
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
const data=(pin='560001',state='Karnataka')=>({success:true,data:{pincode:pin,post_offices:[{pincode:pin,state}]},meta:{api_version:'v1',count:1}});

test('documented lookup sends only PIN over HTTPS and verifies response identity',async()=>{
 assert.deepEqual(await lookupPin('560001',{fetchImpl:async(url,options)=>{assert.equal(url,'https://api.pincodeapi.in/api/v1/pincode/560001');assert.equal(options.redirect,'error');assert.ok(options.signal);return response(data());}}),{state:'Karnataka'});
 for(const value of [data('400001'),{}, {...data(),meta:{api_version:'v1',count:2}}, {...data(),data:{pincode:'560001',post_offices:[{pincode:'560001',state:'Karnataka'},{pincode:'560001',state:'Kerala'}]}}]){
  await assert.rejects(lookupPin('560001',{fetchImpl:async()=>response(value)}),{code:'DELIVERY_LOOKUP_UNAVAILABLE'});
 }
});
test('unknown PIN is invalid; HTTP failure, rate limit, timeout and malformed data are retryable outages',async()=>{
 await assert.rejects(lookupPin('999999',{fetchImpl:async()=>response({code:'PINCODE_NOT_FOUND'},404)}),{code:'INVALID_ADDRESS'});
 for(const status of [404,429,500,503])await assert.rejects(lookupPin('560001',{fetchImpl:async()=>response({},status)}),{code:'DELIVERY_LOOKUP_UNAVAILABLE'});
 for(const fetchImpl of [async()=>{throw Error('timeout');},async()=>({json:async()=>{throw Error('bad JSON');}})])await assert.rejects(lookupPin('560001',{fetchImpl}),{code:'DELIVERY_LOOKUP_UNAVAILABLE'});
});
test('verified Karnataka delivery gets zero shipping without changing tax policy',async()=>{
 const h=harness();const q=await h.service.quote(items,customer);
 assert.equal(q.shipping,0);assert.equal(q.total,100000);assert.equal(q.tax,15254);assert.equal(q.taxNote,deliveryPolicy.taxNote);
 assert.equal((await deliveryCustomer({...customer,state:' ka '},{lookup})).state,'Karnataka');
 assert.equal(h.effects.orders,0);assert.equal(h.effects.provider,0);
});
for(const [name,c,code] of [
 ['other state',{...customer,state:'Maharashtra',postalCode:'400001'},'DELIVERY_UNSUPPORTED'],
 ['foreign address',{...customer,country:'US',state:'California',postalCode:'90210'},'DELIVERY_UNSUPPORTED'],
 ['state/PIN mismatch',{...customer,state:'Karnataka',postalCode:'400001'},'INVALID_ADDRESS'],
 ['reverse mismatch',{...customer,state:'Maharashtra'},'INVALID_ADDRESS'],
 ['missing country',{...customer,country:undefined},'INVALID_ADDRESS'],
 ['malformed PIN',{...customer,postalCode:'56000x'},'INVALID_ADDRESS'],
 ['missing address',undefined,'INVALID_ADDRESS'],
])test(name+' blocks quote and direct create before any order/reservation/provider call',async()=>{
 const h=harness();for(const operation of [()=>h.service.quote(items,c),()=>h.service.create(body(c),'guest')]){
  await assert.rejects(operation,e=>{assert.equal(e.code,code);if(code==='DELIVERY_UNSUPPORTED')assert.equal(e.message,unsupportedDelivery);return true;});
 }
 assert.equal(h.effects.catalogue,0);assert.equal(h.effects.orders,0);assert.equal(h.effects.reservations,0);assert.equal(h.effects.provider,0);
});
test('lookup outage blocks quote and create without treating destination as unsupported',async()=>{
 const h=harness(async()=>{throw Error('offline');});
 await assert.rejects(h.service.quote(items,customer),{code:'DELIVERY_LOOKUP_UNAVAILABLE'});
 await assert.rejects(h.service.create(body(customer),'guest'),{code:'DELIVERY_LOOKUP_UNAVAILABLE'});
 assert.equal(h.effects.orders+h.effects.reservations+h.effects.provider,0);
});
test('changed address invalidates quote; create revalidates rather than trusting quote hash',async()=>{
 const h=harness(),q=await h.service.quote(items,customer);
 for(const change of [{line1:'456 Different Road'},{line2:'Apartment 2'},{city:'Another City'}])await assert.rejects(h.service.create({...body({...customer,...change}),quoteHash:q.hash},'guest'),{code:'QUOTE_CHANGED'});
 await assert.rejects(h.service.create({...body({...customer,state:'Maharashtra',postalCode:'400001'}),quoteHash:q.hash},'guest'),{code:'DELIVERY_UNSUPPORTED'});
 assert.equal(h.effects.lookups,5);assert.equal(h.effects.orders+h.effects.reservations+h.effects.provider,0);
});
test('lookup failure after successful quote still prevents order creation',async()=>{
 let online=true;const h=harness(async pin=>{if(!online)throw Error('offline');return lookup(pin);});
 const q=await h.service.quote(items,customer);online=false;
 await assert.rejects(h.service.create({...body(customer),quoteHash:q.hash},'guest'),{code:'DELIVERY_LOOKUP_UNAVAILABLE'});
 assert.equal(h.effects.orders+h.effects.reservations+h.effects.provider,0);
});
test('nonzero or missing shipping policy cannot produce a charged shipping quote',async()=>{
 for(const policy of [null,{...deliveryPolicy,shippingPaise:10000}]){
  const h=harness(lookup,policy);await assert.rejects(h.service.quote(items,customer),{code:'DELIVERY_POLICY_REQUIRED'});
  assert.equal(h.effects.orders+h.effects.reservations+h.effects.provider,0);
 }
});
test('credentialed direct HTTP requests cannot bypass delivery validation with a forged quote',async()=>{
 const h=harness(),handler=handlerFor('purchase',async()=>h);
 const event=(path,value={})=>({version:'2.0',rawPath:path,headers:{origin:'https://khaga.test','content-type':'application/json'},requestContext:{http:{method:'POST',sourceIp:'127.0.0.1'}},body:JSON.stringify(value)});
 const session=await handler(event('/checkout/session'));
 for(const path of ['/checkout/quote','/purchase']){
  const e=event(path,body({...customer,state:'Maharashtra',postalCode:'400001'}));
  e.cookies=[session.cookies[0].split(';')[0]];e.headers['x-csrf-token']=JSON.parse(session.body).csrf;
  const r=await handler(e);assert.equal(r.statusCode,422);assert.equal(JSON.parse(r.body).error,'DELIVERY_UNSUPPORTED');
 }
 assert.equal(h.effects.orders+h.effects.reservations+h.effects.provider,0);
});
test('existing out-of-region payment confirmation, webhook and recovery never run delivery lookup',async()=>{
 const id='00000000-0000-4000-8000-000000000001',guest='guest';
 const o={id,mode:'test',guest_hash:sha(guest),provider_id:'order_fixture',status:'payment_pending',body:{customer:{...customer,state:'Maharashtra',postalCode:'400001'},quote:{total:100000}}};
 const payment={id:'pay_fixture',order_id:o.provider_id,amount:100000,currency:'INR',status:'captured',captured:true};let marks=0;
 const service=commerceService({config:{...config,purchasesEnabled:false},pinLookup:async()=>{throw Error('must not lookup');},store:{get:async()=>o,find:async()=>o,mark:async()=>{marks++;return {...o,status:'paid'};}},provider:{payment:async()=>payment,payments:async()=>[payment]}});
 const signature=createHmac('sha256',config.keySecret).update('order_fixture|pay_fixture').digest('hex');
 assert.equal((await service.verify(id,guest,{razorpay_order_id:o.provider_id,razorpay_payment_id:payment.id,razorpay_signature:signature})).order.status,'paid');
 const raw=Buffer.from(JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:payment.id}}}}));
 await service.webhook(raw,createHmac('sha256',config.webhookSecret).update(raw).digest('hex'),'fixture-event');
 const recovered=await service.reconcile(id,guest);assert.equal(recovered.order.status,'paid');assert.equal(recovered.payment,null);assert.equal(marks,3);
});
