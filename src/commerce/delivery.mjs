import {customerInput,sha} from '../checkout/core.mjs';
import {HttpError,requireThat as need} from '../management/errors.mjs';

export const unsupportedDelivery='We’re currently unable to deliver to this address.\nPlease choose another delivery address.';
const unavailable=()=>new HttpError(503,'DELIVERY_LOOKUP_UNAVAILABLE','We couldn’t verify your delivery address right now. Please try again. Your bag and details are unchanged.');
const normal=value=>typeof value==='string'?value.trim().replace(/\s+/g,' ').toLowerCase():'';

// Documented India-only postal directory. Send only the PIN, never customer details.
// See docs/delivery-validation.md for provenance, contract and failure behaviour.
export async function lookupPin(pin,{fetchImpl=fetch}={}){
 let response,data;
 try{
  response=await fetchImpl('https://api.pincodeapi.in/api/v1/pincode/'+pin,{signal:AbortSignal.timeout(5000),redirect:'error',headers:{Accept:'application/json'}});
  data=await response.json();
 }catch{throw unavailable();}
 if(response.status===404&&data?.code==='PINCODE_NOT_FOUND')throw new HttpError(422,'INVALID_ADDRESS','We couldn’t find that PIN code. Please check your delivery address.');
 if(!response.ok||data?.success!==true||data?.data?.pincode!==pin||data?.meta?.api_version!=='v1')throw unavailable();
 const offices=data.data.post_offices;
 if(!Array.isArray(offices)||!offices.length||data.meta.count!==offices.length||offices.some(o=>o?.pincode!==pin||typeof o.state!=='string'||!o.state.trim()))throw unavailable();
 const states=new Set(offices.map(o=>normal(o.state)));
 // Ambiguous/incomplete data is a lookup failure, never proof of eligibility.
 if(states.size!==1)throw unavailable();
 return {state:offices[0].state.trim()};
}

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
