'use strict';
(()=>{
 const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(v/100);
 const commerceBase=document.querySelector('meta[name="commerce-api-base"]')?.content||'',remote=Boolean(commerceBase);
 const BAG='khaga.preview.bag.v1',ATTEMPT='khaga.checkout.attempt.v1';
 let session=null,quote=null,checkout=null,body=null,busy=false,sdk=null,verifying=false;
 let storage=null;try{storage=window.localStorage;}catch{}
 let attemptStore=null;try{attemptStore=remote?window.localStorage:window.sessionStorage;}catch{}
 let bag=[];try{const saved=JSON.parse(storage?.getItem(BAG)||'null');if(saved?.version===1&&Array.isArray(saved.items))bag=saved.items;}catch{}
 const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 let attempt=null;try{attempt=JSON.parse(attemptStore?.getItem(ATTEMPT)||'null');}catch{}
 if(!attempt||!/^[a-f0-9]{64}$/.test(attempt.key||''))attempt={key:random()};
 function remember(){try{attemptStore?.setItem(ATTEMPT,JSON.stringify({key:attempt.key,id:attempt.id||null}));}catch{}}
 function error(message){$('#checkout-error').textContent=message;$('#checkout-error').hidden=!message;}
 function lock(value){busy=value;$('#pay-button').disabled=value;$('#edit-button').disabled=value;}
 async function api(path,{method='GET',data}={}){
  if(remote){
   if(path==='/api/checkout/session'){path='/checkout/session';method='POST';}
   else if(path==='/api/checkout/quote')path='/checkout/quote';
   else if(path==='/api/checkout/orders')path='/purchase';
   else if(path.endsWith('/verify')){data={...data,id:path.split('/')[4]};path='/confirm-purchase';}
   else path=path.replace('/api/checkout/orders/','/orders/');
  }
  const response=await fetch(commerceBase+path,{method,credentials:remote?'include':'same-origin',cache:'no-store',signal:AbortSignal.timeout(25000),headers:{Accept:'application/json',...(data?{'Content-Type':'application/json'}:{}),...(method==='POST'?{'X-CSRF-Token':session?.csrf||''}:{})},body:data?JSON.stringify(data):undefined});
  let result;try{result=await response.json();}catch{throw Error('Checkout could not respond. Your bag is unchanged.');}
  if(!response.ok)throw Object.assign(new Error((result.message||'Checkout did not complete.')+(result.reference&&result.error!=='DELIVERY_UNSUPPORTED'?' Reference: '+result.reference:'')),{code:result.error});return result;
 }
 function summary(q){$('#checkout-summary').innerHTML=q.items.map(l=>`<div class="order-line"><div><strong>${esc(l.name)}</strong><p>${esc(l.colourName)} · ${esc(l.size)} · Qty ${l.quantity}${l.availability==='preorder'?` · Preorder (dispatch ${esc(l.dispatchMin)}–${esc(l.dispatchMax)} days)`:''}</p></div><span>${money(l.unitPrice*l.quantity)}</span></div>`).join('')+`<div class="totals"><span>Subtotal</span><span>${money(q.subtotal)}</span></div><div class="totals"><span>Shipping</span><span>${money(q.shipping)}</span></div>${q.tax!==undefined?`<div class="totals"><span>Tax${q.taxTreatment==='inclusive'?' (included)':''}</span><span>${money(q.tax)}</span></div>`:''}<div class="totals grand-total"><strong>Total${q.mode==='test'?' (test)':''}</strong><strong>${money(q.total)}</strong></div><p class="privacy-note">${esc(q.taxNote)}</p>`;}
 function loadSDK(){
  if(window.Razorpay)return Promise.resolve();if(sdk)return sdk;
  sdk=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.async=true;
   const fail=()=>{clearTimeout(timer);script.remove();sdk=null;reject(Error('The payment window could not load. Check your connection and try again.'));};
   const timer=setTimeout(fail,15000);script.onload=()=>{clearTimeout(timer);if(window.Razorpay)resolve();else fail();};script.onerror=fail;document.head.append(script);
  });return sdk;
 }
 function clearPurchased(order){
  const key='khaga.checkout.cleared.'+order.id;
  try{if(!storage||storage.getItem(key))return;const saved=JSON.parse(storage.getItem(BAG)||'null');if(saved?.version!==1||!Array.isArray(saved.items))return;
   saved.items=saved.items.flatMap(line=>{const purchased=order.quote.items.find(p=>p.product===line.product&&p.colour===line.colour&&p.size===line.size);const qty=line.quantity-(purchased?.quantity||0);return qty>0?[{...line,quantity:qty}]:[];});
   // Both records are local UX hints, never proof of payment. The server is authoritative.
   storage.setItem(BAG,JSON.stringify(saved));storage.setItem(key,'1');
  }catch{/* Keep the bag if storage cannot be updated; never affect payment status. */}
 }
 function showOrder(result){
  if(checkout?.order?.id===result.order.id&&['paid','refund_review'].includes(checkout.order.status)&&!['paid','refund_review'].includes(result.order.status))return;
  checkout=result;const order=result.order;attempt.id=order.id;remember();summary(order.quote);
  $('#checkout-form').hidden=true;$('#payment-step').hidden=true;$('#order-result').hidden=false;
  const live=order.mode==='live',closed=['creation_rejected','closed_unpaid'].includes(order.status),complete=order.status==='paid',review=order.status==='refund_review',uncertain=['creating','creation_unknown'].includes(order.status);
  $('#order-result').innerHTML=`<div class="step-label">${complete?(live?'PAYMENT VERIFIED':'TEST PAYMENT VERIFIED'):(live?'SAVED ORDER':'SAVED TEST ORDER')}</div><h2>${complete?(live?'Your order is confirmed.':'Your test is complete.'):closed?'Payment did not start.':review?'Refund needs review.':uncertain?'Order creation needs review.':'Payment is not confirmed yet.'}</h2><p class="reference">${esc(order.reference)}</p><p>${complete?(live?'Your payment is verified and your order is saved.':'Your test payment was verified with Razorpay and this order is saved. No real money was charged and nothing will be shipped.'):closed?'This attempt is closed without payment. Your bag is kept. You can start a new checkout.':review?'A refund was reported for this payment. It is not a new successful purchase.':uncertain?'KHAGA could not confirm the gateway order. Check payment status to look for the existing Razorpay order without creating another one.':'An open, cancelled or authorized payment is not a completed purchase. Check status before trying payment again.'}</p>${result.issue?`<p class="hint">${esc(result.issue.message)}</p>`:''}<a class="secondary" href="/checkout/orders/${esc(order.id)}">Saved order status</a><button type="button" class="secondary" data-check-status>Check payment status</button>${result.payment?'<button type="button" class="primary" data-resume-payment>Resume payment →</button>':''}${closed?'<button type="button" class="secondary" data-new-checkout>Start new checkout</button>':''}<p><a href="/collection">Return to the collection</a></p>`;
  if(complete){clearPurchased(order);try{attemptStore?.removeItem(ATTEMPT);}catch{}}
 }
 async function refresh(){if(!checkout)return;const result=await api('/api/checkout/orders/'+checkout.order.id+'/reconcile',{method:'POST',data:{}});showOrder(result);}
 async function openPayment(){
  if(busy||verifying)return;
  if(!checkout&&(!quote||!body)){error('Review your delivery details and total before payment.');return;}
  error('');lock(true);
  try{
   await loadSDK();
   if(checkout?.payment)checkout=await api('/api/checkout/orders/'+checkout.order.id+'/reconcile',{method:'POST',data:{}});
   if(!checkout){remember();checkout=await api('/api/checkout/orders',{method:'POST',data:{...body,requestKey:attempt.key,quoteHash:quote.hash,items:bag}});attempt.id=checkout.order.id;remember();}
   if(!checkout.payment){showOrder(checkout);lock(false);return;}
   const {order,payment}=checkout;let returned=false;
   const paymentWindow=new window.Razorpay({key:payment.keyId,order_id:payment.orderId,amount:payment.amount,currency:payment.currency,name:order.mode==='test'?'KHAGA — TEST':'KHAGA',description:order.reference,prefill:{name:order.customer.name,email:order.customer.email,contact:order.customer.phone},theme:{color:'#28332c'},retry:{enabled:true},modal:{confirm_close:true,ondismiss:()=>{lock(false);if(!returned&&!verifying){showOrder(checkout);error('Payment window closed. Your bag is kept. Check status before retrying.');}}},handler:async response=>{
    if(verifying)return;returned=true;verifying=true;error('Verifying payment with the server…');
    try{const result=await api('/api/checkout/orders/'+order.id+'/verify',{method:'POST',data:response});error('');showOrder(result);}
    catch(e){showOrder(checkout);error(e.message+' Use Check payment status; do not pay again yet.');}
    finally{verifying=false;lock(false);}
   }});
   paymentWindow.on('payment.failed',()=>error('This payment attempt failed. You can retry inside Razorpay or close it. Your saved order and bag are retained.'));
   paymentWindow.open();
  }catch(e){lock(false);error(e.message);if(['QUOTE_CHANGED','INVALID_ADDRESS','DELIVERY_UNSUPPORTED','DELIVERY_LOOKUP_UNAVAILABLE','DELIVERY_POLICY_REQUIRED'].includes(e.code)&&!checkout){invalidateQuote();}}
 }
 $('#checkout-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;error('');lock(true);
  try{
   quote=null;const revision=addressRevision;
   body={customer:Object.fromEntries(new FormData(event.target))};
   const reviewed=await api('/api/checkout/quote',{method:'POST',data:{items:bag,...(remote?body:{})}});
   if(revision!==addressRevision)return;
   quote=reviewed;summary(quote);
   $('#checkout-form').hidden=true;$('#payment-step').hidden=false;$('#order-result').hidden=true;
   $('#payment-note').textContent=`Confirm ${quote.mode==='test'?'a test payment':'payment'} of ${money(quote.total)} for ${body.customer.name}.${quote.mode==='test'?' This is not a live purchase.':''}`;
   // Loading the SDK does not create an order or charge a payment.
   void loadSDK().catch(e=>error(e.message));
  }catch(e){error(e.message);}finally{lock(false);}
 });
 $('#pay-button').addEventListener('click',openPayment);
 let addressRevision=0;
 function invalidateQuote(){
  addressRevision++;quote=null;body=null;
  $('#checkout-form').hidden=false;$('#payment-step').hidden=true;
  $('#checkout-summary').textContent='Review your delivery details to confirm eligibility and total.';
 }
 $('#checkout-form').addEventListener('input',()=>{if(!checkout)invalidateQuote();});
 $('#checkout-form').addEventListener('change',()=>{if(!checkout)invalidateQuote();});
 $('#edit-button').addEventListener('click',()=>{if(busy||checkout)return;invalidateQuote();});
 document.addEventListener('click',async event=>{
  if(event.target.closest('[data-new-checkout]')){attempt={key:random()};remember();location.assign('/checkout');return;}
  if(event.target.closest('[data-resume-payment]'))return openPayment();
  if(event.target.closest('[data-check-status]')){if(busy)return;lock(true);error('');try{await refresh();}catch(e){error(e.message);}finally{lock(false);}}
 });
 window.addEventListener('beforeunload',event=>{if(busy||verifying){event.preventDefault();event.returnValue='';}});
 async function init(){
  try{
   session=await api('/api/checkout/session');
   if(!['test','live'].includes(session.mode)||!remote&&session.mode!=='test')throw Error('Checkout is not enabled.');
   if(remote){document.querySelector('.test-bar').textContent=session.mode==='test'?'TEST CHECKOUT · NO REAL MONEY · NO DISPATCH':'SECURE CHECKOUT';$('#pay-button').textContent=session.mode==='test'?'Pay in test mode →':'Pay securely →';}
   const id=$('#checkout-main').dataset.orderId || attempt.id;
   if(id){try{showOrder(await api('/api/checkout/orders/'+id));if(remote)await refresh();return;}catch(e){if(e.code!=='ORDER_NOT_FOUND')throw e;attempt={key:random()};remember();}}
   if(session.recent.length)$('#recent-orders').innerHTML=`<p class="hint">Recent order: <a href="/checkout/orders/${esc(session.recent[0].id)}">${esc(session.recent[0].reference)} — ${esc(session.recent[0].status)}</a></p>`;
   if(!bag.length){$('#checkout-summary').innerHTML='<p>Your bag is empty. <a href="/collection">Explore the collection</a>.</p>';return;}
   if(remote)$('#checkout-summary').textContent='Enter your delivery details to confirm eligibility and total.';
   else {quote=await api('/api/checkout/quote',{method:'POST',data:{items:bag}});summary(quote);}
   $('#address-fields').disabled=false;
  }catch(e){error(e.message);$('#checkout-summary').textContent='Checkout is unavailable. Your bag has not been removed.';}
 }
 document.addEventListener('visibilitychange',()=>{if(remote&&document.visibilityState==='visible'&&checkout&&!verifying)refresh().then(()=>lock(false)).catch(e=>{showOrder(checkout);lock(false);error(e.message);});});
 window.addEventListener('pageshow',event=>{if(remote&&event.persisted&&checkout)refresh().catch(e=>error(e.message));});
 void init();
})();
