import {randomUUID} from 'node:crypto';
import {requireThat as need} from '../management/errors.mjs';
import {publishedSnapshot} from '../management/catalogue.mjs';
import {sha,quoteItems,customerInput,validSignature,paymentUpdate,uuidPattern} from './core.mjs';
export function checkoutService({repo,store,provider,config}) {
 async function owned(id,guest){need(uuidPattern.test(id||''),404,'ORDER_NOT_FOUND','Order not found.');const order=await store.get(id);need(order && order.guest_hash===sha(guest),404,'ORDER_NOT_FOUND','Order not found in this browser session.');return order;}
 async function quote(input){return quoteItems(input,await publishedSnapshot(repo));}
 function publicOrder(order){return {id:order.id,reference:'KHAGA-T-'+order.id.slice(0,8).toUpperCase(),mode:'test',status:order.status,quote:order.body.quote,createdAt:order.created_at,paymentId:order.payment_id||null,customer:order.body.customer};}
 function paymentOptions(order){return order.status==='payment_pending'?{keyId:config.keyId,orderId:order.provider_id,amount:order.body.quote.total,currency:'INR'}:null;}
 async function create(input,guest){
  need(input && /^[a-f0-9]{64}$/.test(input.requestKey||'') && typeof input.quoteHash==='string',422,'INVALID_REQUEST','Reload checkout before submitting.');
  const customer=customerInput(input.customer);
  const priced=await quote(input.items);
  need(priced.hash===input.quoteHash,409,'QUOTE_CHANGED','Your bag or published prices changed. Review the new total before paying.');
  const body={mode:'test',customer,quote:priced};
  const fingerprint=sha(JSON.stringify(body));
  const result=await store.create({id:randomUUID(),guest_hash:sha(guest),request_key:input.requestKey,fingerprint,body});
  let order=result.order;
  need(order.fingerprint===fingerprint,409,'IDEMPOTENCY_CONFLICT','This checkout attempt already uses different details. Open its saved status before starting another.');
  if(result.created){
   // Persist the intent before calling the provider. No automatic create retry:
   // a lost response could already have created a Razorpay order.
   try{const providerId=await provider.create(order);order=await store.bind(order.id,providerId);}
   catch{try{await store.uncertain(order.id);}catch{}order=await store.get(order.id);}
  }
  return {order:publicOrder(order),payment:paymentOptions(order)};
 }
 async function apply(order,payment,event=null){const update=paymentUpdate(order,payment);return update?store.mark(order.id,order.provider_id,update.paymentId,update.status,event):order;}
 async function verify(id,guest,input){
  let order=await owned(id,guest);
  need(order.provider_id && input?.razorpay_order_id===order.provider_id && /^pay_[A-Za-z0-9]+$/.test(input.razorpay_payment_id||''),409,'PAYMENT_MISMATCH','Payment reference does not match this order.');
  need(validSignature(order.provider_id+'|'+input.razorpay_payment_id,input.razorpay_signature,config.keySecret),400,'INVALID_SIGNATURE','Payment confirmation could not be verified. Check status before retrying payment.');
  order=await apply(order,await provider.payment(input.razorpay_payment_id));
  return {order:publicOrder(order),payment:paymentOptions(order)};
 }
 async function reconcile(id,guest){
  let order=await owned(id,guest);
  if(order.provider_id){
   const payments=await provider.payments(order.provider_id);
   need(Array.isArray(payments) && payments.length<=100,503,'PAYMENT_UNAVAILABLE','Payment status is temporarily unavailable.');
   for(const payment of payments){if(['captured','refunded'].includes(payment.status)){order=await apply(order,payment);}}
  }
  return {order:publicOrder(order),payment:paymentOptions(order)};
 }
 async function webhook(raw,signature){
  need(config.webhookSecret,503,'WEBHOOK_DISABLED','Test webhook is not configured.');
  need(validSignature(raw,signature,config.webhookSecret),400,'INVALID_SIGNATURE','Invalid webhook signature.');
  let event;try{event=JSON.parse(raw.toString('utf8'));}catch{need(false,400,'INVALID_JSON','Invalid event JSON.');}
  if(!['payment.captured','order.paid','refund.processed'].includes(event.event))return {received:true,ignored:true};
  const paymentId=event.payload?.payment?.entity?.id || event.payload?.refund?.entity?.payment_id;
  need(/^pay_[A-Za-z0-9]+$/.test(paymentId||''),400,'INVALID_REQUEST','Invalid event payment.');
  // Signed notifications trigger authoritative API reconciliation; amounts in
  // callbacks/events never become the source of price or customer data.
  const payment=await provider.payment(paymentId);
  const order=await store.find(payment.order_id);
  if(!order){
   const linked=payment.notes?.khaga_order_id;
   if(uuidPattern.test(linked||'') && await store.get(linked))need(false,503,'ORDER_PENDING','Order binding is still pending. Retry the event.');
   return {received:true,ignored:true};
  }
  await apply(order,payment,sha(raw));
  return {received:true};
 }
 return {owned,quote,create,verify,reconcile,webhook,publicOrder,paymentOptions};
}
