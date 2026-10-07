import test from 'node:test';
import assert from 'node:assert/strict';
import {createPinLookup,PIN_CACHE_TTL_MS,PIN_CACHE_MAX_ENTRIES,deliveryCustomer,deliveryHash} from '../../src/commerce/delivery.mjs';

const ok=pin=>({ok:true,status:200,json:async()=>({success:true,data:{pincode:pin,post_offices:[{pincode:pin,state:'Karnataka'}]},meta:{api_version:'v1',count:1}})});
const customer={name:'Fixture Buyer',email:'fixture@example.invalid',phone:'9876543210',line1:'123 Fixture Road',line2:'',city:'Bengaluru',state:'Karnataka',postalCode:'560001',country:'IN'};
test('absolute cache expiry is not extended by hits; expired data cannot mask an outage',async()=>{
 let time=0,calls=0,down=false;
 const lookup=createPinLookup({now:()=>time,fetchImpl:async url=>{calls++;if(down)throw Error('offline');return ok(url.split('/').pop());}});
 await lookup('560001');time=PIN_CACHE_TTL_MS-1;await lookup('560001');assert.equal(calls,1);
 time++;down=true;await assert.rejects(lookup('560001'),{code:'DELIVERY_LOOKUP_UNAVAILABLE'});assert.equal(calls,2);
 down=false;await lookup('560001');assert.equal(calls,3);
});
test('concurrent same-PIN lookups coalesce; failure is not cached and a later attempt succeeds',async()=>{
 let calls=0,resolve;
 const lookup=createPinLookup({fetchImpl:async()=>{calls++;return new Promise(r=>{resolve=r;});}});
 const pending=Array.from({length:20},()=>lookup('560001'));assert.equal(calls,1);
 resolve(ok('560001'));const results=await Promise.all(pending);assert.ok(results.every(r=>r.state==='Karnataka'));assert.ok(Object.isFrozen(results[0]));
 await lookup('560001');assert.equal(calls,1);
 let fail=true;const retry=createPinLookup({fetchImpl:async()=>{calls++;if(fail)throw Error('offline');return ok('560001');}});
 const failed=await Promise.allSettled([retry('560001'),retry('560001')]);assert.ok(failed.every(r=>r.status==='rejected'));assert.equal(calls,2);
 fail=false;await retry('560001');assert.equal(calls,3);
});
test('cached state never caches address eligibility or quote binding',async()=>{
 let calls=0;const lookup=createPinLookup({fetchImpl:async()=>{calls++;return ok('560001');}});
 const first=await deliveryCustomer(customer,{lookup});
 const changed=await deliveryCustomer({...customer,line1:'456 Changed Road'},{lookup});assert.notEqual(deliveryHash(first),deliveryHash(changed));
 await assert.rejects(deliveryCustomer({...customer,state:'Maharashtra'},{lookup}),{code:'INVALID_ADDRESS'});
 await assert.rejects(deliveryCustomer({...customer,country:'US'},{lookup}),{code:'DELIVERY_UNSUPPORTED'});
 assert.equal(calls,1);
});
test('HTTP 429 coalesces and respects Retry-After; no expired-success fallback or retry loop',async()=>{
 let time=0,calls=0,limited=false;
 const lookup=createPinLookup({now:()=>time,fetchImpl:async url=>{calls++;return limited?{ok:false,status:429,headers:{get:()=> '30'},json:async()=>({code:'RATE_LIMITED'})}:ok(url.split('/').pop());}});
 await lookup('560001');time=PIN_CACHE_TTL_MS;limited=true;
 const results=await Promise.allSettled([lookup('560001'),lookup('560001')]);assert.ok(results.every(r=>r.reason.code==='DELIVERY_LOOKUP_UNAVAILABLE'));assert.equal(calls,2);
 time+=29999;await assert.rejects(lookup('560001'),{code:'DELIVERY_LOOKUP_UNAVAILABLE'});await assert.rejects(lookup('560002'),{code:'DELIVERY_LOOKUP_UNAVAILABLE'});assert.equal(calls,2);
 time++;limited=false;await lookup('560001');assert.equal(calls,3);
});
test('validated cache is bounded and evicts least recently used records',async()=>{
 let time=0,calls=0;const lookup=createPinLookup({now:()=>time,fetchImpl:async url=>{calls++;return ok(url.split('/').pop());}});
 for(let i=0;i<PIN_CACHE_MAX_ENTRIES;i++){if(i%6===0)time+=10001;await lookup(String(560000+i));}
 await lookup('560000'); // Preserve recently touched first entry.
 time+=10001;await lookup('561000');await lookup('560000');assert.equal(calls,PIN_CACHE_MAX_ENTRIES+1);
 await lookup('560001');assert.equal(calls,PIN_CACHE_MAX_ENTRIES+2);
});
test('distinct requests respect per-instance start and concurrency bounds without queuing',async()=>{
 let calls=0,time=0;const resolvers=[];
 const lookup=createPinLookup({now:()=>time,fetchImpl:url=>{calls++;return new Promise(r=>resolvers.push(()=>r(ok(url.split('/').pop()))));}});
 const pending=Array.from({length:6},(_,i)=>lookup(String(560000+i)));
 await assert.rejects(lookup('561000'),{code:'DELIVERY_LOOKUP_UNAVAILABLE'});assert.equal(calls,6);
 for(const resolve of resolvers)resolve();await Promise.all(pending);
 await assert.rejects(lookup('561000'),{code:'DELIVERY_LOOKUP_UNAVAILABLE'});assert.equal(calls,6);
 time=10000;const next=lookup('561000');assert.equal(calls,7);resolvers[6]();await next;
});
test('unknown PIN and malformed provider records never become cached success',async()=>{
 for(const response of [{ok:false,status:404,json:async()=>({code:'PINCODE_NOT_FOUND'})},{ok:true,status:200,json:async()=>({success:true})}]){
  let calls=0;const lookup=createPinLookup({fetchImpl:async()=>{calls++;return response;}});
  await assert.rejects(lookup('560001'));await assert.rejects(lookup('560001'));assert.equal(calls,2);
 }
});
