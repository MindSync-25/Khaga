import {randomUUID} from 'node:crypto';
import {sha,validSignature,uuidPattern,paymentUpdate} from '../checkout/core.mjs';
import {publishedSnapshot} from '../management/catalogue.mjs';
import {requireThat as need} from '../management/errors.mjs';
import {price,publicOrder} from './model.mjs';
import {deliveryCustomer,deliveryHash,lookupPin} from './delivery.mjs';
export function commerceService({repo,store,provider,config,pinLookup=lookupPin}){
 const owned=async(id,guest)=>{need(uuidPattern.test(id||''),404,'ORDER_NOT_FOUND','Order not found.');const o=await store.get(id);need(o&&o.mode===config.mode&&o.guest_hash===sha(guest),404,'ORDER_NOT_FOUND','Order not found in this browser.');return o;};
 const purchasesAllowed=()=>need(config.purchasesEnabled===true,503,'PURCHASES_DISABLED','New purchases are not available yet.');
 const checkedQuote=async(items,customer)=>{
  const policy=await store.policy();
  // Keep the existing database's independent total calculation consistent. Never
  // substitute a made-up policy or silently overwrite shipping/tax settings.
  need(policy?.shippingPaise===0&&policy.freeShippingAt===null,503,'DELIVERY_POLICY_REQUIRED','Delivery settings are unavailable. Please try again later. Your bag is unchanged.');
  const q=price(items,await publishedSnapshot(repo),policy,config.mode);
  return {...q,hash:sha(q.hash+':'+deliveryHash(customer))};
 };
 const quote=async(items,input)=>{purchasesAllowed();const customer=await deliveryCustomer(input,{lookup:pinLookup});return checkedQuote(items,customer);};
 const options=o=>config.purchasesEnabled===true&&o.status==='payment_pending'?{keyId:config.keyId,orderId:o.provider_id,amount:o.body.quote.total,currency:'INR'}:null;
 const result=(o,payment=null)=>({order:publicOrder(o),payment});
 async function create(input,guest){
  purchasesAllowed();
  need(/^[a-f0-9]{64}$/.test(input?.requestKey||''),422,'INVALID_REQUEST','Reload checkout before submitting.');
  const customer=await deliveryCustomer(input.customer,{lookup:pinLookup}),q=await checkedQuote(input.items,customer);
  need(q.hash===input.quoteHash,409,'QUOTE_CHANGED','Prices or settings changed. Review your total again.');
  const body={mode:config.mode,customer,quote:q},fingerprint=sha(JSON.stringify(body));
  const saved=await store.create({id:randomUUID(),guest:sha(guest),key:input.requestKey,fingerprint,body});
  let o=saved.order;
  need(o.fingerprint===fingerprint,409,'IDEMPOTENCY_CONFLICT','This attempt has different details. Open its saved order.');
  if(saved.created){
   let creating=true;
   try{const id=await provider.create(o);creating=false;o=await store.bind(o.id,id);}
   catch(e){
    // Only a received, definitive 4xx rejection can release a reservation.
    const rejected=creating&&[400,401,403,404,422,429].includes(e.httpStatus);
    o=await store.state(o.id,rejected?'creation_rejected':'creation_unknown');
    return {...result(o),issue:{code:rejected?'CREATION_REJECTED':'CREATION_UNKNOWN',message:rejected?'Payment could not start. Your bag is kept; start a new checkout after the issue is resolved.':'Check this saved order to recover its payment. If it remains unresolved, contact support with its reference.'}};
   }
  }
  // Retried requests must reconcile before offering another payment window.
  return saved.created?result(o,options(o)):reconcile(o.id,guest);
 }
 async function apply(o,p,event=null){
  paymentUpdate({...o,payment_id:null},p); // Validate every amount/association, even pending/failed.
  return store.mark(o.id,p,event);
 }
 async function verify(id,guest,input){
  let o=await owned(id,guest);
  need(o.provider_id&&input?.razorpay_order_id===o.provider_id&&validSignature(o.provider_id+'|'+input.razorpay_payment_id,input.razorpay_signature,config.keySecret),400,'INVALID_SIGNATURE','Payment signature is invalid. Check saved status.');
  o=await apply(o,await provider.payment(input.razorpay_payment_id));return result(o);
 }
 async function reconcile(id,guest){
  let o=await owned(id,guest),gateway=null;
  if(['creation_rejected','closed_unpaid'].includes(o.status))return result(o);
  if(!o.provider_id){
   if(Date.now()-Date.parse(o.created_at)<45000)return result(o);
   gateway=await provider.findOrder(o);
   if(!gateway)return {...result(o),issue:{code:'RECOVERY_REVIEW',message:'No matching payment order is visible yet. Try status again later, or contact support with this reference. Do not pay again.'}};
   o=await store.bind(o.id,gateway.id);
  }
  const payments=await provider.payments(o.provider_id);let pending=false;
  for(const p of payments){o=await apply(o,p);if(!['failed','captured','refunded'].includes(p.status))pending=true;}
  if(!payments.length){gateway ||= await provider.order(o);pending=gateway.status!=='created'||Number(gateway.amount_paid||0)>0;}
  return result(o,pending?null:options(o));
 }
 async function webhook(raw,signature,eventId){
  need(validSignature(raw,signature,config.webhookSecret),400,'INVALID_SIGNATURE','Invalid webhook signature.');
  let event;try{event=JSON.parse(raw.toString('utf8'));}catch{need(false,400,'INVALID_JSON','Invalid webhook JSON.');}
  const digest=typeof eventId==='string'&&eventId.length<=200?sha(eventId):sha(raw);
  if(!['payment.captured','payment.authorized','payment.failed','order.paid','refund.processed'].includes(event.event)){
   await store.call('event',{event:digest});return {received:true};
  }
  const id=event.payload?.payment?.entity?.id||event.payload?.refund?.entity?.payment_id;
  const p=await provider.payment(id);let o=await store.find(p.order_id);
  if(!o){
   // Recover a lost create/bind before acknowledging, using provider order notes.
   const gateway=await provider.request('/orders/'+p.order_id);
   need(gateway.notes?.khaga_mode===config.mode&&uuidPattern.test(gateway.receipt||''),409,'PAYMENT_MISMATCH','Unknown payment order.');
   o=await store.get(gateway.receipt);
   need(o,503,'ORDER_PENDING','Order persistence is pending.');
   need(gateway.notes.khaga_order_id===o.id&&gateway.amount===o.body.quote.total&&gateway.currency==='INR',409,'PAYMENT_MISMATCH','Payment mismatch.');
   o=await store.bind(o.id,gateway.id);
  }
  await apply(o,p,digest);return {received:true};
 }
 return {owned,quote,create,verify,reconcile,webhook,publicOrder};
}
