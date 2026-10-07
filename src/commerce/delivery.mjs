import {customerInput,sha} from '../checkout/core.mjs';
import {HttpError,requireThat as need} from '../management/errors.mjs';

export const unsupportedDelivery='We’re currently unable to deliver to this address.\nPlease choose another delivery address.';
const unavailable=()=>new HttpError(503,'DELIVERY_LOOKUP_UNAVAILABLE','We couldn’t verify your delivery address right now. Please try again. Your bag and details are unchanged.');
const normal=value=>typeof value==='string'?value.trim().replace(/\s+/g,' ').toLowerCase():'';

// Documented India-only postal directory. Send only the PIN, never customer details.
// See docs/delivery-validation.md for provenance, contract and failure behaviour.
export async function fetchPin(pin,{fetchImpl=fetch}={}){
 need(typeof pin==='string'&&/^[1-9][0-9]{5}$/.test(pin),422,'INVALID_ADDRESS','Check the six-digit delivery PIN code.');
 let response,data;
 try{
  response=await fetchImpl('https://api.pincodeapi.in/api/v1/pincode/'+pin,{signal:AbortSignal.timeout(5000),redirect:'error',headers:{Accept:'application/json'}});
 }catch{throw unavailable();}
 if(response.status===429){
  const retry=response.headers?.get('retry-after'),seconds=retry&&Number(retry);
  const retryAt=retry&&!Number.isFinite(seconds)?Date.parse(retry):NaN;
  const retryAfterMs=Math.max(10000,Number.isFinite(seconds)?seconds*1000:Number.isFinite(retryAt)?retryAt-Date.now():0);
  throw Object.assign(unavailable(),{retryAfterMs});
 }
 try{data=await response.json();}catch{throw unavailable();}
 if(response.status===404&&data?.code==='PINCODE_NOT_FOUND')throw new HttpError(422,'INVALID_ADDRESS','We couldn’t find that PIN code. Please check your delivery address.');
 if(!response.ok||data?.success!==true||data?.data?.pincode!==pin||data?.meta?.api_version!=='v1')throw unavailable();
 const offices=data.data.post_offices;
 if(!Array.isArray(offices)||!offices.length||data.meta.count!==offices.length||offices.some(o=>o?.pincode!==pin||typeof o.state!=='string'||!o.state.trim()))throw unavailable();
 const states=new Set(offices.map(o=>normal(o.state)));
 // Ambiguous/incomplete data is a lookup failure, never proof of eligibility.
 if(states.size!==1)throw unavailable();
 return {state:offices[0].state.trim()};
}

export const PIN_CACHE_TTL_MS=5*60*1000,PIN_CACHE_MAX_ENTRIES=128;
// One bounded cache per warm Lambda instance. Never cache customer eligibility:
// country, state, address and quote binding are still checked on every submission.
export function createPinLookup({fetchImpl=fetch,now=Date.now}={}){
 const cache=new Map(),pending=new Map();let starts=[],cooldownUntil=0;
 return async pin=>{
  need(typeof pin==='string'&&/^[1-9][0-9]{5}$/.test(pin),422,'INVALID_ADDRESS','Check the six-digit delivery PIN code.');
  const time=now();
  for(const [key,value] of cache)if(value.expires<=time)cache.delete(key);
  const hit=cache.get(pin);
  if(hit){cache.delete(pin);cache.set(pin,hit);return hit.result;}
  if(pending.has(pin))return pending.get(pin);
  starts=starts.filter(t=>t>time-10000);
  // No queue, retry loop or alternate-provider fallback. At most six outstanding
  // requests and six starts per ten seconds here; other instances are independent.
  if(time<cooldownUntil||starts.length>=6||pending.size>=6)throw unavailable();
  starts.push(time);
  const task=(async()=>{
   try{
    const result=Object.freeze(await fetchPin(pin,{fetchImpl}));
    if(cache.size>=PIN_CACHE_MAX_ENTRIES)cache.delete(cache.keys().next().value);
    cache.set(pin,{result,expires:now()+PIN_CACHE_TTL_MS});return result;
   }catch(e){
    if(e.retryAfterMs)cooldownUntil=Math.max(cooldownUntil,now()+e.retryAfterMs);
    throw e;
   }finally{pending.delete(pin);}
  })();
  pending.set(pin,task);return task;
 };
}
export const lookupPin=createPinLookup();

export async function deliveryCustomer(input,{lookup=lookupPin}={}){
 need(input&&typeof input==='object'&&!Array.isArray(input),422,'INVALID_ADDRESS','Enter your contact and delivery details.');
 const country=typeof input.country==='string'?input.country.trim().toUpperCase():'';
 need(/^[A-Z]{2}$/.test(country)&&new Intl.DisplayNames(['en'],{type:'region',fallback:'none'}).of(country)&&country!=='ZZ',422,'INVALID_ADDRESS','Choose a valid delivery country.');
 need(country==='IN',422,'DELIVERY_UNSUPPORTED',unsupportedDelivery);
 const customer=customerInput({...input,country});
 let found;
 try{found=await lookup(customer.postalCode);}catch(e){if(e instanceof HttpError)throw e;throw unavailable();}
 if(!found||typeof found.state!=='string'||!found.state.trim())throw unavailable();
 const state=normal(customer.state)==='ka'?'karnataka':normal(customer.state);
 need(state===normal(found.state),422,'INVALID_ADDRESS','The state and PIN code don’t match. Please check your delivery address.');
 need(state==='karnataka',422,'DELIVERY_UNSUPPORTED',unsupportedDelivery);
 return {...customer,state:'Karnataka'};
}

export function deliveryHash(customer){
 return sha(JSON.stringify(['karnataka-v1',...['country','state','postalCode','city','line1','line2'].map(k=>customer[k])]));
}
