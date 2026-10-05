import {randomUUID} from 'node:crypto';
import {GatewayError,gatewayDiagnostic} from './gateway-errors.mjs';
import {requireThat as need} from '../management/errors.mjs';
import {publishedSnapshot} from '../management/catalogue.mjs';
import {sha,quoteItems,customerInput,validSignature,paymentUpdate,uuidPattern} from './core.mjs';
export function checkoutService({repo,store,provider,config,log=()=>{}}) {
 function report(error,stage,order){
  const issue=gatewayDiagnostic(error,stage);
  try{log(JSON.stringify({event:'KHAGA_CHECKOUT_FAILURE',reference:'KHAGA-T-'+order.id.slice(0,8).toUpperCase(),...issue}));}catch{}
  return issue;
 }
 async function bind(order,providerId){
  const saved=await store.bind(order.id,providerId);
  if(!saved || saved.id!==order.id || saved.provider_id!==providerId || saved.fingerprint!==order.fingerprint || saved.body?.quote?.total!==order.body.quote.total)throw new GatewayError('PAYMENT_BINDING_FAILED');
  return saved;
 }
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
  let issue=null;
  if(result.created){
   // Persist intent first. Recovery must NEVER reissue the provider POST.
   let stage='gateway_create';
   try{const providerId=await provider.create(order);stage='order_binding';order=await bind(order,providerId);}
   catch(error){issue=report(error,stage,order);try{await store.uncertain(order.id);}catch{}order=await store.get(order.id);}
  }
  return {order:publicOrder(order),payment:paymentOptions(order),...(issue?{issue}:{})};
 }
 async function apply(order,payment,event=null){const update=paymentUpdate(order,payment);return update?store.mark(order.id,order.provider_id,update.paymentId,update.status,event):order;}
 async function verify(id,guest,input){
  let order=await owned(id,guest);
  need(order.provider_id && input?.razorpay_order_id===order.provider_id && /^pay_[A-Za-z0-9]+$/.test(input.razorpay_payment_id||''),409,'PAYMENT_MISMATCH','Payment reference does not match this order.');
  need(validSignature(order.provider_id+'|'+input.razorpay_payment_id,input.razorpay_signature,config.keySecret),400,'INVALID_SIGNATURE','Payment confirmation could not be verified. Check status before retrying payment.');
  const payment=await provider.payment(input.razorpay_payment_id);
  order=await apply(order,payment);
  return {order:publicOrder(order),payment:payment.status==='failed'?paymentOptions(order):null};
 }
 async function reconcile(id,guest){
  let order=await owned(id,guest),recovered=null,stage='gateway_lookup';
  try {
   if(!order.provider_id){
    // A still-running creator may be in flight. Do not race its POST/binding.
    if(order.status==='creating' && (!Number.isFinite(Date.parse(order.created_at)) || Date.now()-Date.parse(order.created_at)<30000))return {order:publicOrder(order),payment:null};
    recovered=await provider.findOrder(order);
    if(!recovered)throw new GatewayError('PAYMENT_ORDER_NOT_FOUND');
    stage='order_binding';
    order=await bind(order,recovered.id);
   }
   stage='payment_lookup';
   const payments=await provider.payments(order.provider_id);
   need(Array.isArray(payments) && payments.length<=100,503,'PAYMENT_UNAVAILABLE','Payment status is temporarily unavailable.');
   let unsettled=false;
   for(const payment of payments){
    // Validate all order/amount bindings, including an authorized pending payment.
    const update=paymentUpdate(order,payment);
    if(update)order=await store.mark(order.id,order.provider_id,update.paymentId,update.status);
    else if(payment.status!=='failed')unsettled=true;
   }
   // Do not reopen a payment known to be authorized/processing, or a recovered
   // attempted/paid gateway order whose payment details have not arrived yet.
   if(payments.length===0){
    const gateway=recovered || (typeof provider.order==='function'?await provider.order(order):null);
    if(!gateway || gateway.status!=='created' || Number(gateway.amount_paid||0)>0)unsettled=true;
   }
   return {order:publicOrder(order),payment:unsettled?null:paymentOptions(order)};
  } catch(error) {
   const issue=report(error,stage,order);
   if(stage==='order_binding')throw new GatewayError('PAYMENT_BINDING_FAILED');
   if(error instanceof GatewayError)throw error;
   throw new GatewayError(issue.code);
  }
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
